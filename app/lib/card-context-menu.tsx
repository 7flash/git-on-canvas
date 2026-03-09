// @ts-nocheck
/**
 * Card context menu — right-click menu for file cards.
 * Extracted from cards.tsx for modularity.
 */
import { render } from 'melina/client';
import type { CanvasContext } from './context';
import { showToast } from './utils';
import { hideSelectedFiles } from './hidden-files';
import { layerState, createLayer, addFileToLayer, removeFileFromLayer, getActiveLayer } from './layers';

// These are imported lazily to avoid circular deps
let _updateSelectionHighlights: any;
let _updateArrangeToolbar: any;
let _openFileModal: any;
let _toggleCardExpand: any;
let _fitScreenSize: any;

function lazyLoad() {
    if (!_updateSelectionHighlights) {
        const cards = require('./cards');
        _updateSelectionHighlights = cards.updateSelectionHighlights;
        _updateArrangeToolbar = cards.updateArrangeToolbar;
        _openFileModal = cards.openFileModal;
        _toggleCardExpand = cards.toggleCardExpand;
        _fitScreenSize = cards.fitScreenSize;
    }
}

// ─── Context Menu JSX component ─────────────────────
function ContextMenu({ onAction, onActionLayer, isInActiveLayer }: { onAction: (action: string) => void, onActionLayer: (layerId: string) => void, isInActiveLayer: boolean }) {
    const customLayers = layerState.layers.filter(l => l.id !== 'default');
    return (
        <>
            <button className="ctx-item" onClick={() => onAction('copy-path')}>📋 Copy path</button>
            <button className="ctx-item" onClick={() => onAction('select')}>☑️ Select</button>
            <div className="ctx-divider"></div>
            <button className="ctx-item" onClick={() => onAction('expand')}>↗️ Expand</button>
            <button className="ctx-item" onClick={() => onAction('fit-content')}>📏 Fit content</button>
            <button className="ctx-item" onClick={() => onAction('fit-screen')}>📺 Fit screen</button>
            <div className="ctx-divider"></div>
            <button className="ctx-item" onClick={() => onAction('history')}>🕰️ File history</button>
            <div className="ctx-item ctx-dropdown">
                <span>✨ Add to Layer ▸</span>
                <div className="ctx-dropdown-content">
                    {customLayers.length === 0 ? (
                        <div className="ctx-item" style="opacity: 0.5; pointer-events: none">No custom layers</div>
                    ) : (
                        customLayers.map(l => (
                            <button key={l.id} className="ctx-item" onClick={() => onActionLayer(l.id)}>
                                + {l.name}
                            </button>
                        ))
                    )}
                    <div className="ctx-divider"></div>
                    <button className="ctx-item" onClick={() => onActionLayer('new')}>✨ Create New Layer</button>
                </div>
            </div>
            {isInActiveLayer && (
                <button className="ctx-item" onClick={() => onAction('remove-from-layer')} style="color: #ef4444">
                    ✕ Remove from Layer
                </button>
            )}
            <div className="ctx-divider"></div>
            <button className="ctx-item" onClick={() => onAction('hide')} style="color: #f59e0b">🙈 Hide file</button>
            <button className="ctx-item" onClick={() => onAction('delete')} style="color: #ef4444">🗑️ Delete file</button>
        </>
    );
}

// ─── Show context menu ──────────────────────────────
export function showCardContextMenu(ctx: CanvasContext, card: HTMLElement, x: number, y: number) {
    lazyLoad();
    document.querySelector('.card-context-menu')?.remove();

    const filePath = card.dataset.path;
    const menu = document.createElement('div');
    menu.className = 'card-context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // Check if file is in the active layer
    const activeLayer = getActiveLayer();
    const isInActiveLayer = !!(activeLayer && activeLayer.files[filePath]);

    function handleAction(action: string) {
        menu.remove();
        if (action === 'copy-path') {
            navigator.clipboard.writeText(filePath).then(() => {
                showToast(`Copied: ${filePath}`, 'info');
            });
        } else if (action === 'select') {
            ctx.actor.send({ type: 'SELECT_CARD', path: filePath, shift: false });
            _updateSelectionHighlights(ctx);
            _updateArrangeToolbar(ctx);
        } else if (action === 'hide') {
            hideSelectedFiles(ctx, [filePath]);
        } else if (action === 'remove-from-layer') {
            removeFileFromLayer(ctx, layerState.activeLayerId, filePath);
        } else if (action === 'expand') {
            const state = ctx.snap().context;
            const file = state.commitFiles?.find(f => f.path === filePath) ||
                ctx.allFilesData?.find(f => f.path === filePath) ||
                { path: filePath, name: filePath.split('/').pop(), lines: 0 };
            _openFileModal(ctx, file);
        } else if (action === 'fit-content') {
            ctx.actor.send({ type: 'SELECT_CARD', path: filePath, shift: false });
            _updateSelectionHighlights(ctx);
            _toggleCardExpand(ctx);
        } else if (action === 'fit-screen') {
            ctx.actor.send({ type: 'SELECT_CARD', path: filePath, shift: false });
            _updateSelectionHighlights(ctx);
            _fitScreenSize(ctx);
        } else if (action === 'history') {
            showFileHistory(ctx, filePath);
        } else if (action === 'delete') {
            deleteFile(ctx, filePath, card);
        }
    }

    function handleActionLayer(layerId: string) {
        menu.remove();
        if (layerId === 'new') {
            const name = prompt('Enter a name for the new layer:');
            if (!name) return;
            createLayer(ctx, name);
            addFileToLayer(ctx, layerState.activeLayerId, filePath);
        } else {
            addFileToLayer(ctx, layerId, filePath);
        }
    }

    render(<ContextMenu onAction={handleAction} onActionLayer={handleActionLayer} isInActiveLayer={isInActiveLayer} />, menu);
    document.body.appendChild(menu);

    requestAnimationFrame(() => {
        const r = menu.getBoundingClientRect();
        if (r.right > window.innerWidth) menu.style.left = `${window.innerWidth - r.width - 8}px`;
        if (r.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - r.height - 8}px`;
    });

    const closeMenu = (e: MouseEvent) => {
        if (!menu.contains(e.target as Node)) {
            menu.remove();
            document.removeEventListener('mousedown', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
}

// ─── File history panel (JSX) ───────────────────────
function FileHistoryContent({ fileName, commits, error, loading, onClose, onSelect }: {
    fileName: string; commits: any[]; error?: string; loading: boolean;
    onClose: () => void; onSelect: (hash: string) => void;
}) {
    return (
        <>
            <div className="panel-header">
                <span className="panel-title">History: {fileName}</span>
                <button className="btn-ghost btn-xs" onClick={onClose}>✕</button>
            </div>
            <div className="file-history-list">
                {loading ? (
                    <div style="padding: 16px; color: var(--text-muted); font-size: 0.75rem;">Loading...</div>
                ) : error ? (
                    <div style="padding: 16px; color: var(--error); font-size: 0.75rem;">Error: {error}</div>
                ) : commits.length === 0 ? (
                    <div style="padding: 16px; color: var(--text-muted); font-size: 0.75rem;">No commits found for this file</div>
                ) : (
                    commits.map(c => (
                        <div key={c.hash} className="file-history-item" onClick={() => onSelect(c.hash)}>
                            <span className="file-history-hash">{c.shortHash}</span>
                            <span className="file-history-msg">{c.message}</span>
                            <span className="file-history-date">{new Date(c.date).toLocaleDateString()}</span>
                        </div>
                    ))
                )}
            </div>
        </>
    );
}

export async function showFileHistory(ctx: CanvasContext, filePath: string) {
    const state = ctx.snap().context;
    if (!state.repoPath) {
        console.warn('No repository loaded');
        return;
    }

    document.querySelector('.file-history-panel')?.remove();

    const panel = document.createElement('div');
    panel.className = 'file-history-panel';
    const fileName = filePath.split('/').pop() || filePath;

    function closePanel() { panel.remove(); }
    function selectCommitHash(hash: string) {
        import('./repo').then(({ selectCommit }) => {
            selectCommit(ctx, hash);
            panel.remove();
        });
    }

    // Initial loading state
    render(<FileHistoryContent fileName={fileName} commits={[]} loading={true} onClose={closePanel} onSelect={selectCommitHash} />, panel);
    document.querySelector('.canvas-area')?.appendChild(panel);

    try {
        const response = await fetch('/api/repo/file-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: state.repoPath, filePath, limit: 30 })
        });

        if (!response.ok) throw new Error('Failed to fetch history');
        const data = await response.json();

        render(<FileHistoryContent fileName={fileName} commits={data.commits} loading={false} onClose={closePanel} onSelect={selectCommitHash} />, panel);
    } catch (err) {
        render(<FileHistoryContent fileName={fileName} commits={[]} error={err.message} loading={false} onClose={closePanel} onSelect={selectCommitHash} />, panel);
    }
}

// ─── Delete file ────────────────────────────────────
async function deleteFile(ctx: CanvasContext, filePath: string, card: HTMLElement) {
    const fileName = filePath.split('/').pop() || filePath;
    const state = ctx.snap().context;
    if (!state.repoPath) {
        showToast('No repository loaded', 'error');
        return;
    }

    // Show confirmation dialog
    const confirmed = window.confirm(
        `Delete "${fileName}"?\n\nPath: ${filePath}\n\nThis will permanently delete the file from disk.`
    );
    if (!confirmed) return;

    // Ask if they want git rm
    const useGitRm = window.confirm(
        `Stage deletion with git?\n\nClick OK to use "git rm" (stages for commit).\nClick Cancel to just delete the file.`
    );

    try {
        const res = await fetch('/api/repo/file-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: state.repoPath,
                filePath,
                gitRm: useGitRm,
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            showToast(`Delete failed: ${err}`, 'error');
            return;
        }

        // Remove card from DOM and data structures
        card.remove();
        ctx.fileCards.delete(filePath);
        ctx.positions.delete(filePath);
        if (ctx.deferredCards) ctx.deferredCards.delete(filePath);

        // Deselect if selected
        const selected = ctx.snap().context.selectedCards;
        if (selected.includes(filePath)) {
            ctx.actor.send({ type: 'DESELECT_ALL' });
        }

        // Remove from hidden files set if there
        ctx.hiddenFiles.delete(filePath);

        // Remove from allFilesData if present
        if (ctx.allFilesData) {
            ctx.allFilesData = ctx.allFilesData.filter(f => f.path !== filePath);
        }

        showToast(`Deleted ${fileName}${useGitRm ? ' (staged)' : ''}`, 'success');
    } catch (err: any) {
        showToast(`Delete error: ${err.message}`, 'error');
    }
}
