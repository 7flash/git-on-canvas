import { measure } from 'measure-fn';
import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs';

const CLONES_DIR = path.join(process.cwd(), 'git-canvas', 'repos');

/**
 * POST /api/repo/clone
 * Body: { url: string }
 * Clones a remote git repo into git-canvas/repos/<name> and returns the local path.
 * If already cloned, returns existing path immediately.
 */
export async function POST(req: Request) {
    return measure('api:repo:clone', async () => {
        try {
            const { url } = await req.json() as { url: string };

            if (!url || typeof url !== 'string') {
                return Response.json({ error: 'url is required' }, { status: 400 });
            }

            // Validate URL format (git@... or https://...)
            const isGitUrl = url.startsWith('git@') || url.startsWith('https://') || url.startsWith('http://') || url.endsWith('.git');
            if (!isGitUrl) {
                return Response.json({ error: 'Invalid git URL. Use https:// or git@ format.' }, { status: 400 });
            }

            // Derive folder name from URL
            // e.g. https://github.com/user/repo.git → repo
            // e.g. git@github.com:user/repo.git → repo
            const repoName = url
                .replace(/\.git$/, '')
                .split('/')
                .pop()!
                .split(':')
                .pop()!
                .replace(/[^a-zA-Z0-9._-]/g, '_');

            if (!repoName) {
                return Response.json({ error: 'Could not determine repository name from URL' }, { status: 400 });
            }

            // Ensure clones directory exists
            fs.mkdirSync(CLONES_DIR, { recursive: true });

            const targetPath = path.join(CLONES_DIR, repoName);

            // Check if already cloned
            if (fs.existsSync(path.join(targetPath, '.git'))) {
                // Pull latest
                try {
                    const git = simpleGit(targetPath);
                    await git.pull();
                    console.log(`[clone] Updated existing repo: ${repoName}`);
                } catch {
                    // Pull failed (maybe detached HEAD, dirty, etc) — that's fine
                    console.log(`[clone] Using existing repo (pull skipped): ${repoName}`);
                }
                return Response.json({ ok: true, path: targetPath, cached: true });
            }

            // Clone
            console.log(`[clone] Cloning ${url} → ${targetPath}`);
            const git = simpleGit();
            await git.clone(url, targetPath, ['--depth', '100']);

            console.log(`[clone] ✅ Cloned ${repoName}`);
            return Response.json({ ok: true, path: targetPath, cached: false });
        } catch (error: any) {
            console.error('api:repo:clone:error', error);
            return Response.json(
                { error: error.message || 'Clone failed' },
                { status: 500 }
            );
        }
    });
}
