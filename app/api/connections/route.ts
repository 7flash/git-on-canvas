import { measure } from 'measure-fn';
import { Database, z } from 'sqlite-zod-orm';
import path from 'path';

const dbPath = path.join(process.cwd(), 'db', 'connections_v1.sqlite');

const db = new Database(dbPath, {
    connections: z.object({
        conn_id: z.string(),
        source_file: z.string(),
        source_line_start: z.number(),
        source_line_end: z.number(),
        target_file: z.string(),
        target_line_start: z.number(),
        target_line_end: z.number(),
        comment: z.string().default(''),
        created_at: z.string().default(() => new Date().toISOString()),
    }),
}, {
    indexes: { connections: ['source_file', 'target_file'] },
    reactive: false,
});

export async function GET() {
    return measure('api:connections:get', async () => {
        try {
            const connections = db.connections.select().all();
            return Response.json({ connections });
        } catch (error: any) {
            console.error('api:connections:get:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}

export async function POST(req: Request) {
    return measure('api:connections:save', async () => {
        try {
            const body = await req.json();
            const { connections } = body;

            if (!Array.isArray(connections)) {
                return new Response('connections array is required', { status: 400 });
            }

            // Delete all existing, then re-insert
            const existing = db.connections.select().all();
            for (const e of existing) {
                e.delete();
            }

            for (const conn of connections) {
                db.connections.insert({
                    conn_id: conn.id,
                    source_file: conn.sourceFile,
                    source_line_start: conn.sourceLineStart,
                    source_line_end: conn.sourceLineEnd,
                    target_file: conn.targetFile,
                    target_line_start: conn.targetLineStart,
                    target_line_end: conn.targetLineEnd,
                    comment: conn.comment || '',
                    created_at: conn.createdAt || new Date().toISOString(),
                });
            }

            return Response.json({ success: true, count: connections.length });
        } catch (error: any) {
            console.error('api:connections:save:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
