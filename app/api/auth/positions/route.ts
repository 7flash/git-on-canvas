/**
 * GET /api/auth/positions?repo=<url> — Load saved positions for a repo
 * POST /api/auth/positions — Save positions for a repo
 * 
 * Enables shared repositories: each user has their own card layout
 * for the same cloned repository.
 */
import { getSessionFromRequest, loadRepoPositions, saveRepoPositions } from '../../../lib/auth';

export async function GET(req: Request) {
    const user = getSessionFromRequest(req);
    if (!user) {
        return Response.json({ authenticated: false });
    }

    const url = new URL(req.url);
    const repoUrl = url.searchParams.get('repo');
    if (!repoUrl) {
        return Response.json({ error: 'repo param required' }, { status: 400 });
    }

    const positionsJson = loadRepoPositions(user.id, repoUrl);
    return Response.json({
        positions: positionsJson ? JSON.parse(positionsJson) : null,
        repoUrl,
    });
}

export async function POST(req: Request) {
    const user = getSessionFromRequest(req);
    if (!user) {
        return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const body = await req.json() as {
            repoUrl: string;
            positions: Record<string, any>;
        };

        if (!body.repoUrl) {
            return Response.json({ error: 'repoUrl required' }, { status: 400 });
        }

        saveRepoPositions(user.id, body.repoUrl, JSON.stringify(body.positions || {}));
        return Response.json({ ok: true });
    } catch (err: any) {
        return Response.json({ error: err.message }, { status: 400 });
    }
}
