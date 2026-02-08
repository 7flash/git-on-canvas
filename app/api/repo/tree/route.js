import { measure } from '../../../lib/measure.js';
import simpleGit from 'simple-git';

export async function POST(req) {
    return measure('api:repo:tree', async () => {
        try {
            const { path: repoPath } = await req.json();

            if (!repoPath) {
                return new Response('Repository path is required', { status: 400 });
            }

            const git = simpleGit(repoPath);

            // Get tracked files only; exclude `--others` to skip untracked + gitignored
            const result = await git.raw(['ls-files']);
            const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage', '.turbo'];
            const filePaths = result.trim().split('\n').filter(fp => {
                if (!fp) return false;
                // Skip files in noise directories
                return !ignoreDirs.some(d => fp.startsWith(d + '/') || fp.startsWith(d + '\\'));
            });

            const files = filePaths.map(filePath => {
                const parts = filePath.split('/');
                const name = parts[parts.length - 1];
                const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
                return {
                    path: filePath,
                    name,
                    ext,
                    type: 'file'
                };
            });

            return Response.json({ files, total: files.length });
        } catch (error) {
            measure('api:repo:tree:error', () => error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
