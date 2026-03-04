import { measure } from 'measure-fn';

/**
 * GET /api/github/repos?user=<username>&page=<n>&sort=<updated|stars|name>
 * Fetches public repositories from GitHub API for a given user/org.
 * No auth required for public repos (60 req/hr rate limit).
 */
export async function GET(req: Request) {
    return measure('api:github:repos', async () => {
        try {
            const url = new URL(req.url);
            const user = url.searchParams.get('user')?.trim();
            const page = parseInt(url.searchParams.get('page') || '1');
            const sort = url.searchParams.get('sort') || 'updated';
            const perPage = 30;

            if (!user) {
                return Response.json({ error: 'user parameter is required' }, { status: 400 });
            }

            // Try as user first, then as org
            let ghUrl = `https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=${perPage}&page=${page}&sort=${sort}&direction=desc`;

            const headers: Record<string, string> = {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'GitCanvas/1.0',
            };

            // Use GITHUB_TOKEN if available for higher rate limits
            const token = process.env.GITHUB_TOKEN;
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            let res = await fetch(ghUrl, { headers });

            // If user 404, try as org
            if (res.status === 404) {
                ghUrl = `https://api.github.com/orgs/${encodeURIComponent(user)}/repos?per_page=${perPage}&page=${page}&sort=${sort}&direction=desc`;
                res = await fetch(ghUrl, { headers });
            }

            if (res.status === 403) {
                const rateLimitReset = res.headers.get('x-ratelimit-reset');
                const resetTime = rateLimitReset ? new Date(parseInt(rateLimitReset) * 1000).toLocaleTimeString() : 'soon';
                return Response.json({
                    error: `GitHub API rate limit exceeded. Resets at ${resetTime}. Set GITHUB_TOKEN env var for higher limits.`
                }, { status: 429 });
            }

            if (!res.ok) {
                return Response.json({ error: `GitHub user/org "${user}" not found` }, { status: 404 });
            }

            const repos = await res.json();

            // Parse Link header for pagination
            const linkHeader = res.headers.get('link') || '';
            const hasNext = linkHeader.includes('rel="next"');
            const hasPrev = page > 1;

            // Extract useful fields
            const items = repos.map((r: any) => ({
                name: r.name,
                full_name: r.full_name,
                description: r.description || '',
                clone_url: r.clone_url,
                html_url: r.html_url,
                language: r.language,
                stars: r.stargazers_count,
                forks: r.forks_count,
                updated_at: r.updated_at,
                size: r.size, // KB
                default_branch: r.default_branch,
                is_fork: r.fork,
                topics: r.topics || [],
            }));

            // Also fetch user/org profile info
            let profile = null;
            try {
                const profileRes = await fetch(`https://api.github.com/users/${encodeURIComponent(user)}`, { headers });
                if (profileRes.ok) {
                    const p = await profileRes.json();
                    profile = {
                        login: p.login,
                        name: p.name,
                        avatar_url: p.avatar_url,
                        bio: p.bio,
                        public_repos: p.public_repos,
                        type: p.type, // "User" or "Organization"
                    };
                }
            } catch { /* ignore profile fetch errors */ }

            return Response.json({
                repos: items,
                page,
                hasNext,
                hasPrev,
                profile,
            });
        } catch (error: any) {
            console.error('api:github:repos:error', error);
            return Response.json(
                { error: error.message || 'Failed to fetch repos' },
                { status: 500 }
            );
        }
    });
}
