// @ts-nocheck
/**
 * Branch Comparison — UI and logic for comparing two branches.
 *
 * Adds a "Compare" button to the canvas header. When clicked, opens
 * a branch picker drawer where the user selects base and compare branches.
 * On submit, fetches the diff from /api/repo/branch-diff and renders
 * the changed files as diff cards on the canvas.
 *
 * Architecture:
 * - Reuses the existing commit diff rendering (renderFilesOnCanvas)
 * - Branch list is fetched from the API response
 * - UI is a slide-out drawer with glassmorphism styling
 */

import type { CanvasContext } from './context';
import { showToast } from './utils';

let _drawer: HTMLElement | null = null;
let _isOpen = false;
let _branches: string[] = [];
let _currentBase = '';
let _currentCompare = '';

// ─── UI: Compare Button ──────────────────────────────────

/**
 * Initialize the branch comparison feature.
 * Adds a "Compare" button to the canvas header.
 */
export function initBranchCompare(ctx: CanvasContext) {
    const headerActions = document.querySelector('.header-actions');
    if (!headerActions) return;

    const btn = document.createElement('button');
    btn.className = 'btn-secondary btn-sm';
    btn.id = 'branchCompareBtn';
    btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/>
            <path d="M13 6h3a2 2 0 0 1 2 2v7"/>
            <path d="M6 9v12"/>
        </svg>
        Compare
    `;
    btn.onclick = () => toggleDrawer(ctx);
    headerActions.insertBefore(btn, headerActions.firstChild);
}

// ─── UI: Branch Picker Drawer ────────────────────────────

function ensureDrawer(): HTMLElement {
    if (_drawer) return _drawer;

    _drawer = document.createElement('div');
    _drawer.id = 'branchCompareDrawer';
    _drawer.style.cssText = `
        position: fixed;
        top: 0;
        right: -400px;
        width: 380px;
        height: 100vh;
        z-index: 999;
        background: rgba(12, 12, 20, 0.95);
        backdrop-filter: blur(20px);
        border-left: 1px solid rgba(124, 58, 237, 0.25);
        box-shadow: -8px 0 32px rgba(0, 0, 0, 0.5), -2px 0 12px rgba(124, 58, 237, 0.1);
        transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        flex-direction: column;
        font-family: system-ui, -apple-system, sans-serif;
    `;
    document.body.appendChild(_drawer);
    return _drawer;
}

function toggleDrawer(ctx: CanvasContext) {
    const drawer = ensureDrawer();
    _isOpen = !_isOpen;

    if (_isOpen) {
        renderDrawerContent(ctx, drawer);
        fetchBranches(ctx);
        requestAnimationFrame(() => {
            drawer.style.right = '0px';
        });
    } else {
        drawer.style.right = '-400px';
    }
}

async function fetchBranches(ctx: CanvasContext) {
    const state = ctx.snap().context;
    if (!state.repoPath) return;

    try {
        const resp = await fetch('/api/repo/branch-diff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: state.repoPath,
                base: 'HEAD',
                compare: 'HEAD',
            }),
        });
        const data = await resp.json();
        if (data.branches) {
            _branches = data.branches;
            updateBranchSelects();
        }
    } catch (e) {
        console.error('[branch-compare] fetch branches error:', e);
    }
}

function updateBranchSelects() {
    const baseSelect = document.getElementById('branchBase') as HTMLSelectElement;
    const compareSelect = document.getElementById('branchCompare') as HTMLSelectElement;
    if (!baseSelect || !compareSelect) return;

    const buildOptions = (select: HTMLSelectElement, defaultVal: string) => {
        select.innerHTML = '';
        for (const b of _branches) {
            const opt = document.createElement('option');
            opt.value = b;
            opt.textContent = b;
            if (b === defaultVal || (!defaultVal && b.includes('main') || b.includes('master'))) {
                opt.selected = true;
            }
            select.appendChild(opt);
        }
    };

    // Default: base = main/master, compare = current branch (or first non-main)
    const mainBranch = _branches.find(b => b === 'main' || b === 'master') || _branches[0] || '';
    const compareBranch = _branches.find(b => b.startsWith('* '))?.replace('* ', '')
        || _branches.find(b => b !== mainBranch)
        || _branches[0] || '';

    buildOptions(baseSelect, _currentBase || mainBranch);
    buildOptions(compareSelect, _currentCompare || compareBranch);
}

function renderDrawerContent(ctx: CanvasContext, drawer: HTMLElement) {
    drawer.innerHTML = `
        <div style="padding:16px 20px;border-bottom:1px solid rgba(124,58,237,0.15);display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:10px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(124,58,237,0.8)" stroke-width="2">
                    <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/>
                    <path d="M13 6h3a2 2 0 0 1 2 2v7"/>
                    <path d="M6 9v12"/>
                </svg>
                <span style="font-size:14px;font-weight:600;color:#e2e8f0;">Branch Comparison</span>
            </div>
            <button id="branchCompareClose" style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:18px;padding:4px 8px;border-radius:4px;"
                onmouseover="this.style.color='#fff';this.style.background='rgba(255,255,255,0.08)'"
                onmouseout="this.style.color='rgba(255,255,255,0.4)';this.style.background='none'">✕</button>
        </div>

        <div style="padding:20px;display:flex;flex-direction:column;gap:16px;">
            <div style="display:flex;flex-direction:column;gap:6px;">
                <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:rgba(255,255,255,0.4);">Base Branch</label>
                <select id="branchBase" style="
                    padding:9px 12px;
                    background:rgba(255,255,255,0.05);
                    border:1px solid rgba(124,58,237,0.2);
                    border-radius:8px;
                    color:#e2e8f0;
                    font-size:13px;
                    font-family:'JetBrains Mono',monospace;
                    cursor:pointer;
                    outline:none;
                    transition:border-color 0.15s;
                " onfocus="this.style.borderColor='rgba(124,58,237,0.5)'" onblur="this.style.borderColor='rgba(124,58,237,0.2)'">
                    <option value="">Loading branches…</option>
                </select>
            </div>

            <div style="display:flex;align-items:center;justify-content:center;gap:8px;">
                <div style="flex:1;height:1px;background:rgba(124,58,237,0.15);"></div>
                <button id="branchSwap" style="
                    background:rgba(124,58,237,0.1);
                    border:1px solid rgba(124,58,237,0.2);
                    border-radius:50%;
                    width:32px;height:32px;
                    display:flex;align-items:center;justify-content:center;
                    cursor:pointer;color:rgba(124,58,237,0.6);
                    transition:all 0.15s;
                " title="Swap branches"
                onmouseover="this.style.background='rgba(124,58,237,0.2)';this.style.color='rgba(124,58,237,0.9)'"
                onmouseout="this.style.background='rgba(124,58,237,0.1)';this.style.color='rgba(124,58,237,0.6)'">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
                    </svg>
                </button>
                <div style="flex:1;height:1px;background:rgba(124,58,237,0.15);"></div>
            </div>

            <div style="display:flex;flex-direction:column;gap:6px;">
                <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:rgba(255,255,255,0.4);">Compare Branch</label>
                <select id="branchCompare" style="
                    padding:9px 12px;
                    background:rgba(255,255,255,0.05);
                    border:1px solid rgba(124,58,237,0.2);
                    border-radius:8px;
                    color:#e2e8f0;
                    font-size:13px;
                    font-family:'JetBrains Mono',monospace;
                    cursor:pointer;
                    outline:none;
                    transition:border-color 0.15s;
                " onfocus="this.style.borderColor='rgba(124,58,237,0.5)'" onblur="this.style.borderColor='rgba(124,58,237,0.2)'">
                    <option value="">Loading branches…</option>
                </select>
            </div>

            <button id="branchDiffRun" style="
                padding:11px 16px;
                background:linear-gradient(135deg, rgba(124,58,237,0.8), rgba(168,85,247,0.8));
                border:1px solid rgba(124,58,237,0.4);
                border-radius:8px;
                color:white;
                font-size:13px;
                font-weight:600;
                cursor:pointer;
                transition:all 0.2s;
                box-shadow:0 2px 12px rgba(124,58,237,0.25);
                letter-spacing:0.02em;
            "
            onmouseover="this.style.boxShadow='0 4px 20px rgba(124,58,237,0.4)';this.style.transform='translateY(-1px)'"
            onmouseout="this.style.boxShadow='0 2px 12px rgba(124,58,237,0.25)';this.style.transform='none'">
                Compare Branches
            </button>
        </div>

        <div id="branchDiffResult" style="flex:1;overflow-y:auto;padding:0 20px 20px;"></div>
    `;

    // Wire up events
    drawer.querySelector('#branchCompareClose')!.addEventListener('click', () => toggleDrawer(ctx));

    drawer.querySelector('#branchSwap')!.addEventListener('click', () => {
        const baseSelect = document.getElementById('branchBase') as HTMLSelectElement;
        const compareSelect = document.getElementById('branchCompare') as HTMLSelectElement;
        const tmp = baseSelect.value;
        baseSelect.value = compareSelect.value;
        compareSelect.value = tmp;
    });

    drawer.querySelector('#branchDiffRun')!.addEventListener('click', () => runComparison(ctx));
}

// ─── Run Comparison ──────────────────────────────────────

async function runComparison(ctx: CanvasContext) {
    const baseSelect = document.getElementById('branchBase') as HTMLSelectElement;
    const compareSelect = document.getElementById('branchCompare') as HTMLSelectElement;
    const resultDiv = document.getElementById('branchDiffResult')!;
    const runBtn = document.getElementById('branchDiffRun') as HTMLButtonElement;

    const base = baseSelect.value;
    const compare = compareSelect.value;

    if (!base || !compare) {
        showToast('Select both branches', 'error');
        return;
    }

    if (base === compare) {
        showToast('Select different branches', 'error');
        return;
    }

    _currentBase = base;
    _currentCompare = compare;

    // Loading state
    runBtn.disabled = true;
    runBtn.textContent = 'Loading…';
    resultDiv.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;padding:40px 0;color:rgba(255,255,255,0.3);">
            <div style="width:24px;height:24px;border:2px solid rgba(124,58,237,0.3);border-top-color:rgba(124,58,237,0.8);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
            <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        </div>
    `;

    try {
        const state = ctx.snap().context;
        const resp = await fetch('/api/repo/branch-diff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: state.repoPath, base, compare }),
        });

        if (!resp.ok) throw new Error(await resp.text());

        const data = await resp.json();

        // Render result summary in the drawer
        renderDiffSummary(ctx, resultDiv, data);

        // Render diff files on the canvas
        if (data.files && data.files.length > 0) {
            ctx.commitFilesData = data.files;
            ctx.changedFilePaths = new Set(data.files.map((f: any) => f.path));

            // Import renderFilesOnCanvas dynamically to avoid circular deps
            const { renderFilesOnCanvas, populateChangedFilesPanel } = await import('./repo');
            renderFilesOnCanvas(ctx, data.files, `${base}...${compare}`);
            populateChangedFilesPanel(data.files);

            // Update header info
            const commitInfo = document.getElementById('commitInfo');
            if (commitInfo) {
                commitInfo.innerHTML = `
                    <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--accent-tertiary);background:var(--bg-elevated);padding:4px 10px;border-radius:4px;">
                        ${base.substring(0, 12)} → ${compare.substring(0, 12)}
                    </span>
                    <span style="font-size:0.85rem;color:var(--text-primary);">
                        ${data.totalChanged} files changed
                    </span>
                `;
            }

            showToast(`Comparing ${base} → ${compare}: ${data.totalChanged} files`, 'success');
        } else {
            showToast('No differences found between branches', 'info');
        }
    } catch (err: any) {
        resultDiv.innerHTML = `
            <div style="padding:16px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:8px;color:#f87171;font-size:12px;">
                ${err.message}
            </div>
        `;
        showToast(`Branch diff failed: ${err.message}`, 'error');
    } finally {
        runBtn.disabled = false;
        runBtn.textContent = 'Compare Branches';
    }
}

// ─── Diff Summary in Drawer ──────────────────────────────

function renderDiffSummary(ctx: CanvasContext, container: HTMLElement, data: any) {
    const { files, totalChanged, stats, base, compare } = data;

    const statusCounts: Record<string, number> = {};
    for (const f of files) {
        statusCounts[f.status] = (statusCounts[f.status] || 0) + 1;
    }

    const statusColors: Record<string, string> = {
        added: '#22c55e',
        modified: '#eab308',
        deleted: '#ef4444',
        renamed: '#a78bfa',
        copied: '#60a5fa',
    };

    const statusBadges = Object.entries(statusCounts)
        .map(([status, count]) => `
            <span style="
                display:inline-flex;align-items:center;gap:4px;
                padding:3px 8px;border-radius:4px;font-size:10px;font-weight:600;
                background:${statusColors[status] || '#888'}18;
                color:${statusColors[status] || '#888'};
                border:1px solid ${statusColors[status] || '#888'}33;
            ">${count} ${status}</span>
        `).join('');

    container.innerHTML = `
        <div style="margin-top:4px;display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="font-size:18px;font-weight:700;color:#e2e8f0;">${totalChanged}</span>
                <span style="font-size:12px;color:rgba(255,255,255,0.4);">files changed</span>
                ${stats ? `
                    <span style="font-size:11px;color:#4ade80;font-family:monospace;">+${stats.totalAdd}</span>
                    <span style="font-size:11px;color:#f87171;font-family:monospace;">-${stats.totalDel}</span>
                ` : ''}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">${statusBadges}</div>
            <div style="max-height:calc(100vh - 400px);overflow-y:auto;">
                ${files.map((f: any) => `
                    <div style="
                        display:flex;align-items:center;gap:8px;
                        padding:7px 10px;margin-bottom:2px;
                        border-radius:6px;cursor:pointer;
                        transition:background 0.15s;
                    " 
                    onmouseover="this.style.background='rgba(255,255,255,0.04)'"
                    onmouseout="this.style.background='none'"
                    data-path="${f.path}">
                        <span style="
                            width:6px;height:6px;border-radius:50%;flex-shrink:0;
                            background:${statusColors[f.status] || '#888'};
                        "></span>
                        <span style="font-size:12px;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-family:'JetBrains Mono',monospace;">
                            ${f.name}
                        </span>
                        <span style="font-size:10px;color:rgba(255,255,255,0.25);flex-shrink:0;">${f.status}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // File click → scroll canvas to that card
    container.querySelectorAll('[data-path]').forEach(el => {
        el.addEventListener('click', () => {
            const path = el.getAttribute('data-path');
            if (!path) return;
            const card = document.querySelector(`.file-card[data-path="${path}"]`) as HTMLElement;
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.6), var(--shadow-lg)';
                setTimeout(() => { card.style.boxShadow = ''; }, 2000);
            }
        });
    });
}
