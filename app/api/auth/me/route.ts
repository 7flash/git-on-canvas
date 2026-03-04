/**
 * GET /api/auth/me — Get current user
 * POST /api/auth/me — Logout (delete session)
 * 
 * Returns the authenticated user's profile, favorites, and settings.
 */
import { getSessionFromRequest, deleteSession, getUserFavorites, getAllSettings } from '../../../lib/auth';

export async function GET(req: Request) {
    const user = getSessionFromRequest(req);
    if (!user) {
        return Response.json({ authenticated: false });
    }

    const favorites = getUserFavorites(user.id);
    const settings = getAllSettings(user.id);

    return Response.json({
        authenticated: true,
        user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            email: user.email,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt,
        },
        favorites: favorites.map((f: any) => ({
            repoUrl: f.repoUrl,
            repoName: f.repoName,
            addedAt: f.addedAt,
        })),
        settings,
    });
}

export async function POST(req: Request) {
    // Logout
    const cookie = req.headers.get('cookie') || '';
    const match = cookie.match(/gc_session=([a-f0-9]+)/);
    if (match) {
        deleteSession(match[1]);
    }

    return new Response(null, {
        status: 200,
        headers: {
            'Set-Cookie': 'gc_session=; Path=/; HttpOnly; Max-Age=0',
        },
    });
}
