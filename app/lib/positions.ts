// @ts-nocheck
/**
 * Positions — load/save card positions from server.
 */
import { measure } from 'measure-fn';
import type { CanvasContext } from './context';

// ─── Load all saved positions from server ────────────────
export async function loadSavedPositions(ctx: CanvasContext) {
    return measure('positions:load', async () => {
        try {
            const response = await fetch('/api/positions');
            if (response.ok) {
                const data = await response.json();
                ctx.positions = new Map(Object.entries(data));
            }
        } catch (e) {
            measure('positions:loadError', () => e);
        }
    });
}

// ─── Save a single card position to server ───────────────
export async function savePosition(ctx: CanvasContext, commitHash: string, filePath: string, x?: number, y?: number, width?: number, height?: number) {
    return measure('positions:save', async () => {
        try {
            const posKey = `${commitHash}:${filePath}`;
            const existing = ctx.positions.get(posKey) || {};
            const newPos = {
                x: x !== undefined ? x : existing.x,
                y: y !== undefined ? y : existing.y,
                width: width !== undefined ? width : existing.width,
                height: height !== undefined ? height : existing.height
            };
            ctx.positions.set(posKey, newPos);

            await fetch('/api/positions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commitHash, filePath, ...newPos })
            });
        } catch (e) {
            measure('positions:saveError', () => e);
        }
    });
}

// ─── Position key helper ─────────────────────────────────
export function getPositionKey(filePath: string, commitHash: string): string {
    return `${commitHash}:${filePath}`;
}
