import { measure } from 'measure-fn';
import { validateRepoPath } from '../validate-path';
import simpleGit from 'simple-git';

export async function POST(req: Request) {
    return measure('api:repo:git-blame', async () => {
        try {
            const { path: repoPath, filePath, commit } = await req.json();

            if (!repoPath || !filePath) {
                return new Response('Repository path and file path are required', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const git = simpleGit(repoPath);

            // Run git blame with porcelain format for machine-readable output
            const args = ['blame', '--porcelain'];
            if (commit) args.push(commit);
            args.push('--', filePath);

            const output = await git.raw(args);

            // Parse porcelain blame output
            const lines = output.split('\n');
            const blameEntries: Array<{
                hash: string;
                shortHash: string;
                author: string;
                authorTime: number;
                summary: string;
                line: number;
                content: string;
            }> = [];

            let currentHash = '';
            let currentAuthor = '';
            let currentTime = 0;
            let currentSummary = '';
            let currentLine = 0;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Hash line: <hash> <orig-line> <final-line> [<num-lines>]
                const hashMatch = line.match(/^([0-9a-f]{40})\s+(\d+)\s+(\d+)/);
                if (hashMatch) {
                    currentHash = hashMatch[1];
                    currentLine = parseInt(hashMatch[3]);
                    continue;
                }

                if (line.startsWith('author ')) {
                    currentAuthor = line.slice(7);
                } else if (line.startsWith('author-time ')) {
                    currentTime = parseInt(line.slice(12));
                } else if (line.startsWith('summary ')) {
                    currentSummary = line.slice(8);
                } else if (line.startsWith('\t')) {
                    // Content line — this is the actual source line
                    blameEntries.push({
                        hash: currentHash,
                        shortHash: currentHash.slice(0, 7),
                        author: currentAuthor,
                        authorTime: currentTime,
                        summary: currentSummary,
                        line: currentLine,
                        content: line.slice(1), // Remove leading tab
                    });
                }
            }

            return Response.json({
                success: true,
                path: filePath,
                entries: blameEntries,
                totalLines: blameEntries.length,
            });
        } catch (error: any) {
            console.error('api:repo:git-blame:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
