/**
 * Sync Controls — Leader-only UI for pushing canvas state to remote servers
 *
 * Features:
 * - Server dropdown (select remote to push to)
 * - Auto-sync toggle
 * - Manual push/pull buttons
 * - Last sync status indicator
 */

import { isLeader } from "./role";

const DEFAULT_SERVERS = [
  { url: "https://gitmaps.xyz", name: "gitmaps.xyz (Production)" },
  { url: "http://localhost:3336", name: "Local Dev Server" },
];

let _customServers: string[] = [];
let _selectedServer = DEFAULT_SERVERS[0].url;
let _autoSync = false;
let _lastSyncTime: number | null = null;
let _syncing = false;

try {
  const stored = localStorage.getItem("gitcanvas:servers");
  if (stored) _customServers = JSON.parse(stored);
  const selected = localStorage.getItem("gitcanvas:selectedServer");
  if (selected) _selectedServer = selected;
  const auto = localStorage.getItem("gitcanvas:autoSync");
  if (auto) _autoSync = JSON.parse(auto);
} catch {}

export function getSelectedServer(): string {
  return _selectedServer;
}

export function isAutoSyncEnabled(): boolean {
  return _autoSync;
}

export function getLastSyncTime(): number | null {
  return _lastSyncTime;
}

export function isSyncing(): boolean {
  return _syncing;
}

export function toggleAutoSync(): boolean {
  _autoSync = !_autoSync;
  localStorage.setItem("gitcanvas:autoSync", JSON.stringify(_autoSync));
  console.log(`[sync] Auto-sync ${_autoSync ? "enabled" : "disabled"}`);
  return _autoSync;
}

export function setSelectedServer(url: string): void {
  _selectedServer = url;
  localStorage.setItem("gitcanvas:selectedServer", url);
  console.log(`[sync] Selected server: ${url}`);
}

export function getAvailableServers() {
  return [
    ...DEFAULT_SERVERS,
    ..._customServers.map((url) => ({ url, name: `Custom: ${url}` })),
  ];
}

export function addCustomServer(url: string): void {
  if (!_customServers.includes(url)) {
    _customServers.push(url);
    localStorage.setItem("gitcanvas:servers", JSON.stringify(_customServers));
  }
}

export async function pushToServer(
  repoPath: string,
  positions: Record<string, any>,
): Promise<boolean> {
  if (!isLeader()) {
    console.warn("[sync] Cannot push - not in leader mode");
    return false;
  }

  if (_syncing) {
    console.log("[sync] Already syncing, skipping");
    return false;
  }

  _syncing = true;
  const startTime = Date.now();

  try {
    const serverUrl = _selectedServer;
    const endpoint = `${serverUrl}/api/auth/positions`;

    console.log(`[sync] Pushing to ${endpoint}`);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repoUrl: repoPath,
        positions,
        syncedAt: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Server returned ${response.status}: ${error}`);
    }

    _lastSyncTime = Date.now();
    console.log(`[sync] Push successful (${Date.now() - startTime}ms)`);
    return true;
  } catch (error: any) {
    console.error("[sync] Push failed:", error.message);
    return false;
  } finally {
    _syncing = false;
  }
}

export async function pullFromServer(
  repoPath: string,
): Promise<Record<string, any> | null> {
  if (_syncing) {
    console.log("[sync] Already syncing, skipping");
    return null;
  }

  _syncing = true;
  const startTime = Date.now();

  try {
    const serverUrl = _selectedServer;
    const endpoint = `${serverUrl}/api/auth/positions?repo=${encodeURIComponent(repoPath)}`;

    console.log(`[sync] Pulling from ${endpoint}`);

    const response = await fetch(endpoint);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Server returned ${response.status}: ${error}`);
    }

    const data = await response.json();
    console.log(`[sync] Pull successful (${Date.now() - startTime}ms)`);
    return data.positions || null;
  } catch (error: any) {
    console.error("[sync] Pull failed:", error.message);
    return null;
  } finally {
    _syncing = false;
  }
}

export function formatLastSync(time: number | null): string {
  if (!time) return "Never";
  const diff = Date.now() - time;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function createSyncControlsUI(): HTMLElement {
  const container = document.createElement("div");
  container.className = "sync-controls";
  container.id = "syncControls";

  const servers = getAvailableServers();
  const lastSync = formatLastSync(_lastSyncTime);

  container.innerHTML = `
    <div class="sync-controls-inner">
      <div class="sync-server-select">
        <label for="syncServer">Server:</label>
        <select id="syncServer">
          ${servers.map((s) => `<option value="${s.url}" ${s.url === _selectedServer ? "selected" : ""}>${s.name}</option>`).join("")}
        </select>
        <button id="addServerBtn" class="sync-btn-icon" title="Add custom server">+</button>
      </div>
      
      <div class="sync-auto-toggle">
        <input type="checkbox" id="autoSyncToggle" ${_autoSync ? "checked" : ""} />
        <label for="autoSyncToggle">Auto-sync</label>
      </div>
      
      <div class="sync-buttons">
        <button id="pushBtn" class="sync-btn sync-btn-push" ${_syncing ? "disabled" : ""}>
          ${_syncing ? "⏳" : "📤"} Push
        </button>
        <button id="pullBtn" class="sync-btn sync-btn-pull" ${_syncing ? "disabled" : ""}>
          ${_syncing ? "⏳" : "📥"} Pull
        </button>
      </div>
      
      <div class="sync-status">
        <span class="sync-status-dot ${_lastSyncTime ? "synced" : ""}"></span>
        <span class="sync-status-text">Last sync: ${lastSync}</span>
      </div>
    </div>
  `;

  // Wire up event listeners
  const serverSelect = container.querySelector(
    "#syncServer",
  ) as HTMLSelectElement;
  serverSelect?.addEventListener("change", (e) => {
    setSelectedServer((e.target as HTMLSelectElement).value);
  });

  const addServerBtn = container.querySelector(
    "#addServerBtn",
  ) as HTMLButtonElement;
  addServerBtn?.addEventListener("click", () => {
    const url = prompt("Enter custom server URL (e.g., https://myserver.com):");
    if (url && url.startsWith("http")) {
      addCustomServer(url);
      location.reload(); // Refresh to show new option
    }
  });

  const autoSyncToggle = container.querySelector(
    "#autoSyncToggle",
  ) as HTMLInputElement;
  autoSyncToggle?.addEventListener("change", () => {
    toggleAutoSync();
  });

  const pushBtn = container.querySelector("#pushBtn") as HTMLButtonElement;
  pushBtn?.addEventListener("click", async () => {
    const ctx = (window as any).__GITCANVAS_CTX__;
    if (!ctx) return;

    const repoPath = ctx.snap()?.context?.repoPath;
    if (!repoPath) return;

    pushBtn.disabled = true;
    pushBtn.textContent = "⏳ Pushing...";

    const positions: Record<string, any> = {};
    for (const [k, v] of ctx.positions) {
      positions[k] = v;
    }

    const success = await pushToServer(repoPath, positions);

    pushBtn.disabled = false;
    pushBtn.textContent = success ? "✅ Pushed!" : "❌ Failed";
    setTimeout(() => {
      pushBtn.textContent = "📤 Push";
      location.reload(); // Refresh to show updated status
    }, 2000);
  });

  const pullBtn = container.querySelector("#pullBtn") as HTMLButtonElement;
  pullBtn?.addEventListener("click", async () => {
    const ctx = (window as any).__GITCANVAS_CTX__;
    if (!ctx) return;

    const repoPath = ctx.snap()?.context?.repoPath;
    if (!repoPath) return;

    pullBtn.disabled = true;
    pullBtn.textContent = "⏳ Pulling...";

    const positions = await pullFromServer(repoPath);

    pullBtn.disabled = false;
    pullBtn.textContent = positions ? "✅ Pulled!" : "❌ Failed";
    setTimeout(() => {
      pullBtn.textContent = "📥 Pull";
      if (positions) {
        // Merge pulled positions
        for (const [k, v] of Object.entries(positions)) {
          ctx.positions.set(k, v);
        }
        import("./repo").then((m) =>
          m.renderAllFilesOnCanvas(ctx, ctx.allFilesData || []),
        );
      }
    }, 2000);
  });

  return container;
}

export function renderSyncControls(container?: HTMLElement) {
  if (!isLeader()) return; // Only leaders see sync controls

  const target = container || document.querySelector(".toolbar-right");
  if (!target) return;

  const existing = document.getElementById("syncControls");
  if (existing) existing.remove();

  const ui = createSyncControlsUI();
  target.appendChild(ui);
}
