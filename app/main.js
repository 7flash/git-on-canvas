import { measure } from './lib/measure.js';

// Canvas state
let canvas, canvasViewport;
let offsetX = 0, offsetY = 0;
let zoom = 1;
let isDragging = false;
let dragStartX, dragStartY;
let fileCards = new Map();
let positions = new Map(); // Store file positions

// Current repo state
let currentRepo = '';
let currentCommit = null;
let commits = [];

// Initialize app
async function init() {
    return measure('app:init', async () => {
        canvas = document.getElementById('canvas');
        canvasViewport = document.getElementById('canvasViewport');

        setupCanvasInteraction();
        setupEventListeners();
        await loadSavedPositions();

        // Check for saved repo
        const savedRepo = localStorage.getItem('gitcanvas:lastRepo');
        if (savedRepo) {
            document.getElementById('repoPath').value = savedRepo;
        }
    });
}

// Load saved positions from API
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

// Save single position to API
async function savePosition(commitHash, filePath, x, y) {
    return measure('positions:save', async () => {
        try {
            // Update local cache
            const posKey = `${commitHash}:${filePath}`;
            positions.set(posKey, { x, y });

            // Persist to server
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

// Get position key for a file in a commit
function getPositionKey(filePath, commitHash) {
    return `${commitHash}:${filePath}`;
}

// Setup canvas pan/zoom interaction
function setupCanvasInteraction() {
    measure('canvas:setupInteraction', () => {
        // Mouse wheel zoom
        canvasViewport.addEventListener('wheel', (e) => {
            // If hovering over a scrollable file card body, let it scroll naturally
            const cardBody = e.target.closest('.file-card-body');
            if (cardBody) {
                // Only let native scroll happen if content is actually scrollable
                const isScrollable = cardBody.scrollHeight > cardBody.clientHeight;
                if (isScrollable) {
                    // Check if we're at scroll boundaries - if so, zoom canvas instead
                    const atTop = cardBody.scrollTop === 0 && e.deltaY < 0;
                    const atBottom = (cardBody.scrollTop + cardBody.clientHeight >= cardBody.scrollHeight - 1) && e.deltaY > 0;
                    if (!atTop && !atBottom) {
                        // Let the card body scroll naturally
                        e.stopPropagation();
                        return;
                    }
                }
            }

            // Also allow scrolling inside the file-content-preview
            const contentPreview = e.target.closest('.file-content-preview');
            if (contentPreview) {
                const isScrollable = contentPreview.scrollHeight > contentPreview.clientHeight;
                if (isScrollable) {
                    const atTop = contentPreview.scrollTop === 0 && e.deltaY < 0;
                    const atBottom = (contentPreview.scrollTop + contentPreview.clientHeight >= contentPreview.scrollHeight - 1) && e.deltaY > 0;
                    if (!atTop && !atBottom) {
                        e.stopPropagation();
                        return;
                    }
                }
            }

            e.preventDefault();

            const rect = canvasViewport.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.min(3, Math.max(0.1, zoom * delta));

            // Zoom towards mouse position
            const scale = newZoom / zoom;
            offsetX = mouseX - (mouseX - offsetX) * scale;
            offsetY = mouseY - (mouseY - offsetY) * scale;

            zoom = newZoom;
            updateCanvasTransform();
            updateZoomUI();
        });

        // Pan with mouse drag
        canvasViewport.addEventListener('mousedown', (e) => {
            if (e.target === canvasViewport || e.target.classList.contains('canvas-grid')) {
                isDragging = true;
                dragStartX = e.clientX - offsetX;
                dragStartY = e.clientY - offsetY;
                canvasViewport.style.cursor = 'grabbing';
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (isDragging) {
                offsetX = e.clientX - dragStartX;
                offsetY = e.clientY - dragStartY;
                updateCanvasTransform();
            }
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            canvasViewport.style.cursor = 'grab';
        });
    });
}

// Update canvas transform
function updateCanvasTransform() {
    measure('canvas:updateTransform', () => {
        canvas.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;
        updateMinimap();
    });
}

// Update zoom UI
function updateZoomUI() {
    measure('zoom:updateUI', () => {
        const slider = document.getElementById('zoomSlider');
        const value = document.getElementById('zoomValue');
        slider.value = zoom;
        value.textContent = `${Math.round(zoom * 100)}%`;
    });
}

// Update minimap
function updateMinimap() {
    measure('minimap:update', () => {
        const minimap = document.getElementById('minimap');
        const viewport = document.getElementById('minimapViewport');

        const canvasRect = canvasViewport.getBoundingClientRect();
        const scale = minimap.offsetWidth / 5000;

        const vpWidth = (canvasRect.width / zoom) * scale;
        const vpHeight = (canvasRect.height / zoom) * scale;
        const vpX = (-offsetX / zoom) * scale;
        const vpY = (-offsetY / zoom) * scale;

        viewport.style.width = `${vpWidth}px`;
        viewport.style.height = `${vpHeight}px`;
        viewport.style.left = `${vpX}px`;
        viewport.style.top = `${vpY}px`;
    });
}

// Setup event listeners
function setupEventListeners() {
    measure('events:setup', () => {
        // Load repo button
        document.getElementById('loadRepo').addEventListener('click', loadRepository);

        // Enter key on repo path
        document.getElementById('repoPath').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') loadRepository();
        });

        // Zoom slider
        document.getElementById('zoomSlider').addEventListener('input', (e) => {
            zoom = parseFloat(e.target.value);
            updateCanvasTransform();
            updateZoomUI();
        });

        // Reset view button
        document.getElementById('resetView').addEventListener('click', () => {
            offsetX = 0;
            offsetY = 0;
            zoom = 1;
            updateCanvasTransform();
            updateZoomUI();
        });

        // Fit all button
        document.getElementById('fitAll').addEventListener('click', fitAllFiles);

        // Close preview modal
        document.getElementById('closePreview').addEventListener('click', closePreview);
        document.querySelector('.modal-backdrop').addEventListener('click', closePreview);

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closePreview();
        });
    });
}

// Load repository
async function loadRepository() {
    const repoPath = document.getElementById('repoPath').value.trim();
    if (!repoPath) {
        showToast('Please enter a repository path', 'error');
        return;
    }

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
            currentRepo = repoPath;
            commits = data.commits;

            localStorage.setItem('gitcanvas:lastRepo', repoPath);

            renderCommitTimeline();

            if (commits.length > 0) {
                selectCommit(commits[0].hash);
            }

            showToast(`Loaded ${commits.length} commits`, 'success');
        } catch (err) {
            measure('repo:loadError', () => err);
            showToast(`Failed to load repository: ${err.message}`, 'error');
        }
    });
}

// Render commit timeline
function renderCommitTimeline() {
    measure('timeline:render', () => {
        const container = document.getElementById('timelineContainer');
        const countBadge = document.getElementById('commitCount');

        countBadge.textContent = commits.length;

        if (commits.length === 0) {
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

        container.innerHTML = commits.map(commit => `
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

// Select a commit
async function selectCommit(hash) {
    return measure('commit:select', async () => {
        // Update UI
        document.querySelectorAll('.commit-item').forEach(el => {
            el.classList.toggle('active', el.dataset.hash === hash);
        });

        currentCommit = commits.find(c => c.hash === hash);

        document.getElementById('currentCommitInfo').innerHTML = `
            <span class="commit-hash">${hash.substring(0, 7)}</span>
            <span style="color: var(--text-secondary)">${escapeHtml(currentCommit?.message || '')}</span>
        `;

        // Load files for this commit
        try {
            const response = await fetch('/api/repo/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: currentRepo, commit: hash })
            });

            if (!response.ok) throw new Error(await response.text());

            const data = await response.json();
            renderFilesOnCanvas(data.files, hash);

            document.getElementById('fileCount').textContent = data.files.length;
        } catch (err) {
            measure('commit:selectError', () => err);
            showToast(`Failed to load files: ${err.message}`, 'error');
        }
    });
}
// Make selectCommit available globally
window.selectCommit = selectCommit;

// Render files on canvas - now shows only CHANGED files with content
function renderFilesOnCanvas(files, commitHash) {
    measure('canvas:renderFiles', () => {
        // Clear existing cards
        fileCards.forEach(card => card.remove());
        fileCards.clear();

        // Layout for content cards
        const cols = Math.min(files.length, 2); // Max 2 columns for readability
        const cardWidth = 520;
        const cardHeight = 500;
        const gap = 40;

        files.forEach((file, index) => {
            const posKey = getPositionKey(file.path, commitHash);
            let x, y;

            if (positions.has(posKey)) {
                const pos = positions.get(posKey);
                x = pos.x;
                y = pos.y;
            } else {
                // Auto-layout in grid
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

// Create a file card element with full content display
function createFileCard(file, x, y, commitHash) {
    const card = document.createElement('div');
    card.className = `file-card file-card--${file.status || 'modified'}`;
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.dataset.path = file.path;

    const ext = file.name.split('.').pop().toLowerCase();
    const iconClass = getFileIconClass(ext);

    // Status badge styling
    const statusColors = {
        added: '#22c55e',
        modified: '#eab308',
        deleted: '#ef4444'
    };
    const statusLabels = {
        added: '+ ADDED',
        modified: '~ MODIFIED',
        deleted: '- DELETED'
    };
    const statusColor = statusColors[file.status] || '#a855f7';
    const statusLabel = statusLabels[file.status] || file.status?.toUpperCase() || 'CHANGED';

    // Format full file content
    let contentPreview = '';
    if (file.content) {
        const lines = file.content.split('\n');
        contentPreview = lines
            .map((line, i) => `<span class="line-num">${String(i + 1).padStart(3, ' ')}</span> ${escapeHtml(line)}`)
            .join('\n');
    } else if (file.status === 'deleted') {
        contentPreview = '<span class="deleted-notice">File was deleted in this commit</span>';
    } else if (file.contentError) {
        contentPreview = `<span class="error-notice">Error: ${escapeHtml(file.contentError)}</span>`;
    }

    card.innerHTML = `
        <div class="file-card-header" style="border-left: 4px solid ${statusColor}">
            <div class="file-icon ${iconClass}">
                ${getFileIcon(file.type, ext)}
            </div>
            <span class="file-name">${escapeHtml(file.name)}</span>
            <span class="file-status" style="background: ${statusColor}20; color: ${statusColor}; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${statusLabel}</span>
        </div>
        <div class="file-card-body">
            <div class="file-path">${escapeHtml(file.path)}</div>
            <div class="file-meta">
                <span>${file.lines || 0} lines</span>
            </div>
            <div class="file-content-preview">
                <pre><code>${contentPreview}</code></pre>
            </div>
        </div>
        <div class="file-card-actions">
            <button class="file-action" onclick="previewFile('${escapeHtml(file.path)}')">Full View</button>
        </div>
    `;

    // Setup drag functionality
    setupCardDrag(card, commitHash);

    return card;
}

// Setup card drag
function setupCardDrag(card, commitHash) {
    let cardDragging = false;
    let cardStartX, cardStartY, cardOffsetX, cardOffsetY;

    card.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;

        e.stopPropagation();
        cardDragging = true;
        card.classList.add('dragging');

        cardStartX = parseInt(card.style.left) || 0;
        cardStartY = parseInt(card.style.top) || 0;
        cardOffsetX = e.clientX / zoom;
        cardOffsetY = e.clientY / zoom;

        const onMouseMove = (e) => {
            if (!cardDragging) return;

            const dx = (e.clientX / zoom) - cardOffsetX;
            const dy = (e.clientY / zoom) - cardOffsetY;

            card.style.left = `${cardStartX + dx}px`;
            card.style.top = `${cardStartY + dy}px`;
        };

        const onMouseUp = () => {
            if (cardDragging) {
                cardDragging = false;
                card.classList.remove('dragging');

                // Save new position to server
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
    });
}

// Preview file
async function previewFile(filePath) {
    return measure('file:preview', async () => {
        try {
            const response = await fetch('/api/repo/file-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: currentRepo,
                    commit: currentCommit.hash,
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
            showToast(`Failed to load file: ${err.message}`, 'error');
        }
    });
}
window.previewFile = previewFile;

// Close preview modal
function closePreview() {
    document.getElementById('filePreviewModal').classList.remove('active');
}

// Fit all files in view
function fitAllFiles() {
    measure('canvas:fitAll', () => {
        if (fileCards.size === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        fileCards.forEach(card => {
            const x = parseInt(card.style.left);
            const y = parseInt(card.style.top);
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + 200);
            maxY = Math.max(maxY, y + 100);
        });

        const viewportRect = canvasViewport.getBoundingClientRect();
        const contentWidth = maxX - minX + 100;
        const contentHeight = maxY - minY + 100;

        zoom = Math.min(
            viewportRect.width / contentWidth,
            viewportRect.height / contentHeight,
            1
        );

        offsetX = (viewportRect.width - contentWidth * zoom) / 2 - minX * zoom + 50;
        offsetY = (viewportRect.height - contentHeight * zoom) / 2 - minY * zoom + 50;

        updateCanvasTransform();
        updateZoomUI();
    });
}

// Utility functions
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

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
