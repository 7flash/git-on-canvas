// @ts-nocheck
/**
 * Go-to-definition — makes import paths clickable in the file modal.
 * Ctrl+Click or click on highlighted import paths navigates to the
 * target file's card on the canvas.
 */
import type { CanvasContext } from './context';
import { showToast } from './utils';

// ─── Import path resolution ────────────────────────
const IMPORT_PATTERNS = [
    // JS/TS: import X from './path'
    /(?:import|export)\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g,
    // JS/TS: require('./path')
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    // JS/TS: import('./path')
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    // Python: from X import Y / import X
    /(?:from|import)\s+([\w.]+)/g,
    // CSS: @import './path'
    /@import\s+['"]([^'"]+)['"]/g,
];

const JS_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];
const INDEX_FILES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];

/**
 * Resolve an import specifier to a file path in the repo.
 */
function resolveImportPath(importPath: string, currentFilePath: string, allFiles: string[]): string | null {
    // Skip external packages (no ./ or ../ prefix, not Python dots)
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
        // Could be a Python dotted import or a bare specifier
        // Try converting Python dots to slashes
        const pythonPath = importPath.replace(/\./g, '/');
        const pyMatch = allFiles.find(f => f === pythonPath + '.py' || f === pythonPath + '/__init__.py');
        if (pyMatch) return pyMatch;
        return null;
    }

    // Resolve relative path
    const currentDir = currentFilePath.split('/').slice(0, -1).join('/');
    const parts = [...(currentDir ? currentDir.split('/') : []), ...importPath.split('/')];

    // Normalize: resolve . and ..
    const resolved: string[] = [];
    for (const part of parts) {
        if (part === '.') continue;
        if (part === '..') { resolved.pop(); continue; }
        resolved.push(part);
    }

    const basePath = resolved.join('/');

    // Try exact match first
    if (allFiles.includes(basePath)) return basePath;

    // Try with extensions
    for (const ext of JS_EXTENSIONS) {
        const candidate = basePath + ext;
        if (allFiles.includes(candidate)) return candidate;
    }

    // Try as directory with index file
    for (const indexFile of INDEX_FILES) {
        const candidate = basePath + '/' + indexFile;
        if (allFiles.includes(candidate)) return candidate;
    }

    return null;
}

/**
 * Extract all import paths from file content with their line positions.
 */
function extractImports(content: string): Array<{ path: string; line: number; start: number; end: number }> {
    const lines = content.split('\n');
    const imports: Array<{ path: string; line: number; start: number; end: number }> = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of IMPORT_PATTERNS) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(line)) !== null) {
                const importPath = match[1];
                if (!importPath) continue;
                // Find the position of the import path string in the line
                const pathStart = line.indexOf(importPath, match.index);
                imports.push({
                    path: importPath,
                    line: i + 1,
                    start: pathStart,
                    end: pathStart + importPath.length,
                });
            }
        }
    }

    return imports;
}

/**
 * Post-process rendered HTML in the modal to make import paths clickable.
 * Call this after setting contentEl.innerHTML.
 */
export function addClickableImports(ctx: CanvasContext, contentEl: HTMLElement, filePath: string, rawContent: string) {
    if (!rawContent || !filePath) return;

    const imports = extractImports(rawContent);
    if (imports.length === 0) return;

    // Get all file paths from the canvas
    const allFiles: string[] = [];
    if (ctx.allFilesData) {
        for (const f of ctx.allFilesData) {
            if (f.path) allFiles.push(f.path);
        }
    }
    // Also gather from fileCards map
    for (const [p] of ctx.fileCards) {
        if (!allFiles.includes(p)) allFiles.push(p);
    }

    // Resolve imports and mark which are navigable
    const navigable = new Map<string, string>(); // importPath -> resolvedPath
    for (const imp of imports) {
        if (navigable.has(imp.path)) continue;
        const resolved = resolveImportPath(imp.path, filePath, allFiles);
        if (resolved) navigable.set(imp.path, resolved);
    }

    if (navigable.size === 0) return;

    // Add a delegated click handler on the content element
    contentEl.addEventListener('click', (e: MouseEvent) => {
        // Only activate on Ctrl+Click or if clicking a link-import element
        const target = e.target as HTMLElement;
        const importLink = target.closest('.goto-import-link');

        if (importLink) {
            e.preventDefault();
            e.stopPropagation();
            const resolvedPath = importLink.getAttribute('data-resolved');
            if (resolvedPath) navigateToFile(ctx, resolvedPath);
            return;
        }

        // Ctrl+Click on any text containing an import path
        if (!e.ctrlKey && !e.metaKey) return;
        const text = target.textContent || '';
        for (const [importPath, resolvedPath] of navigable) {
            if (text.includes(importPath)) {
                e.preventDefault();
                e.stopPropagation();
                navigateToFile(ctx, resolvedPath);
                return;
            }
        }
    });

    // Post-process HTML to wrap import paths with clickable spans
    // We search for string literals containing navigable import paths
    const codeEl = contentEl.querySelector('code') || contentEl;
    const walker = document.createTreeWalker(codeEl, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Text | null;
    while ((node = walker.nextNode() as Text)) {
        for (const [importPath] of navigable) {
            if (node.textContent?.includes(importPath)) {
                textNodes.push(node);
                break;
            }
        }
    }

    for (const textNode of textNodes) {
        const text = textNode.textContent || '';
        for (const [importPath, resolvedPath] of navigable) {
            if (text.includes(importPath)) {
                const parts = text.split(importPath);
                if (parts.length < 2) continue;

                const fragment = document.createDocumentFragment();
                for (let i = 0; i < parts.length; i++) {
                    if (i > 0) {
                        // Insert the clickable import link
                        const link = document.createElement('span');
                        link.className = 'goto-import-link';
                        link.setAttribute('data-resolved', resolvedPath);
                        link.textContent = importPath;
                        link.title = `Go to: ${resolvedPath} (Ctrl+Click)`;
                        fragment.appendChild(link);
                    }
                    if (parts[i]) {
                        fragment.appendChild(document.createTextNode(parts[i]));
                    }
                }
                textNode.replaceWith(fragment);
                break; // Only process first match per text node
            }
        }
    }
}

/**
 * Navigate to a file — opens it as a new tab in the modal.
 */
function navigateToFile(ctx: CanvasContext, filePath: string) {
    // Find the file data
    const fileData = ctx.allFilesData?.find(f => f.path === filePath);
    if (!fileData) {
        showToast(`File not found: ${filePath}`, 'error');
        return;
    }

    showToast(`→ ${filePath.split('/').pop()}`, 'info');

    // Open the file as a new tab in the current modal
    import('./file-modal').then(({ openFileModal }) => {
        openFileModal(ctx, fileData);
    });
}

