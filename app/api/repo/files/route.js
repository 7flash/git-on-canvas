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

            // Get list of files at this commit
            const result = await git.raw(['ls-tree', '-r', '--name-only', commit]);
            const filePaths = result.trim().split('\n').filter(Boolean);

            // Build file tree with metadata
            const files = filePaths.map(filePath => {
                const parts = filePath.split('/');
                const name = parts[parts.length - 1];

                return {
                    path: filePath,
                    name,
                    type: 'file'
                };
            });

            return Response.json({ files });
        } catch (error) {
            measure('api:repo:files:error', () => error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
