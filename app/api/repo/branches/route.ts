import { measure } from 'measure-fn';
import simpleGit from 'simple-git';
import { validateRepoPath } from '../validate-path';

/**
 * POST /api/repo/branches
 *
 * List all branches (local + optionally remote) for a repository.
 * Body: { path: string, includeRemote?: boolean }
 *
 * Returns: { branches: string[], current: string, remote?: string[] }
 */

export async function POST(req: Request) {
    return measure('api:repo:branches', async () => {
        try {
            const { path: repoPath, includeRemote } = await req.json();

            if (!repoPath) {
                return new Response('path is required', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const git = simpleGit(repoPath);

            // Get local branches
            const branchSummary = await git.branchLocal();
            const result: any = {
                branches: branchSummary.all,
                current: branchSummary.current,
            };

            // Optionally include remote branches
            if (includeRemote) {
                try {
                    const remoteBranches = await git.branch(['-r']);
                    result.remote = remoteBranches.all
                        .filter(b => !b.includes('HEAD'))
                        .map(b => b.replace(/^origin\//, ''));
                } catch {
                    result.remote = [];
                }
            }

            return Response.json(result);
        } catch (error: any) {
            console.error('api:repo:branches:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
