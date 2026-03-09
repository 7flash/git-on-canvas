import { measure } from 'measure-fn';
import simpleGit from 'simple-git';
import { validateRepoPath } from '../validate-path';

export async function POST(req: Request) {
    return measure('api:repo:git-commit', async () => {
        try {
            const { path: repoPath, filePath, message } = await req.json();

            if (!repoPath || !filePath || !message) {
                return new Response('Repository path, file path, and commit message are required', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const git = simpleGit(repoPath);

            // Stage the specific file
            await git.add(filePath);

            // Get the staged diff for context
            const diffSummary = await git.diffSummary(['--cached']);

            // Commit
            const result = await git.commit(message, filePath);

            return Response.json({
                success: true,
                hash: result.commit || '',
                summary: result.summary || {},
                branch: result.branch || '',
                filesChanged: diffSummary.files?.length || 1,
            });
        } catch (error: any) {
            console.error('api:repo:git-commit:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
