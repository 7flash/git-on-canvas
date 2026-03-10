#!/usr/bin/env bun
/**
 * gitmaps CLI — run GitMaps locally on any repository
 * Usage: npx gitmaps [path] [--port 3335]
 */

const args = process.argv.slice(2);
let repoPath = process.cwd();
let port = 3335;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
        port = parseInt(args[i + 1]);
        i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
        console.log(`
🪐 GitMaps — Spatial Code Explorer

Usage:
  npx gitmaps                  # Open current directory
  npx gitmaps /path/to/repo    # Open specific repo
  npx gitmaps --port 4000      # Custom port

Options:
  --port <number>    Port to run on (default: 3335)
  --help, -h         Show this help
`);
        process.exit(0);
    } else if (!args[i].startsWith('-')) {
        repoPath = args[i];
    }
}

process.env.BUN_PORT = String(port);
process.env.GITMAPS_REPO = repoPath;

console.log(`🪐 GitMaps starting...`);
console.log(`   Repo: ${repoPath}`);
console.log(`   Port: ${port}`);
console.log(`   URL:  http://localhost:${port}`);
console.log();

// Import and run the server
import('./server.ts');
