/**
 * Git Canvas Server — Modern Melina.js
 */
import { start } from 'melina';
import path from 'path';

const appDir = path.join(import.meta.dir, 'app');

await start({
    port: parseInt(process.env.BUN_PORT || "3333"),
    appDir,
    defaultTitle: 'Git Canvas — Visual Repository Explorer'
});
