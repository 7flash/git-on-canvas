/**
 * PR Review — Inline Comments on Diff Lines
 * 
 * Enables code review directly on the canvas:
 * - Click the gutter area of any line to add a comment
 * - Comments stored per file+line in localStorage
 * - Visual markers (purple dot) rendered in the canvas gutter
 * - Comment thread popup with input field and existing comments
 * - Optional WebSocket sync for collaborative review
 * 
 * Storage key: `gitcanvas:reviews:{repoSlug}`
 * Data format: { [filePath]: { [lineNum]: ReviewComment[] } }
 */

// ─── Types ──────────────────────────────────────────────

export interface ReviewComment {
    id: string;
    author: string;
    text: string;
    lineNum: number;
    filePath: string;
    createdAt: number;
    resolved?: boolean;
}

export interface ReviewStore {
    [filePath: string]: {
        [lineNum: string]: ReviewComment[];
    };
}

// ─── Storage ────────────────────────────────────────────

const STORAGE_PREFIX = 'gitcanvas:reviews:';
let currentRepo = '';
let store: ReviewStore = {};
let changeListeners: Array<() => void> = [];

export function initReviewStore(repoSlug: string) {
    currentRepo = repoSlug;
    try {
        const saved = localStorage.getItem(STORAGE_PREFIX + repoSlug);
        store = saved ? JSON.parse(saved) : {};
    } catch {
        store = {};
    }
}

function persist() {
    if (!currentRepo) return;
    try {
        localStorage.setItem(STORAGE_PREFIX + currentRepo, JSON.stringify(store));
    } catch { /* quota exceeded — non-fatal */ }
    changeListeners.forEach(fn => fn());
}

export function onReviewChange(fn: () => void): () => void {
    changeListeners.push(fn);
    return () => { changeListeners = changeListeners.filter(f => f !== fn); };
}

// ─── CRUD ───────────────────────────────────────────────

export function addComment(filePath: string, lineNum: number, text: string, author = 'You'): ReviewComment {
    if (!store[filePath]) store[filePath] = {};
    const key = String(lineNum);
    if (!store[filePath][key]) store[filePath][key] = [];

    const comment: ReviewComment = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        author,
        text,
        lineNum,
        filePath,
        createdAt: Date.now(),
    };

    store[filePath][key].push(comment);
    persist();
    return comment;
}

export function getComments(filePath: string, lineNum: number): ReviewComment[] {
    return store[filePath]?.[String(lineNum)] || [];
}

export function getAllFileComments(filePath: string): Map<number, ReviewComment[]> {
    const map = new Map<number, ReviewComment[]>();
    const fileStore = store[filePath];
    if (!fileStore) return map;
    for (const [key, comments] of Object.entries(fileStore)) {
        const lineNum = parseInt(key, 10);
        if (!isNaN(lineNum) && comments.length > 0) {
            map.set(lineNum, comments);
        }
    }
    return map;
}

export function resolveComment(filePath: string, lineNum: number, commentId: string) {
    const comments = store[filePath]?.[String(lineNum)];
    if (!comments) return;
    const comment = comments.find(c => c.id === commentId);
    if (comment) {
        comment.resolved = true;
        persist();
    }
}

export function deleteComment(filePath: string, lineNum: number, commentId: string) {
    const key = String(lineNum);
    const comments = store[filePath]?.[key];
    if (!comments) return;
    store[filePath][key] = comments.filter(c => c.id !== commentId);
    if (store[filePath][key].length === 0) delete store[filePath][key];
    if (Object.keys(store[filePath]).length === 0) delete store[filePath];
    persist();
}

export function getReviewStats(): { totalComments: number; totalFiles: number; unresolvedCount: number } {
    let totalComments = 0;
    let unresolvedCount = 0;
    let totalFiles = 0;
    for (const filePath of Object.keys(store)) {
        let hasComments = false;
        for (const comments of Object.values(store[filePath])) {
            totalComments += comments.length;
            unresolvedCount += comments.filter(c => !c.resolved).length;
            if (comments.length > 0) hasComments = true;
        }
        if (hasComments) totalFiles++;
    }
    return { totalComments, totalFiles, unresolvedCount };
}

// ─── Comment Thread Popup ───────────────────────────────

let activePopup: HTMLElement | null = null;

export function showCommentPopup(
    filePath: string,
    lineNum: number,
    anchorX: number,
    anchorY: number,
    onSubmit?: (comment: ReviewComment) => void
) {
    hideCommentPopup();

    const comments = getComments(filePath, lineNum);
    const popup = document.createElement('div');
    popup.className = 'review-comment-popup';
    popup.setAttribute('data-line', String(lineNum));
    popup.style.cssText = `
        position: fixed;
        z-index: 10000;
        background: rgba(22, 22, 35, 0.98);
        border: 1px solid rgba(124, 58, 237, 0.5);
        border-radius: 12px;
        padding: 0;
        min-width: 320px;
        max-width: 420px;
        max-height: 360px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 16px rgba(124, 58, 237, 0.2);
        font-family: 'Inter', -apple-system, sans-serif;
        font-size: 13px;
        color: #c9d1d9;
        overflow: hidden;
        backdrop-filter: blur(16px);
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 10px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(124, 58, 237, 0.1);
    `;
    header.innerHTML = `
        <span style="font-weight: 600; color: #a78bfa;">
            💬 Line ${lineNum}
        </span>
        <span style="color: #6e7681; font-size: 11px;">
            ${comments.length} comment${comments.length !== 1 ? 's' : ''}
        </span>
    `;
    popup.appendChild(header);

    // Existing comments
    if (comments.length > 0) {
        const list = document.createElement('div');
        list.style.cssText = `
            max-height: 180px;
            overflow-y: auto;
            padding: 8px 14px;
        `;
        for (const c of comments) {
            const item = document.createElement('div');
            item.style.cssText = `
                padding: 8px 0;
                border-bottom: 1px solid rgba(255,255,255,0.04);
                ${c.resolved ? 'opacity: 0.5;' : ''}
            `;
            const ago = timeAgo(c.createdAt);
            item.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-weight: 500; color: #a78bfa; font-size: 12px;">${escapeHtml(c.author)}</span>
                    <span style="color: #484f58; font-size: 11px;">${ago}</span>
                </div>
                <div style="line-height: 1.5; ${c.resolved ? 'text-decoration: line-through;' : ''}">${escapeHtml(c.text)}</div>
            `;

            // Resolve/delete buttons
            const actions = document.createElement('div');
            actions.style.cssText = 'display: flex; gap: 8px; margin-top: 4px;';

            if (!c.resolved) {
                const resolveBtn = document.createElement('button');
                resolveBtn.textContent = '✓ Resolve';
                resolveBtn.style.cssText = btnStyle('#238636');
                resolveBtn.onclick = (e) => {
                    e.stopPropagation();
                    resolveComment(filePath, lineNum, c.id);
                    showCommentPopup(filePath, lineNum, anchorX, anchorY, onSubmit);
                };
                actions.appendChild(resolveBtn);
            }

            const delBtn = document.createElement('button');
            delBtn.textContent = '✕';
            delBtn.style.cssText = btnStyle('#da3633');
            delBtn.onclick = (e) => {
                e.stopPropagation();
                deleteComment(filePath, lineNum, c.id);
                showCommentPopup(filePath, lineNum, anchorX, anchorY, onSubmit);
            };
            actions.appendChild(delBtn);

            item.appendChild(actions);
            list.appendChild(item);
        }
        popup.appendChild(list);
    }

    // Input area
    const inputArea = document.createElement('div');
    inputArea.style.cssText = `
        padding: 10px 14px;
        border-top: 1px solid rgba(255,255,255,0.06);
        display: flex;
        gap: 8px;
    `;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Add a comment...';
    input.style.cssText = `
        flex: 1;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 8px 12px;
        color: #c9d1d9;
        font-size: 13px;
        outline: none;
        font-family: inherit;
    `;

    const submitBtn = document.createElement('button');
    submitBtn.textContent = '↵';
    submitBtn.style.cssText = `
        background: rgba(124, 58, 237, 0.8);
        border: none;
        border-radius: 8px;
        padding: 8px 14px;
        color: white;
        font-size: 14px;
        cursor: pointer;
        transition: background 0.15s;
    `;
    submitBtn.onmouseenter = () => submitBtn.style.background = 'rgba(124, 58, 237, 1)';
    submitBtn.onmouseleave = () => submitBtn.style.background = 'rgba(124, 58, 237, 0.8)';

    const submit = () => {
        const text = input.value.trim();
        if (!text) return;
        const comment = addComment(filePath, lineNum, text);
        onSubmit?.(comment);
        // Refresh popup to show new comment
        showCommentPopup(filePath, lineNum, anchorX, anchorY, onSubmit);
    };

    input.onkeydown = (e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') hideCommentPopup();
        e.stopPropagation(); // Don't trigger canvas shortcuts
    };
    submitBtn.onclick = submit;

    inputArea.appendChild(input);
    inputArea.appendChild(submitBtn);
    popup.appendChild(inputArea);

    // Position: prefer above the anchor, fall below if near top
    document.body.appendChild(popup);
    const popupRect = popup.getBoundingClientRect();
    let px = anchorX;
    let py = anchorY - popupRect.height - 8;
    if (py < 10) py = anchorY + 24;
    if (px + popupRect.width > window.innerWidth - 10) px = window.innerWidth - popupRect.width - 10;
    popup.style.left = `${px}px`;
    popup.style.top = `${py}px`;

    activePopup = popup;

    // Focus input
    requestAnimationFrame(() => input.focus());

    // Close on outside click (delayed to avoid immediate close)
    setTimeout(() => {
        const closeHandler = (e: MouseEvent) => {
            if (!popup.contains(e.target as Node)) {
                hideCommentPopup();
                document.removeEventListener('mousedown', closeHandler);
            }
        };
        document.addEventListener('mousedown', closeHandler);
    }, 50);
}

export function hideCommentPopup() {
    if (activePopup) {
        activePopup.remove();
        activePopup = null;
    }
}

// ─── Helpers ────────────────────────────────────────────

function btnStyle(color: string): string {
    return `
        background: none;
        border: none;
        color: ${color};
        cursor: pointer;
        font-size: 11px;
        padding: 2px 4px;
        border-radius: 4px;
        opacity: 0.7;
        transition: opacity 0.15s;
    `;
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}
