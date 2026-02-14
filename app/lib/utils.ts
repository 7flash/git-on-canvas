// @ts-nocheck
/**
 * General-purpose utilities — escaping, formatting, icons, toast.
 */
import { measure } from './measure.js';

// ─── HTML escaping ───────────────────────────────────────
export function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ─── Date formatting ─────────────────────────────────────
export function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = (now as any) - (date as any);
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString();
}

// ─── File size formatting ────────────────────────────────
export function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── File icon class from extension ──────────────────────
export function getFileIconClass(ext: string): string {
    const extMap: Record<string, string> = {
        'js': 'js', 'jsx': 'js', 'mjs': 'js',
        'ts': 'ts', 'tsx': 'ts',
        'html': 'html', 'htm': 'html',
        'css': 'css', 'scss': 'css', 'sass': 'css', 'less': 'css',
        'json': 'json',
        'md': 'md', 'markdown': 'md',
        'py': 'py',
        'go': 'go',
        'rs': 'rs'
    };
    return extMap[ext] || '';
}

// ─── SVG file icon ───────────────────────────────────────
export function getFileIcon(type: string, ext: string): string {
    if (type === 'folder') {
        return `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/>
        </svg>`;
    }
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
    </svg>`;
}

// ─── Toast notifications ─────────────────────────────────
export function showToast(message: string, type = 'info') {
    measure('toast:show', () => {
        let container = document.querySelector('.toast-container') as HTMLElement;
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    });
}
