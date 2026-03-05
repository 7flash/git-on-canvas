// @ts-nocheck
/**
 * Connections — click-on-line to connect, render SVG lines with labels,
 * left-side marker strip, navigate.
 *
 * Flow:
 *   1. User clicks a line number/gutter → starts pending connection (source)
 *   2. All cards show a subtle "click a target line" visual hint (border glow)
 *   3. User clicks a line in another card → completes connection
 *   4. Connection markers appear on the LEFT side of both cards
 *   5. SVG bezier curves with gradient & filename labels connect the two lines
 *   6. No toasts — visual feedback only (glows, highlights, labels)
 */
import { measure } from 'measure-fn';
import { render } from 'melina/client';
import type { CanvasContext } from './context';
import { escapeHtml } from './utils';
import { updateCanvasTransform, updateZoomUI } from './canvas';

// ─── Pending connection state ────────────────────────────
let pendingConnection: {
    sourceFile: string;
    sourceLine: number;
    sourceCard: HTMLElement;
} | null = null;

// ─── rAF-coalesced render scheduler ─────────────────────
// Multiple callers (scroll, drag, resize) may trigger renderConnections
// in quick succession. This batches them into a single animation frame.
let _renderPending = false;
let _renderCtx: CanvasContext | null = null;

/** Schedule a connection re-render on the next animation frame. Coalesces rapid calls. */
export function scheduleRenderConnections(ctx: CanvasContext) {
    _renderCtx = ctx;
    if (_renderPending) return;
    _renderPending = true;
    requestAnimationFrame(() => {
        _renderPending = false;
        if (_renderCtx) renderConnections(_renderCtx);
    });
}

// ─── Status indicator element ────────────────────────────
let statusIndicator: HTMLElement | null = null;

function _showStatus(text: string) {
    if (!statusIndicator) {
        statusIndicator = document.createElement('div');
        statusIndicator.className = 'conn-status-indicator';
        document.body.appendChild(statusIndicator);
    }
    statusIndicator.textContent = text;
    statusIndicator.classList.add('visible');
}

function _hideStatus() {
    if (statusIndicator) {
        statusIndicator.classList.remove('visible');
    }
}

// ─── Setup click-on-line connection for a card ──────────
export function setupLineClickConnection(ctx: CanvasContext, card: HTMLElement, filePath: string) {
    const body = card.querySelector('.file-card-body') as HTMLElement;
    if (!body) return;

    body.addEventListener('click', (e) => {
        const lineEl = (e.target as HTMLElement).closest('.diff-line') as HTMLElement;
        if (!lineEl) return;

        const lineNum = parseInt(lineEl.dataset.line);
        if (!lineNum) return;

        // If we're in "connecting" mode and clicking a line in a DIFFERENT card
        if (pendingConnection && pendingConnection.sourceCard !== card) {
            e.stopPropagation();
            e.preventDefault();

            // Complete the connection
            const srcName = pendingConnection.sourceFile.split('/').pop();
            const tgtName = filePath.split('/').pop();
            const conn = {
                id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                sourceFile: pendingConnection.sourceFile,
                sourceLineStart: pendingConnection.sourceLine,
                sourceLineEnd: pendingConnection.sourceLine,
                targetFile: filePath,
                targetLineStart: lineNum,
                targetLineEnd: lineNum,
                comment: `${srcName}:${pendingConnection.sourceLine} → ${tgtName}:${lineNum}`,
            };

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

            // Clear pending
            _clearPending(ctx);

            renderConnections(ctx);
            buildConnectionMarkers(ctx);
            saveConnections(ctx);
            return;
        }

        // If clicking same card and already pending → cancel
        if (pendingConnection && pendingConnection.sourceCard === card) {
            _clearPending(ctx);
            return;
        }

        // Must hold Alt key to START a new connection, to prevent conflict with dragging
        if (!e.altKey) return;

        // Start a new pending connection
        e.stopPropagation();
        const fileName = filePath.split('/').pop();
        pendingConnection = { sourceFile: filePath, sourceLine: lineNum, sourceCard: card };

        // Visual: highlight the source line
        lineEl.classList.add('connection-source-line');
        card.classList.add('connecting-source');

        // Show file picker to select target file
        _showTargetFilePicker(ctx, filePath);
    });
}

function _clearPending(ctx: CanvasContext) {
    if (!pendingConnection) return;
    // Remove visual highlights
    pendingConnection.sourceCard.querySelector('.connection-source-line')?.classList.remove('connection-source-line');
    pendingConnection.sourceCard.classList.remove('connecting-source');
    ctx.fileCards.forEach((c) => c.classList.remove('connect-target-ready'));
    pendingConnection = null;
    _hideStatus();
}

// ─── Cancel pending connection (called from Escape key) ──
export function cancelPendingConnection(ctx: CanvasContext) {
    if (pendingConnection) {
        _clearPending(ctx);
    }
}

export function hasPendingConnection(): boolean {
    return pendingConnection !== null;
}

// ─── Target file picker for connections ─────────────────
function _showTargetFilePicker(ctx: CanvasContext, sourceFile: string) {
    // Remove existing picker if any
    document.getElementById('connFilePickerOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'connFilePickerOverlay';
    overlay.className = 'file-search-overlay';
    document.body.appendChild(overlay);

    const container = document.createElement('div');
    container.className = 'file-search-container';

    const header = document.createElement('div');
    header.className = 'conn-picker-header';
    const srcName = sourceFile.split('/').pop();
    const srcLine = pendingConnection?.sourceLine || '?';
    header.innerHTML = `<span class="conn-picker-from">Connect from <strong>${escapeHtml(srcName!)}:${srcLine}</strong> → select target file:</span>`;
    container.appendChild(header);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'file-search-input';
    input.placeholder = 'Filter files...';
    input.autocomplete = 'off';
    container.appendChild(input);

    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'file-search-results';
    container.appendChild(resultsContainer);
    overlay.appendChild(container);

    // Get all file paths except source
    const allPaths = Array.from(ctx.fileCards.keys()).filter(p => p !== sourceFile);
    let currentQuery = '';
    let selectedIdx = 0;

    function getMatches() {
        const q = currentQuery.toLowerCase().trim();
        return q ? allPaths.filter(p => p.toLowerCase().includes(q)).slice(0, 15) : allPaths.slice(0, 15);
    }

    function selectFile(path: string) {
        overlay.remove();
        // Navigate to the target card
        const targetCard = ctx.fileCards.get(path);
        if (!targetCard) return;

        // Scroll viewport to center on target card
        const vpRect = ctx.canvasViewport.getBoundingClientRect();
        const state = ctx.snap().context;
        const cardX = parseFloat(targetCard.style.left) || 0;
        const cardY = parseFloat(targetCard.style.top) || 0;
        const newOffsetX = -(cardX + targetCard.offsetWidth / 2) * state.zoom + vpRect.width / 2;
        const newOffsetY = -(cardY + targetCard.offsetHeight / 2) * state.zoom + vpRect.height / 2;
        ctx.actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
        updateCanvasTransform(ctx);

        // Highlight target card
        targetCard.classList.add('connect-target-ready');
        targetCard.classList.add('card-flash');
        setTimeout(() => targetCard.classList.remove('card-flash'), 1500);

        const tgtName = path.split('/').pop();
        _showStatus(`Click a line in ${tgtName} to complete connection`);
    }

    function close() {
        overlay.remove();
        _clearPending(ctx);
    }

    function renderResults() {
        const matches = getMatches();
        const q = currentQuery.toLowerCase().trim();
        if (matches.length === 0 && q) {
            resultsContainer.innerHTML = `<div class="file-search-empty">No files matching "${escapeHtml(q)}"</div>`;
        } else {
            resultsContainer.innerHTML = matches.map((path, i) => {
                const name = path.split('/').pop() || path;
                const dir = path.substring(0, path.length - name.length);
                return `<div class="file-search-item ${i === selectedIdx ? 'selected' : ''}" data-path="${escapeHtml(path)}">
                    <span class="search-file-dir">${escapeHtml(dir)}</span><span class="search-file-name">${escapeHtml(name)}</span>
                </div>`;
            }).join('');
            resultsContainer.querySelectorAll('.file-search-item').forEach(el => {
                el.addEventListener('click', () => selectFile((el as HTMLElement).dataset.path!));
            });
        }
    }

    input.addEventListener('input', () => {
        currentQuery = input.value;
        selectedIdx = 0;
        renderResults();
    });
    input.addEventListener('keydown', (e) => {
        const matches = getMatches();
        if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, matches.length - 1); renderResults(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); renderResults(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (matches[selectedIdx]) selectFile(matches[selectedIdx]); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    overlay.addEventListener('click', (e) => {
        if ((e.target as HTMLElement) === overlay) close();
    });

    renderResults();
    requestAnimationFrame(() => input.focus());
}

// ─── Build connection marker strips (LEFT side of cards) ─
export function buildConnectionMarkers(ctx: CanvasContext) {
    const state = ctx.snap().context;
    const connections = state.connections || [];

    // First clean up all existing markers
    ctx.fileCards.forEach((card) => {
        card.querySelectorAll('.conn-marker-strip').forEach(el => el.remove());
    });

    if (connections.length === 0) return;

    // Group connections by file
    const connsByFile = new Map<string, Array<{ line: number; conn: any; role: 'source' | 'target' }>>();

    connections.forEach(conn => {
        // Source side
        if (!connsByFile.has(conn.sourceFile)) connsByFile.set(conn.sourceFile, []);
        connsByFile.get(conn.sourceFile)!.push({
            line: conn.sourceLineStart,
            conn,
            role: 'source',
        });

        // Target side
        if (!connsByFile.has(conn.targetFile)) connsByFile.set(conn.targetFile, []);
        connsByFile.get(conn.targetFile)!.push({
            line: conn.targetLineStart,
            conn,
            role: 'target',
        });
    });

    // Build marker strip for each file card
    connsByFile.forEach((markers, filePath) => {
        const card = ctx.fileCards.get(filePath);
        if (!card) return;

        const body = card.querySelector('.file-card-body') as HTMLElement;
        if (!body) return;

        const pre = body.querySelector('pre') as HTMLElement;
        if (!pre) return;

        // Make the pre position:relative so absolute markers inside it scroll with content
        if (getComputedStyle(pre).position === 'static') {
            pre.style.position = 'relative';
        }

        const strip = document.createElement('div');
        strip.className = 'conn-marker-strip';

        markers.forEach(({ line, conn, role }) => {
            const marker = document.createElement('div');
            marker.className = `conn-marker conn-marker--${role}`;

            // Try to find the actual line element and use its offsetTop
            const lineEl = pre.querySelector(`.diff-line[data-line="${line}"]`) as HTMLElement;
            if (lineEl) {
                // Position marker at the line element's vertical position
                marker.style.top = `${lineEl.offsetTop + lineEl.offsetHeight / 2}px`;
            } else {
                // Fallback: estimate from total lines
                const totalLines = pre.querySelectorAll('.diff-line').length || 1;
                const lineH = pre.scrollHeight / totalLines;
                marker.style.top = `${(line - 1) * lineH + lineH / 2}px`;
            }

            const otherFile = role === 'source' ? conn.targetFile : conn.sourceFile;
            const otherLine = role === 'source' ? conn.targetLineStart : conn.sourceLineStart;
            const otherName = otherFile.split('/').pop();
            marker.title = `${role === 'source' ? '→' : '←'} ${otherName}:${otherLine}`;

            marker.addEventListener('click', (e) => {
                e.stopPropagation();
                navigateToConnection(ctx, conn, role === 'source' ? 'target' : 'source');
            });

            // Right-click to delete
            marker.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteConnection(ctx, conn.id);
            });

            strip.appendChild(marker);
        });

        // Append strip INSIDE the pre element so it scrolls with content
        pre.appendChild(strip);

        // ── Connection navigation in the file-path bar ──
        const filePathEl = body.querySelector('.file-path') as HTMLElement;
        if (filePathEl && markers.length > 0) {
            // Remove any previously injected connection nav
            filePathEl.querySelectorAll('.conn-nav-inline').forEach(e => e.remove());

            // Ensure file-path is flex (might have been set by diff nav already)
            filePathEl.style.display = 'flex';
            filePathEl.style.alignItems = 'center';
            filePathEl.style.justifyContent = 'space-between';

            // If the path text wasn't already wrapped in a span (by diff nav), wrap it
            if (!filePathEl.querySelector('.file-path-text')) {
                const existingText = filePathEl.childNodes[0];
                if (existingText && existingText.nodeType === Node.TEXT_NODE) {
                    const pathSpan = document.createElement('span');
                    pathSpan.className = 'file-path-text';
                    pathSpan.textContent = existingText.textContent || '';
                    pathSpan.style.overflow = 'hidden';
                    pathSpan.style.textOverflow = 'ellipsis';
                    filePathEl.replaceChild(pathSpan, existingText);
                }
            }

            let connIdx = -1;
            const sorted = [...markers].sort((a, b) => a.line - b.line);

            const connNav = document.createElement('span');
            connNav.className = 'conn-nav-inline';
            connNav.title = `${sorted.length} connection${sorted.length > 1 ? 's' : ''}`;

            const connLabel = document.createElement('span');
            connLabel.className = 'conn-nav-label';
            connLabel.textContent = `🔗${sorted.length}`;

            const connPrev = document.createElement('button');
            connPrev.className = 'conn-nav-btn';
            connPrev.textContent = '◀';
            connPrev.title = 'Previous connection';
            connPrev.addEventListener('click', (e) => {
                e.stopPropagation();
                if (connIdx <= 0) connIdx = sorted.length - 1;
                else connIdx--;
                const m = sorted[connIdx];
                navigateToConnection(ctx, m.conn, m.role === 'source' ? 'target' : 'source');
                connLabel.textContent = `🔗${connIdx + 1}/${sorted.length}`;
            });

            const connNext = document.createElement('button');
            connNext.className = 'conn-nav-btn';
            connNext.textContent = '▶';
            connNext.title = 'Next connection';
            connNext.addEventListener('click', (e) => {
                e.stopPropagation();
                if (connIdx >= sorted.length - 1) connIdx = 0;
                else connIdx++;
                const m = sorted[connIdx];
                navigateToConnection(ctx, m.conn, m.role === 'source' ? 'target' : 'source');
                connLabel.textContent = `🔗${connIdx + 1}/${sorted.length}`;
            });

            connNav.appendChild(connPrev);
            connNav.appendChild(connLabel);
            connNav.appendChild(connNext);
            filePathEl.appendChild(connNav);
        }
    });
}

// ─── SVG defs (gradients, filters) ──────────────────────
function _ensureSvgDefs(svg: SVGSVGElement) {
    if (svg.querySelector('defs#conn-defs')) return;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.id = 'conn-defs';

    // Connection gradient 
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.id = 'conn-gradient';
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');

    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#a78bfa');
    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', '#60a5fa');
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    defs.appendChild(grad);

    // Glow filter
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.id = 'conn-glow';
    filter.setAttribute('x', '-20%');
    filter.setAttribute('y', '-20%');
    filter.setAttribute('width', '140%');
    filter.setAttribute('height', '140%');
    const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    blur.setAttribute('stdDeviation', '3');
    blur.setAttribute('result', 'glow');
    const merge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
    const mNode1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    mNode1.setAttribute('in', 'glow');
    const mNode2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    mNode2.setAttribute('in', 'SourceGraphic');
    merge.appendChild(mNode1);
    merge.appendChild(mNode2);
    filter.appendChild(blur);
    filter.appendChild(merge);
    defs.appendChild(filter);

    svg.insertBefore(defs, svg.firstChild);
}

// ─── Render all SVG connection lines ────────────────────
export function renderConnections(ctx: CanvasContext) {
    if (!ctx.svgOverlay) return;
    ctx.svgOverlay.innerHTML = '';

    const state = ctx.snap().context;
    const connections = state.connections || [];
    if (connections.length === 0) return;

    _ensureSvgDefs(ctx.svgOverlay);

    connections.forEach(conn => {
        const sourceCard = ctx.fileCards.get(conn.sourceFile);
        const targetCard = ctx.fileCards.get(conn.targetFile);
        if (!sourceCard || !targetCard) return;

        // Get canvas-space coordinates for the line endpoints
        const startPt = _getLinePoint(sourceCard, conn.sourceLineStart, 'right');
        const endPt = _getLinePoint(targetCard, conn.targetLineStart, 'left');

        // Decide curve direction based on card positions
        const goingRight = endPt.x >= startPt.x;
        const dx = Math.abs(endPt.x - startPt.x);
        const dy = Math.abs(endPt.y - startPt.y);
        const ctrlOffset = Math.max(60, Math.min(dx * 0.4, 200));

        // Smooth Bezier Routing (More robust, avoids overlapping vertical lines)
        let d: string;
        if (goingRight) {
            d = `M ${startPt.x} ${startPt.y} C ${startPt.x + ctrlOffset} ${startPt.y}, ${endPt.x - ctrlOffset} ${endPt.y}, ${endPt.x} ${endPt.y}`;
        } else {
            // Cards overlap or wrong order — route elegantly above them using smooth curves
            const arcHeight = Math.max(120, dy * 0.4);
            const topY = Math.min(startPt.y, endPt.y) - arcHeight;
            const midX = (startPt.x + endPt.x) / 2;
            d = `M ${startPt.x} ${startPt.y} C ${startPt.x + ctrlOffset} ${startPt.y}, ${startPt.x + ctrlOffset} ${topY}, ${midX} ${topY} C ${endPt.x - ctrlOffset} ${topY}, ${endPt.x - ctrlOffset} ${endPt.y}, ${endPt.x} ${endPt.y}`;
        }

        // Connection group
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.classList.add('conn-group');
        group.dataset.connId = conn.id;

        // Glow path (underneath)
        const glowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        glowPath.setAttribute('d', d);
        glowPath.setAttribute('stroke', '#a78bfa');
        glowPath.setAttribute('stroke-width', '6');
        glowPath.setAttribute('fill', 'none');
        glowPath.setAttribute('stroke-linejoin', 'round');
        glowPath.setAttribute('opacity', '0');
        glowPath.classList.add('conn-glow-path');
        group.appendChild(glowPath);

        // Main path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('stroke', 'url(#conn-gradient)');
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0.25');
        path.classList.add('conn-main-path');
        path.style.pointerEvents = 'none';

        // Animated dash
        const pathLength = _estimatePathLength(startPt, endPt);
        path.setAttribute('stroke-dasharray', '8 4');

        group.appendChild(path);

        // Endpoint circles
        const srcCircle = _makeEndpoint(startPt.x, startPt.y, '#a78bfa');
        const tgtCircle = _makeEndpoint(endPt.x, endPt.y, '#60a5fa');
        group.appendChild(srcCircle);
        group.appendChild(tgtCircle);

        // Label badge at midpoint
        const midX = (startPt.x + endPt.x) / 2;
        const midY = (startPt.y + endPt.y) / 2 - (goingRight ? 0 : ctrlOffset * 0.3);

        const srcName = conn.sourceFile.split('/').pop() || '';
        const tgtName = conn.targetFile.split('/').pop() || '';
        const labelText = `${srcName}:${conn.sourceLineStart} → ${tgtName}:${conn.targetLineStart}`;

        const { group: labelGroup, deleteGroup } = _makeLabel(midX, midY, labelText);
        labelGroup.classList.add('conn-label');
        group.appendChild(labelGroup);

        // Delete button logic
        deleteGroup.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteConnection(ctx, conn.id);
        });

        // Navigate on circle click
        srcCircle.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateToConnection(ctx, conn, 'source');
        });
        tgtCircle.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateToConnection(ctx, conn, 'target');
        });

        // Right-click circles → delete
        srcCircle.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteConnection(ctx, conn.id);
        });
        tgtCircle.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteConnection(ctx, conn.id);
        });

        ctx.svgOverlay.appendChild(group);
    });
}

function _makeEndpoint(x: number, y: number, color: string): SVGCircleElement {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', String(y));
    circle.setAttribute('r', '5');
    circle.setAttribute('fill', color);
    circle.setAttribute('stroke', 'rgba(0,0,0,0.5)');
    circle.setAttribute('stroke-width', '1');
    circle.style.transition = 'r 0.15s ease';
    circle.style.pointerEvents = 'none';
    return circle;
}

function _makeLabel(x: number, y: number, text: string): { group: SVGGElement, deleteGroup: SVGGElement } {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.style.opacity = '0.85';
    group.style.transition = 'opacity 0.15s ease';
    group.style.pointerEvents = 'none';

    const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textEl.setAttribute('x', String(x));
    textEl.setAttribute('y', String(y));
    textEl.setAttribute('text-anchor', 'middle');
    textEl.setAttribute('alignment-baseline', 'middle');
    textEl.setAttribute('fill', '#e0e0f0');
    textEl.setAttribute('font-size', '10');
    textEl.setAttribute('font-family', "'JetBrains Mono', 'Fira Code', monospace");
    textEl.setAttribute('font-weight', '500');
    textEl.textContent = text;

    // Background rect — sized by text length estimate
    const padding = 8;
    const charW = 6.2;
    const textW = text.length * charW;
    const w = textW + padding * 2 + 20; // Extra 20px for the X button
    const h = 20;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x - w / 2));
    rect.setAttribute('y', String(y - h / 2));
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', 'rgba(20, 15, 40, 0.92)');
    rect.setAttribute('stroke', 'rgba(167, 139, 250, 0.3)');
    rect.setAttribute('stroke-width', '1');

    group.appendChild(rect);
    group.appendChild(textEl);

    // X / Delete button group
    const deleteGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const delX = x + textW / 2 + 6;

    const delRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    delRect.setAttribute('x', String(delX));
    delRect.setAttribute('y', String(y - h / 2 + 3));
    delRect.setAttribute('width', '14');
    delRect.setAttribute('height', '14');
    delRect.setAttribute('rx', '3');
    delRect.setAttribute('fill', 'rgba(239, 68, 68, 0.15)');
    delRect.style.cursor = 'pointer';

    const delText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    delText.setAttribute('x', String(delX + 7)); // center of 14px rect
    delText.setAttribute('y', String(y));
    delText.setAttribute('text-anchor', 'middle');
    delText.setAttribute('alignment-baseline', 'middle');
    delText.setAttribute('fill', '#ef4444');
    delText.setAttribute('font-size', '10');
    delText.setAttribute('font-family', 'sans-serif');
    delText.setAttribute('font-weight', 'bold');
    delText.textContent = '×';
    delText.style.pointerEvents = 'none';

    deleteGroup.appendChild(delRect);
    deleteGroup.appendChild(delText);

    // Delete hover effect
    deleteGroup.addEventListener('mouseenter', () => delRect.setAttribute('fill', 'rgba(239, 68, 68, 0.4)'));
    deleteGroup.addEventListener('mouseleave', () => delRect.setAttribute('fill', 'rgba(239, 68, 68, 0.15)'));

    group.appendChild(deleteGroup);

    return { group, deleteGroup };
}

function _estimatePathLength(p1: { x: number, y: number }, p2: { x: number, y: number }): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy) * 1.3;  // rough bezier estimate
}

function _getLinePoint(card: HTMLElement, lineNum: number, side: 'left' | 'right'): { x: number; y: number } {
    const cardX = parseFloat(card.style.left) || 0;
    const cardY = parseFloat(card.style.top) || 0;
    const cardW = card.offsetWidth;
    const cardH = card.offsetHeight;

    // Try to find the specific line element
    const lineEl = card.querySelector(`.diff-line[data-line="${lineNum}"]`) as HTMLElement;
    const body = card.querySelector('.file-card-body') as HTMLElement;

    if (lineEl && body) {
        const pre = body.querySelector('pre') as HTMLElement;

        // Line's position within the pre/body content
        // offsetTop is relative to offsetParent (pre if position:relative, otherwise body)
        const lineOffsetInContent = lineEl.offsetTop;

        // How much the body has scrolled
        const scrollTop = body.scrollTop;

        // The body's top edge relative to the card
        // (header height + any other elements above body)
        const bodyTopInCard = body.offsetTop;

        // The pre's top edge relative to body (accounts for file-path bar)
        const preTopInBody = pre ? pre.offsetTop : 0;

        // Final Y: card position + body offset + pre offset + line position - scroll + half line height
        const y = cardY + bodyTopInCard + preTopInBody + lineOffsetInContent - scrollTop + lineEl.offsetHeight / 2;
        const x = side === 'left' ? cardX : cardX + cardW;

        // Clamp y to be within visible card bounds
        return {
            x,
            y: Math.max(cardY + bodyTopInCard, Math.min(cardY + cardH - 5, y)),
        };
    }

    // Fallback: estimate from line number
    const totalLines = card.querySelectorAll('.diff-line').length || 100;
    const pct = lineNum / totalLines;
    const headerH = 36;
    const bodyH = cardH - headerH;

    return {
        x: side === 'left' ? cardX : cardX + cardW,
        y: cardY + headerH + pct * bodyH,
    };
}

// ─── Navigate to connection endpoint ────────────────────
export function navigateToConnection(ctx: CanvasContext, conn: any, navigateTo: 'source' | 'target' = 'target') {
    measure('connection:navigate', () => {
        const file = navigateTo === 'target' ? conn.targetFile : conn.sourceFile;
        const line = navigateTo === 'target' ? conn.targetLineStart : conn.sourceLineStart;
        const targetCard = ctx.fileCards.get(file);
        if (!targetCard) return;

        // Pan canvas to center on the target card
        const vpRect = ctx.canvasViewport.getBoundingClientRect();
        const state = ctx.snap().context;
        const cardX = parseFloat(targetCard.style.left) || 0;
        const cardY = parseFloat(targetCard.style.top) || 0;
        const newOffsetX = -(cardX + targetCard.offsetWidth / 2) * state.zoom + vpRect.width / 2;
        const newOffsetY = -(cardY + targetCard.offsetHeight / 2) * state.zoom + vpRect.height / 2;

        ctx.actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
        updateCanvasTransform(ctx);

        // Scroll to target line inside the card
        const body = targetCard.querySelector('.file-card-body') as HTMLElement;
        const lineEl = targetCard.querySelector(`.diff-line[data-line="${line}"]`) as HTMLElement;
        if (body && lineEl) {
            const pre = body.querySelector('pre') as HTMLElement || body;
            const preRect = pre.getBoundingClientRect();
            const lineRect = lineEl.getBoundingClientRect();
            const zoom = preRect.height / pre.clientHeight || 1;
            pre.scrollTop += (lineRect.top - preRect.top) / zoom;
        }

        // Flash the target line
        targetCard.querySelectorAll('.diff-line').forEach(l => {
            const ln = parseInt((l as HTMLElement).dataset.line);
            if (ln === line) {
                l.classList.add('line-flash');
                setTimeout(() => l.classList.remove('line-flash'), 1500);
            }
        });
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

                renderConnections(ctx);
                buildConnectionMarkers(ctx);
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
    buildConnectionMarkers(ctx);
    saveConnections(ctx);
    populateConnectionsList();
}

// ─── Populate connections UI list ───────────────────────
let _cachedCtxForConnections: CanvasContext | null = null;
export function populateConnectionsList(ctx?: CanvasContext) {
    if (ctx) _cachedCtxForConnections = ctx;
    const currentCtx = ctx || _cachedCtxForConnections;
    if (!currentCtx) return;

    const listEl = document.getElementById('connectionsList');
    const panel = document.getElementById('connectionsPanel');
    const countEl = document.getElementById('connCount');
    if (!listEl || !panel) return;

    const connections = currentCtx.snap().context.connections || [];
    if (countEl) countEl.textContent = String(connections.length);

    if (connections.length === 0) {
        render(<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">No connections</div>, listEl);
        return;
    }

    render(
        <div style="display: flex; flex-direction: column; gap: 4px; padding: 8px;">
            {connections.map(conn => (
                <div key={conn.id} className="changed-file-item" style="justify-content: space-between;">
                    <div style="display: flex; flex-direction: column; flex: 1; overflow: hidden; margin-right: 8px;" onClick={() => navigateToConnection(currentCtx, conn, 'target')}>
                        <span style="font-size: 0.72rem; color: var(--accent-tertiary); font-family: var(--font-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            {conn.sourceFile.split('/').pop()}:{conn.sourceLineStart} → {conn.targetFile.split('/').pop()}:{conn.targetLineStart}
                        </span>
                    </div>
                    <button className="btn-ghost btn-xs" style="color: var(--error);" onClick={(e) => { e.stopPropagation(); deleteConnection(currentCtx, conn.id); }} title="Delete Connection">
                        ✕
                    </button>
                </div>
            ))}
        </div>,
        listEl
    );
}

// ─── Legacy compat: setupConnectionDrag (now no-op) ─────
export function setupConnectionDrag(ctx: CanvasContext, card: HTMLElement, filePath: string) {
    // Replaced by setupLineClickConnection
    setupLineClickConnection(ctx, card, filePath);
}

// ─── Auto-detect import connections ─────────────────────
export async function autoDetectImports(ctx: CanvasContext) {
    return measure('connections:autoDetect', async () => {
        const state = ctx.snap().context;
        const repoPath = state.repoPath;
        const commit = state.selectedCommit || 'HEAD';

        if (!repoPath) {
            _showStatus('No repo loaded');
            setTimeout(_hideStatus, 2000);
            return;
        }

        _showStatus('🔍 Scanning imports...');

        try {
            const res = await fetch('/api/repo/imports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: repoPath, commit }),
            });

            if (!res.ok) {
                _showStatus('❌ Import scan failed');
                setTimeout(_hideStatus, 2000);
                return;
            }

            const data = await res.json();
            const edges = data.edges || [];

            if (edges.length === 0) {
                _showStatus('No imports found');
                setTimeout(_hideStatus, 2000);
                return;
            }

            // Filter to edges where BOTH files are on the canvas
            const canvasFiles = new Set(ctx.fileCards.keys());
            const existingConnections = state.connections || [];
            const existingKeys = new Set(
                existingConnections.map(c => `${c.sourceFile}→${c.targetFile}`)
            );

            let added = 0;
            for (const edge of edges) {
                if (!canvasFiles.has(edge.source) || !canvasFiles.has(edge.target)) continue;
                if (existingKeys.has(`${edge.source}→${edge.target}`)) continue;

                const srcName = edge.source.split('/').pop();
                const tgtName = edge.target.split('/').pop();

                ctx.actor.send({
                    type: 'START_CONNECTION',
                    sourceFile: edge.source,
                    lineStart: edge.line,
                    lineEnd: edge.line,
                });
                ctx.actor.send({
                    type: 'COMPLETE_CONNECTION',
                    targetFile: edge.target,
                    lineStart: 1,
                    lineEnd: 1,
                    comment: `${srcName} → ${tgtName}`,
                });

                added++;
            }

            if (added > 0) {
                renderConnections(ctx);
                buildConnectionMarkers(ctx);
                saveConnections(ctx);
                _showStatus(`✅ ${added} import connections added`);
            } else {
                _showStatus('All imports already connected');
            }

            setTimeout(_hideStatus, 3000);
        } catch (err) {
            _showStatus('❌ Import scan error');
            setTimeout(_hideStatus, 2000);
        }
    });
}
