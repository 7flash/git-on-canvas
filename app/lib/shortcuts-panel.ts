/**
 * Keyboard Shortcuts Panel — press ? to show all available shortcuts
 * 
 * Collects all shortcuts scattered across the codebase into one
 * discoverable, premium-looking reference panel.
 */

import { isCommandPaletteOpen } from './command-palette';

const SHORTCUTS = [
    {
        category: 'Navigation', items: [
            { keys: ['Ctrl', 'K'], description: 'Quick file search (command palette)' },
            { keys: ['/'], description: 'Search file contents' },
            { keys: ['Ctrl', 'F'], description: 'Search file contents' },
            { keys: ['←', '→'], description: 'Navigate commits' },
            { keys: ['Space + Drag'], description: 'Pan canvas' },
            { keys: ['Scroll'], description: 'Zoom in/out' },
        ]
    },
    {
        category: 'Selection & Arrangement', items: [
            { keys: ['Ctrl', 'A'], description: 'Select all cards' },
            { keys: ['Click'], description: 'Select card' },
            { keys: ['Shift + Click'], description: 'Multi-select cards' },
            { keys: ['H'], description: 'Arrange selected in row' },
            { keys: ['V'], description: 'Arrange selected in column' },
            { keys: ['G'], description: 'Arrange selected in grid' },
        ]
    },
    {
        category: 'Cards', items: [
            { keys: ['F'], description: 'Toggle expand/collapse selected' },
            { keys: ['W'], description: 'Fit selected to screen' },
            { keys: ['Delete'], description: 'Hide selected cards' },
            { keys: ['Dbl-click'], description: 'Zoom into file' },
            { keys: ['Ctrl', '+'], description: 'Increase font size' },
            { keys: ['Ctrl', '−'], description: 'Decrease font size' },
        ]
    },
    {
        category: 'Tools', items: [
            { keys: ['I'], description: 'Toggle AI chat' },
            { keys: ['Shift + Click line'], description: 'Start connection' },
            { keys: ['Esc'], description: 'Deselect / cancel / close' },
            { keys: ['?'], description: 'Show this panel' },
        ]
    },
];

let panel: HTMLElement | null = null;

function createPanel(): void {
    panel = document.createElement('div');
    panel.id = 'shortcuts-overlay';

    const inner = document.createElement('div');
    inner.id = 'shortcuts-panel';

    inner.innerHTML = `
        <div class="sp-header">
            <h2>⌨️ Keyboard Shortcuts</h2>
            <button class="sp-close" aria-label="Close">✕</button>
        </div>
        <div class="sp-grid">
            ${SHORTCUTS.map(cat => `
                <div class="sp-category">
                    <h3>${cat.category}</h3>
                    ${cat.items.map(item => `
                        <div class="sp-row">
                            <div class="sp-keys">
                                ${item.keys.map(k =>
        k.includes('+') || k.includes('Drag') || k.includes('Click') || k.includes('click')
            ? `<span class="sp-key sp-key--text">${k}</span>`
            : `<kbd>${k}</kbd>`
    ).join('<span class="sp-sep">+</span>')}
                            </div>
                            <span class="sp-desc">${item.description}</span>
                        </div>
                    `).join('')}
                </div>
            `).join('')}
        </div>
    `;

    panel.appendChild(inner);
    document.body.appendChild(panel);

    // Close handlers
    panel.addEventListener('mousedown', (e) => {
        if (e.target === panel) close();
    });
    inner.querySelector('.sp-close')?.addEventListener('click', close);
}

function open(): void {
    if (!panel) createPanel();
    panel!.style.display = 'flex';
    // Re-run animation
    const inner = panel!.querySelector('#shortcuts-panel') as HTMLElement;
    if (inner) {
        inner.style.animation = 'none';
        requestAnimationFrame(() => {
            inner.style.animation = '';
        });
    }
}

function close(): void {
    if (panel) panel.style.display = 'none';
}

function isOpen(): boolean {
    return panel?.style.display === 'flex';
}

export function initShortcutsPanel(): void {
    document.addEventListener('keydown', (e) => {
        // Only trigger on `?` (Shift+/) when not in an input
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        if (isCommandPaletteOpen()) return;

        if (e.key === '?' || (e.shiftKey && e.key === '/')) {
            e.preventDefault();
            if (isOpen()) {
                close();
            } else {
                open();
            }
        }

        if (e.key === 'Escape' && isOpen()) {
            close();
        }
    });
}
