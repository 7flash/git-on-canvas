import { measure } from '../../../lib/measure.js';
import simpleGit from 'simple-git';

export async function POST(req) {
    return measure('api:repo:files', async () => {
        try {
            const { path: repoPath, commit } = await req.json();

            if (!repoPath || !commit) {
                return new Response('Repository path and commit are required', { status: 400 });
            }

            const git = simpleGit(repoPath);

            // Get files CHANGED in this specific commit
            const diffResult = await git.raw([
                'diff-tree', '--no-commit-id', '--name-status', '-r', commit
            ]);

            const changedFiles = [];
            const lines = diffResult.trim().split('\n').filter(Boolean);

            for (const line of lines) {
                const [status, filePath] = line.split('\t');
                if (!filePath) continue;

                const parts = filePath.split('/');
                const name = parts[parts.length - 1];
                const fileStatus = status === 'A' ? 'added' : status === 'D' ? 'deleted' : status === 'M' ? 'modified' : status;

                let content = null;
                let prevContent = null;
                let diffLines = null;
                let error = null;

                if (fileStatus === 'added') {
                    // New file - get content at this commit
                    try { content = await git.show([`${commit}:${filePath}`]); } catch (e) { error = e.message; }
                } else if (fileStatus === 'deleted') {
                    // Deleted file - get content from parent commit
                    try { prevContent = await git.show([`${commit}~1:${filePath}`]); } catch (e) { error = e.message; }
                } else if (fileStatus === 'modified') {
                    // Modified - get both versions + unified diff
                    try { content = await git.show([`${commit}:${filePath}`]); } catch (e) { error = e.message; }
                    try { prevContent = await git.show([`${commit}~1:${filePath}`]); } catch (e) { /* ignore */ }

                    // Get unified diff for this file
                    try {
                        const rawDiff = await git.raw(['diff', `${commit}~1`, commit, '--', filePath]);
                        diffLines = parseDiff(rawDiff);
                    } catch (e) { /* ignore diff errors */ }
                }

                changedFiles.push({
                    path: filePath,
                    name,
                    type: 'file',
                    status: fileStatus,
                    content,
                    prevContent,
                    diffLines,
                    contentError: error,
                    lines: content ? content.split('\n').length : 0,
                    prevLines: prevContent ? prevContent.split('\n').length : 0
                });
            }

            return Response.json({ files: changedFiles, totalChanged: changedFiles.length });
        } catch (error) {
            measure('api:repo:files:error', () => error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}

// Parse unified diff into structured line changes
function parseDiff(rawDiff) {
    const lines = rawDiff.split('\n');
    const changes = { added: new Set(), removed: new Set(), context: new Set() };
    let currentOldLine = 0;
    let currentNewLine = 0;

    for (const line of lines) {
        // Parse hunk header: @@ -old,count +new,count @@
        const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (hunkMatch) {
            currentOldLine = parseInt(hunkMatch[1]) - 1;
            currentNewLine = parseInt(hunkMatch[2]) - 1;
            continue;
        }

        if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ') || line.startsWith('index ')) continue;

        if (line.startsWith('+')) {
            currentNewLine++;
            changes.added.add(currentNewLine);
        } else if (line.startsWith('-')) {
            currentOldLine++;
            changes.removed.add(currentOldLine);
        } else if (!line.startsWith('\\')) {
            currentOldLine++;
            currentNewLine++;
        }
    }

    return {
        added: Array.from(changes.added),
        removed: Array.from(changes.removed)
    };
}
