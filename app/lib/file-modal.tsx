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
import { addTab, getOpenTabs, getActiveTab, initTabBar, clearTabs, nextTab, prevTab, onTabChange, onTabCloseRequest, setActiveTab, getSavedTabPaths, type FileTab } from './file-tabs';
import { renderBreadcrumbs } from './breadcrumbs';
import { renderSymbolOutline } from './symbol-outline';
import { loadDraft, clearDraft, startAutoSave, stopAutoSave } from './auto-save';
import { isEditingAllowed, getProductionEditorNotice } from './production-mode';
import { onEditorSync, broadcastEditorSync, type EditorSyncData } from './cursor-sharing';

// ─── File expand modal ──────────────────────────────────
export function openFileModal(ctx: CanvasContext, file: any, initialView?: string, initialLine?: number) {
    const modal = document.getElementById('filePreviewModal');
    const pathEl = document.getElementById('previewFilePath');
    const contentEl = document.getElementById('previewContent');
    const lineCountEl = document.getElementById('previewLineCount');
    const statusEl = document.getElementById('previewFileStatus');
    const tabsEl = document.getElementById('modalViewTabs');
    if (!modal || !pathEl || !contentEl) return;

    renderBreadcrumbs(ctx, pathEl, file.path);
    contentEl.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">Loading...</span>';
    modal.classList.add('active');

    // Initialize tab bar and add file as tab
    initTabBar();
    const tabIndex = addTab(file);

    // Restore previously saved tabs (from last session)
    const saved = getSavedTabPaths();
    if (saved.paths.length > 0) {
        const state = ctx.snap().context;
        for (const savedPath of saved.paths) {
            if (savedPath === file.path) continue; // Already opened
            // Create a minimal file stub — content will be loaded on tab switch
            const stubFile = {
                path: savedPath,
                name: savedPath.split('/').pop() || savedPath,
                content: '',
                lines: 0,
            };
            addTab(stubFile);
        }
        // Re-activate the current file's tab
        setActiveTab(tabIndex);
    }

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
    // Default to edit view — editor is the primary experience
    let currentView = initialView || 'edit';
    let onNavKey: ((e: KeyboardEvent) => void) | null = null;
    let originalContent = file.content || '';

    let editorSyncCleanup: (() => void) | null = null;
    const remoteCursorsMap = new Map<string, EditorSyncData>();
    let typingTimeouts = new Map<string, any>();

    editorSyncCleanup = onEditorSync(data => {
        // use Active Tab's path instead of initial file path incase it switched
        const activeTab = getActiveTab();
        const activePath = activeTab ? activeTab.path : file.path;

        if (data.file === activePath && currentView === 'edit') {
            remoteCursorsMap.set(data.peerId, data);

            if (data.typing) {
                if (typingTimeouts.has(data.peerId)) clearTimeout(typingTimeouts.get(data.peerId));
                typingTimeouts.set(data.peerId, setTimeout(() => {
                    const cursor = remoteCursorsMap.get(data.peerId);
                    if (cursor) {
                        cursor.typing = false;
                        updateRemoteCursors();
                    }
                }, 1000));
            }

            updateRemoteCursors();
        }
    });

    function updateRemoteCursors() {
        const editContainer = document.getElementById('modalEditContainer');
        const editor = (editContainer as any)?._cmEditor;
        if (editor) {
            editor.setRemoteCursors(Array.from(remoteCursorsMap.values()));
        }
    }

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

        if (editorSyncCleanup) {
            editorSyncCleanup();
            editorSyncCleanup = null;
        }

        // Stop auto-save timer
        stopAutoSave();

        // Clear all tabs
        clearTabs();

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
        // Ctrl+Tab / Ctrl+Shift+Tab to cycle tabs
        if (e.key === 'Tab' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            const newIdx = e.shiftKey ? prevTab() : nextTab();
            if (newIdx >= 0) {
                const tab = getOpenTabs()[newIdx];
                if (tab) switchToTab(ctx, tab);
            }
        }
        // Ctrl+Shift+O to toggle outline
        if (e.key === 'o' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
            e.preventDefault();
            toggleOutline();
        }
    }

    function toggleOutline() {
        const panel = document.getElementById('modalOutlinePanel');
        if (!panel) return;
        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : '';
        if (!isVisible) {
            // Render outline with current content
            updateOutline();
        }
    }

    function updateOutline() {
        const panel = document.getElementById('modalOutlinePanel');
        if (!panel || panel.style.display === 'none') return;
        const raw = rendered.full_raw || file.content || '';
        if (!raw) return;
        renderSymbolOutline(panel, raw, file.name || file.path, (line: number) => {
            scrollToLine(line);
        });
    }

    function scrollToLine(line: number) {
        const modalPre = document.getElementById('modalBodyPre');
        if (!modalPre) return;
        // Find the line element or estimate scroll position
        const codeEl = document.getElementById('previewContent');
        if (!codeEl) return;
        const lineHeight = 24; // approximate
        const targetScroll = (line - 1) * lineHeight;
        modalPre.scrollTo({ top: targetScroll, behavior: 'smooth' });
    }

    // Outline toggle button
    const outlineToggle = document.getElementById('outlineToggle');
    if (outlineToggle) {
        const newToggle = outlineToggle.cloneNode(true) as HTMLElement;
        outlineToggle.replaceWith(newToggle);
        newToggle.addEventListener('click', toggleOutline);
    }

    document.addEventListener('keydown', onEsc);
    document.getElementById('closePreview')?.addEventListener('click', closeModal, { once: true });
    modal.querySelector('.modal-backdrop')?.addEventListener('click', closeModal, { once: true });

    // ─── Tab switching helper ─────────────────────────
    function switchToTab(ctx: CanvasContext, tab: FileTab) {
        // Update modal header
        if (pathEl) renderBreadcrumbs(ctx, pathEl, tab.path);
        if (lineCountEl) {
            const lines = tab.rendered.full_raw?.split('\n').length || tab.file.lines || 0;
            lineCountEl.textContent = lines ? `${lines.toLocaleString()} lines` : '';
        }

        // Update status badge
        if (statusEl) {
            const statusColors = { added: '#22c55e', modified: '#eab308', deleted: '#ef4444' };
            const statusLabels = { added: 'ADDED', modified: 'MODIFIED', deleted: 'DELETED' };
            if (tab.file.status && statusColors[tab.file.status]) {
                statusEl.textContent = statusLabels[tab.file.status];
                statusEl.style.display = '';
                statusEl.style.background = statusColors[tab.file.status] + '20';
                statusEl.style.color = statusColors[tab.file.status];
            } else {
                statusEl.style.display = 'none';
            }
        }

        // Destroy existing CodeMirror
        const editContainer = document.getElementById('modalEditContainer');
        const editor = (editContainer as any)?._cmEditor;
        if (editor) { editor.destroy(); (editContainer as any)._cmEditor = null; }
        const cmMount = document.getElementById('cmEditorMount');
        if (cmMount) cmMount.innerHTML = '';

        // Update content
        file = tab.file;
        rendered.full = tab.rendered.full;
        rendered.diff = tab.rendered.diff;
        rendered.full_raw = tab.rendered.full_raw;
        originalContent = tab.originalContent;
        currentView = tab.currentView || 'full';

        // Switch view
        const modalPre = document.getElementById('modalBodyPre');
        const chatContainer = document.getElementById('modalChatContainer');
        const blameContainer = document.getElementById('modalBlameContainer');
        if (editContainer) editContainer.style.display = 'none';
        if (chatContainer) chatContainer.style.display = 'none';
        if (blameContainer) blameContainer.style.display = 'none';

        if (currentView === 'full' && rendered.full) {
            if (modalPre) modalPre.style.display = '';
            contentEl.innerHTML = rendered.full;
            addClickableImports(ctx, contentEl, file.path, rendered.full_raw);
        } else if (currentView === 'diff' && rendered.diff) {
            if (modalPre) modalPre.style.display = '';
            contentEl.innerHTML = rendered.diff;
        } else {
            if (modalPre) modalPre.style.display = '';
            contentEl.innerHTML = rendered.full || '<span style="color: var(--text-muted);">Loading...</span>';
        }

        // Restore scroll
        if (modalPre) {
            requestAnimationFrame(() => {
                modalPre.scrollTop = tab.scrollTop || 0;
            });
        }

        // Update view tabs
        if (tabsEl) {
            tabsEl.querySelectorAll('.modal-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.view === currentView);
            });
        }

        // If content not loaded yet, fetch it
        if (!rendered.full && !rendered.diff) {
            loadTabContent(ctx, tab);
        }
    }

    // Wire up tab change callback
    onTabChange((tab, index) => switchToTab(ctx, tab));
    onTabCloseRequest((index) => {
        // Return false to prevent close if unsaved changes
        return true; // For now, allow close
    });

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
                const editContainer = document.getElementById('modalEditContainer');
                const saveStatus = document.getElementById('modalSaveStatus');

                if (view === 'edit') {
                    activateEditView();
                } else if (view === 'diff') {
                    // Show diff, hide edit
                    if (modalPre) modalPre.style.display = '';
                    if (editContainer) editContainer.style.display = 'none';
                    if (saveStatus) saveStatus.style.display = 'none';
                    if (rendered.diff) {
                        contentEl.innerHTML = rendered.diff;
                    }
                } else {
                    // Fallback: show code, hide edit
                    if (modalPre) modalPre.style.display = '';
                    if (editContainer) editContainer.style.display = 'none';
                    if (saveStatus) saveStatus.style.display = 'none';
                    if (rendered.full) {
                        contentEl.innerHTML = rendered.full;
                        addClickableImports(ctx, contentEl, file.path, rendered.full_raw);
                    }
                }
            });
        });
    }

    // ─── Edit view activation (shared by initial open + tab click) ────
    function activateEditView() {
        const modalPre = document.getElementById('modalBodyPre');
        const editContainer = document.getElementById('modalEditContainer');
        const saveStatus = document.getElementById('modalSaveStatus');

        // Production mode: show read-only notice instead of editor
        if (!isEditingAllowed()) {
            if (modalPre) modalPre.style.display = 'none';
            if (editContainer) {
                editContainer.style.display = 'flex';
                editContainer.innerHTML = getProductionEditorNotice();
            }
            return;
        }

        if (modalPre) modalPre.style.display = 'none';
        if (editContainer) editContainer.style.display = 'flex';
        if (saveStatus) { saveStatus.style.display = ''; saveStatus.textContent = ''; saveStatus.className = 'modal-save-status'; }

        const textarea = document.getElementById('modalEditTextarea') as HTMLTextAreaElement;
        const lineInfo = document.getElementById('editLineInfo');
        const saveBtn = document.getElementById('editSaveBtn');

        // Load current content
        let editContent = rendered.full_raw || file.content || '';
        originalContent = editContent;

        // Check for auto-saved draft
        const repoPath = ctx.snap().context.repoPath;
        let restoredDraft = false;
        if (repoPath && file.path) {
            const draft = loadDraft(repoPath, file.path);
            if (draft && draft.content !== editContent && draft.originalContent === editContent) {
                editContent = draft.content;
                restoredDraft = true;
            }
        }

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
                onSelectionChange: (selections, isTyping) => {
                    const activeTab = getActiveTab();
                    const activePath = activeTab ? activeTab.path : file.path;
                    broadcastEditorSync(activePath, selections, isTyping);
                }
            });

            // Store editor reference for content access
            (editContainer as any)._cmEditor = editor;
            editor.focus();

            // Reapply any known remote cursors for this new view
            updateRemoteCursors();

            // Scroll to initial line if provided (preserves canvas view position)
            if (initialLine && initialLine > 1) {
                requestAnimationFrame(() => {
                    editor.scrollToLine?.(initialLine);
                });
            }

            // Show draft restored notification
            if (restoredDraft && saveStatus) {
                saveStatus.style.display = '';
                saveStatus.innerHTML = '⟳ Draft restored <button id="discardDraft" style="margin-left:8px;background:none;border:1px solid rgba(239,68,68,0.4);color:#ef4444;border-radius:4px;padding:1px 8px;cursor:pointer;font-size:11px">Discard</button>';
                saveStatus.className = 'modal-save-status modified';
                const discardBtn = document.getElementById('discardDraft');
                discardBtn?.addEventListener('click', () => {
                    if (repoPath && file.path) clearDraft(repoPath, file.path);
                    editor.setContent(originalContent);
                    saveStatus.style.display = 'none';
                });
            }

            // Start auto-save for this editor session
            if (repoPath && file.path) {
                startAutoSave(repoPath, file.path, () => editor.getContent(), originalContent);
            }
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

                    // Clear auto-save draft since we saved to disk
                    if (repoPath && file.path) clearDraft(repoPath, file.path);

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
    }


    // Activate the initial edit view immediately
    requestAnimationFrame(() => activateEditView());

    if (hasDiff) {
        rendered.diff = buildModalDiffHTML(file);
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

            // If currently in edit mode, update the CodeMirror editor with fetched content
            if (currentView === 'edit') {
                const editContainer = document.getElementById('modalEditContainer');
                const editor = (editContainer as any)?._cmEditor;
                if (editor && !editor.getContent()) {
                    editor.setContent(content);
                }
            }

            // Sync rendered data to the active tab
            const activeTab = getActiveTab();
            if (activeTab && activeTab.path === file.path) {
                activeTab.rendered = { ...rendered };
                activeTab.originalContent = originalContent;
            }

            // Update outline if visible
            updateOutline();

        } catch (err) {
            measure('modal:fetchError', () => err);
            if (file.content) {
                const ext = file.name?.split('.').pop()?.toLowerCase() || '';
                rendered.full = highlightSyntax(file.content, ext);
                rendered.full_raw = file.content;
            } else {
                contentEl.innerHTML = `<span style="color: var(--error);">Failed to load: ${escapeHtml(err.message)}</span>`;
            }
        }
    });
}


// ─── Load content for a tab (used when switching to an unloaded tab) ──
async function loadTabContent(ctx: CanvasContext, tab: FileTab) {
    const contentEl = document.getElementById('previewContent');
    const lineCountEl = document.getElementById('previewLineCount');
    if (!contentEl) return;

    contentEl.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">Loading...</span>';

    try {
        const state = ctx.snap().context;
        let content = '';

        if (state.currentCommitHash && tab.path) {
            const response = await fetch('/api/repo/file-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: state.repoPath,
                    commit: state.currentCommitHash,
                    filePath: tab.path
                })
            });
            if (response.ok) {
                const data = await response.json();
                content = data.content || '';
            }
        }

        if (!content && tab.file.content) content = tab.file.content;
        if (!content) {
            contentEl.innerHTML = '<span style="color: var(--text-muted);">No content available</span>';
            return;
        }

        const ext = tab.name?.split('.').pop()?.toLowerCase() || '';
        tab.rendered.full = highlightSyntax(content, ext);
        tab.rendered.full_raw = content;
        tab.originalContent = content;

        if (lineCountEl) {
            lineCountEl.textContent = `${content.split('\n').length.toLocaleString()} lines`;
        }

        // Check if this tab is still active
        const activeTab = getActiveTab();
        if (activeTab && activeTab.path === tab.path) {
            contentEl.innerHTML = tab.rendered.full;
            addClickableImports(ctx, contentEl, tab.path, tab.rendered.full_raw);
        }
    } catch (err: any) {
        contentEl.innerHTML = `<span style="color: var(--error);">Failed to load: ${err.message}</span>`;
    }
}

// ─── Blame view ─────────────────────────────────────
const blameCache = new Map<string, any[]>();

const BLAME_COLORS = [
    '#c4b5fd', '#93c5fd', '#86efac', '#fde68a', '#fca5a5',
    '#f9a8d4', '#a5b4fc', '#67e8f9', '#d9f99d', '#fdba74',
];

function getAuthorColor(author: string, authorMap: Map<string, string>): string {
    if (authorMap.has(author)) return authorMap.get(author)!;
    const color = BLAME_COLORS[authorMap.size % BLAME_COLORS.length];
    authorMap.set(author, color);
    return color;
}

function timeAgo(ts: number): string {
    const diff = Date.now() / 1000 - ts;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    if (diff < 2592000) return `${Math.floor(diff / 604800)}w`;
    if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo`;
    return `${Math.floor(diff / 31536000)}y`;
}

async function loadBlameView(ctx: CanvasContext, file: any, container: HTMLElement) {
    const state = ctx.snap().context;
    if (!state.repoPath) return;

    const cacheKey = `${state.repoPath}:${file.path}:${state.currentCommitHash || 'HEAD'}`;

    // Check cache
    if (blameCache.has(cacheKey)) {
        renderBlame(blameCache.get(cacheKey)!, container, file);
        return;
    }

    container.innerHTML = '<div class="blame-loading">Loading blame data...</div>';

    try {
        const res = await fetch('/api/repo/git-blame', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: state.repoPath,
                filePath: file.path,
                commit: state.currentCommitHash || undefined,
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            container.innerHTML = `<div class="blame-error">Blame failed: ${escapeHtml(err)}</div>`;
            return;
        }

        const data = await res.json();
        blameCache.set(cacheKey, data.entries);
        renderBlame(data.entries, container, file);
    } catch (err: any) {
        container.innerHTML = `<div class="blame-error">Error: ${escapeHtml(err.message)}</div>`;
    }
}

function renderBlame(entries: any[], container: HTMLElement, file: any) {
    const authorMap = new Map<string, string>();
    const ext = file.name?.split('.').pop()?.toLowerCase() || '';

    let html = '<div class="blame-scroll"><table class="blame-table"><tbody>';

    let prevHash = '';
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const isNewGroup = e.hash !== prevHash;
        prevHash = e.hash;

        const color = getAuthorColor(e.author, authorMap);
        const authorName = e.author.length > 12 ? e.author.slice(0, 11) + '…' : e.author;
        const age = timeAgo(e.authorTime);
        const escapedContent = escapeHtml(e.content);
        const groupClass = isNewGroup ? ' blame-group-start' : '';

        html += `<tr class="blame-row${groupClass}">`;

        // Blame gutter
        if (isNewGroup) {
            html += `<td class="blame-gutter" style="border-left: 3px solid ${color}">`;
            html += `<span class="blame-hash" title="${escapeHtml(e.summary)}">${e.shortHash}</span>`;
            html += `<span class="blame-author" style="color: ${color}" title="${escapeHtml(e.author)}">${escapeHtml(authorName)}</span>`;
            html += `<span class="blame-age">${age}</span>`;
            html += '</td>';
        } else {
            html += `<td class="blame-gutter blame-gutter-empty" style="border-left: 3px solid ${color}"></td>`;
        }

        // Line number
        html += `<td class="blame-lineno">${e.line}</td>`;

        // Code
        html += `<td class="blame-code"><code>${escapedContent || ' '}</code></td>`;
        html += '</tr>';
    }

    html += '</tbody></table></div>';

    // Author legend
    if (authorMap.size > 1) {
        html += '<div class="blame-legend">';
        for (const [author, color] of authorMap) {
            html += `<span class="blame-legend-item"><span class="blame-legend-dot" style="background:${color}"></span>${escapeHtml(author)}</span>`;
        }
        html += '</div>';
    }

    container.innerHTML = html;
}
