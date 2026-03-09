import path from 'path';

/**
 * Allowed repo path directories in production (SaaS) mode.
 * Only these directories can be accessed — prevents arbitrary file system reads.
 */
const ALLOWED_ROOTS = [
    path.resolve(process.cwd(), 'git-canvas', 'repos'),  // Clone directory
    path.resolve(process.cwd(), '.data', 'uploads'),       // Drag-and-drop uploads
];

const IS_PRODUCTION = (() => {
    const env = process.env.NODE_ENV || 'development';
    return env !== 'development' && env !== 'local' && env !== 'dev';
})();

/**
 * Validates that a repo path is allowed in the current mode.
 * - In development: any path is allowed (for local folder browsing)
 * - In production/SaaS: only paths under ALLOWED_ROOTS are permitted
 *
 * Returns null if valid, or a Response with a 403 error if blocked.
 */
export function validateRepoPath(repoPath: string): Response | null {
    if (!IS_PRODUCTION) return null; // Allow everything in dev

    const resolved = path.resolve(repoPath);
    const isAllowed = ALLOWED_ROOTS.some(root => resolved.startsWith(root + path.sep) || resolved === root);

    if (!isAllowed) {
        console.warn(`[security] Blocked access to path outside allowed roots: ${resolved}`);
        return Response.json(
            { error: 'Access denied: this path is not accessible in production mode.' },
            { status: 403 }
        );
    }

    return null; // Path is valid
}

/**
 * Quick guard for routes that should be completely disabled in production.
 * Returns a 403 Response if in production, null otherwise.
 */
export function blockInProduction(routeName: string): Response | null {
    if (!IS_PRODUCTION) return null;

    console.warn(`[security] Blocked ${routeName} in production mode`);
    return Response.json(
        { error: `${routeName} is not available in production mode.` },
        { status: 403 }
    );
}
