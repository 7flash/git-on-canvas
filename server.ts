import { serve, buildScript, buildStyle } from 'melina';
import path from 'path';
import { existsSync } from 'fs';

const appDir = path.join(process.cwd(), 'app');

// Pre-build assets
let mainJsPath: string | null = null;
let mainCssPath: string | null = null;

async function buildAssets() {
    // Build main.js
    const mainJsFile = path.join(appDir, 'main.js');
    if (existsSync(mainJsFile)) {
        mainJsPath = await buildScript('app/main.js', false);
        console.log(`📦 Built main.js -> ${mainJsPath}`);
    }

    // Build CSS
    const mainCssFile = path.join(appDir, 'styles', 'main.css');
    if (existsSync(mainCssFile)) {
        mainCssPath = await buildStyle('app/styles/main.css');
        console.log(`🎨 Built main.css -> ${mainCssPath}`);
    }
}

// Import API route modules
const apiRoutes: Record<string, any> = {};

async function loadApiRoutes() {
    const apiDir = path.join(appDir, 'api');

    // Load /api/positions
    const positionsRoute = path.join(apiDir, 'positions', 'route.js');
    if (existsSync(positionsRoute)) {
        apiRoutes['/api/positions'] = await import(positionsRoute);
        console.log('   ⚡ /api/positions loaded');
    }

    // Load /api/repo/load
    const repoLoadRoute = path.join(apiDir, 'repo', 'load', 'route.js');
    if (existsSync(repoLoadRoute)) {
        apiRoutes['/api/repo/load'] = await import(repoLoadRoute);
        console.log('   ⚡ /api/repo/load loaded');
    }

    // Load /api/repo/files
    const repoFilesRoute = path.join(apiDir, 'repo', 'files', 'route.js');
    if (existsSync(repoFilesRoute)) {
        apiRoutes['/api/repo/files'] = await import(repoFilesRoute);
        console.log('   ⚡ /api/repo/files loaded');
    }

    // Load /api/repo/file-content
    const repoFileContentRoute = path.join(apiDir, 'repo', 'file-content', 'route.js');
    if (existsSync(repoFileContentRoute)) {
        apiRoutes['/api/repo/file-content'] = await import(repoFileContentRoute);
        console.log('   ⚡ /api/repo/file-content loaded');
    }

    // Load /api/repo/tree
    const repoTreeRoute = path.join(apiDir, 'repo', 'tree', 'route.js');
    if (existsSync(repoTreeRoute)) {
        apiRoutes['/api/repo/tree'] = await import(repoTreeRoute);
        console.log('   ⚡ /api/repo/tree loaded');
    }
}

// Handler function
async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Serve index.html for root
    if (pathname === '/' || pathname === '/index.html') {
        const indexHtml = Bun.file(path.join(appDir, 'index.html'));

        if (await indexHtml.exists()) {
            let html = await indexHtml.text();

            // Replace CSS path with built path
            if (mainCssPath) {
                html = html.replace('/app/styles/main.css', mainCssPath);
            }

            // Replace JS path with built path
            if (mainJsPath) {
                html = html.replace('/app/main.js', mainJsPath);
            }

            return new Response(html, {
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        }
    }

    // Handle API routes
    const method = req.method.toUpperCase();

    for (const [routePath, module] of Object.entries(apiRoutes)) {
        if (pathname === routePath) {
            const handlerFn = module[method] || module.default;

            if (!handlerFn) {
                return new Response('Method Not Allowed', { status: 405 });
            }

            try {
                const response = await handlerFn(req, { params: {} });
                return response instanceof Response
                    ? response
                    : new Response(JSON.stringify(response), {
                        headers: { 'Content-Type': 'application/json' }
                    });
            } catch (e: any) {
                console.error(`API error in ${routePath}:`, e);
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }
    }

    // Fallback - return 404
    return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
    });
}

// Main startup
console.log('🦊 Starting Git Canvas server...');
console.log('📁 Loading API routes:');
await loadApiRoutes();
console.log('📦 Building assets:');
await buildAssets();
await serve(handler);
