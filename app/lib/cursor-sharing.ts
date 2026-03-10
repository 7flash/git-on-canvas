// @ts-nocheck
/**
 * cursor-sharing.ts — WebSocket-based live cursor presence.
 * Shows other users' cursors on the canvas in real-time.
 *
 * Broadcasts local mouse position in canvas-space coordinates.
 * Renders remote cursors as colored SVG pointers with name labels.
 */
import type { CanvasContext } from './context';

interface RemoteCursor {
    peerId: string;
    color: string;
    name: string;
    x: number;        // canvas-space X
    y: number;        // canvas-space Y
    viewportX: number; // viewport offset X
    viewportY: number; // viewport offset Y
    zoom: number;
    lastSeen: number;
    element?: HTMLElement;
}

let _ws: WebSocket | null = null;
let _peerId: string | null = null;
let _color: string | null = null;
let _ctx: CanvasContext | null = null;
let _remoteCursors: Map<string, RemoteCursor> = new Map();
let _container: HTMLElement | null = null;
let _staleInterval: any = null;
const THROTTLE_MS = 50;  // broadcast max 20x/sec
const STALE_MS = 5000;   // fade after 5s inactivity
const REMOVE_MS = 15000; // remove after 15s

let _lastBroadcast = 0;

// ─── Initialize ─────────────────────────────────────────

export function initCursorSharing(ctx: CanvasContext) {
    _ctx = ctx;

    // Create cursor overlay container
    _container = document.createElement('div');
    _container.id = 'cursor-sharing-overlay';
    _container.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        pointer-events: none; z-index: 9999; overflow: hidden;
    `;
    document.body.appendChild(_container);

    connectWebSocket();

    // Track local mouse movement
    document.addEventListener('mousemove', onLocalMouseMove);

    // Clean up stale cursors periodically
    _staleInterval = setInterval(cleanStaleCursors, 2000);

    // Send leave on unload
    window.addEventListener('beforeunload', () => {
        if (_ws?.readyState === WebSocket.OPEN) {
            _ws.send(JSON.stringify({ type: 'leave' }));
        }
    });

    // Update remote cursor positions on viewport pan/zoom
    window.addEventListener('gitcanvas:viewport-changed', () => {
        updateRemoteCursorPositions();
    });
}

export function destroyCursorSharing() {
    if (_ws) {
        _ws.close();
        _ws = null;
    }
    if (_container) {
        _container.remove();
        _container = null;
    }
    if (_staleInterval) {
        clearInterval(_staleInterval);
        _staleInterval = null;
    }
    document.removeEventListener('mousemove', onLocalMouseMove);
    _remoteCursors.clear();
}

// ─── WebSocket Connection ───────────────────────────────

function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws/cursors`;

    try {
        _ws = new WebSocket(url);
    } catch (e) {
        console.warn('[Cursors] WebSocket connection failed:', e);
        return;
    }

    _ws.onopen = () => {
        console.log('[Cursors] Connected');
    };

    _ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'identity') {
                _peerId = data.peerId;
                _color = data.color;
            } else if (data.type === 'cursor') {
                handleRemoteCursor(data);
            } else if (data.type === 'leave') {
                removeRemoteCursor(data.peerId);
            }
        } catch { /* ignore */ }
    };

    _ws.onclose = () => {
        console.log('[Cursors] Disconnected, reconnecting in 3s...');
        setTimeout(connectWebSocket, 3000);
    };

    _ws.onerror = () => {
        // onclose will fire after this
    };
}

// ─── Local Mouse Broadcasting ───────────────────────────

function onLocalMouseMove(e: MouseEvent) {
    if (!_ws || _ws.readyState !== WebSocket.OPEN || !_ctx) return;

    const now = Date.now();
    if (now - _lastBroadcast < THROTTLE_MS) return;
    _lastBroadcast = now;

    // Convert screen position to canvas-space coordinates
    const state = _ctx.snap().context;
    const canvasX = (e.clientX - (state.viewportX || 0)) / (state.zoom || 1);
    const canvasY = (e.clientY - (state.viewportY || 0)) / (state.zoom || 1);

    const userName = localStorage.getItem('gitcanvas:username') || _peerId || 'anonymous';

    _ws.send(JSON.stringify({
        type: 'cursor',
        name: userName,
        x: Math.round(canvasX),
        y: Math.round(canvasY),
        viewportX: state.viewportX || 0,
        viewportY: state.viewportY || 0,
        zoom: state.zoom || 1,
    }));
}

// ─── Remote Cursor Rendering ────────────────────────────

function handleRemoteCursor(data: any) {
    if (data.peerId === _peerId) return; // Skip own cursor

    let cursor = _remoteCursors.get(data.peerId);
    if (!cursor) {
        cursor = {
            peerId: data.peerId,
            color: data.color,
            name: data.name,
            x: data.x,
            y: data.y,
            viewportX: data.viewportX,
            viewportY: data.viewportY,
            zoom: data.zoom,
            lastSeen: Date.now(),
        };
        cursor.element = createCursorElement(cursor);
        _remoteCursors.set(data.peerId, cursor);
        _container?.appendChild(cursor.element);
    }

    // Update position
    cursor.x = data.x;
    cursor.y = data.y;
    cursor.viewportX = data.viewportX;
    cursor.viewportY = data.viewportY;
    cursor.zoom = data.zoom;
    cursor.name = data.name;
    cursor.lastSeen = Date.now();

    updateCursorPosition(cursor);
}

function createCursorElement(cursor: RemoteCursor): HTMLElement {
    const el = document.createElement('div');
    el.className = 'remote-cursor';
    el.style.cssText = `
        position: fixed;
        pointer-events: none;
        z-index: 9999;
        transition: left 0.08s linear, top 0.08s linear, opacity 0.3s;
        will-change: transform;
    `;
    el.innerHTML = `
        <svg width="20" height="24" viewBox="0 0 20 24" fill="none" style="filter: drop-shadow(0 1px 3px rgba(0,0,0,0.4));">
            <path d="M1 1L7 21L10 14L18 12L1 1Z" fill="${cursor.color}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
        <span style="
            position: absolute;
            left: 18px;
            top: 14px;
            background: ${cursor.color};
            color: white;
            font-size: 11px;
            font-family: 'Inter', system-ui, sans-serif;
            font-weight: 500;
            padding: 2px 6px;
            border-radius: 4px;
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            letter-spacing: 0.3px;
        ">${cursor.name}</span>
    `;
    return el;
}

function updateCursorPosition(cursor: RemoteCursor) {
    if (!cursor.element || !_ctx) return;

    // Convert remote canvas-space coordinates to local screen position
    const state = _ctx.snap().context;
    const localZoom = state.zoom || 1;
    const localViewportX = state.viewportX || 0;
    const localViewportY = state.viewportY || 0;

    const screenX = cursor.x * localZoom + localViewportX;
    const screenY = cursor.y * localZoom + localViewportY;

    cursor.element.style.left = `${screenX}px`;
    cursor.element.style.top = `${screenY}px`;
    cursor.element.style.opacity = '1';

    // Update name label if changed
    const nameLabel = cursor.element.querySelector('span');
    if (nameLabel && nameLabel.textContent !== cursor.name) {
        nameLabel.textContent = cursor.name;
    }
}

function removeRemoteCursor(peerId: string) {
    const cursor = _remoteCursors.get(peerId);
    if (cursor?.element) {
        cursor.element.style.opacity = '0';
        setTimeout(() => cursor.element?.remove(), 300);
    }
    _remoteCursors.delete(peerId);
}

function cleanStaleCursors() {
    const now = Date.now();

    // Also update positions on every tick (viewport may have changed)
    for (const [id, cursor] of _remoteCursors) {
        const age = now - cursor.lastSeen;
        if (age > REMOVE_MS) {
            removeRemoteCursor(id);
        } else if (age > STALE_MS) {
            if (cursor.element) cursor.element.style.opacity = '0.3';
        } else {
            // Keep positions synced with local viewport changes
            updateCursorPosition(cursor);
        }
    }
}

// ─── Viewport Change Handler ────────────────────────────
// Call this when local viewport changes (pan/zoom) to update remote cursor positions

export function updateRemoteCursorPositions() {
    for (const cursor of _remoteCursors.values()) {
        updateCursorPosition(cursor);
    }
}
