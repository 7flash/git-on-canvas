// app/api/repo/list/route.ts — Lists repos from the git-canvas/repos directory
import { readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

export async function GET() {
    const reposDir = join(process.cwd(), 'git-canvas', 'repos');
    const repos: { name: string; path: string }[] = [];

    if (existsSync(reposDir)) {
        try {
            const entries = readdirSync(reposDir);
            for (const entry of entries) {
                const fullPath = join(reposDir, entry);
                try {
                    const stat = statSync(fullPath);
                    if (stat.isDirectory()) {
                        // Check if it's a git repo (has .git)
                        const isGit = existsSync(join(fullPath, '.git'));
                        repos.push({
                            name: entry,
                            path: fullPath.replace(/\\/g, '/'),
                        });
                    }
                } catch { }
            }
        } catch { }
    }

    return Response.json({ repos });
}
