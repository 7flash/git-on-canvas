/**
 * Root Layout — String-based server component (no React)
 *
 * Returns raw HTML string. The `children` prop is the page content as a string.
 * All interactivity is in page.client.tsx.
 */

export default function RootLayout({ children }: { children: string }) {
    return `<html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <meta name="description" content="Git Canvas - Visual Git Repository Explorer with interactive file canvas" />
            <title>Git Canvas — Visual Repository Explorer</title>
            <link
                href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
                rel="stylesheet"
            />
        </head>
        <body>
            <div id="app">
                <nav class="sidebar">
                    <div class="sidebar-header">
                        <div class="logo">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="3" />
                                <circle cx="12" cy="4" r="1.5" />
                                <circle cx="12" cy="20" r="1.5" />
                                <circle cx="4" cy="8" r="1.5" />
                                <circle cx="20" cy="8" r="1.5" />
                                <circle cx="4" cy="16" r="1.5" />
                                <circle cx="20" cy="16" r="1.5" />
                                <path d="M12 7v2M12 15v2M8.5 9.5l-2.5-1M15.5 9.5l2.5-1M8.5 14.5l-2.5 1M15.5 14.5l2.5 1" />
                            </svg>
                            <span>Git Canvas</span>
                        </div>
                    </div>

                    <div class="repo-selector">
                        <div class="input-group">
                            <input type="text" id="repoPath" placeholder="Repository path..." spellcheck="false" />
                            <button id="browseRepo" class="btn-icon" title="Paste from clipboard">
                                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                                    <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                                </svg>
                            </button>
                            <button id="browseFolder" class="btn-icon" title="Browse folder">
                                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                                </svg>
                            </button>
                            <button id="loadRepo" class="btn-primary-sm" title="Load">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                                    <polyline points="9 18 15 12 9 6" />
                                </svg>
                            </button>
                        </div>
                        <input type="file" id="folderPickerInput" webkitdirectory directory style="display:none" />
                    </div>

                    <!-- View mode tabs -->
                    <div class="view-tabs">
                        <button id="modeCommits" class="view-tab active">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="6" r="2" />
                                <circle cx="12" cy="18" r="2" />
                                <path d="M12 8v8" />
                            </svg>
                            Commits
                        </button>
                        <button id="modeAllFiles" class="view-tab">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                            </svg>
                            Files
                        </button>
                    </div>

                    <div class="commit-timeline" id="commitTimeline">
                        <div class="section-header">
                            <span class="section-title">History</span>
                            <span class="badge" id="commitCount">0</span>
                        </div>
                        <div class="timeline-container" id="timelineContainer">
                            <div class="empty-state">
                                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 6v6l4 2" />
                                </svg>
                                <p>Load a repository</p>
                            </div>
                        </div>
                    </div>

                    <div class="sidebar-bottom">
                        <div class="canvas-controls">
                            <div class="control-row">
                                <button id="resetView" class="btn-ghost" title="Reset View">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                        <path d="M3 3v5h5" />
                                    </svg>
                                </button>
                                <button id="fitAll" class="btn-ghost" title="Fit All">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                                    </svg>
                                </button>
                                <div class="zoom-inline">
                                    <input type="range" id="zoomSlider" min="0.1" max="3" step="0.1" value="1" />
                                    <span id="zoomValue">100%</span>
                                </div>
                            </div>
                        </div>

                        <div class="hotkey-legend">
                            <div class="hotkey-row"><kbd>Scroll</kbd> <span>Pan</span></div>
                            <div class="hotkey-row"><kbd>⇧ Scroll</kbd> <span>Pan H</span></div>
                            <div class="hotkey-row"><kbd>⌃ Scroll</kbd> <span>Zoom</span></div>
                            <div class="hotkey-row"><kbd>Del</kbd> <span>Hide</span></div>
                        </div>
                    </div>
                </nav>

                <main class="canvas-area">
                    <div class="canvas-header">
                        <div class="header-left">
                            <div class="current-commit" id="currentCommitInfo">
                                <span class="commit-hash-label">No commit selected</span>
                            </div>
                        </div>
                        <div class="header-right">
                            <button id="toggleChangedFiles" class="btn-ghost btn-sm" title="Show changed files">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                </svg>
                                <span id="fileCount">0</span>
                            </button>
                            <button id="showHidden" class="btn-ghost btn-sm" title="Show hidden files" style="display:none">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                                    <line x1="1" y1="1" x2="23" y2="23" />
                                </svg>
                                <span id="hiddenCount">0</span>
                            </button>
                        </div>
                    </div>

                    ${children}

                    <!-- Changed Files Panel -->
                    <div class="changed-files-panel" id="changedFilesPanel" style="display:none">
                        <div class="panel-header">
                            <span class="panel-title">Changed Files</span>
                            <button id="closeChangedFiles" class="btn-ghost btn-xs" title="Close">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                        <div class="changed-files-list" id="changedFilesList"></div>
                    </div>

                    <div class="minimap-container">
                        <div class="minimap" id="minimap">
                            <div class="minimap-viewport" id="minimapViewport"></div>
                        </div>
                        <button id="expandMinimap" class="btn-ghost btn-xs minimap-expand" title="Expand minimap">
                            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="15 3 21 3 21 9" />
                                <polyline points="9 21 3 21 3 15" />
                                <line x1="21" y1="3" x2="14" y2="10" />
                                <line x1="3" y1="21" x2="10" y2="14" />
                            </svg>
                        </button>
                    </div>
                </main>
            </div>

            <!-- File Preview Modal -->
            <div class="file-preview-modal" id="filePreviewModal">
                <div class="modal-backdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <span class="file-path" id="previewFilePath"></span>
                        <button class="modal-close" id="closePreview">&times;</button>
                    </div>
                    <pre class="modal-body"><code id="previewContent"></code></pre>
                </div>
            </div>
        </body>
    </html>`;
}
