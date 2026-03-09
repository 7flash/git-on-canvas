import { measure } from 'measure-fn';
import simpleGit from 'simple-git';
import { validateRepoPath } from '../validate-path';

/**
 * POST /api/repo/search
 * Body: { path, query, commit?, maxResults?, caseSensitive? }
 * Uses `git grep` for fast full-text search across the repo.
 * Returns: { results: [{ file, matches: [{ line, content, lineNumber }] }], totalMatches }
 */
export async function POST(req: Request) {
    return measure('api:repo:search', async () => {
        try {
            const { path: repoPath, query, commit, maxResults = 200, caseSensitive = false } = await req.json();

            if (!repoPath || !query) {
                return new Response('Repository path and query are required', { status: 400 });
            }

            if (query.length < 2) {
                return new Response('Query must be at least 2 characters', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const git = simpleGit(repoPath);

            // Build git grep args
            const args = ['grep', '-n', '--break', '--heading'];
            if (!caseSensitive) args.push('-i');
            // Limit per-file matches to avoid overwhelming results
            args.push('--max-count=20');

            if (commit) {
                args.push(commit, '--', query);
            } else {
                // Search working tree
                args.push('--', query);
            }

            // Actually git grep uses the query as a positional arg, let me restructure
            // git grep [-i] [-n] [--max-count=N] <pattern> [<commit>] [-- <pathspec>]
            const grepArgs: string[] = ['-n'];
            if (!caseSensitive) grepArgs.push('-i');
            grepArgs.push('--max-count=20');
            grepArgs.push('-e', query);

            if (commit) {
                grepArgs.push(commit);
            }

            let rawOutput: string;
            try {
                rawOutput = await git.raw(['grep', ...grepArgs]);
            } catch (err: any) {
                // git grep returns exit code 1 when no matches found
                if (err.message?.includes('exit code 1') || err.message?.includes('process exited with code 1')) {
                    return Response.json({ results: [], totalMatches: 0 });
                }
                throw err;
            }

            if (!rawOutput?.trim()) {
                return Response.json({ results: [], totalMatches: 0 });
            }

            // Parse git grep output: <file>:<lineNum>:<content>
            // Or with commit: <commit>:<file>:<lineNum>:<content>
            const fileGroups = new Map<string, { line: number; content: string }[]>();
            let totalMatches = 0;

            for (const line of rawOutput.split('\n')) {
                if (!line.trim()) continue;

                let filePath: string;
                let lineNum: number;
                let content: string;

                if (commit) {
                    // Format: <commit>:<file>:<lineNum>:<content>
                    const commitPrefix = commit + ':';
                    if (!line.startsWith(commitPrefix)) continue;
                    const rest = line.slice(commitPrefix.length);
                    const firstColon = rest.indexOf(':');
                    if (firstColon < 0) continue;
                    const afterFile = rest.slice(firstColon + 1);
                    const secondColon = afterFile.indexOf(':');
                    if (secondColon < 0) continue;
                    filePath = rest.slice(0, firstColon);
                    lineNum = parseInt(afterFile.slice(0, secondColon), 10);
                    content = afterFile.slice(secondColon + 1);
                } else {
                    // Format: <file>:<lineNum>:<content>
                    const firstColon = line.indexOf(':');
                    if (firstColon < 0) continue;
                    const afterFile = line.slice(firstColon + 1);
                    const secondColon = afterFile.indexOf(':');
                    if (secondColon < 0) continue;
                    filePath = line.slice(0, firstColon);
                    lineNum = parseInt(afterFile.slice(0, secondColon), 10);
                    content = afterFile.slice(secondColon + 1);
                }

                if (isNaN(lineNum)) continue;

                if (!fileGroups.has(filePath)) {
                    fileGroups.set(filePath, []);
                }
                fileGroups.get(filePath)!.push({ line: lineNum, content: content.trimEnd() });
                totalMatches++;

                if (totalMatches >= maxResults) break;
            }

            const results = Array.from(fileGroups.entries()).map(([file, matches]) => ({
                file,
                matches,
            }));

            return Response.json({ results, totalMatches });
        } catch (error: any) {
            console.error('api:repo:search:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
