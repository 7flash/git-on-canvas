/**
 * GET /api/auth/github — Redirect to GitHub OAuth
 * 
 * Initiates the GitHub OAuth flow by redirecting to GitHub's authorize URL.
 * Requires GITHUB_CLIENT_ID env var (from GitHub OAuth App settings).
 */
export async function GET(req: Request) {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
        return Response.json({ error: 'GitHub OAuth not configured (set GITHUB_CLIENT_ID)' }, { status: 500 });
    }

    const url = new URL(req.url);
    const redirectUri = `${url.origin}/api/auth/github/callback`;

    // Generate state for CSRF protection
    const state = crypto.randomUUID();

    const githubUrl = new URL('https://github.com/login/oauth/authorize');
    githubUrl.searchParams.set('client_id', clientId);
    githubUrl.searchParams.set('redirect_uri', redirectUri);
    githubUrl.searchParams.set('scope', 'read:user user:email');
    githubUrl.searchParams.set('state', state);

    return new Response(null, {
        status: 302,
        headers: {
            'Location': githubUrl.toString(),
            'Set-Cookie': `gc_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
        },
    });
}
