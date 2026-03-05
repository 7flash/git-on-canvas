/**
 * gx-canvas-core — Types
 * 
 * Framework-agnostic types for the infinite canvas system.
 */

export interface CanvasState {
    /** X offset of canvas origin in screen pixels */
    offsetX: number;
    /** Y offset of canvas origin in screen pixels */
    offsetY: number;
    /** Current zoom level (1 = 100%) */
    zoom: number;
}

export interface CanvasConfig {
    /** The container element that wraps the canvas */
    container: HTMLElement;
    /** Enable minimap? */
    minimap?: boolean;
    /** Minimap position */
    minimapPosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    /** Enable viewport culling for performance */
    culling?: boolean;
    /** Zoom limits */
    zoom?: {
        min: number;
        max: number;
        initial: number;
    };
    /** Debounce delay for minimap rebuilds (ms) */
    minimapRebuildDelay?: number;
}

export interface ContainerOptions {
    x: number;
    y: number;
    width?: number;
    height?: number;
    /** DOM content to render inside */
    content?: HTMLElement;
    /** CSS class(es) to add */
    className?: string;
    /** Allow drag to reposition */
    draggable?: boolean;
    /** Allow resize handles */
    resizable?: boolean;
    /** Custom data attached to this container */
    data?: Record<string, any>;
}

export interface ContainerInfo {
    id: string;
    element: HTMLElement;
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
    data: Record<string, any>;
}

export interface ViewportRect {
    x: number;
    y: number;
    width: number;
    height: number;
    zoom: number;
}

export type CanvasEventMap = {
    'viewport-change': ViewportRect;
    'container-click': { id: string; event: MouseEvent };
    'container-move': { id: string; x: number; y: number };
    'container-resize': { id: string; width: number; height: number };
    'zoom-change': { zoom: number };
};
