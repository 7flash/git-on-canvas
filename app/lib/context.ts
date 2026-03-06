// @ts-nocheck
/**
 * Shared canvas context — passed to every sub-module.
 *
 * Replaces the giant closure that was `mount()` in the monolith.
 * Every module gets read/write access to the same mutable state.
 */

export interface CanvasContext {
    /** XState actor */
    actor: any;
    /** Shortcut: actor.getSnapshot() */
    snap: () => any;

    // ─── DOM refs ─────────────────────────────
    canvas: HTMLElement | null;
    canvasViewport: HTMLElement | null;
    svgOverlay: SVGSVGElement | null;

    // ─── Shared maps ──────────────────────────
    fileCards: Map<string, HTMLElement>;
    positions: Map<string, any>;

    // ─── Drag/pan state ───────────────────────
    isDragging: boolean;
    dragStartX: number;
    dragStartY: number;
    spaceHeld: boolean;

    // ─── Hidden files ─────────────────────────
    hiddenFiles: Set<string>;

    // ─── Constants ────────────────────────────
    CORNER_SIZE: number;

    // ─── Scroll debounce timers ───────────────
    scrollTimers: Record<string, any>;

    // ─── Connection drag state ────────────────
    connectionDragState: any;

    // ─── Loading overlay ref ──────────────────
    loadingOverlay: HTMLElement | null;

    // ─── Text rendering mode ──────────────────
    useCanvasText: boolean;

    // ─── All-files mode state ─────────────────
    allFilesActive: boolean;
    changedFilePaths: Set<string>;
    allFilesData: any[] | null;
    commitFilesData: any[] | null;

    // ─── Virtualized rendering ────────────────
    // Cards deferred until they scroll into the viewport.
    // Key: file path, Value: { file data, x, y, size, isChanged }
    deferredCards: Map<string, { file: any; x: number; y: number; size: any; isChanged: boolean }>;

    // ─── Control mode ─────────────────────────
    // 'simple' = drag canvas to pan (WARMAPS style)
    // 'advanced' = space+drag to pan, drag for rect select (GitMaps style)
    controlMode: 'simple' | 'advanced';
}

/** Creates a fresh context (call once per mount). */
export function createCanvasContext(actor: any): CanvasContext {
    return {
        actor,
        snap: () => actor.getSnapshot(),

        canvas: null,
        canvasViewport: null,
        svgOverlay: null,

        fileCards: new Map(),
        positions: new Map(),

        isDragging: false,
        dragStartX: 0,
        dragStartY: 0,
        spaceHeld: false,

        hiddenFiles: new Set(),

        CORNER_SIZE: 40,
        scrollTimers: {},
        connectionDragState: null,
        loadingOverlay: null,
        useCanvasText: false,

        allFilesActive: true,
        changedFilePaths: new Set(),
        allFilesData: null,
        commitFilesData: null,
        deferredCards: new Map(),
        controlMode: (localStorage.getItem('gitcanvas:controlMode') as any) || 'advanced',
    };
}
