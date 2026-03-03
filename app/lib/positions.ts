// @ts-nocheck
/**
 * Positions — load/save card positions to localStorage (per-repo).
 *
 * Previously used server SQLite via /api/positions.
 * Now uses localStorage keyed by repoPath for instant,
 * per-user persistence without server roundtrips.
 */
import { measure } from 'measure-fn';
import type { CanvasContext } from './context';

const STORAGE_PREFIX = 'gitcanvas:positions:';

/** Debounce timer for batched saves */
let _saveTimer: any = null;
const SAVE_DEBOUNCE_MS = 300;

// ─── Get the localStorage key for the current repo ───────
function getStorageKey(ctx: CanvasContext): string | null {
    const repoPath = ctx.snap?.()?.context?.repoPath;
    if (!repoPath) return null;
    return `${STORAGE_PREFIX}${repoPath}`;
}

// ─── Load all saved positions from localStorage ──────────
export async function loadSavedPositions(ctx: CanvasContext) {
    return measure('positions:load', async () => {
        try {
            const key = getStorageKey(ctx);
            if (!key) {
                // No repo loaded yet — will be called again after repo is set
                return;
            }
            const raw = localStorage.getItem(key);
            if (raw) {
                const data = JSON.parse(raw);
                ctx.positions = new Map(Object.entries(data));
            }
        } catch (e) {
            measure('positions:loadError', () => e);
        }
    });
}

// ─── Persist all positions to localStorage (debounced) ───
function flushPositions(ctx: CanvasContext) {
    const key = getStorageKey(ctx);
    if (!key) return;
    try {
        const obj: Record<string, any> = {};
        for (const [k, v] of ctx.positions) {
            obj[k] = v;
        }
        localStorage.setItem(key, JSON.stringify(obj));
    } catch (e) {
        // localStorage full or unavailable — degrade silently
        measure('positions:flushError', () => e);
    }
}

// ─── Save a single card position (debounced localStorage) ─
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

            // Debounced persist — avoid hammering localStorage on every drag frame
            if (_saveTimer) clearTimeout(_saveTimer);
            _saveTimer = setTimeout(() => flushPositions(ctx), SAVE_DEBOUNCE_MS);
        } catch (e) {
            measure('positions:saveError', () => e);
        }
    });
}

// ─── Position key helper ─────────────────────────────────
export function getPositionKey(filePath: string, commitHash: string): string {
    return `${commitHash}:${filePath}`;
}
