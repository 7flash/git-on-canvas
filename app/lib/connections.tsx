// @ts-nocheck
/**
 * Connections — drag-to-connect, render SVG lines, dialog, navigate.
 */
import { measure } from 'measure-fn';
import { render } from 'melina/client';
import type { CanvasContext } from './context';
import { escapeHtml, showToast } from './utils';
import { updateCanvasTransform, updateZoomUI } from './canvas';

// ─── Setup connection drag from a card's connect button ─
export function setupConnectionDrag(ctx: CanvasContext, card: HTMLElement, filePath: string) {
    const connectBtn = card.querySelector('.connect-btn');
    if (!connectBtn) return;

    connectBtn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();

        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const btnRect = connectBtn.getBoundingClientRect();
        const vpRect = ctx.canvasViewport.getBoundingClientRect();
        const state = ctx.snap().context;

        const startX = (btnRect.left + btnRect.width / 2 - vpRect.left - state.offsetX) / state.zoom;
        const startY = (btnRect.top + btnRect.height / 2 - vpRect.top - state.offsetY) / state.zoom;

        arrow.setAttribute('x1', startX);
        arrow.setAttribute('y1', startY);
        arrow.setAttribute('x2', startX);
        arrow.setAttribute('y2', startY);
        arrow.setAttribute('stroke', 'var(--accent-primary)');
        arrow.setAttribute('stroke-width', '2.5');
        arrow.setAttribute('stroke-dasharray', '6,3');
        arrow.setAttribute('opacity', '0.9');
        ctx.svgOverlay.appendChild(arrow);

        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', startX);
        dot.setAttribute('cy', startY);
        dot.setAttribute('r', '5');
        dot.setAttribute('fill', 'var(--accent-primary)');
        ctx.svgOverlay.appendChild(dot);

        ctx.connectionDragState = { sourceFile: filePath, sourceCard: card, arrowEl: arrow, dotEl: dot, startX, startY };

        card.classList.add('connecting');
        document.body.style.cursor = 'crosshair';

        const onMove = (e: MouseEvent) => onConnDragMove(ctx, e);
        const onUp = (e: MouseEvent) => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            onConnDragUp(ctx, e);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    });
}

function onConnDragMove(ctx: CanvasContext, e: MouseEvent) {
    if (!ctx.connectionDragState) return;
    const state = ctx.snap().context;
    const vpRect = ctx.canvasViewport.getBoundingClientRect();
    const ex = (e.clientX - vpRect.left - state.offsetX) / state.zoom;
    const ey = (e.clientY - vpRect.top - state.offsetY) / state.zoom;

    ctx.connectionDragState.arrowEl.setAttribute('x2', ex);
    ctx.connectionDragState.arrowEl.setAttribute('y2', ey);
    ctx.connectionDragState.dotEl.setAttribute('cx', ex);
    ctx.connectionDragState.dotEl.setAttribute('cy', ey);

    const targetCard = document.elementFromPoint(e.clientX, e.clientY)?.closest('.file-card');
    ctx.fileCards.forEach((c) => c.classList.remove('connect-target'));
    if (targetCard && targetCard !== ctx.connectionDragState.sourceCard) {
        targetCard.classList.add('connect-target');
    }
}

function onConnDragUp(ctx: CanvasContext, e: MouseEvent) {
    if (!ctx.connectionDragState) return;

    ctx.connectionDragState.arrowEl.remove();
    ctx.connectionDragState.dotEl.remove();
    ctx.connectionDragState.sourceCard.classList.remove('connecting');
    ctx.fileCards.forEach((c) => c.classList.remove('connect-target'));
    document.body.style.cursor = '';

    const targetCard = document.elementFromPoint(e.clientX, e.clientY)?.closest('.file-card');
    if (!targetCard || targetCard === ctx.connectionDragState.sourceCard) {
        ctx.connectionDragState = null;
        return;
    }

    const targetPath = targetCard.dataset.path;
    const sourceFile = ctx.connectionDragState.sourceFile;
    ctx.connectionDragState = null;

    showConnectionDialog(ctx, sourceFile, targetPath);
}

// ─── Connection dialog (JSX) ────────────────────────────
function ConnectionDialog({
    sourceFile, targetFile, sourceLineCount, targetLineCount, onCancel, onCreate
}: {
    sourceFile: string; targetFile: string;
    sourceLineCount: number; targetLineCount: number;
    onCancel: () => void;
    onCreate: (srcStart: number, srcEnd: number, tgtStart: number, tgtEnd: number, comment: string) => void;
}) {
    const handleCreate = () => {
        const srcStart = parseInt((document.getElementById('connSourceStart') as HTMLInputElement)?.value) || 1;
        const srcEnd = parseInt((document.getElementById('connSourceEnd') as HTMLInputElement)?.value) || srcStart;
        const tgtStart = parseInt((document.getElementById('connTargetStart') as HTMLInputElement)?.value) || 1;
        const tgtEnd = parseInt((document.getElementById('connTargetEnd') as HTMLInputElement)?.value) || tgtStart;
        const comment = (document.getElementById('connComment') as HTMLInputElement)?.value || '';
        onCreate(srcStart, srcEnd, tgtStart, tgtEnd, comment);
    };

    const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Enter') handleCreate();
        if (e.key === 'Escape') onCancel();
    };

    return (
        <div className="connection-dialog" onKeydown={handleKeydown}>
            <h3>Create Connection</h3>
            <div className="conn-dialog-row">
                <div className="conn-dialog-file">
                    <label>Source</label>
                    <span className="conn-file-name">{sourceFile}</span>
                    <div className="conn-line-range">
                        <label>Lines</label>
                        <input type="number" id="connSourceStart" value={1} min={1} max={sourceLineCount} />
                        <span>–</span>
                        <input type="number" id="connSourceEnd" value={Math.min(10, sourceLineCount)} min={1} max={sourceLineCount} />
                    </div>
                </div>
                <div className="conn-dialog-arrow">→</div>
                <div className="conn-dialog-file">
                    <label>Target</label>
                    <span className="conn-file-name">{targetFile}</span>
                    <div className="conn-line-range">
                        <label>Lines</label>
                        <input type="number" id="connTargetStart" value={1} min={1} max={targetLineCount} />
                        <span>–</span>
                        <input type="number" id="connTargetEnd" value={Math.min(10, targetLineCount)} min={1} max={targetLineCount} />
                    </div>
                </div>
            </div>
            <div className="conn-dialog-comment">
                <label>Comment</label>
                <input type="text" id="connComment" placeholder="Describe this connection..." />
            </div>
            <div className="conn-dialog-actions">
                <button className="btn-secondary" onClick={onCancel}>Cancel</button>
                <button className="btn-primary" onClick={handleCreate}>Create Connection</button>
            </div>
        </div>
    );
}

function showConnectionDialog(ctx: CanvasContext, sourceFile: string, targetFile: string) {
    const overlay = document.createElement('div');
    overlay.className = 'connection-dialog-overlay';
    document.body.appendChild(overlay);

    const sourceLineCount = getFileLineCount(ctx, sourceFile);
    const targetLineCount = getFileLineCount(ctx, targetFile);

    const close = () => {
        render(null, overlay);
        overlay.remove();
    };

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    render(
        <ConnectionDialog
            sourceFile={sourceFile}
            targetFile={targetFile}
            sourceLineCount={sourceLineCount}
            targetLineCount={targetLineCount}
            onCancel={close}
            onCreate={(srcStart, srcEnd, tgtStart, tgtEnd, comment) => {
                ctx.actor.send({ type: 'START_CONNECTION', sourceFile, lineStart: srcStart, lineEnd: srcEnd });
                ctx.actor.send({ type: 'COMPLETE_CONNECTION', targetFile, lineStart: tgtStart, lineEnd: tgtEnd, comment });
                renderConnections(ctx);
                saveConnections(ctx);
                showToast('Connection created!', 'success');
                close();
            }}
        />,
        overlay
    );

    setTimeout(() => document.getElementById('connComment')?.focus(), 100);
}

function getFileLineCount(ctx: CanvasContext, filePath: string): number {
    const card = ctx.fileCards.get(filePath);
    if (!card) return 100;
    const lines = card.querySelectorAll('.diff-line');
    return lines.length || 100;
}

// ─── Render all SVG connection lines ────────────────────
export function renderConnections(ctx: CanvasContext) {
    if (!ctx.svgOverlay) return;
    ctx.svgOverlay.innerHTML = '';

    const state = ctx.snap().context;

    state.connections.forEach(conn => {
        const sourceCard = ctx.fileCards.get(conn.sourceFile);
        const targetCard = ctx.fileCards.get(conn.targetFile);
        if (!sourceCard || !targetCard) return;

        const getPoint = (card, lineNum, isStart) => {
            const lineEl = card.querySelector(`.diff-line[data-line="${lineNum}"]`);
            const canvasRect = ctx.canvasViewport.getBoundingClientRect();

            if (lineEl) {
                const rect = lineEl.getBoundingClientRect();
                const x = (isStart ? rect.right : rect.left);
                const y = rect.top + rect.height / 2;
                return {
                    x: (x - canvasRect.left - state.offsetX) / state.zoom,
                    y: (y - canvasRect.top - state.offsetY) / state.zoom
                };
            } else {
                const rect = card.getBoundingClientRect();
                return {
                    x: (isStart ? rect.right : rect.left - canvasRect.left - state.offsetX) / state.zoom,
                    y: (rect.top + 50 - canvasRect.top - state.offsetY) / state.zoom
                };
            }
        };

        const startPt = getPoint(sourceCard, conn.sourceLineStart, true);
        const endPt = getPoint(targetCard, conn.targetLineStart, false);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const midX = (startPt.x + endPt.x) / 2;
        path.setAttribute('d', `M ${startPt.x} ${startPt.y} C ${midX} ${startPt.y}, ${midX} ${endPt.y}, ${endPt.x} ${endPt.y}`);
        path.setAttribute('stroke', 'var(--accent-primary)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0.7');
        path.setAttribute('stroke-dasharray', '6,3');
        path.style.cursor = 'pointer';

        path.addEventListener('click', () => navigateToConnection(ctx, conn));

        if (conn.comment) {
            const labelX = (startPt.x + endPt.x) / 2;
            const labelY = (startPt.y + endPt.y) / 2;

            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            group.style.cursor = 'pointer';
            group.addEventListener('click', () => navigateToConnection(ctx, conn));

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', labelX);
            text.setAttribute('y', labelY);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('alignment-baseline', 'middle');
            text.setAttribute('fill', 'white');
            text.setAttribute('font-size', '12');
            text.textContent = conn.comment;

            const bbox = { width: conn.comment.length * 7 + 10, height: 20 };
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', labelX - bbox.width / 2);
            rect.setAttribute('y', labelY - bbox.height / 2);
            rect.setAttribute('width', bbox.width);
            rect.setAttribute('height', bbox.height);
            rect.setAttribute('rx', '4');
            rect.setAttribute('fill', '#000');
            rect.setAttribute('opacity', '0.7');

            group.appendChild(rect);
            group.appendChild(text);
            ctx.svgOverlay.appendChild(group);
        }

        ctx.svgOverlay.appendChild(path);

        [startPt, endPt].forEach(pt => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', pt.x);
            circle.setAttribute('cy', pt.y);
            circle.setAttribute('r', '3');
            circle.setAttribute('fill', 'var(--accent-primary)');
            ctx.svgOverlay.appendChild(circle);
        });
    });
}

// ─── Navigate to connection target ──────────────────────
export function navigateToConnection(ctx: CanvasContext, conn: any) {
    measure('connection:navigate', () => {
        const targetCard = ctx.fileCards.get(conn.targetFile);
        if (!targetCard) return;

        const targetLine = targetCard.querySelector(`.diff-line[data-line="${conn.targetLineStart}"]`);
        if (!targetLine) return;

        const body = targetCard.querySelector('.file-card-body');
        if (body && targetLine) {
            targetLine.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }

        const cardX = parseInt(targetCard.style.left);
        const cardY = parseInt(targetCard.style.top);
        const viewportRect = ctx.canvasViewport.getBoundingClientRect();

        const newZoom = 1;
        const newOffsetX = viewportRect.width / 2 - cardX * newZoom - 290;
        const newOffsetY = viewportRect.height / 2 - cardY * newZoom - 350;

        ctx.actor.send({ type: 'SET_ZOOM', zoom: newZoom });
        ctx.actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
        updateCanvasTransform(ctx);
        updateZoomUI(ctx);

        targetCard.querySelectorAll('.diff-line').forEach(l => {
            const ln = parseInt(l.dataset.line);
            if (ln >= conn.targetLineStart && ln <= conn.targetLineEnd) {
                l.classList.add('line-flash');
                setTimeout(() => l.classList.remove('line-flash'), 1500);
            }
        });

        showToast(conn.comment || `→ ${conn.targetFile}:${conn.targetLineStart}-${conn.targetLineEnd}`, 'info');
    });
}

// ─── Save connections to server ─────────────────────────
export async function saveConnections(ctx: CanvasContext) {
    const state = ctx.snap().context;
    try {
        await fetch('/api/connections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connections: state.connections })
        });
    } catch (e) {
        measure('connections:saveError', () => e);
    }
}

// ─── Load connections from server ───────────────────────
export async function loadConnections(ctx: CanvasContext) {
    return measure('connections:load', async () => {
        try {
            const response = await fetch('/api/connections');
            if (!response.ok) return;
            const data = await response.json();

            if (data.connections && data.connections.length > 0) {
                // Map DB format back to app format
                const conns = data.connections.map(c => ({
                    id: c.conn_id,
                    sourceFile: c.source_file,
                    sourceLineStart: c.source_line_start,
                    sourceLineEnd: c.source_line_end,
                    targetFile: c.target_file,
                    targetLineStart: c.target_line_start,
                    targetLineEnd: c.target_line_end,
                    comment: c.comment || '',
                }));

                // Load them into state
                conns.forEach(conn => {
                    ctx.actor.send({
                        type: 'START_CONNECTION',
                        sourceFile: conn.sourceFile,
                        lineStart: conn.sourceLineStart,
                        lineEnd: conn.sourceLineEnd,
                    });
                    ctx.actor.send({
                        type: 'COMPLETE_CONNECTION',
                        targetFile: conn.targetFile,
                        lineStart: conn.targetLineStart,
                        lineEnd: conn.targetLineEnd,
                        comment: conn.comment,
                    });
                });

                // Render after loading
                renderConnections(ctx);
                showToast(`Loaded ${conns.length} connection${conns.length > 1 ? 's' : ''}`, 'info');
            }
        } catch (e) {
            measure('connections:loadError', () => e);
        }
    });
}

// ─── Delete a connection ────────────────────────────────
export function deleteConnection(ctx: CanvasContext, connId: string) {
    ctx.actor.send({ type: 'DELETE_CONNECTION', id: connId });
    renderConnections(ctx);
    saveConnections(ctx);
    showToast('Connection deleted', 'info');
}
