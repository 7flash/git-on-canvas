import { measure } from '../../lib/measure.js';
import { Database } from 'bun:sqlite';
import path from 'path';

let db = null;

function getDb() {
    if (!db) {
        // User rule: new database file when changing schema
        const dbPath = path.join(process.cwd(), 'db', 'positions_v2.sqlite');
        db = new Database(dbPath, { create: true });

        // Initialize schema with width/height
        db.run(`
            CREATE TABLE IF NOT EXISTS positions (
                id TEXT PRIMARY KEY,
                commit_hash TEXT NOT NULL,
                file_path TEXT NOT NULL,
                x REAL NOT NULL,
                y REAL NOT NULL,
                width REAL,
                height REAL,
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
            const query = commitHash
                ? 'SELECT * FROM positions WHERE commit_hash = ?'
                : 'SELECT * FROM positions';

            const positions = database.query(query).all(commitHash ? [commitHash] : []);

            // Convert to map format
            const positionMap = {};
            for (const pos of positions) {
                positionMap[`${pos.commit_hash}:${pos.file_path}`] = {
                    x: pos.x,
                    y: pos.y,
                    width: pos.width,
                    height: pos.height
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
            const body = await req.json();
            const { commitHash, filePath, x, y, width, height } = body;

            if (!commitHash || !filePath || x === undefined || y === undefined) {
                return new Response('commitHash, filePath, x, and y are required', { status: 400 });
            }

            const database = getDb();
            const id = `${commitHash}:${filePath}`;

            database.run(`
                INSERT INTO positions (id, commit_hash, file_path, x, y, width, height, updated_at)
                VALUES ($id, $commitHash, $filePath, $x, $y, $width, $height, strftime('%s', 'now'))
                ON CONFLICT(id) DO UPDATE SET
                    x = excluded.x,
                    y = excluded.y,
                    width = COALESCE(excluded.width, positions.width),
                    height = COALESCE(excluded.height, positions.height),
                    updated_at = excluded.updated_at
            `, {
                $id: id,
                $commitHash: commitHash,
                $filePath: filePath,
                $x: x,
                $y: y,
                $width: width || null,
                $height: height || null
            });

            return Response.json({ success: true });
        } catch (error) {
            measure('api:positions:save:error', () => error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
