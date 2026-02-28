// @ts-nocheck
/**
 * Repository management — load, commit timeline, select commit, all-files.
 */
import { measure } from 'measure-fn';
import { render } from 'melina/client';
import type { CanvasContext } from './context';
import { escapeHtml, formatDate, showToast } from './utils';
import { clearCanvas, getAutoColumnCount, updateCanvasTransform, updateZoomUI, updateMinimap, forceMinimapRebuild } from './canvas';
import { getPositionKey } from './positions';
import { updateHiddenUI } from './hidden-files';
import { showLoadingProgress, updateLoadingProgress, hideLoadingProgress } from './loading';
import { createFileCard, createAllFileCard, debounceSaveScroll } from './cards';
import { getActiveLayer } from './layers';
import { renderConnections, buildConnectionMarkers } from './connections';

// Shared: reference to ctx for changed-files panel navigation
let _panelCtx: CanvasContext | null = null;
export function setPanelCtx(ctx: CanvasContext) { _panelCtx = ctx; }

// ─── Load repository ─────────────────────────────────────
export async function loadRepository(ctx: CanvasContext, repoPath: string) {
    if (!repoPath) return;
    _panelCtx = ctx;
    ctx.actor.send({ type: 'LOAD_REPO', path: repoPath });

    return measure('repo:load', async () => {
        try {
            showLoadingProgress(ctx, 'Loading repository...');
            updateLoadingProgress(ctx, repoPath);

            const response = await fetch('/api/repo/load', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: repoPath })
            });

            if (!response.ok) throw new Error(await response.text());

            updateLoadingProgress(ctx, 'Parsing commits...');
            const data = await response.json();
            ctx.actor.send({ type: 'REPO_LOADED', commits: data.commits });

            // Use replaceState instead of location.hash to avoid triggering
            // Melina's navigation interceptor (popstate) which would replace
            // the entire DOM and invalidate ctx.canvas references.
            history.replaceState(null, '', '#' + encodeURIComponent(repoPath));
            localStorage.setItem('gitcanvas:lastRepo', repoPath);

            updateLoadingProgress(ctx, `Found ${data.commits.length} commits, rendering timeline...`);
            renderCommitTimeline(ctx);

            const viewState = ctx.snap().value?.view;
            // Always load all files first
            updateLoadingProgress(ctx, 'Loading all files...');
            await loadAllFiles(ctx);

            // Then select the first commit to get diff data
            if (data.commits.length > 0) {
                updateLoadingProgress(ctx, 'Loading commit diff...');
                await selectCommit(ctx, data.commits[0].hash);
            }

            hideLoadingProgress(ctx);
            showToast(`Loaded ${data.commits.length} commits`, 'success');
        } catch (err) {
            hideLoadingProgress(ctx);
            ctx.actor.send({ type: 'REPO_ERROR', error: err.message });
            measure('repo:loadError', () => err);
            showToast(`Failed: ${err.message} `, 'error');
        }
    });
}

// ─── Load all files (working tree) ───────────────────────
export async function loadAllFiles(ctx: CanvasContext) {
    const state = ctx.snap().context;
    if (!state.repoPath) return;

    return measure('allfiles:load', async () => {
        try {
            const response = await fetch('/api/repo/tree', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: state.repoPath })
            });

            if (!response.ok) throw new Error(await response.text());

            const data = await response.json();
            ctx.actor.send({ type: 'ALL_FILES_LOADED', files: data.files });
            ctx.allFilesData = data.files;
            renderAllFilesOnCanvas(ctx, data.files);
            const fileCountEl = document.getElementById('fileCount');
            if (fileCountEl) fileCountEl.textContent = data.total;
        } catch (err) {
            measure('allfiles:loadError', () => err);
            showToast(`Failed to load files: ${err.message} `, 'error');
        }
    });
}

// ─── JSX Components for commit sidebar ──────────────────
function CommitItem({ commit, onClick }: { commit: any; onClick: () => void }) {
    // Derive handle from email (part before @) — more useful than git config name
    const handle = commit.email
        ? commit.email.split('@')[0]
        : commit.author;
    return (
        <div className="commit-item" data-hash={commit.hash} onClick={onClick}>
            <div className="commit-hash">{commit.hash.substring(0, 7)}</div>
            <div className="commit-message">{commit.message}</div>
            <div className="commit-meta">
                <span className="commit-author">👤 {handle}</span>
                <span>{formatDate(commit.date)}</span>
            </div>
        </div>
    );
}

function CommitInfo({ hash, message, allFiles, changedCount }: {
    hash?: string; message?: string; allFiles?: boolean; changedCount?: number;
}) {
    return (
        <>
            {allFiles && <span style="color: var(--accent-tertiary)">All Files</span>}
            {hash ? (
                <span className="commit-hash">{hash.substring(0, 7)}</span>
            ) : null}
            {message ? (
                <span style="color: var(--text-secondary)">{message}</span>
            ) : null}
            {!hash && allFiles ? (
                <span style="color: var(--text-muted)">Working tree</span>
            ) : null}
            {changedCount !== undefined ? (
                <span style="color: var(--text-muted); font-size: 0.7rem">• {changedCount} changed</span>
            ) : null}
        </>
    );
}

function updateCommitInfo(hash?: string, message?: string, allFiles?: boolean, changedCount?: number) {
    const el = document.getElementById('currentCommitInfo');
    if (el) render(<CommitInfo hash={hash} message={message} allFiles={allFiles} changedCount={changedCount} />, el);
}

// ─── Commit timeline render ──────────────────────────────
export function renderCommitTimeline(ctx: CanvasContext) {
    measure('timeline:render', () => {
        const container = document.getElementById('timelineContainer');
        const countBadge = document.getElementById('commitCount');
        const state = ctx.snap().context;
        const commitsList = state.commits;

        if (countBadge) countBadge.textContent = commitsList.length;

        if (!container) return;

        if (commitsList.length === 0) {
            render(
                <div className="empty-state">
                    <span style="opacity:0.4;font-size:32px">🕐</span>
                    <p>No commits found</p>
                </div>,
                container
            );
            return;
        }

        render(
            <>
                {commitsList.map(commit => (
                    <CommitItem
                        key={commit.hash}
                        commit={commit}
                        onClick={() => selectCommit(ctx, commit.hash)}
                    />
                ))}
            </>,
            container
        );
    });
}

// ─── Select commit ───────────────────────────────────────
export async function selectCommit(ctx: CanvasContext, hash: string) {
    return measure('commit:select', async () => {
        ctx.actor.send({ type: 'SELECT_COMMIT', hash });

        document.querySelectorAll('.commit-item').forEach(el => {
            el.classList.toggle('active', el.dataset.hash === hash);
        });

        const state = ctx.snap().context;
        const commit = state.commits.find(c => c.hash === hash);

        // Show non-blocking inline progress bar (not overlay)
        _showCommitProgress(true, `${hash.substring(0, 7)} — ${commit?.message || ''}`);

        try {
            const response = await fetch('/api/repo/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: state.repoPath, commit: hash })
            });

            if (!response.ok) throw new Error(await response.text());

            const data = await response.json();
            ctx.actor.send({ type: 'COMMIT_FILES_LOADED', files: data.files });
            ctx.commitFilesData = data.files;

            // Always re-render all files with highlighted changes
            ctx.changedFilePaths = new Set(data.files.map(f => f.path));
            if (ctx.allFilesData && ctx.allFilesData.length > 0) {
                renderAllFilesOnCanvas(ctx, ctx.allFilesData);
            }

            updateCommitInfo(hash, commit?.message || '', true, data.files.length);

            const fileCountEl = document.getElementById('fileCount');
            if (fileCountEl) fileCountEl.textContent = ctx.fileCards.size;
            _showCommitProgress(false);

            // Populate changed files panel with diff stats
            populateChangedFilesPanel(data.files);
        } catch (err) {
            _showCommitProgress(false);
            measure('commit:selectError', () => err);
            showToast(`Failed: ${err.message} `, 'error');
        }
    });
}

// ─── Inline commit progress bar (non-blocking) ──────────
function _showCommitProgress(show: boolean, text?: string) {
    let bar = document.getElementById('commitProgressBar');
    if (show) {
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'commitProgressBar';
            bar.className = 'commit-progress-bar';
            const canvasArea = document.querySelector('.canvas-area');
            if (canvasArea) {
                canvasArea.insertBefore(bar, canvasArea.querySelector('.canvas-viewport'));
            } else {
                document.body.appendChild(bar);
            }
        }
        bar.innerHTML = `<div class="commit-progress-track"><div class="commit-progress-fill"></div></div>${text ? `<span class="commit-progress-text">${text}</span>` : ''}`;
        bar.style.display = 'flex';
    } else if (bar) {
        bar.style.display = 'none';
    }
}

// ─── Render files on canvas (commits mode) ───────────────
export function renderFilesOnCanvas(ctx: CanvasContext, files: any[], commitHash: string) {
    measure('canvas:renderFiles', () => {
        clearCanvas(ctx);

        let layerFiles = visibleFiles;
        const activeLayer = getActiveLayer();
        if (activeLayer) {
            layerFiles = visibleFiles.filter(f => !!activeLayer.files[f.path]);
        }

        const cols = Math.min(layerFiles.length, getAutoColumnCount(ctx));
        const cardWidth = 580;
        const cardHeight = 700;
        const gap = 40;

        layerFiles.forEach((f, index) => {
            const posKey = getPositionKey(f.path, commitHash);
            let x: number, y: number;

            if (ctx.positions.has(posKey)) {
                const pos = ctx.positions.get(posKey);
                x = pos.x; y = pos.y;
            } else {
                const col = index % cols;
                const row = Math.floor(index / cols);
                x = 50 + col * (cardWidth + gap);
                y = 50 + row * (cardHeight + gap);
            }

            const file = { ...f };
            if (activeLayer && activeLayer.files[file.path]) {
                file.layerSections = activeLayer.files[file.path].sections;
            }

            const card = createFileCard(ctx, file, x, y, commitHash);
            ctx.canvas.appendChild(card);
            ctx.fileCards.set(file.path, card);
        });
        renderConnections(ctx);
        buildConnectionMarkers(ctx);
        forceMinimapRebuild(ctx);
    });
}

// ─── Render all files on canvas (working tree) ──────────
export function renderAllFilesOnCanvas(ctx: CanvasContext, files: any[]) {
    measure('canvas:renderAllFiles', () => {
        clearCanvas(ctx);

        const visibleFiles = files.filter(f => !ctx.hiddenFiles.has(f.path));
        updateHiddenUI(ctx);

        // Build a map of changed file data (commit diff info)
        const changedFileDataMap = new Map<string, any>();
        if (ctx.commitFilesData) {
            ctx.commitFilesData.forEach(f => changedFileDataMap.set(f.path, f));
        }

        let layerFiles = visibleFiles;
        const activeLayer = getActiveLayer();
        if (activeLayer) {
            layerFiles = visibleFiles.filter(f => !!activeLayer.files[f.path]);
        }

        // Square-ish grid: use ceil(sqrt(n)) columns for a dense rectangle
        const count = layerFiles.length;
        const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
        const defaultCardWidth = 580;
        const defaultCardHeight = 700;
        const gap = 20;
        const cellW = defaultCardWidth + gap;
        const cellH = defaultCardHeight + gap;

        layerFiles.forEach((f, index) => {
            const isChanged = ctx.changedFilePaths.has(f.path);
            const posKey = `allfiles:${f.path}`;
            let x: number, y: number;

            if (ctx.positions.has(posKey)) {
                const pos = ctx.positions.get(posKey);
                x = pos.x; y = pos.y;
            } else {
                const col = index % cols;
                const row = Math.floor(index / cols);
                x = 50 + col * cellW;
                y = 50 + row * cellH;
            }

            const state = ctx.snap().context;
            let size = state.cardSizes?.[f.path];
            if (!size && ctx.positions.has(posKey)) {
                const pos = ctx.positions.get(posKey);
                if (pos.width) size = { width: pos.width, height: pos.height };
            }

            // Merge diff data into the file for highlighting
            let fileWithDiff = { ...f };
            if (activeLayer && activeLayer.files[fileWithDiff.path]) {
                fileWithDiff.layerSections = activeLayer.files[fileWithDiff.path].sections;
            }

            if (isChanged && changedFileDataMap.has(fileWithDiff.path)) {
                const diffData = changedFileDataMap.get(fileWithDiff.path);

                // Use full content from diff data if available (has the latest version)
                if (diffData.content) {
                    fileWithDiff.content = diffData.content;
                    fileWithDiff.lines = diffData.content.split('\n').length;
                }
                fileWithDiff.status = diffData.status;
                fileWithDiff.hunks = diffData.hunks;

                // Compute added/deleted line info from hunks
                if (diffData.hunks?.length > 0) {
                    const addedLines = new Set<number>();
                    // Map: newLineNumber → array of deleted line texts to show before that line
                    const deletedBeforeLine = new Map<number, string[]>();
                    for (const hunk of diffData.hunks) {
                        let newLine = hunk.newStart;
                        let pendingDeleted: string[] = [];
                        for (const l of hunk.lines) {
                            if (l.type === 'add') {
                                addedLines.add(newLine);
                                // Attach any pending deleted lines before this added line
                                if (pendingDeleted.length > 0) {
                                    const existing = deletedBeforeLine.get(newLine) || [];
                                    deletedBeforeLine.set(newLine, existing.concat(pendingDeleted));
                                    pendingDeleted = [];
                                }
                                newLine++;
                            } else if (l.type === 'del') {
                                pendingDeleted.push(l.content);
                            } else {
                                // Context line — flush pending deleted before this
                                if (pendingDeleted.length > 0) {
                                    const existing = deletedBeforeLine.get(newLine) || [];
                                    deletedBeforeLine.set(newLine, existing.concat(pendingDeleted));
                                    pendingDeleted = [];
                                }
                                newLine++;
                            }
                        }
                        // Flush remaining deleted lines after the hunk
                        if (pendingDeleted.length > 0) {
                            const existing = deletedBeforeLine.get(newLine) || [];
                            deletedBeforeLine.set(newLine, existing.concat(pendingDeleted));
                        }
                    }
                    fileWithDiff.addedLines = addedLines;
                    fileWithDiff.deletedBeforeLine = deletedBeforeLine;
                }
            }

            // All files use uniform default size unless user has a custom saved size
            if (!size) {
                size = { width: defaultCardWidth, height: defaultCardHeight };
            }

            const card = createAllFileCard(ctx, fileWithDiff, x, y, size);

            if (isChanged) {
                card.classList.add('file-card--changed');
                card.dataset.changed = 'true';
            }

            ctx.canvas.appendChild(card);
            ctx.fileCards.set(f.path, card);

            // Restore scroll position
            const scrollKey = `scroll:${f.path}`;
            if (ctx.positions.has(scrollKey)) {
                const savedScroll = ctx.positions.get(scrollKey);
                requestAnimationFrame(() => {
                    const body = card.querySelector('.file-card-body');
                    if (body && savedScroll.x) body.scrollTop = savedScroll.x;
                });
            }
        });

        renderConnections(ctx);
        buildConnectionMarkers(ctx);
        forceMinimapRebuild(ctx);
    });
}

// ─── Highlight changed files without re-rendering ────────
export function highlightChangedFiles(ctx: CanvasContext) {
    measure('allfiles:highlight', () => {
        const hasChanges = ctx.changedFilePaths.size > 0;
        ctx.fileCards.forEach((card, path) => {
            const isChanged = hasChanges && ctx.changedFilePaths.has(path);
            card.classList.toggle('file-card--changed', isChanged);
            card.classList.toggle('file-card--unchanged', hasChanges && !isChanged);
            card.dataset.changed = isChanged ? 'true' : '';
        });

        // Rebuild minimap to reflect new highlighting
        forceMinimapRebuild(ctx);
    });
}

// ─── Switch view mode ────────────────────────────────────
export function switchView(ctx: CanvasContext, mode: string) {
    if (mode === 'allfiles') {
        ctx.actor.send({ type: 'SWITCH_TO_ALLFILES' });
        ctx.allFilesActive = true;
    } else {
        ctx.actor.send({ type: 'SWITCH_TO_COMMITS' });
        ctx.allFilesActive = false;
        ctx.changedFilePaths.clear();
        ctx.commitFilesData = null;
    }

    document.getElementById('modeCommits')?.classList.toggle('active', mode === 'commits');
    document.getElementById('modeAllFiles')?.classList.toggle('active', mode === 'allfiles');

    if (mode === 'allfiles') {
        const state = ctx.snap().context;
        const commitInfo = document.getElementById('currentCommitInfo');

        if (state.currentCommitHash) {
            const commit = state.commits.find(c => c.hash === state.currentCommitHash);
            if (commitInfo) {
                updateCommitInfo(state.currentCommitHash, commit?.message || '', true);
            }
        } else {
            if (commitInfo) {
                updateCommitInfo(undefined, undefined, true);
            }
        }

        if (state.repoPath) {
            // If we have a selected commit, fetch its changed files first
            // so we can properly highlight/render them as diff cards
            const doRender = async () => {
                // Fetch commit files if we have a commit but don't have diff data yet
                if (state.currentCommitHash && (!ctx.commitFilesData || ctx.commitFilesData.length === 0)) {
                    try {
                        const response = await fetch('/api/repo/files', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ path: state.repoPath, commit: state.currentCommitHash })
                        });
                        if (response.ok) {
                            const data = await response.json();
                            ctx.commitFilesData = data.files;
                            ctx.changedFilePaths = new Set(data.files.map(f => f.path));
                            ctx.actor.send({ type: 'COMMIT_FILES_LOADED', files: data.files });
                        }
                    } catch (err) {
                        // Continue without diff data
                    }
                } else if (state.commitFiles.length > 0) {
                    ctx.commitFilesData = state.commitFiles;
                    ctx.changedFilePaths = new Set(state.commitFiles.map(f => f.path));
                }

                // Now load and render all files
                if (ctx.allFilesData && ctx.allFilesData.length > 0) {
                    renderAllFilesOnCanvas(ctx, ctx.allFilesData);
                    const fileCountEl = document.getElementById('fileCount');
                    if (fileCountEl) fileCountEl.textContent = ctx.allFilesData.length;
                } else {
                    await loadAllFiles(ctx);
                }
            };
            doRender();
        }
    } else {
        const state = ctx.snap().context;

        // Always re-render the commit timeline sidebar
        renderCommitTimeline(ctx);

        if (state.currentCommitHash) {
            const commit = state.commits.find(c => c.hash === state.currentCommitHash);
            updateCommitInfo(state.currentCommitHash, commit?.message || '');

            if (state.commitFiles.length > 0) {
                // We have commit files in state — render them
                ctx.commitFilesData = state.commitFiles;
                renderFilesOnCanvas(ctx, state.commitFiles, state.currentCommitHash);
                populateChangedFilesPanel(state.commitFiles);
                const fileCountEl = document.getElementById('fileCount');
                if (fileCountEl) fileCountEl.textContent = state.commitFiles.length;
            } else {
                // Re-fetch commit files since we cleared commitFilesData
                selectCommit(ctx, state.currentCommitHash);
            }

            // Re-highlight active commit in sidebar
            requestAnimationFrame(() => {
                document.querySelectorAll('.commit-item').forEach(el => {
                    (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.hash === state.currentCommitHash);
                });
            });
        }
    }
}

// ─── Re-render current view ──────────────────────────────
export function rerenderCurrentView(ctx: CanvasContext) {
    const data = ctx.allFilesData || ctx.snap().context.allFiles;
    if (data && data.length > 0) {
        renderAllFilesOnCanvas(ctx, data);
    }
}

// ─── Changed files panel (JSX) ──────────────────────────
function ChangedFilesList({ fileStats, totalAdd, totalDel, count }: {
    fileStats: any[]; totalAdd: number; totalDel: number; count: number;
}) {
    const statusColors = { added: '#22c55e', modified: '#eab308', deleted: '#ef4444', renamed: '#a78bfa', copied: '#60a5fa' };
    const statusIcons = { added: '+', modified: '~', deleted: '−', renamed: '→', copied: '⊕' };

    return (
        <>
            <div className="changed-files-summary">
                <span className="stat-add">+{totalAdd}</span>
                <span className="stat-del">−{totalDel}</span>
                <span className="stat-files">{count} file{count > 1 ? 's' : ''}</span>
            </div>
            {fileStats.map(f => {
                const color = statusColors[f.status] || '#a855f7';
                const icon = statusIcons[f.status] || '~';
                const name = f.path.split('/').pop();
                const dir = f.path.includes('/') ? f.path.substring(0, f.path.lastIndexOf('/')) : '';
                return (
                    <div
                        key={f.path}
                        className="changed-file-item"
                        title={f.path}
                        onClick={() => {
                            if (!_panelCtx) return;
                            const card = _panelCtx.fileCards.get(f.path);
                            if (card) {
                                const vpRect = _panelCtx.canvasViewport.getBoundingClientRect();
                                const state = _panelCtx.snap().context;
                                const cardX = parseFloat(card.style.left) || 0;
                                const cardY = parseFloat(card.style.top) || 0;
                                const newOffsetX = -(cardX + card.offsetWidth / 2) * state.zoom + vpRect.width / 2;
                                const newOffsetY = -(cardY + card.offsetHeight / 2) * state.zoom + vpRect.height / 2;
                                _panelCtx.actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
                                updateCanvasTransform(_panelCtx);
                                updateMinimap(_panelCtx);
                                card.classList.add('card-flash');
                                setTimeout(() => card.classList.remove('card-flash'), 1500);
                            }
                        }}
                    >
                        <span className="changed-file-status" style={`color: ${color} `}>{icon}</span>
                        <span className="changed-file-name">{name}</span>
                        {dir ? <span className="changed-file-dir">{dir}</span> : null}
                        <span className="changed-file-stats">
                            {f.additions > 0 ? <span className="stat-add">+{f.additions}</span> : null}
                            {f.deletions > 0 ? <span className="stat-del">−{f.deletions}</span> : null}
                        </span>
                    </div>
                );
            })}
        </>
    );
}

function populateChangedFilesPanel(files: any[]) {
    const panel = document.getElementById('changedFilesPanel');
    const listEl = document.getElementById('changedFilesList');
    if (!panel || !listEl) return;

    if (files.length === 0) {
        panel.style.display = 'none';
        return;
    }

    let totalAdd = 0, totalDel = 0;
    const fileStats = files.map(f => {
        let additions = 0, deletions = 0;
        if (f.hunks) {
            f.hunks.forEach(h => {
                h.lines.forEach(l => {
                    if (l.type === 'add') additions++;
                    else if (l.type === 'del') deletions++;
                });
            });
        } else if (f.status === 'added' && f.content) {
            additions = f.content.split('\n').length;
        } else if (f.status === 'deleted' && f.content) {
            deletions = f.content.split('\n').length;
        }
        totalAdd += additions;
        totalDel += deletions;
        return { ...f, additions, deletions };
    });

    render(
        <ChangedFilesList fileStats={fileStats} totalAdd={totalAdd} totalDel={totalDel} count={files.length} />,
        listEl
    );

    if (panel.dataset.manuallyClosed !== 'true') {
        panel.style.display = 'flex';
    }
}
