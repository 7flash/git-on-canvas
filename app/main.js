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

// ─── Canvas mode cursors ─────────────────────────────────
const MODE_CURSORS = { pan: 'grab', select: 'default', resize: 'default', connect: 'crosshair' };
const MODE_LABELS = { pan: 'Pan', select: 'Select', resize: 'Resize', connect: 'Connect' };
const MODE_HOTKEYS = { '1': 'pan', '2': 'select', '3': 'resize', '4': 'connect' };

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
        setupHotkeys();
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

        // Subscribe to state changes for UI sync
        actor.subscribe(state => {
            syncCanvasModeUI(state.context.canvasMode);
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

async function savePosition(commitHash, filePath, x, y) {
    return measure('positions:save', async () => {
        try {
            const posKey = `${commitHash}:${filePath}`;
            positions.set(posKey, { x, y });
            await fetch('/api/positions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commitHash, filePath, x, y })
            });
        } catch (e) {
            measure('positions:saveError', () => e);
        }
    });
}

function getPositionKey(filePath, commitHash) {
    return `${commitHash}:${filePath}`;
}

// ─── Canvas interaction ──────────────────────────────────
function setupCanvasInteraction() {
    measure('canvas:setupInteraction', () => {
        // Wheel zoom
        canvasViewport.addEventListener('wheel', (e) => {
            const scrollTarget = e.target.closest('.hunk-current-pane') || e.target.closest('.hunk-removed-pane') || e.target.closest('.file-card-body') || e.target.closest('.file-content-preview');
            if (scrollTarget) {
                const isScrollable = scrollTarget.scrollHeight > scrollTarget.clientHeight;
                if (isScrollable) {
                    const atTop = scrollTarget.scrollTop === 0 && e.deltaY < 0;
                    const atBottom = (scrollTarget.scrollTop + scrollTarget.clientHeight >= scrollTarget.scrollHeight - 1) && e.deltaY > 0;
                    if (!atTop && !atBottom) {
                        // Save scroll position for all-files mode
                        const card = scrollTarget.closest('.file-card');
                        if (card && snap().value?.view === 'allfiles') {
                            debounceSaveScroll(card.dataset.path, scrollTarget.scrollTop);
                        }
                        e.stopPropagation();
                        return;
                    }
                }
            }

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
        });

        // Pan (only in pan mode, or always with middle mouse)
        canvasViewport.addEventListener('mousedown', (e) => {
            const mode = snap().context.canvasMode;
            const insideCard = e.target.closest('.file-card');

            if (mode === 'pan' && !insideCard) {
                isDragging = true;
                const ctx = snap().context;
                dragStartX = e.clientX - ctx.offsetX;
                dragStartY = e.clientY - ctx.offsetY;
                canvasViewport.style.cursor = 'grabbing';
            } else if (mode === 'select' && !insideCard) {
                // Deselect all when clicking empty space
                actor.send({ type: 'DESELECT_ALL' });
                clearSelectionHighlights();
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
                const mode = snap().context.canvasMode;
                canvasViewport.style.cursor = MODE_CURSORS[mode] || 'grab';
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

        // Canvas mode buttons
        document.querySelectorAll('.canvas-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                setCanvasMode(mode);
            });
        });

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

// ─── Hotkeys ─────────────────────────────────────────────
function setupHotkeys() {
    window.addEventListener('keydown', (e) => {
        // Don't trigger if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const mode = MODE_HOTKEYS[e.key];
        if (mode) {
            e.preventDefault();
            setCanvasMode(mode);
        }
    });
}

function setCanvasMode(mode) {
    const eventMap = {
        pan: 'SET_MODE_PAN',
        select: 'SET_MODE_SELECT',
        resize: 'SET_MODE_RESIZE',
        connect: 'SET_MODE_CONNECT',
    };
    actor.send({ type: eventMap[mode] });
    syncCanvasModeUI(mode);
    showToast(`Mode: ${MODE_LABELS[mode]} (${Object.entries(MODE_HOTKEYS).find(([k, v]) => v === mode)?.[0]})`, 'info');
}

function syncCanvasModeUI(mode) {
    canvasViewport.style.cursor = MODE_CURSORS[mode] || 'grab';
    document.querySelectorAll('.canvas-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    // Show mode indicator
    const indicator = document.getElementById('modeIndicator');
    if (indicator) {
        indicator.textContent = MODE_LABELS[mode];
        indicator.dataset.mode = mode;
    }
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
            const size = ctx.cardSizes?.[file.path];

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
        </div>
        <div class="file-card-body">
            <div class="file-path">${escapeHtml(file.path)}</div>
            ${contentHTML}
        </div>
    `;

    setupCardInteraction(card, commitHash);
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
        </div>
        <div class="file-card-body">
            <div class="file-path">${escapeHtml(dir)}</div>
            ${contentHTML}
        </div>
    `;

    // Setup line selection for connect mode
    setupLineSelection(card, file.path);
    setupCardInteraction(card, 'allfiles');

    // Track scroll position
    const body = card.querySelector('.file-card-body');
    if (body) {
        body.addEventListener('scroll', () => {
            debounceSaveScroll(file.path, body.scrollTop);
        });
    }

    return card;
}

// ─── Card interaction (drag, select, resize) ─────────────
function setupCardInteraction(card, commitHash) {
    let cardDragging = false;
    let cardStartX, cardStartY, cardOffsetX, cardOffsetY;
    let resizing = false;
    let resizeStartW, resizeStartH, resizeStartMouseX, resizeStartMouseY;

    card.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        const mode = snap().context.canvasMode;

        if (mode === 'pan') {
            // Only drag from header
            const header = e.target.closest('.file-card-header');
            if (!header) return;
            startDrag(e);
        } else if (mode === 'select') {
            actor.send({ type: 'SELECT_CARD', path: card.dataset.path, shift: e.shiftKey });
            updateSelectionHighlights();
            // Also allow drag in select mode from header
            const header = e.target.closest('.file-card-header');
            if (header) startDrag(e);
        } else if (mode === 'resize') {
            // Check if near card edge (bottom-right corner)
            const rect = card.getBoundingClientRect();
            const edgeThreshold = 20;
            const nearRight = e.clientX > rect.right - edgeThreshold;
            const nearBottom = e.clientY > rect.bottom - edgeThreshold;
            if (nearRight || nearBottom) {
                e.stopPropagation();
                resizing = true;
                resizeStartW = card.offsetWidth;
                resizeStartH = card.offsetHeight;
                resizeStartMouseX = e.clientX;
                resizeStartMouseY = e.clientY;
                card.classList.add('resizing');

                const onMove = (e) => {
                    if (!resizing) return;
                    const ctx = snap().context;
                    const dw = (e.clientX - resizeStartMouseX) / ctx.zoom;
                    const dh = (e.clientY - resizeStartMouseY) / ctx.zoom;
                    card.style.width = `${Math.max(200, resizeStartW + dw)}px`;
                    card.style.maxHeight = `${Math.max(100, resizeStartH + dh)}px`;
                };

                const onUp = () => {
                    resizing = false;
                    card.classList.remove('resizing');
                    actor.send({
                        type: 'RESIZE_CARD',
                        path: card.dataset.path,
                        width: card.offsetWidth,
                        height: parseInt(card.style.maxHeight) || card.offsetHeight,
                    });
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                };

                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            } else {
                // Drag from header in resize mode
                const header = e.target.closest('.file-card-header');
                if (header) startDrag(e);
            }
        }
        // Connect mode handled by line selection
    });

    function startDrag(e) {
        e.stopPropagation();
        cardDragging = true;
        card.classList.add('dragging');
        const ctx = snap().context;

        cardStartX = parseInt(card.style.left) || 0;
        cardStartY = parseInt(card.style.top) || 0;
        cardOffsetX = e.clientX / ctx.zoom;
        cardOffsetY = e.clientY / ctx.zoom;

        const onMouseMove = (e) => {
            if (!cardDragging) return;
            const ctx = snap().context;
            const dx = (e.clientX / ctx.zoom) - cardOffsetX;
            const dy = (e.clientY / ctx.zoom) - cardOffsetY;
            card.style.left = `${cardStartX + dx}px`;
            card.style.top = `${cardStartY + dy}px`;
            // Re-render connections while dragging
            renderConnections();
        };

        const onMouseUp = () => {
            if (cardDragging) {
                cardDragging = false;
                card.classList.remove('dragging');
                savePosition(
                    commitHash,
                    card.dataset.path,
                    parseInt(card.style.left),
                    parseInt(card.style.top)
                );
            }
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }
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

// ─── Line selection for connections ──────────────────────
function setupLineSelection(card, filePath) {
    let selectionStart = null;

    card.addEventListener('mousedown', (e) => {
        const mode = snap().context.canvasMode;
        if (mode !== 'connect') return;

        const diffLine = e.target.closest('.diff-line');
        if (!diffLine) return;

        e.stopPropagation();
        const lineNum = parseInt(diffLine.dataset.line);
        if (isNaN(lineNum)) return;

        selectionStart = lineNum;

        // Highlight the starting line
        diffLine.classList.add('line-selected');
    });

    card.addEventListener('mouseup', (e) => {
        const mode = snap().context.canvasMode;
        if (mode !== 'connect' || selectionStart === null) return;

        const diffLine = e.target.closest('.diff-line');
        if (!diffLine) { selectionStart = null; return; }

        const lineEnd = parseInt(diffLine.dataset.line);
        if (isNaN(lineEnd)) { selectionStart = null; return; }

        const lineStart = Math.min(selectionStart, lineEnd);
        const lineEndFinal = Math.max(selectionStart, lineEnd);

        // Highlight range
        card.querySelectorAll('.diff-line').forEach(line => {
            const ln = parseInt(line.dataset.line);
            line.classList.toggle('line-selected', ln >= lineStart && ln <= lineEndFinal);
        });

        const pending = snap().context.pendingConnection;

        if (!pending) {
            // Start connection
            actor.send({ type: 'START_CONNECTION', sourceFile: filePath, lineStart, lineEnd: lineEndFinal });
            showToast(`Selected lines ${lineStart}-${lineEndFinal}. Now click target lines in another file.`, 'info');
        } else if (pending.sourceFile !== filePath) {
            // Complete connection — ask for comment
            const comment = prompt('Connection comment (optional):') || '';
            actor.send({ type: 'COMPLETE_CONNECTION', targetFile: filePath, lineStart, lineEnd: lineEndFinal, comment });
            showToast('Connection created!', 'success');
            renderConnections();
            // Save connections
            saveConnections();
        } else {
            showToast('Select lines in a different file to create a connection', 'warning');
        }

        selectionStart = null;
    });
}

// ─── Connections rendering ───────────────────────────────
function renderConnections() {
    if (!svgOverlay) return;
    svgOverlay.innerHTML = '';

    const ctx = snap().context;
    ctx.connections.forEach(conn => {
        const sourceCard = fileCards.get(conn.sourceFile);
        const targetCard = fileCards.get(conn.targetFile);
        if (!sourceCard || !targetCard) return;

        // Find source line element center
        const sourceLines = sourceCard.querySelectorAll('.diff-line');
        const targetLines = targetCard.querySelectorAll('.diff-line');

        let sourceEl = null, targetEl = null;
        sourceLines.forEach(l => {
            const ln = parseInt(l.dataset.line);
            if (ln >= conn.sourceLineStart && ln <= conn.sourceLineEnd) {
                if (!sourceEl) sourceEl = l;
                l.classList.add('line-connected');
            }
        });
        targetLines.forEach(l => {
            const ln = parseInt(l.dataset.line);
            if (ln >= conn.targetLineStart && ln <= conn.targetLineEnd) {
                if (!targetEl) targetEl = l;
                l.classList.add('line-connected');
            }
        });

        if (!sourceEl || !targetEl) return;

        // Calculate positions relative to canvas
        const sourceRect = sourceEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();

        const sx = (sourceRect.right - canvasRect.left) / ctx.zoom;
        const sy = (sourceRect.top + sourceRect.height / 2 - canvasRect.top) / ctx.zoom;
        const tx = (targetRect.left - canvasRect.left) / ctx.zoom;
        const ty = (targetRect.top + targetRect.height / 2 - canvasRect.top) / ctx.zoom;

        // Draw bezier curve
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const midX = (sx + tx) / 2;
        path.setAttribute('d', `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`);
        path.setAttribute('stroke', 'var(--accent-primary)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0.7');
        path.setAttribute('stroke-dasharray', '6,3');
        path.style.pointerEvents = 'stroke';
        path.style.cursor = 'pointer';

        // Click to navigate
        path.addEventListener('click', () => navigateToConnection(conn));

        // Tooltip
        if (conn.comment) {
            const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            title.textContent = conn.comment;
            path.appendChild(title);
        }

        svgOverlay.appendChild(path);

        // Draw small circle at each end
        [{ x: sx, y: sy }, { x: tx, y: ty }].forEach(pt => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', pt.x);
            circle.setAttribute('cy', pt.y);
            circle.setAttribute('r', '4');
            circle.setAttribute('fill', 'var(--accent-primary)');
            circle.setAttribute('opacity', '0.8');
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
