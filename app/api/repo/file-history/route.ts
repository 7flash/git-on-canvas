import { measure } from 'measure-fn';
import simpleGit from 'simple-git';
import { validateRepoPath } from '../validate-path';

export async function POST(req: Request) {
    return measure('api:repo:file-history', async () => {
        try {
            const { path: repoPath, filePath, limit = 20 } = await req.json();

            if (!repoPath || !filePath) {
                return new Response('Repository path and file path are required', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const git = simpleGit(repoPath);

            // Get commit history for this specific file
            const log = await git.log({
                file: filePath,
                maxCount: limit,
                format: {
                    hash: '%H',
                    date: '%ai',
                    message: '%s',
                    author_name: '%an',
                }
            });

            const commits = log.all.map(c => ({
                hash: c.hash,
                shortHash: c.hash.substring(0, 7),
                message: c.message,
                author: c.author_name,
                date: c.date,
            }));

            return Response.json({ commits, total: commits.length });
        } catch (error: any) {
            console.error('api:repo:file-history:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
