// @ts-nocheck
/**
 * Canvas interaction setup + global event listeners.
 */
import { measure } from './measure.js';
import type { CanvasContext } from './context';
import { showToast } from './utils';
import { updateCanvasTransform, updateZoomUI, fitAllFiles, setupMinimapClick } from './canvas';
import { hideSelectedFiles, showHiddenFilesModal as showHiddenModal } from './hidden-files';
import { clearSelectionHighlights, updateArrangeToolbar, arrangeRow, arrangeColumn, arrangeGrid } from './cards';
import { loadRepository, switchView, rerenderCurrentView } from './repo';

// ─── Canvas interaction (pan/zoom) ──────────────────────
export function setupCanvasInteraction(ctx: CanvasContext) {
    measure('canvas:setupInteraction', () => {
        // Wheel: scroll hunk pane if hovering, zoom canvas otherwise
        ctx.canvasViewport.addEventListener('wheel', (e) => {
            const scrollable = e.target.closest('.hunk-current-pane') || e.target.closest('.hunk-removed-pane') || e.target.closest('.file-card-body');
            if (scrollable && scrollable.scrollHeight > scrollable.clientHeight) {
                return;
            }

            e.preventDefault();
            const state = ctx.snap().context;
            const rect = ctx.canvasViewport.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.min(3, Math.max(0.1, state.zoom * delta));
            const scale = newZoom / state.zoom;
            const newOffsetX = mouseX - (mouseX - state.offsetX) * scale;
            const newOffsetY = mouseY - (mouseY - state.offsetY) * scale;

            ctx.actor.send({ type: 'SET_ZOOM', zoom: newZoom });
            ctx.actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
            updateCanvasTransform(ctx);
            updateZoomUI(ctx);
        }, { passive: false });

        // Mousedown on empty canvas = pan
        ctx.canvasViewport.addEventListener('mousedown', (e) => {
            const insideCard = e.target.closest('.file-card');
            if (!insideCard) {
                ctx.actor.send({ type: 'DESELECT_ALL' });
                clearSelectionHighlights(ctx);
                updateArrangeToolbar(ctx);

                ctx.isDragging = true;
                const state = ctx.snap().context;
                ctx.dragStartX = e.clientX - state.offsetX;
                ctx.dragStartY = e.clientY - state.offsetY;
                ctx.canvasViewport.style.cursor = 'grabbing';
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (ctx.isDragging) {
                const newX = e.clientX - ctx.dragStartX;
                const newY = e.clientY - ctx.dragStartY;
                ctx.actor.send({ type: 'SET_OFFSET', x: newX, y: newY });
                updateCanvasTransform(ctx);
            }
        });

        window.addEventListener('mouseup', () => {
            if (ctx.isDragging) {
                ctx.isDragging = false;
                ctx.canvasViewport.style.cursor = 'grab';
            }
        });
    });
}

// ─── Paste repo path from clipboard ─────────────────────
async function pasteRepoPath(ctx: CanvasContext) {
    return measure('repo:paste', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text && text.trim()) {
                const input = document.getElementById('repoPath') as HTMLInputElement;
                input.value = text.trim();
                input.focus();
                showToast('Pasted from clipboard', 'info');
            } else {
                showToast('Clipboard is empty — type or paste a repo path', 'info');
            }
        } catch (err) {
            measure('repo:pasteError', () => err);
            showToast('Paste failed — type the path manually', 'error');
        }
    });
}

// ─── Preview modal close ────────────────────────────────
function closePreview() {
    const modal = document.getElementById('filePreviewModal');
    if (modal) modal.classList.remove('active');
}

// ─── Global event listeners ─────────────────────────────
export function setupEventListeners(ctx: CanvasContext) {
    measure('events:setup', () => {
        // Load repo
        document.getElementById('loadRepo')?.addEventListener('click', () => {
            const path = (document.getElementById('repoPath') as HTMLInputElement)?.value.trim();
            if (path) loadRepository(ctx, path);
        });

        document.getElementById('repoPath')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const path = (e.target as HTMLInputElement).value.trim();
                if (path) loadRepository(ctx, path);
            }
        });

        // Browse button — paste path from clipboard
        document.getElementById('browseRepo')?.addEventListener('click', () => pasteRepoPath(ctx));

        // Browse folder button — browser file input
        document.getElementById('browseFolder')?.addEventListener('click', () => {
            document.getElementById('folderPickerInput')?.click();
        });
        document.getElementById('folderPickerInput')?.addEventListener('change', (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files && files.length > 0) {
                const firstPath = files[0].webkitRelativePath;
                if (firstPath) {
                    const rootDir = firstPath.split('/')[0];
                    showToast(`Selected folder: ${rootDir} — type the full path in the input`, 'info');
                }
            }
        });

        // Zoom slider
        document.getElementById('zoomSlider')?.addEventListener('input', (e) => {
            ctx.actor.send({ type: 'SET_ZOOM', zoom: parseFloat((e.target as HTMLInputElement).value) });
            updateCanvasTransform(ctx);
            updateZoomUI(ctx);
        });

        // Reset
        document.getElementById('resetView')?.addEventListener('click', () => {
            ctx.actor.send({ type: 'SET_ZOOM', zoom: 1 });
            ctx.actor.send({ type: 'SET_OFFSET', x: 0, y: 0 });
            updateCanvasTransform(ctx);
            updateZoomUI(ctx);
        });

        // Fit All
        document.getElementById('fitAll')?.addEventListener('click', () => fitAllFiles(ctx));

        // View mode toggles
        document.getElementById('modeCommits')?.addEventListener('click', () => switchView(ctx, 'commits'));
        document.getElementById('modeAllFiles')?.addEventListener('click', () => switchView(ctx, 'allfiles'));

        // Hidden files button
        document.getElementById('showHidden')?.addEventListener('click', () => showHiddenModal(ctx, () => rerenderCurrentView(ctx)));

        // Close preview
        document.getElementById('closePreview')?.addEventListener('click', closePreview);
        document.querySelector('.modal-backdrop')?.addEventListener('click', closePreview);

        // Arrange toolbar
        document.getElementById('arrangeRow')?.addEventListener('click', () => arrangeRow(ctx));
        document.getElementById('arrangeColumn')?.addEventListener('click', () => arrangeColumn(ctx));
        document.getElementById('arrangeGrid')?.addEventListener('click', () => arrangeGrid(ctx));

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closePreview();
                const hiddenModal = document.getElementById('hiddenFilesModal');
                if (hiddenModal) hiddenModal.remove();
                if (ctx.snap().context.pendingConnection) {
                    ctx.actor.send({ type: 'CANCEL_CONNECTION' });
                    showToast('Connection cancelled', 'info');
                }
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
                const selected = ctx.snap().context.selectedCards;
                if (selected.length > 0) {
                    e.preventDefault();
                    hideSelectedFiles(ctx, selected);
                }
            }
        });

        // Minimap click navigation
        setupMinimapClick(ctx);
    });
}
