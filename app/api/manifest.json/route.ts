// GET /api/manifest.json — PWA Web App Manifest
export function GET() {
    return Response.json({
        name: 'GitMaps — Spatial Code Explorer',
        short_name: 'GitMaps',
        description: 'Transcend the file tree. Explore code on an infinite canvas with layers, time-travel, and a minimap.',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0a0f',
        theme_color: '#7c3aed',
        orientation: 'any',
        categories: ['developer-tools', 'productivity'],
        icons: [
            { src: '/api/pwa-icon?size=192', sizes: '192x192', type: 'image/png' },
            { src: '/api/pwa-icon?size=512', sizes: '512x512', type: 'image/png' },
        ],
    }, {
        headers: { 'Content-Type': 'application/manifest+json' },
    });
}
