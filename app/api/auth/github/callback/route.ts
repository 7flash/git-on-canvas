/**
 * GET /api/auth/github/callback — GitHub OAuth callback
 * 
 * Exchanges the authorization code for an access token,
 * fetches the GitHub user profile, creates/updates the user,
 * creates a session, and redirects to the app.
 */
import { findOrCreateUser, createSession, sessionCookie } from '../../../../lib/auth';

export async function GET(req: Request) {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code) {
        return new Response('Missing authorization code', { status: 400 });
    }

    // Verify CSRF state
    const cookie = req.headers.get('cookie') || '';
    const stateMatch = cookie.match(/gc_oauth_state=([a-f0-9-]+)/);
    if (!stateMatch || stateMatch[1] !== state) {
        return new Response('Invalid OAuth state — possible CSRF attack', { status: 403 });
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return new Response('GitHub OAuth not configured', { status: 500 });
    }

    try {
        // 1. Exchange code for access token
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code,
            }),
        });

        const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
        if (!tokenData.access_token) {
            console.error('[auth] Token exchange failed:', tokenData);
            return new Response('Failed to get access token: ' + (tokenData.error || 'unknown'), { status: 400 });
        }

        // 2. Fetch GitHub user profile
        const userRes = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Galaxy-Canvas',
            },
        });

        if (!userRes.ok) {
            return new Response('Failed to fetch GitHub profile', { status: 502 });
        }

        const ghUser = await userRes.json() as {
            id: number;
            login: string;
            name?: string;
            avatar_url?: string;
            email?: string;
        };

        // 3. Create or update user in our DB
        const user = findOrCreateUser({
            id: String(ghUser.id),
            login: ghUser.login,
            name: ghUser.name || undefined,
            avatar_url: ghUser.avatar_url || undefined,
            email: ghUser.email || undefined,
        });

        // 4. Create session
        const token = createSession(user.id);

        // 5. Redirect to app with session cookie
        return new Response(null, {
            status: 302,
            headers: {
                'Location': '/',
                'Set-Cookie': [
                    sessionCookie(token),
                    // Clear OAuth state cookie
                    'gc_oauth_state=; Path=/; HttpOnly; Max-Age=0',
                ].join(', '),
            },
        });
    } catch (err: any) {
        console.error('[auth] OAuth callback error:', err.message);
        return new Response('Authentication failed: ' + err.message, { status: 500 });
    }
}
