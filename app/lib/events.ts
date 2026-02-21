// @ts-nocheck
/**
 * Canvas interaction setup + global event listeners.
 *
 * Ported faithfully from the original page.client.tsx monolith.
 * Wheel behavior:
 *   Ctrl/Meta + scroll → zoom canvas (always, even over cards)
 *   Over scrollable hunk/preview → scroll that pane (Shift = horiz)
 *   Space held + scroll → pan canvas
 *   Plain scroll (no Space) → no-op
 * Mouse:
 *   Space/middle-click/Alt+click → pan
 *   Left click on empty canvas → rectangle selection
 *   Shift+click → additive selection
 * Keyboard:
 *   Space hold → pan mode
 *   H/V/G → arrange row/column/grid
 *   Ctrl+A → select all
 *   Escape → deselect + close modals
 *   Delete/Backspace → hide selected
 */
import { measure } from 'measure-fn';
import type { CanvasContext } from './context';
import { showToast } from './utils';
import { updateCanvasTransform, updateZoomUI, updateMinimap, fitAllFiles, setupMinimapClick } from './canvas';
import { hideSelectedFiles, showHiddenFilesModal as showHiddenModal } from './hidden-files';
import { clearSelectionHighlights, updateSelectionHighlights, updateArrangeToolbar, arrangeRow, arrangeColumn, arrangeGrid } from './cards';
import { loadRepository, switchView, rerenderCurrentView } from './repo';

// ─── Canvas interaction (pan/zoom/select) ───────────────
export function setupCanvasInteraction(ctx: CanvasContext) {
    measure('canvas:setupInteraction', () => {
        let rafPendingPan = false;
        let rafPendingSelect = false;
        // ── Wheel behavior ──
        ctx.canvasViewport.addEventListener('wheel', (e) => {
            const state = ctx.snap().context;

            // Ctrl+scroll = zoom (ALWAYS, even over file cards)
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
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
                return;
            }

            // Check if hovering over a scrollable pane
            const target = e.target as HTMLElement;
            const hunkPane = target.closest('.hunk-current-pane, .hunk-removed-pane') as HTMLElement | null;
            const previewPre = target.closest('.file-content-preview pre') as HTMLElement | null;
            const scrollContainer = hunkPane || previewPre;

            if (scrollContainer) {
                // Always consume scroll events inside scrollable content
                e.preventDefault();
                e.stopPropagation();

                if (e.shiftKey) {
                    // Shift+scroll = horizontal scroll within pane
                    scrollContainer.scrollLeft += e.deltaY;
                } else {
                    // Plain scroll = vertical scroll within pane
                    scrollContainer.scrollTop += e.deltaY;
                }
                return;
            }

            // Canvas pan only when Space is held
            e.preventDefault();

            if (!ctx.spaceHeld) {
                // Plain scroll without Space held = do nothing
                return;
            }

            if (e.shiftKey) {
                // Space + Shift+scroll = horizontal pan
                const panSpeed = 1.5;
                const dx = e.deltaY * panSpeed;
                ctx.actor.send({ type: 'SET_OFFSET', x: state.offsetX - dx, y: state.offsetY });
                updateCanvasTransform(ctx);
                updateMinimap(ctx);
            } else {
                // Space + scroll = vertical pan
                const panSpeed = 1.5;
                const dy = e.deltaY * panSpeed;
                const dx = e.deltaX * panSpeed;
                ctx.actor.send({ type: 'SET_OFFSET', x: state.offsetX - dx, y: state.offsetY - dy });
                updateCanvasTransform(ctx);
                updateMinimap(ctx);
            }
        }, { passive: false });

        // ── Selection rectangle state ──
        let selectionRect: HTMLElement | null = null;
        let selRectStartWorldX = 0, selRectStartWorldY = 0;
        let isRectSelecting = false;

        // ── Mousedown on viewport ──
        ctx.canvasViewport.addEventListener('mousedown', (e) => {
            const state = ctx.snap().context;

            // Space held, middle-click or Alt+click = pan
            if (e.button === 1 || e.altKey || ctx.spaceHeld) {
                // Prevent middle-click from also being caught by card mousedown
                ctx.isDragging = true;
                ctx.dragStartX = e.clientX - state.offsetX;
                ctx.dragStartY = e.clientY - state.offsetY;
                ctx.canvasViewport.style.cursor = 'grabbing';
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const insideCard = (e.target as HTMLElement).closest('.file-card');
            if (insideCard) return;

            // Left click on empty canvas = start rectangle selection
            if (e.button === 0) {
                if (!e.shiftKey) {
                    ctx.actor.send({ type: 'DESELECT_ALL' });
                    clearSelectionHighlights(ctx);
                }

                isRectSelecting = true;
                const vpRect = ctx.canvasViewport.getBoundingClientRect();
                selRectStartWorldX = (e.clientX - vpRect.left - state.offsetX) / state.zoom;
                selRectStartWorldY = (e.clientY - vpRect.top - state.offsetY) / state.zoom;

                selectionRect = document.createElement('div');
                selectionRect.className = 'selection-rect';
                selectionRect.style.left = `${selRectStartWorldX}px`;
                selectionRect.style.top = `${selRectStartWorldY}px`;
                selectionRect.style.width = '0px';
                selectionRect.style.height = '0px';
                ctx.canvas.appendChild(selectionRect);
                ctx.canvasViewport.style.cursor = 'crosshair';
            }
        });

        // ── Global mousemove (pan + rect select) ──
        window.addEventListener('mousemove', (e) => {
            if (ctx.isDragging) {
                const newX = e.clientX - ctx.dragStartX;
                const newY = e.clientY - ctx.dragStartY;
                ctx.actor.send({ type: 'SET_OFFSET', x: newX, y: newY });
                // Throttle transform + minimap to one frame
                if (!rafPendingPan) {
                    rafPendingPan = true;
                    requestAnimationFrame(() => {
                        rafPendingPan = false;
                        updateCanvasTransform(ctx);
                    });
                }
                return;
            }

            if (isRectSelecting && selectionRect) {
                const state = ctx.snap().context;
                const vpRect = ctx.canvasViewport.getBoundingClientRect();
                const worldX = (e.clientX - vpRect.left - state.offsetX) / state.zoom;
                const worldY = (e.clientY - vpRect.top - state.offsetY) / state.zoom;

                const rx = Math.min(selRectStartWorldX, worldX);
                const ry = Math.min(selRectStartWorldY, worldY);
                const rw = Math.abs(worldX - selRectStartWorldX);
                const rh = Math.abs(worldY - selRectStartWorldY);

                selectionRect.style.left = `${rx}px`;
                selectionRect.style.top = `${ry}px`;
                selectionRect.style.width = `${rw}px`;
                selectionRect.style.height = `${rh}px`;

                // Throttle live-highlight to one per frame
                if (!rafPendingSelect) {
                    rafPendingSelect = true;
                    requestAnimationFrame(() => {
                        rafPendingSelect = false;
                        ctx.fileCards.forEach((card, path) => {
                            const cx = parseFloat(card.style.left) || 0;
                            const cy = parseFloat(card.style.top) || 0;
                            const cw = card.offsetWidth || 580;
                            const ch = card.offsetHeight || 200;
                            const overlaps = cx + cw > rx && cx < rx + rw && cy + ch > ry && cy < ry + rh;
                            card.classList.toggle('selected', overlaps);
                        });
                    });
                }
            }
        });

        // ── Global mouseup (pan + rect select) ──
        window.addEventListener('mouseup', (e) => {
            if (ctx.isDragging) {
                ctx.isDragging = false;
                ctx.canvasViewport.style.cursor = 'grab';
                return;
            }

            if (isRectSelecting) {
                isRectSelecting = false;
                ctx.canvasViewport.style.cursor = 'grab';

                if (selectionRect) {
                    const rx = parseFloat(selectionRect.style.left);
                    const ry = parseFloat(selectionRect.style.top);
                    const rw = parseFloat(selectionRect.style.width);
                    const rh = parseFloat(selectionRect.style.height);

                    const selected: string[] = [];
                    ctx.fileCards.forEach((card, path) => {
                        const cx = parseFloat(card.style.left) || 0;
                        const cy = parseFloat(card.style.top) || 0;
                        const cw = card.offsetWidth || 580;
                        const ch = card.offsetHeight || 200;

                        const overlaps = cx + cw > rx && cx < rx + rw && cy + ch > ry && cy < ry + rh;
                        if (overlaps) selected.push(path);
                    });

                    if (selected.length > 0) {
                        selected.forEach((path, i) => {
                            ctx.actor.send({ type: 'SELECT_CARD', path, shift: i > 0 || e.shiftKey });
                        });
                    } else if (!e.shiftKey) {
                        ctx.actor.send({ type: 'DESELECT_ALL' });
                    }

                    updateSelectionHighlights(ctx);
                    updateArrangeToolbar(ctx);

                    selectionRect.remove();
                    selectionRect = null;
                }
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

// ─── Changed files panel setup ──────────────────────────
function setupChangedFilesPanel() {
    measure('panel:setupChangedFiles', () => {
        const toggleBtn = document.getElementById('toggleChangedFiles');
        const panel = document.getElementById('changedFilesPanel');
        const closeBtn = document.getElementById('closeChangedFiles');

        if (toggleBtn && panel) {
            toggleBtn.addEventListener('click', () => {
                const isVisible = panel.style.display !== 'none';
                panel.style.display = isVisible ? 'none' : 'flex';
            });
        }

        if (closeBtn && panel) {
            closeBtn.addEventListener('click', () => {
                panel.style.display = 'none';
            });
        }
    });
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

        // All Files checkbox toggle (older UI variant)
        document.getElementById('allFilesCheckbox')?.addEventListener('change', (e) => {
            switchView(ctx, (e.target as HTMLInputElement).checked ? 'allfiles' : 'commits');
        });

        // Hidden files button
        document.getElementById('showHidden')?.addEventListener('click', () => showHiddenModal(ctx, () => rerenderCurrentView(ctx)));

        // Arrange toolbar buttons
        document.getElementById('arrangeRow')?.addEventListener('click', () => arrangeRow(ctx));
        document.getElementById('arrangeCol')?.addEventListener('click', () => arrangeColumn(ctx));
        document.getElementById('arrangeColumn')?.addEventListener('click', () => arrangeColumn(ctx));
        document.getElementById('arrangeGrid')?.addEventListener('click', () => arrangeGrid(ctx));

        // Close preview
        document.getElementById('closePreview')?.addEventListener('click', closePreview);
        document.querySelector('.modal-backdrop')?.addEventListener('click', closePreview);

        // Changed files panel
        setupChangedFilesPanel();

        // ── Keyboard shortcuts ──
        window.addEventListener('keydown', (e) => {
            // Space-bar canvas panning
            if (e.code === 'Space' && !e.repeat) {
                if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
                e.preventDefault();
                ctx.spaceHeld = true;
                ctx.canvasViewport.classList.add('space-panning');
                return;
            }

            // Don't interfere with input fields for all other shortcuts
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

            if (e.key === 'Escape') {
                closePreview();
                const hiddenModal = document.getElementById('hiddenFilesModal');
                if (hiddenModal) hiddenModal.remove();
                if (ctx.snap().context.pendingConnection) {
                    ctx.actor.send({ type: 'CANCEL_CONNECTION' });
                    showToast('Connection cancelled', 'info');
                }
                // Deselect all cards
                ctx.actor.send({ type: 'DESELECT_ALL' });
                clearSelectionHighlights(ctx);
                updateArrangeToolbar(ctx);
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                const selected = ctx.snap().context.selectedCards;
                if (selected.length > 0) {
                    e.preventDefault();
                    hideSelectedFiles(ctx, selected);
                }
            }

            // Arrangement hotkeys
            if (e.key === 'h' || e.key === 'H') {
                const selected = ctx.snap().context.selectedCards;
                if (selected.length >= 2) { e.preventDefault(); arrangeRow(ctx); }
            }
            if (e.key === 'v' || e.key === 'V') {
                const selected = ctx.snap().context.selectedCards;
                if (selected.length >= 2) { e.preventDefault(); arrangeColumn(ctx); }
            }
            if (e.key === 'g' || e.key === 'G') {
                const selected = ctx.snap().context.selectedCards;
                if (selected.length >= 2) { e.preventDefault(); arrangeGrid(ctx); }
            }

            // Select all with Ctrl+A
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                ctx.fileCards.forEach((card, path) => {
                    ctx.actor.send({ type: 'SELECT_CARD', path, shift: true });
                });
                updateSelectionHighlights(ctx);
                updateArrangeToolbar(ctx);
            }
        });

        // Space-bar release
        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                ctx.spaceHeld = false;
                ctx.canvasViewport.classList.remove('space-panning');
                if (ctx.isDragging) {
                    ctx.isDragging = false;
                    ctx.canvasViewport.style.cursor = '';
                }
            }
        });

        // Window blur to reset space state
        window.addEventListener('blur', () => {
            if (ctx.spaceHeld) {
                ctx.spaceHeld = false;
                ctx.canvasViewport.classList.remove('space-panning');
                if (ctx.isDragging) {
                    ctx.isDragging = false;
                    ctx.canvasViewport.style.cursor = '';
                }
            }
        });

        // Minimap click navigation
        setupMinimapClick(ctx);
    });
}
