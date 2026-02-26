/**
 * Root Layout — JSX server component
 *
 * Returns proper JSX elements. The `children` prop is the page content as JSX.
 * All interactivity is in page.client.tsx.
 */

export default function RootLayout({ children }: { children: any }) {
    return (
        <html lang="en">
            <head>
                <meta charSet="UTF-8" />
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
                    <nav className="sidebar">
                        <div className="sidebar-header">
                            <div className="logo">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
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

                        <div className="repo-selector">
                            <div className="input-group">
                                <input type="text" id="repoPath" placeholder="Repository path..." spellCheck={false} />
                                <button id="browseRepo" className="btn-icon" title="Paste from clipboard">
                                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                                        <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                                    </svg>
                                </button>
                                <button id="browseFolder" className="btn-icon" title="Browse folder">
                                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                                    </svg>
                                </button>
                                <button id="loadRepo" className="btn-primary-sm" title="Load">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                </button>
                            </div>
                            <input type="file" id="folderPickerInput" style={{ display: 'none' }} />
                        </div>

                        {/* View mode */}
                        <div className="view-tabs">
                            <button id="modeCommits" className="view-tab active">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="6" r="2" />
                                    <circle cx="12" cy="18" r="2" />
                                    <path d="M12 8v8" />
                                </svg>
                                Commits
                            </button>
                            <label className="view-toggle" id="allFilesToggle" title="Show all repository files — changed files display their diffs">
                                <input type="checkbox" id="allFilesCheckbox" />
                                <span className="toggle-track">
                                    <span className="toggle-thumb"></span>
                                </span>
                                <span className="toggle-label">All files</span>
                            </label>
                        </div>

                        <div className="commit-timeline" id="commitTimeline">
                            <div className="section-header">
                                <span className="section-title">History</span>
                                <span className="badge" id="commitCount">0</span>
                            </div>
                            <div className="timeline-container" id="timelineContainer">
                                <div className="empty-state">
                                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
                                        <circle cx="12" cy="12" r="10" />
                                        <path d="M12 6v6l4 2" />
                                    </svg>
                                    <p>Load a repository</p>
                                </div>
                            </div>
                        </div>

                        <div className="sidebar-bottom">
                            <div className="canvas-controls">
                                <div className="control-row">
                                    <button id="resetView" className="btn-ghost" title="Reset View">
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                            <path d="M3 3v5h5" />
                                        </svg>
                                    </button>
                                    <button id="fitAll" className="btn-ghost" title="Fit All">
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                                        </svg>
                                    </button>
                                    <div className="zoom-inline">
                                        <input type="range" id="zoomSlider" min="0.1" max="3" step="0.1" defaultValue="1" />
                                        <span id="zoomValue">100%</span>
                                    </div>
                                </div>
                            </div>

                            <div className="hotkey-legend">
                                <div className="hotkey-row"><kbd>⌃ Scroll</kbd> <span>Zoom in/out</span></div>
                                <div className="hotkey-row"><kbd>Space+Drag</kbd> <span>Pan canvas</span></div>
                                <div className="hotkey-row"><kbd>Space+Scroll</kbd> <span>Pan canvas</span></div>
                                <div className="hotkey-row"><kbd>Drag card</kbd> <span>Move card</span></div>
                                <div className="hotkey-row"><kbd>Corner drag</kbd> <span>Resize</span></div>
                                <div className="hotkey-row"><kbd>Click</kbd> <span>Select</span></div>
                                <div className="hotkey-row"><kbd>⇧ Click</kbd> <span>Multi-select</span></div>
                                <div className="hotkey-row"><kbd>Drag canvas</kbd> <span>Rect select</span></div>
                                <div className="hotkey-row"><kbd>Del</kbd> <span>Hide file</span></div>
                                <div className="hotkey-row"><kbd>H</kbd> <span>Arrange row</span></div>
                                <div className="hotkey-row"><kbd>V</kbd> <span>Arrange col</span></div>
                                <div className="hotkey-row"><kbd>G</kbd> <span>Arrange grid</span></div>
                                <div className="hotkey-row"><kbd>F</kbd> <span>Fit content</span></div>
                                <div className="hotkey-row"><kbd>W</kbd> <span>Fit screen</span></div>
                                <div className="hotkey-row"><kbd>I</kbd> <span>AI Chat</span></div>
                                <div className="hotkey-row"><kbd>⌃A</kbd> <span>Select all</span></div>
                                <div className="hotkey-row"><kbd>Esc</kbd> <span>Deselect</span></div>
                                <div className="hotkey-row"><kbd>←→</kbd> <span>Prev/next commit</span></div>
                                <div className="hotkey-row"><kbd>/</kbd> <span>Search files</span></div>
                            </div>
                        </div>
                    </nav>

                    <main className="canvas-area">
                        <div className="canvas-header">
                            <div className="header-left">
                                <div className="current-commit" id="currentCommitInfo">
                                    <span className="commit-hash-label">No commit selected</span>
                                </div>
                            </div>
                            <div className="header-right">
                                <div className="arrange-toolbar" id="arrangeToolbar" style={{ display: 'none' }}>
                                    <span className="arrange-label">Arrange:</span>
                                    <button id="arrangeRow" className="btn-ghost btn-xs" title="Arrange in row (H)">
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="2" y="7" width="5" height="10" rx="1" />
                                            <rect x="9.5" y="7" width="5" height="10" rx="1" />
                                            <rect x="17" y="7" width="5" height="10" rx="1" />
                                        </svg>
                                    </button>
                                    <button id="arrangeCol" className="btn-ghost btn-xs" title="Arrange in column (V)">
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="4" y="2" width="16" height="5" rx="1" />
                                            <rect x="4" y="9.5" width="16" height="5" rx="1" />
                                            <rect x="4" y="17" width="16" height="5" rx="1" />
                                        </svg>
                                    </button>
                                    <button id="arrangeGrid" className="btn-ghost btn-xs" title="Arrange in grid (G)">
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="3" y="3" width="7" height="7" rx="1" />
                                            <rect x="14" y="3" width="7" height="7" rx="1" />
                                            <rect x="3" y="14" width="7" height="7" rx="1" />
                                            <rect x="14" y="14" width="7" height="7" rx="1" />
                                        </svg>
                                    </button>
                                </div>
                                <button id="toggleChangedFiles" className="btn-ghost btn-sm" title="Show changed files">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                    </svg>
                                    <span id="fileCount">0</span>
                                </button>
                                <button id="showHidden" className="btn-ghost btn-sm" title="Show hidden files" style={{ display: 'none' }}>
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                                        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                                        <line x1="1" y1="1" x2="23" y2="23" />
                                    </svg>
                                    <span id="hiddenCount">0</span>
                                </button>
                                <button id="toggleCanvasChat" className="btn-ghost btn-sm ai-chat-btn" title="AI Chat (I)">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                                    </svg>
                                    AI
                                </button>
                            </div>
                        </div>

                        {children}

                        {/* Changed Files Panel */}
                        <div className="changed-files-panel" id="changedFilesPanel" style={{ display: 'none' }}>
                            <div className="panel-header">
                                <span className="panel-title">Changed Files</span>
                                <button id="closeChangedFiles" className="btn-ghost btn-xs" title="Close">
                                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            </div>
                            <div className="changed-files-list" id="changedFilesList"></div>
                        </div>

                        <div className="minimap-container">
                            <div className="minimap" id="minimap">
                                <div className="minimap-viewport" id="minimapViewport"></div>
                            </div>
                            <button id="expandMinimap" className="btn-ghost btn-xs minimap-expand" title="Expand minimap">
                                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="15 3 21 3 21 9" />
                                    <polyline points="9 21 3 21 3 15" />
                                    <line x1="21" y1="3" x2="14" y2="10" />
                                    <line x1="3" y1="21" x2="10" y2="14" />
                                </svg>
                            </button>
                        </div>
                    </main>
                </div>

                {/* File Preview Modal */}
                <div className="file-preview-modal" id="filePreviewModal">
                    <div className="modal-backdrop"></div>
                    <div className="modal-content">
                        <div className="modal-header">
                            <div className="modal-header-left">
                                <span className="file-path" id="previewFilePath"></span>
                                <span className="modal-line-count" id="previewLineCount"></span>
                                <span className="modal-file-status" id="previewFileStatus"></span>
                            </div>
                            <div className="modal-header-right">
                                <div className="modal-view-tabs" id="modalViewTabs">
                                    <button className="modal-tab active" data-view="full">
                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                            <polyline points="14 2 14 8 20 8" />
                                            <line x1="16" y1="13" x2="8" y2="13" />
                                            <line x1="16" y1="17" x2="8" y2="17" />
                                        </svg>
                                        Full
                                    </button>
                                    <button className="modal-tab" data-view="diff">
                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M12 3v18M3 12h18" />
                                        </svg>
                                        Diff
                                    </button>
                                    <button className="modal-tab" data-view="chat">
                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                                        </svg>
                                        AI Chat
                                    </button>
                                </div>
                                <button className="modal-close" id="closePreview">&times;</button>
                            </div>
                        </div>
                        <pre className="modal-body" id="modalBodyPre"><code id="previewContent"></code></pre>
                        <div className="modal-chat-container" id="modalChatContainer" style={{ display: 'none' }}></div>
                    </div>
                </div>
            </body>
        </html>
    );
}
