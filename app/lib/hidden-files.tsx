// @ts-nocheck
/**
 * Hidden files management — hide/restore/modal with folder bulk-hide.
 * Uses melina/client JSX + render instead of innerHTML.
 */
import { measure } from 'measure-fn';
import { render } from 'melina/client';
import type { CanvasContext } from './context';


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
            // Also remove from deferred so viewport-culling doesn't re-create
            ctx.deferredCards.delete(p);
        });

        updateHiddenUI(ctx);
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

// ─── Get unique folder paths from file list ─────────────
function getFolders(allFiles: string[]): string[] {
    const folders = new Set<string>();
    for (const f of allFiles) {
        const parts = f.split('/');
        // Build all ancestor folder paths
        for (let i = 1; i < parts.length; i++) {
            folders.add(parts.slice(0, i).join('/'));
        }
    }
    return [...folders].sort();
}

// ─── Hidden files modal (JSX) ───────────────────────────
function HiddenFilesModalContent({
    hiddenFiles, allFiles, onRestore, onRestoreAll, onHideFolder, onClose
}: {
    hiddenFiles: string[];
    allFiles: string[];
    onRestore: (path: string) => void;
    onRestoreAll: () => void;
    onHideFolder: (folder: string) => void;
    onClose: () => void;
}) {
    const folders = getFolders(allFiles);

    return (
        <>
            <div className="hidden-modal-backdrop" onClick={onClose}></div>
            <div className="hidden-modal-content">
                <div className="hidden-modal-header">
                    <h3>Hidden Files ({hiddenFiles.length})</h3>
                    <div className="hidden-modal-actions">
                        <button className="btn-secondary btn-sm" onClick={onRestoreAll}>Restore All</button>
                        <button className="hidden-modal-close" onClick={onClose}>&times;</button>
                    </div>
                </div>
                <div className="hidden-modal-body">
                    {/* Folder bulk-hide section */}
                    {folders.length > 0 && (
                        <div className="hidden-folder-section">
                            <div className="hidden-section-label">Hide by folder</div>
                            <div className="hidden-folder-list">
                                {folders.map(folder => {
                                    const filesInFolder = allFiles.filter(f => f.startsWith(folder + '/'));
                                    const hiddenInFolder = filesInFolder.filter(f => hiddenFiles.includes(f));
                                    const allHidden = hiddenInFolder.length === filesInFolder.length;
                                    return (
                                        <div key={folder} className="hidden-folder-row">
                                            <span className="hidden-folder-path">
                                                📁 {folder}/
                                                <span className="hidden-folder-count">
                                                    {hiddenInFolder.length}/{filesInFolder.length}
                                                </span>
                                            </span>
                                            <button
                                                className={`btn-hide-folder ${allHidden ? 'btn-disabled' : ''}`}
                                                title={allHidden ? 'All files already hidden' : `Hide ${filesInFolder.length - hiddenInFolder.length} files in ${folder}/`}
                                                disabled={allHidden}
                                                onClick={() => onHideFolder(folder)}
                                            >
                                                {allHidden ? '✓' : '🙈'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Individual hidden files */}
                    {hiddenFiles.length > 0 && (
                        <div className="hidden-section-label" style={{ marginTop: '12px' }}>
                            Currently hidden
                        </div>
                    )}
                    {hiddenFiles.map(f => (
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
        // Allow opening even with 0 hidden files (to use folder bulk-hide)
        let modal = document.getElementById('hiddenFilesModal');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'hiddenFilesModal';
        modal.className = 'hidden-files-modal';
        document.body.appendChild(modal);

        // Get all file paths from fileCards + deferredCards + hiddenFiles
        const allFiles = [
            ...ctx.fileCards.keys(),
            ...ctx.deferredCards.keys(),
            ...ctx.hiddenFiles,
        ];
        // Deduplicate
        const uniqueFiles = [...new Set(allFiles)];

        function rerender() {
            const hiddenFiles = [...ctx.hiddenFiles];
            render(
                <HiddenFilesModalContent
                    hiddenFiles={hiddenFiles}
                    allFiles={uniqueFiles}
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
                    }}
                    onHideFolder={(folder) => {
                        const toHide = uniqueFiles
                            .filter(f => f.startsWith(folder + '/'))
                            .filter(f => !ctx.hiddenFiles.has(f));
                        if (toHide.length > 0) {
                            hideSelectedFiles(ctx, toHide);
                            rerender();
                        }
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
