/**
 * Git Heatmap — color-codes file cards by commit frequency.
 * Hot files (frequently changed) glow red/orange.
 * Cold files (rarely changed) stay blue/gray.
 * Toggle with 'H' hotkey or toolbar button.
 */

// ─── Types ──────────────────────────────────────────

interface HeatmapEntry {
    file: string;
    commits: number;
    heat: number; // 0-1 normalized
}

interface HeatmapState {
    active: boolean;
    data: HeatmapEntry[];
    maxCommits: number;
    days: number;
}

const state: HeatmapState = {
    active: false,
    data: [],
    maxCommits: 0,
    days: 90,
};

// ─── Color Scale ────────────────────────────────────

/** HSL heat colors: cold (220° blue) → warm (30° orange) → hot (0° red) */
function heatToColor(heat: number): string {
    // 0 = cold blue, 0.5 = orange, 1.0 = hot red
    const hue = 220 - heat * 220; // 220 → 0
    const saturation = 40 + heat * 50; // 40% → 90%
    const lightness = 25 + heat * 20; // 25% → 45%
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function heatToGlow(heat: number): string {
    if (heat < 0.3) return 'none';
    const intensity = Math.round(heat * 20);
    const hue = 220 - heat * 220;
    return `0 0 ${intensity}px hsla(${hue}, 80%, 50%, ${heat * 0.6})`;
}

// ─── Data Fetching ──────────────────────────────────

export async function fetchHeatmap(repoPath: string, days = 90): Promise<void> {
    try {
        const res = await fetch('/api/repo/git-heatmap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: repoPath, days }),
        });
        if (!res.ok) throw new Error(`Heatmap API error: ${res.status}`);
        const json = await res.json();
        state.data = json.files || [];
        state.maxCommits = json.maxCommits || 0;
        state.days = days;
    } catch (err) {
        console.error('[heatmap] fetch failed:', err);
        state.data = [];
    }
}

// ─── Apply / Remove Overlay ─────────────────────────

function applyOverlay() {
    const heatMap = new Map(state.data.map(e => [e.file, e]));
    const cards = document.querySelectorAll<HTMLElement>('.file-card');

    for (const card of cards) {
        const path = card.dataset.path;
        if (!path) continue;

        const entry = heatMap.get(path);
        const heat = entry?.heat ?? 0;

        // Apply heat background + glow
        card.style.setProperty('--heat-bg', heatToColor(heat));
        card.style.setProperty('--heat-glow', heatToGlow(heat));
        card.classList.add('heatmap-active');

        // Add commit count badge
        if (entry && entry.commits > 0) {
            let badge = card.querySelector('.heatmap-badge') as HTMLElement;
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'heatmap-badge';
                card.appendChild(badge);
            }
            badge.textContent = `🔥 ${entry.commits}`;
            badge.title = `${entry.commits} commits in last ${state.days} days`;
        }
    }
}

function removeOverlay() {
    const cards = document.querySelectorAll<HTMLElement>('.file-card');
    for (const card of cards) {
        card.style.removeProperty('--heat-bg');
        card.style.removeProperty('--heat-glow');
        card.classList.remove('heatmap-active');
        card.querySelector('.heatmap-badge')?.remove();
    }
}

// ─── Toggle ─────────────────────────────────────────

export async function toggleHeatmap(repoPath: string): Promise<boolean> {
    state.active = !state.active;

    if (state.active) {
        if (state.data.length === 0) {
            await fetchHeatmap(repoPath);
        }
        applyOverlay();
    } else {
        removeOverlay();
    }

    return state.active;
}

export function isHeatmapActive(): boolean {
    return state.active;
}

/** Refresh heatmap data and re-apply if active */
export async function refreshHeatmap(repoPath: string): Promise<void> {
    await fetchHeatmap(repoPath);
    if (state.active) {
        removeOverlay();
        applyOverlay();
    }
}

// ─── CSS (injected once) ────────────────────────────

let cssInjected = false;
export function injectHeatmapCSS() {
    if (cssInjected) return;
    cssInjected = true;

    const style = document.createElement('style');
    style.textContent = `
        .file-card.heatmap-active {
            background: var(--heat-bg, #1a1a2e) !important;
            box-shadow: var(--heat-glow, none) !important;
            transition: background 0.4s ease, box-shadow 0.4s ease;
        }

        .file-card.heatmap-active .file-card-header {
            background: rgba(0, 0, 0, 0.3) !important;
        }

        .heatmap-badge {
            position: absolute;
            top: 4px;
            right: 4px;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            color: #fff;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
            z-index: 10;
            pointer-events: none;
        }
    `;
    document.head.appendChild(style);
}
