import { measure } from '../../../lib/measure.js';
import simpleGit from 'simple-git';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const BINARY_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg', 'webp', 'mp3', 'mp4', 'wav', 'ogg', 'avi', 'mov', 'zip', 'tar', 'gz', 'rar', '7z', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'exe', 'dll', 'so', 'dylib', 'woff', 'woff2', 'ttf', 'eot', 'otf', 'lock']);

export async function POST(req) {
    return measure('api:repo:tree', async () => {
        try {
            const { path: repoPath } = await req.json();

            if (!repoPath) {
                return new Response('Repository path is required', { status: 400 });
            }

            const git = simpleGit(repoPath);

            // Get tracked files only (respects .gitignore by definition)
            const result = await git.raw(['ls-files']);
            const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage', '.turbo', '__pycache__', '.tsbuildinfo'];

            // Also parse .gitignore for extra patterns
            const gitignorePatterns = [];
            const gitignorePath = path.join(repoPath, '.gitignore');
            if (existsSync(gitignorePath)) {
                try {
                    const content = readFileSync(gitignorePath, 'utf-8');
                    content.split('\n').forEach(line => {
                        line = line.trim();
                        if (line && !line.startsWith('#')) {
                            // Normalize: remove trailing slashes for dir matching
                            const clean = line.replace(/\/+$/, '');
                            if (clean) gitignorePatterns.push(clean);
                        }
                    });
                } catch (e) { /* ignore */ }
            }

            const filePaths = result.trim().split('\n').filter(fp => {
                if (!fp) return false;
                // Filter out known heavy directories
                if (ignoreDirs.some(d => fp.startsWith(d + '/') || fp.startsWith(d + '\\'))) return false;
                // Filter out files matching gitignore patterns (extra safety)
                for (const pattern of gitignorePatterns) {
                    if (fp.startsWith(pattern + '/') || fp.startsWith(pattern + '\\')) return false;
                    if (fp === pattern) return false;
                    // Simple glob: *.ext
                    if (pattern.startsWith('*.')) {
                        const ext = pattern.substring(1); // .ext
                        if (fp.endsWith(ext)) return false;
                    }
                }
                return true;
            });

            const files = filePaths.map(filePath => {
                const parts = filePath.split('/');
                const name = parts[parts.length - 1];
                const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';

                let content = null;
                let lines = 0;
                let isBinary = BINARY_EXTS.has(ext);

                if (!isBinary) {
                    try {
                        const fullPath = path.join(repoPath, filePath);
                        const raw = readFileSync(fullPath, 'utf-8');
                        const allLines = raw.split('\n');
                        lines = allLines.length;
                        // Send full content for small/medium files, truncate very large ones
                        if (allLines.length > 10000) {
                            content = allLines.slice(0, 10000).join('\n');
                        } else {
                            content = raw;
                        }
                    } catch (e) {
                        content = null;
                    }
                }

                return {
                    path: filePath,
                    name,
                    ext,
                    type: 'file',
                    content,
                    lines,
                    isBinary
                };
            });

            return Response.json({ files, total: files.length });
        } catch (error) {
            measure('api:repo:tree:error', () => error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
