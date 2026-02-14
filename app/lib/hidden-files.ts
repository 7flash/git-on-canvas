// @ts-nocheck
/**
 * Hidden files management — hide/restore/modal.
 */
import { measure } from './measure.js';
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

        // Remove cards from canvas
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

        const list = [...ctx.hiddenFiles].map(f => `
            <div class="hidden-file-row" data-path="${f}">
                <span class="hidden-file-path">${f}</span>
                <button class="btn-restore" data-restore="${f}" title="Restore this file">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                </button>
            </div>
        `).join('');

        modal.innerHTML = `
            <div class="hidden-modal-backdrop"></div>
            <div class="hidden-modal-content">
                <div class="hidden-modal-header">
                    <h3>Hidden Files (${ctx.hiddenFiles.size})</h3>
                    <div class="hidden-modal-actions">
                        <button class="btn-secondary btn-sm" id="restoreAllHidden">Restore All</button>
                        <button class="hidden-modal-close">&times;</button>
                    </div>
                </div>
                <div class="hidden-modal-body">${list}</div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.hidden-modal-backdrop').addEventListener('click', () => modal.remove());
        modal.querySelector('.hidden-modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#restoreAllHidden').addEventListener('click', () => {
            restoreAllHidden(ctx);
            modal.remove();
            rerenderCurrentView();
            showToast('All files restored', 'success');
        });

        modal.querySelectorAll('.btn-restore').forEach(btn => {
            btn.addEventListener('click', () => {
                const path = btn.dataset.restore;
                restoreFile(ctx, path);
                btn.closest('.hidden-file-row').remove();
                const header = modal.querySelector('h3');
                header.textContent = `Hidden Files (${ctx.hiddenFiles.size})`;
                if (ctx.hiddenFiles.size === 0) {
                    modal.remove();
                }
                rerenderCurrentView();
            });
        });
    });
}
