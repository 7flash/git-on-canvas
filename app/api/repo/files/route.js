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

            // Get files CHANGED in this specific commit (not all files in the repo)
            // diff-tree shows what files were modified/added/deleted in a commit
            const diffResult = await git.raw([
                'diff-tree',
                '--no-commit-id',
                '--name-status',
                '-r',
                commit
            ]);

            const changedFiles = [];
            const lines = diffResult.trim().split('\n').filter(Boolean);

            for (const line of lines) {
                // Format: "M\tpath/to/file" or "A\tpath/to/file" or "D\tpath/to/file"
                const [status, filePath] = line.split('\t');

                if (!filePath) continue;

                const parts = filePath.split('/');
                const name = parts[parts.length - 1];

                // Get actual file content for this file at this commit
                let content = null;
                let error = null;

                // Only fetch content for added/modified files (deleted files don't exist at this commit)
                if (status !== 'D') {
                    try {
                        content = await git.show([`${commit}:${filePath}`]);
                    } catch (e) {
                        error = e.message;
                    }
                }

                changedFiles.push({
                    path: filePath,
                    name,
                    type: 'file',
                    status: status === 'A' ? 'added' : status === 'D' ? 'deleted' : status === 'M' ? 'modified' : status,
                    content: content,
                    contentError: error,
                    lines: content ? content.split('\n').length : 0
                });
            }

            return Response.json({
                files: changedFiles,
                totalChanged: changedFiles.length
            });
        } catch (error) {
            measure('api:repo:files:error', () => error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
