// @ts-nocheck
/**
 * Positions — load/save card positions with dual storage:
 *   - Server-side (SQLite via /api/auth/positions) when logged in
 *   - localStorage fallback when not authenticated
 *
 * Enables shared repositories: each user has their own card layout.
 */
import { measure } from 'measure-fn';
import type { CanvasContext } from './context';
import { getUser } from './user';

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

function getRepoPath(ctx: CanvasContext): string | null {
    return ctx.snap?.()?.context?.repoPath || null;
}

// ─── Load all saved positions ────────────────────────────
export async function loadSavedPositions(ctx: CanvasContext) {
    return measure('positions:load', async () => {
        try {
            const repoPath = getRepoPath(ctx);
            if (!repoPath) return;

            // Clear old positions first to prevent stale data from
            // a previously loaded repo bleeding into the new one
            ctx.positions = new Map();

            // Try server-side first (if logged in)
            const user = getUser();
            if (user) {
                try {
                    const res = await fetch(`/api/auth/positions?repo=${encodeURIComponent(repoPath)}`);
                    const data = await res.json();
                    if (data.positions) {
                        ctx.positions = new Map(Object.entries(data.positions));
                        // Migrate legacy expanded state from separate localStorage key
                        _migrateLegacyExpanded(ctx, repoPath);
                        return;
                    }
                } catch { /* fall through to localStorage */ }
            }

            // Fallback: localStorage
            const key = getStorageKey(ctx);
            if (!key) return;
            const raw = localStorage.getItem(key);
            if (raw) {
                const data = JSON.parse(raw);
                ctx.positions = new Map(Object.entries(data));
            }

            // Migrate legacy expanded state from separate localStorage key
            _migrateLegacyExpanded(ctx, repoPath);
        } catch (e) {
            measure('positions:loadError', () => e);
        }
    });
}

// ─── Persist all positions (debounced) ───────────────────
function flushPositions(ctx: CanvasContext) {
    const repoPath = getRepoPath(ctx);
    if (!repoPath) return;

    const obj: Record<string, any> = {};
    for (const [k, v] of ctx.positions) {
        obj[k] = v;
    }

    // Always save to localStorage (instant)
    try {
        const key = getStorageKey(ctx);
        if (key) localStorage.setItem(key, JSON.stringify(obj));
    } catch { }

    // Also sync to server if logged in (async, fire-and-forget)
    const user = getUser();
    if (user) {
        fetch('/api/auth/positions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoUrl: repoPath, positions: obj }),
        }).catch(() => { /* silent — localStorage is the safety net */ });
    }
}

// ─── Save a single card position (debounced) ─────────────
export async function savePosition(ctx: CanvasContext, commitHash: string, filePath: string, x?: number, y?: number, width?: number, height?: number) {
    return measure('positions:save', async () => {
        try {
            const posKey = `${commitHash}:${filePath}`;
            const existing = ctx.positions.get(posKey) || {};
            const newPos = {
                x: x !== undefined ? x : existing.x,
                y: y !== undefined ? y : existing.y,
                width: width !== undefined ? width : existing.width,
                height: height !== undefined ? height : existing.height,
                expanded: existing.expanded, // preserve expanded flag
            };
            ctx.positions.set(posKey, newPos);

            // Debounced persist — avoid hammering storage on every drag frame
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

// ─── Expanded state (unified with positions) ─────────────

/** Check if a file path is saved as expanded in positions */
export function isPathExpandedInPositions(ctx: CanvasContext, filePath: string): boolean {
    // Check allfiles key (primary)
    const key = `allfiles:${filePath}`;
    const pos = ctx.positions.get(key);
    return !!(pos && pos.expanded);
}

/** Mark a file path as expanded or collapsed in positions */
export function setPathExpandedInPositions(ctx: CanvasContext, filePath: string, expanded: boolean) {
    const key = `allfiles:${filePath}`;
    const existing = ctx.positions.get(key) || {};
    ctx.positions.set(key, { ...existing, expanded });
    // Trigger debounced persist
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => flushPositions(ctx), SAVE_DEBOUNCE_MS);
}

/** Migrate legacy expanded state from separate localStorage key into positions */
function _migrateLegacyExpanded(ctx: CanvasContext, repoPath: string) {
    const legacyKey = `gitcanvas:expanded:${repoPath}`;
    try {
        const raw = localStorage.getItem(legacyKey);
        if (!raw) return;
        const paths: string[] = JSON.parse(raw);
        if (!Array.isArray(paths) || paths.length === 0) return;

        let migrated = 0;
        for (const filePath of paths) {
            const posKey = `allfiles:${filePath}`;
            const existing = ctx.positions.get(posKey) || {};
            if (!existing.expanded) {
                ctx.positions.set(posKey, { ...existing, expanded: true });
                migrated++;
            }
        }

        if (migrated > 0) {
            // Persist immediately to save the migration
            flushPositions(ctx);
        }

        // Remove the legacy key
        localStorage.removeItem(legacyKey);
    } catch { }
}
