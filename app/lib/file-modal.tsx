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
import { addClickableImports } from './goto-definition';

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
    const rendered = { full: '', diff: '', full_raw: '' };
    // Default to diff view for changed files, full view for unchanged
    let currentView = hasDiff ? 'diff' : 'full';
    let onNavKey: ((e: KeyboardEvent) => void) | null = null;
    let originalContent = file.content || '';

    function hasUnsavedChanges(): boolean {
        if (currentView !== 'edit') return false;
        const editContainer = document.getElementById('modalEditContainer');
        const editor = (editContainer as any)?._cmEditor;
        if (editor) return editor.getContent() !== originalContent;
        const textarea = document.getElementById('modalEditTextarea') as HTMLTextAreaElement;
        return textarea ? textarea.value !== originalContent : false;
    }

    function closeModal(force = false) {
        if (!modal) return;

        // Warn about unsaved changes
        if (!force && hasUnsavedChanges()) {
            if (!confirm('You have unsaved changes. Discard them?')) return;
        }

        modal.classList.remove('active');
        document.removeEventListener('keydown', onEsc);
        if (onNavKey) document.removeEventListener('keydown', onNavKey);

        // Reset edit state
        const editContainer = document.getElementById('modalEditContainer');
        const saveStatus = document.getElementById('modalSaveStatus');
        const commitSection = document.getElementById('editCommitSection');

        // Destroy CodeMirror editor
        const editor = (editContainer as any)?._cmEditor;
        if (editor) { editor.destroy(); (editContainer as any)._cmEditor = null; }
        const cmMount = document.getElementById('cmEditorMount');
        if (cmMount) cmMount.innerHTML = '';

        if (editContainer) editContainer.style.display = 'none';
        if (saveStatus) { saveStatus.style.display = 'none'; saveStatus.className = 'modal-save-status'; }
        if (commitSection) commitSection.style.display = 'none';

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

                // Warn when leaving edit mode with unsaved changes
                if (currentView === 'edit' && hasUnsavedChanges()) {
                    if (!confirm('You have unsaved changes. Discard them?')) return;
                }
                currentView = view;
                tabs.forEach(t => t.classList.toggle('active', t.dataset.view === view));

                const modalPre = document.getElementById('modalBodyPre');
                const chatContainer = document.getElementById('modalChatContainer');
                const editContainer = document.getElementById('modalEditContainer');
                const saveStatus = document.getElementById('modalSaveStatus');

                if (view === 'chat') {
                    // Show chat, hide code + edit
                    if (modalPre) modalPre.style.display = 'none';
                    if (chatContainer) chatContainer.style.display = 'flex';
                    if (editContainer) editContainer.style.display = 'none';
                    if (saveStatus) saveStatus.style.display = 'none';
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
                } else if (view === 'edit') {
                    // Show edit mode
                    if (modalPre) modalPre.style.display = 'none';
                    if (chatContainer) chatContainer.style.display = 'none';
                    if (editContainer) editContainer.style.display = 'flex';
                    if (saveStatus) { saveStatus.style.display = ''; saveStatus.textContent = ''; saveStatus.className = 'modal-save-status'; }

                    const textarea = document.getElementById('modalEditTextarea') as HTMLTextAreaElement;
                    const lineInfo = document.getElementById('editLineInfo');
                    const saveBtn = document.getElementById('editSaveBtn');

                    // Load current content
                    const editContent = rendered.full_raw || file.content || '';
                    originalContent = editContent;

                    // Hide textarea (CodeMirror replaces it)
                    if (textarea) textarea.style.display = 'none';

                    // Mount CodeMirror into the edit container
                    let editorMountEl = document.getElementById('cmEditorMount');
                    if (!editorMountEl) {
                        editorMountEl = document.createElement('div');
                        editorMountEl.id = 'cmEditorMount';
                        editorMountEl.className = 'cm-editor-mount';
                        // Insert before the toolbar
                        const toolbar = document.getElementById('modalEditToolbar');
                        if (toolbar && editContainer) {
                            editContainer.insertBefore(editorMountEl, toolbar);
                        } else if (editContainer) {
                            editContainer.appendChild(editorMountEl);
                        }
                    }
                    editorMountEl.innerHTML = '';

                    // Create CodeMirror editor
                    const ext = file.name?.split('.').pop()?.toLowerCase() || '';
                    import('./code-editor').then(({ createCodeEditor }) => {
                        const editor = createCodeEditor(editorMountEl!, editContent, ext, {
                            onSave: () => saveFile(),
                            onChange: (content) => {
                                // Show modified indicator
                                if (saveStatus && content !== originalContent) {
                                    saveStatus.style.display = '';
                                    saveStatus.textContent = '● Modified';
                                    saveStatus.className = 'modal-save-status modified';
                                } else if (saveStatus && content === originalContent) {
                                    saveStatus.style.display = 'none';
                                }
                            },
                            onCursorMove: (line, col) => {
                                if (lineInfo) lineInfo.textContent = `Line ${line}, Col ${col}`;
                            },
                        });

                        // Store editor reference for content access
                        (editContainer as any)._cmEditor = editor;
                        editor.focus();
                    });

                    // Save handler
                    const saveFile = async () => {
                        const editor = (editContainer as any)?._cmEditor;
                        const content = editor ? editor.getContent() : textarea?.value || '';
                        const state = ctx.snap().context;
                        const repoPath = state.repoPath;
                        if (!repoPath) {
                            if (saveStatus) { saveStatus.style.display = ''; saveStatus.textContent = 'No repo path'; saveStatus.className = 'modal-save-status error'; }
                            return;
                        }

                        if (saveStatus) { saveStatus.style.display = ''; saveStatus.textContent = 'Saving...'; saveStatus.className = 'modal-save-status saving'; }

                        try {
                            const res = await fetch('/api/repo/file-save', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    path: repoPath,
                                    filePath: file.path,
                                    content,
                                }),
                            });
                            if (res.ok) {
                                const data = await res.json();
                                originalContent = content;
                                // Update the in-memory file data
                                file.content = content;
                                file.lines = data.lines;
                                if (saveStatus) { saveStatus.style.display = ''; saveStatus.textContent = `✓ Saved (${data.lines} lines)`; saveStatus.className = 'modal-save-status saved'; }
                                // Also update the rendered full view for when they switch back
                                const ext = file.name?.split('.').pop()?.toLowerCase() || '';
                                rendered.full = highlightSyntax(content, ext);
                                rendered.full_raw = content;

                                // Show commit section after save
                                const commitSection = document.getElementById('editCommitSection');
                                const commitInput = document.getElementById('editCommitMsg') as HTMLInputElement;
                                const commitBtn = document.getElementById('editCommitBtn');
                                const commitCancel = document.getElementById('editCommitCancel');

                                if (commitSection && commitInput) {
                                    commitSection.style.display = 'flex';
                                    const fileName = file.name || file.path?.split('/').pop() || 'file';
                                    commitInput.value = `edit: ${fileName}`;
                                    commitInput.focus();
                                    commitInput.select();

                                    const doCommit = async () => {
                                        const msg = commitInput.value.trim();
                                        if (!msg) { commitInput.focus(); return; }
                                        if (saveStatus) { saveStatus.style.display = ''; saveStatus.textContent = 'Committing...'; saveStatus.className = 'modal-save-status saving'; }
                                        try {
                                            const cRes = await fetch('/api/repo/git-commit', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    path: repoPath,
                                                    filePath: file.path,
                                                    message: msg,
                                                }),
                                            });
                                            if (cRes.ok) {
                                                const cData = await cRes.json();
                                                const shortHash = cData.hash ? cData.hash.substring(0, 7) : '';
                                                if (saveStatus) { saveStatus.style.display = ''; saveStatus.textContent = `✓ Committed ${shortHash}`; saveStatus.className = 'modal-save-status saved'; }
                                                commitSection.style.display = 'none';
                                                setTimeout(() => { if (saveStatus?.textContent?.startsWith('✓')) { saveStatus.style.display = 'none'; } }, 4000);
                                            } else {
                                                const err = await cRes.text();
                                                if (saveStatus) { saveStatus.style.display = ''; saveStatus.textContent = `Commit err: ${err}`; saveStatus.className = 'modal-save-status error'; }
                                            }
                                        } catch (err: any) {
                                            if (saveStatus) { saveStatus.style.display = ''; saveStatus.textContent = `Commit err: ${err.message}`; saveStatus.className = 'modal-save-status error'; }
                                        }
                                    };

                                    // Wire commit button
                                    if (commitBtn) {
                                        const newCommitBtn = commitBtn.cloneNode(true) as HTMLElement;
                                        commitBtn.replaceWith(newCommitBtn);
                                        newCommitBtn.addEventListener('click', doCommit);
                                    }

                                    // Enter key in input triggers commit
                                    commitInput.addEventListener('keydown', (e) => {
                                        if (e.key === 'Enter') { e.preventDefault(); doCommit(); }
                                        if (e.key === 'Escape') { commitSection.style.display = 'none'; editor?.focus(); }
                                    });

                                    // Cancel button
                                    if (commitCancel) {
                                        const newCancelBtn = commitCancel.cloneNode(true) as HTMLElement;
                                        commitCancel.replaceWith(newCancelBtn);
                                        newCancelBtn.addEventListener('click', () => { commitSection.style.display = 'none'; editor?.focus(); });
                                    }
                                }

                                // Fade out save status after 3s (only if no commit action is pending)
                                setTimeout(() => { if (saveStatus?.textContent?.startsWith('✓ Saved')) { saveStatus.style.display = 'none'; } }, 3000);
                            } else {
                                const err = await res.text();
                                if (saveStatus) { saveStatus.style.display = ''; saveStatus.textContent = `Error: ${err}`; saveStatus.className = 'modal-save-status error'; }
                            }
                        } catch (err: any) {
                            if (saveStatus) { saveStatus.style.display = ''; saveStatus.textContent = `Error: ${err.message}`; saveStatus.className = 'modal-save-status error'; }
                        }
                    };

                    if (saveBtn) {
                        const newSaveBtn = saveBtn.cloneNode(true) as HTMLElement;
                        saveBtn.replaceWith(newSaveBtn);
                        newSaveBtn.addEventListener('click', saveFile);
                    }
                } else {
                    // Show code, hide chat + edit
                    if (modalPre) modalPre.style.display = '';
                    if (chatContainer) chatContainer.style.display = 'none';
                    if (editContainer) editContainer.style.display = 'none';
                    if (saveStatus) saveStatus.style.display = 'none';
                    if (view === 'diff' && rendered.diff) {
                        contentEl.innerHTML = rendered.diff;
                    } else if (view === 'full' && rendered.full) {
                        contentEl.innerHTML = rendered.full;
                        addClickableImports(ctx, contentEl, file.path, rendered.full_raw);
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
            rendered.full_raw = content;
            originalContent = content;

            if (currentView === 'full') {
                contentEl.innerHTML = rendered.full;
                addClickableImports(ctx, contentEl, file.path, rendered.full_raw);
            }

        } catch (err) {
            measure('modal:fetchError', () => err);
            if (file.content) {
                const ext = file.name?.split('.').pop()?.toLowerCase() || '';
                rendered.full = highlightSyntax(file.content, ext);
                rendered.full_raw = file.content;
                if (currentView === 'full') {
                    contentEl.innerHTML = rendered.full;
                    addClickableImports(ctx, contentEl, file.path, rendered.full_raw);
                }
            } else {
                contentEl.innerHTML = `<span style="color: var(--error);">Failed to load: ${escapeHtml(err.message)}</span>`;
            }
        }
    });
}
