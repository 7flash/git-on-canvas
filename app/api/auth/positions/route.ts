/**
 * GET /api/auth/positions?repo=<url> — Load saved positions for a repo
 * POST /api/auth/positions — Save positions for a repo (Leader only)
 *
 * Leader/Follower enforcement:
 * - Leaders (localhost/local network): Can read/write positions
 * - Followers (remote/production): Read-only access
 *
 * This prevents unauthorized canvas modifications on production servers.
 */
import {
  getSessionFromRequest,
  loadRepoPositions,
  saveRepoPositions,
} from "../../../lib/auth";

/**
 * Detect if request is from a leader (local) or follower (remote)
 * Based on IP address - localhost and local network = leader
 */
function isLeaderRequest(req: Request): boolean {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  // Leader: localhost, local network IPs
  const leaderPatterns = [
    /^127\./, // 127.0.0.1
    /^::1$/, // IPv6 localhost
    /^192\.168\./, // Private network
    /^10\./, // Private network
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private network
    /^localhost$/i,
    /^unknown$/i, // No IP header = likely local dev
  ];

  return leaderPatterns.some((pattern) => pattern.test(ip));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const repoUrl = url.searchParams.get("repo");
  if (!repoUrl) {
    return Response.json({ error: "repo param required" }, { status: 400 });
  }

  const user = getSessionFromRequest(req);

  // Allow unauthenticated reads (for public repos)
  if (!user) {
    // Try to load from guest account (userId 0) or return empty
    const positionsJson = loadRepoPositions(0, repoUrl);
    return Response.json({
      positions: positionsJson ? JSON.parse(positionsJson) : null,
      repoUrl,
      authenticated: false,
    });
  }

  const positionsJson = loadRepoPositions(user.id, repoUrl);
  return Response.json({
    positions: positionsJson ? JSON.parse(positionsJson) : null,
    repoUrl,
    authenticated: true,
  });
}

export async function POST(req: Request) {
  // Enforce leader-only writes
  const isLeader = isLeaderRequest(req);
  if (!isLeader) {
    return Response.json(
      {
        error:
          "Write access denied: Follower mode (read-only). Run GitMaps locally to edit canvas.",
        code: "FOLLOWER_READ_ONLY",
      },
      { status: 403 },
    );
  }

  const user = getSessionFromRequest(req);

  // Allow local dev without auth (guest mode - use userId 0)
  const userId = user?.id ?? 0;

  try {
    const body = (await req.json()) as {
      repoUrl: string;
      positions: Record<string, any>;
    };

    if (!body.repoUrl) {
      return Response.json({ error: "repoUrl required" }, { status: 400 });
    }

    saveRepoPositions(
      userId,
      body.repoUrl,
      JSON.stringify(body.positions || {}),
    );
    return Response.json({
      ok: true,
      mode: "leader",
      syncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
