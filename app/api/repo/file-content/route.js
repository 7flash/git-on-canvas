import { measure } from '@ments/web';
import simpleGit from 'simple-git';

export async function POST(req) {
    return measure('api:repo:file-content', async () => {
        try {
            const { path: repoPath, commit, filePath } = await req.json();

            if (!repoPath || !commit || !filePath) {
                return new Response('Repository path, commit, and file path are required', { status: 400 });
            }

            const git = simpleGit(repoPath);

            // Get file content at this commit
            const content = await git.show([`${commit}:${filePath}`]);

            return Response.json({ content });
        } catch (error) {
            measure('api:repo:file-content:error', () => error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
