// @ts-nocheck
/**
 * File expand modal — fullscreen file preview with diff/full/chat views.
 * Extracted from cards.tsx for modularity.
 */
import { measure } from 'measure-fn';
import type { CanvasContext } from './context';
import { escapeHtml } from './utils';
import { highlightSyntax, buildModalDiffHTML } from './syntax';
import { openFileChatInModal } from './chat';

// ─── File expand modal ──────────────────────────────────
export function openFileModal(ctx: CanvasContext, file: any) {
    const modal = document.getElementById('filePreviewModal');
    const pathEl = document.getElementById('previewFilePath');
    const contentEl = document.getElementById('previewContent');
    const lineCountEl = document.getElementById('previewLineCount');
    const statusEl = document.getElementById('previewFileStatus');
    const tabsEl = document.getElementById('modalViewTabs');
    if (!modal || !pathEl || !contentEl) return;

    pathEl.textContent = file.path;
    contentEl.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">Loading...</span>';
    modal.classList.add('active');

    if (statusEl) {
        const statusColors = { added: '#22c55e', modified: '#eab308', deleted: '#ef4444' };
        const statusLabels = { added: 'ADDED', modified: 'MODIFIED', deleted: 'DELETED' };
        if (file.status && statusColors[file.status]) {
            statusEl.textContent = statusLabels[file.status];
            statusEl.style.display = '';
            statusEl.style.background = statusColors[file.status] + '20';
            statusEl.style.color = statusColors[file.status];
        } else {
            statusEl.style.display = 'none';
        }
    }

    if (lineCountEl) {
        lineCountEl.textContent = file.lines ? `${file.lines.toLocaleString()} lines` : '';
    }

    const hasDiff = !!(file.status && (file.hunks?.length > 0 || file.content));
    const rendered = { full: '', diff: '' };
    // Default to diff view for changed files, full view for unchanged
    let currentView = hasDiff ? 'diff' : 'full';
    let onNavKey: ((e: KeyboardEvent) => void) | null = null;

    function closeModal() {
        if (!modal) return;
        modal.classList.remove('active');
        document.removeEventListener('keydown', onEsc);
        if (onNavKey) document.removeEventListener('keydown', onNavKey);

        if (tabsEl) {
            tabsEl.querySelectorAll('.modal-tab').forEach(t => {
                t.replaceWith(t.cloneNode(true));
            });
        }
    }

    function onEsc(e: KeyboardEvent) {
        if (e.key === 'Escape') closeModal();
    }

    document.addEventListener('keydown', onEsc);
    document.getElementById('closePreview')?.addEventListener('click', closeModal, { once: true });
    modal.querySelector('.modal-backdrop')?.addEventListener('click', closeModal, { once: true });

    // Diff navigation setup
    const changedFiles = (ctx.allFilesData || []).filter(f => f.status);
    const navEl = document.getElementById('modalDiffNav');

    if (navEl && changedFiles.length > 1) {
        navEl.style.display = 'flex';
        const currentIndex = changedFiles.findIndex(f => f.path === file.path);

        const prevBtn = document.getElementById('diffNavPrev');
        const nextBtn = document.getElementById('diffNavNext');

        if (prevBtn && nextBtn) {
            const newPrev = prevBtn.cloneNode(true) as HTMLElement;
            const newNext = nextBtn.cloneNode(true) as HTMLElement;
            prevBtn.replaceWith(newPrev);
            nextBtn.replaceWith(newNext);

            const handlePrev = () => {
                const targetIdx = currentIndex > 0 ? currentIndex - 1 : changedFiles.length - 1;
                closeModal();
                setTimeout(() => openFileModal(ctx, changedFiles[targetIdx]), 50);
            };

            const handleNext = () => {
                const targetIdx = currentIndex < changedFiles.length - 1 ? currentIndex + 1 : 0;
                closeModal();
                setTimeout(() => openFileModal(ctx, changedFiles[targetIdx]), 50);
            };

            newPrev.addEventListener('click', handlePrev);
            newNext.addEventListener('click', handleNext);

            onNavKey = (e: KeyboardEvent) => {
                if (modal!.classList.contains('active') && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                    if (e.key === 'j') handleNext();
                    if (e.key === 'k') handlePrev();
                }
            };
            document.addEventListener('keydown', onNavKey);
        }
    } else if (navEl) {
        navEl.style.display = 'none';
        const prevBtn = document.getElementById('diffNavPrev');
        const nextBtn = document.getElementById('diffNavNext');
        if (prevBtn) prevBtn.replaceWith(prevBtn.cloneNode(true));
        if (nextBtn) nextBtn.replaceWith(nextBtn.cloneNode(true));
    }

    if (tabsEl) {
        const tabs = tabsEl.querySelectorAll('.modal-tab');
        tabs.forEach(tab => {
            if (tab.dataset.view === 'diff') {
                tab.style.display = hasDiff ? '' : 'none';
            }
            tab.classList.toggle('active', tab.dataset.view === currentView);
        });

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const view = tab.dataset.view;
                if (view === currentView) return;
                currentView = view;
                tabs.forEach(t => t.classList.toggle('active', t.dataset.view === view));

                const modalPre = document.getElementById('modalBodyPre');
                const chatContainer = document.getElementById('modalChatContainer');

                if (view === 'chat') {
                    // Show chat, hide code
                    if (modalPre) modalPre.style.display = 'none';
                    if (chatContainer) chatContainer.style.display = 'flex';
                    // Build diff text for context
                    let diffText = '';
                    if (file.hunks) {
                        diffText = file.hunks.map(h => {
                            return h.lines.map(l => {
                                const prefix = l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' ';
                                return prefix + l.content;
                            }).join('\n');
                        }).join('\n');
                    }
                    openFileChatInModal(file.path, file.content || '', file.status || '', diffText);
                } else {
                    // Show code, hide chat
                    if (modalPre) modalPre.style.display = '';
                    if (chatContainer) chatContainer.style.display = 'none';
                    if (view === 'diff' && rendered.diff) {
                        contentEl.innerHTML = rendered.diff;
                    } else if (view === 'full' && rendered.full) {
                        contentEl.innerHTML = rendered.full;
                    }
                }
            });
        });
    }

    if (hasDiff) {
        rendered.diff = buildModalDiffHTML(file);
        // If defaulting to diff view, show it immediately
        if (currentView === 'diff') {
            contentEl.innerHTML = rendered.diff;
        }
    }

    measure('modal:fetchContent', async () => {
        try {
            const state = ctx.snap().context;
            let content = '';

            if (state.currentCommitHash && file.path) {
                const response = await fetch('/api/repo/file-content', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        path: state.repoPath,
                        commit: state.currentCommitHash,
                        filePath: file.path
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    content = data.content || '';
                }
            }

            if (!content && file.content) {
                content = file.content;
            }

            if (!content) {
                contentEl.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">No content available</span>';
                return;
            }

            const lineCount = content.split('\n').length;
            if (lineCountEl) {
                lineCountEl.textContent = `${lineCount.toLocaleString()} lines`;
            }

            const ext = file.name?.split('.').pop()?.toLowerCase() || '';
            rendered.full = highlightSyntax(content, ext);

            if (currentView === 'full') {
                contentEl.innerHTML = rendered.full;
            }

        } catch (err) {
            measure('modal:fetchError', () => err);
            if (file.content) {
                const ext = file.name?.split('.').pop()?.toLowerCase() || '';
                rendered.full = highlightSyntax(file.content, ext);
                if (currentView === 'full') {
                    contentEl.innerHTML = rendered.full;
                }
            } else {
                contentEl.innerHTML = `<span style="color: var(--error);">Failed to load: ${escapeHtml(err.message)}</span>`;
            }
        }
    });
}
