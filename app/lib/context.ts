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

    // ─── All-files mode state ─────────────────
    allFilesActive: boolean;
    changedFilePaths: Set<string>;
    allFilesData: any[] | null;
    commitFilesData: any[] | null;
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

        allFilesActive: false,
        changedFilePaths: new Set(),
        allFilesData: null,
        commitFilesData: null,
    };
}
