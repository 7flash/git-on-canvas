import { Database } from 'bun:sqlite';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'app', 'analytics.db');
const db = new Database(DB_PATH);

db.run(`CREATE TABLE IF NOT EXISTS hits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    referrer TEXT,
    ua TEXT,
    ts INTEGER NOT NULL DEFAULT (unixepoch())
)`);

db.run(`CREATE INDEX IF NOT EXISTS idx_hits_ts ON hits(ts)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_hits_path ON hits(path)`);

const insertStmt = db.prepare(`INSERT INTO hits (path, referrer, ua) VALUES (?, ?, ?)`);

/**
 * POST /api/analytics — log a page hit
 * Body: { path: string }
 */
export async function POST(req: Request) {
    try {
        const { path: pagePath } = await req.json() as { path: string };
        const referrer = req.headers.get('referer') || '';
        const ua = req.headers.get('user-agent') || '';
        insertStmt.run(pagePath || '/', referrer, ua.slice(0, 200));
        return Response.json({ ok: true });
    } catch {
        return Response.json({ ok: false }, { status: 400 });
    }
}

/**
 * GET /api/analytics — return stats
 * Query: ?hours=24 (default 24)
 */
export function GET(req: Request) {
    const url = new URL(req.url);
    const hours = parseInt(url.searchParams.get('hours') || '24', 10);
    const since = Math.floor(Date.now() / 1000) - hours * 3600;

    const total = db.prepare(`SELECT COUNT(*) as count FROM hits WHERE ts > ?`).get(since) as any;
    const byPath = db.prepare(`SELECT path, COUNT(*) as count FROM hits WHERE ts > ? GROUP BY path ORDER BY count DESC LIMIT 20`).all(since);
    const byHour = db.prepare(`
        SELECT strftime('%Y-%m-%d %H:00', ts, 'unixepoch') as hour, COUNT(*) as count 
        FROM hits WHERE ts > ? GROUP BY hour ORDER BY hour
    `).all(since);
    const byReferrer = db.prepare(`
        SELECT referrer, COUNT(*) as count FROM hits 
        WHERE ts > ? AND referrer != '' 
        GROUP BY referrer ORDER BY count DESC LIMIT 10
    `).all(since);

    return Response.json({
        total: (total as any).count,
        hours,
        byPath,
        byHour,
        byReferrer,
    });
}
