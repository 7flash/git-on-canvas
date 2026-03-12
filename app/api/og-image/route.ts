import { readFileSync } from 'fs';
import { join } from 'path';

const ogBuffer = readFileSync(join(import.meta.dir, '..', '..', 'og-image.png'));

// GET /api/og-image — serves the Open Graph social sharing image
export function GET() {
    return new Response(ogBuffer, {
        headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400',
        },
    });
}
