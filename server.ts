/**
 * Git Canvas Server
 * Uses melina's createAppRouter with proper JSX components.
 */
import { serve, createAppRouter } from 'melina';

serve(createAppRouter({
    appDir: './app',
    globalCss: './app/globals.css',
}), { port: parseInt(process.env.BUN_PORT || "3333") });
