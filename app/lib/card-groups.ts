// @ts-nocheck
/**
 * Card Groups — collapse directories into compact summary cards.
 *
 * Click a directory label (📁) to collapse all files in that directory
 * into a single group card showing: dir name, file count, total lines,
 * and a mini file list. Click again to expand back.
 *
 * State persisted to localStorage per repo.
 */
import type { CanvasContext } from './context';

// ─── State ───────────────────────────────────────────────
const collapsedDirs = new Set<string>();
let _ctx: CanvasContext | null = null;

interface CollapsedGroup {
    dir: string;
    files: { path: string; name: string; lines: number; status?: string; x: number; y: number; w: number; h: number }[];
    groupCard: HTMLElement;
}

const activeGroups = new Map<string, CollapsedGroup>();

// ─── Persistence ─────────────────────────────────────────
function getStorageKey(): string {
    const hash = location.hash?.slice(1) || 'default';
    return `gitmaps:collapsed-dirs:${hash}`;
}

function saveState() {
    try {
        localStorage.setItem(getStorageKey(), JSON.stringify([...collapsedDirs]));
    } catch { }
}

function loadState() {
    try {
        const raw = localStorage.getItem(getStorageKey());
        if (raw) {
            const dirs = JSON.parse(raw);
            collapsedDirs.clear();
            for (const d of dirs) collapsedDirs.add(d);
        }
    } catch { }
}

// ─── Group card rendering ────────────────────────────────
function createGroupCard(dir: string, files: CollapsedGroup['files']): HTMLElement {
    const card = document.createElement('div');
    card.className = 'file-card group-card';
    card.dataset.groupDir = dir;

    // Position at the centroid of the files
    let cx = 0, cy = 0;
    for (const f of files) {
        cx += f.x;
        cy += f.y;
    }
    cx /= files.length;
    cy /= files.length;
    card.style.left = `${cx}px`;
    card.style.top = `${cy}px`;
    card.style.width = '320px';
    card.style.maxHeight = 'none';
    card.style.zIndex = '5';

    const totalLines = files.reduce((s, f) => s + (f.lines || 0), 0);
    const changedCount = files.filter(f => f.status && f.status !== 'unmodified').length;

    const statusColors: Record<string, string> = {
        added: '#22c55e', modified: '#eab308', deleted: '#ef4444',
        renamed: '#60a5fa', copied: '#a78bfa'
    };

    const fileListHTML = files
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 12)
        .map(f => {
            const dot = f.status && statusColors[f.status]
                ? `<span style="color:${statusColors[f.status]}; margin-right: 4px;">●</span>`
                : '';
            return `<div class="group-file-row">${dot}<span class="group-file-name">${f.name}</span><span class="group-file-lines">${f.lines}L</span></div>`;
        })
        .join('');

    const moreCount = files.length - 12;
    const moreHTML = moreCount > 0
        ? `<div class="group-more">+ ${moreCount} more files</div>`
        : '';

    card.innerHTML = `
        <div class="file-card-header group-card-header">
            <span class="group-icon">📁</span>
            <span class="file-name">${dir.split('/').pop() || dir}</span>
            <span class="group-meta">${files.length} files</span>
            ${changedCount > 0 ? `<span class="group-changed">${changedCount} changed</span>` : ''}
            <button class="group-expand-btn" title="Expand directory">▼</button>
        </div>
        <div class="group-card-body">
            <div class="group-dir-path">${dir}</div>
            <div class="group-stats">
                <span>📄 ${files.length} files</span>
                <span>📝 ${totalLines.toLocaleString()} lines</span>
                ${changedCount > 0 ? `<span style="color:#eab308">✏️ ${changedCount} changed</span>` : ''}
            </div>
            <div class="group-file-list">
                ${fileListHTML}
                ${moreHTML}
            </div>
        </div>
    `;

    // Click expand button to uncollapse
    card.querySelector('.group-expand-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        expandDirectory(dir);
    });

    // Double-click to expand
    card.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        expandDirectory(dir);
    });

    return card;
}

// ─── Collapse a directory ────────────────────────────────
export function collapseDirectory(ctx: CanvasContext, dir: string) {
    _ctx = ctx;

    // Already collapsed?
    if (activeGroups.has(dir)) return;

    const filesToCollapse: CollapsedGroup['files'] = [];

    // Find all file cards in this directory
    ctx.fileCards.forEach((card, path) => {
        const fileDir = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '.';
        if (fileDir === dir) {
            const x = parseFloat(card.style.left) || 0;
            const y = parseFloat(card.style.top) || 0;
            const w = card.offsetWidth || 580;
            const h = card.offsetHeight || 700;
            const name = path.split('/').pop() || path;
            const fileData = card.dataset;
            filesToCollapse.push({
                path, name,
                lines: parseInt(fileData.lines || '0') || 0,
                status: fileData.status || undefined,
                x, y, w, h
            });
        }
    });

    // Also check deferred cards
    ctx.deferredCards.forEach((entry, path) => {
        const fileDir = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '.';
        if (fileDir === dir) {
            const name = path.split('/').pop() || path;
            filesToCollapse.push({
                path, name,
                lines: 0,
                status: entry.isChanged ? 'modified' : undefined,
                x: entry.x, y: entry.y,
                w: entry.size?.width || 580,
                h: entry.size?.height || 700
            });
        }
    });

    if (filesToCollapse.length === 0) return;

    // Hide individual cards
    for (const f of filesToCollapse) {
        const card = ctx.fileCards.get(f.path);
        if (card) {
            card.style.display = 'none';
        }
    }

    // Create group card
    const groupCard = createGroupCard(dir, filesToCollapse);
    ctx.canvas?.appendChild(groupCard);

    activeGroups.set(dir, { dir, files: filesToCollapse, groupCard });
    collapsedDirs.add(dir);
    saveState();

    console.log(`[card-groups] Collapsed ${dir} (${filesToCollapse.length} files)`);
}

// ─── Expand a directory ──────────────────────────────────
export function expandDirectory(dir: string) {
    const ctx = _ctx;
    if (!ctx) return;

    const group = activeGroups.get(dir);
    if (!group) return;

    // Remove group card
    group.groupCard.remove();

    // Show individual cards again
    for (const f of group.files) {
        const card = ctx.fileCards.get(f.path);
        if (card) {
            card.style.display = '';
        }
    }

    activeGroups.delete(dir);
    collapsedDirs.delete(dir);
    saveState();

    console.log(`[card-groups] Expanded ${dir}`);
}

// ─── Toggle collapse ─────────────────────────────────────
export function toggleDirectoryCollapse(ctx: CanvasContext, dir: string) {
    if (activeGroups.has(dir)) {
        expandDirectory(dir);
    } else {
        collapseDirectory(ctx, dir);
    }
}

// ─── Restore collapsed state on load ─────────────────────
export function restoreCollapsedDirs(ctx: CanvasContext) {
    _ctx = ctx;
    loadState();
    for (const dir of collapsedDirs) {
        collapseDirectory(ctx, dir);
    }
}

// ─── Check if a dir is collapsed ─────────────────────────
export function isDirCollapsed(dir: string): boolean {
    return collapsedDirs.has(dir);
}

// ─── Get all collapsed dirs ──────────────────────────────
export function getCollapsedDirs(): string[] {
    return [...collapsedDirs];
}
