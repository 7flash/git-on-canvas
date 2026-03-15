// @ts-nocheck
/**
 * Repository management — load, commit timeline, select commit, all-files.
 */
import { measure } from "measure-fn";
import { render } from "melina/client";
import type { CanvasContext } from "./context";
import { escapeHtml, formatDate, showToast } from "./utils";
import {
  clearCanvas,
  getAutoColumnCount,
  updateCanvasTransform,
  updateZoomUI,
  updateMinimap,
  forceMinimapRebuild,
} from "./canvas";
import { performViewportCulling } from "./viewport-culling";
import { getPositionKey, loadSavedPositions } from "./positions";
import { updateHiddenUI } from "./hidden-files";
import {
  showLoadingProgress,
  updateLoadingProgress,
  hideLoadingProgress,
} from "./loading";
import {
  createFileCard,
  createAllFileCard,
  debounceSaveScroll,
  expandCardByPath,
} from "./cards";
import { getActiveLayer } from "./layers";
import { renderConnections, buildConnectionMarkers } from "./connections";
import {
  renderAllFilesViaCardManager,
  materializeViewport,
} from "./galaxydraw-bridge";
import {
  registerRepo,
  renderRepoTabs,
  getNextRepoOffset,
  isMultiRepoLoad,
  getLoadedRepos,
} from "./multi-repo";
import {
  updateStatusBarRepo,
  updateStatusBarCommit,
  updateStatusBarFiles,
} from "./status-bar";

// Shared: reference to ctx for changed-files panel navigation
let _panelCtx: CanvasContext | null = null;
export function setPanelCtx(ctx: CanvasContext) {
  _panelCtx = ctx;
}

// Dedup guard: prevent concurrent or duplicate loadRepository calls
let _loadingRepo: string | null = null;

// ─── Load repository ─────────────────────────────────────
export async function loadRepository(ctx: CanvasContext, repoPath: string) {
  if (!repoPath) return;

  // Prevent duplicate loads of the same repo (e.g. mount triggers both hash + localStorage paths)
  if (_loadingRepo === repoPath) {
    console.log(
      `[repo] Skipping duplicate load for "${repoPath}" — already loading`,
    );
    return;
  }
  _loadingRepo = repoPath;
  _panelCtx = ctx;
  ctx.actor.send({ type: "LOAD_REPO", path: repoPath });

  return measure("repo:load", async () => {
    try {
      showLoadingProgress(ctx, "Loading repository...", 0);
      updateLoadingProgress(ctx, repoPath, 10);

      const response = await fetch("/api/repo/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: repoPath }),
      });

      if (!response.ok) throw new Error(await response.text());

      updateLoadingProgress(ctx, "Parsing commits...", 30);
      const data = await response.json();
      ctx.actor.send({ type: "REPO_LOADED", commits: data.commits });

      // Add to recent repos
      const { addRecentRepo } = require("./recent-commits");
      addRecentRepo(repoPath, data.commits.length);

      // Set global repo path for image URLs
      (window as any).__GITCANVAS_REPO_PATH__ = repoPath;

      // Hide landing overlay
      const landing = document.getElementById("landingOverlay");
      if (landing) landing.style.display = "none";

      // Determine the best URL slug to display:
      // If the current URL is already a GitHub owner/repo slug that maps to this repo, keep it.
      // Otherwise fall back to the short folder name.
      const currentPath = decodeURIComponent(
        window.location.pathname.replace(/^\//, ""),
      );
      const isCurrentGitHubSlug =
        /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(currentPath) &&
        localStorage.getItem(`gitcanvas:slug:${currentPath}`) === repoPath;
      const repoSlug =
        repoPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ||
        repoPath;
      const displaySlug = isCurrentGitHubSlug ? currentPath : repoSlug;
      const commitHash = data.commits[0]?.hash || "";
      history.replaceState(
        null,
        "",
        "/" +
          (displaySlug.includes("/")
            ? displaySlug
            : encodeURIComponent(displaySlug)) +
          (commitHash ? `#${commitHash}` : ""),
      );
      localStorage.setItem("gitcanvas:lastRepo", repoPath);
      // Store slug→path mapping for URL-based loading (both short and GitHub-style)
      localStorage.setItem(`gitcanvas:slug:${repoSlug}`, repoPath);
      if (isCurrentGitHubSlug) {
        localStorage.setItem(`gitcanvas:slug:${currentPath}`, repoPath);
      }
      updateStatusBarRepo(repoPath);
      // Save to recent repos list
      const recentKey = "gitcanvas:recentRepos";
      const recent: string[] = JSON.parse(
        localStorage.getItem(recentKey) || "[]",
      );
      const filtered = recent.filter((r) => r !== repoPath);
      filtered.unshift(repoPath);
      localStorage.setItem(recentKey, JSON.stringify(filtered.slice(0, 10)));
      // Update dropdown if it exists
      const sel = document.getElementById("repoSelect") as HTMLSelectElement;
      if (sel) sel.value = repoPath;

      updateLoadingProgress(
        ctx,
        `Found ${data.commits.length} commits, rendering timeline...`,
        50,
      );
      renderCommitTimeline(ctx);

      // Reload positions for the new repo BEFORE rendering files
      // so cards get placed at their correct saved locations
      ctx.snap().context.repoPath = repoPath;
      await loadSavedPositions(ctx);

      const viewState = ctx.snap().value?.view;
      // Always load all files first
      updateLoadingProgress(ctx, "Loading all files...", 65);
      await loadAllFiles(ctx);

      // Then select commit (from URL hash or first commit)
      if (data.commits.length > 0) {
        updateLoadingProgress(ctx, "Loading commit diff...", 85);
        const hashFromUrl = window.location.hash?.replace("#", "");
        const commitToSelect =
          hashFromUrl && data.commits.find((c) => c.hash === hashFromUrl)
            ? hashFromUrl
            : data.commits[0].hash;
        await selectCommit(ctx, commitToSelect);
      }

      updateLoadingProgress(ctx, "Finalizing...", 100);
      hideLoadingProgress(ctx);
      _loadingRepo = null; // Allow future reloads

      // Re-render timeline after all async work — the initial renderCommitTimeline
      // at line 76 can get clobbered if DOM re-renders during loadAllFiles/selectCommit
      renderCommitTimeline(ctx);

      showToast(`Loaded ${data.commits.length} commits`, "success");

      // Register in multi-repo workspace
      registerRepo(ctx, repoPath, data.commits, ctx.allFilesData || []);
      renderRepoTabs(ctx);

      // Trigger onboarding for first-time users
      if (!localStorage.getItem("gitcanvas:onboarded")) {
        import("./onboarding").then((m) => m.startOnboarding(ctx));
      }
    } catch (err) {
      hideLoadingProgress(ctx);
      _loadingRepo = null; // Allow retry
      ctx.actor.send({ type: "REPO_ERROR", error: err.message });
      measure("repo:loadError", () => err);
      showToast(`Failed: ${err.message} `, "error");
    }
  });
}

// ─── Load all files (working tree) ───────────────────────
export async function loadAllFiles(ctx: CanvasContext) {
  const state = ctx.snap().context;
  if (!state.repoPath) return;

  return measure("allfiles:load", async () => {
    try {
      const response = await fetch("/api/repo/tree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: state.repoPath }),
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      ctx.actor.send({ type: "ALL_FILES_LOADED", files: data.files });
      ctx.allFilesData = data.files;
      renderAllFilesOnCanvas(ctx, data.files);
      const fileCountEl = document.getElementById("fileCount");
      if (fileCountEl) fileCountEl.textContent = data.total;
    } catch (err) {
      measure("allfiles:loadError", () => err);
      showToast(`Failed to load files: ${err.message} `, "error");
    }
  });
}

// ─── JSX Components for commit sidebar ──────────────────
function CommitItem({
  commit,
  lane,
  color,
  onClick,
}: {
  commit: any;
  lane: number;
  color: string;
  onClick: () => void;
}) {
  // Derive handle from email (part before @) — more useful than git config name
  const handle = commit.email ? commit.email.split("@")[0] : commit.author;

  // Calculate indentation based on visual lanes
  const paddingLeft = 16 + lane * 14;

  return (
    <div
      className="commit-item"
      data-hash={commit.hash}
      data-lane={lane}
      style={`padding-left: ${paddingLeft}px; --timeline-color: ${color};`}
      onClick={onClick}
    >
      <div className="commit-hash">{commit.hash.substring(0, 7)}</div>
      <div className="commit-message">
        {commit.refs && commit.refs.length > 0 && (
          <span className="commit-refs">
            {commit.refs.map((r) => (
              <span className="commit-ref-badge">{r}</span>
            ))}
          </span>
        )}
        {commit.message}
      </div>
      <div className="commit-meta">
        <span className="commit-author">👤 {handle}</span>
        <span>{formatDate(commit.date)}</span>
      </div>
    </div>
  );
}

function CommitInfo({
  hash,
  message,
  allFiles,
  changedCount,
}: {
  hash?: string;
  message?: string;
  allFiles?: boolean;
  changedCount?: number;
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
        <span style="color: var(--text-muted); font-size: 0.7rem">
          • {changedCount} changed
        </span>
      ) : null}
    </>
  );
}

function updateCommitInfo(
  hash?: string,
  message?: string,
  allFiles?: boolean,
  changedCount?: number,
) {
  const el = document.getElementById("currentCommitInfo");
  if (el)
    render(
      <CommitInfo
        hash={hash}
        message={message}
        allFiles={allFiles}
        changedCount={changedCount}
      />,
      el,
    );
}

// ─── Commit timeline render ──────────────────────────────
export function renderCommitTimeline(ctx: CanvasContext) {
  measure("timeline:render", () => {
    const container = document.getElementById("timelineContainer");
    const countBadge = document.getElementById("commitCount");
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
        container,
      );
      return;
    }

    // Branch graph calculation
    const lanes: (string | null)[] = [];
    const nodes: any[] = [];
    const colors = [
      "#7c3aed",
      "#3b82f6",
      "#10b981",
      "#f59e0b",
      "#ef4444",
      "#ec4899",
      "#06b6d4",
    ];

    commitsList.forEach((commit, i) => {
      // Find the lane reserved for this commit by a previous parent assignment
      let laneIndex = lanes.indexOf(commit.hash);
      if (laneIndex < 0) {
        // No lane reserved — find first empty slot
        laneIndex = lanes.findIndex((h) => !h);
        if (laneIndex < 0) laneIndex = lanes.length;
      }
      // Clear the reservation (we're processing this commit now)
      lanes[laneIndex] = null;
      nodes.push({ hash: commit.hash, lane: laneIndex, index: i });

      if (commit.parents && commit.parents.length > 0) {
        commit.parents.forEach((pHash, pIndex) => {
          const pLaneIndex = lanes.indexOf(pHash);
          if (pIndex === 0) {
            // First parent: continue in the same lane
            if (pLaneIndex < 0) {
              lanes[laneIndex] = pHash;
            }
            // If parent already has a lane (from another child),
            // just leave laneIndex free — the edge drawing handles the visual connection
          } else {
            // Additional parents (merge): assign to a different lane
            if (pLaneIndex < 0) {
              let empty = lanes.findIndex((h) => !h);
              if (empty < 0) empty = lanes.length;
              lanes[empty] = pHash;
            }
          }
        });
      }
    });

    render(
      <div style="position:relative;">
        <svg
          id="timelineGraph"
          style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:0;"
        ></svg>
        <div id="timelineItems">
          {commitsList.map((commit, i) => (
            <CommitItem
              key={commit.hash}
              commit={commit}
              lane={nodes[i].lane}
              color={colors[nodes[i].lane % colors.length]}
              onClick={() => selectCommit(ctx, commit.hash)}
            />
          ))}
        </div>
      </div>,
      container,
    );

    requestAnimationFrame(() => {
      const graph = document.getElementById("timelineGraph");
      if (!graph) return;
      const items = document.querySelectorAll(".commit-item");
      const coords = new Map<string, { x: number; y: number; color: string }>();

      let maxLane = 0;
      items.forEach((item: HTMLElement) => {
        const hash = item.dataset.hash;
        const lane = parseInt(item.dataset.lane || "0");
        if (lane > maxLane) maxLane = lane;
        // Center of the lane dot, shifted to accommodate the graph drawing
        const x = 16 + lane * 14;
        // offsetTop is relative to the relative parent div we just wrapped it in
        const y = item.offsetTop + item.offsetHeight / 2;
        coords.set(hash, { x, y, color: colors[lane % colors.length] });
      });

      let svgContent = "";

      // Draw edges
      commitsList.forEach((commit) => {
        const start = coords.get(commit.hash);
        if (!start) return;

        (commit.parents || []).forEach((pHash, pIdx) => {
          const end = coords.get(pHash);
          if (!end) return;

          const isMerge = pIdx > 0;
          const pathColor = isMerge ? end.color : start.color;

          if (start.x === end.x) {
            svgContent += `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${pathColor}" stroke-opacity="0.6" stroke-width="2" />`;
          } else {
            const midY = start.y + (end.y - start.y) / 2;
            svgContent += `<path d="M ${start.x} ${start.y} C ${start.x} ${midY}, ${end.x} ${midY}, ${end.x} ${end.y}" fill="none" stroke="${pathColor}" stroke-opacity="0.6" stroke-width="2" />`;
          }
        });
      });

      // Draw nodes
      commitsList.forEach((commit) => {
        const p = coords.get(commit.hash);
        if (!p) return;
        let dot = `<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="${p.color}" stroke="var(--bg-secondary)" stroke-width="2" />`;
        if (commit.refs && commit.refs.length > 0) {
          dot += `<circle cx="${p.x}" cy="${p.y}" r="7" fill="none" stroke="${p.color}" stroke-opacity="0.8" stroke-width="1.5" />`;
        }
        svgContent += dot;
      });

      graph.innerHTML = svgContent;
    });
  });
}

// ─── Select commit ───────────────────────────────────────
export async function selectCommit(ctx: CanvasContext, hash: string) {
  return measure("commit:select", async () => {
    ctx.actor.send({ type: "SELECT_COMMIT", hash });

    document.querySelectorAll(".commit-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.hash === hash);
    });

    const state = ctx.snap().context;
    const commit = state.commits.find((c) => c.hash === hash);

    // Show non-blocking inline progress bar (not overlay)
    _showCommitProgress(
      true,
      `${hash.substring(0, 7)} — ${commit?.message || ""}`,
    );

    try {
      const response = await fetch("/api/repo/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: state.repoPath, commit: hash }),
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      ctx.actor.send({ type: "COMMIT_FILES_LOADED", files: data.files });
      ctx.commitFilesData = data.files;

      // Always re-render all files with highlighted changes
      ctx.changedFilePaths = new Set(data.files.map((f) => f.path));
      if (ctx.allFilesData && ctx.allFilesData.length > 0) {
        renderAllFilesOnCanvas(ctx, ctx.allFilesData);
      }

      updateCommitInfo(hash, commit?.message || "", true, data.files.length);

      const fileCountEl = document.getElementById("fileCount");
      if (fileCountEl) fileCountEl.textContent = ctx.fileCards.size;
      _showCommitProgress(false);
      updateStatusBarCommit(hash);
      updateStatusBarFiles(ctx.fileCards.size);

      // Update URL hash for shareable links
      const [basePath] = window.location.href.split("#");
      history.replaceState(null, "", `${basePath}#${hash}`);

      // Populate changed files panel with diff stats
      populateChangedFilesPanel(ctx, data.files);
    } catch (err) {
      _showCommitProgress(false);
      measure("commit:selectError", () => err);
      showToast(`Failed: ${err.message} `, "error");
    }
  });
}

// ─── Inline commit progress bar (non-blocking) ──────────
function _showCommitProgress(show: boolean, text?: string) {
  let bar = document.getElementById("commitProgressBar");
  if (show) {
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "commitProgressBar";
      bar.className = "commit-progress-bar";
      const canvasArea = document.querySelector(".canvas-area");
      if (canvasArea) {
        canvasArea.insertBefore(
          bar,
          canvasArea.querySelector(".canvas-viewport"),
        );
      } else {
        document.body.appendChild(bar);
      }
    }
    bar.innerHTML = `<div class="commit-progress-track"><div class="commit-progress-fill"></div></div>${text ? `<span class="commit-progress-text">${text}</span>` : ""}`;
    bar.style.display = "flex";
  } else if (bar) {
    bar.style.display = "none";
  }
}

// ─── Render files on canvas (commits mode) ───────────────
export function renderFilesOnCanvas(
  ctx: CanvasContext,
  files: any[],
  commitHash: string,
) {
  measure("canvas:renderFiles", () => {
    clearCanvas(ctx);

    const visibleFiles = files.filter((f) => !ctx.hiddenFiles.has(f.path));
    let layerFiles = visibleFiles;
    const activeLayer = getActiveLayer();
    if (activeLayer) {
      layerFiles = visibleFiles.filter((f) => !!activeLayer.files[f.path]);
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
        x = pos.x;
        y = pos.y;
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
    // Cull off-screen cards after browser layout (needs rAF for valid dimensions)
    requestAnimationFrame(() => performViewportCulling(ctx));
  });
}

// ─── Render all files on canvas (working tree) ──────────
// Virtualized: only creates DOM for cards in/near the viewport.
// Remaining cards are deferred and materialized on-demand by viewport culling.
export function renderAllFilesOnCanvas(ctx: CanvasContext, files: any[]) {
  // Use progressive loading for large repos (500+ files)
  if (files.length >= 500) {
    return;
  }

  measure("canvas:renderAllFiles", () => {
    // In multi-repo mode, don't clear canvas if adding a second repo
    const isAdditionalRepo = isMultiRepoLoad();
    if (!isAdditionalRepo) {
      clearCanvas(ctx);
      ctx.deferredCards.clear();
    }

    // ── Phase 4c: Try CardManager path first ──
    const handled = renderAllFilesViaCardManager(ctx, files);
    if (handled) {
      renderConnections(ctx);
      buildConnectionMarkers(ctx);
      forceMinimapRebuild(ctx);
      // Materialize any deferred cards visible in initial viewport
      requestAnimationFrame(() => {
        materializeViewport(ctx);
        performViewportCulling(ctx);
      });
      return;
    }

    // ── Legacy fallback (CardManager not initialized) ──
    const visibleFiles = files.filter((f) => !ctx.hiddenFiles.has(f.path));
    updateHiddenUI(ctx);

    // Build a map of changed file data (commit diff info)
    const changedFileDataMap = new Map<string, any>();
    if (ctx.commitFilesData) {
      ctx.commitFilesData.forEach((f) => changedFileDataMap.set(f.path, f));
    }

    let layerFiles = visibleFiles;
    const activeLayer = getActiveLayer();
    if (activeLayer) {
      layerFiles = visibleFiles.filter((f) => !!activeLayer.files[f.path]);
    } else {
      // Default layer: exclude files that have been moved to other layers
      const { isFileMovedFromDefault } = require("./layers");
      layerFiles = visibleFiles.filter((f) => !isFileMovedFromDefault(f.path));
    }
    // Sort by directory to group files spatially (makes dir-labels coherent)
    layerFiles.sort((a, b) => {
      const dirA = a.path.includes("/")
        ? a.path.substring(0, a.path.lastIndexOf("/"))
        : ".";
      const dirB = b.path.includes("/")
        ? b.path.substring(0, b.path.lastIndexOf("/"))
        : ".";
      if (dirA !== dirB) return dirA.localeCompare(dirB);
      const nameA = a.path.split("/").pop() || a.path;
      const nameB = b.path.split("/").pop() || b.path;
      return nameA.localeCompare(nameB);
    });

    // Square-ish grid: use ceil(sqrt(n)) columns for a dense rectangle
    const count = layerFiles.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const defaultCardWidth = 580;
    const defaultCardHeight = 700;
    const gap = 20;
    const cellW = defaultCardWidth + gap;
    const cellH = defaultCardHeight + gap;

    // Auto-arrange: group files by directory for spatial clustering
    const { arrangeByDirectory } = require("./auto-arrange");
    const autoPositions = arrangeByDirectory(layerFiles, {
      cardWidth: defaultCardWidth,
      cardHeight: defaultCardHeight,
      fileGap: gap,
      dirGap: 80,
      originX: isAdditionalRepo ? getNextRepoOffset() : 50,
      originY: 50,
    });

    // Determine initial viewport rect for virtualization
    const MARGIN = 800; // px beyond viewport to pre-create
    const state = ctx.snap().context;
    const vpEl = ctx.canvasViewport;
    const vpW = vpEl?.clientWidth || window.innerWidth;
    const vpH = vpEl?.clientHeight || window.innerHeight;
    const zoom = state.zoom || 1;
    const offsetX = state.offsetX || 0;
    const offsetY = state.offsetY || 0;
    const worldLeft = (-offsetX - MARGIN) / zoom;
    const worldTop = (-offsetY - MARGIN) / zoom;
    const worldRight = (vpW - offsetX + MARGIN) / zoom;
    const worldBottom = (vpH - offsetY + MARGIN) / zoom;

    let createdCount = 0;
    let deferredCount = 0;

    // Cache XState state once outside the loop — avoids N snapshots for N files
    const cachedCardSizes = ctx.snap().context.cardSizes || {};

    layerFiles.forEach((f, index) => {
      const isChanged = ctx.changedFilePaths.has(f.path);
      const posKey = `allfiles:${f.path}`;
      let x: number, y: number;

      if (ctx.positions.has(posKey)) {
        const pos = ctx.positions.get(posKey);
        x = pos.x;
        y = pos.y;
      } else if (autoPositions.has(f.path)) {
        const pos = autoPositions.get(f.path);
        x = pos.x;
        y = pos.y;
      } else {
        const col = index % cols;
        const row = Math.floor(index / cols);
        x = 50 + col * cellW;
        y = 50 + row * cellH;
      }

      // Get saved size (from cached snapshot — no per-file ctx.snap() call)
      let size = cachedCardSizes[f.path];
      if (!size && ctx.positions.has(posKey)) {
        const pos = ctx.positions.get(posKey);
        if (pos.width) size = { width: pos.width, height: pos.height };
      }

      // Merge diff data into the file for highlighting
      let fileWithDiff = { ...f };
      if (activeLayer && activeLayer.files[fileWithDiff.path]) {
        fileWithDiff.layerSections =
          activeLayer.files[fileWithDiff.path].sections;
      }

      if (isChanged && changedFileDataMap.has(fileWithDiff.path)) {
        const diffData = changedFileDataMap.get(fileWithDiff.path);

        // Use full content from diff data if available (has the latest version)
        if (diffData.content) {
          fileWithDiff.content = diffData.content;
          fileWithDiff.lines = diffData.content.split("\n").length;
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
              if (l.type === "add") {
                addedLines.add(newLine);
                // Attach any pending deleted lines before this added line
                if (pendingDeleted.length > 0) {
                  const existing = deletedBeforeLine.get(newLine) || [];
                  deletedBeforeLine.set(
                    newLine,
                    existing.concat(pendingDeleted),
                  );
                  pendingDeleted = [];
                }
                newLine++;
              } else if (l.type === "del") {
                pendingDeleted.push(l.content);
              } else {
                // Context line — flush pending deleted before this
                if (pendingDeleted.length > 0) {
                  const existing = deletedBeforeLine.get(newLine) || [];
                  deletedBeforeLine.set(
                    newLine,
                    existing.concat(pendingDeleted),
                  );
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

      // ── Virtualization: check if card is near the viewport ──
      const cardW = size?.width || defaultCardWidth;
      const cardH = size?.height || defaultCardHeight;
      const inViewport =
        x + cardW > worldLeft &&
        x < worldRight &&
        y + cardH > worldTop &&
        y < worldBottom;

      if (inViewport) {
        // Create DOM immediately
        const card = createAllFileCard(ctx, fileWithDiff, x, y, size);
        if (isChanged) {
          card.classList.add("file-card--changed");
          card.dataset.changed = "true";
        }
        ctx.canvas.appendChild(card);
        ctx.fileCards.set(f.path, card);

        // Restore scroll position
        const scrollKey = `scroll:${f.path}`;
        if (ctx.positions.has(scrollKey)) {
          const savedScroll = ctx.positions.get(scrollKey);
          requestAnimationFrame(() => {
            const body = card.querySelector(".file-card-body");
            if (body && savedScroll.x) body.scrollTop = savedScroll.x;
          });
        }
        createdCount++;
      } else {
        // Defer: store data for lazy creation when it enters viewport
        ctx.deferredCards.set(f.path, {
          file: fileWithDiff,
          x,
          y,
          size,
          isChanged,
        });
        deferredCount++;
      }
    });

    console.log(
      `[render] Created ${createdCount} cards, deferred ${deferredCount} (total: ${count})`,
    );

    renderConnections(ctx);
    buildConnectionMarkers(ctx);
    renderDirectoryLabels(ctx);
    forceMinimapRebuild(ctx);
    // Cull off-screen cards after browser layout (needs rAF for valid dimensions)
    requestAnimationFrame(() => performViewportCulling(ctx));
  });
}

// ─── Directory labels on canvas ──────────────────────────
// Groups visible file cards by parent directory and renders
// a world-space label above each directory cluster.
function renderDirectoryLabels(ctx: CanvasContext) {
  // Remove existing labels
  ctx.canvas?.querySelectorAll(".dir-label").forEach((el) => el.remove());

  // Group cards by parent directory
  const groups = new Map<
    string,
    { minX: number; minY: number; maxX: number; count: number }
  >();

  const processCard = (path: string, x: number, y: number, w: number) => {
    const dir = path.includes("/")
      ? path.substring(0, path.lastIndexOf("/"))
      : ".";
    const g = groups.get(dir);
    if (g) {
      g.minX = Math.min(g.minX, x);
      g.minY = Math.min(g.minY, y);
      g.maxX = Math.max(g.maxX, x + w);
      g.count++;
    } else {
      groups.set(dir, { minX: x, minY: y, maxX: x + w, count: 1 });
    }
  };

  // Created cards (in DOM)
  ctx.fileCards.forEach((card, path) => {
    const x = parseFloat(card.style.left) || 0;
    const y = parseFloat(card.style.top) || 0;
    const w = card.offsetWidth || 580;
    processCard(path, x, y, w);
  });

  // Deferred cards (not yet in DOM)
  ctx.deferredCards.forEach((info, path) => {
    const w = info.size?.width || 580;
    processCard(path, info.x, info.y, w);
  });

  // Only show labels if we have multiple directories
  if (groups.size <= 1) return;

  const frag = document.createDocumentFragment();
  for (const [dir, g] of groups) {
    const label = document.createElement("div");
    label.className = "dir-label";
    label.dataset.dir = dir;
    const centerX = (g.minX + g.maxX) / 2;
    label.style.left = `${centerX}px`;
    label.style.top = `${g.minY - 36}px`;
    label.style.transform = "translateX(-50%)";
    label.innerHTML = `<span class="dir-label-icon">📁</span> ${dir}<span class="dir-label-count">${g.count}</span>`;

    // Click to collapse directory into a group card
    label.addEventListener("click", (e) => {
      e.stopPropagation();
      import("./card-groups").then(({ toggleDirectoryCollapse }) => {
        toggleDirectoryCollapse(ctx, dir);
      });
    });

    frag.appendChild(label);
  }
  ctx.canvas?.appendChild(frag);
}

// ─── Highlight changed files without re-rendering ────────
export function highlightChangedFiles(ctx: CanvasContext) {
  measure("allfiles:highlight", () => {
    const hasChanges = ctx.changedFilePaths.size > 0;
    ctx.fileCards.forEach((card, path) => {
      const isChanged = hasChanges && ctx.changedFilePaths.has(path);
      card.classList.toggle("file-card--changed", isChanged);
      card.classList.toggle("file-card--unchanged", hasChanges && !isChanged);
      card.dataset.changed = isChanged ? "true" : "";
    });

    // Rebuild minimap to reflect new highlighting
    forceMinimapRebuild(ctx);
  });
}

// ─── Switch view mode ────────────────────────────────────
export function switchView(ctx: CanvasContext, mode: string) {
  if (mode === "allfiles") {
    ctx.actor.send({ type: "SWITCH_TO_ALLFILES" });
    ctx.allFilesActive = true;
  } else {
    ctx.actor.send({ type: "SWITCH_TO_COMMITS" });
    ctx.allFilesActive = false;
    ctx.changedFilePaths.clear();
    ctx.commitFilesData = null;
  }

  document
    .getElementById("modeCommits")
    ?.classList.toggle("active", mode === "commits");
  document
    .getElementById("modeAllFiles")
    ?.classList.toggle("active", mode === "allfiles");

  if (mode === "allfiles") {
    const state = ctx.snap().context;
    const commitInfo = document.getElementById("currentCommitInfo");

    if (state.currentCommitHash) {
      const commit = state.commits.find(
        (c) => c.hash === state.currentCommitHash,
      );
      if (commitInfo) {
        updateCommitInfo(state.currentCommitHash, commit?.message || "", true);
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
        if (
          state.currentCommitHash &&
          (!ctx.commitFilesData || ctx.commitFilesData.length === 0)
        ) {
          try {
            const response = await fetch("/api/repo/files", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                path: state.repoPath,
                commit: state.currentCommitHash,
              }),
            });
            if (response.ok) {
              const data = await response.json();
              ctx.commitFilesData = data.files;
              ctx.changedFilePaths = new Set(data.files.map((f) => f.path));
              ctx.actor.send({
                type: "COMMIT_FILES_LOADED",
                files: data.files,
              });
            }
          } catch (err) {
            // Continue without diff data
          }
        } else if (state.commitFiles.length > 0) {
          ctx.commitFilesData = state.commitFiles;
          ctx.changedFilePaths = new Set(state.commitFiles.map((f) => f.path));
        }

        // Now load and render all files
        if (ctx.allFilesData && ctx.allFilesData.length > 0) {
          renderAllFilesOnCanvas(ctx, ctx.allFilesData);
          const fileCountEl = document.getElementById("fileCount");
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
      const commit = state.commits.find(
        (c) => c.hash === state.currentCommitHash,
      );
      updateCommitInfo(state.currentCommitHash, commit?.message || "");

      if (state.commitFiles.length > 0) {
        // We have commit files in state — render them
        ctx.commitFilesData = state.commitFiles;
        renderFilesOnCanvas(ctx, state.commitFiles, state.currentCommitHash);
        populateChangedFilesPanel(ctx, state.commitFiles);
        const fileCountEl = document.getElementById("fileCount");
        if (fileCountEl) fileCountEl.textContent = state.commitFiles.length;
      } else {
        // Re-fetch commit files since we cleared commitFilesData
        selectCommit(ctx, state.currentCommitHash);
      }

      // Re-highlight active commit in sidebar
      requestAnimationFrame(() => {
        document.querySelectorAll(".commit-item").forEach((el) => {
          (el as HTMLElement).classList.toggle(
            "active",
            (el as HTMLElement).dataset.hash === state.currentCommitHash,
          );
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
function ChangedFilesList({
  fileStats,
  totalAdd,
  totalDel,
  count,
}: {
  fileStats: any[];
  totalAdd: number;
  totalDel: number;
  count: number;
}) {
  const statusColors = {
    added: "#22c55e",
    modified: "#eab308",
    deleted: "#ef4444",
    renamed: "#a78bfa",
    copied: "#60a5fa",
  };
  const statusIcons = {
    added: "+",
    modified: "~",
    deleted: "−",
    renamed: "→",
    copied: "⊕",
  };

  return (
    <div
      className="changed-files-container-inner"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="changed-files-summary">
        <span className="stat-add">+{totalAdd}</span>
        <span className="stat-del">−{totalDel}</span>
        <span className="stat-files">
          {count} file{count > 1 ? "s" : ""}
        </span>
      </div>
      {fileStats.map((f) => {
        const color = statusColors[f.status] || "#a855f7";
        const icon = statusIcons[f.status] || "~";
        const name = f.path.split("/").pop();
        const dir = f.path.includes("/")
          ? f.path.substring(0, f.path.lastIndexOf("/"))
          : "";
        return (
          <div
            key={f.path}
            className="changed-file-item"
            title={f.path}
            onClick={() => {
              if (!_panelCtx) return;
              // Animated zoom+pan to the file
              import("./canvas").then(({ jumpToFile }) => {
                jumpToFile(_panelCtx!, f.path);
              });
            }}
          >
            <span className="changed-file-status" style={`color: ${color} `}>
              {icon}
            </span>
            <span className="changed-file-name">{name}</span>
            {dir ? <span className="changed-file-dir">{dir}</span> : null}
            <span className="changed-file-stats">
              {f.additions > 0 ? (
                <span className="stat-add">+{f.additions}</span>
              ) : null}
              {f.deletions > 0 ? (
                <span className="stat-del">−{f.deletions}</span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function populateChangedFilesPanel(ctx: CanvasContext, files: any[]) {
  setPanelCtx(ctx);
  const panel = document.getElementById("changedFilesPanel");
  const listEl = document.getElementById("changedFilesList");
  if (!panel || !listEl) return;

  if (files.length === 0) {
    panel.style.display = "none";
    return;
  }

  // Filter by active layer — only show changed files that are in the layer
  const activeLayer = getActiveLayer();
  const filteredFiles = activeLayer
    ? files.filter((f) => !!activeLayer.files[f.path])
    : files;

  if (filteredFiles.length === 0) {
    panel.style.display = "none";
    return;
  }

  let totalAdd = 0,
    totalDel = 0;
  const fileStats = filteredFiles.map((f) => {
    let additions = 0,
      deletions = 0;
    if (f.hunks) {
      f.hunks.forEach((h) => {
        h.lines.forEach((l) => {
          if (l.type === "add") additions++;
          else if (l.type === "del") deletions++;
        });
      });
    } else if (f.status === "added" && f.content) {
      additions = f.content.split("\n").length;
    } else if (f.status === "deleted" && f.content) {
      deletions = f.content.split("\n").length;
    }
    totalAdd += additions;
    totalDel += deletions;
    return { ...f, additions, deletions };
  });

  render(
    <ChangedFilesList
      fileStats={fileStats}
      totalAdd={totalAdd}
      totalDel={totalDel}
      count={filteredFiles.length}
    />,
    listEl,
  );

  if (panel.dataset.manuallyClosed !== "true") {
    panel.style.display = "flex";
  }
}
