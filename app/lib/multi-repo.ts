// @ts-nocheck
/**
 * Multi-repo workspace — load multiple repos on the same canvas.
 *
 * Each repo gets its own zone (bounding box region) on the canvas.
 * Files from different repos are offset horizontally with a gap.
 * A floating repo zone label appears at the top of each repo's area.
 *
 * Architecture:
 * - `loadedRepos` tracks all loaded repos with their file data and bounds
 * - When a second repo is loaded, its grid starts to the right of the first
 * - Repo zone labels are DOM elements inside the canvas (world-space)
 * - Sidebar commit timeline switches between repos via tab clicks
 */

import type { CanvasContext } from './context';
import { showToast } from './utils';

export interface LoadedRepo {
    path: string;
    name: string;        // Display name (last folder segment)
    commits: any[];
    files: any[];        // allFilesData
    bounds: { x: number; y: number; width: number; height: number };
    zoneLabel: HTMLElement | null;
    color: string;       // Accent color for the zone
}

// ── State ────────────────────────────────────────────
const loadedRepos = new Map<string, LoadedRepo>();
let _activeRepoPath: string | null = null;

const REPO_COLORS = [
    'rgba(124, 58, 237, 0.6)',   // Purple (primary)
    'rgba(59, 130, 246, 0.6)',   // Blue
    'rgba(16, 185, 129, 0.6)',   // Emerald
    'rgba(245, 158, 11, 0.6)',   // Amber
    'rgba(239, 68, 68, 0.6)',    // Red
];

const REPO_GAP = 800; // World-space gap between repos

// ── Public API ───────────────────────────────────────

export function getLoadedRepos() { return loadedRepos; }
export function getActiveRepoPath() { return _activeRepoPath; }
export function setActiveRepoPath(path: string) { _activeRepoPath = path; }

export function getRepoDisplayName(path: string): string {
    const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
    return parts[parts.length - 1] || path;
}

/**
 * Register a repo that has just been loaded.
 * Called from loadRepository after files are rendered.
 */
export function registerRepo(ctx: CanvasContext, repoPath: string, commits: any[], files: any[]) {
    const name = getRepoDisplayName(repoPath);
    const colorIdx = loadedRepos.size % REPO_COLORS.length;

    // Calculate bounds from existing cards + deferred cards
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const [path, card] of ctx.fileCards) {
        if (!repoMatchesPath(repoPath, path)) continue;
        const x = parseFloat(card.style.left) || 0;
        const y = parseFloat(card.style.top) || 0;
        const w = card.offsetWidth || 580;
        const h = card.offsetHeight || 700;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + w > maxX) maxX = x + w;
        if (y + h > maxY) maxY = y + h;
    }

    for (const [path, entry] of ctx.deferredCards) {
        if (!repoMatchesPath(repoPath, path)) continue;
        const { x, y, size } = entry;
        const w = size?.width || 580;
        const h = size?.height || 700;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + w > maxX) maxX = x + w;
        if (y + h > maxY) maxY = y + h;
    }

    if (minX === Infinity) {
        minX = 50; minY = 50; maxX = 650; maxY = 750;
    }

    const repo: LoadedRepo = {
        path: repoPath,
        name,
        commits,
        files,
        bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        zoneLabel: null,
        color: REPO_COLORS[colorIdx],
    };

    loadedRepos.set(repoPath, repo);
    _activeRepoPath = repoPath;

    createZoneLabel(ctx, repo);
}

/**
 * Get the X offset for a new repo being added to the canvas.
 * Returns the right edge of the rightmost existing repo + gap.
 */
export function getNextRepoOffset(): number {
    if (loadedRepos.size === 0) return 50;

    let maxRight = 0;
    for (const [, repo] of loadedRepos) {
        const right = repo.bounds.x + repo.bounds.width;
        if (right > maxRight) maxRight = right;
    }

    return maxRight + REPO_GAP;
}

/**
 * Check if this is an additional repo load (not the first one).
 */
export function isMultiRepoLoad(): boolean {
    return loadedRepos.size > 0;
}

/**
 * Remove a repo from the workspace.
 */
export function unloadRepo(ctx: CanvasContext, repoPath: string) {
    const repo = loadedRepos.get(repoPath);
    if (!repo) return;

    // Remove zone label
    if (repo.zoneLabel) repo.zoneLabel.remove();

    // Remove cards belonging to this repo
    for (const [path, card] of ctx.fileCards) {
        if (repoMatchesPath(repoPath, path)) {
            card.remove();
            ctx.fileCards.delete(path);
        }
    }

    // Remove deferred cards
    for (const [path] of ctx.deferredCards) {
        if (repoMatchesPath(repoPath, path)) {
            ctx.deferredCards.delete(path);
        }
    }

    loadedRepos.delete(repoPath);

    // Switch active to first remaining repo
    if (_activeRepoPath === repoPath) {
        const first = loadedRepos.keys().next();
        _activeRepoPath = first.done ? null : first.value;
    }
}

/**
 * Create repo zone tabs in the sidebar for switching between repos.
 */
export function renderRepoTabs(ctx: CanvasContext) {
    const container = document.getElementById('repoTabs');
    if (!container) return;

    if (loadedRepos.size <= 1) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = '';

    for (const [path, repo] of loadedRepos) {
        const tab = document.createElement('button');
        tab.className = `repo-tab ${path === _activeRepoPath ? 'repo-tab--active' : ''}`;
        tab.textContent = repo.name;
        tab.style.cssText = `
            padding: 6px 14px;
            font-size: 11px;
            font-weight: 600;
            border: 1px solid ${path === _activeRepoPath ? repo.color : 'rgba(255,255,255,0.08)'};
            background: ${path === _activeRepoPath ? repo.color.replace('0.6', '0.15') : 'rgba(255,255,255,0.03)'};
            color: ${path === _activeRepoPath ? '#e2e8f0' : 'rgba(255,255,255,0.4)'};
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s;
            white-space: nowrap;
            font-family: 'JetBrains Mono', monospace;
        `;

        tab.addEventListener('click', () => {
            _activeRepoPath = path;
            renderRepoTabs(ctx);
            // Re-render commit timeline for this repo
            import('./repo').then(m => {
                // Update XState with this repo's commits
                ctx.actor.send({ type: 'REPO_LOADED', commits: repo.commits });
                ctx.snap().context.repoPath = path;
                m.renderCommitTimeline(ctx);
            });
        });

        tab.addEventListener('mouseenter', () => {
            if (path !== _activeRepoPath) {
                tab.style.borderColor = repo.color;
                tab.style.color = '#e2e8f0';
            }
        });
        tab.addEventListener('mouseleave', () => {
            if (path !== _activeRepoPath) {
                tab.style.borderColor = 'rgba(255,255,255,0.08)';
                tab.style.color = 'rgba(255,255,255,0.4)';
            }
        });

        container.appendChild(tab);
    }
}

// ── Zone Label ───────────────────────────────────────

function createZoneLabel(ctx: CanvasContext, repo: LoadedRepo) {
    if (!ctx.canvas) return;

    // Remove old label if exists
    if (repo.zoneLabel) repo.zoneLabel.remove();

    const label = document.createElement('div');
    label.className = 'repo-zone-label';
    label.dataset.repo = repo.path;
    label.innerHTML = `
        <span style="
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 20px;
            background: ${repo.color.replace('0.6', '0.12')};
            border: 1px solid ${repo.color.replace('0.6', '0.3')};
            border-radius: 10px;
            color: #e2e8f0;
            font-size: 32px;
            font-weight: 700;
            font-family: system-ui, -apple-system, sans-serif;
            backdrop-filter: blur(8px);
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            letter-spacing: -0.02em;
            pointer-events: auto;
            user-select: none;
        ">
            <span style="
                width: 10px; height: 10px; border-radius: 50%;
                background: ${repo.color};
                box-shadow: 0 0 8px ${repo.color};
            "></span>
            ${repo.name}
        </span>
    `;

    label.style.cssText = `
        position: absolute;
        left: ${repo.bounds.x}px;
        top: ${repo.bounds.y - 70}px;
        z-index: 1;
        pointer-events: none;
    `;

    ctx.canvas.appendChild(label);
    repo.zoneLabel = label;
}

// ── Helpers ──────────────────────────────────────────

function repoMatchesPath(repoPath: string, filePath: string): boolean {
    // In multi-repo mode, file paths are prefixed with the repo name
    // or we match by checking all paths registered for this repo
    const repo = loadedRepos.get(repoPath);
    if (!repo || !repo.files) return false;
    return repo.files.some(f => f.path === filePath);
}
