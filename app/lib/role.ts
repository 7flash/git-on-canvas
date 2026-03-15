/**
 * Role detection — Leader vs Follower
 *
 * Leader: Running locally (localhost, 127.0.0.1, 192.168.x.x)
 *   - Full control: move cards, edit files, arrange layers
 *   - Can push to remote servers
 *
 * Follower: Visiting gitmaps.xyz or any remote server
 *   - Read-only canvas
 *   - Can clone repo to their local
 */

export type Role = "leader" | "follower";

let _cachedRole: Role | null = null;

export function detectRole(): Role {
  if (_cachedRole) return _cachedRole;

  const host = window.location.hostname;

  // Leader: running on localhost or local network
  const isLocalhost =
    host === "localhost" || host === "127.0.0.1" || host === "::1";
  const isLocalNetwork =
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    host.startsWith("172.");

  _cachedRole = isLocalhost || isLocalNetwork ? "leader" : "follower";

  console.log(`[role] Detected as ${_cachedRole} (host: ${host})`);
  return _cachedRole;
}

export function isLeader(): boolean {
  return detectRole() === "leader";
}

export function isFollower(): boolean {
  return detectRole() === "follower";
}

export function clearRoleCache() {
  _cachedRole = null;
}

export function renderRoleBadge(): void {
  const existing = document.getElementById("roleBadge");
  if (existing) existing.remove();

  const role = detectRole();
  const badge = document.createElement("div");
  badge.id = "roleBadge";
  badge.className = `role-badge role-badge--${role}`;

  if (role === "leader") {
    badge.innerHTML = `
      <span class="role-badge-icon">👑</span>
      <span class="role-badge-text">Leader</span>
      <span class="role-badge-sub">Local Control</span>
    `;
    badge.title =
      "You have full control - can move cards, edit files, and push to remote servers";
  } else {
    badge.innerHTML = `
      <span class="role-badge-icon">👁️</span>
      <span class="role-badge-text">Follower</span>
      <span class="role-badge-sub">Read-Only</span>
      <button class="clone-to-edit-btn" title="Clone repo locally to edit">
        📥 Clone to Edit
      </button>
    `;
    badge.title = "Read-only mode - Clone this repo to edit locally";

    // Wire up clone button
    const cloneBtn = badge.querySelector(".clone-to-edit-btn");
    if (cloneBtn) {
      cloneBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleCloneToEdit();
      });
    }
  }

  const toolbar =
    document.querySelector(".toolbar-right") ||
    document.querySelector(".status-bar");
  if (toolbar) {
    toolbar.insertBefore(badge, toolbar.firstChild);
  }
}

async function handleCloneToEdit(): Promise<void> {
  const { showToast } = await import("./utils");

  // Get current repo from URL or context
  const pathSegments = window.location.pathname.slice(1).split("/");
  const repoSlug = pathSegments.filter((s) => s).join("/");

  if (!repoSlug) {
    showToast("No repository loaded", "error");
    return;
  }

  // Show clone instructions
  const instructions = `
    <div style="text-align:left;padding:20px;">
      <h3 style="margin-bottom:16px;font-size:16px;">🚀 Clone to Edit</h3>
      
      <p style="margin-bottom:12px;color:var(--text-muted);">
        To edit this repository, clone it locally and run GitMaps on your machine:
      </p>
      
      <div style="background:var(--bg-tertiary);padding:12px;border-radius:6px;margin:12px 0;font-family:var(--font-mono);font-size:12px;">
        <div style="margin-bottom:8px;"># Clone the repository</div>
        <div style="color:var(--accent-primary);">git clone https://github.com/${repoSlug}.git</div>
        <div style="margin-top:8px;margin-bottom:8px;"># Navigate to the repo</div>
        <div style="color:var(--accent-primary);">cd ${repoSlug.split("/").pop()}</div>
        <div style="margin-top:8px;margin-bottom:8px;"># Run GitMaps locally</div>
        <div style="color:var(--accent-primary);">bunx gitmaps@latest</div>
      </div>
      
      <p style="margin-top:12px;color:var(--text-muted);font-size:11px;">
        Once running locally (http://localhost:3335), you'll be in <strong>Leader</strong> mode with full edit control.
      </p>
    </div>
  `;

  // Create modal
  const modal = document.createElement("div");
  modal.className = "clone-modal";
  modal.innerHTML = `
    <div class="clone-modal-backdrop"></div>
    <div class="clone-modal-content">
      ${instructions}
      <div class="clone-modal-actions">
        <button class="clone-modal-copy">📋 Copy Commands</button>
        <button class="clone-modal-close">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Style the modal
  const style = document.createElement("style");
  style.textContent = `
    .clone-modal {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.15s ease;
    }
    .clone-modal-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(10, 10, 15, 0.8);
      backdrop-filter: blur(4px);
    }
    .clone-modal-content {
      position: relative;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 12px;
      max-width: 500px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }
    .clone-modal-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      padding: 16px 20px;
      border-top: 1px solid var(--border-primary);
    }
    .clone-modal-actions button {
      padding: 8px 16px;
      border-radius: 6px;
      border: none;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .clone-modal-copy {
      background: var(--accent-primary);
      color: white;
    }
    .clone-modal-copy:hover {
      background: var(--accent-secondary);
    }
    .clone-modal-close {
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }
    .clone-modal-close:hover {
      background: var(--bg-card);
    }
  `;
  document.head.appendChild(style);

  // Wire up buttons
  modal.querySelector(".clone-modal-copy")?.addEventListener("click", () => {
    const commands = `git clone https://github.com/${repoSlug}.git\ncd ${repoSlug.split("/").pop()}\nbunx gitmaps@latest`;
    navigator.clipboard.writeText(commands);
    showToast("Commands copied to clipboard", "success");
  });

  modal.querySelector(".clone-modal-close")?.addEventListener("click", () => {
    modal.remove();
    style.remove();
  });

  modal
    .querySelector(".clone-modal-backdrop")
    ?.addEventListener("click", () => {
      modal.remove();
      style.remove();
    });
}
