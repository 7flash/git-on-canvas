// @ts-nocheck
/**
 * File cards — creation (diff + all-files), interaction (click/drag/resize),
 * selection, arrangement, and the file modal.
 */
import { measure } from 'measure-fn';
import { render } from 'melina/client';
import type { CanvasContext } from './context';
import { escapeHtml, getFileIcon, getFileIconClass, showToast } from './utils';
import { savePosition, getPositionKey } from './positions';
import { updateMinimap } from './canvas';
import { renderConnections, setupConnectionDrag } from './connections';
import { highlightSyntax, buildModalDiffHTML } from './syntax';
import { openFileChatInModal } from './chat';

// ─── Constants ──────────────────────────────────────────
const CORNER_CURSORS = { tl: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', br: 'nwse-resize' };

// ─── Selection highlights ───────────────────────────────
export function updateSelectionHighlights(ctx: CanvasContext) {
    const selected = ctx.snap().context.selectedCards;
    ctx.fileCards.forEach((card, path) => {
        card.classList.toggle('selected', selected.includes(path));
    });
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

// ─── Setup card interaction (click-select + corner-resize + drag) ─
export function setupCardInteraction(ctx: CanvasContext, card: HTMLElement, commitHash: string) {
    let action = null; // null | 'resize' | 'move' | 'pending'
    let startX: number, startY: number;
    let resizeStartW: number, resizeStartH: number, resizeStartLeft: number, resizeStartTop: number;
    let resizeCorner: string | null = null;
    let moveStartPositions: any[] = [];
    let resizeTargets: { card: HTMLElement; path: string; startW: number; startH: number; startLeft: number; startTop: number }[] = [];
    let rafPending = false;
    const DRAG_THRESHOLD = 3;

    card.addEventListener('mousemove', (e) => {
        if (action) return;
        const state = ctx.snap().context;
        const selected = state.selectedCards;
        const isMulti = selected.length > 1;
        const corner = isNearCorner(e, card, ctx.CORNER_SIZE, state.zoom);

        if (corner && !isMulti) {
            card.style.cursor = CORNER_CURSORS[corner];
        } else {
            card.style.cursor = '';
        }
    });

    card.addEventListener('mouseleave', () => {
        if (!action) card.style.cursor = '';
    });

    function onMouseDown(e) {
        // Only respond to left-click (button 0). Middle-click/right-click should not start card interaction.
        if (e.button !== 0) return;
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        const bodyEl = e.target.closest('.file-card-body');
        if (bodyEl && (e.offsetX > e.target.clientWidth || e.offsetY > e.target.clientHeight)) return;

        e.stopPropagation();
        startX = e.clientX;
        startY = e.clientY;

        const state = ctx.snap().context;
        const selected = state.selectedCards;
        resizeCorner = isNearCorner(e, card, ctx.CORNER_SIZE, state.zoom);

        if (resizeCorner) {
            action = 'resize';
            resizeStartW = card.offsetWidth;
            resizeStartH = card.offsetHeight;
            resizeStartLeft = parseInt(card.style.left) || 0;
            resizeStartTop = parseInt(card.style.top) || 0;
            card.classList.add('resizing');
            document.body.style.cursor = CORNER_CURSORS[resizeCorner];

            // Collect all selected cards for multi-resize
            resizeTargets = [];
            const cardPath = card.dataset.path;
            if (selected.includes(cardPath) && selected.length > 1) {
                selected.forEach(path => {
                    const c = ctx.fileCards.get(path);
                    if (c) {
                        resizeTargets.push({
                            card: c,
                            path,
                            startW: c.offsetWidth,
                            startH: c.offsetHeight,
                            startLeft: parseInt(c.style.left) || 0,
                            startTop: parseInt(c.style.top) || 0,
                        });
                        c.classList.add('resizing');
                    }
                });
            } else {
                resizeTargets.push({
                    card,
                    path: cardPath,
                    startW: resizeStartW,
                    startH: resizeStartH,
                    startLeft: resizeStartLeft,
                    startTop: resizeStartTop,
                });
            }
        } else {
            action = 'pending';
        }

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
            card.style.cursor = 'grabbing';

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
                    renderConnections(ctx);
                    updateMinimap(ctx);
                });
            }
            return;
        }

        if (action === 'resize') {
            const minH = 120;
            const minW = 240;

            // Calculate new dimensions based on the primary card
            let newW, newH;
            if (resizeCorner === 'br') {
                newW = Math.max(minW, resizeStartW + dx);
                newH = Math.max(minH, resizeStartH + dy);
            } else if (resizeCorner === 'bl') {
                newW = Math.max(minW, resizeStartW - dx);
                newH = Math.max(minH, resizeStartH + dy);
            } else if (resizeCorner === 'tr') {
                newW = Math.max(minW, resizeStartW + dx);
                newH = Math.max(minH, resizeStartH - dy);
            } else if (resizeCorner === 'tl') {
                newW = Math.max(minW, resizeStartW - dx);
                newH = Math.max(minH, resizeStartH - dy);
            }

            // Apply to all resize targets
            resizeTargets.forEach(info => {
                info.card.style.width = `${newW}px`;
                info.card.style.height = `${newH}px`;
                info.card.style.maxHeight = 'none';
            });

            // Position adjustment only for the primary card (anchor)
            let newLeft = resizeStartLeft, newTop = resizeStartTop;
            if (resizeCorner === 'bl') {
                newLeft = resizeStartLeft + (resizeStartW - newW);
            } else if (resizeCorner === 'tr') {
                newTop = resizeStartTop + (resizeStartH - newH);
            } else if (resizeCorner === 'tl') {
                newLeft = resizeStartLeft + (resizeStartW - newW);
                newTop = resizeStartTop + (resizeStartH - newH);
            }
            card.style.left = `${newLeft}px`;
            card.style.top = `${newTop}px`;

            renderConnections(ctx);
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
        } else if (action === 'resize') {
            resizeTargets.forEach(info => {
                info.card.classList.remove('resizing');
                const x = parseInt(info.card.style.left) || 0;
                const y = parseInt(info.card.style.top) || 0;
                ctx.actor.send({ type: 'RESIZE_CARD', path: info.path, width: info.card.offsetWidth, height: info.card.offsetHeight });
                savePosition(ctx, commitHash, info.path, x, y, info.card.offsetWidth, info.card.offsetHeight);
            });
            document.body.style.cursor = '';
            resizeTargets = [];
        }

        action = null;
        resizeCorner = null;
    }

    card.addEventListener('mousedown', onMouseDown);

    // ── Right-click context menu ──
    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showCardContextMenu(ctx, card, e.clientX, e.clientY);
    });
}

// ─── Card context menu (JSX) ────────────────────────
function ContextMenu({ onAction }: { onAction: (action: string) => void }) {
    return (
        <>
            <button className="ctx-item" onClick={() => onAction('expand')}>↗️ Expand</button>
            <button className="ctx-item" onClick={() => onAction('fit-content')}>📏 Fit content</button>
            <button className="ctx-item" onClick={() => onAction('fit-screen')}>📺 Fit screen</button>
            <div className="ctx-divider"></div>
            <button className="ctx-item" onClick={() => onAction('history')}>🕰️ File history</button>
        </>
    );
}

function showCardContextMenu(ctx: CanvasContext, card: HTMLElement, x: number, y: number) {
    document.querySelector('.card-context-menu')?.remove();

    const filePath = card.dataset.path;
    const menu = document.createElement('div');
    menu.className = 'card-context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    function handleAction(action: string) {
        menu.remove();
        if (action === 'expand') {
            const state = ctx.snap().context;
            const file = state.commitFiles?.find(f => f.path === filePath) ||
                ctx.allFilesData?.find(f => f.path === filePath) ||
                { path: filePath, name: filePath.split('/').pop(), lines: 0 };
            openFileModal(ctx, file);
        } else if (action === 'fit-content') {
            ctx.actor.send({ type: 'SELECT_CARD', path: filePath, shift: false });
            updateSelectionHighlights(ctx);
            fitContentSize(ctx);
        } else if (action === 'fit-screen') {
            ctx.actor.send({ type: 'SELECT_CARD', path: filePath, shift: false });
            updateSelectionHighlights(ctx);
            fitScreenSize(ctx);
        } else if (action === 'history') {
            showFileHistory(ctx, filePath);
        }
    }

    render(<ContextMenu onAction={handleAction} />, menu);
    document.body.appendChild(menu);

    requestAnimationFrame(() => {
        const r = menu.getBoundingClientRect();
        if (r.right > window.innerWidth) menu.style.left = `${window.innerWidth - r.width - 8}px`;
        if (r.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - r.height - 8}px`;
    });

    const closeMenu = (e: MouseEvent) => {
        if (!menu.contains(e.target as Node)) {
            menu.remove();
            document.removeEventListener('mousedown', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
}

// ─── File history panel (JSX) ───────────────────────
function FileHistoryContent({ fileName, commits, error, loading, onClose, onSelect }: {
    fileName: string; commits: any[]; error?: string; loading: boolean;
    onClose: () => void; onSelect: (hash: string) => void;
}) {
    return (
        <>
            <div className="panel-header">
                <span className="panel-title">History: {fileName}</span>
                <button className="btn-ghost btn-xs" onClick={onClose}>✕</button>
            </div>
            <div className="file-history-list">
                {loading ? (
                    <div style="padding: 16px; color: var(--text-muted); font-size: 0.75rem;">Loading...</div>
                ) : error ? (
                    <div style="padding: 16px; color: var(--error); font-size: 0.75rem;">Error: {error}</div>
                ) : commits.length === 0 ? (
                    <div style="padding: 16px; color: var(--text-muted); font-size: 0.75rem;">No commits found for this file</div>
                ) : (
                    commits.map(c => (
                        <div key={c.hash} className="file-history-item" onClick={() => onSelect(c.hash)}>
                            <span className="file-history-hash">{c.shortHash}</span>
                            <span className="file-history-msg">{c.message}</span>
                            <span className="file-history-date">{new Date(c.date).toLocaleDateString()}</span>
                        </div>
                    ))
                )}
            </div>
        </>
    );
}

async function showFileHistory(ctx: CanvasContext, filePath: string) {
    const state = ctx.snap().context;
    if (!state.repoPath) {
        showToast('No repository loaded', 'error');
        return;
    }

    document.querySelector('.file-history-panel')?.remove();

    const panel = document.createElement('div');
    panel.className = 'file-history-panel';
    const fileName = filePath.split('/').pop() || filePath;

    function closePanel() { panel.remove(); }
    function selectCommitHash(hash: string) {
        import('./repo').then(({ selectCommit }) => {
            selectCommit(ctx, hash);
            panel.remove();
        });
    }

    // Initial loading state
    render(<FileHistoryContent fileName={fileName} commits={[]} loading={true} onClose={closePanel} onSelect={selectCommitHash} />, panel);
    document.querySelector('.canvas-area')?.appendChild(panel);

    try {
        const response = await fetch('/api/repo/file-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: state.repoPath, filePath, limit: 30 })
        });

        if (!response.ok) throw new Error('Failed to fetch history');
        const data = await response.json();

        render(<FileHistoryContent fileName={fileName} commits={data.commits} loading={false} onClose={closePanel} onSelect={selectCommitHash} />, panel);
    } catch (err) {
        render(<FileHistoryContent fileName={fileName} commits={[]} error={err.message} loading={false} onClose={closePanel} onSelect={selectCommitHash} />, panel);
    }
}

// ─── Arrangement functions ──────────────────────────────
function getSelectedCardsInfo(ctx: CanvasContext) {
    const selected = ctx.snap().context.selectedCards;
    const infos = [];
    selected.forEach(path => {
        const card = ctx.fileCards.get(path);
        if (card) {
            infos.push({
                path, card,
                x: parseFloat(card.style.left) || 0,
                y: parseFloat(card.style.top) || 0,
                w: card.offsetWidth || 580,
                h: card.offsetHeight || 400,
            });
        }
    });
    infos.sort((a, b) => a.x - b.x || a.y - b.y);
    return infos;
}

export function arrangeRow(ctx: CanvasContext) {
    measure('arrange:row', () => {
        const infos = getSelectedCardsInfo(ctx);
        if (infos.length < 2) return;
        const startX = Math.min(...infos.map(i => i.x));
        const startY = Math.min(...infos.map(i => i.y));
        const gap = 40;
        let curX = startX;
        const commitHash = ctx.snap().context.currentCommitHash || 'allfiles';
        infos.forEach(info => {
            info.card.style.left = `${curX}px`;
            info.card.style.top = `${startY}px`;
            savePosition(ctx, commitHash, info.path, curX, startY);
            curX += info.w + gap;
        });
        renderConnections(ctx);
        updateMinimap(ctx);
        showToast(`Arranged ${infos.length} files in a row`, 'info');
    });
}

export function arrangeColumn(ctx: CanvasContext) {
    measure('arrange:column', () => {
        const infos = getSelectedCardsInfo(ctx);
        if (infos.length < 2) return;
        const startX = Math.min(...infos.map(i => i.x));
        const startY = Math.min(...infos.map(i => i.y));
        const gap = 40;
        let curY = startY;
        const commitHash = ctx.snap().context.currentCommitHash || 'allfiles';
        infos.forEach(info => {
            info.card.style.left = `${startX}px`;
            info.card.style.top = `${curY}px`;
            savePosition(ctx, commitHash, info.path, startX, curY);
            curY += info.h + gap;
        });
        renderConnections(ctx);
        updateMinimap(ctx);
        showToast(`Arranged ${infos.length} files in a column`, 'info');
    });
}

export function arrangeGrid(ctx: CanvasContext) {
    measure('arrange:grid', () => {
        const infos = getSelectedCardsInfo(ctx);
        if (infos.length < 2) return;
        const cols = Math.ceil(Math.sqrt(infos.length));
        const startX = Math.min(...infos.map(i => i.x));
        const startY = Math.min(...infos.map(i => i.y));
        const gapX = 40, gapY = 40;

        const colWidths = [];
        const rowHeights = [];
        infos.forEach((info, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            colWidths[col] = Math.max(colWidths[col] || 0, info.w);
            rowHeights[row] = Math.max(rowHeights[row] || 0, info.h);
        });

        const commitHash = ctx.snap().context.currentCommitHash || 'allfiles';
        infos.forEach((info, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            let x = startX;
            for (let c = 0; c < col; c++) x += (colWidths[c] || 580) + gapX;
            let y = startY;
            for (let r = 0; r < row; r++) y += (rowHeights[r] || 400) + gapY;
            info.card.style.left = `${x}px`;
            info.card.style.top = `${y}px`;
            savePosition(ctx, commitHash, info.path, x, y);
        });

        renderConnections(ctx);
        updateMinimap(ctx);
        showToast(`Arranged ${infos.length} files in a ${cols}-col grid`, 'info');
    });
}

// ─── Scroll debounce ────────────────────────────────────
export function debounceSaveScroll(ctx: CanvasContext, filePath: string, scrollTop: number) {
    if (ctx.scrollTimers[filePath]) clearTimeout(ctx.scrollTimers[filePath]);
    ctx.scrollTimers[filePath] = setTimeout(() => {
        ctx.actor.send({ type: 'SAVE_SCROLL', path: filePath, scrollTop });
        savePosition(ctx, 'scroll', filePath, scrollTop, 0);
    }, 300);
}

// ─── Create file card (commit diff) ─────────────────────
export function createFileCard(ctx: CanvasContext, file: any, x: number, y: number, commitHash: string): HTMLElement {
    const card = document.createElement('div');
    card.className = `file-card file-card--${file.status || 'modified'}`;
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.dataset.path = file.path;

    // Apply saved size
    const posKey = getPositionKey(file.path, commitHash);
    if (ctx.positions.has(posKey)) {
        const pos = ctx.positions.get(posKey);
        if (pos.width) card.style.width = `${pos.width}px`;
        if (pos.height) {
            card.style.height = `${pos.height}px`;
            card.style.maxHeight = 'none';
        }
    }

    const ext = file.name.split('.').pop().toLowerCase();
    const iconClass = getFileIconClass(ext);

    const statusColors = { added: '#22c55e', modified: '#eab308', deleted: '#ef4444' };
    const statusLabels = { added: '+ ADDED', modified: '~ MODIFIED', deleted: '- DELETED' };
    const statusColor = statusColors[file.status] || '#a855f7';
    const statusLabel = statusLabels[file.status] || file.status?.toUpperCase() || 'CHANGED';

    let contentHTML = '';

    if (file.status === 'added' && file.content) {
        const lines = file.content.split('\n');
        const code = lines.map((line, i) =>
            `<span class="diff-line diff-add" data-line="${i + 1}"><span class="line-num">${String(i + 1).padStart(4, ' ')}</span>${escapeHtml(line)}</span>`
        ).join('\n');
        contentHTML = `<div class="file-content-preview"><pre><code>${code}</code></pre></div>`;

    } else if (file.status === 'deleted' && file.content) {
        const lines = file.content.split('\n');
        const code = lines.map((line, i) =>
            `<span class="diff-line diff-del" data-line="${i + 1}"><span class="line-num">${String(i + 1).padStart(4, ' ')}</span>${escapeHtml(line)}</span>`
        ).join('\n');
        contentHTML = `<div class="file-content-preview"><pre><code>${code}</code></pre></div>`;

    } else if (file.status === 'modified' && file.hunks && file.hunks.length > 0) {
        const hunksHTML = file.hunks.map(hunk => {
            const header = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${hunk.context ? ' ' + escapeHtml(hunk.context) : ''}`;
            let oldLine = hunk.oldStart;
            let newLine = hunk.newStart;

            const currentLines = [];
            const removedLines = [];

            hunk.lines.forEach(l => {
                if (l.type === 'add') {
                    const ln = newLine++;
                    currentLines.push(`<span class="diff-line diff-add" data-line="${ln}"><span class="line-num">${String(ln).padStart(4, ' ')}</span>${escapeHtml(l.content)}</span>`);
                } else if (l.type === 'del') {
                    const ln = oldLine++;
                    removedLines.push(`<span class="diff-line diff-del" data-line="${ln}"><span class="line-num">${String(ln).padStart(4, ' ')}</span>${escapeHtml(l.content)}</span>`);
                } else {
                    oldLine++; newLine++;
                    const ln = newLine - 1;
                    currentLines.push(`<span class="diff-line diff-ctx" data-line="${ln}"><span class="line-num">${String(ln).padStart(4, ' ')}</span>${escapeHtml(l.content)}</span>`);
                }
            });

            const removedPane = removedLines.length > 0
                ? `<div class="hunk-removed-pane"><pre><code>${removedLines.join('\n')}</code></pre></div>`
                : '';

            return `<div class="diff-hunk">
                <div class="diff-hunk-header">${header}</div>
                <div class="diff-hunk-body">
                    <div class="hunk-current-pane"><pre><code>${currentLines.join('\n')}</code></pre></div>
                    ${removedPane}
                </div>
            </div>`;
        }).join('');
        contentHTML = `<div class="file-content-preview">${hunksHTML}</div>`;

    } else if (file.contentError) {
        contentHTML = `<div class="file-content-preview"><pre><code><span class="error-notice">${escapeHtml(file.contentError)}</span></code></pre></div>`;
    } else {
        contentHTML = `<div class="file-content-preview"><pre><code><span class="error-notice">No changes to display</span></code></pre></div>`;
    }

    const hunkCount = file.hunks?.length || 0;
    const metaInfo = file.status === 'modified' && hunkCount > 0
        ? `${hunkCount} hunk${hunkCount > 1 ? 's' : ''}`
        : `${file.lines || 0} lines`;

    card.innerHTML = `
        <div class="file-card-header" style="border-left: 4px solid ${statusColor}">
            <div class="file-icon ${iconClass}">
                ${getFileIcon(file.type, ext)}
            </div>
            <span class="file-name">${escapeHtml(file.name)}</span>
            <span class="file-status" style="background: ${statusColor}20; color: ${statusColor}; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${statusLabel}</span>
            <span style="font-size: 10px; color: var(--text-muted); margin-left: auto;">${metaInfo}</span>
            <button class="connect-btn" title="Drag to connect to another file" data-path="${escapeHtml(file.path)}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 12h10" stroke-dasharray="3,2"/>
                </svg>
            </button>
            <button class="connect-btn expand-btn" title="Expand file (selectable text)" data-path="${escapeHtml(file.path)}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                </svg>
            </button>
        </div>
        <div class="file-card-body">
            <div class="file-path">${escapeHtml(file.path)}</div>
            ${contentHTML}
        </div>
    `;

    setupCardInteraction(ctx, card, commitHash);
    setupConnectionDrag(ctx, card, file.path);

    // Expand button → open modal
    const expandBtn = card.querySelector('.expand-btn');
    if (expandBtn) {
        expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openFileModal(ctx, file);
        });
    }

    // Scroll listener for connections
    const body = card.querySelector('.file-card-body');
    if (body) {
        body.addEventListener('scroll', () => {
            renderConnections(ctx);
            _updateHiddenLinesIndicator(card, file.lines || 0);
        });
    }

    // Hidden lines indicator (after render)
    requestAnimationFrame(() => _updateHiddenLinesIndicator(card, file.lines || 0));

    return card;
}

// ─── Create all-file card (working tree) ────────────────
export function createAllFileCard(ctx: CanvasContext, file: any, x: number, y: number, savedSize: any): HTMLElement {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.dataset.path = file.path;

    if (savedSize) {
        card.style.width = `${savedSize.width}px`;
        card.style.height = `${savedSize.height}px`;
        card.style.maxHeight = 'none';
    }

    const ext = file.ext || '';
    const iconClass = getFileIconClass(ext);

    let contentHTML = '';
    if (file.isBinary) {
        contentHTML = `<div class="file-content-preview"><pre><code><span class="error-notice">Binary file</span></code></pre></div>`;
    } else if (file.content) {
        const lines = file.content.split('\n');
        const code = lines.map((line, i) =>
            `<span class="diff-line diff-ctx" data-line="${i + 1}"><span class="line-num">${String(i + 1).padStart(4, ' ')}</span>${escapeHtml(line)}</span>`
        ).join('\n');
        const truncNote = file.lines > 10000 ? `<span class="more-lines">File too large (${file.lines.toLocaleString()} lines) — showing first 10,000</span>` : '';
        contentHTML = `<div class="file-content-preview"><pre><code>${code}</code></pre>${truncNote}</div>`;
    } else {
        contentHTML = `<div class="file-content-preview"><pre><code><span class="error-notice">Could not read file</span></code></pre></div>`;
    }

    const dir = file.path.includes('/') ? file.path.split('/').slice(0, -1).join('/') : '';

    card.innerHTML = `
        <div class="file-card-header">
            <div class="file-icon ${iconClass}">
                ${getFileIcon(file.type, ext)}
            </div>
            <span class="file-name">${escapeHtml(file.name)}</span>
            <span style="font-size: 10px; color: var(--text-muted); margin-left: auto;">${file.lines} lines</span>
            <button class="connect-btn" title="Drag to connect to another file" data-path="${escapeHtml(file.path)}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 12h10" stroke-dasharray="3,2"/>
                </svg>
            </button>
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

    setupConnectionDrag(ctx, card, file.path);
    setupCardInteraction(ctx, card, 'allfiles');

    const expandBtn = card.querySelector('.expand-btn');
    if (expandBtn) {
        expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openFileModal(ctx, file);
        });
    }

    const body = card.querySelector('.file-card-body');
    if (body) {
        body.addEventListener('scroll', () => {
            debounceSaveScroll(ctx, file.path, body.scrollTop);
            renderConnections(ctx);
        });
    }

    return card;
}

// ─── File expand modal ──────────────────────────────────
export function openFileModal(ctx: CanvasContext, file: any) {
    const modal = document.getElementById('filePreviewModal');
    const pathEl = document.getElementById('previewFilePath');
    const contentEl = document.getElementById('previewContent');
    const lineCountEl = document.getElementById('previewLineCount');
    const statusEl = document.getElementById('previewFileStatus');
    const tabsEl = document.getElementById('modalViewTabs');
    if (!modal || !pathEl || !contentEl) return;

    pathEl.textContent = file.path;
    contentEl.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">Loading...</span>';
    modal.classList.add('active');

    if (statusEl) {
        const statusColors = { added: '#22c55e', modified: '#eab308', deleted: '#ef4444' };
        const statusLabels = { added: 'ADDED', modified: 'MODIFIED', deleted: 'DELETED' };
        if (file.status && statusColors[file.status]) {
            statusEl.textContent = statusLabels[file.status];
            statusEl.style.display = '';
            statusEl.style.background = statusColors[file.status] + '20';
            statusEl.style.color = statusColors[file.status];
        } else {
            statusEl.style.display = 'none';
        }
    }

    if (lineCountEl) {
        lineCountEl.textContent = file.lines ? `${file.lines.toLocaleString()} lines` : '';
    }

    const hasDiff = !!(file.status && (file.hunks?.length > 0 || file.content));
    const rendered = { full: '', diff: '' };
    // Default to diff view for changed files, full view for unchanged
    let currentView = hasDiff ? 'diff' : 'full';

    function closeModal() {
        modal.classList.remove('active');
        document.removeEventListener('keydown', onEsc);
        if (tabsEl) {
            tabsEl.querySelectorAll('.modal-tab').forEach(t => {
                t.replaceWith(t.cloneNode(true));
            });
        }
    }

    function onEsc(e) {
        if (e.key === 'Escape') closeModal();
    }

    document.addEventListener('keydown', onEsc);
    document.getElementById('closePreview')?.addEventListener('click', closeModal, { once: true });
    modal.querySelector('.modal-backdrop')?.addEventListener('click', closeModal, { once: true });

    if (tabsEl) {
        const tabs = tabsEl.querySelectorAll('.modal-tab');
        tabs.forEach(tab => {
            if (tab.dataset.view === 'diff') {
                tab.style.display = hasDiff ? '' : 'none';
            }
            tab.classList.toggle('active', tab.dataset.view === currentView);
        });

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const view = tab.dataset.view;
                if (view === currentView) return;
                currentView = view;
                tabs.forEach(t => t.classList.toggle('active', t.dataset.view === view));

                const modalPre = document.getElementById('modalBodyPre');
                const chatContainer = document.getElementById('modalChatContainer');

                if (view === 'chat') {
                    // Show chat, hide code
                    if (modalPre) modalPre.style.display = 'none';
                    if (chatContainer) chatContainer.style.display = 'flex';
                    // Build diff text for context
                    let diffText = '';
                    if (file.hunks) {
                        diffText = file.hunks.map(h => {
                            return h.lines.map(l => {
                                const prefix = l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' ';
                                return prefix + l.content;
                            }).join('\n');
                        }).join('\n');
                    }
                    openFileChatInModal(file.path, file.content || '', file.status || '', diffText);
                } else {
                    // Show code, hide chat
                    if (modalPre) modalPre.style.display = '';
                    if (chatContainer) chatContainer.style.display = 'none';
                    if (view === 'diff' && rendered.diff) {
                        contentEl.innerHTML = rendered.diff;
                    } else if (view === 'full' && rendered.full) {
                        contentEl.innerHTML = rendered.full;
                    }
                }
            });
        });
    }

    if (hasDiff) {
        rendered.diff = buildModalDiffHTML(file);
        // If defaulting to diff view, show it immediately
        if (currentView === 'diff') {
            contentEl.innerHTML = rendered.diff;
        }
    }

    measure('modal:fetchContent', async () => {
        try {
            const state = ctx.snap().context;
            let content = '';

            if (state.currentCommitHash && file.path) {
                const response = await fetch('/api/repo/file-content', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        path: state.repoPath,
                        commit: state.currentCommitHash,
                        filePath: file.path
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    content = data.content || '';
                }
            }

            if (!content && file.content) {
                content = file.content;
            }

            if (!content) {
                contentEl.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">No content available</span>';
                return;
            }

            const lineCount = content.split('\n').length;
            if (lineCountEl) {
                lineCountEl.textContent = `${lineCount.toLocaleString()} lines`;
            }

            const ext = file.name?.split('.').pop()?.toLowerCase() || '';
            rendered.full = highlightSyntax(content, ext);

            if (currentView === 'full') {
                contentEl.innerHTML = rendered.full;
            }

        } catch (err) {
            measure('modal:fetchError', () => err);
            if (file.content) {
                const ext = file.name?.split('.').pop()?.toLowerCase() || '';
                rendered.full = highlightSyntax(file.content, ext);
                if (currentView === 'full') {
                    contentEl.innerHTML = rendered.full;
                }
            } else {
                contentEl.innerHTML = `<span style="color: var(--error);">Failed to load: ${escapeHtml(err.message)}</span>`;
            }
        }
    });
}

// ─── Hidden lines indicator ─────────────────────────────
function _updateHiddenLinesIndicator(card: HTMLElement, totalLines: number) {
    const body = card.querySelector('.file-card-body');
    if (!body) return;

    // Find or create the indicator
    let indicator = card.querySelector('.hidden-lines-indicator') as HTMLElement;

    const scrollable = body.querySelector('pre') || body.querySelector('.diff-hunk-body') || body;
    const el = scrollable as HTMLElement;

    // Calculate how many lines are hidden below
    const scrollRemaining = el.scrollHeight - el.scrollTop - el.clientHeight;

    if (scrollRemaining > 20) {
        // Estimate remaining lines (using ~15px per line as rough average)
        const lineHeight = 15;
        const hiddenLines = Math.round(scrollRemaining / lineHeight);

        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'hidden-lines-indicator';
            card.appendChild(indicator);
        }
        indicator.textContent = `↓ ${hiddenLines} more lines`;
        indicator.style.display = '';
    } else if (indicator) {
        indicator.style.display = 'none';
    }
}

// ─── Fit selected cards to content ──────────────────────
export function fitContentSize(ctx: CanvasContext) {
    measure('cards:fitContent', () => {
        const selected = ctx.snap().context.selectedCards;
        const targets = selected.length > 0 ? selected : Array.from(ctx.fileCards.keys());

        targets.forEach(path => {
            const card = ctx.fileCards.get(path);
            if (!card) return;

            const body = card.querySelector('.file-card-body') as HTMLElement;
            if (!body) return;

            // Temporarily remove height constraints to measure natural height
            const oldH = card.style.height;
            const oldMax = card.style.maxHeight;
            card.style.height = 'auto';
            card.style.maxHeight = 'none';

            // Measure full content height
            const fullHeight = card.scrollHeight;

            // Cap at a reasonable max (3000px)
            const newHeight = Math.min(3000, Math.max(120, fullHeight));

            card.style.height = `${newHeight}px`;
            card.style.maxHeight = 'none';

            const state = ctx.snap().context;
            const commitHash = state.currentCommitHash || 'allfiles';
            ctx.actor.send({ type: 'RESIZE_CARD', path, width: card.offsetWidth, height: newHeight });
            savePosition(ctx, commitHash, path, parseInt(card.style.left) || 0, parseInt(card.style.top) || 0, card.offsetWidth, newHeight);

            // Update hidden lines indicator
            requestAnimationFrame(() => _updateHiddenLinesIndicator(card, 0));
        });

        updateMinimap(ctx);
        renderConnections(ctx);
        showToast(`Fit ${targets.length} card${targets.length > 1 ? 's' : ''} to content`, 'info');
    });
}

// ─── Fit selected cards to screen viewport ──────────────
export function fitScreenSize(ctx: CanvasContext) {
    measure('cards:fitScreen', () => {
        const selected = ctx.snap().context.selectedCards;
        if (selected.length === 0) {
            showToast('Select cards to fit to screen', 'info');
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
        showToast(`Fit ${selected.length} card${selected.length > 1 ? 's' : ''} to screen height`, 'info');
    });
}
