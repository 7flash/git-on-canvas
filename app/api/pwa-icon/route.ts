import { readFileSync } from 'fs';
import { join } from 'path';

const iconBuffer = readFileSync(join(import.meta.dir, '..', '..', 'icon.png'));

// GET /api/pwa-icon — serves the app icon (any size param ignored, returns PNG)
export function GET() {
    return new Response(iconBuffer, {
        headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400',
        },
    });
}
