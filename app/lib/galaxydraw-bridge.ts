// @ts-nocheck
/**
 * GalaxyDraw Bridge — Adapter between GitMaps and the galaxydraw engine.
 *
 * Wires galaxydraw's CanvasState + CardManager into the existing
 * server-rendered DOM and XState persistence layer.
 *
 * Architecture:
 * - CanvasState manages zoom/pan/transform (replaces manual math)
 * - CardManager creates/defers cards via FileCardPlugin + DiffCardPlugin
 * - XState actor remains source-of-truth for persistence
 * - Server-rendered DOM (#canvasViewport, #canvasContent) stays intact
 */

import { CanvasState } from '../../packages/galaxydraw/src/core/state';
import { CardManager } from '../../packages/galaxydraw/src/core/cards';
import { EventBus } from '../../packages/galaxydraw/src/core/events';
import { createFileCardPlugin, createDiffCardPlugin } from './file-card-plugin';
import type { CanvasContext } from './context';

/** 
 * Shared galaxydraw state instance.
 * Replaces manual `ctx.canvas.style.transform = ...` calls.
 */
let _gdState: CanvasState | null = null;
let _cardManager: CardManager | null = null;
let _eventBus: EventBus | null = null;

/**
 * Initialize the galaxydraw state engine and bind to existing DOM.
 * Call this after ctx.canvas and ctx.canvasViewport are set.
 */
export function initGalaxyDrawState(ctx: CanvasContext): CanvasState {
    _gdState = new CanvasState();

    if (ctx.canvasViewport && ctx.canvas) {
        _gdState.bind(ctx.canvasViewport, ctx.canvas);
    }

    // Sync initial state from XState
    const state = ctx.snap().context;
    if (state.zoom) _gdState.zoom = state.zoom;
    if (state.offsetX) _gdState.offsetX = state.offsetX;
    if (state.offsetY) _gdState.offsetY = state.offsetY;
    _gdState.applyTransform();

    return _gdState;
}

/**
 * Get the shared CanvasState instance.
 */
export function getGalaxyDrawState(): CanvasState | null {
    return _gdState;
}

/**
 * Zoom toward a screen point using galaxydraw's engine,
 * then sync the computed state back to XState for persistence.
 *
 * @returns The new zoom/offset values (for callers that need them)
 */
export function zoomTowardScreen(
    ctx: CanvasContext,
    screenX: number,
    screenY: number,
    factor: number,
): { zoom: number; offsetX: number; offsetY: number } {
    const gd = _gdState;

    if (gd) {
        // Delegate to galaxydraw engine
        gd.zoomToward(screenX, screenY, factor);
        // Sync back to XState for persistence
        ctx.actor.send({ type: 'SET_ZOOM', zoom: gd.zoom });
        ctx.actor.send({ type: 'SET_OFFSET', x: gd.offsetX, y: gd.offsetY });
        return { zoom: gd.zoom, offsetX: gd.offsetX, offsetY: gd.offsetY };
    }

    // Fallback: manual math (pre-bridge init)
    const state = ctx.snap().context;
    const rect = ctx.canvasViewport?.getBoundingClientRect();
    const mouseX = screenX - (rect?.left ?? 0);
    const mouseY = screenY - (rect?.top ?? 0);
    const newZoom = Math.min(3, Math.max(0.1, state.zoom * factor));
    const scale = newZoom / state.zoom;
    const newOffsetX = mouseX - (mouseX - state.offsetX) * scale;
    const newOffsetY = mouseY - (mouseY - state.offsetY) * scale;
    ctx.actor.send({ type: 'SET_ZOOM', zoom: newZoom });
    ctx.actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
    return { zoom: newZoom, offsetX: newOffsetX, offsetY: newOffsetY };
}

/**
 * Pan by pixel delta via galaxydraw's engine.
 * Syncs back to XState for persistence.
 */
export function panByDelta(
    ctx: CanvasContext,
    dx: number,
    dy: number,
): void {
    const gd = _gdState;

    if (gd) {
        gd.pan(dx, dy);
        ctx.actor.send({ type: 'SET_OFFSET', x: gd.offsetX, y: gd.offsetY });
        return;
    }

    // Fallback
    const state = ctx.snap().context;
    ctx.actor.send({ type: 'SET_OFFSET', x: state.offsetX + dx, y: state.offsetY + dy });
}

/**
 * Convert screen coordinates to world coordinates.
 * Delegates to CanvasState.screenToWorld() when available.
 */
export function screenToWorld(
    ctx: CanvasContext,
    screenX: number,
    screenY: number,
): { x: number; y: number } {
    const gd = _gdState;

    if (gd) {
        return gd.screenToWorld(screenX, screenY);
    }

    // Fallback
    const state = ctx.snap().context;
    const rect = ctx.canvasViewport?.getBoundingClientRect();
    return {
        x: (screenX - (rect?.left ?? 0) - state.offsetX) / state.zoom,
        y: (screenY - (rect?.top ?? 0) - state.offsetY) / state.zoom,
    };
}

/**
 * Center the viewport on a world coordinate.
 * Delegates to CanvasState.panTo() when available.
 */
export function panToWorld(
    ctx: CanvasContext,
    worldX: number,
    worldY: number,
): void {
    const gd = _gdState;

    if (gd) {
        gd.panTo(worldX, worldY);
        ctx.actor.send({ type: 'SET_OFFSET', x: gd.offsetX, y: gd.offsetY });
        return;
    }

    // Fallback
    const state = ctx.snap().context;
    const vp = ctx.canvasViewport;
    if (vp) {
        const vpW = vp.clientWidth;
        const vpH = vp.clientHeight;
        const newOffsetX = vpW / 2 - worldX * state.zoom;
        const newOffsetY = vpH / 2 - worldY * state.zoom;
        ctx.actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
    }
}

// ─── Card Manager ───────────────────────────────────────

/**
 * Initialize the CardManager with file card plugins.
 * Call after initGalaxyDrawState() when ctx.canvas is available.
 * 
 * The CardManager handles:
 * - Card creation via plugins (FileCardPlugin, DiffCardPlugin)
 * - Drag, resize, z-order management
 * - Selection (single, multi)
 * - Deferred rendering (virtualization)
 */
import { scheduleRenderConnections } from './connections';

export function initCardManager(ctx: CanvasContext): CardManager | null {
    if (!_gdState || !ctx.canvas) {
        console.warn('[galaxydraw-bridge] Cannot init CardManager: state or canvas not ready');
        return null;
    }

    _eventBus = new EventBus();
    _cardManager = new CardManager(_gdState, _eventBus, ctx.canvas, {
        defaultWidth: 580,
        defaultHeight: 700,
        minWidth: 280,
        minHeight: 200,
        gridSize: 0,
        cornerSize: 40,
    });

    // Register plugins
    _cardManager.registerPlugin(createFileCardPlugin());
    _cardManager.registerPlugin(createDiffCardPlugin());

    // Sync card events back to XState for persistence
    _eventBus.on('card:move', (ev) => {
        const { id, x, y } = ev;
        ctx.actor.send({ type: 'SAVE_POSITION', path: id, x, y });
        scheduleRenderConnections(ctx);
    });

    _eventBus.on('card:resize', (ev) => {
        const { id, width, height } = ev;
        ctx.actor.send({ type: 'RESIZE_CARD', path: id, width, height });
        scheduleRenderConnections(ctx);
    });

    console.log('[galaxydraw-bridge] CardManager initialized with file + diff plugins');
    return _cardManager;
}

/**
 * Get the shared CardManager instance.
 */
export function getCardManager(): CardManager | null {
    return _cardManager;
}

/**
 * Get the shared EventBus instance.
 */
export function getEventBus(): EventBus | null {
    return _eventBus;
}

// ─── Card Creation via CardManager ──────────────────────

import { FILE_CARD_TYPE, DIFF_CARD_TYPE } from './file-card-plugin';
import { getActiveLayer } from './layers';
import { updateHiddenUI } from './hidden-files';
import type { ViewportRect } from '../../packages/galaxydraw/src/core/state';

/**
 * Render all files on canvas using CardManager instead of direct DOM.
 * 
 * This replaces the viewport culling logic in renderAllFilesOnCanvas():
 * - Cards in/near viewport → CardManager.create() (immediate DOM)
 * - Cards outside viewport → CardManager.defer() (lazy materialization)
 * - On scroll/zoom → materializeViewport() creates deferred cards
 * 
 * Benefits over the legacy approach:
 * - Drag/resize/z-order handled uniformly by CardManager
 * - EventBus emits card:create/card:move/card:resize for persistence
 * - Cleaner separation between rendering and interaction
 */
export function renderAllFilesViaCardManager(ctx: CanvasContext, files: any[]) {
    if (!_cardManager || !_gdState) {
        // Fallback to legacy if CardManager not initialized
        console.warn('[galaxydraw-bridge] CardManager not ready, falling back to legacy render');
        return false; // Signal caller to use legacy path
    }

    _cardManager.clear();

    const visibleFiles = files.filter(f => !ctx.hiddenFiles.has(f.path));
    updateHiddenUI(ctx);

    // Build changed file data map
    const changedFileDataMap = new Map<string, any>();
    if (ctx.commitFilesData) {
        ctx.commitFilesData.forEach(f => changedFileDataMap.set(f.path, f));
    }

    let layerFiles = visibleFiles;
    const activeLayer = getActiveLayer();
    if (activeLayer) {
        layerFiles = visibleFiles.filter(f => !!activeLayer.files[f.path]);
    }

    // Grid layout: square-ish
    const count = layerFiles.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const defaultCardWidth = 580;
    const defaultCardHeight = 700;
    const gap = 20;
    const cellW = defaultCardWidth + gap;
    const cellH = defaultCardHeight + gap;

    // Viewport rect for initial visibility check
    const MARGIN = 800;
    const state = _gdState.snapshot();
    const vpEl = ctx.canvasViewport;
    const vpW = vpEl?.clientWidth || window.innerWidth;
    const vpH = vpEl?.clientHeight || window.innerHeight;
    const zoom = state.zoom || 1;
    const offsetX = state.offsetX || 0;
    const offsetY = state.offsetY || 0;
    const worldLeft = (-offsetX - MARGIN) / zoom;
    const worldTop = (-offsetY - MARGIN) / zoom;
    const worldRight = (vpW - offsetX + MARGIN) / zoom;
    const worldBottom = (vpH - offsetY + MARGIN) / zoom;

    let createdCount = 0;
    let deferredCount = 0;

    // Cache XState state once outside the loop — avoids N snapshots for N files
    const cachedCardSizes = ctx.snap().context.cardSizes || {};

    layerFiles.forEach((f, index) => {
        const posKey = `allfiles:${f.path}`;
        let x: number, y: number;

        if (ctx.positions.has(posKey)) {
            const pos = ctx.positions.get(posKey);
            x = pos.x; y = pos.y;
        } else {
            const col = index % cols;
            const row = Math.floor(index / cols);
            x = 50 + col * cellW;
            y = 50 + row * cellH;
        }

        // Get saved size (from cached snapshot — no per-file ctx.snap() call)
        let size = cachedCardSizes[f.path];
        if (!size && ctx.positions.has(posKey)) {
            const pos = ctx.positions.get(posKey);
            if (pos.width) size = { width: pos.width, height: pos.height };
        }

        // Merge diff/layer data
        let fileWithDiff = { ...f };
        if (activeLayer && activeLayer.files[fileWithDiff.path]) {
            fileWithDiff.layerSections = activeLayer.files[fileWithDiff.path].sections;
        }

        const isChanged = ctx.changedFilePaths.has(f.path);
        if (isChanged && changedFileDataMap.has(fileWithDiff.path)) {
            const diffData = changedFileDataMap.get(fileWithDiff.path);
            if (diffData.content) {
                fileWithDiff.content = diffData.content;
                fileWithDiff.lines = diffData.content.split('\n').length;
            }
            fileWithDiff.status = diffData.status;
            fileWithDiff.hunks = diffData.hunks;

            if (diffData.hunks?.length > 0) {
                const addedLines = new Set<number>();
                const deletedBeforeLine = new Map<number, string[]>();
                for (const hunk of diffData.hunks) {
                    let newLine = hunk.newStart;
                    let pendingDeleted: string[] = [];
                    for (const l of hunk.lines) {
                        if (l.type === 'add') {
                            addedLines.add(newLine);
                            if (pendingDeleted.length > 0) {
                                const existing = deletedBeforeLine.get(newLine) || [];
                                deletedBeforeLine.set(newLine, existing.concat(pendingDeleted));
                                pendingDeleted = [];
                            }
                            newLine++;
                        } else if (l.type === 'del') {
                            pendingDeleted.push(l.content);
                        } else {
                            if (pendingDeleted.length > 0) {
                                const existing = deletedBeforeLine.get(newLine) || [];
                                deletedBeforeLine.set(newLine, existing.concat(pendingDeleted));
                                pendingDeleted = [];
                            }
                            newLine++;
                        }
                    }
                    if (pendingDeleted.length > 0) {
                        const existing = deletedBeforeLine.get(newLine) || [];
                        deletedBeforeLine.set(newLine, existing.concat(pendingDeleted));
                    }
                }
                fileWithDiff.addedLines = addedLines;
                fileWithDiff.deletedBeforeLine = deletedBeforeLine;
            }
        }

        const cardData = {
            id: f.path,
            x, y,
            width: size?.width || defaultCardWidth,
            height: size?.height || defaultCardHeight,
            meta: { file: fileWithDiff, ctx, savedSize: size },
        };

        // Check if in viewport
        const inViewport =
            x + (size?.width || defaultCardWidth) > worldLeft &&
            x < worldRight &&
            y + (size?.height || defaultCardHeight) > worldTop &&
            y < worldBottom;

        if (inViewport) {
            const card = _cardManager!.create(FILE_CARD_TYPE, cardData);
            if (card) {
                // Sync to ctx.fileCards so minimap, fitAll, etc. can find it
                ctx.fileCards.set(f.path, card);
                // Apply change markers for diff highlighting
                if (isChanged) {
                    card.classList.add('file-card--changed');
                    card.dataset.changed = 'true';
                }
            }
            createdCount++;
        } else {
            _cardManager!.defer(FILE_CARD_TYPE, cardData);
            // Also store in ctx.deferredCards so minimap, fitAll, etc. can see ALL files
            ctx.deferredCards.set(f.path, {
                file: fileWithDiff, x, y,
                size: { width: cardData.width, height: cardData.height },
                isChanged,
            });
            deferredCount++;
        }
    });

    console.log(`[gd-bridge] ${createdCount} created, ${deferredCount} deferred (${layerFiles.length} total)`);
    return true; // Signal: we handled it
}

/**
 * Materialize deferred cards that are now in the viewport.
 * Call this on zoom/pan changes.
 */
export function materializeViewport(ctx: CanvasContext): number {
    if (!_cardManager || !_gdState) return 0;

    const MARGIN = 800;
    const state = _gdState.snapshot();
    const vpEl = ctx.canvasViewport;
    const vpW = vpEl?.clientWidth || window.innerWidth;
    const vpH = vpEl?.clientHeight || window.innerHeight;
    const zoom = state.zoom || 1;
    const offsetX = state.offsetX || 0;
    const offsetY = state.offsetY || 0;

    const rect: ViewportRect = {
        left: (-offsetX - MARGIN) / zoom,
        top: (-offsetY - MARGIN) / zoom,
        right: (vpW - offsetX + MARGIN) / zoom,
        bottom: (vpH - offsetY + MARGIN) / zoom,
    };

    const count = _cardManager.materializeInRect(rect);

    // Sync newly materialized cards to ctx.fileCards for minimap/fitAll
    // AND remove from ctx.deferredCards so viewport-culling doesn't re-create them
    if (count > 0) {
        for (const [id, card] of _cardManager.cards) {
            if (!ctx.fileCards.has(id)) {
                ctx.fileCards.set(id, card);
            }
            // Remove from deferredCards to prevent duplicate creation by viewport-culling
            ctx.deferredCards.delete(id);
        }
    }

    return count;
}
