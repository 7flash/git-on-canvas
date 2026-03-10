// @ts-nocheck
/**
 * Multi-tab file management for the modal.
 * Allows opening multiple files that persist as tabs.
 * Tab paths are saved to localStorage for session persistence.
 */

const TAB_STORAGE_KEY = 'gitcanvas:openTabs';

export interface FileTab {
    path: string;
    name: string;
    file: any;           // Original file data object
    rendered: { full: string; diff: string; full_raw: string };
    currentView: string; // 'full' | 'diff' | 'edit' | 'chat'
    scrollTop: number;
    originalContent: string;
}

// ─── Global tab state ───────────────────────────────
let openTabs: FileTab[] = [];
let activeTabIndex = -1;
let tabBarEl: HTMLElement | null = null;

export function getOpenTabs(): FileTab[] { return openTabs; }
export function getActiveTab(): FileTab | null { return openTabs[activeTabIndex] || null; }
export function getActiveTabIndex(): number { return activeTabIndex; }

/**
 * Initialize the tab bar element in the modal.
 * Should be called once during app setup.
 */
export function initTabBar() {
    if (tabBarEl) return tabBarEl;

    const modal = document.getElementById('filePreviewModal');
    if (!modal) return null;

    const modalContent = modal.querySelector('.modal-content');
    const header = modal.querySelector('.modal-header');
    if (!modalContent || !header) return null;

    // Check if tab bar already exists
    tabBarEl = document.getElementById('modalFileTabBar');
    if (!tabBarEl) {
        tabBarEl = document.createElement('div');
        tabBarEl.id = 'modalFileTabBar';
        tabBarEl.className = 'modal-file-tab-bar';
        // Insert after the header
        header.after(tabBarEl);
    }

    return tabBarEl;
}

/**
 * Add a file to the tab bar or activate it if already open.
 * Returns the tab index.
 */
export function addTab(file: any): number {
    // Check if already open
    const existing = openTabs.findIndex(t => t.path === file.path);
    if (existing >= 0) {
        activeTabIndex = existing;
        renderTabBar();
        return existing;
    }

    const tab: FileTab = {
        path: file.path,
        name: file.name || file.path?.split('/').pop() || 'untitled',
        file,
        rendered: { full: '', diff: '', full_raw: '' },
        currentView: 'full',
        scrollTop: 0,
        originalContent: file.content || '',
    };

    openTabs.push(tab);
    activeTabIndex = openTabs.length - 1;
    renderTabBar();
    _persistTabPaths();
    return activeTabIndex;
}

/**
 * Close a tab by index. Returns the new active tab index, or -1 if none left.
 */
export function closeTab(index: number, hasUnsavedChanges?: () => boolean): number {
    if (index < 0 || index >= openTabs.length) return activeTabIndex;

    // Check for unsaved changes on the active tab
    if (index === activeTabIndex && hasUnsavedChanges?.()) {
        if (!confirm('You have unsaved changes. Discard them?')) return activeTabIndex;
    }

    openTabs.splice(index, 1);

    if (openTabs.length === 0) {
        activeTabIndex = -1;
        renderTabBar();
        return -1;
    }

    // Adjust active index
    if (activeTabIndex >= openTabs.length) {
        activeTabIndex = openTabs.length - 1;
    } else if (index < activeTabIndex) {
        activeTabIndex--;
    }

    renderTabBar();
    _persistTabPaths();
    return activeTabIndex;
}

/**
 * Set the active tab and update tab bar rendering.
 */
export function setActiveTab(index: number): void {
    if (index < 0 || index >= openTabs.length) return;
    activeTabIndex = index;
    renderTabBar();
}

/**
 * Cycle to the next tab (Ctrl+Tab).
 */
export function nextTab(): number {
    if (openTabs.length <= 1) return activeTabIndex;
    activeTabIndex = (activeTabIndex + 1) % openTabs.length;
    renderTabBar();
    return activeTabIndex;
}

/**
 * Cycle to the previous tab (Ctrl+Shift+Tab).
 */
export function prevTab(): number {
    if (openTabs.length <= 1) return activeTabIndex;
    activeTabIndex = (activeTabIndex - 1 + openTabs.length) % openTabs.length;
    renderTabBar();
    return activeTabIndex;
}

/**
 * Clear all tabs (on modal close).
 * Keeps saved tab paths in localStorage for session restore.
 */
export function clearTabs(): void {
    // Persist current tab paths before clearing in-memory state
    _persistTabPaths();
    openTabs = [];
    activeTabIndex = -1;
    renderTabBar();
}

/** Fully clear tabs AND remove from localStorage (discard all) */
export function clearTabsAndStorage(): void {
    openTabs = [];
    activeTabIndex = -1;
    renderTabBar();
    try { localStorage.removeItem(TAB_STORAGE_KEY); } catch { }
}

/** Get previously saved tab paths for session restore */
export function getSavedTabPaths(): { paths: string[]; activeIndex: number } {
    try {
        const raw = localStorage.getItem(TAB_STORAGE_KEY);
        if (!raw) return { paths: [], activeIndex: -1 };
        return JSON.parse(raw);
    } catch {
        return { paths: [], activeIndex: -1 };
    }
}

/** Save current tab paths to localStorage */
function _persistTabPaths(): void {
    try {
        if (openTabs.length === 0) return; // Don't overwrite with empty on close
        const data = {
            paths: openTabs.map(t => t.path),
            activeIndex: activeTabIndex,
        };
        localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(data));
    } catch { }
}

// ─── Tab change callback ────────────────────────────
let _onTabChange: ((tab: FileTab, index: number) => void) | null = null;
let _onTabClose: ((index: number) => boolean) | null = null;

export function onTabChange(cb: (tab: FileTab, index: number) => void) {
    _onTabChange = cb;
}

export function onTabCloseRequest(cb: (index: number) => boolean) {
    _onTabClose = cb;
}

// ─── Language icons ─────────────────────────────────
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

// ─── Render tab bar ─────────────────────────────────
function renderTabBar() {
    if (!tabBarEl) initTabBar();
    if (!tabBarEl) return;

    // Hide tab bar if no tabs or only 1
    if (openTabs.length <= 1) {
        tabBarEl.style.display = 'none';
        return;
    }

    tabBarEl.style.display = 'flex';
    tabBarEl.innerHTML = '';

    openTabs.forEach((tab, i) => {
        const tabEl = document.createElement('div');
        tabEl.className = `file-tab${i === activeTabIndex ? ' active' : ''}`;
        tabEl.title = tab.path;

        const icon = document.createElement('span');
        icon.className = 'file-tab-icon';
        icon.textContent = getFileIcon(tab.name);
        tabEl.appendChild(icon);

        const label = document.createElement('span');
        label.className = 'file-tab-label';
        label.textContent = tab.name;
        tabEl.appendChild(label);

        // Modified indicator
        if (tab.currentView === 'edit' && tab.rendered.full_raw && tab.rendered.full_raw !== tab.originalContent) {
            const dot = document.createElement('span');
            dot.className = 'file-tab-modified';
            dot.textContent = '●';
            tabEl.appendChild(dot);
        }

        // Close button
        const close = document.createElement('button');
        close.className = 'file-tab-close';
        close.textContent = '×';
        close.title = 'Close tab';
        close.addEventListener('click', (e) => {
            e.stopPropagation();
            // Check callback for unsaved changes
            if (_onTabClose && !_onTabClose(i)) return;
            const newIndex = closeTab(i);
            if (newIndex === -1) {
                // No tabs left — close modal
                const modal = document.getElementById('filePreviewModal');
                if (modal) modal.classList.remove('active');
            } else if (_onTabChange) {
                _onTabChange(openTabs[newIndex], newIndex);
            }
        });
        tabEl.appendChild(close);

        // Click to switch
        tabEl.addEventListener('click', () => {
            if (i === activeTabIndex) return;

            // Save current tab's scroll position
            const currentTab = openTabs[activeTabIndex];
            if (currentTab) {
                const bodyPre = document.getElementById('modalBodyPre');
                if (bodyPre) currentTab.scrollTop = bodyPre.scrollTop;
            }

            setActiveTab(i);
            if (_onTabChange) _onTabChange(openTabs[i], i);
        });

        // Middle-click to close
        tabEl.addEventListener('auxclick', (e) => {
            if (e.button === 1) { // middle click
                e.preventDefault();
                if (_onTabClose && !_onTabClose(i)) return;
                const newIndex = closeTab(i);
                if (newIndex === -1) {
                    const modal = document.getElementById('filePreviewModal');
                    if (modal) modal.classList.remove('active');
                } else if (_onTabChange) {
                    _onTabChange(openTabs[newIndex], newIndex);
                }
            }
        });

        tabBarEl!.appendChild(tabEl);
    });

    // Diff button — only when 2+ tabs are open
    if (openTabs.length >= 2) {
        const diffBtn = document.createElement('button');
        diffBtn.className = 'file-tab file-tab-diff-btn';
        diffBtn.title = 'Compare files (Diff)';
        diffBtn.innerHTML = '<span style="font-size:11px">⇄ Diff</span>';
        diffBtn.style.cssText = 'margin-left: auto; opacity: 0.6; font-size: 11px; border: 1px dashed rgba(139,92,246,0.3);';
        diffBtn.addEventListener('click', () => {
            import('./tab-diff').then(({ openTabDiffSelector }) => openTabDiffSelector());
        });
        diffBtn.addEventListener('mouseenter', () => { diffBtn.style.opacity = '1'; });
        diffBtn.addEventListener('mouseleave', () => { diffBtn.style.opacity = '0.6'; });
        tabBarEl!.appendChild(diffBtn);
    }
}
