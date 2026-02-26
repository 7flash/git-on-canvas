// @ts-nocheck
/**
 * Hidden files management — hide/restore/modal.
 * Uses melina/client JSX + render instead of innerHTML.
 */
import { measure } from 'measure-fn';
import { render } from 'melina/client';
import type { CanvasContext } from './context';
import { showToast } from './utils';

// ─── Load hidden files from localStorage ────────────────
export function loadHiddenFiles(ctx: CanvasContext) {
    try {
        const saved = localStorage.getItem('gitcanvas:hiddenFiles');
        if (saved) {
            const arr = JSON.parse(saved);
            arr.forEach((f: string) => ctx.hiddenFiles.add(f));
        }
    } catch (e) { /* ignore */ }
}

// ─── Persist hidden files to localStorage ───────────────
export function saveHiddenFiles(ctx: CanvasContext) {
    localStorage.setItem('gitcanvas:hiddenFiles', JSON.stringify([...ctx.hiddenFiles]));
}

// ─── Update hidden button badge ─────────────────────────
export function updateHiddenUI(ctx: CanvasContext) {
    const btn = document.getElementById('showHidden');
    const badge = document.getElementById('hiddenCount');
    if (ctx.hiddenFiles.size > 0) {
        if (btn) btn.style.display = 'inline-flex';
        if (badge) badge.textContent = String(ctx.hiddenFiles.size);
    } else {
        if (btn) btn.style.display = 'none';
    }
}

// ─── Hide selected file paths ───────────────────────────
export function hideSelectedFiles(ctx: CanvasContext, paths: string[]) {
    measure('files:hide', () => {
        paths.forEach(p => ctx.hiddenFiles.add(p));
        saveHiddenFiles(ctx);
        ctx.actor.send({ type: 'DESELECT_ALL' });

        paths.forEach(p => {
            const card = ctx.fileCards.get(p);
            if (card) {
                card.remove();
                ctx.fileCards.delete(p);
            }
        });

        updateHiddenUI(ctx);
        showToast(`Hidden ${paths.length} file${paths.length > 1 ? 's' : ''}`, 'info');
    });
}

// ─── Restore a single hidden file ───────────────────────
export function restoreFile(ctx: CanvasContext, filePath: string) {
    ctx.hiddenFiles.delete(filePath);
    saveHiddenFiles(ctx);
    updateHiddenUI(ctx);
}

// ─── Restore all hidden files ───────────────────────────
export function restoreAllHidden(ctx: CanvasContext) {
    ctx.hiddenFiles.clear();
    saveHiddenFiles(ctx);
    updateHiddenUI(ctx);
}

// ─── Hidden files modal (JSX) ───────────────────────────
function HiddenFilesModalContent({
    files, onRestore, onRestoreAll, onClose
}: {
    files: string[];
    onRestore: (path: string) => void;
    onRestoreAll: () => void;
    onClose: () => void;
}) {
    return (
        <>
            <div className="hidden-modal-backdrop" onClick={onClose}></div>
            <div className="hidden-modal-content">
                <div className="hidden-modal-header">
                    <h3>Hidden Files ({files.length})</h3>
                    <div className="hidden-modal-actions">
                        <button className="btn-secondary btn-sm" onClick={onRestoreAll}>Restore All</button>
                        <button className="hidden-modal-close" onClick={onClose}>&times;</button>
                    </div>
                </div>
                <div className="hidden-modal-body">
                    {files.map(f => (
                        <div key={f} className="hidden-file-row" data-path={f}>
                            <span className="hidden-file-path">{f}</span>
                            <button className="btn-restore" title="Restore this file" onClick={() => onRestore(f)}>
                                👁
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}

// ─── Show the hidden files modal ────────────────────────
export function showHiddenFilesModal(ctx: CanvasContext, rerenderCurrentView: () => void) {
    measure('modal:hiddenFiles', () => {
        if (ctx.hiddenFiles.size === 0) {
            showToast('No hidden files', 'info');
            return;
        }

        let modal = document.getElementById('hiddenFilesModal');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'hiddenFilesModal';
        modal.className = 'hidden-files-modal';
        document.body.appendChild(modal);

        function rerender() {
            const files = [...ctx.hiddenFiles];
            if (files.length === 0) {
                render(null, modal);
                modal.remove();
                return;
            }
            render(
                <HiddenFilesModalContent
                    files={files}
                    onRestore={(path) => {
                        restoreFile(ctx, path);
                        rerenderCurrentView();
                        rerender();
                    }}
                    onRestoreAll={() => {
                        restoreAllHidden(ctx);
                        render(null, modal);
                        modal.remove();
                        rerenderCurrentView();
                        showToast('All files restored', 'success');
                    }}
                    onClose={() => {
                        render(null, modal);
                        modal.remove();
                    }}
                />,
                modal
            );
        }

        rerender();
    });
}
