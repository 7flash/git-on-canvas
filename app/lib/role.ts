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
