// @ts-nocheck
/**
 * Tab diff — side-by-side diff viewer for comparing two open tabs.
 * Uses a simple LCS-based diff algorithm to highlight additions/removals.
 */
import { getOpenTabs, getActiveTabIndex } from './file-tabs';

// ─── Simple LCS diff algorithm ──────────────────────

interface DiffLine {
    type: 'same' | 'add' | 'remove';
    content: string;
    lineNo: number;
}

function computeDiff(a: string[], b: string[]): { left: DiffLine[]; right: DiffLine[] } {
    // Build LCS table
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }

    // Backtrack to find diff
    const left: DiffLine[] = [];
    const right: DiffLine[] = [];
    let i = m, j = n;

    const resultPairs: Array<{ type: 'same' | 'add' | 'remove'; aLine?: string; bLine?: string; aNo?: number; bNo?: number }> = [];

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
            resultPairs.unshift({ type: 'same', aLine: a[i - 1], bLine: b[j - 1], aNo: i, bNo: j });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            resultPairs.unshift({ type: 'add', bLine: b[j - 1], bNo: j });
            j--;
        } else {
            resultPairs.unshift({ type: 'remove', aLine: a[i - 1], aNo: i });
            i--;
        }
    }

    for (const pair of resultPairs) {
        if (pair.type === 'same') {
            left.push({ type: 'same', content: pair.aLine!, lineNo: pair.aNo! });
            right.push({ type: 'same', content: pair.bLine!, lineNo: pair.bNo! });
        } else if (pair.type === 'remove') {
            left.push({ type: 'remove', content: pair.aLine!, lineNo: pair.aNo! });
            right.push({ type: 'same', content: '', lineNo: 0 }); // spacer
        } else {
            left.push({ type: 'same', content: '', lineNo: 0 }); // spacer
            right.push({ type: 'add', content: pair.bLine!, lineNo: pair.bNo! });
        }
    }

    return { left, right };
}

// ─── Diff panel rendering ───────────────────────────

let diffOverlay: HTMLElement | null = null;

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderDiffPanel(leftContent: string, rightContent: string, leftName: string, rightName: string) {
    closeDiffPanel();

    const leftLines = leftContent.split('\n');
    const rightLines = rightContent.split('\n');
    const { left, right } = computeDiff(leftLines, rightLines);

    // Count changes
    const adds = right.filter(l => l.type === 'add').length;
    const removes = left.filter(l => l.type === 'remove').length;

    const overlay = document.createElement('div');
    overlay.className = 'tab-diff-overlay';
    overlay.innerHTML = `
        <div class="tab-diff-container">
            <div class="tab-diff-header">
                <div class="tab-diff-title">
                    <span class="tab-diff-icon">⇄</span>
                    Comparing Files
                    <span class="tab-diff-stats">
                        <span class="tab-diff-stat-add">+${adds}</span>
                        <span class="tab-diff-stat-rm">−${removes}</span>
                    </span>
                </div>
                <button class="tab-diff-close" title="Close diff (Esc)">✕</button>
            </div>
            <div class="tab-diff-names">
                <div class="tab-diff-name tab-diff-name-left">📄 ${escapeHtml(leftName)}</div>
                <div class="tab-diff-name tab-diff-name-right">📄 ${escapeHtml(rightName)}</div>
            </div>
            <div class="tab-diff-body">
                <div class="tab-diff-pane tab-diff-left"></div>
                <div class="tab-diff-divider"></div>
                <div class="tab-diff-pane tab-diff-right"></div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    diffOverlay = overlay;

    const leftPane = overlay.querySelector('.tab-diff-left')!;
    const rightPane = overlay.querySelector('.tab-diff-right')!;

    // Render lines
    const renderLines = (pane: Element, lines: DiffLine[]) => {
        const frag = document.createDocumentFragment();
        for (const line of lines) {
            const el = document.createElement('div');
            el.className = `tab-diff-line tab-diff-${line.type}`;

            const gutter = document.createElement('span');
            gutter.className = 'tab-diff-gutter';
            gutter.textContent = line.lineNo > 0 ? String(line.lineNo) : ' ';
            el.appendChild(gutter);

            const marker = document.createElement('span');
            marker.className = 'tab-diff-marker';
            marker.textContent = line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' ';
            el.appendChild(marker);

            const code = document.createElement('span');
            code.className = 'tab-diff-code';
            code.textContent = line.content;
            el.appendChild(code);

            frag.appendChild(el);
        }
        pane.appendChild(frag);
    };

    renderLines(leftPane, left);
    renderLines(rightPane, right);

    // Sync scroll between panes
    let syncing = false;
    const syncScroll = (source: Element, target: Element) => {
        if (syncing) return;
        syncing = true;
        target.scrollTop = source.scrollTop;
        syncing = false;
    };
    leftPane.addEventListener('scroll', () => syncScroll(leftPane, rightPane));
    rightPane.addEventListener('scroll', () => syncScroll(rightPane, leftPane));

    // Close on button/overlay/Esc
    overlay.querySelector('.tab-diff-close')!.addEventListener('click', closeDiffPanel);
    overlay.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('tab-diff-overlay')) closeDiffPanel();
    });

    const onEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { closeDiffPanel(); document.removeEventListener('keydown', onEsc); }
    };
    document.addEventListener('keydown', onEsc);
}

function closeDiffPanel() {
    if (diffOverlay) {
        diffOverlay.remove();
        diffOverlay = null;
    }
}

// ─── Tab selection UI ───────────────────────────────

export function openTabDiffSelector() {
    const tabs = getOpenTabs();
    if (tabs.length < 2) {
        alert('Open at least 2 files in tabs to compare them.');
        return;
    }

    const activeIdx = getActiveTabIndex();

    // If exactly 2 tabs, diff them immediately
    if (tabs.length === 2) {
        renderDiffPanel(
            tabs[0].originalContent || tabs[0].rendered.full_raw || '',
            tabs[1].originalContent || tabs[1].rendered.full_raw || '',
            tabs[0].name,
            tabs[1].name
        );
        return;
    }

    // More than 2 tabs — show picker for the second file
    const modal = document.createElement('div');
    modal.className = 'tab-diff-picker-overlay';
    modal.innerHTML = `
        <div class="tab-diff-picker">
            <div class="tab-diff-picker-title">Compare "${escapeHtml(tabs[activeIdx].name)}" with:</div>
            <div class="tab-diff-picker-list"></div>
        </div>
    `;

    const list = modal.querySelector('.tab-diff-picker-list')!;
    for (let i = 0; i < tabs.length; i++) {
        if (i === activeIdx) continue;
        const btn = document.createElement('button');
        btn.className = 'tab-diff-picker-item';
        btn.textContent = `📄 ${tabs[i].name}`;
        btn.title = tabs[i].path;
        btn.addEventListener('click', () => {
            modal.remove();
            renderDiffPanel(
                tabs[activeIdx].originalContent || tabs[activeIdx].rendered.full_raw || '',
                tabs[i].originalContent || tabs[i].rendered.full_raw || '',
                tabs[activeIdx].name,
                tabs[i].name
            );
        });
        list.appendChild(btn);
    }

    document.body.appendChild(modal);

    // Close on overlay click or Esc
    modal.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('tab-diff-picker-overlay')) modal.remove();
    });
    const onEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', onEsc); }
    };
    document.addEventListener('keydown', onEsc);
}
