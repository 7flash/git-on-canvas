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
import { render } from 'melina/client';
import type { CanvasContext } from './context';
import { showToast, escapeHtml } from './utils';
import { createLayer, getActiveLayer, addSectionToLayer } from './layers';
import { updateCanvasTransform, updateZoomUI, updateMinimap, fitAllFiles, setupMinimapClick } from './canvas';
import { hideSelectedFiles, showHiddenFilesModal as showHiddenModal } from './hidden-files';
import { clearSelectionHighlights, updateSelectionHighlights, updateArrangeToolbar, arrangeRow, arrangeColumn, arrangeGrid, toggleCardExpand, fitScreenSize, changeCardsFontSize } from './cards';
import { loadRepository, rerenderCurrentView, selectCommit } from './repo';
import { toggleCanvasChat } from './chat';
import { cancelPendingConnection, hasPendingConnection } from './connections';
import { promptAddSection } from './layers';

// ─── Recent repos helper ────────────────────────────────
function _addRecentRepo(path: string) {
    const key = 'gitcanvas:recentRepos';
    const recent: string[] = JSON.parse(localStorage.getItem(key) || '[]');
    // Remove if already exists, then prepend
    const filtered = recent.filter(r => r !== path);
    filtered.unshift(path);
    // Keep max 10
    localStorage.setItem(key, JSON.stringify(filtered.slice(0, 10)));
}

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
            const hunkPane = target.closest('.hunk-pane, .diff-hunk-body') as HTMLElement | null;
            const previewPre = target.closest('.file-content-preview pre') as HTMLElement | null;
            const cardBody = target.closest('.file-card-body') as HTMLElement | null;
            const scrollContainer = hunkPane || previewPre || cardBody;

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
                panel.dataset.manuallyClosed = isVisible ? 'true' : 'false';
            });
        }

        if (closeBtn && panel) {
            closeBtn.addEventListener('click', () => {
                panel.style.display = 'none';
                panel.dataset.manuallyClosed = 'true';
            });
        }
    });
}

function setupConnectionsPanel() {
    measure('panel:setupConnections', () => {
        const toggleBtn = document.getElementById('toggleConnectionsPanel');
        const panel = document.getElementById('connectionsPanel');
        const closeBtn = document.getElementById('closeConnectionsPanel');

        if (toggleBtn && panel) {
            toggleBtn.addEventListener('click', () => {
                const isVisible = panel.style.display !== 'none';
                panel.style.display = isVisible ? 'none' : 'flex';
                if (!isVisible) {
                    import('./connections').then(m => m.populateConnectionsList(ctx));
                }
            });
        }
        if (closeBtn && panel) {
            closeBtn.addEventListener('click', () => panel.style.display = 'none');
        }
    });
}

// ─── Global event listeners ─────────────────────────────
export function setupEventListeners(ctx: CanvasContext) {
    measure('events:setup', () => {
        setupChangedFilesPanel();
        setupConnectionsPanel();

        // Repo dropdown selector
        const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement;
        if (repoSelect) {
            // Populate dropdown from recent repos
            const recentRepos: string[] = JSON.parse(localStorage.getItem('gitcanvas:recentRepos') || '[]');
            // Clear except first placeholder
            while (repoSelect.options.length > 1) repoSelect.remove(1);
            recentRepos.forEach(repo => {
                const opt = document.createElement('option');
                opt.value = repo;
                // Show short name (last folder part) + full path
                const shortName = repo.replace(/\\/g, '/').split('/').filter(Boolean).pop() || repo;
                opt.textContent = shortName;
                opt.title = repo;
                repoSelect.add(opt);
            });
            // "Open new repo..." option at the end
            const newOpt = document.createElement('option');
            newOpt.value = '__new__';
            newOpt.textContent = '＋ Open new repo...';
            repoSelect.add(newOpt);

            // Set initial value from hash
            const hashPath = decodeURIComponent(location.hash.slice(1));
            if (hashPath && recentRepos.includes(hashPath)) {
                repoSelect.value = hashPath;
            }

            repoSelect.addEventListener('change', () => {
                const val = repoSelect.value;
                if (val === '__new__') {
                    const path = prompt('Enter repository path:');
                    if (path && path.trim()) {
                        _addRecentRepo(path.trim());
                        loadRepository(ctx, path.trim());
                        // Re-populate dropdown
                        setupEventListeners(ctx);
                    } else {
                        // Reset selection
                        repoSelect.value = '';
                    }
                } else if (val) {
                    loadRepository(ctx, val);
                }
            });
        }

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

        // All-files mode is always active — no view switching needed

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

        // AI chat toggle
        document.getElementById('toggleCanvasChat')?.addEventListener('click', () => toggleCanvasChat(ctx));

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
                // Cancel click-to-connect if pending
                if (hasPendingConnection()) {
                    cancelPendingConnection(ctx);
                    return;
                }
                if (ctx.snap().context.pendingConnection) {
                    ctx.actor.send({ type: 'CANCEL_CONNECTION' });
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

            // F = Toggle selected cards expanded/collapsed (skip if Ctrl held — Ctrl+F is file search)
            if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) {
                const selected = ctx.snap().context.selectedCards;
                if (selected.length > 0) {
                    e.preventDefault();
                    toggleCardExpand(ctx);
                }
            }

            // W = Fit selected cards to screen/viewport size
            if (e.key === 'w' || e.key === 'W') {
                const selected = ctx.snap().context.selectedCards;
                if (selected.length > 0) {
                    e.preventDefault();
                    fitScreenSize(ctx);
                }
            }

            // Ctrl + / Ctrl - = increase/decrease card font size
            if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
                e.preventDefault();
                changeCardsFontSize(ctx, 1);
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
                e.preventDefault();
                changeCardsFontSize(ctx, -1);
            }

            // I = Toggle AI chat sidebar
            if (e.key === 'i' || e.key === 'I') {
                e.preventDefault();
                toggleCanvasChat(ctx);
            }

            // ← → = Navigate commits
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                const state = ctx.snap().context;
                const commits = state.commits;
                if (commits.length === 0) return;
                const currentIdx = commits.findIndex(c => c.hash === state.currentCommitHash);
                let newIdx;
                if (e.key === 'ArrowLeft') {
                    newIdx = currentIdx > 0 ? currentIdx - 1 : commits.length - 1;
                } else {
                    newIdx = currentIdx < commits.length - 1 ? currentIdx + 1 : 0;
                }
                e.preventDefault();
                selectCommit(ctx, commits[newIdx].hash);
                // Scroll the commit into view in sidebar
                const commitEl = document.querySelector(`.commit-item[data-hash="${commits[newIdx].hash}"]`);
                if (commitEl) commitEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }

            // / or Ctrl+F = Open file search
            if (e.key === '/' || (e.ctrlKey && e.key === 'f')) {
                e.preventDefault();
                openFileSearch(ctx);
            }
        });

        // ── Prevent browser page zoom (Ctrl+scroll, Ctrl+0) ──
        // Ctrl+scroll is already handled by the canvas wheel handler above.
        // This global handler catches it at document level for any remaining cases.
        document.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
            }
        }, { passive: false });

        // Prevent Ctrl+0 (reset browser zoom)
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === '0') {
                e.preventDefault();
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

// ─── File search overlay ────────────────────────────────
function openFileSearch(ctx: CanvasContext) {
    // Remove existing if open
    document.getElementById('fileSearchOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'fileSearchOverlay';
    overlay.className = 'file-search-overlay';
    document.body.appendChild(overlay);

    // Get all file paths from canvas or all active files
    function getAllPaths(): string[] {
        if (ctx.allFilesData && ctx.allFilesData.length > 0) {
            return ctx.allFilesData.map(f => f.path);
        }
        if (ctx.fileCards.size > 0) return Array.from(ctx.fileCards.keys());
        const cards = document.querySelectorAll('.file-card[data-path]');
        return Array.from(cards).map(c => (c as HTMLElement).dataset.path || '').filter(Boolean);
    }

    let selectedIdx = 0;
    let currentQuery = '';

    function navigateToFile(path: string) {
        let card = ctx.fileCards.get(path);

        if (!card) {
            const layer = getActiveLayer();
            if (layer && ctx.allFilesActive) {
                // Instantly add the whole file to the active layer
                addSectionToLayer(ctx, layer.id, path, '', '');

                // Wait for the active layer to apply/render then jump
                setTimeout(() => {
                    card = ctx.fileCards.get(path);
                    if (card) {
                        close();
                        doNavigate(path, card);
                    }
                }, 50);
            } else if (!ctx.allFilesActive) {
                showToast("File was not modified in the current view.", 'info');
            }
            return;
        }

        close();
        doNavigate(path, card);
    }

    function doNavigate(path: string, card: HTMLElement) {
        const vpRect = ctx.canvasViewport.getBoundingClientRect();
        const state = ctx.snap().context;
        const cardX = parseFloat(card.style.left) || 0;
        const cardY = parseFloat(card.style.top) || 0;
        const newOffsetX = -(cardX + card.offsetWidth / 2) * state.zoom + vpRect.width / 2;
        const newOffsetY = -(cardY + card.offsetHeight / 2) * state.zoom + vpRect.height / 2;

        ctx.actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
        updateCanvasTransform(ctx);

        card.classList.add('card-flash');
        setTimeout(() => card.classList.remove('card-flash'), 1500);
        ctx.actor.send({ type: 'SELECT_CARD', path, shift: false });
        updateSelectionHighlights(ctx);
        updateArrangeToolbar(ctx);
    }

    function close() {
        render(null, overlay);
        overlay.remove();
    }

    function highlightMatch(path: string, q: string): string {
        if (!q) return escapeHtml(path);
        const lp = path.toLowerCase();
        const idx = lp.indexOf(q);
        if (idx < 0) return escapeHtml(path);
        return escapeHtml(path.substring(0, idx)) +
            '<mark>' + escapeHtml(path.substring(idx, idx + q.length)) + '</mark>' +
            escapeHtml(path.substring(idx + q.length));
    }

    function getMatches() {
        const allPaths = getAllPaths();
        const q = currentQuery.toLowerCase().trim();
        return q ? allPaths.filter(p => p.toLowerCase().includes(q)).slice(0, 15) : allPaths.slice(0, 15);
    }

    function handleInput(e: Event) {
        currentQuery = (e.target as HTMLInputElement).value;
        selectedIdx = 0;
        rerender();
    }

    function handleKeydown(e: KeyboardEvent) {
        const matches = getMatches();
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIdx = Math.min(selectedIdx + 1, matches.length - 1);
            rerender();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIdx = Math.max(selectedIdx - 1, 0);
            rerender();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (matches[selectedIdx]) navigateToFile(matches[selectedIdx]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
    }

    function handleOverlayClick(e: MouseEvent) {
        if ((e.target as HTMLElement) === overlay || (e.target as HTMLElement).classList.contains('file-search-overlay')) {
            close();
        }
    }

    function SearchOverlay() {
        const matches = getMatches();
        const q = currentQuery.toLowerCase().trim();

        return (
            <div className="file-search-container">
                <input
                    type="text"
                    className="file-search-input"
                    placeholder="Search files on canvas..."
                    autocomplete="off"
                    value={currentQuery}
                    onInput={handleInput}
                    onKeydown={handleKeydown}
                />
                <div className="file-search-results">
                    {matches.length === 0 && q ? (
                        <div className="file-search-empty">No files matching "{q}"</div>
                    ) : (
                        matches.map((path, i) => (
                            <div
                                key={path}
                                className={`file-search-item ${i === selectedIdx ? 'selected' : ''}`}
                                onClick={() => navigateToFile(path)}
                            >
                                <span className="search-file-name" dangerouslySetInnerHTML={{ __html: highlightMatch(path, q) }} />
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    }

    function rerender() {
        render(<SearchOverlay />, overlay);
        // Re-focus input after re-render
        const input = overlay.querySelector('.file-search-input') as HTMLInputElement;
        if (input && document.activeElement !== input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }
    }

    overlay.addEventListener('click', handleOverlayClick);
    rerender();
    requestAnimationFrame(() => {
        const input = overlay.querySelector('.file-search-input') as HTMLInputElement;
        if (input) input.focus();
    });
}

