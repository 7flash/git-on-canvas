import { measure } from 'measure-fn';
import simpleGit from 'simple-git';
import { validateRepoPath } from '../validate-path';

export async function POST(req: Request) {
    return measure('api:repo:file-content', async () => {
        try {
            const { path: repoPath, commit, filePath } = await req.json();

            if (!repoPath || !commit || !filePath) {
                return new Response('Repository path, commit, and file path are required', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const git = simpleGit(repoPath);

            // Get file content at this commit
            const content = await git.show([`${commit}:${filePath}`]);

            return Response.json({ content });
        } catch (error: any) {
            console.error('api:repo:file-content:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
