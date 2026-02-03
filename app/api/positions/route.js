import { measure } from '@ments/web';
import { Database } from 'bun:sqlite';
import path from 'path';

let db = null;

function getDb() {
    if (!db) {
        const dbPath = path.join(process.cwd(), 'db', 'positions.sqlite');
        db = new Database(dbPath, { create: true });

        // Initialize schema
        db.run(`
            CREATE TABLE IF NOT EXISTS positions (
                id TEXT PRIMARY KEY,
                commit_hash TEXT NOT NULL,
                file_path TEXT NOT NULL,
                x REAL NOT NULL,
                y REAL NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now')),
                UNIQUE(commit_hash, file_path)
            )
        `);

        db.run(`CREATE INDEX IF NOT EXISTS idx_positions_commit ON positions(commit_hash)`);
    }
    return db;
}

export async function GET(req) {
    return measure('api:positions:get', async () => {
        try {
            const url = new URL(req.url);
            const commitHash = url.searchParams.get('commit');

            const database = getDb();

            let positions;
            if (commitHash) {
                positions = database.query('SELECT * FROM positions WHERE commit_hash = ?').all(commitHash);
            } else {
                positions = database.query('SELECT * FROM positions').all();
            }

            // Convert to map format
            const positionMap = {};
            for (const pos of positions) {
                positionMap[`${pos.commit_hash}:${pos.file_path}`] = {
                    x: pos.x,
                    y: pos.y
                };
            }

            return Response.json(positionMap);
        } catch (error) {
            measure('api:positions:get:error', () => error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}

export async function POST(req) {
    return measure('api:positions:save', async () => {
        try {
            const { commitHash, filePath, x, y } = await req.json();

            if (!commitHash || !filePath || x === undefined || y === undefined) {
                return new Response('commitHash, filePath, x, and y are required', { status: 400 });
            }

            const database = getDb();
            const id = `${commitHash}:${filePath}`;

            database.run(`
                INSERT OR REPLACE INTO positions (id, commit_hash, file_path, x, y, updated_at)
                VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
            `, [id, commitHash, filePath, x, y]);

            return Response.json({ success: true });
        } catch (error) {
            measure('api:positions:save:error', () => error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
