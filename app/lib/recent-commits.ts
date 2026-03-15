/**
 * Recent Commits — tracks and displays recently loaded repositories
 *
 * Shows last 5 repos with pull button to refresh from remote.
 */

const STORAGE_KEY = "gitcanvas:recentRepos";
const MAX_REPOS = 5;

export interface RecentRepo {
  path: string;
  name: string;
  loadedAt: number;
  commitCount: number;
}

export function getRecentRepos(): RecentRepo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addRecentRepo(path: string, commitCount: number): void {
  const repos = getRecentRepos();
  const name = path.split(/[\\/]/).pop() || path;

  // Remove if already exists
  const filtered = repos.filter((r) => r.path !== path);

  // Add to front
  filtered.unshift({
    path,
    name,
    loadedAt: Date.now(),
    commitCount,
  });

  // Trim to max
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(filtered.slice(0, MAX_REPOS)),
  );
}

export function removeRecentRepo(path: string): void {
  const repos = getRecentRepos();
  const filtered = repos.filter((r) => r.path !== path);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function renderRecentCommitsUI(): void {
  const container = document.getElementById("recentCommits");
  const listEl = document.getElementById("recentCommitsList");
  if (!container || !listEl) return;

  const repos = getRecentRepos();

  if (repos.length === 0) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  listEl.innerHTML = repos
    .map(
      (repo) => `
        <div class="recent-repo-item" data-path="${escapeHtml(repo.path)}" style="
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 8px;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.2s;
        " onmouseover="this.style.background='var(--bg-tertiary)'" onmouseout="this.style.background='transparent'">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style="opacity:0.5">
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
            </svg>
            <div style="flex:1;min-width:0;">
                <div style="font-size:11px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${escapeHtml(repo.name)}
                </div>
                <div style="font-size:10px;color:var(--text-muted);">
                    ${repo.commitCount} commits • ${formatTimeAgo(repo.loadedAt)}
                </div>
            </div>
        </div>
    `,
    )
    .join("");

  // Wire up click handlers
  listEl.querySelectorAll(".recent-repo-item").forEach((el) => {
    el.addEventListener("click", () => {
      const path = el.getAttribute("data-path");
      if (path) {
        const { loadRepository } = require("./repo");
        const { getCanvasContext } = require("./context");
        const ctx = getCanvasContext();
        if (ctx) loadRepository(ctx, path);
      }
    });
  });

  // Wire up pull button
  const pullBtn = document.getElementById("pullBtn");
  if (pullBtn) {
    pullBtn.addEventListener("click", async () => {
      const { showToast } = require("./utils");
      const { getCanvasContext } = require("./context");
      const ctx = getCanvasContext();

      if (!ctx || !ctx.snap().context.repoPath) {
        showToast("No repository loaded", "error");
        return;
      }

      pullBtn.disabled = true;
      pullBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" strokeDasharray="30" strokeDashoffset="0">
                        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                    </circle>
                </svg>
                Pulling...
            `;

      try {
        // Reload current repository
        const { loadRepository } = require("./repo");
        await loadRepository(ctx, ctx.snap().context.repoPath);
        showToast("Pulled latest commits", "success");
      } catch (err: any) {
        showToast(`Pull failed: ${err.message}`, "error");
      } finally {
        pullBtn.disabled = false;
        pullBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Pull
                `;
      }
    });
  }
}

function escapeHtml(str: string): string {
  if (!str) return "";
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
