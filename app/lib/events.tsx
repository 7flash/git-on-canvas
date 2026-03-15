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
import { zoomTowardScreen, panByDelta, screenToWorld, getCardManager } from './galaxydraw-bridge';
import { hideSelectedFiles, showHiddenFilesModal as showHiddenModal } from './hidden-files';
import { updatePillSelectionHighlights } from './viewport-culling';
import { clearSelectionHighlights, updateSelectionHighlights, updateArrangeToolbar, arrangeRow, arrangeColumn, arrangeGrid, toggleCardExpand, fitScreenSize, changeCardsFontSize } from './cards';
import { loadRepository, rerenderCurrentView, selectCommit } from './repo';
import { toggleCanvasChat } from './chat';
import { exportCanvasAsPNG, exportViewportAsPNG } from './canvas-export';
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

function _refreshRepoDropdown() {
    const repoSel = document.getElementById('repoSelect') as HTMLSelectElement;
    if (!repoSel) return;
    let updatedRepos: any[] = JSON.parse(localStorage.getItem('gitcanvas:recentRepos') || '[]');
    // Clean up corrupted entries (strings only, no objects/elements)
    updatedRepos = updatedRepos.filter(r => typeof r === 'string' && r && !r.includes('[object'));
    localStorage.setItem('gitcanvas:recentRepos', JSON.stringify(updatedRepos));
    while (repoSel.options.length > 1) repoSel.remove(1);
    updatedRepos.forEach((repo: any) => {
        // Handle strings, objects with path property, or skip invalid entries
        let repoPath = "";
        if (typeof repo === "string") {
            repoPath = repo;
        } else if (repo && typeof repo.path === "string") {
            repoPath = repo.path;
        } else {
            return; // Skip invalid entries
        }
        if (!repoPath) return;
        const opt = document.createElement('option');
        opt.value = repoPath;
        opt.textContent = repoPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || repoPath;
        opt.title = repoPath;
        repoSel.add(opt);
    });
    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = '＋ Open new repo...';
    repoSel.add(newOpt);
}

// ─── Canvas interaction (pan/zoom/select) ───────────────
export function setupCanvasInteraction(ctx: CanvasContext) {
    if (!ctx.canvasViewport) return;
    measure('canvas:setupInteraction', () => {
        let rafPendingPan = false;
        let rafPendingSelect = false;

        // Delta-based drag state — tracks last mouse position for panByDelta()
        let lastDragX = 0;
        let lastDragY = 0;

        // ── Wheel behavior ──
        ctx.canvasViewport.addEventListener('wheel', (e) => {
            const state = ctx.snap().context;

            // Ctrl+scroll = zoom (ALWAYS, even over file cards)
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const factor = e.deltaY > 0 ? 0.9 : 1.1;
                zoomTowardScreen(ctx, e.clientX, e.clientY, factor);
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

            // Canvas behavior when not over scrollable content
            e.preventDefault();

            // In simple mode: plain scroll = zoom (like WARMAPS)
            if (ctx.controlMode === 'simple') {
                const factor = e.deltaY > 0 ? 0.9 : 1.1;
                zoomTowardScreen(ctx, e.clientX, e.clientY, factor);
                updateCanvasTransform(ctx);
                updateZoomUI(ctx);
                return;
            }

            // Advanced mode: pan only when Space is held
            if (!ctx.spaceHeld) {
                return;
            }

            if (e.shiftKey) {
                const panSpeed = 1.5;
                panByDelta(ctx, -(e.deltaY * panSpeed), 0);
                updateCanvasTransform(ctx);
                updateMinimap(ctx);
            } else {
                const panSpeed = 1.5;
                panByDelta(ctx, -(e.deltaX * panSpeed), -(e.deltaY * panSpeed));
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
            // Space held, middle-click or Alt+click = pan (ALWAYS, both modes)
            if (e.button === 1 || e.altKey || ctx.spaceHeld) {
                ctx.isDragging = true;
                lastDragX = e.clientX;
                lastDragY = e.clientY;
                ctx.canvasViewport.style.cursor = 'grabbing';
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const insideCard = (e.target as HTMLElement).closest('.file-card') || (e.target as HTMLElement).closest('.file-pill');
            if (insideCard) return;

            // Left click on empty canvas — behavior depends on control mode
            if (e.button === 0) {
                if (ctx.controlMode === 'simple') {
                    // SIMPLE MODE: left-click on empty canvas = pan
                    ctx.isDragging = true;
                    lastDragX = e.clientX;
                    lastDragY = e.clientY;
                    ctx.canvasViewport.style.cursor = 'grabbing';
                    e.preventDefault();
                } else {
                    // ADVANCED MODE: left-click on empty canvas = rect selection
                    if (!e.shiftKey) {
                        ctx.actor.send({ type: 'DESELECT_ALL' });
                        clearSelectionHighlights(ctx);
                    }

                    isRectSelecting = true;
                    const world = screenToWorld(ctx, e.clientX, e.clientY);
                    selRectStartWorldX = world.x;
                    selRectStartWorldY = world.y;

                    selectionRect = document.createElement('div');
                    selectionRect.className = 'selection-rect';
                    selectionRect.style.left = `${selRectStartWorldX}px`;
                    selectionRect.style.top = `${selRectStartWorldY}px`;
                    selectionRect.style.width = '0px';
                    selectionRect.style.height = '0px';
                    ctx.canvas.appendChild(selectionRect);
                    ctx.canvasViewport.style.cursor = 'crosshair';
                }
            }
        });

        // ── Global mousemove (pan + rect select) ──
        window.addEventListener('mousemove', (e) => {
            if (ctx.isDragging) {
                // Delta-based pan via galaxydraw engine
                const dx = e.clientX - lastDragX;
                const dy = e.clientY - lastDragY;
                lastDragX = e.clientX;
                lastDragY = e.clientY;

                panByDelta(ctx, dx, dy);

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
                const world = screenToWorld(ctx, e.clientX, e.clientY);
                const worldX = world.x;
                const worldY = world.y;

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
                        // Highlight DOM cards
                        ctx.fileCards.forEach((card, path) => {
                            const cx = parseFloat(card.style.left) || 0;
                            const cy = parseFloat(card.style.top) || 0;
                            const cw = card.offsetWidth || 580;
                            const ch = card.offsetHeight || 200;
                            const overlaps = cx + cw > rx && cx < rx + rw && cy + ch > ry && cy < ry + rh;
                            card.classList.toggle('selected', overlaps);
                        });
                        // Also highlight pill cards (zoomed out)
                        const pillEls = ctx.canvas?.querySelectorAll('.file-pill') as NodeListOf<HTMLElement>;
                        if (pillEls) {
                            pillEls.forEach(pill => {
                                const cx = parseFloat(pill.style.left) || 0;
                                const cy = parseFloat(pill.style.top) || 0;
                                const cw = parseFloat(pill.style.width) || 580;
                                const ch = parseFloat(pill.style.height) || 700;
                                const overlaps = cx + cw > rx && cx < rx + rw && cy + ch > ry && cy < ry + rh;
                                if (overlaps) {
                                    pill.style.outline = '8px solid rgba(124, 58, 237, 1)';
                                    pill.style.outlineOffset = '6px';
                                    pill.style.filter = 'brightness(1.3)';
                                } else {
                                    pill.style.outline = '';
                                    pill.style.outlineOffset = '';
                                    pill.style.filter = '';
                                }
                            });
                        }
                    });
                }
            }
        });

        // ── Global mouseup (pan + rect select) ──
        window.addEventListener('mouseup', (e) => {
            if (ctx.isDragging) {
                ctx.isDragging = false;
                ctx.canvasViewport.style.cursor = '';
                return;
            }

            if (isRectSelecting) {
                isRectSelecting = false;
                ctx.canvasViewport.style.cursor = '';

                if (selectionRect) {
                    const rx = parseFloat(selectionRect.style.left);
                    const ry = parseFloat(selectionRect.style.top);
                    const rw = parseFloat(selectionRect.style.width);
                    const rh = parseFloat(selectionRect.style.height);

                    const selected: string[] = [];
                    // Check materialized DOM cards
                    ctx.fileCards.forEach((card, path) => {
                        const cx = parseFloat(card.style.left) || 0;
                        const cy = parseFloat(card.style.top) || 0;
                        const cw = card.offsetWidth || 580;
                        const ch = card.offsetHeight || 200;

                        const overlaps = cx + cw > rx && cx < rx + rw && cy + ch > ry && cy < ry + rh;
                        if (overlaps) selected.push(path);
                    });

                    // Also check deferred cards (pill mode / zoomed out)
                    if (ctx.deferredCards) {
                        for (const [path, entry] of ctx.deferredCards) {
                            if (selected.includes(path)) continue;
                            const { x: cx, y: cy, size } = entry;
                            const cw = size?.width || 580;
                            const ch = size?.height || 700;
                            const overlaps = cx + cw > rx && cx < rx + rw && cy + ch > ry && cy < ry + rh;
                            if (overlaps) selected.push(path);
                        }
                    }

                    if (selected.length > 0) {
                        selected.forEach((path, i) => {
                            ctx.actor.send({ type: 'SELECT_CARD', path, shift: i > 0 || e.shiftKey });
                        });
                    } else if (!e.shiftKey) {
                        ctx.actor.send({ type: 'DESELECT_ALL' });
                    }

                    updatePillSelectionHighlights(ctx);
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

        // Restore persisted state — default to open so changed files appear on commit select
        if (panel) {
            const wasClosed = localStorage.getItem('gitcanvas:changedFilesPanelClosed');
            // Default open unless explicitly closed by user
            panel.dataset.manuallyClosed = wasClosed === 'true' ? 'true' : 'false';
            panel.style.display = 'none';
        }

        if (toggleBtn && panel) {
            toggleBtn.addEventListener('click', () => {
                const isVisible = panel.style.display !== 'none';
                panel.style.display = isVisible ? 'none' : 'flex';
                panel.dataset.manuallyClosed = isVisible ? 'true' : 'false';
                localStorage.setItem('gitcanvas:changedFilesPanelClosed', isVisible ? 'true' : 'false');
            });
        }

        if (closeBtn && panel) {
            closeBtn.addEventListener('click', () => {
                panel.style.display = 'none';
                panel.dataset.manuallyClosed = 'true';
                localStorage.setItem('gitcanvas:changedFilesPanelClosed', 'true');
            });
        }
    });
}

function setupConnectionsPanel(ctx: CanvasContext) {
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
        setupConnectionsPanel(ctx);

        // Text rendering mode toggle (Canvas vs DOM)
        const textToggle = document.getElementById('toggleCanvasText');
        if (textToggle) {
            ctx.useCanvasText = localStorage.getItem('gitcanvas:useCanvasText') !== 'false';
            textToggle.classList.toggle('active', ctx.useCanvasText);
            textToggle.addEventListener('click', () => {
                ctx.useCanvasText = !ctx.useCanvasText;
                localStorage.setItem('gitcanvas:useCanvasText', String(ctx.useCanvasText));
                textToggle.classList.toggle('active', ctx.useCanvasText);

                // Re-render currently visible cards
                rerenderCurrentView(ctx);
            });
        }

        // Control mode toggle (Simple vs Advanced)
        const modeToggle = document.getElementById('toggleControlMode');
        if (modeToggle) {
            // Set initial icon based on stored mode
            const updateModeIcon = () => {
                const icon = document.getElementById('controlModeIcon');
                if (!icon) return;
                if (ctx.controlMode === 'simple') {
                    // Hand icon for simple mode
                    icon.innerHTML = '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1M14 7V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v3M10 7V5a2 2 0 0 0-2-2a2 2 0 0 0-2 2v5M6 10V8a2 2 0 0 0-2-2a2 2 0 0 0-2 2v7a7 7 0 0 0 7 7h3a7 7 0 0 0 7-7v-3a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/>';
                    modeToggle.classList.add('active');
                    modeToggle.title = 'Simple mode (drag = pan). Click to switch to Advanced.';
                } else {
                    // Crosshair icon for advanced mode
                    icon.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>';
                    modeToggle.classList.remove('active');
                    modeToggle.title = 'Advanced mode (space+drag = pan). Click to switch to Simple.';
                }
            };
            updateModeIcon();

            modeToggle.addEventListener('click', () => {
                ctx.controlMode = ctx.controlMode === 'simple' ? 'advanced' : 'simple';
                localStorage.setItem('gitcanvas:controlMode', ctx.controlMode);
                updateModeIcon();

                // Update cursor
                if (ctx.canvasViewport) {
                    ctx.canvasViewport.style.cursor = '';
                }

                // Show toast
                import('./utils').then(m => {
                    m.showToast(
                        ctx.controlMode === 'simple'
                            ? 'Simple mode: Drag to pan, scroll to zoom'
                            : 'Advanced mode: Space+drag to pan, Ctrl+scroll to zoom',
                        'info'
                    );
                });
            });
        }

        // Connections visibility toggle
        const connToggle = document.getElementById('toggleConnections');
        if (connToggle) {
            // Default OFF — connections are distracting on first load
            let connectionsVisible = localStorage.getItem('gitcanvas:connectionsVisible') === 'true';
            const svg = document.getElementById('connectionsOverlay') as HTMLElement;
            if (svg && !connectionsVisible) svg.style.display = 'none';
            connToggle.classList.toggle('active', connectionsVisible);
            connToggle.addEventListener('click', () => {
                connectionsVisible = !connectionsVisible;
                if (svg) svg.style.display = connectionsVisible ? '' : 'none';
                // Also toggle marker strips on cards
                document.querySelectorAll('.connection-markers').forEach(el => {
                    (el as HTMLElement).style.display = connectionsVisible ? '' : 'none';
                });
                connToggle.classList.toggle('active', connectionsVisible);
                connToggle.title = connectionsVisible ? 'Hide connection lines' : 'Show connection lines';
                localStorage.setItem('gitcanvas:connectionsVisible', String(connectionsVisible));
            });
        }

        // Auto-detect imports button
        const autoImportsBtn = document.getElementById('autoDetectImports');
        if (autoImportsBtn) {
            autoImportsBtn.addEventListener('click', () => {
                import('./connections').then(m => m.autoDetectImports(ctx));
            });
            // Show button when repo is loaded (observer or direct check)
            const showIfRepo = () => {
                const state = ctx.snap().context;
                if (state.repoPath) autoImportsBtn.style.display = '';
            };
            // Check periodically until repo loads
            const checkInterval = setInterval(() => {
                showIfRepo();
                if (ctx.snap().context.repoPath) clearInterval(checkInterval);
            }, 2000);
        }

        // Dependency graph toggle (button is in layout.tsx toolbar)
        const depBtn = document.getElementById('dep-graph-btn');
        if (depBtn) {
            depBtn.addEventListener('click', () => {
                import('./dependency-graph').then(m => m.toggleDependencyGraph(ctx));
            });
        }
        import('./dependency-graph').then(m => m.setupDependencyGraphShortcut(ctx));

        // Repo dropdown selector
        const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement;
        if (repoSelect) {
            // Populate dropdown from recent repos
            const recentRepos: string[] = JSON.parse(localStorage.getItem('gitcanvas:recentRepos') || '[]');
            // Clear except first placeholder
            while (repoSelect.options.length > 1) repoSelect.remove(1);
            recentRepos.forEach(repo => {
                const opt = document.createElement('option');
                opt.value = repoPath;
                // Show short name (last folder part) + full path
                const shortName = repo.replace(/\\/g, '/').split('/').filter(Boolean).pop() || repoPath;
                opt.textContent = shortName;
                opt.title = repoPath;
                repoSelect.add(opt);
            });
            // "Open new repo..." option at the end
            const newOpt = document.createElement('option');
            newOpt.value = '__new__';
            newOpt.textContent = '＋ Open new repo...';
            repoSelect.add(newOpt);

            // Set initial value from hash — otherwise keep placeholder
            const hashPath = decodeURIComponent(location.hash.slice(1));
            if (hashPath && recentRepos.includes(hashPath)) {
                repoSelect.value = hashPath;
            } else if (!hashPath) {
                repoSelect.value = '';  // Keep "Select a repository..." shown
            }

            // ── Also discover on-disk repos that may not be in localStorage ──
            fetch('/api/repo/list').then(r => r.json()).then((data: any) => {
                if (!data.repos || data.repos.length === 0) return;
                const currentPaths = new Set(recentRepos);
                let added = false;
                for (const repo of data.repos) {
                    if (!currentPaths.has(repo.path)) {
                        // Add to localStorage recent repos
                        _addRecentRepo(repo.path);
                        // Add to dropdown (before the __new__ option)
                        const opt = document.createElement('option');
                        opt.value = repo.path;
                        opt.textContent = repo.name;
                        opt.title = repo.path;
                        const newOpt2 = repoSelect.querySelector('option[value="__new__"]');
                        if (newOpt2) {
                            repoSelect.insertBefore(opt, newOpt2);
                        } else {
                            repoSelect.add(opt);
                        }
                        added = true;
                    }
                }
            }).catch(() => { });

            repoSelect.addEventListener('change', async () => {
                const val = repoSelect.value;
                if (val === '__new__') {
                    // Ask the user via native browser prompt instead of buggy OS-level popup
                    const path = window.prompt('Enter the absolute path to your Git repository\n\nExample: C:\\Code\\my-project', '');
                    if (path && path.trim()) {
                        const cleanPath = path.trim();
                        _addRecentRepo(cleanPath);
                        loadRepository(ctx, cleanPath);
                        // Re-populate dropdown options
                        const updatedRepos: string[] = JSON.parse(localStorage.getItem('gitcanvas:recentRepos') || '[]');
                        while (repoSelect.options.length > 1) repoSelect.remove(1);
                        updatedRepos.forEach((repo: any) => {
        const repoPath = typeof repo === "string" ? repo : repo.path || "";
        if (!repoPath) return;
                            const opt = document.createElement('option');
                            opt.value = repoPath;
                            opt.textContent = repoPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || repoPath;
                            opt.title = repoPath;
                            repoSelect.add(opt);
                        });
                        const newOptRefresh = document.createElement('option');
                        newOptRefresh.value = '__new__';
                        newOptRefresh.textContent = '＋ Open new repo...';
                        newOptRefresh.id = 'optNewLocal';
                        repoSelect.add(newOptRefresh);
                        repoSelect.value = cleanPath;
                    } else {
                        // Reset selection
                        repoSelect.value = '';
                    }
                } else if (val) {
                    loadRepository(ctx, val);
                }
            });

            // ── Mode detection: hide local-only options in SaaS mode ──
            fetch('/api/repo/mode').then(r => r.json()).then((modeData: any) => {
                if (modeData.mode === 'saas') {
                    // Hide the "Open new repo..." local path option
                    const localOpt = repoSelect.querySelector('option[value="__new__"]');
                    if (localOpt) (localOpt as HTMLElement).style.display = 'none';
                }
            }).catch(() => { });
        }

        // ── Featured repo cards on landing page ──
        document.querySelectorAll('.repo-card-btn[data-repo]').forEach(btn => {
            btn.addEventListener('click', () => {
                const repoUrl = (btn as HTMLElement).dataset.repo;
                if (repoUrl) {
                    _triggerClone(ctx, repoUrl);
                }
            });
        });

        // Zoom slider
        document.getElementById('zoomSlider')?.addEventListener('input', (e) => {
            ctx.actor.send({ type: 'SET_ZOOM', zoom: parseFloat((e.target as HTMLInputElement).value) });
            updateCanvasTransform(ctx);
            updateZoomUI(ctx);
        });

        // ── Sticky Zoom Pill controls ──
        document.getElementById('stickyZoomSlider')?.addEventListener('input', (e) => {
            ctx.actor.send({ type: 'SET_ZOOM', zoom: parseFloat((e.target as HTMLInputElement).value) });
            updateCanvasTransform(ctx);
            updateZoomUI(ctx);
        });

        document.getElementById('stickyZoomOut')?.addEventListener('click', () => {
            const state = ctx.snap().context;
            const newZoom = Math.max(0.1, state.zoom - 0.1);
            ctx.actor.send({ type: 'SET_ZOOM', zoom: newZoom });
            updateCanvasTransform(ctx);
            updateZoomUI(ctx);
        });

        document.getElementById('stickyZoomIn')?.addEventListener('click', () => {
            const state = ctx.snap().context;
            const newZoom = Math.min(3, state.zoom + 0.1);
            ctx.actor.send({ type: 'SET_ZOOM', zoom: newZoom });
            updateCanvasTransform(ctx);
            updateZoomUI(ctx);
        });

        document.getElementById('stickyFitAll')?.addEventListener('click', () => fitAllFiles(ctx));

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
        document.getElementById('arrangeExpand')?.addEventListener('click', () => {
            const selected = ctx.snap().context.selectedCards;
            if (selected.length > 0) toggleCardExpand(ctx);
        });
        document.getElementById('arrangeFit')?.addEventListener('click', () => {
            const selected = ctx.snap().context.selectedCards;
            if (selected.length > 0) fitScreenSize(ctx);
        });
        document.getElementById('arrangeAI')?.addEventListener('click', () => {
            const selected = ctx.snap().context.selectedCards;
            if (selected.length > 0) toggleCanvasChat(ctx);
        });

        // Close preview
        document.getElementById('closePreview')?.addEventListener('click', closePreview);
        document.querySelector('.modal-backdrop')?.addEventListener('click', closePreview);


        // AI chat toggle
        document.getElementById('toggleCanvasChat')?.addEventListener('click', () => toggleCanvasChat(ctx));

        // Replayable onboarding
        document.getElementById('helpOnboarding')?.addEventListener('click', () => {
            import('./onboarding').then(m => m.startOnboarding(ctx));
        });

        // Share Layout
        document.getElementById('shareLayout')?.addEventListener('click', () => {
            measure('share:layout', () => {
                const state = ctx.snap();
                if (!state.context.repoPath) {
                    showToast('Load a repository first to share its layout.', 'error');
                    return;
                }
                const layoutData = {
                    positions: Object.fromEntries(ctx.positions),
                    hiddenFiles: Array.from(ctx.hiddenFiles),
                    zoom: state.context.zoom,
                    offsetX: state.context.offsetX,
                    offsetY: state.context.offsetY,
                    cardSizes: state.context.cardSizes,
                };
                const encoded = btoa(JSON.stringify(layoutData));
                const url = new URL(window.location.href);
                // Strip existing layout param if any
                url.searchParams.set('layout', encoded);

                navigator.clipboard.writeText(url.toString()).then(() => {
                    showToast('Layout link copied to clipboard!', 'success');
                }).catch(() => {
                    showToast('Failed to copy to clipboard', 'error');
                });
            });
        });

        // Settings modal
        document.getElementById('openSettings')?.addEventListener('click', () => {
            import('./settings-modal').then(({ openSettingsModal }) => openSettingsModal(ctx));
        });

        // Global search
        document.getElementById('openGlobalSearch')?.addEventListener('click', () => {
            import('./global-search').then(({ toggleGlobalSearch }) => toggleGlobalSearch(ctx));
        });

        // Branch comparison
        document.getElementById('openBranchCompare')?.addEventListener('click', () => {
            import('./branch-compare').then(({ toggleDrawer }) => toggleDrawer(ctx));
        });

        // Apply saved settings on startup
        import('./settings-modal').then(({ applyAllSettings }) => applyAllSettings(ctx));

        // Clean up expired auto-save drafts
        import('./auto-save').then(({ cleanExpiredDrafts }) => cleanExpiredDrafts());

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
                updatePillSelectionHighlights(ctx);
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
                if (selected.length >= 2) {
                    e.preventDefault(); arrangeRow(ctx);
                } else if (selected.length === 0) {
                    // Toggle git heatmap overlay
                    e.preventDefault();
                    const repoPath = ctx.snap().context.repoPath;
                    if (repoPath) {
                        import('./heatmap').then(async ({ toggleHeatmap, injectHeatmapCSS }) => {
                            injectHeatmapCSS();
                            const active = await toggleHeatmap(repoPath);
                            import('./settings').then(({ updateSettings }) => updateSettings({ heatmapEnabled: active }));
                            import('./utils').then(m => m.showToast(
                                active ? '🔥 Heatmap ON — hot files glow red' : 'Heatmap OFF',
                                'info'
                            ));
                        });
                    }
                }
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
                // Also select deferred cards (pill mode at low zoom)
                if (ctx.deferredCards) {
                    for (const [path] of ctx.deferredCards) {
                        ctx.actor.send({ type: 'SELECT_CARD', path, shift: true });
                    }
                }
                updatePillSelectionHighlights(ctx);
                updateArrangeToolbar(ctx);
            }

            // F key: no longer used for expand (canvas text handles all lines)

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

            // Removed: I key AI chat toggle (conflicts with typing, not useful in production)

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

            // Ctrl+F = Global search sidebar
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                import('./global-search').then(m => m.toggleGlobalSearch(ctx));
                return;
            }

            // Ctrl+O or Ctrl+K or Ctrl+P = File search / command palette
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key.toLowerCase() === 'o' || e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'p')) {
                e.preventDefault();
                openFileSearch(ctx);
                return;
            }

            // Ctrl+Shift+E = Export canvas as PNG
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
                e.preventDefault();
                exportCanvasAsPNG(ctx);
            }

            // Ctrl+Shift+V = Export viewport as PNG
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
                e.preventDefault();
                exportViewportAsPNG(ctx);
            }

            // Ctrl+N = Create new file
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                import('./new-file-dialog').then(m => m.showNewFileDialog(ctx));
            }

            // Ctrl+Shift+F removed — Ctrl+F now opens global search directly
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

        // GitHub Import Modal
        setupGithubImport(ctx);

        // Minimap click navigation
        setupMinimapClick(ctx);

        // Local Directory Drag-and-Drop
        setupDragAndDrop(ctx);

        // Collaborative cursor sharing (WebSocket)
        import('./cursor-sharing').then(({ initCursorSharing }) => initCursorSharing(ctx));
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

    interface SearchMatch {
        path: string;
        line?: number;
        snippet?: string;
        isContentMatch: boolean;
    }

    function getAllFiles() {
        if (ctx.allFilesData && ctx.allFilesData.length > 0) {
            return ctx.allFilesData;
        }
        return [];
    }

    let selectedIdx = 0;
    let currentQuery = '';

    function navigateToFile(match: SearchMatch) {
        const mgr = getCardManager();
        const activeCard = mgr?.cards.get(match.path);
        const deferredCard = mgr?.deferred.get(match.path);

        if (!activeCard && !deferredCard) {
            const layer = getActiveLayer();
            if (layer && ctx.allFilesActive) {
                // Instantly add the whole file to the active layer
                addSectionToLayer(ctx, layer.id, match.path, '', '');

                // Wait for the active layer to apply/render then jump
                setTimeout(() => {
                    const card = ctx.fileCards.get(match.path);
                    if (card) {
                        close();
                        doNavigate(match.path, card, match.line);
                    }
                }, 50);
            } else if (!ctx.allFilesActive) {
                showToast("File was not modified in the current view.", 'info');
            }
            return;
        }

        close();

        // If active, use its DOM element. If deferred, use its stored coordinates.
        if (activeCard) {
            doNavigate(match.path, activeCard, match.line);
        } else if (deferredCard) {
            doNavigateDeferred(match.path, deferredCard, match.line);
        }
    }

    function doNavigateDeferred(path: string, deferredCard: any, line?: number) {
        const vpRect = ctx.canvasViewport.getBoundingClientRect();
        const state = ctx.snap().context;
        const newOffsetX = -(deferredCard.x + deferredCard.width / 2) * state.zoom + vpRect.width / 2;
        const newOffsetY = -(deferredCard.y + deferredCard.height / 2) * state.zoom + vpRect.height / 2;

        ctx.actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
        updateCanvasTransform(ctx); // This triggers CardManager.materializeInRect()

        // Wait a frame for materialization to hit DOM
        requestAnimationFrame(() => {
            const materializedCard = getCardManager()?.cards.get(path);
            if (materializedCard) {
                _animateAndSelectCard(path, materializedCard, line);
            }
        });
    }

    function doNavigate(path: string, card: HTMLElement, line?: number) {
        const vpRect = ctx.canvasViewport.getBoundingClientRect();
        const state = ctx.snap().context;
        const cardX = parseFloat(card.style.left) || 0;
        const cardY = parseFloat(card.style.top) || 0;
        const newOffsetX = -(cardX + card.offsetWidth / 2) * state.zoom + vpRect.width / 2;
        const newOffsetY = -(cardY + card.offsetHeight / 2) * state.zoom + vpRect.height / 2;

        ctx.actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
        updateCanvasTransform(ctx);

        _animateAndSelectCard(path, card, line);
    }

    function _animateAndSelectCard(path: string, card: HTMLElement, line?: number) {
        card.classList.add('card-flash');
        setTimeout(() => card.classList.remove('card-flash'), 1500);
        ctx.actor.send({ type: 'SELECT_CARD', path, shift: false });
        updatePillSelectionHighlights(ctx);
        updateArrangeToolbar(ctx);

        if (line) {
            requestAnimationFrame(() => {
                const body = card.querySelector('.file-card-body');
                if (body) {
                    const rowHeight = 20; // approximate row height
                    body.scrollTop = (line - 1) * rowHeight - body.clientHeight / 2;
                }
            });
        }
    }

    function close() {
        render(null, overlay);
        overlay.remove();
    }

    function highlightMatch(text: string, q: string): string {
        if (!q) return escapeHtml(text);
        const lowText = text.toLowerCase();
        q = q.toLowerCase();

        const exactIdx = lowText.indexOf(q);
        if (exactIdx >= 0) {
            return escapeHtml(text.substring(0, exactIdx)) +
                '<mark>' + escapeHtml(text.substring(exactIdx, exactIdx + q.length)) + '</mark>' +
                escapeHtml(text.substring(exactIdx + q.length));
        }

        let qIdx = 0;
        let result = '';
        for (let i = 0; i < text.length; i++) {
            if (qIdx < q.length && lowText[i] === q[qIdx]) {
                result += '<mark>' + escapeHtml(text[i]) + '</mark>';
                qIdx++;
            } else {
                result += escapeHtml(text[i]);
            }
        }
        return result;
    }

    function fuzzyScore(str: string, query: string): number {
        const strictIdx = str.toLowerCase().indexOf(query);
        if (strictIdx >= 0) return 1000 - strictIdx; // Exact matches are highly ranked

        let qIdx = 0;
        let sIdx = 0;
        let score = 0;
        let streak = 0;
        const lowStr = str.toLowerCase();

        while (sIdx < lowStr.length && qIdx < query.length) {
            if (lowStr[sIdx] === query[qIdx]) {
                score += 1 + (streak * 2);
                streak++;
                qIdx++;
            } else {
                streak = 0;
            }
            sIdx++;
        }

        return qIdx === query.length ? score : -Infinity;
    }

    function getMatches(): SearchMatch[] {
        const files = getAllFiles();
        const q = currentQuery.toLowerCase().trim();

        let pathOnlySearch = false; // By default search both
        if (q.startsWith('f:')) {
            pathOnlySearch = true;
        }

        const actualQuery = q.replace(/^f:/, '').trim();
        if (!actualQuery) {
            // Return top files randomly if no query yet
            return files.slice(0, 15).map(f => ({ path: f.path, isContentMatch: false }));
        }

        const rawResults: { match: SearchMatch, score: number }[] = [];
        let itemsScanned = 0;

        for (const f of files) {
            if (itemsScanned > 5000) break; // Prevent deep-stall on massive repos

            // Path match check
            const pathScore = fuzzyScore(f.path, actualQuery);
            if (pathScore > -Infinity) {
                rawResults.push({ match: { path: f.path, isContentMatch: false }, score: pathScore + 500 }); // Bonus for path
            }
            itemsScanned++;

            // Content match check
            if (!pathOnlySearch && f.content) {
                const lines = f.content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const lineScore = fuzzyScore(lines[i], actualQuery);
                    if (lineScore > -Infinity) {
                        rawResults.push({
                            match: {
                                path: f.path,
                                line: i + 1,
                                snippet: lines[i].trim().substring(0, 100), // Max 100 chars in preview
                                isContentMatch: true
                            },
                            score: lineScore
                        });
                        itemsScanned++;
                        if (rawResults.length > 500) break; // Hard limit pool
                    }
                }
            }
        }

        // Sort by score descending and return top 15
        rawResults.sort((a, b) => b.score - a.score);
        return rawResults.slice(0, 15).map(r => r.match);
    }

    function handleKeydown(e: KeyboardEvent) {
        const matches = getMatches();
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIdx = Math.min(selectedIdx + 1, matches.length - 1);
            rerenderResults();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIdx = Math.max(selectedIdx - 1, 0);
            rerenderResults();
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

    // Build the container with a stable input + a results div that gets re-rendered
    const container = document.createElement('div');
    container.className = 'file-search-container';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'file-search-input';
    input.placeholder = 'Search paths (f:) or full text...';
    input.autocomplete = 'off';
    input.addEventListener('input', (e) => {
        currentQuery = (e.target as HTMLInputElement).value;
        selectedIdx = 0;
        rerenderResults();
    });
    input.addEventListener('keydown', handleKeydown);
    container.appendChild(input);

    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'file-search-results';
    container.appendChild(resultsContainer);
    overlay.appendChild(container);

    function rerenderResults() {
        const matches = getMatches();
        const q = currentQuery.replace(/^f:/, '').toLowerCase().trim();
        if (matches.length === 0 && q) {
            resultsContainer.innerHTML = `<div class="file-search-empty">No results for "${escapeHtml(q)}"</div>`;
        } else {
            resultsContainer.innerHTML = matches.map((m, i) => {
                if (m.isContentMatch) {
                    return `
                        <div class="file-search-item ${i === selectedIdx ? 'selected' : ''}" data-path="${escapeHtml(m.path)}" data-line="${m.line}">
                            <div class="search-file-name" style="font-size: 0.75rem; color: var(--text-muted)">${escapeHtml(m.path)}:${m.line}</div>
                            <div class="search-file-snippet">${highlightMatch(m.snippet || '', q)}</div>
                        </div>`;
                } else {
                    return `
                        <div class="file-search-item ${i === selectedIdx ? 'selected' : ''}" data-path="${escapeHtml(m.path)}">
                            <span class="search-file-name">${highlightMatch(m.path, q)}</span>
                        </div>`;
                }
            }).join('');
            // Attach click handlers
            resultsContainer.querySelectorAll('.file-search-item').forEach(el => {
                el.addEventListener('click', () => {
                    const path = (el as HTMLElement).dataset.path!;
                    const line = (el as HTMLElement).dataset.line ? parseInt((el as HTMLElement).dataset.line!) : undefined;
                    navigateToFile({ path, line, isContentMatch: !!line });
                });
            });
        }

        // Scroll selected into view securely
        const selectedEl = resultsContainer.querySelector('.file-search-item.selected');
        if (selectedEl) {
            selectedEl.scrollIntoView({ block: 'nearest' });
        }
    }

    rerenderResults();
    setTimeout(() => input.focus(), 50);

    overlay.addEventListener('click', handleOverlayClick);
    requestAnimationFrame(() => {
        const input = overlay.querySelector('.file-search-input') as HTMLInputElement;
        if (input) input.focus();
    });
}

// ─── Language color map ─────────────────────────────────
const LANG_COLORS: Record<string, string> = {
    TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
    Rust: '#dea584', Go: '#00ADD8', Java: '#b07219', C: '#555555',
    'C++': '#f34b7d', 'C#': '#178600', Ruby: '#701516', PHP: '#4F5D95',
    Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB', Lua: '#000080',
    Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883',
    Svelte: '#ff3e00', Zig: '#ec915c', Elixir: '#6e4a7e', Haskell: '#5e5086',
    Scala: '#c22d40', OCaml: '#3be133', Nix: '#7e7eff',
};

// ─── GitHub Import Modal Handler ────────────────────────
function setupGithubImport(ctx: CanvasContext) {
    const modal = document.getElementById('githubModal');
    const openBtn = document.getElementById('githubImportBtn');
    const closeBtn = document.getElementById('githubModalClose');
    const backdrop = modal?.querySelector('.github-modal-backdrop');
    const searchBtn = document.getElementById('githubSearchBtn');
    const userInput = document.getElementById('githubUserInput') as HTMLInputElement;
    const sortSelect = document.getElementById('githubSortSelect') as HTMLSelectElement;
    const grid = document.getElementById('githubReposGrid');
    const profileDiv = document.getElementById('githubProfile');
    const pagination = document.getElementById('githubPagination');
    const prevBtn = document.getElementById('githubPrevPage') as HTMLButtonElement;
    const nextBtn = document.getElementById('githubNextPage') as HTMLButtonElement;
    const pageInfo = document.getElementById('githubPageInfo');
    const urlCloneRow = document.getElementById('githubUrlCloneRow');
    const urlCloneBtn = document.getElementById('githubUrlCloneBtn');
    const detectedUrlSpan = document.getElementById('githubDetectedUrl');
    const filterRow = document.getElementById('githubFilterRow');
    const filterInput = document.getElementById('githubRepoFilter') as HTMLInputElement;

    if (!modal || !openBtn || !grid) return;

    let currentPage = 1;
    let currentUser = '';
    let isLoading = false;
    let allRenderedCards: HTMLElement[] = [];

    // ── URL detection ──
    const GITHUB_URL_RE = /^https?:\/\/(www\.)?github\.com\/[^/]+\/[^/]+/;
    function extractRepoUrl(text: string): string | null {
        const match = text.trim().match(GITHUB_URL_RE);
        return match ? match[0].replace(/\.git$/, '') + '.git' : null;
    }
    function extractUserFromUrl(text: string): string | null {
        const m = text.trim().match(/github\.com\/([^/]+)/);
        return m ? m[1] : null;
    }

    function updateUrlDetection() {
        const val = userInput?.value.trim() || '';
        const url = extractRepoUrl(val);
        if (url && urlCloneRow && detectedUrlSpan) {
            // URL detected — show clone row, extract repo name
            const parts = url.replace('.git', '').split('/');
            const repoName = parts.slice(-2).join('/');
            detectedUrlSpan.textContent = repoName;
            urlCloneRow.style.display = 'flex';
        } else if (urlCloneRow) {
            urlCloneRow.style.display = 'none';
        }
    }

    userInput?.addEventListener('input', updateUrlDetection);

    function openModal() {
        modal!.classList.add('active');
        requestAnimationFrame(() => userInput?.focus());
    }

    function closeModal() {
        modal!.classList.remove('active');
    }

    openBtn.addEventListener('click', openModal);
    closeBtn?.addEventListener('click', closeModal);
    backdrop?.addEventListener('click', closeModal);
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal!.classList.contains('active')) closeModal();
    });

    // ── Direct URL clone from modal ──
    urlCloneBtn?.addEventListener('click', () => {
        const url = extractRepoUrl(userInput?.value.trim() || '');
        if (url) {
            closeModal();
            _triggerClone(ctx, url);
        }
    });

    // ── Repo name filter ──
    filterInput?.addEventListener('input', () => {
        const q = filterInput.value.trim().toLowerCase();
        for (const card of allRenderedCards) {
            const name = (card.dataset.name || '').toLowerCase();
            const desc = card.querySelector('.github-repo-desc')?.textContent?.toLowerCase() || '';
            card.style.display = (name.includes(q) || desc.includes(q)) ? '' : 'none';
        }
    });

    async function searchRepos(page = 1) {
        let user = userInput?.value.trim();
        if (!user || isLoading) return;

        // If it's a URL, extract the username/org from it
        const urlUser = extractUserFromUrl(user);
        if (urlUser) user = urlUser;

        isLoading = true;
        currentUser = user;
        currentPage = page;
        const sort = sortSelect?.value || 'updated';

        // Save last searched user
        localStorage.setItem('gitcanvas:lastGithubUser', user);

        grid!.innerHTML = `
            <div class="github-loading">
                <div class="github-spinner"></div>
                <p>Fetching repos for <strong>${escapeHtml(user)}</strong>...</p>
            </div>
        `;
        if (pagination) pagination.style.display = 'none';
        if (filterRow) filterRow.style.display = 'none';
        if (filterInput) filterInput.value = '';
        allRenderedCards = [];

        try {
            const res = await fetch(`/api/github/repos?user=${encodeURIComponent(user)}&page=${page}&sort=${sort}`);
            const data = await res.json();

            if (!res.ok || data.error) {
                grid!.innerHTML = `<div class="github-error">${escapeHtml(data.error || 'Failed to fetch')}</div>`;
                isLoading = false;
                return;
            }

            // Render profile
            if (data.profile && profileDiv) {
                profileDiv.style.display = 'flex';
                profileDiv.innerHTML = `
                    <img class="github-avatar" src="${data.profile.avatar_url}" alt="${escapeHtml(data.profile.login)}" />
                    <div class="github-profile-info">
                        <strong>${escapeHtml(data.profile.name || data.profile.login)}</strong>
                        <span class="github-profile-meta">
                            @${escapeHtml(data.profile.login)} &middot; ${data.profile.public_repos} repos
                            ${data.profile.type === 'Organization' ? ' &middot; Organization' : ''}
                        </span>
                        ${data.profile.bio ? `<span class="github-profile-bio">${escapeHtml(data.profile.bio)}</span>` : ''}
                    </div>
                `;
            }

            // Render repos
            if (data.repos.length === 0) {
                grid!.innerHTML = `<div class="github-empty-state"><p>No repositories found for "${escapeHtml(user)}"</p></div>`;
            } else {
                // Show filter row when there are results
                if (filterRow) filterRow.style.display = 'flex';

                grid!.innerHTML = data.repos.map((repo: any) => {
                    const langColor = LANG_COLORS[repo.language] || '#8b8b8b';
                    const sizeStr = repo.size > 1024 ? `${(repo.size / 1024).toFixed(1)} MB` : `${repo.size} KB`;
                    const updatedDate = new Date(repo.updated_at);
                    const timeAgo = _timeAgo(updatedDate);

                    return `
                        <div class="github-repo-card" data-clone-url="${escapeHtml(repo.clone_url)}" data-name="${escapeHtml(repo.name)}">
                            <div class="github-repo-header">
                                <span class="github-repo-name">${escapeHtml(repo.name)}</span>
                                ${repo.stars > 0 ? `<span class="github-repo-stars">\u2b50 ${repo.stars}</span>` : ''}
                            </div>
                            ${repo.description ? `<p class="github-repo-desc">${escapeHtml(repo.description.length > 120 ? repo.description.slice(0, 117) + '...' : repo.description)}</p>` : '<p class="github-repo-desc" style="opacity:0.3">No description</p>'}
                            <div class="github-repo-meta">
                                ${repo.language ? `<span class="github-repo-lang"><span class="lang-dot" style="background:${langColor}"></span>${escapeHtml(repo.language)}</span>` : ''}
                                <span class="github-repo-size">${sizeStr}</span>
                                <span class="github-repo-updated">${timeAgo}</span>
                            </div>
                            <button class="github-clone-btn" data-url="${escapeHtml(repo.clone_url)}">Clone &amp; Open</button>
                        </div>
                    `;
                }).join('');

                // Track rendered cards for filtering
                allRenderedCards = Array.from(grid!.querySelectorAll('.github-repo-card')) as HTMLElement[];

                // Attach clone handlers
                grid!.querySelectorAll('.github-clone-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const url = (btn as HTMLElement).dataset.url!;
                        closeModal();
                        _triggerClone(ctx, url);
                    });
                });

                // Click on card opens GitHub page
                grid!.querySelectorAll('.github-repo-card').forEach(card => {
                    card.addEventListener('click', (e) => {
                        if ((e.target as HTMLElement).closest('.github-clone-btn')) return;
                        const name = (card as HTMLElement).dataset.name;
                        window.open(`https://github.com/${currentUser}/${name}`, '_blank');
                    });
                });
            }

            // Pagination
            if (data.hasNext || data.hasPrev) {
                if (pagination) pagination.style.display = 'flex';
                if (prevBtn) prevBtn.disabled = !data.hasPrev;
                if (nextBtn) nextBtn.disabled = !data.hasNext;
                if (pageInfo) pageInfo.textContent = `Page ${data.page}`;
            } else {
                if (pagination) pagination.style.display = 'none';
            }

        } catch (err: any) {
            grid!.innerHTML = `<div class="github-error">Network error: ${escapeHtml(err.message)}</div>`;
        } finally {
            isLoading = false;
        }
    }

    searchBtn?.addEventListener('click', () => searchRepos(1));
    userInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            // If URL detected, clone directly on Enter
            const url = extractRepoUrl(userInput.value.trim());
            if (url) {
                closeModal();
                _triggerClone(ctx, url);
            } else {
                searchRepos(1);
            }
        }
    });
    sortSelect?.addEventListener('change', () => {
        if (currentUser) searchRepos(1);
    });
    prevBtn?.addEventListener('click', () => searchRepos(currentPage - 1));
    nextBtn?.addEventListener('click', () => searchRepos(currentPage + 1));

    // Load last searched user from localStorage
    const lastUser = localStorage.getItem('gitcanvas:lastGithubUser');
    if (lastUser && userInput) userInput.value = lastUser;
}

// ─── Trigger clone (self-contained, uses clone-stream API) ──
function _triggerClone(ctx: CanvasContext, url: string) {
    const cloneStatus = document.getElementById('cloneStatus');
    if (!cloneStatus) return;

    cloneStatus.style.display = 'block';
    cloneStatus.className = 'clone-status cloning';
    cloneStatus.innerHTML = `
        <div class="clone-progress-text">⏳ Cloning...</div>
        <div class="clone-progress-bar"><div class="clone-progress-fill" style="width: 0%"></div></div>
    `;

    const progressText = cloneStatus.querySelector('.clone-progress-text') as HTMLElement;
    const progressFill = cloneStatus.querySelector('.clone-progress-fill') as HTMLElement;

    fetch('/api/repo/clone-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
    }).then(async (res) => {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = await res.json();
            if (!res.ok || data.error) {
                cloneStatus.className = 'clone-status error';
                cloneStatus.textContent = '❌ ' + (data.error || 'Clone failed');
                setTimeout(() => { cloneStatus.style.display = 'none'; }, 5000);
                return;
            }
            // Cached
            cloneStatus.className = 'clone-status success';
            cloneStatus.textContent = '✅ Updated — loading...';
            _addRecentRepo(data.path);
            _refreshRepoDropdown();
            const repoSel = document.getElementById('repoSelect') as HTMLSelectElement;
            if (repoSel) repoSel.value = data.path;
            loadRepository(ctx, data.path);
            setTimeout(() => { cloneStatus.style.display = 'none'; }, 3000);
            return;
        }

        // SSE stream
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';
            for (const evt of events) {
                if (!evt.trim()) continue;
                const eventMatch = evt.match(/^event:\s*(.+)/m);
                const dataMatch = evt.match(/^data:\s*(.+)/m);
                if (!dataMatch) continue;
                try {
                    const payload = JSON.parse(dataMatch[1]);
                    const evtType = eventMatch?.[1] || 'progress';
                    if (evtType === 'progress' && progressText && progressFill) {
                        progressText.textContent = `⏳ ${payload.message || 'Cloning...'}`;
                        if (payload.percent != null) progressFill.style.width = `${payload.percent}%`;
                    } else if (evtType === 'done') {
                        cloneStatus.className = 'clone-status success';
                        cloneStatus.textContent = '✅ Cloned — loading...';
                        _addRecentRepo(payload.path);
                        _refreshRepoDropdown();
                        const repoSel2 = document.getElementById('repoSelect') as HTMLSelectElement;
                        if (repoSel2) repoSel2.value = payload.path;
                        loadRepository(ctx, payload.path);
                        setTimeout(() => { cloneStatus.style.display = 'none'; }, 3000);
                    } else if (evtType === 'error') {
                        cloneStatus.className = 'clone-status error';
                        cloneStatus.textContent = '❌ ' + (payload.error || 'Clone failed');
                        setTimeout(() => { cloneStatus.style.display = 'none'; }, 5000);
                    }
                } catch { /* skip unparseable */ }
            }
        }
    }).catch(err => {
        cloneStatus.className = 'clone-status error';
        cloneStatus.textContent = '❌ ' + err.message;
        setTimeout(() => { cloneStatus.style.display = 'none'; }, 5000);
    });
}

// ─── Time ago helper ────────────────────────────────────
function _timeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
}

// ─── Local Directory Drag and Drop ──────────────────────
function setupDragAndDrop(ctx: CanvasContext) {
    window.addEventListener('dragover', (e) => {
        // Allow dropping if we drag over canvas/viewport
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
        }
    });

    window.addEventListener('drop', async (e) => {
        e.preventDefault();

        if (!e.dataTransfer || !e.dataTransfer.items) return;
        const items = e.dataTransfer.items;

        const filesToUpload: File[] = [];

        // Helper to recursively read directory contents
        async function readEntry(entry: any, path = '') {
            if (entry.isFile) {
                const file: any = await new Promise(resolve => entry.file(resolve));
                // Ignore heavy directories
                if (!path.includes('node_modules/') && !path.includes('.git/') && !path.includes('.bun/')) {
                    file.fullPath = path + entry.name;
                    filesToUpload.push(file);
                }
            } else if (entry.isDirectory) {
                if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.bun') return;
                const dirReader = entry.createReader();
                const entries: any[] = await new Promise(resolve => {
                    const results: any[] = [];
                    const readNext = () => {
                        dirReader.readEntries((ent: any[]) => {
                            if (ent.length === 0) resolve(results);
                            else { results.push(...ent); readNext(); }
                        });
                    };
                    readNext();
                });
                for (const ent of entries) {
                    await readEntry(ent, path + entry.name + '/');
                }
            }
        }

        // Display a loading indication
        const cloneStatus = document.getElementById('cloneStatus');
        const cloneInput = document.getElementById('cloneUrlInput') as HTMLInputElement;
        if (cloneStatus) {
            cloneStatus.style.display = 'block';
            cloneStatus.className = 'clone-status cloning';
            cloneStatus.innerHTML = `
                <div class="clone-progress-text">⏳ Reading dropped files...</div>
                <div class="clone-progress-bar"><div class="clone-progress-fill" style="width: 50%"></div></div>
            `;
        }

        try {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === 'file') {
                    const entry = item.webkitGetAsEntry();
                    if (entry) await readEntry(entry);
                }
            }

            if (filesToUpload.length === 0) {
                if (cloneStatus) {
                    cloneStatus.className = 'clone-status error';
                    cloneStatus.textContent = '❌ No valid files found in drop';
                    setTimeout(() => cloneStatus.style.display = 'none', 3000);
                }
                return;
            }

            if (cloneStatus) {
                const progressText = cloneStatus.querySelector('.clone-progress-text');
                if (progressText) progressText.textContent = `⏳ Uploading ${filesToUpload.length} files...`;
            }

            const formData = new FormData();
            filesToUpload.forEach(f => {
                formData.append('files', f, (f as any).fullPath);
            });

            const res = await fetch('/api/repo/upload', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            if (!res.ok || data.error) {
                throw new Error(data.error || 'Upload failed');
            }

            if (cloneStatus) {
                cloneStatus.className = 'clone-status success';
                cloneStatus.textContent = '✅ Upload complete — loading...';
                if (cloneInput) cloneInput.value = '';

                // Add to recent repos dropdown and load it
                const repoPath = data.path;
                _addRecentRepo(repoPath);
                _refreshRepoDropdown();
                const repoSel = document.getElementById('repoSelect') as HTMLSelectElement;
                if (repoSel) repoSel.value = repoPath;
                import('./repo').then(m => m.loadRepository(ctx, repoPath));

                setTimeout(() => cloneStatus.style.display = 'none', 3000);
            }

        } catch (err: any) {
            if (cloneStatus) {
                cloneStatus.className = 'clone-status error';
                cloneStatus.textContent = '❌ ' + (err.message || 'Error processing drop');
                setTimeout(() => cloneStatus.style.display = 'none', 5000);
            }
        }
    });
}

