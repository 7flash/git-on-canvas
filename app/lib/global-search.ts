// @ts-nocheck
/**
 * Global search panel — Ctrl+Shift+F to search across all repo files.
 * Uses git grep via the /api/repo/search endpoint.
 * Results grouped by file, clickable to open in editor modal.
 */
import type { CanvasContext } from './context';
import { escapeHtml } from './utils';

let _panel: HTMLElement | null = null;
let _searchTimeout: any = null;
let _abortController: AbortController | null = null;
let _ctx: CanvasContext | null = null;

/** Toggle the search panel */
export function toggleGlobalSearch(ctx: CanvasContext) {
    _ctx = ctx;
    // Panel exists and is visible → close it
    if (_panel && _panel.style.display !== 'none') {
        closeSearch();
    } else {
        // Panel doesn't exist or is hidden → open/restore it
        openSearch();
    }
}

function openSearch() {
    // If panel was hidden (not destroyed), restore it
    if (_panel && _panel.style.display === 'none') {
        _panel.style.display = 'flex';
        document.addEventListener('keydown', _onEsc);
        requestAnimationFrame(() => _panel?.classList.add('visible'));
        // Re-focus search input
        const input = _panel.querySelector('#gsSearchInput') as HTMLInputElement;
        input?.focus();
        return;
    }

    if (_panel) return;

    _panel = document.createElement('div');
    _panel.id = 'globalSearchPanel';
    _panel.className = 'global-search-panel';
    // Inline positioning for reliability (same approach as settings modal)
    Object.assign(_panel.style, {
        position: 'fixed',
        top: '0',
        right: '0',
        width: '420px',
        height: '100vh',
        zIndex: '9000',
        display: 'flex',
        flexDirection: 'column',
    });
    _panel.innerHTML = `
        <div class="gs-header">
            <div class="gs-search-row">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" class="gs-search-icon">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input type="text" id="gsSearchInput" class="gs-input" placeholder="Search across all files..." spellcheck="false" autocomplete="off" />
                <button id="gsClose" class="gs-close" title="Close (Esc)">✕</button>
            </div>
            <div class="gs-options">
                <label class="gs-option" title="Match case">
                    <input type="checkbox" id="gsCaseSensitive" />
                    <span>Aa</span>
                </label>
                <span class="gs-info" id="gsInfo"></span>
            </div>
        </div>
        <div class="gs-results" id="gsResults">
            <div class="gs-empty">Type at least 2 characters to search</div>
        </div>
    `;

    document.body.appendChild(_panel);

    // Focus input
    const input = _panel.querySelector('#gsSearchInput') as HTMLInputElement;
    input?.focus();

    // Wire events
    input?.addEventListener('input', () => onSearchInput(input.value));
    _panel.querySelector('#gsClose')?.addEventListener('click', closeSearch);

    // Escape to close
    document.addEventListener('keydown', _onEsc);

    // Slide-in animation
    requestAnimationFrame(() => _panel?.classList.add('visible'));
}

export function closeSearch() {
    if (!_panel) return;
    document.removeEventListener('keydown', _onEsc);
    _panel.classList.remove('visible');
    // Hide instead of destroy — preserves query + results
    setTimeout(() => {
        if (_panel) {
            _panel.style.display = 'none';
        }
    }, 200);
    if (_abortController) { _abortController.abort(); _abortController = null; }
    if (_searchTimeout) { clearTimeout(_searchTimeout); _searchTimeout = null; }
}

function _onEsc(e: KeyboardEvent) {
    if (e.key === 'Escape' && _panel) {
        e.preventDefault();
        e.stopPropagation();
        closeSearch();
    }
}

function onSearchInput(query: string) {
    if (_searchTimeout) clearTimeout(_searchTimeout);
    if (_abortController) { _abortController.abort(); _abortController = null; }

    const info = document.getElementById('gsInfo');
    const results = document.getElementById('gsResults');

    if (query.length < 2) {
        if (info) info.textContent = '';
        if (results) results.innerHTML = '<div class="gs-empty">Type at least 2 characters to search</div>';
        return;
    }

    if (info) info.textContent = 'Searching...';
    if (results) results.innerHTML = '<div class="gs-loading"><div class="gs-spinner"></div></div>';

    // Debounce 300ms
    _searchTimeout = setTimeout(() => performSearch(query), 300);
}

async function performSearch(query: string) {
    if (!_ctx) return;

    const state = _ctx.snap().context;
    const repoPath = state.repoPath;
    if (!repoPath) return;

    const caseSensitive = (document.getElementById('gsCaseSensitive') as HTMLInputElement)?.checked || false;
    const info = document.getElementById('gsInfo');
    const resultsEl = document.getElementById('gsResults');

    _abortController = new AbortController();

    try {
        const res = await fetch('/api/repo/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: repoPath,
                query,
                commit: state.currentCommitHash || undefined,
                caseSensitive,
            }),
            signal: _abortController.signal,
        });

        if (!res.ok) {
            if (info) info.textContent = 'Search failed';
            if (resultsEl) resultsEl.innerHTML = '<div class="gs-empty gs-error">Search failed</div>';
            return;
        }

        const data = await res.json();
        const { results, totalMatches } = data;

        if (info) {
            const fileCount = results.length;
            info.textContent = totalMatches === 0
                ? 'No results'
                : `${totalMatches} match${totalMatches > 1 ? 'es' : ''} in ${fileCount} file${fileCount > 1 ? 's' : ''}`;
        }

        if (!resultsEl) return;

        if (results.length === 0) {
            resultsEl.innerHTML = `<div class="gs-empty">No results for "${escapeHtml(query)}"</div>`;
            return;
        }

        // Render grouped results
        resultsEl.innerHTML = results.map((group: any) => `
            <div class="gs-file-group">
                <div class="gs-file-header" data-path="${escapeHtml(group.file)}">
                    <span class="gs-file-icon">${getFileIcon(group.file)}</span>
                    <span class="gs-file-name">${escapeHtml(group.file.split('/').pop() || group.file)}</span>
                    <span class="gs-file-path">${escapeHtml(group.file)}</span>
                    <span class="gs-match-count">${group.matches.length}</span>
                </div>
                ${group.matches.map((m: any) => `
                    <div class="gs-match-line" data-path="${escapeHtml(group.file)}" data-line="${m.line}">
                        <span class="gs-line-num">${m.line}</span>
                        <span class="gs-line-content">${highlightMatch(escapeHtml(m.content), query, caseSensitive)}</span>
                    </div>
                `).join('')}
            </div>
        `).join('');

        // Wire click handlers
        resultsEl.querySelectorAll('.gs-match-line').forEach(el => {
            el.addEventListener('click', () => {
                const path = el.getAttribute('data-path');
                const line = parseInt(el.getAttribute('data-line') || '1', 10);
                if (path) openFileFromSearch(path, line);
            });
        });

        resultsEl.querySelectorAll('.gs-file-header').forEach(el => {
            el.addEventListener('click', () => {
                const path = el.getAttribute('data-path');
                if (path) openFileFromSearch(path, 1);
            });
        });

    } catch (err: any) {
        if (err.name === 'AbortError') return; // Cancelled
        if (info) info.textContent = 'Search error';
        if (resultsEl) resultsEl.innerHTML = `<div class="gs-empty gs-error">${escapeHtml(err.message)}</div>`;
    }
}

/** Highlight search matches in result text */
function highlightMatch(html: string, query: string, caseSensitive: boolean): string {
    const flags = caseSensitive ? 'g' : 'gi';
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return html.replace(new RegExp(escaped, flags), '<mark class="gs-highlight">$&</mark>');
}

function getFileIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const icons: Record<string, string> = {
        ts: '🔷', tsx: '⚛️', js: '🟡', jsx: '⚛️',
        css: '🎨', html: '🌐', json: '📋', md: '📝',
        py: '🐍', go: '🔵', rs: '🦀', yml: '⚙️', yaml: '⚙️',
        sh: '💻', sql: '🗃️', svg: '🖼️', png: '🖼️', jpg: '🖼️',
        toml: '⚙️', lock: '🔒', gitignore: '🚫',
    };
    return icons[ext] || '📄';
}

/** Jump to a file on the canvas from search results */
function openFileFromSearch(filePath: string, line: number) {
    if (!_ctx) return;

    // Jump to the file on the canvas (handles layer switching and centering)
    import('./canvas').then(({ jumpToFile }) => {
        jumpToFile(_ctx!, filePath);

        // After jump animation settles, scroll to the matching line
        if (line > 1) {
            setTimeout(() => {
                const card = _ctx?.fileCards.get(filePath);
                if (!card) return;
                const body = card.querySelector('.file-card-body') as HTMLElement;
                if (!body) return;
                // Find the line element
                const lineEl = body.querySelector(`[data-line="${line}"]`) as HTMLElement;
                if (lineEl) {
                    lineEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    // Flash highlight
                    lineEl.style.background = 'rgba(124, 58, 237, 0.3)';
                    setTimeout(() => { lineEl.style.background = ''; }, 2000);
                }
            }, 600); // Wait for jump animation
        }
    });

    // Hide panel but don't destroy — preserve state
    if (_panel) {
        _panel.classList.remove('visible');
        _panel.style.pointerEvents = 'none';
        _panel.style.opacity = '0';
        setTimeout(() => {
            if (_panel) {
                _panel.style.display = 'none';
                _panel.style.pointerEvents = '';
                _panel.style.opacity = '';
            }
        }, 200);
    }
}
