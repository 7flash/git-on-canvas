import { measure } from 'measure-fn';
import simpleGit from 'simple-git';
import { validateRepoPath } from '../validate-path';

/**
 * Git Heatmap API — returns commit frequency per file for the given time range.
 * Used by the canvas heatmap overlay to color-code files by activity.
 */
export async function POST(req: Request) {
    return measure('api:repo:git-heatmap', async () => {
        try {
            const { path: repoPath, days = 90 } = await req.json();

            if (!repoPath) {
                return new Response('Repository path is required', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const git = simpleGit(repoPath);
            const since = `${days} days ago`;

            // Get all file changes in the time range: one filename per line
            const raw = await git.raw([
                'log', '--format=format:', '--name-only', `--since=${since}`
            ]);

            // Count occurrences of each file
            const counts: Record<string, number> = {};
            let maxCount = 0;

            for (const line of raw.split('\n')) {
                const file = line.trim();
                if (!file) continue;
                counts[file] = (counts[file] || 0) + 1;
                if (counts[file]! > maxCount) maxCount = counts[file]!;
            }

            // Build sorted array with normalized heat (0-1)
            const files = Object.entries(counts)
                .map(([file, count]) => ({
                    file,
                    commits: count,
                    heat: maxCount > 0 ? count / maxCount : 0,
                }))
                .sort((a, b) => b.commits - a.commits);

            return Response.json({ files, maxCommits: maxCount, days, totalFiles: files.length });
        } catch (error: any) {
            console.error('api:repo:git-heatmap:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
