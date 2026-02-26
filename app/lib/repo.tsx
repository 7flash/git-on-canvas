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
import { renderConnections } from './connections';

// ─── Load repository ─────────────────────────────────────
export async function loadRepository(ctx: CanvasContext, repoPath: string) {
    if (!repoPath) return;
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

            window.location.hash = encodeURIComponent(repoPath);
            localStorage.setItem('gitcanvas:lastRepo', repoPath);

            updateLoadingProgress(ctx, `Found ${data.commits.length} commits, rendering timeline...`);
            renderCommitTimeline(ctx);

            const viewState = ctx.snap().value?.view;
            if (viewState === 'allfiles') {
                updateLoadingProgress(ctx, 'Loading all files...');
                await loadAllFiles(ctx);
            } else if (data.commits.length > 0) {
                updateLoadingProgress(ctx, 'Loading first commit files...');
                await selectCommit(ctx, data.commits[0].hash);
            }

            hideLoadingProgress(ctx);
            showToast(`Loaded ${data.commits.length} commits`, 'success');
        } catch (err) {
            hideLoadingProgress(ctx);
            ctx.actor.send({ type: 'REPO_ERROR', error: err.message });
            measure('repo:loadError', () => err);
            showToast(`Failed: ${err.message}`, 'error');
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
            showToast(`Failed to load files: ${err.message}`, 'error');
        }
    });
}

// ─── JSX Components for commit sidebar ──────────────────
function CommitItem({ commit, onClick }: { commit: any; onClick: () => void }) {
    return (
        <div className="commit-item" data-hash={commit.hash} onClick={onClick}>
            <div className="commit-hash">{commit.hash.substring(0, 7)}</div>
            <div className="commit-message">{commit.message}</div>
            <div className="commit-meta">
                <span className="commit-author">👤 {commit.author}</span>
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

        try {
            showLoadingProgress(ctx, 'Loading commit files...');
            updateLoadingProgress(ctx, `${hash.substring(0, 7)} — ${commit?.message || ''}`);

            const response = await fetch('/api/repo/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: state.repoPath, commit: hash })
            });

            if (!response.ok) throw new Error(await response.text());

            const data = await response.json();
            ctx.actor.send({ type: 'COMMIT_FILES_LOADED', files: data.files });
            ctx.commitFilesData = data.files;

            // If all-files mode is active, re-render with diff cards for changed files
            if (ctx.allFilesActive) {
                ctx.changedFilePaths = new Set(data.files.map(f => f.path));
                // Re-render all files so changed ones get diff cards
                if (ctx.allFilesData && ctx.allFilesData.length > 0) {
                    renderAllFilesOnCanvas(ctx, ctx.allFilesData);
                }

                updateCommitInfo(hash, commit?.message || '', true, data.files.length);

                const fileCountEl = document.getElementById('fileCount');
                if (fileCountEl) fileCountEl.textContent = ctx.fileCards.size;
                hideLoadingProgress(ctx);

                // Populate changed files panel with diff stats
                populateChangedFilesPanel(data.files);
            } else {
                // Normal commits mode: render only changed files
                ctx.actor.send({ type: 'SWITCH_TO_COMMITS' });
                document.getElementById('modeCommits')?.classList.add('active');
                const chk = document.getElementById('allFilesCheckbox') as HTMLInputElement;
                if (chk) chk.checked = false;

                updateLoadingProgress(ctx, 'Rendering files on canvas...');
                renderFilesOnCanvas(ctx, data.files, hash);

                updateCommitInfo(hash, commit?.message || '');

                const fileCountEl = document.getElementById('fileCount');
                if (fileCountEl) fileCountEl.textContent = data.files.length;
                hideLoadingProgress(ctx);

                // Populate changed files panel with diff stats
                populateChangedFilesPanel(data.files);
            }
        } catch (err) {
            hideLoadingProgress(ctx);
            measure('commit:selectError', () => err);
            showToast(`Failed: ${err.message}`, 'error');
        }
    });
}

// ─── Render files on canvas (commits mode) ───────────────
export function renderFilesOnCanvas(ctx: CanvasContext, files: any[], commitHash: string) {
    measure('canvas:renderFiles', () => {
        clearCanvas(ctx);

        const visibleFiles = files.filter(f => !ctx.hiddenFiles.has(f.path));
        updateHiddenUI(ctx);

        const cols = Math.min(visibleFiles.length, getAutoColumnCount(ctx));
        const cardWidth = 580;
        const cardHeight = 700;
        const gap = 40;

        visibleFiles.forEach((file, index) => {
            const posKey = getPositionKey(file.path, commitHash);
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

            const card = createFileCard(ctx, file, x, y, commitHash);
            ctx.canvas.appendChild(card);
            ctx.fileCards.set(file.path, card);
        });

        renderConnections(ctx);
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

        // Square-ish grid: use ceil(sqrt(n)) columns for a dense rectangle
        const count = visibleFiles.length;
        const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
        const cardWidth = 280;
        const cardHeight = 180;
        const changedCardWidth = 580;
        const changedCardHeight = 700;
        const gap = 20;

        visibleFiles.forEach((file, index) => {
            const isChanged = ctx.changedFilePaths.has(file.path);
            const posKey = `allfiles:${file.path}`;
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

            let card: HTMLElement;

            if (isChanged && changedFileDataMap.has(file.path)) {
                // Render as diff card with actual diff content
                const diffData = changedFileDataMap.get(file.path);
                card = createFileCard(ctx, diffData, x, y, 'allfiles');
                card.classList.add('file-card--changed');
                card.dataset.changed = 'true';
            } else {
                const state = ctx.snap().context;
                let size = state.cardSizes?.[file.path];

                if (!size && ctx.positions.has(posKey)) {
                    const pos = ctx.positions.get(posKey);
                    if (pos.width) size = { width: pos.width, height: pos.height };
                }

                // Override default card size for compact grid (unless manually resized)
                if (!size) {
                    size = { width: cardWidth, height: cardHeight };
                }

                card = createAllFileCard(ctx, file, x, y, size);
            }

            ctx.canvas.appendChild(card);
            ctx.fileCards.set(file.path, card);

            // Restore scroll position
            const scrollKey = `scroll:${file.path}`;
            if (ctx.positions.has(scrollKey)) {
                const savedScroll = ctx.positions.get(scrollKey);
                requestAnimationFrame(() => {
                    const body = card.querySelector('.file-card-body');
                    if (body && savedScroll.x) body.scrollTop = savedScroll.x;
                });
            }
        });

        renderConnections(ctx);
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
        if (state.currentCommitHash && state.commitFiles.length > 0) {
            renderFilesOnCanvas(ctx, state.commitFiles, state.currentCommitHash);
            const commit = state.commits.find(c => c.hash === state.currentCommitHash);
            const commitInfo = document.getElementById('currentCommitInfo');
            if (commitInfo) {
                updateCommitInfo(state.currentCommitHash, commit?.message || '');
            }
            const fileCountEl = document.getElementById('fileCount');
            if (fileCountEl) fileCountEl.textContent = state.commitFiles.length;
        }
    }
}

// ─── Re-render current view ──────────────────────────────
export function rerenderCurrentView(ctx: CanvasContext) {
    const viewState = ctx.snap().value?.view;
    if (viewState === 'allfiles') {
        const data = ctx.allFilesData || ctx.snap().context.allFiles;
        if (data && data.length > 0) {
            renderAllFilesOnCanvas(ctx, data);
        }
    } else {
        const state = ctx.snap().context;
        if (state.commitFiles.length > 0) {
            renderFilesOnCanvas(ctx, state.commitFiles, state.currentCommitHash);
        }
    }
}

// ─── Changed files panel (JSX) ──────────────────────────
function ChangedFilesList({ fileStats, totalAdd, totalDel, count }: {
    fileStats: any[]; totalAdd: number; totalDel: number; count: number;
}) {
    const statusColors = { added: '#22c55e', modified: '#eab308', deleted: '#ef4444', renamed: '#a78bfa' };
    const statusIcons = { added: '+', modified: '~', deleted: '−', renamed: '→' };

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
                            const card = document.querySelector(`.file-card[data-path="${f.path}"]`) as HTMLElement;
                            if (card) {
                                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                card.classList.add('card-flash');
                                setTimeout(() => card.classList.remove('card-flash'), 1500);
                            }
                        }}
                    >
                        <span className="changed-file-status" style={`color: ${color}`}>{icon}</span>
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

    panel.style.display = 'flex';
}
