import { measure, measureSync } from 'measure-fn';
import { Database, z } from 'sqlite-zod-orm';
import path from 'path';

const dbPath = path.join(process.cwd(), 'db', 'positions_v3.sqlite');

const db = new Database(dbPath, {
    positions: z.object({
        commit_hash: z.string(),
        file_path: z.string(),
        x: z.number(),
        y: z.number(),
        width: z.number().optional(),
        height: z.number().optional(),
    }),
}, {
    indexes: { positions: ['commit_hash'] },
    reactive: false,
});

export async function GET(req: Request) {
    return measure('api:positions:get', async () => {
        try {
            const url = new URL(req.url);
            const commitHash = url.searchParams.get('commit');

            const query = commitHash
                ? db.positions.select().where({ commit_hash: commitHash })
                : db.positions.select();

            const positions = query.all();

            // Convert to map format
            const positionMap: Record<string, { x: number; y: number; width?: number; height?: number }> = {};
            for (const pos of positions) {
                positionMap[`${pos.commit_hash}:${pos.file_path}`] = {
                    x: pos.x,
                    y: pos.y,
                    width: pos.width ?? undefined,
                    height: pos.height ?? undefined,
                };
            }

            return Response.json(positionMap);
        } catch (error: any) {
            console.error('api:positions:get:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}

export async function POST(req: Request) {
    return measure('api:positions:save', async () => {
        try {
            const body = await req.json();
            const { commitHash, filePath, x, y, width, height } = body;

            if (!commitHash || !filePath || x === undefined || y === undefined) {
                return new Response('commitHash, filePath, x, and y are required', { status: 400 });
            }

            db.positions.upsert(
                { commit_hash: commitHash, file_path: filePath },
                {
                    commit_hash: commitHash,
                    file_path: filePath,
                    x,
                    y,
                    width: width || undefined,
                    height: height || undefined,
                },
            );

            return Response.json({ success: true });
        } catch (error: any) {
            console.error('api:positions:save:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
