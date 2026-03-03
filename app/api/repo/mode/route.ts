/**
 * GET /api/repo/mode
 * Returns the app mode: 'local' (dev) or 'saas' (production).
 * In local mode, users can browse local folders AND clone remote URLs.
 * In saas mode, only remote URL cloning is available.
 */
export async function GET() {
    const env = process.env.NODE_ENV || 'development';
    const isLocal = env === 'development' || env === 'local' || env === 'dev';
    return Response.json({
        mode: isLocal ? 'local' : 'saas',
        env,
    });
}
