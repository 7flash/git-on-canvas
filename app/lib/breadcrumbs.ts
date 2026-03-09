// @ts-nocheck
/**
 * Breadcrumb navigation for the file modal header.
 * Renders directory path as clickable segments with a dropdown
 * showing sibling files when a directory segment is clicked.
 */

import type { CanvasContext } from './context';

/**
 * Render breadcrumbs into the path element.
 * Each segment is clickable to show sibling files/dirs at that level.
 */
export function renderBreadcrumbs(ctx: CanvasContext, pathEl: HTMLElement, filePath: string) {
    pathEl.innerHTML = '';
    pathEl.className = 'file-path breadcrumb-bar';

    const parts = filePath.split('/');
    const fileName = parts.pop() || filePath;

    // Directory segments
    for (let i = 0; i < parts.length; i++) {
        const segment = parts[i];
        const dirPath = parts.slice(0, i + 1).join('/');

        const segBtn = document.createElement('button');
        segBtn.className = 'breadcrumb-segment';
        segBtn.textContent = segment;
        segBtn.title = dirPath;
        segBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showDirectoryDropdown(ctx, segBtn, dirPath, filePath);
        });
        pathEl.appendChild(segBtn);

        // Separator
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-sep';
        sep.textContent = '/';
        pathEl.appendChild(sep);
    }

    // File name (no dropdown, just styled differently)
    const fileSpan = document.createElement('span');
    fileSpan.className = 'breadcrumb-file';
    fileSpan.textContent = fileName;
    pathEl.appendChild(fileSpan);
}

// ─── Directory dropdown ────────────────────────────
let activeDropdown: HTMLElement | null = null;

function closeDropdown() {
    if (activeDropdown) {
        activeDropdown.remove();
        activeDropdown = null;
    }
    document.removeEventListener('click', closeDropdown);
}

function showDirectoryDropdown(ctx: CanvasContext, anchor: HTMLElement, dirPath: string, currentFilePath: string) {
    closeDropdown();

    // Gather all files in this directory
    const allFiles: string[] = [];
    if (ctx.allFilesData) {
        for (const f of ctx.allFilesData) {
            if (f.path) allFiles.push(f.path);
        }
    }
    for (const [p] of ctx.fileCards) {
        if (!allFiles.includes(p)) allFiles.push(p);
    }

    // Find siblings (files and immediate subdirectories)
    const prefix = dirPath + '/';
    const siblings: Array<{ name: string; path: string; isDir: boolean }> = [];
    const seenDirs = new Set<string>();

    for (const fp of allFiles) {
        if (!fp.startsWith(prefix)) continue;
        const rest = fp.slice(prefix.length);
        const slashIdx = rest.indexOf('/');

        if (slashIdx === -1) {
            // Direct file
            siblings.push({ name: rest, path: fp, isDir: false });
        } else {
            // Subdirectory
            const subDir = rest.slice(0, slashIdx);
            if (!seenDirs.has(subDir)) {
                seenDirs.add(subDir);
                siblings.push({ name: subDir + '/', path: prefix + subDir, isDir: true });
            }
        }
    }

    // Sort: dirs first, then files, alphabetically
    siblings.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    if (siblings.length === 0) return;

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'breadcrumb-dropdown';

    // Position relative to anchor
    const rect = anchor.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.left = `${rect.left}px`;

    for (const item of siblings) {
        const btn = document.createElement('button');
        btn.className = 'breadcrumb-dropdown-item';
        if (item.path === currentFilePath) btn.classList.add('active');

        const icon = document.createElement('span');
        icon.className = 'breadcrumb-dropdown-icon';
        icon.textContent = item.isDir ? '📁' : getFileIcon(item.name);
        btn.appendChild(icon);

        const label = document.createElement('span');
        label.textContent = item.name;
        btn.appendChild(label);

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeDropdown();

            if (item.isDir) {
                // Show sub-directory contents
                showDirectoryDropdown(ctx, anchor, item.path, currentFilePath);
                return;
            }

            // Open the file
            const fileData = ctx.allFilesData?.find(f => f.path === item.path);
            if (fileData) {
                import('./file-modal').then(({ openFileModal }) => {
                    openFileModal(ctx, fileData);
                });
            }
        });

        dropdown.appendChild(btn);
    }

    document.body.appendChild(dropdown);
    activeDropdown = dropdown;

    // Close on click outside (defer to avoid immediate close)
    requestAnimationFrame(() => {
        document.addEventListener('click', closeDropdown);
    });
}

function getFileIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const icons: Record<string, string> = {
        ts: '🔷', tsx: '⚛️', js: '🟨', jsx: '⚛️',
        py: '🐍', css: '🎨', html: '🌐', json: '📋',
        md: '📝', yaml: '⚙️', yml: '⚙️', toml: '⚙️',
        sh: '🐚', sql: '🗃️', rs: '🦀', go: '🐹',
        svg: '🖼️', png: '🖼️', jpg: '🖼️',
    };
    return icons[ext] || '📄';
}
