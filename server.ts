/**
 * Git Canvas Server
 * Uses melina's createAppRouter with proper JSX components.
 */
import path from 'path';
import { serve, createAppRouter } from 'melina';

const appDir = path.join(import.meta.dir, 'app');

serve(createAppRouter({
    appDir,
    globalCss: path.join(appDir, 'globals.css'),
}), { port: parseInt(process.env.BUN_PORT || "3333") });
