import { measure } from './lib/measure.js';
import { createActor } from 'xstate';
import { canvasMachine } from './state/machine.js';

// ─── Actor ───────────────────────────────────────────────
const actor = createActor(canvasMachine);
let snap = () => actor.getSnapshot();

// ─── DOM refs ────────────────────────────────────────────
let canvas, canvasViewport, svgOverlay;
let fileCards = new Map();
let positions = new Map();
let isDragging = false;
let dragStartX, dragStartY;

// ─── Corner detection threshold ──────────────────────────
const CORNER_SIZE = 24; // px from corner to trigger resize

// ─── Init ────────────────────────────────────────────────
async function init() {
    return measure('app:init', async () => {
        canvas = document.getElementById('canvas');
        canvasViewport = document.getElementById('canvasViewport');

        // Create SVG overlay for connections
        svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgOverlay.id = 'connectionOverlay';
        svgOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;overflow:visible;';
        canvas.appendChild(svgOverlay);

        actor.start();
        setupCanvasInteraction();
        setupEventListeners();
        await loadSavedPositions();

        // Check URL hash for repo path
        const hashRepo = decodeURIComponent(window.location.hash.replace('#', ''));
        if (hashRepo) {
            document.getElementById('repoPath').value = hashRepo;
            loadRepository(hashRepo);
        } else {
            const saved = localStorage.getItem('gitcanvas:lastRepo');
            if (saved) {
                document.getElementById('repoPath').value = saved;
            }
        }

        // Listen for hash changes
        window.addEventListener('hashchange', () => {
            const path = decodeURIComponent(window.location.hash.replace('#', ''));
            if (path && path !== snap().context.repoPath) {
                document.getElementById('repoPath').value = path;
                loadRepository(path);
            }
        });


    });
}

// ─── Positions ───────────────────────────────────────────
async function loadSavedPositions() {
    return measure('positions:load', async () => {
        try {
            const response = await fetch('/api/positions');
            if (response.ok) {
                const data = await response.json();
                positions = new Map(Object.entries(data));
            }
        } catch (e) {
            measure('positions:loadError', () => e);
        }
    });
}

async function savePosition(commitHash, filePath, x, y, width, height) {
    return measure('positions:save', async () => {
        try {
            const posKey = `${commitHash}:${filePath}`;
            const existing = positions.get(posKey) || {};
            const newPos = {
                x: x !== undefined ? x : existing.x,
                y: y !== undefined ? y : existing.y,
                width: width !== undefined ? width : existing.width,
                height: height !== undefined ? height : existing.height
            };
            positions.set(posKey, newPos);

            await fetch('/api/positions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commitHash, filePath, ...newPos })
            });
        } catch (e) {
            measure('positions:saveError', () => e);
        }
    });
}

function getPositionKey(filePath, commitHash) {
    return `${commitHash}:${filePath}`;
}

// ─── Canvas interaction (contextual) ─────────────────────
function setupCanvasInteraction() {
    measure('canvas:setupInteraction', () => {
        // Wheel: scroll hunk pane if hovering, zoom canvas otherwise
        canvasViewport.addEventListener('wheel', (e) => {
            // Check if hovering over a scrollable hunk pane
            const hunkPane = e.target.closest('.hunk-current-pane') || e.target.closest('.hunk-removed-pane');
            if (hunkPane && hunkPane.scrollHeight > hunkPane.clientHeight) {
                // If scrolling is possible (even partially), let it happen
                // Only zoom if we are strictly at the boundary and trying to go further?
                // Actually, user wants "bring those scrolls over each hunk... back"
                // It's better to prioritize scrolling over zooming when over a scrollable area.
                return;
            }

            // Zoom the canvas
            e.preventDefault();
            const ctx = snap().context;
            const rect = canvasViewport.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.min(3, Math.max(0.1, ctx.zoom * delta));
            const scale = newZoom / ctx.zoom;
            const newOffsetX = mouseX - (mouseX - ctx.offsetX) * scale;
            const newOffsetY = mouseY - (mouseY - ctx.offsetY) * scale;

            actor.send({ type: 'SET_ZOOM', zoom: newZoom });
            actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
            updateCanvasTransform();
            updateZoomUI();
        }, { passive: false });

        // Mousedown on empty canvas = pan
        canvasViewport.addEventListener('mousedown', (e) => {
            const insideCard = e.target.closest('.file-card');
            if (!insideCard) {
                // Deselect cards when clicking empty canvas
                actor.send({ type: 'DESELECT_ALL' });
                clearSelectionHighlights();

                // Start panning
                isDragging = true;
                const ctx = snap().context;
                dragStartX = e.clientX - ctx.offsetX;
                dragStartY = e.clientY - ctx.offsetY;
                canvasViewport.style.cursor = 'grabbing';
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const newX = e.clientX - dragStartX;
                const newY = e.clientY - dragStartY;
                actor.send({ type: 'SET_OFFSET', x: newX, y: newY });
                updateCanvasTransform();
            }
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                canvasViewport.style.cursor = 'grab';
            }
        });
    });
}

function updateCanvasTransform() {
    measure('canvas:updateTransform', () => {
        const ctx = snap().context;
        canvas.style.transform = `translate(${ctx.offsetX}px, ${ctx.offsetY}px) scale(${ctx.zoom})`;
        updateMinimap();
    });
}

function updateZoomUI() {
    measure('zoom:updateUI', () => {
        const ctx = snap().context;
        const slider = document.getElementById('zoomSlider');
        const value = document.getElementById('zoomValue');
        slider.value = ctx.zoom;
        value.textContent = `${Math.round(ctx.zoom * 100)}%`;
    });
}

function updateMinimap() {
    measure('minimap:update', () => {
        const minimap = document.getElementById('minimap');
        const viewport = document.getElementById('minimapViewport');
        const ctx = snap().context;

        const canvasRect = canvasViewport.getBoundingClientRect();
        const scale = minimap.offsetWidth / 5000;

        const vpWidth = (canvasRect.width / ctx.zoom) * scale;
        const vpHeight = (canvasRect.height / ctx.zoom) * scale;
        const vpX = (-ctx.offsetX / ctx.zoom) * scale;
        const vpY = (-ctx.offsetY / ctx.zoom) * scale;

        viewport.style.width = `${vpWidth}px`;
        viewport.style.height = `${vpHeight}px`;
        viewport.style.left = `${vpX}px`;
        viewport.style.top = `${vpY}px`;
    });
}

// ─── Scroll position debounce ────────────────────────────
let scrollTimers = {};
function debounceSaveScroll(filePath, scrollTop) {
    if (scrollTimers[filePath]) clearTimeout(scrollTimers[filePath]);
    scrollTimers[filePath] = setTimeout(() => {
        actor.send({ type: 'SAVE_SCROLL', path: filePath, scrollTop });
        // Also persist to server
        savePosition('scroll', filePath, scrollTop, 0);
    }, 300);
}

// ─── Event Listeners ─────────────────────────────────────
function setupEventListeners() {
    measure('events:setup', () => {
        // Load repo
        document.getElementById('loadRepo').addEventListener('click', () => {
            const path = document.getElementById('repoPath').value.trim();
            if (path) loadRepository(path);
        });

        document.getElementById('repoPath').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const path = e.target.value.trim();
                if (path) loadRepository(path);
            }
        });

        // Browse button
        document.getElementById('browseRepo').addEventListener('click', browseFolder);

        // Zoom slider
        document.getElementById('zoomSlider').addEventListener('input', (e) => {
            actor.send({ type: 'SET_ZOOM', zoom: parseFloat(e.target.value) });
            updateCanvasTransform();
            updateZoomUI();
        });

        // Reset
        document.getElementById('resetView').addEventListener('click', () => {
            actor.send({ type: 'SET_ZOOM', zoom: 1 });
            actor.send({ type: 'SET_OFFSET', x: 0, y: 0 });
            updateCanvasTransform();
            updateZoomUI();
        });

        // Fit All
        document.getElementById('fitAll').addEventListener('click', fitAllFiles);

        // View mode toggles
        document.getElementById('modeCommits').addEventListener('click', () => switchView('commits'));
        document.getElementById('modeAllFiles').addEventListener('click', () => switchView('allfiles'));

        // Close preview
        document.getElementById('closePreview').addEventListener('click', closePreview);
        document.querySelector('.modal-backdrop').addEventListener('click', closePreview);

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closePreview();
                if (snap().context.pendingConnection) {
                    actor.send({ type: 'CANCEL_CONNECTION' });
                    showToast('Connection cancelled', 'info');
                }
            }
        });
    });
}

// ─── Browse folder ───────────────────────────────────────
async function browseFolder() {
    return measure('repo:browse', async () => {
        try {
            showToast('Opening folder picker...', 'info');
            const response = await fetch('/api/repo/browse', { method: 'POST' });
            if (!response.ok) throw new Error(await response.text());
            const data = await response.json();
            if (!data.cancelled && data.path) {
                document.getElementById('repoPath').value = data.path;
                loadRepository(data.path);
            }
        } catch (err) {
            measure('repo:browseError', () => err);
            showToast(`Browse failed: ${err.message}`, 'error');
        }
    });
}

// ─── View switching ──────────────────────────────────────
function switchView(mode) {
    if (mode === 'allfiles') {
        actor.send({ type: 'SWITCH_TO_ALLFILES' });
    } else {
        actor.send({ type: 'SWITCH_TO_COMMITS' });
    }

    document.getElementById('modeCommits').classList.toggle('active', mode === 'commits');
    document.getElementById('modeAllFiles').classList.toggle('active', mode === 'allfiles');

    // Change the canvas content based on mode
    if (mode === 'allfiles') {
        document.getElementById('currentCommitInfo').innerHTML = `
            <span style="color: var(--accent-tertiary)">All Files</span>
            <span style="color: var(--text-muted)">Working tree</span>
        `;
        const ctx = snap().context;
        if (ctx.repoPath) loadAllFiles();
    } else {
        // Just re-render existing commit files without re-fetching
        const ctx = snap().context;
        if (ctx.currentCommitHash && ctx.commitFiles.length > 0) {
            renderFilesOnCanvas(ctx.commitFiles, ctx.currentCommitHash);
            const commit = ctx.commits.find(c => c.hash === ctx.currentCommitHash);
            document.getElementById('currentCommitInfo').innerHTML = `
                <span class="commit-hash">${ctx.currentCommitHash.substring(0, 7)}</span>
                <span style="color: var(--text-secondary)">${escapeHtml(commit?.message || '')}</span>
            `;
            document.getElementById('fileCount').textContent = ctx.commitFiles.length;
        }
    }
}

// ─── Load repository ─────────────────────────────────────
async function loadRepository(repoPath) {
    if (!repoPath) return;
    actor.send({ type: 'LOAD_REPO', path: repoPath });

    return measure('repo:load', async () => {
        try {
            showToast('Loading repository...', 'info');

            const response = await fetch('/api/repo/load', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: repoPath })
            });

            if (!response.ok) throw new Error(await response.text());

            const data = await response.json();
            actor.send({ type: 'REPO_LOADED', commits: data.commits });

            // Update URL hash
            window.location.hash = encodeURIComponent(repoPath);
            localStorage.setItem('gitcanvas:lastRepo', repoPath);

            renderCommitTimeline();

            // Respect current view mode
            const viewState = snap().value?.view;
            if (viewState === 'allfiles') {
                loadAllFiles();
            } else if (data.commits.length > 0) {
                selectCommit(data.commits[0].hash);
            }

            showToast(`Loaded ${data.commits.length} commits`, 'success');
        } catch (err) {
            actor.send({ type: 'REPO_ERROR', error: err.message });
            measure('repo:loadError', () => err);
            showToast(`Failed: ${err.message}`, 'error');
        }
    });
}

// ─── Load all files ──────────────────────────────────────
async function loadAllFiles() {
    const ctx = snap().context;
    if (!ctx.repoPath) return;

    return measure('allfiles:load', async () => {
        try {
            const response = await fetch('/api/repo/tree', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: ctx.repoPath })
            });

            if (!response.ok) throw new Error(await response.text());

            const data = await response.json();
            actor.send({ type: 'ALL_FILES_LOADED', files: data.files });
            renderAllFilesOnCanvas(data.files);
            document.getElementById('fileCount').textContent = data.total;
        } catch (err) {
            measure('allfiles:loadError', () => err);
            showToast(`Failed to load files: ${err.message}`, 'error');
        }
    });
}

// ─── Commit timeline ─────────────────────────────────────
function renderCommitTimeline() {
    measure('timeline:render', () => {
        const container = document.getElementById('timelineContainer');
        const countBadge = document.getElementById('commitCount');
        const ctx = snap().context;
        const commitsList = ctx.commits;

        countBadge.textContent = commitsList.length;

        if (commitsList.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                    </svg>
                    <p>No commits found</p>
                </div>
            `;
            return;
        }

        container.innerHTML = commitsList.map(commit => `
            <div class="commit-item" data-hash="${commit.hash}" onclick="selectCommit('${commit.hash}')">
                <div class="commit-hash">${commit.hash.substring(0, 7)}</div>
                <div class="commit-message">${escapeHtml(commit.message)}</div>
                <div class="commit-meta">
                    <span class="commit-author">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="7" r="4"/>
                            <path d="M5.5 21a7.5 7.5 0 0 1 13 0"/>
                        </svg>
                        ${escapeHtml(commit.author)}
                    </span>
                    <span>${formatDate(commit.date)}</span>
                </div>
            </div>
        `).join('');
    });
}

// ─── Select commit ───────────────────────────────────────
async function selectCommit(hash) {
    return measure('commit:select', async () => {
        actor.send({ type: 'SELECT_COMMIT', hash });
        actor.send({ type: 'SWITCH_TO_COMMITS' });

        // Update view mode UI
        document.getElementById('modeCommits').classList.add('active');
        document.getElementById('modeAllFiles').classList.remove('active');

        document.querySelectorAll('.commit-item').forEach(el => {
            el.classList.toggle('active', el.dataset.hash === hash);
        });

        const ctx = snap().context;
        const commit = ctx.commits.find(c => c.hash === hash);
        document.getElementById('currentCommitInfo').innerHTML = `
            <span class="commit-hash">${hash.substring(0, 7)}</span>
            <span style="color: var(--text-secondary)">${escapeHtml(commit?.message || '')}</span>
        `;

        try {
            const response = await fetch('/api/repo/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: ctx.repoPath, commit: hash })
            });

            if (!response.ok) throw new Error(await response.text());

            const data = await response.json();
            actor.send({ type: 'COMMIT_FILES_LOADED', files: data.files });
            renderFilesOnCanvas(data.files, hash);
            document.getElementById('fileCount').textContent = data.files.length;
        } catch (err) {
            measure('commit:selectError', () => err);
            showToast(`Failed: ${err.message}`, 'error');
        }
    });
}
window.selectCommit = selectCommit;

// ─── Render files on canvas (commits mode) ───────────────
function renderFilesOnCanvas(files, commitHash) {
    measure('canvas:renderFiles', () => {
        clearCanvas();

        const cols = Math.min(files.length, 2);
        const cardWidth = 580;
        const cardHeight = 700;
        const gap = 40;

        files.forEach((file, index) => {
            const posKey = getPositionKey(file.path, commitHash);
            let x, y;

            if (positions.has(posKey)) {
                const pos = positions.get(posKey);
                x = pos.x; y = pos.y;
            } else {
                const col = index % cols;
                const row = Math.floor(index / cols);
                x = 50 + col * (cardWidth + gap);
                y = 50 + row * (cardHeight + gap);
            }

            const card = createFileCard(file, x, y, commitHash);
            canvas.appendChild(card);
            fileCards.set(file.path, card);
        });
    });
}

// ─── Render all files on canvas ──────────────────────────
function renderAllFilesOnCanvas(files) {
    measure('canvas:renderAllFiles', () => {
        clearCanvas();

        const cols = 2;
        const cardWidth = 580;
        const cardHeight = 700;
        const gap = 40;

        files.forEach((file, index) => {
            const posKey = `allfiles:${file.path}`;
            let x, y;

            if (positions.has(posKey)) {
                const pos = positions.get(posKey);
                x = pos.x; y = pos.y;
            } else {
                const col = index % cols;
                const row = Math.floor(index / cols);
                x = 50 + col * (cardWidth + gap);
                y = 50 + row * (cardHeight + gap);
            }

            // Check for persisted size
            const ctx = snap().context;
            let size = ctx.cardSizes?.[file.path];

            // Fallback to saved size from DB
            if (!size && positions.has(posKey)) {
                const pos = positions.get(posKey);
                if (pos.width) size = { width: pos.width, height: pos.height };
            }

            const card = createAllFileCard(file, x, y, size);
            canvas.appendChild(card);
            fileCards.set(file.path, card);

            // Restore scroll position
            const scrollKey = `scroll:${file.path}`;
            if (positions.has(scrollKey)) {
                const savedScroll = positions.get(scrollKey);
                requestAnimationFrame(() => {
                    const body = card.querySelector('.file-card-body');
                    if (body) body.scrollTop = savedScroll.x; // x stores scrollTop
                });
            }
        });

        // Render connections
        renderConnections();
    });
}

function clearCanvas() {
    fileCards.forEach(card => card.remove());
    fileCards.clear();
    canvas.querySelectorAll('.dir-label').forEach(el => el.remove());
    // Clear SVG connections
    if (svgOverlay) svgOverlay.innerHTML = '';
}

// ─── Create file card (commit diff) ─────────────────────
function createFileCard(file, x, y, commitHash) {
    const card = document.createElement('div');
    card.className = `file-card file-card--${file.status || 'modified'}`;
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.dataset.path = file.path;

    // Apply saved size
    const posKey = getPositionKey(file.path, commitHash);
    if (positions.has(posKey)) {
        const pos = positions.get(posKey);
        if (pos.width) card.style.width = `${pos.width}px`;
        if (pos.height) card.style.maxHeight = `${pos.height}px`;
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
        </div>
        <div class="file-card-body">
            <div class="file-path">${escapeHtml(file.path)}</div>
            ${contentHTML}
        </div>
    `;

    setupCardInteraction(card, commitHash);
    setupConnectionDrag(card, file.path);

    // Add scroll listener for connections
    const body = card.querySelector('.file-card-body');
    if (body) {
        body.addEventListener('scroll', () => {
            renderConnections();
        });
    }

    return card;
}

// ─── Create all-file card (working tree) ─────────────────
function createAllFileCard(file, x, y, savedSize) {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.dataset.path = file.path;

    if (savedSize) {
        card.style.width = `${savedSize.width}px`;
        card.style.maxHeight = `${savedSize.height}px`;
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
        const truncNote = file.lines > 500 ? `<span class="more-lines">... ${file.lines - 500} more lines</span>` : '';
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
        </div>
        <div class="file-card-body">
            <div class="file-path">${escapeHtml(dir)}</div>
            ${contentHTML}
        </div>
    `;

    // Setup connection drag from button
    setupConnectionDrag(card, file.path);
    setupCardInteraction(card, 'allfiles');

    // Track scroll position & update connections
    const body = card.querySelector('.file-card-body');
    if (body) {
        body.addEventListener('scroll', () => {
            debounceSaveScroll(file.path, body.scrollTop);
            renderConnections(); // Update connection lines on scroll
        });
    }

    return card;
}

// ─── Card interaction (contextual: center=move, corner=resize) ───
const CORNER_CURSORS = { tl: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', br: 'nwse-resize' };

function isNearCorner(e, card) {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    const c = CORNER_SIZE;

    if (x > w - c && y > h - c) return 'br';
    if (x < c && y > h - c) return 'bl';
    if (x > w - c && y < c) return 'tr';
    if (x < c && y < c) return 'tl';
    return null;
}

function setupCardInteraction(card, commitHash) {
    let action = null; // 'drag' or 'resize'
    let startX, startY;
    let initialSelection = [];
    let initialPositions = {};
    let resizeStartW, resizeStartH, resizeStartLeft, resizeStartTop;
    let resizeCorner = null;

    // Dynamic cursor on mousemove (show resize handles at corners)
    card.addEventListener('mousemove', (e) => {
        if (action) return;
        const corner = isNearCorner(e, card);
        if (corner) {
            card.style.cursor = CORNER_CURSORS[corner];
        } else {
            card.style.cursor = '';
        }
    });

    card.addEventListener('mouseleave', () => {
        if (!action) card.style.cursor = '';
    });

    function onMouseDown(e) {
        if (e.target.tagName === 'BUTTON') return;

        // Skip scrollbar clicks
        if (e.target.closest('.file-card-body') && e.offsetX > e.target.clientWidth) return;

        const ctx = snap().context;
        startX = e.clientX;
        startY = e.clientY;

        // Determine action: corner = resize, else = move
        resizeCorner = isNearCorner(e, card);

        if (resizeCorner) {
            // ── Resize ──
            e.stopPropagation();
            action = 'resize';
            resizeStartW = card.offsetWidth;
            resizeStartH = card.offsetHeight; // Use current height as start
            resizeStartLeft = parseInt(card.style.left) || 0;
            resizeStartTop = parseInt(card.style.top) || 0;
            card.classList.add('resizing');
            document.body.style.cursor = CORNER_CURSORS[resizeCorner];
        } else {
            // ── Move ──
            e.stopPropagation();
            action = 'drag';

            const isSelected = ctx.selectedCards.includes(card.dataset.path);
            if (e.shiftKey) {
                actor.send({ type: 'SELECT_CARD', path: card.dataset.path, shift: true });
                updateSelectionHighlights();
                initialSelection = snap().context.selectedCards.includes(card.dataset.path)
                    ? snap().context.selectedCards
                    : [];
            } else if (isSelected) {
                // Keep group selection for drag
                initialSelection = ctx.selectedCards;
            } else {
                actor.send({ type: 'SELECT_CARD', path: card.dataset.path, shift: false });
                updateSelectionHighlights();
                initialSelection = [card.dataset.path];
            }

            if (initialSelection.length === 0) {
                action = null;
                return;
            }

            // Capture starting positions
            initialPositions = {};
            initialSelection.forEach(path => {
                const c = fileCards.get(path);
                if (c) {
                    initialPositions[path] = { x: parseInt(c.style.left) || 0, y: parseInt(c.style.top) || 0 };
                    c.classList.add('dragging');
                }
            });
        }

        if (action) {
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        }
    }

    function onMouseMove(e) {
        const ctx = snap().context;
        const dx = (e.clientX - startX) / ctx.zoom;
        const dy = (e.clientY - startY) / ctx.zoom;

        if (action === 'drag') {
            initialSelection.forEach(path => {
                const c = fileCards.get(path);
                const pos = initialPositions[path];
                if (c && pos) {
                    c.style.left = `${pos.x + dx}px`;
                    c.style.top = `${pos.y + dy}px`;
                }
            });
            renderConnections();
        } else if (action === 'resize') {
            // Calculate min height: header + path + 60px per hunk (min visible)
            const hunkCount = card.querySelectorAll('.diff-hunk').length || 1;
            const minH = 100 + hunkCount * 80;
            const minW = 240;

            let newW, newH, newLeft, newTop;

            if (resizeCorner === 'br') {
                newW = Math.max(minW, resizeStartW + dx);
                newH = Math.max(minH, resizeStartH + dy);
                newLeft = resizeStartLeft;
                newTop = resizeStartTop;
            } else if (resizeCorner === 'bl') {
                newW = Math.max(minW, resizeStartW - dx);
                newH = Math.max(minH, resizeStartH + dy);
                newLeft = resizeStartLeft + (resizeStartW - newW);
                newTop = resizeStartTop;
            } else if (resizeCorner === 'tr') {
                newW = Math.max(minW, resizeStartW + dx);
                newH = Math.max(minH, resizeStartH - dy);
                newLeft = resizeStartLeft;
                newTop = resizeStartTop + (resizeStartH - newH);
            } else if (resizeCorner === 'tl') {
                newW = Math.max(minW, resizeStartW - dx);
                newH = Math.max(minH, resizeStartH - dy);
                newLeft = resizeStartLeft + (resizeStartW - newW);
                newTop = resizeStartTop + (resizeStartH - newH);
            }

            card.style.width = `${newW}px`;
            card.style.width = `${newW}px`;
            card.style.height = `${newH}px`;
            card.style.maxHeight = 'none'; // Clear max-height if any
            card.style.left = `${newLeft}px`;
            card.style.top = `${newTop}px`;
            renderConnections();
        }
    }

    function onMouseUp(e) {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        const moved = Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3;

        if (action === 'drag') {
            if (moved) {
                initialSelection.forEach(path => {
                    const c = fileCards.get(path);
                    if (c) {
                        c.classList.remove('dragging');
                        savePosition(commitHash, path, parseInt(c.style.left), parseInt(c.style.top));
                    }
                });
            } else {
                // Click without drag — single-select
                if (!e.shiftKey) {
                    actor.send({ type: 'SELECT_CARD', path: card.dataset.path, shift: false });
                    updateSelectionHighlights();
                }
                initialSelection.forEach(path => {
                    const c = fileCards.get(path);
                    if (c) c.classList.remove('dragging');
                });
            }
        } else if (action === 'resize') {
            card.classList.remove('resizing');
            document.body.style.cursor = '';
            const h = card.offsetHeight;
            const x = parseInt(card.style.left) || 0;
            const y = parseInt(card.style.top) || 0;
            actor.send({ type: 'RESIZE_CARD', path: card.dataset.path, width: card.offsetWidth, height: h });
            savePosition(commitHash, card.dataset.path, x, y, card.offsetWidth, h);
        }

        action = null;
        resizeCorner = null;
    }

    card.addEventListener('mousedown', onMouseDown);
}


// ─── Selection highlights ────────────────────────────────
function updateSelectionHighlights() {
    const selected = snap().context.selectedCards;
    fileCards.forEach((card, path) => {
        card.classList.toggle('selected', selected.includes(path));
    });
}

function clearSelectionHighlights() {
    fileCards.forEach(card => card.classList.remove('selected'));
}

// ─── Connection drag from button ─────────────────────────
let connectionDragState = null; // { sourceFile, sourceCard, arrowEl }

function setupConnectionDrag(card, filePath) {
    const connectBtn = card.querySelector('.connect-btn');
    if (!connectBtn) return;

    connectBtn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();

        // Create arrow element
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const btnRect = connectBtn.getBoundingClientRect();
        const vpRect = canvasViewport.getBoundingClientRect();
        const ctx = snap().context;

        const startX = (btnRect.left + btnRect.width / 2 - vpRect.left - ctx.offsetX) / ctx.zoom;
        const startY = (btnRect.top + btnRect.height / 2 - vpRect.top - ctx.offsetY) / ctx.zoom;

        arrow.setAttribute('x1', startX);
        arrow.setAttribute('y1', startY);
        arrow.setAttribute('x2', startX);
        arrow.setAttribute('y2', startY);
        arrow.setAttribute('stroke', 'var(--accent-primary)');
        arrow.setAttribute('stroke-width', '2.5');
        arrow.setAttribute('stroke-dasharray', '6,3');
        arrow.setAttribute('opacity', '0.9');
        svgOverlay.appendChild(arrow);

        // Add a dragging dot at the end
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', startX);
        dot.setAttribute('cy', startY);
        dot.setAttribute('r', '5');
        dot.setAttribute('fill', 'var(--accent-primary)');
        svgOverlay.appendChild(dot);

        connectionDragState = { sourceFile: filePath, sourceCard: card, arrowEl: arrow, dotEl: dot, startX, startY };

        card.classList.add('connecting');
        document.body.style.cursor = 'crosshair';

        window.addEventListener('mousemove', onConnDragMove);
        window.addEventListener('mouseup', onConnDragUp);
    });
}

function onConnDragMove(e) {
    if (!connectionDragState) return;
    const ctx = snap().context;
    const vpRect = canvasViewport.getBoundingClientRect();
    const ex = (e.clientX - vpRect.left - ctx.offsetX) / ctx.zoom;
    const ey = (e.clientY - vpRect.top - ctx.offsetY) / ctx.zoom;

    connectionDragState.arrowEl.setAttribute('x2', ex);
    connectionDragState.arrowEl.setAttribute('y2', ey);
    connectionDragState.dotEl.setAttribute('cx', ex);
    connectionDragState.dotEl.setAttribute('cy', ey);

    // Highlight target card on hover
    const targetCard = document.elementFromPoint(e.clientX, e.clientY)?.closest('.file-card');
    fileCards.forEach((c) => c.classList.remove('connect-target'));
    if (targetCard && targetCard !== connectionDragState.sourceCard) {
        targetCard.classList.add('connect-target');
    }
}

function onConnDragUp(e) {
    window.removeEventListener('mousemove', onConnDragMove);
    window.removeEventListener('mouseup', onConnDragUp);

    if (!connectionDragState) return;

    // Clean up arrow
    connectionDragState.arrowEl.remove();
    connectionDragState.dotEl.remove();
    connectionDragState.sourceCard.classList.remove('connecting');
    fileCards.forEach((c) => c.classList.remove('connect-target'));
    document.body.style.cursor = '';

    // Find target card
    const targetCard = document.elementFromPoint(e.clientX, e.clientY)?.closest('.file-card');
    if (!targetCard || targetCard === connectionDragState.sourceCard) {
        connectionDragState = null;
        return;
    }

    const targetPath = targetCard.dataset.path;
    const sourceFile = connectionDragState.sourceFile;
    connectionDragState = null;

    // Show connection dialog
    showConnectionDialog(sourceFile, targetPath);
}

function showConnectionDialog(sourceFile, targetFile) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'connection-dialog-overlay';

    const sourceLineCount = getFileLineCount(sourceFile);
    const targetLineCount = getFileLineCount(targetFile);

    overlay.innerHTML = `
        <div class="connection-dialog">
            <h3>Create Connection</h3>
            <div class="conn-dialog-row">
                <div class="conn-dialog-file">
                    <label>Source</label>
                    <span class="conn-file-name">${escapeHtml(sourceFile)}</span>
                    <div class="conn-line-range">
                        <label>Lines</label>
                        <input type="number" id="connSourceStart" value="1" min="1" max="${sourceLineCount}" />
                        <span>–</span>
                        <input type="number" id="connSourceEnd" value="${Math.min(10, sourceLineCount)}" min="1" max="${sourceLineCount}" />
                    </div>
                </div>
                <div class="conn-dialog-arrow">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 12h14M13 6l6 6-6 6"/>
                    </svg>
                </div>
                <div class="conn-dialog-file">
                    <label>Target</label>
                    <span class="conn-file-name">${escapeHtml(targetFile)}</span>
                    <div class="conn-line-range">
                        <label>Lines</label>
                        <input type="number" id="connTargetStart" value="1" min="1" max="${targetLineCount}" />
                        <span>–</span>
                        <input type="number" id="connTargetEnd" value="${Math.min(10, targetLineCount)}" min="1" max="${targetLineCount}" />
                    </div>
                </div>
            </div>
            <div class="conn-dialog-comment">
                <label>Comment</label>
                <input type="text" id="connComment" placeholder="Describe this connection..." />
            </div>
            <div class="conn-dialog-actions">
                <button class="btn-secondary" id="connCancel">Cancel</button>
                <button class="btn-primary" id="connCreate">Create Connection</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Focus comment input
    setTimeout(() => overlay.querySelector('#connComment')?.focus(), 100);

    overlay.querySelector('#connCancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#connCreate').addEventListener('click', () => {
        const srcStart = parseInt(overlay.querySelector('#connSourceStart').value) || 1;
        const srcEnd = parseInt(overlay.querySelector('#connSourceEnd').value) || srcStart;
        const tgtStart = parseInt(overlay.querySelector('#connTargetStart').value) || 1;
        const tgtEnd = parseInt(overlay.querySelector('#connTargetEnd').value) || tgtStart;
        const comment = overlay.querySelector('#connComment').value || '';

        actor.send({ type: 'START_CONNECTION', sourceFile, lineStart: srcStart, lineEnd: srcEnd });
        actor.send({ type: 'COMPLETE_CONNECTION', targetFile, lineStart: tgtStart, lineEnd: tgtEnd, comment });
        renderConnections();
        saveConnections();
        showToast('Connection created!', 'success');
        overlay.remove();
    });

    // Enter key creates connection
    overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') overlay.querySelector('#connCreate')?.click();
        if (e.key === 'Escape') overlay.remove();
    });
}

function getFileLineCount(filePath) {
    const card = fileCards.get(filePath);
    if (!card) return 100;
    const lines = card.querySelectorAll('.diff-line');
    return lines.length || 100;
}

// ─── Connections rendering ───────────────────────────────
// ─── Connections rendering ───────────────────────────────
function renderConnections() {
    if (!svgOverlay) return;
    svgOverlay.innerHTML = '';

    const ctx = snap().context;
    // Debounce or frame cap? No, immediate is better for drag smoothness.

    ctx.connections.forEach(conn => {
        const sourceCard = fileCards.get(conn.sourceFile);
        const targetCard = fileCards.get(conn.targetFile);
        if (!sourceCard || !targetCard) return;

        // Helper to get point for a line
        const getPoint = (card, lineNum, isStart) => {
            // Find visible line element
            // Note: line element might be missing if file content isn't loaded or scrolled out?
            // Actually, Diff DOM is always fully rendered in the card body currently?
            // No, the card body scrolls. So we need bounding rect.
            const lineEl = card.querySelector(`.diff-line[data-line="${lineNum}"]`);
            const canvasRect = canvasViewport.getBoundingClientRect(); // Use viewport for relative calc

            if (lineEl) {
                const rect = lineEl.getBoundingClientRect();
                // Check if rect is visible or reasonable?
                // Calculate position relative to canvas VIEWPORT (screen), then adjust by offset/zoom
                // x = (rect.x - canvasRect.x - offsetX) / zoom

                const x = (isStart ? rect.right : rect.left);
                const y = rect.top + rect.height / 2;

                return {
                    x: (x - canvasRect.left - ctx.offsetX) / ctx.zoom,
                    y: (y - canvasRect.top - ctx.offsetY) / ctx.zoom
                };
            } else {
                // Fallback to card center/header if line not found
                // Or maybe the file is collapsed?
                const rect = card.getBoundingClientRect();
                return {
                    x: (isStart ? rect.right : rect.left - canvasRect.left - ctx.offsetX) / ctx.zoom,
                    y: (rect.top + 50 - canvasRect.top - ctx.offsetY) / ctx.zoom
                };
            }
        };

        const startPt = getPoint(sourceCard, conn.sourceLineStart, true);
        const endPt = getPoint(targetCard, conn.targetLineStart, false);

        // Draw bezier curve
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const midX = (startPt.x + endPt.x) / 2;
        path.setAttribute('d', `M ${startPt.x} ${startPt.y} C ${midX} ${startPt.y}, ${midX} ${endPt.y}, ${endPt.x} ${endPt.y}`);
        path.setAttribute('stroke', 'var(--accent-primary)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0.7');
        path.setAttribute('stroke-dasharray', '6,3');
        path.style.cursor = 'pointer';

        path.addEventListener('click', () => navigateToConnection(conn));

        // Label on path (center)
        if (conn.comment) {
            const labelX = (startPt.x + endPt.x) / 2;
            const labelY = (startPt.y + endPt.y) / 2;

            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            group.style.cursor = 'pointer';
            group.addEventListener('click', () => navigateToConnection(conn));

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', labelX);
            text.setAttribute('y', labelY);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('alignment-baseline', 'middle');
            text.setAttribute('fill', 'white');
            text.setAttribute('font-size', '12');
            text.textContent = conn.comment;

            // Background for text
            const bbox = { width: conn.comment.length * 7 + 10, height: 20 }; // approximate
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
            svgOverlay.appendChild(group);
        }

        svgOverlay.appendChild(path);

        // Draw circles
        [startPt, endPt].forEach(pt => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', pt.x);
            circle.setAttribute('cy', pt.y);
            circle.setAttribute('r', '3');
            circle.setAttribute('fill', 'var(--accent-primary)');
            svgOverlay.appendChild(circle);
        });
    });
}

// ─── Navigate to connection target ───────────────────────
function navigateToConnection(conn) {
    measure('connection:navigate', () => {
        const targetCard = fileCards.get(conn.targetFile);
        if (!targetCard) return;

        // Find target line element
        const targetLine = targetCard.querySelector(`.diff-line[data-line="${conn.targetLineStart}"]`);
        if (!targetLine) return;

        // Scroll the card body to show the target line
        const body = targetCard.querySelector('.file-card-body');
        if (body && targetLine) {
            targetLine.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }

        // Move camera to center on target card
        const cardX = parseInt(targetCard.style.left);
        const cardY = parseInt(targetCard.style.top);
        const viewportRect = canvasViewport.getBoundingClientRect();

        const newZoom = 1;
        const newOffsetX = viewportRect.width / 2 - cardX * newZoom - 290;
        const newOffsetY = viewportRect.height / 2 - cardY * newZoom - 350;

        actor.send({ type: 'SET_ZOOM', zoom: newZoom });
        actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
        updateCanvasTransform();
        updateZoomUI();

        // Flash the target lines
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

// ─── Save/Load connections ───────────────────────────────
async function saveConnections() {
    const ctx = snap().context;
    try {
        await fetch('/api/positions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                commitHash: 'connections',
                filePath: 'all',
                x: 0,
                y: 0,
                connections: ctx.connections,
            })
        });
    } catch (e) {
        measure('connections:saveError', () => e);
    }
}

// ─── Preview file ────────────────────────────────────────
async function previewFile(filePath) {
    return measure('file:preview', async () => {
        try {
            const ctx = snap().context;
            const response = await fetch('/api/repo/file-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: ctx.repoPath,
                    commit: ctx.currentCommitHash,
                    filePath
                })
            });

            if (!response.ok) throw new Error(await response.text());

            const data = await response.json();
            document.getElementById('previewFilePath').textContent = filePath;
            document.getElementById('previewContent').textContent = data.content;
            document.getElementById('filePreviewModal').classList.add('active');
        } catch (err) {
            measure('file:previewError', () => err);
            showToast(`Failed: ${err.message}`, 'error');
        }
    });
}
window.previewFile = previewFile;

function closePreview() {
    document.getElementById('filePreviewModal').classList.remove('active');
}

// ─── Fit All ─────────────────────────────────────────────
function fitAllFiles() {
    measure('canvas:fitAll', () => {
        if (fileCards.size === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        fileCards.forEach(card => {
            const x = parseInt(card.style.left);
            const y = parseInt(card.style.top);
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + (card.offsetWidth || 580));
            maxY = Math.max(maxY, y + (card.offsetHeight || 700));
        });

        const viewportRect = canvasViewport.getBoundingClientRect();
        const contentWidth = maxX - minX + 100;
        const contentHeight = maxY - minY + 100;

        const newZoom = Math.min(
            viewportRect.width / contentWidth,
            viewportRect.height / contentHeight,
            1
        );

        const newOffsetX = (viewportRect.width - contentWidth * newZoom) / 2 - minX * newZoom + 50;
        const newOffsetY = (viewportRect.height - contentHeight * newZoom) / 2 - minY * newZoom + 50;

        actor.send({ type: 'SET_ZOOM', zoom: newZoom });
        actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
        updateCanvasTransform();
        updateZoomUI();
    });
}

// ─── Utilities ───────────────────────────────────────────
function getFileIconClass(ext) {
    const extMap = {
        'js': 'js', 'jsx': 'js', 'mjs': 'js',
        'ts': 'ts', 'tsx': 'ts',
        'html': 'html', 'htm': 'html',
        'css': 'css', 'scss': 'css', 'sass': 'css', 'less': 'css',
        'json': 'json',
        'md': 'md', 'markdown': 'md',
        'py': 'py',
        'go': 'go',
        'rs': 'rs'
    };
    return extMap[ext] || '';
}

function getFileIcon(type, ext) {
    if (type === 'folder') {
        return `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/>
        </svg>`;
    }
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
    </svg>`;
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    measure('toast:show', () => {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    });
}

// ─── Boot ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
