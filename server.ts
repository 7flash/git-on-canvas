/**
 * Git Canvas Server
 * Uses melina's createAppRouter with proper JSX components.
 */
import path from 'path';
import { serve, createAppRouter } from 'melina';

const appDir = path.join(import.meta.dir, 'app');

// ─── WebSocket Cursor Sharing ────────────────────────────
const CURSOR_COLORS = [
    '#7c3aed', '#06b6d4', '#f59e0b', '#ef4444', '#10b981',
    '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1',
];
let colorIdx = 0;

const websocket = {
    open(ws: any) {
        const peerId = Math.random().toString(36).substring(2, 8);
        const color = CURSOR_COLORS[colorIdx++ % CURSOR_COLORS.length];
        ws.data = { ...ws.data, peerId, color };
        ws.subscribe('cursors');
        // Tell the client their identity
        ws.send(JSON.stringify({ type: 'identity', peerId, color }));
    },
    message(ws: any, message: string | Buffer) {
        try {
            const data = JSON.parse(typeof message === 'string' ? message : message.toString());
            if (data.type === 'cursor') {
                // Broadcast to all other subscribers
                ws.publish('cursors', JSON.stringify({
                    type: 'cursor',
                    peerId: ws.data.peerId,
                    color: ws.data.color,
                    name: data.name || ws.data.peerId,
                    x: data.x,
                    y: data.y,
                    viewportX: data.viewportX,
                    viewportY: data.viewportY,
                    zoom: data.zoom,
                }));
            } else if (data.type === 'editor_sync') {
                ws.publish('cursors', JSON.stringify({
                    type: 'editor_sync',
                    peerId: ws.data.peerId,
                    color: ws.data.color,
                    name: data.name || ws.data.peerId,
                    file: data.file,
                    selections: data.selections,
                    typing: data.typing
                }));
            } else if (data.type === 'leave') {
                ws.publish('cursors', JSON.stringify({
                    type: 'leave',
                    peerId: ws.data.peerId,
                }));
            }
        } catch { /* ignore malformed messages */ }
    },
    close(ws: any) {
        ws.publish('cursors', JSON.stringify({
            type: 'leave',
            peerId: ws.data?.peerId,
        }));
        ws.unsubscribe('cursors');
    },
};

serve(createAppRouter({
    appDir,
    globalCss: path.join(appDir, 'globals.css'),
}), { port: parseInt(process.env.PORT || process.env.BUN_PORT || "3335"), websocket });
