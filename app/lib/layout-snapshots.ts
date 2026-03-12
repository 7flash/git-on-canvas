// @ts-nocheck
import type { CanvasContext } from './context';
import { flushPositions } from './positions';
import { showToast } from './utils';
import { updateCanvasTransform } from './canvas';

interface Snapshot {
    id: string;
    name: string;
    timestamp: number;
    zoom: number;
    offsetX: number;
    offsetY: number;
    positions: Record<string, any>;
    hiddenFiles: string[];
    cardSizes: Record<string, any>;
}

let _overlay: HTMLElement | null = null;
let _ctx: CanvasContext | null = null;

function getStorageKey(ctx: CanvasContext): string {
    const repoPath = ctx.snap().context.repoPath || '';
    return `gitcanvas:snapshots:${repoPath}`;
}

export function saveSnapshot(ctx: CanvasContext, name: string) {
    if (!name.trim()) return;
    const key = getStorageKey(ctx);
    const existingRaw = localStorage.getItem(key);
    const snapshots: Snapshot[] = existingRaw ? JSON.parse(existingRaw) : [];

    const state = ctx.snap().context;

    // Ensure current un-flushed positions are flushed
    flushPositions(ctx);

    const positionsObj: Record<string, any> = {};
    for (const [k, v] of ctx.positions) {
        positionsObj[k] = v;
    }

    const cardSizesObj: Record<string, any> = {};
    if (ctx.cardSizes) {
        for (const [k, v] of ctx.cardSizes) {
            cardSizesObj[k] = v;
        }
    }

    const snap: Snapshot = {
        id: crypto.randomUUID(),
        name: name.trim(),
        timestamp: Date.now(),
        zoom: state.zoom || 1,
        offsetX: state.offsetX || 0,
        offsetY: state.offsetY || 0,
        positions: positionsObj,
        hiddenFiles: Array.from(ctx.hiddenFiles || []),
        cardSizes: cardSizesObj
    };

    snapshots.unshift(snap);
    localStorage.setItem(key, JSON.stringify(snapshots));
    showToast(`Saved snapshot: ${name}`, 'success');
    renderSnapshotsList();
}

export function loadSnapshot(ctx: CanvasContext, snapshotId: string) {
    const key = getStorageKey(ctx);
    const existingRaw = localStorage.getItem(key);
    if (!existingRaw) return;

    const snapshots: Snapshot[] = JSON.parse(existingRaw);
    const snap = snapshots.find(s => s.id === snapshotId);
    if (!snap) return;

    if (snap.positions) {
        ctx.positions = new Map(Object.entries(snap.positions));
        // flush to trigger saving
        flushPositions(ctx);
    }

    if (snap.hiddenFiles) {
        ctx.hiddenFiles = new Set(snap.hiddenFiles);
    }

    if (snap.cardSizes && ctx.cardSizes) {
        ctx.cardSizes = new Map(Object.entries(snap.cardSizes));
    }

    if (snap.zoom !== undefined) ctx.actor.send({ type: 'SET_ZOOM', zoom: snap.zoom });
    if (snap.offsetX !== undefined) ctx.actor.send({ type: 'SET_OFFSET', x: snap.offsetX, y: snap.offsetY });

    if (ctx.cardSizes && snap.cardSizes) {
        for (const [path, size] of Object.entries(snap.cardSizes)) {
            ctx.actor.send({ type: 'RESIZE_CARD', path, width: (size as any).width, height: (size as any).height });
        }
    }

    // Notify hidden UI updater
    const { updateHiddenUI } = require('./hidden-files');
    if (updateHiddenUI) updateHiddenUI(ctx);

    updateCanvasTransform(ctx);

    showToast(`Restored snapshot: ${snap.name}`, 'success');
}

export function deleteSnapshot(ctx: CanvasContext, snapshotId: string) {
    const key = getStorageKey(ctx);
    const existingRaw = localStorage.getItem(key);
    if (!existingRaw) return;

    let snapshots: Snapshot[] = JSON.parse(existingRaw);
    snapshots = snapshots.filter(s => s.id !== snapshotId);
    localStorage.setItem(key, JSON.stringify(snapshots));
    showToast('Snapshot deleted', 'info');
    renderSnapshotsList();
}

function ensureOverlay(): HTMLElement {
    if (_overlay) return _overlay;

    _overlay = document.createElement('div');
    _overlay.id = 'snapshotsOverlay';
    _overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(10, 10, 16, 0.75);
        backdrop-filter: blur(12px);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Inter', sans-serif;
    `;

    _overlay.innerHTML = `
        <div style="
            background: rgba(18, 18, 28, 0.95);
            border: 1px solid rgba(124, 58, 237, 0.3);
            border-radius: 12px;
            width: 480px;
            max-width: 90vw;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        ">
            <div style="padding:16px 20px; border-bottom:1px solid rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--accent-primary);">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <circle cx="12" cy="13" r="4" />
                    </svg>
                    <span style="font-size:15px; font-weight:600; color:#fff;">Layout Snapshots</span>
                </div>
                <button id="snapshotsClose" style="background:none; border:none; color:rgba(255,255,255,0.5); cursor:pointer; font-size:20px; line-height:1; transition:color 0.2s;">&times;</button>
            </div>
            
            <div style="padding:20px; display:flex; gap:10px;">
                <input type="text" id="snapshotNameInput" placeholder="Name for new snapshot..." autocomplete="off" style="
                    flex:1; padding:10px 14px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#fff; font-size:14px; outline:none; transition:border-color 0.2s;
                " onfocus="this.style.borderColor='var(--accent-primary)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
                <button id="snapshotSaveBtn" style="
                    background: var(--accent-primary); border:none; color:#fff; border-radius:8px; padding:0 20px; font-size:13px; font-weight:600; cursor:pointer; transition:filter 0.2s;
                " onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">Save Config</button>
            </div>
            
            <div id="snapshotsList" style="flex:1; overflow-y:auto; max-height:400px; padding:0 12px 12px; display:flex; flex-direction:column; gap:8px;"></div>
        </div>
    `;

    document.body.appendChild(_overlay);

    _overlay.addEventListener('mousedown', (e) => {
        if (e.target === _overlay) closeSnapshots();
    });

    _overlay.querySelector('#snapshotsClose')?.addEventListener('click', closeSnapshots);

    _overlay.querySelector('#snapshotSaveBtn')?.addEventListener('click', () => {
        const input = _overlay!.querySelector('#snapshotNameInput') as HTMLInputElement;
        const name = input.value;
        if (name && _ctx) {
            saveSnapshot(_ctx, name);
            input.value = '';
        }
    });

    _overlay.querySelector('#snapshotNameInput')?.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            const input = e.target as HTMLInputElement;
            const name = input.value;
            if (name && _ctx) {
                saveSnapshot(_ctx, name);
                input.value = '';
            }
        }
    });

    return _overlay;
}

function renderSnapshotsList() {
    if (!_overlay || !_ctx) return;
    const list = _overlay.querySelector('#snapshotsList');
    if (!list) return;

    const key = getStorageKey(_ctx);
    const raw = localStorage.getItem(key);
    let snapshots: Snapshot[] = [];
    if (raw) snapshots = JSON.parse(raw);

    if (snapshots.length === 0) {
        list.innerHTML = `
            <div style="padding:40px 20px; text-align:center; color:rgba(255,255,255,0.3); font-size:13px;">
                No snapshots saved yet. <br>Save your current layout to easily restore it later.
            </div>
        `;
        return;
    }

    list.innerHTML = snapshots.map(s => {
        const date = new Date(s.timestamp).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        });
        const count = Object.keys(s.positions || {}).length;

        return `
            <div class="snapshot-item" data-id="${s.id}" style="
                display:flex; align-items:center; justify-content:space-between; 
                padding:12px 16px; background:rgba(255,255,255,0.03); 
                border:1px solid rgba(255,255,255,0.05); border-radius:8px;
                transition:background 0.2s, border-color 0.2s; cursor:pointer;
            " onmouseover="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(124,58,237,0.3)'" 
              onmouseout="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.05)'">
                <div style="display:flex; flex-direction:column; gap:4px; pointer-events:none;">
                    <span style="font-size:14px; font-weight:500; color:#e2e8f0;">${s.name}</span>
                    <span style="font-size:11px; color:rgba(255,255,255,0.4);">
                        ${date} &middot; ${count} saved positions
                    </span>
                </div>
                <div style="display:flex; gap:8px;" class="snapshot-actions">
                    <button class="snap-load-btn" data-id="${s.id}" style="
                        background:rgba(124,58,237,0.2); color:#c4b5fd; border:none; 
                        padding:6px 12px; border-radius:6px; font-size:12px; font-weight:600; 
                        cursor:pointer; transition:background 0.2s;
                    " onmouseover="this.style.background='var(--accent-primary)';this.style.color='#fff'"
                      onmouseout="this.style.background='rgba(124,58,237,0.2)';this.style.color='#c4b5fd'">
                        Load View
                    </button>
                    <button class="snap-del-btn" data-id="${s.id}" style="
                        background:rgba(239,68,68,0.1); color:#fca5a5; border:none; 
                        width:28px; height:28px; display:flex; align-items:center; justify-content:center;
                        border-radius:6px; cursor:pointer; transition:background 0.2s;
                    " onmouseover="this.style.background='rgba(239,68,68,0.3)';this.style.color='#fff'"
                      onmouseout="this.style.background='rgba(239,68,68,0.1)';this.style.color='#fca5a5'" title="Delete Snapshot">
                        &times;
                    </button>
                </div>
            </div>
        `;
    }).join('');

    list.querySelectorAll('.snap-load-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
            if (id && _ctx) {
                loadSnapshot(_ctx, id);
                closeSnapshots();
            }
        });
    });

    list.querySelectorAll('.snap-del-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
            if (id && _ctx) {
                deleteSnapshot(_ctx, id);
            }
        });
    });

    // Also load on full row click
    list.querySelectorAll('.snapshot-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Prevent if clicking on action buttons
            if ((e.target as HTMLElement).closest('.snapshot-actions')) return;

            const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
            if (id && _ctx) {
                loadSnapshot(_ctx, id);
                closeSnapshots();
            }
        });
    });
}

export function openSnapshots(ctx: CanvasContext) {
    _ctx = ctx;
    const el = ensureOverlay();
    el.style.display = 'flex';
    renderSnapshotsList();
    const input = el.querySelector('#snapshotNameInput') as HTMLInputElement;
    if (input) requestAnimationFrame(() => input.focus());
}

export function closeSnapshots() {
    if (_overlay) _overlay.style.display = 'none';
}

export function initLayoutSnapshots(ctx: CanvasContext) {
    const btn = document.getElementById('openSnapshots');
    if (btn) {
        btn.addEventListener('click', () => openSnapshots(ctx));
    }
}
