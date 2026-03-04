/**
 * POST /api/auth/favorites — Add/remove favorite repos
 * 
 * Body: { action: 'add' | 'remove', repoUrl: string, repoName?: string }
 * GET /api/auth/favorites — List user's favorites
 */
import { getSessionFromRequest, addFavorite, removeFavorite, getUserFavorites } from '../../../lib/auth';

export async function GET(req: Request) {
    const user = getSessionFromRequest(req);
    if (!user) {
        return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const favorites = getUserFavorites(user.id);
    return Response.json({
        favorites: favorites.map((f: any) => ({
            repoUrl: f.repoUrl,
            repoName: f.repoName,
            addedAt: f.addedAt,
        })),
    });
}

export async function POST(req: Request) {
    const user = getSessionFromRequest(req);
    if (!user) {
        return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const body = await req.json() as {
            action: 'add' | 'remove';
            repoUrl: string;
            repoName?: string;
        };

        if (!body.repoUrl) {
            return Response.json({ error: 'repoUrl required' }, { status: 400 });
        }

        if (body.action === 'add') {
            const fav = addFavorite(user.id, body.repoUrl, body.repoName);
            return Response.json({ ok: true, favorite: { repoUrl: fav.repoUrl, repoName: fav.repoName, addedAt: fav.addedAt } });
        }

        if (body.action === 'remove') {
            const removed = removeFavorite(user.id, body.repoUrl);
            return Response.json({ ok: true, removed });
        }

        return Response.json({ error: 'action must be "add" or "remove"' }, { status: 400 });
    } catch (err: any) {
        return Response.json({ error: err.message }, { status: 400 });
    }
}
