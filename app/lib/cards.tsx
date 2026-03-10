// @ts-nocheck
/**
 * File cards — creation (diff + all-files), interaction (click/drag/resize),
 * selection, arrangement, and the file modal.
 */
import { measure } from 'measure-fn';
import { render } from 'melina/client';
import type { CanvasContext } from './context';
import { escapeHtml, getFileIcon, getFileIconClass, showToast } from './utils';
import { hideSelectedFiles } from './hidden-files';
import { savePosition, getPositionKey, isPathExpandedInPositions, setPathExpandedInPositions } from './positions';
import { updateMinimap, updateCanvasTransform, updateZoomUI, jumpToFile } from './canvas';
import { updateStatusBarSelected } from './status-bar';
import { renderConnections, scheduleRenderConnections, setupConnectionDrag, hasPendingConnection } from './connections';
import { highlightSyntax, buildModalDiffHTML } from './syntax';
import { filterFileContentByLayer, layerState, createLayer, addFileToLayer, removeFileFromLayer, getActiveLayer } from './layers';
import { openFileChatInModal } from './chat';
import { buildDiffMarkerStrip as _buildDiffMarkerStrip, setupDeletedLinesOverlay as _setupDeletedLinesOverlay } from './card-diff-markers';
import { updateHiddenLinesIndicator as _updateHiddenLinesIndicator } from './card-expand';

// ─── Constants ──────────────────────────────────────────
const CORNER_CURSORS = { tl: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', br: 'nwse-resize' };

// Max lines rendered in DOM for collapsed (folded) cards.
// Files with more lines than this will show a truncated view until expanded with F.
// This is the #1 performance optimization — a 10K-line file produces 10K <span> elements
// which all participate in layout during pan/zoom, crushing frame rate.
const VISIBLE_LINE_LIMIT = 120;

const cardFileData = new WeakMap<HTMLElement, any>();

// ─── Accessor for cardFileData (used by card-expand.ts via lazy require) ──
export function _getCardFileData(card: HTMLElement) { return cardFileData.get(card); }

// ─── Expanded state persistence ─────────────────────────
// NOTE: Expanded state is now stored in the positions system (positions.ts)
// so it automatically syncs to the server for logged-in users.
// The old localStorage-only functions below are kept as thin wrappers
// for backward compatibility but should not be used directly.
// Use isPathExpandedInPositions / setPathExpandedInPositions from positions.ts.

/** @deprecated Use isPathExpandedInPositions(ctx, filePath) instead */
export function isPathExpanded(filePath: string): boolean {
    // Legacy fallback: check localStorage for old data
    // New code should use isPathExpandedInPositions which checks ctx.positions
    const key = _getExpandedStorageKey();
    if (!key) return false;
    try {
        const raw = localStorage.getItem(key);
        if (raw) return new Set(JSON.parse(raw)).has(filePath);
    } catch { }
    return false;
}

/** @deprecated Use setPathExpandedInPositions(ctx, filePath, expanded) instead */
export function setPathExpanded(filePath: string, expanded: boolean) {
    // Legacy: only used if ctx is not available
    const key = _getExpandedStorageKey();
    if (!key) return;
    try {
        const raw = localStorage.getItem(key);
        const paths = raw ? new Set(JSON.parse(raw)) : new Set();
        if (expanded) paths.add(filePath);
        else paths.delete(filePath);
        if (paths.size === 0) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(Array.from(paths)));
    } catch { }
}

function _getExpandedStorageKey(): string | null {
    const hash = decodeURIComponent(window.location.hash.replace('#', ''));
    const repo = hash || localStorage.getItem('gitcanvas:lastRepo');
    if (!repo) return null;
    return `gitcanvas:expanded:${repo}`;
}

// ─── Selection highlights ───────────────────────────────
export function updateSelectionHighlights(ctx: CanvasContext) {
    const selected = ctx.snap().context.selectedCards;
    ctx.fileCards.forEach((card, path) => {
        card.classList.toggle('selected', selected.includes(path));
    });
    updateStatusBarSelected(selected.length);
}

export function clearSelectionHighlights(ctx: CanvasContext) {
    ctx.fileCards.forEach(card => card.classList.remove('selected'));
}

// ─── Arrange toolbar visibility ─────────────────────────
export function updateArrangeToolbar(ctx: CanvasContext) {
    measure('arrange:updateToolbar', () => {
        const toolbar = document.getElementById('arrangeToolbar');
        if (!toolbar) return;
        const selected = ctx.snap().context.selectedCards;
        toolbar.style.display = selected.length >= 2 ? 'flex' : 'none';
    });
}

// ─── Corner detection for resize ────────────────────────
function isNearCorner(e: MouseEvent, card: HTMLElement, cornerSize: number, zoom: number): string | null {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    // Scale corner hit-area: base size + proportion of card size, capped at 80px
    // This makes large cards much easier to grab at corners
    const dynamicCorner = Math.min(80, Math.max(cornerSize, Math.min(w, h) * 0.12));
    const c = dynamicCorner * zoom;

    if (x > w - c && y > h - c) return 'br';
    if (x < c && y > h - c) return 'bl';
    if (x > w - c && y < c) return 'tr';
    if (x < c && y < c) return 'tl';
    return null;
}

// ─── Setup card interaction (click-select + drag) ────────
export function setupCardInteraction(ctx: CanvasContext, card: HTMLElement, commitHash: string) {
    let action = null; // null | 'move' | 'pending'
    let startX: number, startY: number;
    let moveStartPositions: any[] = [];
    let rafPending = false;
    const DRAG_THRESHOLD = 3;

    function onMouseDown(e) {
        // Only respond to left-click (button 0). Middle-click/right-click should not start card interaction.
        if (e.button !== 0) return;
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        const bodyEl = e.target.closest('.file-card-body');
        if (bodyEl && (e.offsetX > e.target.clientWidth || e.offsetY > e.target.clientHeight)) return;

        // If a connection is pending and the click is inside body (on a diff-line),
        // don't start drag — let the connection click handler handle it
        if (hasPendingConnection() && bodyEl && (e.target as HTMLElement).closest('.diff-line')) return;

        e.stopPropagation();
        startX = e.clientX;
        startY = e.clientY;
        action = 'pending';

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    function onMouseMove(e) {
        const state = ctx.snap().context;
        const dx = (e.clientX - startX) / state.zoom;
        const dy = (e.clientY - startY) / state.zoom;

        if (action === 'pending') {
            const screenDist = Math.sqrt((e.clientX - startX) ** 2 + (e.clientY - startY) ** 2);
            if (screenDist < DRAG_THRESHOLD) return;

            action = 'move';
            card.style.cursor = 'move';

            const selected = ctx.snap().context.selectedCards;
            const cardPath = card.dataset.path;
            if (!selected.includes(cardPath)) {
                if (!e.shiftKey && !e.ctrlKey) {
                    ctx.actor.send({ type: 'SELECT_CARD', path: cardPath, shift: false });
                } else {
                    ctx.actor.send({ type: 'SELECT_CARD', path: cardPath, shift: true });
                }
                updateSelectionHighlights(ctx);
                updateArrangeToolbar(ctx);
            }

            const nowSelected = ctx.snap().context.selectedCards;
            moveStartPositions = [];
            nowSelected.forEach(path => {
                const c = ctx.fileCards.get(path);
                if (c) {
                    c.style.cursor = 'grabbing';
                    moveStartPositions.push({
                        card: c,
                        path,
                        startLeft: parseInt(c.style.left) || 0,
                        startTop: parseInt(c.style.top) || 0,
                    });
                }
            });
        }

        if (action === 'move') {
            moveStartPositions.forEach(info => {
                info.card.style.left = `${info.startLeft + dx}px`;
                info.card.style.top = `${info.startTop + dy}px`;
            });
            // Throttle expensive DOM updates to once per frame
            if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(() => {
                    rafPending = false;
                    scheduleRenderConnections(ctx);
                    updateMinimap(ctx);
                });
            }
            return;
        }
    }

    function onMouseUp(e) {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        if (action === 'pending') {
            if (e.shiftKey || e.ctrlKey) {
                ctx.actor.send({ type: 'SELECT_CARD', path: card.dataset.path, shift: true });
            } else {
                ctx.actor.send({ type: 'SELECT_CARD', path: card.dataset.path, shift: false });
            }
            updateSelectionHighlights(ctx);
            updateArrangeToolbar(ctx);
        } else if (action === 'move') {
            document.body.style.cursor = '';
            card.style.cursor = '';
            moveStartPositions.forEach(info => {
                info.card.style.cursor = '';
            });
            moveStartPositions.forEach(info => {
                const x = parseInt(info.card.style.left) || 0;
                const y = parseInt(info.card.style.top) || 0;
                savePosition(ctx, commitHash, info.path, x, y);
            });
            moveStartPositions = [];
        }

        action = null;
    }

    card.addEventListener('mousedown', onMouseDown);

    // ── Double-click to open in editor modal ──
    card.addEventListener('dblclick', (e) => {
        // Don't trigger on buttons
        if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).closest('button')) return;
        e.preventDefault();
        e.stopPropagation();

        const filePath = card.dataset.path;
        if (filePath) {
            const file = ctx.allFilesData?.find(f => f.path === filePath) ||
                { path: filePath, name: filePath.split('/').pop(), lines: 0 };
            import('./file-modal').then(({ openFileModal }) => openFileModal(ctx, file));
        }
    });

    // ── Right-click context menu ──
    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showCardContextMenu(ctx, card, e.clientX, e.clientY);
    });
}

// ─── Context menu & file history (extracted to card-context-menu.tsx) ────
import { showCardContextMenu, showFileHistory } from './card-context-menu';
export { showCardContextMenu, showFileHistory };

// ─── Arrangement functions (extracted to card-arrangement.ts) ────
import { arrangeRow, arrangeColumn, arrangeGrid } from './card-arrangement';
export { arrangeRow, arrangeColumn, arrangeGrid };

// ─── Scroll debounce ────────────────────────────────────
export function debounceSaveScroll(ctx: CanvasContext, filePath: string, scrollTop: number) {
    if (ctx.scrollTimers[filePath]) clearTimeout(ctx.scrollTimers[filePath]);
    ctx.scrollTimers[filePath] = setTimeout(() => {
        ctx.actor.send({ type: 'SAVE_SCROLL', path: filePath, scrollTop });
        savePosition(ctx, 'scroll', filePath, scrollTop, 0);
    }, 300);
}

// ─── JSX sub-components for file card content ───────────

function DiffLine({ type, lineNum, content }: { type: string; lineNum: number; content: string }) {
    return (
        <span className={`diff-line diff-${type}`} data-line={lineNum}>
            <span className="line-num">{String(lineNum).padStart(4, ' ')}</span>
            {content}
        </span>
    );
}

function DiffHunk({ hunk, hunkIdx }: { hunk: any; hunkIdx: number }) {
    const header = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${hunk.context ? ' ' + hunk.context : ''}`;
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;

    const currentItems: { type: string; ln: number; content: string }[] = [];
    const previousItems: { type: string; ln: number; content: string }[] = [];

    hunk.lines.forEach((l: any) => {
        if (l.type === 'add') {
            currentItems.push({ type: 'add', ln: newLine++, content: l.content });
        } else if (l.type === 'del') {
            previousItems.push({ type: 'del', ln: oldLine++, content: l.content });
        } else {
            const curLn = newLine++;
            const prevLn = oldLine++;
            currentItems.push({ type: 'ctx', ln: curLn, content: l.content });
            previousItems.push({ type: 'ctx', ln: prevLn, content: l.content });
        }
    });

    const hasDeletions = previousItems.some(l => l.type === 'del');

    function toggle(e: Event, view: string) {
        e.stopPropagation();
        const hunkEl = (e.target as HTMLElement).closest('.diff-hunk');
        if (!hunkEl) return;
        hunkEl.querySelectorAll('.hunk-toggle-btn').forEach(b => b.classList.remove('active'));
        (e.target as HTMLElement).classList.add('active');
        const cur = hunkEl.querySelector('.hunk-pane--current') as HTMLElement;
        const prev = hunkEl.querySelector('.hunk-pane--previous') as HTMLElement;
        if (cur) cur.style.display = view === 'current' ? '' : 'none';
        if (prev) prev.style.display = view === 'previous' ? '' : 'none';
    }

    return (
        <div className="diff-hunk">
            <div className="diff-hunk-header">
                <span className="hunk-range">{header}</span>
                {hasDeletions ? (
                    <span className="hunk-view-toggle" data-hunk={hunkIdx}>
                        <button className="hunk-toggle-btn active" data-view="current" onclick={(e) => toggle(e, 'current')}>Current</button>
                        <button className="hunk-toggle-btn" data-view="previous" onclick={(e) => toggle(e, 'previous')}>Previous</button>
                    </span>
                ) : null}
            </div>
            <div className="diff-hunk-body">
                <div className="hunk-pane hunk-pane--current">
                    <pre><code>{currentItems.map(l => <DiffLine type={l.type} lineNum={l.ln} content={l.content} />)}</code></pre>
                </div>
                <div className="hunk-pane hunk-pane--previous" style="display:none">
                    <pre><code>{previousItems.map(l => <DiffLine type={l.type} lineNum={l.ln} content={l.content} />)}</code></pre>
                </div>
            </div>
        </div>
    );
}

function FileCardContent({ file }: { file: any }) {
    if (file.status === 'added' && file.content) {
        const lines = file.content.split('\n');
        return (
            <div className="file-content-preview">
                <pre><code>{lines.map((line, i) => (!file.visibleLineIndices || file.visibleLineIndices.has(i)) ? <DiffLine type="add" lineNum={i + 1} content={line} /> : null)}</code></pre>
            </div>
        );
    }
    if (file.status === 'deleted' && file.content) {
        const lines = file.content.split('\n');
        return (
            <div className="file-content-preview">
                <pre><code>{lines.map((line, i) => (!file.visibleLineIndices || file.visibleLineIndices.has(i)) ? <DiffLine type="del" lineNum={i + 1} content={line} /> : null)}</code></pre>
            </div>
        );
    }
    if ((file.status === 'modified' || file.status === 'renamed' || file.status === 'copied') && file.hunks?.length > 0) {
        return (
            <div className="file-content-preview">
                {file.hunks.map((hunk, idx) => <DiffHunk hunk={hunk} hunkIdx={idx} />)}
            </div>
        );
    }
    if ((file.status === 'renamed' || file.status === 'copied') && (!file.hunks || file.hunks.length === 0)) {
        const simText = file.similarity ? ` (${file.similarity}% similar)` : '';
        return (
            <div className="file-content-preview">
                <pre><code><span className="rename-notice">{'File ' + file.status + simText + '\nNo content changes'}</span></code></pre>
            </div>
        );
    }
    const msg = file.contentError || 'No changes to display';
    return (
        <div className="file-content-preview">
            <pre><code><span className="error-notice">{msg}</span></code></pre>
        </div>
    );
}

const STATUS_COLORS: Record<string, string> = { added: '#22c55e', modified: '#eab308', deleted: '#ef4444', renamed: '#a78bfa', copied: '#60a5fa' };
const STATUS_LABELS: Record<string, string> = { added: '+ ADDED', modified: '~ MODIFIED', deleted: '- DELETED', renamed: '→ RENAMED', copied: '⊕ COPIED' };

function _handleChatClick(ctx: CanvasContext, file: any) {
    const filePath = file.path;
    const content = file.content || '';
    const status = file.status || '';

    let extraContext = '';

    if (file.hunks && file.hunks.length > 0) {
        extraContext += `\n--- DIFF SUMMARY ---\n`;
        extraContext += file.hunks.map((h: any) =>
            `@@ -${h.oldStart},${h.oldCount} +${h.newStart},${h.newCount} @@\n` +
            h.lines.map((l: any) => `${l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '} ${l.content}`).join('\n')
        ).join('\n');
    }

    const connections = ctx.snap().context.connections;
    const relatedLinks = connections.filter((c: any) => c.sourceFile === filePath || c.targetFile === filePath);

    if (relatedLinks.length > 0) {
        extraContext += `\n\n--- ARCHITECTURE CONNECTIONS ---\n`;
        extraContext += `This file is logically connected to the following modules in the visual graph:\n`;
        relatedLinks.forEach((c: any) => {
            if (c.sourceFile === filePath) {
                extraContext += `- Outbound dependency on \`${c.targetFile}\` (Lines ${c.sourceLineStart}-${c.sourceLineEnd} -> Lines ${c.targetLineStart}-${c.targetLineEnd}). Note: "${c.comment || 'None'}"\n`;
            } else {
                extraContext += `- Inbound dependency from \`${c.sourceFile}\` (Lines ${c.sourceLineStart}-${c.sourceLineEnd} -> Lines ${c.targetLineStart}-${c.targetLineEnd}). Note: "${c.comment || 'None'}"\n`;
            }
        });
    }

    openFileChatInModal(filePath, content, status, extraContext);
}

// ─── Create file card (commit diff) ─────────────────────
export function createFileCard(ctx: CanvasContext, file: any, x: number, y: number, commitHash: string, skipInteraction = false): HTMLElement {
    const card = document.createElement('div');
    card.className = `file-card file-card--${file.status || 'modified'}`;
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.dataset.path = file.path;

    if (file.layerSections && file.layerSections.length > 0) {
        if (file.content) {
            const { visibleLineIndices } = filterFileContentByLayer(file.content, file.layerSections);
            file.visibleLineIndices = visibleLineIndices;
        }
        if (file.hunks) {
            // Very simplistic filtering for hunks
            file.hunks = file.hunks.filter(h => {
                // If the hunk's content has ANY line overlapping with visible lines, keep it. But we don't have exactly the full file contents to compare.
                // Keep all hunks for now if layers view, else users might miss diffs.
                return true;
            });
        }
    }

    // Apply saved size
    const posKey = getPositionKey(file.path, commitHash);
    if (ctx.positions.has(posKey)) {
        const pos = ctx.positions.get(posKey);
        if (pos.width) card.style.width = `${pos.width}px`;
        if (pos.height) {
            card.style.height = `${pos.height}px`;
            card.style.maxHeight = `${pos.height}px`;
        }
    }

    const ext = file.name.split('.').pop().toLowerCase();
    const iconClass = getFileIconClass(ext);
    const statusColor = STATUS_COLORS[file.status] || '#a855f7';
    const statusLabel = STATUS_LABELS[file.status] || file.status?.toUpperCase() || 'CHANGED';
    const hunkCount = file.hunks?.length || 0;
    const metaInfo = hunkCount > 0
        ? `${hunkCount} hunk${hunkCount > 1 ? 's' : ''}`
        : `${file.lines || 0} lines`;

    const iconSvg = getFileIcon(file.type, ext);

    // Render JSX into card
    render(
        <>
            <div className="file-card-header" style={`border-left: 4px solid ${statusColor}`}>
                <div className={`file-icon ${iconClass}`} dangerouslySetInnerHTML={{ __html: iconSvg }} />
                <span className="file-name">{file.name}</span>
                <span className="file-status" style={`background: ${statusColor}20; color: ${statusColor}; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600;`}>{statusLabel}</span>
                <span style="font-size: 10px; color: var(--text-muted); margin-left: auto;">{metaInfo}</span>

            </div>
            <div className="file-card-body">
                {file.oldPath ? (
                    <div className="file-rename-path">
                        {file.oldPath} → {file.path}
                        {file.similarity ? <span className="rename-similarity">{file.similarity}%</span> : null}
                    </div>
                ) : (
                    <div className="file-path">{file.path}</div>
                )}
                <FileCardContent file={file} />
            </div>
        </>,
        card
    );

    cardFileData.set(card, file);

    // When managed by CardManager, skip legacy drag/resize/z-order setup
    // but ALWAYS attach context menu, double-click, and click-to-select
    if (!skipInteraction) {
        setupCardInteraction(ctx, card, commitHash);
    } else {
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showCardContextMenu(ctx, card, e.clientX, e.clientY);
        });
        card.addEventListener('dblclick', (e) => {
            if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).closest('button')) return;
            e.preventDefault();
            e.stopPropagation();
            const filePath = card.dataset.path;
            if (filePath) {
                const file = ctx.allFilesData?.find(f => f.path === filePath) ||
                    { path: filePath, name: filePath.split('/').pop(), lines: 0 };
                import('./file-modal').then(({ openFileModal }) => openFileModal(ctx, file));
            }
        });
        // Smart selection: don't deselect others on mousedown if card is already selected
        // This allows multi-drag to work. Deselection is deferred to mouseup (click without drag).
        let _dragOccurred = false;
        card.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.connect-btn')) return;
            const filePath = card.dataset.path || '';
            const multi = e.shiftKey || e.ctrlKey;
            const selected = ctx.snap().context.selectedCards;
            const alreadySelected = selected.includes(filePath);
            _dragOccurred = false;

            if (multi) {
                // Shift/Ctrl: toggle selection
                ctx.actor.send({ type: 'SELECT_CARD', path: filePath, shift: true });
                try {
                    const { getCardManager } = require('./galaxydraw-bridge');
                    const cm = getCardManager();
                    if (cm) {
                        if (alreadySelected) cm.deselect(filePath);
                        else cm.select(filePath, true);
                    }
                } catch { }
            } else if (!alreadySelected) {
                // Not selected yet → replace selection with this card
                ctx.actor.send({ type: 'SELECT_CARD', path: filePath, shift: false });
                try {
                    const { getCardManager } = require('./galaxydraw-bridge');
                    const cm = getCardManager();
                    if (cm) cm.select(filePath, false);
                } catch { }
            }
            // If already selected without shift → do nothing on mousedown (allow multi-drag)
            // Deselection of others happens on mouseup below

            updateSelectionHighlights(ctx);
            updateArrangeToolbar(ctx);
        });
        card.addEventListener('mouseup', (e) => {
            if (e.button !== 0) return;
            if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.connect-btn')) return;
            // Only deselect others if: no shift, card was already selected, and no drag happened
            const filePath = card.dataset.path || '';
            const multi = e.shiftKey || e.ctrlKey;
            if (multi) return; // shift-click handled in mousedown
            const selected = ctx.snap().context.selectedCards;
            if (selected.length > 1 && selected.includes(filePath) && !_dragOccurred) {
                ctx.actor.send({ type: 'SELECT_CARD', path: filePath, shift: false });
                try {
                    const { getCardManager } = require('./galaxydraw-bridge');
                    const cm = getCardManager();
                    if (cm) cm.select(filePath, false);
                } catch { }
                updateSelectionHighlights(ctx);
                updateArrangeToolbar(ctx);
            }
        });
        // Track drag state from engine for mouseup deselection logic
        card.addEventListener('mousemove', () => { _dragOccurred = true; });
    }
    setupConnectionDrag(ctx, card, file.path);

    // Expand button → open modal
    const expandBtn = card.querySelector('.expand-btn');
    if (expandBtn) {
        expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openFileModal(ctx, file);
        });
    }

    // AI button → open chat
    const aiBtn = card.querySelector('.ai-btn');
    if (aiBtn) {
        aiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            _handleChatClick(ctx, file);
        });
    }

    // Scroll listener
    const body = card.querySelector('.file-card-body');
    if (body) {
        body.addEventListener('scroll', () => {
            scheduleRenderConnections(ctx);
        });
    }

    // Listen for resize from indicator drag
    card.addEventListener('card-resized', ((e: CustomEvent) => {
        const { path: p, width: w, height: h } = e.detail;
        const state = ctx.snap().context;
        const ch = state.currentCommitHash || 'allfiles';
        ctx.actor.send({ type: 'RESIZE_CARD', path: p, width: w, height: h });
        savePosition(ctx, ch, p, parseInt(card.style.left) || 0, parseInt(card.style.top) || 0, w, h);
        renderConnections(ctx);
    }) as EventListener);

    return card;
}


// ─── Build file content HTML with optional line limiting ─
// When isExpanded=false, only render VISIBLE_LINE_LIMIT lines to keep DOM small.
// When isExpanded=true (F key), render all lines for full scrolling.
export function _buildFileContentHTML(
    content: string,
    layerSections: any,
    addedLines: Set<number>,
    deletedBeforeLine: Map<number, string[]>,
    isAllAdded: boolean,
    isAllDeleted: boolean,
    isExpanded: boolean,
    totalFileLines: number
): string {
    const { filteredContent, visibleLineIndices } = filterFileContentByLayer(content, layerSections);
    const lines = content.split('\n');
    const totalVisible = Array.from(visibleLineIndices).length;
    const limit = isExpanded ? Infinity : VISIBLE_LINE_LIMIT;
    let code = '';
    let renderedCount = 0;

    for (let i = 0; i < lines.length; i++) {
        if (!visibleLineIndices.has(i)) continue;
        if (renderedCount >= limit) break;

        const line = lines[i];
        const lineNum = i + 1;
        const lineClass = isAllAdded ? 'diff-add'
            : isAllDeleted ? 'diff-del'
                : addedLines.has(lineNum) ? 'diff-add'
                    : 'diff-ctx';
        const hasDel = deletedBeforeLine.has(lineNum);
        const delCount = hasDel ? deletedBeforeLine.get(lineNum)!.length : 0;
        const delAttr = hasDel ? ` data-del-count="${delCount}"` : '';
        const delLines = hasDel ? ` data-del-lines="${encodeURIComponent(JSON.stringify(deletedBeforeLine.get(lineNum)))}"` : '';
        code += `<span class="diff-line ${lineClass}${hasDel ? ' has-deleted' : ''}" data-line="${lineNum}"${delAttr}${delLines}><span class="line-num">${String(lineNum).padStart(4, ' ')}</span>${escapeHtml(line)}</span>\n`;
        renderedCount++;
    }

    const hiddenCount = totalVisible - renderedCount;
    // Invisible sentinel for IntersectionObserver auto-loading (no visible text)
    const truncNote = hiddenCount > 0
        ? `<span class="more-lines" data-auto-expand="true" style="display:block;height:1px;"></span>`
        : '';
    return `<div class="file-content-preview"><pre><code>${code}</code></pre>${truncNote}</div>`;
}

// ─── Create all-file card (working tree) ────────────────
export function createAllFileCard(ctx: CanvasContext, file: any, x: number, y: number, savedSize: any, skipInteraction = false): HTMLElement {
    const card = document.createElement('div');
    card.className = 'file-card';
    // Guard against NaN/undefined positions (corrupted position records)
    const safeX = isNaN(x) ? 0 : x;
    const safeY = isNaN(y) ? 0 : y;
    card.style.left = `${safeX}px`;
    card.style.top = `${safeY}px`;
    card.dataset.path = file.path;

    if (savedSize) {
        card.style.width = `${savedSize.width}px`;
        card.style.height = `${savedSize.height}px`;
        card.style.maxHeight = `${savedSize.height}px`;
    }

    const ext = file.ext || '';
    const iconClass = getFileIconClass(ext);
    const addedLines: Set<number> = file.addedLines || new Set();
    const isAllAdded = file.status === 'added';
    const isAllDeleted = file.status === 'deleted';

    const deletedBeforeLine: Map<number, string[]> = file.deletedBeforeLine || new Map();

    // All files are now same fixed size - no expand persistence

    let contentHTML = '';
    let useCanvasText = false;
    let canvasOptions: any = null;

    if (file.isBinary) {
        contentHTML = `<div class="file-content-preview"><pre><code><span class="error-notice">Binary file</span></code></pre></div>`;
    } else if (file.content) {
        if (ctx.useCanvasText) {
            useCanvasText = true;
            canvasOptions = {
                content: file.content,
                addedLines,
                deletedBeforeLine,
                isAllAdded,
                isAllDeleted,
                visibleLineIndices: filterFileContentByLayer(file.content, file.layerSections).visibleLineIndices
            };
            contentHTML = `<div class="file-content-preview canvas-container" style="position:relative; height: 100%; overflow: auto; background: var(--bg-card);"></div>`;
        } else {
            contentHTML = _buildFileContentHTML(file.content, file.layerSections, addedLines, deletedBeforeLine, isAllAdded, isAllDeleted, false, file.lines);
        }
    } else {
        contentHTML = `<div class="file-content-preview"><pre><code><span class="error-notice">Could not read file</span></code></pre></div>`;
    }


    const dir = file.path.includes('/') ? file.path.split('/').slice(0, -1).join('/') : '';

    // Status badge for changed files
    const statusColors: Record<string, string> = { added: '#22c55e', modified: '#eab308', deleted: '#ef4444', renamed: '#60a5fa', copied: '#a78bfa' };
    const statusBadge = file.status && file.status !== 'unmodified'
        ? `<span style="font-size: 9px; color: ${statusColors[file.status] || 'var(--text-muted)'}; margin-left: 4px; text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(file.status)}${addedLines.size > 0 ? ` <span style="color:#22c55e">+${addedLines.size}</span>` : ''}${deletedBeforeLine.size > 0 ? ` <span style="color:#f87171">-${Array.from(deletedBeforeLine.values()).reduce((s, a) => s + a.length, 0)}</span>` : ''}</span>`
        : '';
    const metaInfo = file.status ? statusBadge : `<span style="font-size: 10px; color: var(--text-muted); margin-left: auto;">${file.lines} lines</span>`;

    card.innerHTML = `
        <div class="file-card-header">
            <div class="file-icon ${iconClass}">
                ${getFileIcon(file.type, ext)}
            </div>
            <span class="file-name">${escapeHtml(file.name)}</span>
            ${metaInfo}

        </div>
        <div class="file-card-body">
            <div class="file-path">${escapeHtml(dir)}</div>
            ${contentHTML}
        </div>
    `;

    // Store file data for re-rendering on expand/collapse
    cardFileData.set(card, file);

    setupConnectionDrag(ctx, card, file.path);
    // When managed by CardManager, skip legacy drag/resize/z-order setup
    // but ALWAYS attach context menu, double-click, and click-to-select
    if (!skipInteraction) {
        setupCardInteraction(ctx, card, 'allfiles');
    } else {
        // Context menu (right-click)
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showCardContextMenu(ctx, card, e.clientX, e.clientY);
        });
        // Double-click to open in editor modal
        card.addEventListener('dblclick', (e) => {
            if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).closest('button')) return;
            e.preventDefault();
            e.stopPropagation();
            const filePath = card.dataset.path;
            if (filePath) {
                const file = ctx.allFilesData?.find(f => f.path === filePath) ||
                    { path: filePath, name: filePath.split('/').pop(), lines: 0 };
                import('./file-modal').then(({ openFileModal }) => openFileModal(ctx, file));
            }
        });
        // Click to select (sync both XState and CardManager)
        card.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.connect-btn')) return;
            const filePath = card.dataset.path || '';
            const multi = e.shiftKey || e.ctrlKey;

            try {
                const { getCardManager } = require('./galaxydraw-bridge');
                const cm = getCardManager();
                if (cm) {
                    const alreadySelected = cm.selected.has(filePath);

                    if (multi) {
                        // Shift/Ctrl click: toggle selection
                        if (alreadySelected) {
                            cm.deselect(filePath);
                        } else {
                            cm.select(filePath, true);
                        }
                        ctx.actor.send({ type: 'SELECT_CARD', path: filePath, shift: true });
                    } else if (alreadySelected && cm.selected.size > 1) {
                        // Clicking already-selected card in a multi-selection:
                        // Don't deselect yet — user might be starting a multi-drag.
                        // Deselect on mouseup if no drag occurred.
                        let dragged = false;
                        const onMove = () => { dragged = true; };
                        const onUp = () => {
                            window.removeEventListener('mousemove', onMove);
                            window.removeEventListener('mouseup', onUp);
                            if (!dragged) {
                                // No drag happened — deselect all others
                                cm.deselectAll();
                                cm.select(filePath, false);
                                ctx.actor.send({ type: 'SELECT_CARD', path: filePath, shift: false });
                                updateSelectionHighlights(ctx);
                                updateArrangeToolbar(ctx);
                            }
                        };
                        window.addEventListener('mousemove', onMove);
                        window.addEventListener('mouseup', onUp);
                    } else {
                        // Normal click: deselect all, select this one
                        cm.select(filePath, false);
                        ctx.actor.send({ type: 'SELECT_CARD', path: filePath, shift: false });
                    }
                }
            } catch { }
            updateSelectionHighlights(ctx);
            updateArrangeToolbar(ctx);
        });
    }

    if (useCanvasText && canvasOptions) {
        const previewEl = card.querySelector('.canvas-container') as HTMLElement;
        if (previewEl) {
            import('./canvas-text').then(({ CanvasTextRenderer }) => {
                new CanvasTextRenderer(previewEl, canvasOptions);
            });
        }
    }

    const expandBtn = card.querySelector('.expand-btn');
    if (expandBtn) {
        expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openFileModal(ctx, file);
        });
    }

    // AI button → open chat
    const aiBtn = card.querySelector('.ai-btn');
    if (aiBtn) {
        aiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            _handleChatClick(ctx, file);
        });
    }

    const body = card.querySelector('.file-card-body') as HTMLElement;
    if (body) {
        body.addEventListener('scroll', () => {
            debounceSaveScroll(ctx, file.path, body.scrollTop);
            scheduleRenderConnections(ctx);
        });
    }

    // ── Auto-load truncated lines when scrolled into view ──
    const moreLinesEl = card.querySelector('.more-lines[data-auto-expand]') as HTMLElement;
    if (moreLinesEl && file.content && !file.isBinary) {
        const pre = card.querySelector('.file-content-preview pre') as HTMLElement;
        if (pre) {
            const observer = new IntersectionObserver((entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        observer.disconnect();
                        // Re-render with all lines (expanded)
                        const newHTML = _buildFileContentHTML(
                            file.content, file.layerSections, addedLines, deletedBeforeLine,
                            isAllAdded, isAllDeleted, true, file.lines
                        );
                        const preview = card.querySelector('.file-content-preview');
                        if (preview) preview.outerHTML = newHTML;
                    }
                }
            }, { root: pre, rootMargin: '200px' });
            observer.observe(moreLinesEl);
        }
    }

    // ── Diff marker strip (scrollbar annotations for changed lines) ──
    if ((addedLines.size > 0 || deletedBeforeLine.size > 0) && !isAllAdded && file.content) {
        const totalLines = file.content.split('\n').length;
        _buildDiffMarkerStrip(card, body, addedLines, totalLines, deletedBeforeLine, file.hunks);
    }

    // ── Deleted lines hover overlay ──
    if (deletedBeforeLine.size > 0) {
        _setupDeletedLinesOverlay(card);
    }

    // Listen for resize from indicator drag
    card.addEventListener('card-resized', ((e: CustomEvent) => {
        const { path: p, width: w, height: h } = e.detail;
        const state = ctx.snap().context;
        const ch = state.currentCommitHash || 'allfiles';
        ctx.actor.send({ type: 'RESIZE_CARD', path: p, width: w, height: h });
        savePosition(ctx, ch, p, parseInt(card.style.left) || 0, parseInt(card.style.top) || 0, w, h);
        renderConnections(ctx);
    }) as EventListener);

    return card;
}

// ─── File expand modal (extracted to file-modal.tsx) ─────
import { openFileModal } from './file-modal';
export { openFileModal };

// ─── Diff markers & card expand (extracted modules) ─────
export { buildDiffMarkerStrip, scrollToLine, setupDeletedLinesOverlay } from './card-diff-markers';
export { changeCardsFontSize, toggleCardExpand, expandCardByPath, fitScreenSize, updateHiddenLinesIndicator } from './card-expand';


