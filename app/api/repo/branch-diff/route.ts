import { measure } from 'measure-fn';
import simpleGit from 'simple-git';
import { validateRepoPath } from '../validate-path';

/**
 * POST /api/repo/branch-diff
 *
 * Compare two branches and return the diff (changed files with hunks).
 * Body: { path: string, base: string, compare: string }
 *
 * Returns the same shape as /api/repo/files (commit diff) so the
 * existing card rendering (createFileCard, DiffCardPlugin) can be
 * reused without changes.
 */

interface DiffLine { type: string; content: string }
interface DiffHunk {
    oldStart: number; oldCount: number;
    newStart: number; newCount: number;
    context: string; lines: DiffLine[];
}

function parseHunks(rawDiff: string): DiffHunk[] {
    const allLines = rawDiff.split('\n');
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;

    for (const line of allLines) {
        const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
        if (hunkMatch) {
            if (currentHunk) hunks.push(currentHunk);
            currentHunk = {
                oldStart: parseInt(hunkMatch[1]),
                oldCount: parseInt(hunkMatch[2] || '1'),
                newStart: parseInt(hunkMatch[3]),
                newCount: parseInt(hunkMatch[4] || '1'),
                context: hunkMatch[5]?.trim() || '',
                lines: [],
            };
            continue;
        }

        if (line.startsWith('diff ') || line.startsWith('index ') ||
            line.startsWith('---') || line.startsWith('+++') ||
            line.startsWith('similarity ') || line.startsWith('rename ') ||
            line.startsWith('copy ')) continue;

        if (!currentHunk) continue;

        if (line.startsWith('+')) {
            currentHunk.lines.push({ type: 'add', content: line.substring(1) });
        } else if (line.startsWith('-')) {
            currentHunk.lines.push({ type: 'del', content: line.substring(1) });
        } else if (line.startsWith('\\')) {
            // skip "\ No newline at end of file"
        } else {
            currentHunk.lines.push({ type: 'ctx', content: line.startsWith(' ') ? line.substring(1) : line });
        }
    }

    if (currentHunk) hunks.push(currentHunk);
    return hunks;
}

export async function POST(req: Request) {
    return measure('api:repo:branch-diff', async () => {
        try {
            const { path: repoPath, base, compare } = await req.json();

            if (!repoPath || !base || !compare) {
                return new Response('path, base, and compare are required', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const git = simpleGit(repoPath);

            // Get list of changed files between the two branches
            const nameStatus = await git.raw([
                'diff', '--name-status', '-M30%', `${base}...${compare}`
            ]);

            if (!nameStatus.trim()) {
                // Still fetch branches even when no diff
                const branchSummary = await git.branchLocal();
                return Response.json({
                    files: [],
                    totalChanged: 0,
                    base,
                    compare,
                    mergeBase: base,
                    branches: branchSummary.all,
                });
            }

            // Get merge base for accurate stats
            let mergeBase = base;
            try {
                mergeBase = (await git.raw(['merge-base', base, compare])).trim();
            } catch { /* use base as fallback */ }

            const changedFiles = [];
            const lines = nameStatus.trim().split('\n').filter(Boolean);

            // Get branches list for the response
            const branchSummary = await git.branchLocal();

            for (const line of lines) {
                const parts = line.split('\t');
                const statusCode = parts[0];
                if (!statusCode || parts.length < 2) continue;

                const isRename = statusCode.startsWith('R');
                const isCopy = statusCode.startsWith('C');

                let filePath: string;
                let oldPath: string | null = null;
                let fileStatus: string;
                let similarity: number | null = null;

                if (isRename || isCopy) {
                    oldPath = parts[1];
                    filePath = parts[2];
                    fileStatus = isRename ? 'renamed' : 'copied';
                    similarity = parseInt(statusCode.substring(1)) || null;
                } else {
                    filePath = parts[1];
                    fileStatus = statusCode === 'A' ? 'added'
                        : statusCode === 'D' ? 'deleted'
                            : statusCode === 'M' ? 'modified'
                                : statusCode;
                }

                const name = filePath.split('/').pop()!;

                let content = null;
                let hunks: DiffHunk[] = [];
                let error = null;

                if (fileStatus === 'added') {
                    try { content = await git.show([`${compare}:${filePath}`]); } catch (e: any) { error = e.message; }
                } else if (fileStatus === 'deleted') {
                    try { content = await git.show([`${base}:${filePath}`]); } catch (e: any) { error = e.message; }
                } else if (fileStatus === 'modified') {
                    try {
                        const rawDiff = await git.raw(['diff', '-U3', `${base}...${compare}`, '--', filePath]);
                        hunks = parseHunks(rawDiff);
                    } catch (e: any) { error = e.message; }
                    try { content = await git.show([`${compare}:${filePath}`]); } catch { /* hunks enough */ }
                } else if (fileStatus === 'renamed' || fileStatus === 'copied') {
                    try {
                        const rawDiff = await git.raw([
                            'diff', '-U3', '-M',
                            `${base}...${compare}`,
                            '--', oldPath!, filePath
                        ]);
                        hunks = parseHunks(rawDiff);
                    } catch (e: any) { error = e.message; }
                    try { content = await git.show([`${compare}:${filePath}`]); } catch { /* ignore */ }
                }

                changedFiles.push({
                    path: filePath,
                    name,
                    type: 'file',
                    status: fileStatus,
                    content,
                    hunks,
                    contentError: error,
                    lines: content ? content.split('\n').length : 0,
                    ...(oldPath ? { oldPath } : {}),
                    ...(similarity != null ? { similarity } : {}),
                });
            }

            // Stats summary
            let totalAdd = 0, totalDel = 0;
            try {
                const statOutput = await git.raw(['diff', '--stat', `${base}...${compare}`]);
                const statMatch = statOutput.match(/(\d+) insertions?\(\+\)/);
                const delMatch = statOutput.match(/(\d+) deletions?\(-\)/);
                totalAdd = statMatch ? parseInt(statMatch[1]) : 0;
                totalDel = delMatch ? parseInt(delMatch[1]) : 0;
            } catch { /* ignore */ }

            return Response.json({
                files: changedFiles,
                totalChanged: changedFiles.length,
                base,
                compare,
                mergeBase,
                stats: { totalAdd, totalDel },
                branches: branchSummary.all,
            });
        } catch (error: any) {
            console.error('api:repo:branch-diff:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
