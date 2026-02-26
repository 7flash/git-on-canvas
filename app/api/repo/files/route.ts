import { measure } from 'measure-fn';
import simpleGit from 'simple-git';

export async function POST(req: Request) {
    return measure('api:repo:files', async () => {
        try {
            const { path: repoPath, commit } = await req.json();

            if (!repoPath || !commit) {
                return new Response('Repository path and commit are required', { status: 400 });
            }

            const git = simpleGit(repoPath);

            // Get files CHANGED in this specific commit
            // -M detects renames, -C detects copies
            // Use --root for initial commits that have no parent
            let diffResult = '';
            try {
                diffResult = await git.raw(['diff-tree', '--no-commit-id', '--name-status', '-M30%', '-r', commit]);
            } catch (e) { /* ignore */ }
            // If empty (root commit), try with --root
            if (!diffResult.trim()) {
                try {
                    diffResult = await git.raw(['diff-tree', '--root', '--no-commit-id', '--name-status', '-M30%', '-r', commit]);
                } catch (e) { /* ignore */ }
            }

            const changedFiles = [];
            const lines = diffResult.trim().split('\n').filter(Boolean);

            for (const line of lines) {
                const parts = line.split('\t');
                const statusCode = parts[0];
                if (!statusCode || parts.length < 2) continue;

                // Rename/copy: status is R### or C### (e.g. R100, R087, C100)
                // Format: R100\toldPath\tnewPath
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
                    // New file — get full content
                    try { content = await git.show([`${commit}:${filePath}`]); } catch (e: any) { error = e.message; }

                } else if (fileStatus === 'deleted') {
                    // Deleted file — get previous content
                    try { content = await git.show([`${commit}~1:${filePath}`]); } catch (e: any) { error = e.message; }

                } else if (fileStatus === 'modified') {
                    // Modified — parse unified diff into hunks
                    try {
                        const rawDiff = await git.raw(['diff', '-U3', `${commit}~1`, commit, '--', filePath]);
                        hunks = parseHunks(rawDiff);
                    } catch (e: any) { error = e.message; }

                } else if (fileStatus === 'renamed' || fileStatus === 'copied') {
                    // Renamed/copied — diff between old path and new path across the commit
                    try {
                        const rawDiff = await git.raw([
                            'diff', '-U3', '-M',
                            `${commit}~1`, commit,
                            '--', oldPath!, filePath
                        ]);
                        hunks = parseHunks(rawDiff);
                    } catch (e: any) { error = e.message; }

                    // If 100% rename with no content changes, hunks will be empty
                    // Still include the file so it shows up as renamed
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
                    // Rename-specific fields
                    ...(oldPath ? { oldPath } : {}),
                    ...(similarity != null ? { similarity } : {}),
                });
            }

            return Response.json({ files: changedFiles, totalChanged: changedFiles.length });
        } catch (error: any) {
            console.error('api:repo:files:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}

// Parse unified diff into structured hunks
interface DiffLine { type: string; content: string }
interface DiffHunk { oldStart: number; oldCount: number; newStart: number; newCount: number; context: string; lines: DiffLine[] }

function parseHunks(rawDiff: string): DiffHunk[] {
    const allLines = rawDiff.split('\n');
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;

    for (const line of allLines) {
        // Parse hunk header: @@ -old,count +new,count @@ optional context
        const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
        if (hunkMatch) {
            if (currentHunk) hunks.push(currentHunk);
            currentHunk = {
                oldStart: parseInt(hunkMatch[1]),
                oldCount: parseInt(hunkMatch[2] || '1'),
                newStart: parseInt(hunkMatch[3]),
                newCount: parseInt(hunkMatch[4] || '1'),
                context: hunkMatch[5]?.trim() || '',
                lines: []
            };
            continue;
        }

        // Skip diff metadata lines
        if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')
            || line.startsWith('similarity ') || line.startsWith('rename ') || line.startsWith('copy ')) continue;

        if (!currentHunk) continue;

        if (line.startsWith('+')) {
            currentHunk.lines.push({ type: 'add', content: line.substring(1) });
        } else if (line.startsWith('-')) {
            currentHunk.lines.push({ type: 'del', content: line.substring(1) });
        } else if (line.startsWith('\\')) {
            // "\ No newline at end of file" — skip
        } else {
            currentHunk.lines.push({ type: 'ctx', content: line.startsWith(' ') ? line.substring(1) : line });
        }
    }

    if (currentHunk) hunks.push(currentHunk);
    return hunks;
}
