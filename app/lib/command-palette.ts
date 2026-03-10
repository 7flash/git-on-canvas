/**
 * Command Palette — Ctrl+K / Ctrl+P file search with fuzzy matching
 * 
 * - Ctrl+K or Ctrl+P opens the palette overlay
 * - Type to fuzzy-search file names
 * - Arrow keys to navigate, Enter to jump, Escape to close
 * - Supports both fileCards (DOM) and deferredCards (virtualized)
 */
import type { CanvasContext } from './context';
import { jumpToFile } from './canvas';

// ── Fuzzy scoring ────────────────────────────────────────

interface SearchResult {
    path: string;
    name: string;
    dir: string;
    score: number;
    matchIndices: number[];
}

function fuzzyMatch(query: string, target: string): { score: number; indices: number[] } | null {
    const q = query.toLowerCase();
    const t = target.toLowerCase();

    let qi = 0;
    let score = 0;
    const indices: number[] = [];
    let lastMatchIdx = -1;

    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t[ti] === q[qi]) {
            indices.push(ti);
            // Consecutive match bonus
            if (lastMatchIdx === ti - 1) score += 10;
            // Start-of-word bonus (after / or . or -)
            if (ti === 0 || '/.-_'.includes(t[ti - 1]!)) score += 8;
            // Exact case match bonus
            if (target[ti] === query[qi]) score += 2;
            score += 1;
            lastMatchIdx = ti;
            qi++;
        }
    }

    if (qi !== q.length) return null;

    // Prefer shorter targets (more specific matches)
    score -= target.length * 0.1;
    // Prefer matches in filename over full path
    const nameStart = target.lastIndexOf('/') + 1;
    const nameMatches = indices.filter(i => i >= nameStart).length;
    score += nameMatches * 3;

    return { score, indices };
}

// ── Palette DOM ──────────────────────────────────────────

let overlay: HTMLElement | null = null;
let input: HTMLInputElement | null = null;
let resultsList: HTMLElement | null = null;
let selectedIdx = 0;
let currentResults: SearchResult[] = [];
let currentCtx: CanvasContext | null = null;

function getAllFiles(ctx: CanvasContext): { path: string; name: string; dir: string; isChanged: boolean }[] {
    const files: { path: string; name: string; dir: string; isChanged: boolean }[] = [];
    const seen = new Set<string>();

    ctx.fileCards.forEach((_card, path) => {
        seen.add(path);
        const parts = path.split('/');
        const name = parts.pop() || path;
        const dir = parts.join('/');
        files.push({ path, name, dir, isChanged: _card.dataset.changed === 'true' });
    });

    ctx.deferredCards?.forEach((entry, path) => {
        if (seen.has(path)) return;
        const parts = path.split('/');
        const name = parts.pop() || path;
        const dir = parts.join('/');
        files.push({ path, name, dir, isChanged: !!entry.isChanged });
    });

    return files;
}

function createOverlay(): void {
    overlay = document.createElement('div');
    overlay.id = 'command-palette-overlay';
    overlay.innerHTML = `
        <div id="command-palette">
            <div class="cp-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                </svg>
                <input type="text" id="cp-input" placeholder="Search files…" autocomplete="off" spellcheck="false" />
                <kbd>esc</kbd>
            </div>
            <div id="cp-results"></div>
            <div id="cp-footer">
                <span><kbd>↑↓</kbd> navigate</span>
                <span><kbd>↵</kbd> jump to file</span>
                <span><kbd>esc</kbd> close</span>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    input = overlay.querySelector('#cp-input') as HTMLInputElement;
    resultsList = overlay.querySelector('#cp-results') as HTMLElement;

    // Close on backdrop click
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) close();
    });

    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeyDown);
}

function highlightText(text: string, indices: number[]): string {
    const chars = text.split('');
    const set = new Set(indices);
    return chars.map((ch, i) => set.has(i) ? `<mark>${ch}</mark>` : ch).join('');
}

function renderResults(): void {
    if (!resultsList) return;

    if (currentResults.length === 0 && input?.value) {
        resultsList.innerHTML = '<div class="cp-empty">No files found</div>';
        return;
    }

    resultsList.innerHTML = currentResults.map((r, i) => {
        const isActive = i === selectedIdx;
        const nameHighlighted = highlightText(r.name, r.matchIndices.filter(idx => idx >= r.path.length - r.name.length).map(idx => idx - (r.path.length - r.name.length)));
        const dirHighlighted = r.dir ? highlightText(r.dir + '/', r.matchIndices.filter(idx => idx < r.path.length - r.name.length)) : '';

        return `<div class="cp-result${isActive ? ' cp-result--active' : ''}" data-idx="${i}">
            <span class="cp-result-name">${nameHighlighted}</span>
            <span class="cp-result-dir">${dirHighlighted}</span>
        </div>`;
    }).join('');

    // Scroll active item into view
    const active = resultsList.querySelector('.cp-result--active') as HTMLElement;
    active?.scrollIntoView({ block: 'nearest' });

    // Click to select
    resultsList.querySelectorAll('.cp-result').forEach(el => {
        el.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const idx = parseInt((el as HTMLElement).dataset.idx || '0');
            selectResult(idx);
        });
        el.addEventListener('mouseenter', () => {
            selectedIdx = parseInt((el as HTMLElement).dataset.idx || '0');
            renderResults();
        });
    });
}

function onInput(): void {
    const query = input?.value || '';
    if (!currentCtx) return;

    const files = getAllFiles(currentCtx);

    if (!query) {
        // Show all files sorted by path
        currentResults = files
            .map(f => ({ path: f.path, name: f.name, dir: f.dir, score: 0, matchIndices: [] }))
            .sort((a, b) => a.path.localeCompare(b.path))
            .slice(0, 30);
    } else {
        currentResults = files
            .map(f => {
                const match = fuzzyMatch(query, f.path);
                if (!match) return null;
                return { path: f.path, name: f.name, dir: f.dir, score: match.score, matchIndices: match.indices };
            })
            .filter((r): r is SearchResult => r !== null)
            .sort((a, b) => b.score - a.score)
            .slice(0, 20);
    }

    selectedIdx = 0;
    renderResults();
}

function onKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            selectedIdx = Math.min(selectedIdx + 1, currentResults.length - 1);
            renderResults();
            break;
        case 'ArrowUp':
            e.preventDefault();
            selectedIdx = Math.max(selectedIdx - 1, 0);
            renderResults();
            break;
        case 'Enter':
            e.preventDefault();
            selectResult(selectedIdx);
            break;
        case 'Escape':
            e.preventDefault();
            close();
            break;
    }
}

function selectResult(idx: number): void {
    const result = currentResults[idx];
    if (result && currentCtx) {
        close();
        jumpToFile(currentCtx, result.path);
    }
}

function open(ctx: CanvasContext): void {
    currentCtx = ctx;
    if (!overlay) createOverlay();
    overlay!.style.display = 'flex';
    input!.value = '';
    selectedIdx = 0;
    onInput(); // Show all files

    // Focus after a tick to avoid the Ctrl+K keystroke appearing
    requestAnimationFrame(() => input?.focus());
}

function close(): void {
    if (overlay) overlay.style.display = 'none';
    currentCtx = null;
}

export function isCommandPaletteOpen(): boolean {
    return overlay?.style.display === 'flex';
}

// ── Init ─────────────────────────────────────────────────

export function initCommandPalette(ctx: CanvasContext): void {
    document.addEventListener('keydown', (e) => {
        // Ctrl+K, Ctrl+P, or Cmd+K/Cmd+P
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'p')) {
            e.preventDefault();
            e.stopPropagation();
            if (isCommandPaletteOpen()) {
                close();
            } else {
                open(ctx);
            }
        }
    });
}
