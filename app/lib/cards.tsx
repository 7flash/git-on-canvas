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

// ─── Constants ──────────────────────────────────────────
const CORNER_CURSORS = { tl: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', br: 'nwse-resize' };

// Max lines rendered in DOM for collapsed (folded) cards.
// Files with more lines than this will show a truncated view until expanded with F.
// This is the #1 performance optimization — a 10K-line file produces 10K <span> elements
// which all participate in layout during pan/zoom, crushing frame rate.
const VISIBLE_LINE_LIMIT = 120;

// Store file data on cards for re-rendering when expanding/collapsing
const cardFileData = new WeakMap<HTMLElement, any>();

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

    // ── Double-click to zoom into file ──
    card.addEventListener('dblclick', (e) => {
        // Don't trigger on buttons
        if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).closest('button')) return;
        e.preventDefault();
        e.stopPropagation();

        const filePath = card.dataset.path;
        if (filePath) {
            jumpToFile(ctx, filePath);
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
                <button className="connect-btn ai-btn" title="Ask AI about this file" data-path={file.path}>AI</button>
                <button className="connect-btn expand-btn" title="Expand file (selectable text)" data-path={file.path}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                </button>
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
            if (filePath) jumpToFile(ctx, filePath);
        });
        card.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.connect-btn')) return;
            const filePath = card.dataset.path || '';
            const multi = e.shiftKey || e.ctrlKey;
            ctx.actor.send({ type: 'SELECT_CARD', path: filePath, shift: multi });
            import('./galaxydraw-bridge').then(({ getCardManager }) => {
                const cm = getCardManager();
                if (cm) cm.select(filePath, multi);
            });
            updateSelectionHighlights(ctx);
            updateArrangeToolbar(ctx);
        });
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
function _buildFileContentHTML(
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
    const truncNote = hiddenCount > 0
        ? `<span class="more-lines" data-auto-expand="true">${hiddenCount.toLocaleString()} more lines · scroll to load</span>`
        : '';
    return `<div class="file-content-preview"><pre><code>${code}</code></pre>${truncNote}</div>`;
}

// ─── Create all-file card (working tree) ────────────────
export function createAllFileCard(ctx: CanvasContext, file: any, x: number, y: number, savedSize: any, skipInteraction = false): HTMLElement {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
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

    // Check if this file was previously expanded (persisted across refreshes)
    // Uses positions-based system for server sync, falls back to legacy localStorage
    const wasExpanded = isPathExpandedInPositions(ctx, file.path) || isPathExpanded(file.path);

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
            contentHTML = `<div class="file-content-preview canvas-container" style="position:relative; height: 100%; overflow: auto; background: var(--bg-card); display: block -webkit-box;"></div>`;
        } else {
            contentHTML = _buildFileContentHTML(file.content, file.layerSections, addedLines, deletedBeforeLine, isAllAdded, isAllDeleted, wasExpanded, file.lines);
        }
    } else {
        contentHTML = `<div class="file-content-preview"><pre><code><span class="error-notice">Could not read file</span></code></pre></div>`;
    }

    // If previously expanded, override card dimensions
    if (wasExpanded) {
        card.dataset.expanded = 'true';
        card.style.maxHeight = 'none';
        // Use a tall default for expanded cards (will be adjusted by viewport in toggleCardExpand)
        const expandHeight = Math.max(600, (window.innerHeight || 800) - 40);
        card.style.height = `${expandHeight}px`;
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
            <button class="connect-btn ai-btn" title="Ask AI about this file" data-path="${escapeHtml(file.path)}">AI</button>
            <button class="connect-btn expand-btn" title="Expand file (selectable text)" data-path="${escapeHtml(file.path)}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                </svg>
            </button>
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
        // Double-click to zoom into file
        card.addEventListener('dblclick', (e) => {
            if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).closest('button')) return;
            e.preventDefault();
            e.stopPropagation();
            const filePath = card.dataset.path;
            if (filePath) jumpToFile(ctx, filePath);
        });
        // Click to select (sync both XState and CardManager)
        card.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.connect-btn')) return;
            const filePath = card.dataset.path || '';
            const multi = e.shiftKey || e.ctrlKey;
            ctx.actor.send({ type: 'SELECT_CARD', path: filePath, shift: multi });
            // Also sync CardManager's selection set for multi-drag
            import('./galaxydraw-bridge').then(({ getCardManager }) => {
                const cm = getCardManager();
                if (cm) cm.select(filePath, multi);
            });
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


// ─── Diff marker strip (scrollbar annotations) ─────────
function _buildDiffMarkerStrip(card: HTMLElement, body: HTMLElement, addedLines: Set<number>, totalLines: number, deletedBeforeLine?: Map<number, string[]>, fileHunks?: any[]) {
    if (!body || totalLines === 0) return;

    const strip = document.createElement('div');
    strip.className = 'diff-marker-strip';

    // Helper: merge line numbers into contiguous regions (gap of 4 to approximate hunks)
    function mergeIntoRegions(lineNums: number[], gap = 4): { start: number; end: number }[] {
        const sorted = lineNums.sort((a, b) => a - b);
        const regions: { start: number; end: number }[] = [];
        for (const line of sorted) {
            const last = regions[regions.length - 1];
            if (last && line <= last.end + gap) {
                last.end = line;
            } else {
                regions.push({ start: line, end: line });
            }
        }
        return regions;
    }

    // Green markers for added lines
    const addedRegions = mergeIntoRegions(Array.from(addedLines));
    for (const region of addedRegions) {
        const topPct = ((region.start - 1) / totalLines) * 100;
        const heightPct = Math.max(0.5, ((region.end - region.start + 1) / totalLines) * 100);

        const marker = document.createElement('div');
        marker.className = 'diff-marker diff-marker--add';
        marker.style.top = `${topPct}%`;
        marker.style.height = `${heightPct}%`;
        marker.title = region.start === region.end
            ? `Added: line ${region.start}`
            : `Added: lines ${region.start}–${region.end}`;

        marker.addEventListener('click', (e) => {
            e.stopPropagation();
            _scrollToLine(body, region.start, totalLines);
        });

        strip.appendChild(marker);
    }

    // Red markers for deleted line locations
    if (deletedBeforeLine && deletedBeforeLine.size > 0) {
        const deletedRegions = mergeIntoRegions(Array.from(deletedBeforeLine.keys()));
        for (const region of deletedRegions) {
            const topPct = ((region.start - 1) / totalLines) * 100;
            // Deleted markers are thin indicators (they don't occupy real lines)
            const heightPct = Math.max(0.5, ((region.end - region.start + 1) / totalLines) * 100);

            const marker = document.createElement('div');
            marker.className = 'diff-marker diff-marker--del';
            marker.style.top = `${topPct}%`;
            marker.style.height = `${heightPct}%`;
            // Count total deleted lines in this region
            let delCount = 0;
            for (let ln = region.start; ln <= region.end; ln++) {
                delCount += (deletedBeforeLine.get(ln) || []).length;
            }
            marker.title = `${delCount} deleted line${delCount > 1 ? 's' : ''} near line ${region.start}`;

            marker.addEventListener('click', (e) => {
                e.stopPropagation();
                _scrollToLine(body, region.start, totalLines);
            });

            strip.appendChild(marker);
        }
    }

    // Collect all change regions for navigation
    // Build merged regions from all changed lines (added + deleted locations)
    const allChangedLines = [
        ...Array.from(addedLines),
        ...(deletedBeforeLine ? Array.from(deletedBeforeLine.keys()) : [])
    ];
    const allRegions = mergeIntoRegions(allChangedLines);

    // Build navigation regions: prefer actual git hunks, fallback to merged line regions
    const navRegions: { start: number; end: number }[] = fileHunks && fileHunks.length > 0
        ? fileHunks.map((h: any) => ({ start: h.newStart, end: h.newStart + (h.newCount || 1) - 1 }))
        : allRegions;

    // Insert nav buttons inline inside the .file-path element
    if (navRegions.length > 0) {
        let currentIdx = -1;

        const filePath = body.querySelector('.file-path') as HTMLElement;
        if (filePath) {
            // Make file-path a flex container
            filePath.style.display = 'flex';
            filePath.style.alignItems = 'center';
            filePath.style.justifyContent = 'space-between';

            // Wrap existing text in a span to keep it on the left
            const pathText = filePath.textContent || '';
            filePath.textContent = '';
            const pathSpan = document.createElement('span');
            pathSpan.textContent = pathText;
            pathSpan.style.overflow = 'hidden';
            pathSpan.style.textOverflow = 'ellipsis';
            filePath.appendChild(pathSpan);

            // Create nav group on the right
            const navGroup = document.createElement('span');
            navGroup.className = 'diff-nav-inline';
            navGroup.title = `${navRegions.length} change${navRegions.length > 1 ? 's' : ''}`;

            const navLabel = document.createElement('span');
            navLabel.className = 'diff-nav-label';
            navLabel.textContent = `—/${navRegions.length}`;

            const navUp = document.createElement('button');
            navUp.className = 'diff-nav-btn';
            navUp.textContent = '▲';
            navUp.title = 'Previous change';
            navUp.addEventListener('click', (e) => {
                e.stopPropagation();
                if (currentIdx <= 0) currentIdx = navRegions.length - 1;
                else currentIdx--;
                _scrollToLine(body, navRegions[currentIdx].start, totalLines);
                navLabel.textContent = `${currentIdx + 1}/${navRegions.length}`;
            });

            const navDown = document.createElement('button');
            navDown.className = 'diff-nav-btn';
            navDown.textContent = '▼';
            navDown.title = 'Next change';
            navDown.addEventListener('click', (e) => {
                e.stopPropagation();
                if (currentIdx >= navRegions.length - 1) currentIdx = 0;
                else currentIdx++;
                _scrollToLine(body, navRegions[currentIdx].start, totalLines);
                navLabel.textContent = `${currentIdx + 1}/${navRegions.length}`;
            });

            navGroup.appendChild(navUp);
            navGroup.appendChild(navLabel);
            navGroup.appendChild(navDown);
            filePath.appendChild(navGroup);
        }
    }

    // Append strip to card (not body) so it doesn't scroll with content
    card.appendChild(strip);
}

// ─── Deleted lines hover overlay ────────────────────────
function _setupDeletedLinesOverlay(card: HTMLElement) {
    let overlay: HTMLElement | null = null;
    let hideTimeout: any = null;

    card.addEventListener('mouseover', (e) => {
        const target = e.target as HTMLElement;
        // Check if hovering over a line-num inside a .has-deleted line
        const lineNum = target.closest('.line-num');
        const diffLine = target.closest('.has-deleted') as HTMLElement;
        if (!lineNum || !diffLine) return;

        const delLinesRaw = diffLine.dataset.delLines;
        if (!delLinesRaw) return;

        if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }

        try {
            const deletedLines: string[] = JSON.parse(decodeURIComponent(delLinesRaw));
            if (deletedLines.length === 0) return;

            // Remove old overlay
            if (overlay) overlay.remove();

            overlay = document.createElement('div');
            overlay.className = 'deleted-lines-overlay';

            const header = document.createElement('div');
            header.className = 'deleted-overlay-header';
            header.textContent = `${deletedLines.length} deleted line${deletedLines.length > 1 ? 's' : ''}`;
            overlay.appendChild(header);

            const pre = document.createElement('pre');
            const code = document.createElement('code');
            // Parse the hunk to find actual old line numbers for the deleted lines
            const lineNumAttr = parseInt(diffLine.dataset.line || '0');
            // Show deleted lines with their actual old-file line numbers
            // We store oldStart in the hunk — estimate by subtracting from current position
            code.innerHTML = deletedLines.map((line, i) =>
                `<span class="diff-line diff-del"><span class="line-num del-line-num">  −</span>${escapeHtml(line)}</span>`
            ).join('\n');
            pre.appendChild(code);
            overlay.appendChild(pre);

            // Position relative to the line element
            const lineRect = diffLine.getBoundingClientRect();
            const cardRect = card.getBoundingClientRect();
            overlay.style.top = `${lineRect.top - cardRect.top - overlay.offsetHeight}px`;
            overlay.style.left = '50px';  // Offset past line numbers

            card.appendChild(overlay);

            // Reposition after render (to know actual height)
            requestAnimationFrame(() => {
                if (!overlay) return;
                const overlayH = overlay.offsetHeight;
                const yPos = lineRect.top - cardRect.top;
                // Show above the line, or below if not enough room
                if (yPos - overlayH > 36) {
                    overlay.style.top = `${yPos - overlayH}px`;
                } else {
                    overlay.style.top = `${yPos + lineRect.height}px`;
                }
            });

            overlay.addEventListener('mouseenter', () => {
                if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
            });
            overlay.addEventListener('mouseleave', () => {
                hideTimeout = setTimeout(() => {
                    if (overlay) { overlay.remove(); overlay = null; }
                }, 200);
            });
        } catch (err) { /* ignore parse errors */ }
    });

    card.addEventListener('mouseout', (e) => {
        const target = e.target as HTMLElement;
        const lineNum = target.closest('.line-num');
        const diffLine = target.closest('.has-deleted');
        if (!lineNum || !diffLine) return;

        hideTimeout = setTimeout(() => {
            if (overlay) { overlay.remove(); overlay = null; }
        }, 300);
    });
}

function _scrollToLine(body: HTMLElement, lineNum: number, totalLines: number) {
    const lineEl = body.querySelector(`.diff-line[data-line="${lineNum}"]`) as HTMLElement;
    const pre = body.querySelector('.file-content-preview pre') as HTMLElement;
    if (!pre) return;

    if (lineEl) {
        // getBoundingClientRect() returns viewport coordinates (affected by CSS transform/zoom).
        // pre.scrollTop works in LOCAL content coordinates (unaffected by zoom).
        // Compute the effective zoom from rendered vs logical dimensions.
        const preRect = pre.getBoundingClientRect();
        const zoom = preRect.height / pre.clientHeight || 1;
        const lineRect = lineEl.getBoundingClientRect();
        // Convert viewport delta to content delta by dividing by zoom
        pre.scrollTop += (lineRect.top - preRect.top) / zoom;
    } else {
        // Fallback to percentage-based scroll
        const pct = (lineNum - 1) / totalLines;
        pre.scrollTop = pct * pre.scrollHeight;
    }
}

// ─── Hidden lines indicator ─────────────────────────────
function _updateHiddenLinesIndicator(card: HTMLElement, _totalLines?: number) {
    const body = card.querySelector('.file-card-body') as HTMLElement;
    if (!body) return;

    let indicator = card.querySelector('.hidden-lines-indicator') as HTMLElement;

    // Count actual lines in the DOM
    const lineEls = card.querySelectorAll('.diff-line');
    const totalLines = _totalLines && _totalLines > 0 ? _totalLines : lineEls.length;
    if (totalLines === 0) {
        if (indicator) indicator.style.display = 'none';
        return;
    }

    // Calculate how many lines fit in the visible card area
    const cardH = card.offsetHeight;
    const headerH = (card.querySelector('.file-card-header') as HTMLElement)?.offsetHeight || 36;
    const pathH = (card.querySelector('.file-path') as HTMLElement)?.offsetHeight || 18;
    const availableH = cardH - headerH - pathH - 8;
    // Get current font size for accurate line count
    const pre = body.querySelector('.file-content-preview pre') as HTMLElement;
    const fontSize = pre ? parseFloat(getComputedStyle(pre).fontSize) : 8.5;
    const lineHeight = fontSize * 1.1;
    const visibleLines = Math.floor(availableH / lineHeight);
    const hiddenLines = totalLines - visibleLines;

    if (hiddenLines > 2) {
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'hidden-lines-indicator';
            card.appendChild(indicator);
        }
        indicator.textContent = `⋯ ${hiddenLines} more lines · Ctrl+/− to zoom`;
        indicator.style.display = '';
    } else if (indicator) {
        indicator.style.display = 'none';
    }
}

// ─── Change card font size (Ctrl +/-) ─────────────────
export function changeCardsFontSize(ctx: CanvasContext, delta: number) {
    const selected = ctx.snap().context.selectedCards;
    const targets = selected.length > 0 ? selected : Array.from(ctx.fileCards.keys());

    targets.forEach(path => {
        const card = ctx.fileCards.get(path);
        if (!card) return;
        const pre = card.querySelector('.file-content-preview pre') as HTMLElement;
        if (!pre) return;
        const current = parseFloat(getComputedStyle(pre).fontSize) || 8.5;
        const newSize = Math.max(5, Math.min(24, current + delta));
        pre.style.fontSize = `${newSize}px`;
        pre.style.lineHeight = '1.1';
        // Update hidden lines count since visible lines changed
        _updateHiddenLinesIndicator(card, 0);
    });
    const action = delta > 0 ? 'increased' : 'decreased';

}

// ─── Toggle card expand/collapse ────────────────────────
const DEFAULT_CARD_HEIGHT = 700;

export function toggleCardExpand(ctx: CanvasContext) {
    measure('cards:toggleExpand', () => {
        const selected = ctx.snap().context.selectedCards;
        if (selected.length === 0) return;

        // Determine if we're expanding or collapsing based on first card
        const firstCard = ctx.fileCards.get(selected[0]);
        if (!firstCard) return;
        const willExpand = firstCard.dataset.expanded !== 'true';

        // Uniform expand height = viewport height (for consistent look)
        const vpRect = ctx.canvasViewport.getBoundingClientRect();
        const expandHeight = Math.max(600, vpRect.height - 40);

        selected.forEach(path => {
            const card = ctx.fileCards.get(path);
            if (!card) return;

            const body = card.querySelector('.file-card-body') as HTMLElement;
            if (!body) return;

            if (!willExpand) {
                // Collapse back to default height
                card.style.height = `${DEFAULT_CARD_HEIGHT}px`;
                card.style.maxHeight = `${DEFAULT_CARD_HEIGHT}px`;
                card.dataset.expanded = 'false';
                setPathExpandedInPositions(ctx, path, false);
            } else {
                // Expand to uniform height
                card.style.height = `${expandHeight}px`;
                card.style.maxHeight = 'none';
                card.dataset.expanded = 'true';
                setPathExpandedInPositions(ctx, path, true);
            }

            // Re-render content: expanded shows ALL lines, collapsed shows VISIBLE_LINE_LIMIT
            const file = cardFileData.get(card);
            if (file && file.content && !file.isBinary) {
                if (!ctx.useCanvasText) {
                    const addedLines: Set<number> = file.addedLines || new Set();
                    const deletedBeforeLine: Map<number, string[]> = file.deletedBeforeLine || new Map();
                    const isAllAdded = file.status === 'added';
                    const isAllDeleted = file.status === 'deleted';
                    const preview = body.querySelector('.file-content-preview');
                    if (preview) {
                        const newHTML = _buildFileContentHTML(
                            file.content, file.layerSections, addedLines, deletedBeforeLine,
                            isAllAdded, isAllDeleted, willExpand, file.lines
                        );
                        preview.outerHTML = newHTML;
                    }
                }
            }

            const state = ctx.snap().context;
            const commitHash = state.currentCommitHash || 'allfiles';
            const newH = card.offsetHeight;
            ctx.actor.send({ type: 'RESIZE_CARD', path, width: card.offsetWidth, height: newH });
            savePosition(ctx, commitHash, path, parseInt(card.style.left) || 0, parseInt(card.style.top) || 0, card.offsetWidth, newH);

            requestAnimationFrame(() => _updateHiddenLinesIndicator(card, 0));
        });

        updateMinimap(ctx);
        renderConnections(ctx);

    });
}

/** Expand a single card by path (used for auto-expanding changed files) */
export function expandCardByPath(ctx: CanvasContext, path: string) {
    const card = ctx.fileCards.get(path);
    if (!card || card.dataset.expanded === 'true') return;

    const body = card.querySelector('.file-card-body') as HTMLElement;
    if (!body) return;

    const vpRect = ctx.canvasViewport.getBoundingClientRect();
    const expandHeight = Math.max(600, vpRect.height - 40);

    card.style.height = `${expandHeight}px`;
    card.style.maxHeight = 'none';
    card.dataset.expanded = 'true';
    setPathExpandedInPositions(ctx, path, true);

    const file = cardFileData.get(card);
    if (file && file.content && !file.isBinary) {
        if (!ctx.useCanvasText) {
            const addedLines: Set<number> = file.addedLines || new Set();
            const deletedBeforeLine: Map<number, string[]> = file.deletedBeforeLine || new Map();
            const isAllAdded = file.status === 'added';
            const isAllDeleted = file.status === 'deleted';
            const preview = body.querySelector('.file-content-preview');
            if (preview) {
                const newHTML = _buildFileContentHTML(
                    file.content, file.layerSections, addedLines, deletedBeforeLine,
                    isAllAdded, isAllDeleted, true, file.lines
                );
                preview.outerHTML = newHTML;
            }
        }
    }

    const state = ctx.snap().context;
    const commitHash = state.currentCommitHash || 'allfiles';
    ctx.actor.send({ type: 'RESIZE_CARD', path, width: card.offsetWidth, height: expandHeight });
    savePosition(ctx, commitHash, path, parseInt(card.style.left) || 0, parseInt(card.style.top) || 0, card.offsetWidth, expandHeight);
    requestAnimationFrame(() => _updateHiddenLinesIndicator(card, 0));
}

// ─── Fit selected cards to screen viewport ──────────────
export function fitScreenSize(ctx: CanvasContext) {
    measure('cards:fitScreen', () => {
        const selected = ctx.snap().context.selectedCards;
        if (selected.length === 0) {

            return;
        }

        const viewport = ctx.canvasViewport;
        if (!viewport) return;

        const state = ctx.snap().context;
        const vh = viewport.clientHeight / state.zoom;

        // Fit height only — keep existing width
        const padding = 40;
        const fitH = Math.max(120, vh - padding * 2);

        selected.forEach(path => {
            const card = ctx.fileCards.get(path);
            if (!card) return;

            const currentW = card.offsetWidth;

            card.style.height = `${fitH}px`;
            card.style.maxHeight = 'none';

            const commitHash = state.currentCommitHash || 'allfiles';
            ctx.actor.send({ type: 'RESIZE_CARD', path, width: currentW, height: fitH });
            savePosition(ctx, commitHash, path, parseInt(card.style.left) || 0, parseInt(card.style.top) || 0, currentW, fitH);

            requestAnimationFrame(() => _updateHiddenLinesIndicator(card, 0));
        });

        updateMinimap(ctx);
        renderConnections(ctx);

    });
}
