import { measure } from 'measure-fn';
import simpleGit from 'simple-git';
import { validateRepoPath } from '../validate-path';
import { join } from 'path';

/**
 * POST /api/repo/imports
 * Body: { path: string, commit: string }
 * 
 * Scans all source files at the given commit and returns import/require
 * relationships as edges: { source: string, target: string, line: number }[]
 * 
 * Supports: ES import, CommonJS require, CSS @import, Python import
 */

const SOURCE_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.vue', '.svelte',
    '.css', '.scss', '.less',
    '.py',
]);

// Match import/require patterns and extract the module specifier
const IMPORT_PATTERNS = [
    // ES: import ... from 'module'  or  import 'module'
    /(?:import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"])/g,
    // ES: export ... from 'module'
    /(?:export\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"])/g,
    // CommonJS: require('module')
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    // CSS: @import 'file' or @import url('file')
    /@import\s+(?:url\s*\(\s*)?['"]([^'"]+)['"]/g,
    // Python: from module import ... or import module
    /(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/g,
];

function resolveImport(sourceFile: string, specifier: string, allFiles: string[]): string | null {
    // Skip node_modules / external packages
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;

    // Get directory of source file
    const sourceDir = sourceFile.includes('/') ? sourceFile.substring(0, sourceFile.lastIndexOf('/')) : '';

    // Resolve relative path
    let resolved: string;
    if (specifier.startsWith('/')) {
        resolved = specifier.substring(1);
    } else {
        const parts = sourceDir.split('/').filter(Boolean);
        const specParts = specifier.split('/');
        for (const sp of specParts) {
            if (sp === '..') parts.pop();
            else if (sp !== '.') parts.push(sp);
        }
        resolved = parts.join('/');
    }

    // Try exact match first
    if (allFiles.includes(resolved)) return resolved;

    // Try adding extensions
    const tryExts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.scss', '.vue', '.svelte'];
    for (const ext of tryExts) {
        if (allFiles.includes(resolved + ext)) return resolved + ext;
    }

    // Try /index
    for (const ext of tryExts) {
        if (allFiles.includes(resolved + '/index' + ext)) return resolved + '/index' + ext;
    }

    return null;
}

export async function POST(req: Request) {
    return measure('api:repo:imports', async () => {
        try {
            const { path: repoPath, commit } = await req.json();

            if (!repoPath || !commit) {
                return Response.json({ error: 'path and commit required' }, { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const git = simpleGit(repoPath);

            // Get all files at this commit
            const lsOutput = await git.raw(['ls-tree', '-r', '--name-only', commit]);
            const allFiles = lsOutput.split('\n').filter(Boolean);

            // Filter to source files
            const sourceFiles = allFiles.filter(f => {
                const ext = '.' + f.split('.').pop()?.toLowerCase();
                return SOURCE_EXTENSIONS.has(ext);
            });

            // Scan each source file for imports (limit to first 200 files for perf)
            const filesToScan = sourceFiles.slice(0, 300);
            const edges: { source: string; target: string; line: number }[] = [];

            const isWorkingTree = !commit || commit === 'allfiles' || commit === 'HEAD' || commit === '';

            await Promise.allSettled(filesToScan.map(async (filePath) => {
                try {
                    let text = '';
                    if (isWorkingTree) {
                        try {
                            const file = Bun.file(join(repoPath, filePath));
                            if (await file.exists()) {
                                text = await file.text();
                            }
                        } catch {
                            // Fallback if failed
                        }
                    }
                    if (!text) {
                        text = await git.show([`${commit === 'allfiles' ? 'HEAD' : commit}:${filePath}`]);
                    }
                    if (!text) return;

                    const lines = text.split('\n');

                    for (let i = 0; i < Math.min(lines.length, 100); i++) {
                        // Only scan first 100 lines (imports are at the top)
                        const line = lines[i];

                        for (const pattern of IMPORT_PATTERNS) {
                            // Reset lastIndex for global regex
                            const regex = new RegExp(pattern.source, pattern.flags);
                            let match;
                            while ((match = regex.exec(line)) !== null) {
                                const specifier = match[1] || match[2];
                                if (!specifier) continue;

                                const resolved = resolveImport(filePath, specifier, allFiles);
                                if (resolved && resolved !== filePath) {
                                    edges.push({
                                        source: filePath,
                                        target: resolved,
                                        line: i + 1,
                                    });
                                }
                            }
                        }
                    }
                } catch { /* file might be binary or unreadable */ }
            }));

            // Deduplicate edges
            const seen = new Set<string>();
            const unique = edges.filter(e => {
                const key = `${e.source}→${e.target}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            console.log(`[imports] ${filesToScan.length} files scanned, ${unique.length} import edges found`);

            return Response.json({
                edges: unique,
                filesScanned: filesToScan.length,
                totalFiles: allFiles.length,
            });
        } catch (error: any) {
            console.error('api:repo:imports:error', error);
            return Response.json({ error: error.message }, { status: 500 });
        }
    });
}
