/**
 * Status Bar — VS Code-style bottom bar for GitMaps
 * 
 * Shows: zoom %, file count, selected count, repo name, mode.
 * Updates reactively via exported update functions.
 */

import type { CanvasContext } from './context';

let bar: HTMLElement | null = null;
let ctx: CanvasContext | null = null;

// Cached state for efficient updates
let _zoom = 1;
let _fileCount = 0;
let _selectedCount = 0;
let _repoName = '';
let _mode = 'Simple';
let _commitHash = '';

function createBar(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'status-bar';
    el.innerHTML = `
        <div class="sb-left">
            <span class="sb-item sb-repo" id="sbRepo" title="Current repository"></span>
            <span class="sb-item sb-commit" id="sbCommit" title="Current commit"></span>
        </div>
        <div class="sb-right">
            <span class="sb-item sb-mode" id="sbMode" title="Interaction mode"></span>
            <span class="sb-item sb-selected" id="sbSelected" title="Selected cards"></span>
            <span class="sb-item sb-files" id="sbFiles" title="Total files on canvas"></span>
            <span class="sb-item sb-zoom" id="sbZoom" title="Zoom level (scroll to zoom)"></span>
        </div>
    `;
    return el;
}

function render() {
    if (!bar) return;

    const repoEl = bar.querySelector('#sbRepo') as HTMLElement;
    const commitEl = bar.querySelector('#sbCommit') as HTMLElement;
    const modeEl = bar.querySelector('#sbMode') as HTMLElement;
    const selectedEl = bar.querySelector('#sbSelected') as HTMLElement;
    const filesEl = bar.querySelector('#sbFiles') as HTMLElement;
    const zoomEl = bar.querySelector('#sbZoom') as HTMLElement;

    if (repoEl) repoEl.textContent = _repoName ? `📂 ${_repoName}` : '';
    if (commitEl) commitEl.textContent = _commitHash ? `⊙ ${_commitHash.substring(0, 7)}` : '';
    if (modeEl) {
        modeEl.textContent = `${_mode === 'Advanced' ? '🎯' : '✋'} ${_mode}`;
        modeEl.className = `sb-item sb-mode sb-mode--${_mode.toLowerCase()}`;
    }
    if (selectedEl) {
        selectedEl.textContent = _selectedCount > 0 ? `☑ ${_selectedCount} selected` : '';
        selectedEl.style.display = _selectedCount > 0 ? '' : 'none';
    }
    if (filesEl) filesEl.textContent = `📄 ${_fileCount} files`;
    if (zoomEl) zoomEl.textContent = `🔍 ${Math.round(_zoom * 100)}%`;
}

// ─── Public API ──────────────────────────────────────────

export function initStatusBar(context: CanvasContext) {
    ctx = context;
    bar = createBar();

    // Insert after canvas-area
    const canvasArea = document.querySelector('.canvas-area');
    if (canvasArea) {
        canvasArea.parentElement?.insertBefore(bar, canvasArea.nextSibling);
    } else {
        document.body.appendChild(bar);
    }

    // Initial sync
    const state = ctx.snap().context;
    _zoom = state.zoom || 1;
    _repoName = (state.repoPath || '').split('/').pop() || '';
    _fileCount = ctx.fileCards.size;
    _mode = state.mode === 'advanced' ? 'Advanced' : 'Simple';
    _commitHash = state.currentCommitHash || '';
    render();
}

export function updateStatusBarZoom(zoom: number) {
    if (Math.round(zoom * 100) === Math.round(_zoom * 100)) return;
    _zoom = zoom;
    const el = bar?.querySelector('#sbZoom') as HTMLElement;
    if (el) el.textContent = `🔍 ${Math.round(zoom * 100)}%`;
}

export function updateStatusBarFiles(count: number) {
    _fileCount = count;
    const el = bar?.querySelector('#sbFiles') as HTMLElement;
    if (el) el.textContent = `📄 ${count} files`;
}

export function updateStatusBarSelected(count: number) {
    _selectedCount = count;
    const el = bar?.querySelector('#sbSelected') as HTMLElement;
    if (el) {
        el.textContent = count > 0 ? `☑ ${count} selected` : '';
        el.style.display = count > 0 ? '' : 'none';
    }
}

export function updateStatusBarRepo(repoPath: string) {
    _repoName = repoPath.split('/').pop() || repoPath.split('\\').pop() || '';
    const el = bar?.querySelector('#sbRepo') as HTMLElement;
    if (el) el.textContent = `📂 ${_repoName}`;
}

export function updateStatusBarCommit(hash: string) {
    _commitHash = hash;
    const el = bar?.querySelector('#sbCommit') as HTMLElement;
    if (el) el.textContent = hash ? `⊙ ${hash.substring(0, 7)}` : '';
}

export function updateStatusBarMode(mode: string) {
    _mode = mode;
    const el = bar?.querySelector('#sbMode') as HTMLElement;
    if (el) {
        el.textContent = `${mode === 'Advanced' ? '🎯' : '✋'} ${mode}`;
        el.className = `sb-item sb-mode sb-mode--${mode.toLowerCase()}`;
    }
}
