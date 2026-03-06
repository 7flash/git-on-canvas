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
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
                <meta name="description" content="GitMaps - See your codebase in a new dimension. Spatial code explorer." />
                <title>GitMaps — Spatial Code Explorer</title>
                <link rel="icon" href="data:," />
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
                                <span>GitMaps</span>
                            </div>
                        </div>

                        <div className="repo-selector">
                            <select id="repoSelect" className="repo-dropdown">
                                <option value="">Select a repository...</option>
                            </select>
                            <input type="text" id="repoPath" style={{ display: 'none' }} />
                            <input type="file" id="folderPickerInput" style={{ display: 'none' }} />
                            <div className="clone-url-row" id="cloneUrlRow">
                                <input
                                    type="text"
                                    id="cloneUrlInput"
                                    className="clone-url-input"
                                    placeholder="Paste repo URL to clone..."
                                    spellCheck={false}
                                    autoComplete="off"
                                />
                                <button id="cloneBtn" className="clone-btn" title="Clone remote repository">
                                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                        <polyline points="7 10 12 15 17 10" />
                                        <line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                    Clone
                                </button>
                            </div>
                            <div className="clone-status" id="cloneStatus" style={{ display: 'none' }}></div>

                            <button id="githubImportBtn" className="github-import-btn" title="Import from GitHub">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                                </svg>
                                Import from GitHub
                            </button>
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

                            <div className="hotkey-toggle-wrapper">
                                <button id="hotkeyToggle" className="btn-ghost hotkey-toggle" title="Keyboard shortcuts">
                                    <span>?</span>
                                </button>
                                <div className="hotkey-popup" id="hotkeyPopup">
                                    <div className="hotkey-popup-title">Keyboard Shortcuts</div>
                                    <div className="hotkey-grid">
                                        <div className="hk"><kbd>Scroll</kbd> Zoom</div>
                                        <div className="hk"><kbd>Space+Drag</kbd> Pan</div>
                                        <div className="hk"><kbd>Click</kbd> Select</div>
                                        <div className="hk"><kbd>Shift+Click</kbd> Multi-select</div>
                                        <div className="hk"><kbd>Drag canvas</kbd> Rect select</div>
                                        <div className="hk"><kbd>Drag card</kbd> Move</div>
                                        <div className="hk"><kbd>Del</kbd> Hide file</div>
                                        <div className="hk"><kbd>F</kbd> Expand/collapse</div>
                                        <div className="hk"><kbd>H</kbd> Arrange row</div>
                                        <div className="hk"><kbd>V</kbd> Arrange column</div>
                                        <div className="hk"><kbd>G</kbd> Arrange grid</div>
                                        <div className="hk"><kbd>W</kbd> Fit to screen</div>
                                        <div className="hk"><kbd>I</kbd> AI Chat</div>
                                        <div className="hk"><kbd>/</kbd> Search files</div>
                                        <div className="hk"><kbd>Ctrl +/-</kbd> Text zoom</div>
                                        <div className="hk"><kbd>Dbl-click</kbd> Zoom to card</div>
                                        <div className="hk"><kbd>Alt+Click</kbd> Connect lines</div>
                                        <div className="hk"><kbd>Arrow keys</kbd> Prev/next commit</div>
                                    </div>
                                </div>
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
                                    <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }}></div>
                                    <button id="arrangeExpand" className="btn-ghost btn-xs" title="Toggle Collapse (F)">
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="4 14 12 22 20 14" />
                                            <polyline points="4 10 12 2 20 10" />
                                        </svg>
                                    </button>
                                    <button id="arrangeFit" className="btn-ghost btn-xs" title="Reset Size (W)">
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                                        </svg>
                                    </button>
                                    <button id="arrangeAI" className="btn-ghost btn-xs" title="Explain with AI...">
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                            <path d="M11 2h2v4h-2zm0 16h2v4h-2zm11-7v2h-4v-2zm-16 0v2H2v-2zm12.3-5.3l1.4 1.4-2.8 2.8-1.4-1.4zm-9.8 9.8l1.4 1.4-2.8 2.8-1.4-1.4z" />
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
                                <button id="toggleConnections" className="btn-ghost btn-sm" title="Toggle connection lines">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                    </svg>
                                </button>
                                <button id="toggleCanvasText" className="btn-ghost btn-sm" title="Toggle text rendering mode (DOM vs WebGL/Canvas)">
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="4 7 4 4 20 4 20 7" />
                                        <line x1="9" y1="20" x2="15" y2="20" />
                                        <line x1="12" y1="4" x2="12" y2="20" />
                                    </svg>
                                </button>
                                <button id="autoDetectImports" className="btn-ghost btn-sm" title="Auto-detect import connections" style={{ display: 'none' }}>
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4" />
                                        <path d="M14 9l2 2-2 2" />
                                    </svg>
                                </button>
                                <button id="shareLayout" className="btn-ghost btn-sm" title="Share Layout (Copy URL)">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="18" cy="5" r="3" />
                                        <circle cx="6" cy="12" r="3" />
                                        <circle cx="18" cy="19" r="3" />
                                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                                    </svg>
                                </button>
                                <button id="helpOnboarding" className="btn-ghost btn-sm" title="Replay Tutorial (?)">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10" />
                                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                                        <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
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

                        {/* Bottom Layers Bar */}
                        <div id="layersBarContainer"></div>
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

                {/* GitHub Import Modal */}
                <div className="github-modal" id="githubModal">
                    <div className="github-modal-backdrop"></div>
                    <div className="github-modal-content">
                        <div className="github-modal-header">
                            <div className="github-modal-title">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style={{ opacity: 0.7 }}>
                                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                                </svg>
                                <span>Import from GitHub</span>
                            </div>
                            <button className="github-modal-close" id="githubModalClose">&times;</button>
                        </div>
                        <div className="github-search-row">
                            <input
                                type="text"
                                id="githubUserInput"
                                className="github-user-input"
                                placeholder="GitHub username or organization..."
                                spellCheck={false}
                                autoComplete="off"
                            />
                            <select id="githubSortSelect" className="github-sort-select">
                                <option value="updated">Recently Updated</option>
                                <option value="stars">Most Stars</option>
                                <option value="name">Name A→Z</option>
                            </select>
                            <button id="githubSearchBtn" className="github-search-btn">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                                Search
                            </button>
                        </div>
                        <div className="github-profile" id="githubProfile" style={{ display: 'none' }}></div>
                        <div className="github-repos-grid" id="githubReposGrid">
                            <div className="github-empty-state">
                                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.2">
                                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                                </svg>
                                <p>Enter a GitHub username to browse their repositories</p>
                            </div>
                        </div>
                        <div className="github-pagination" id="githubPagination" style={{ display: 'none' }}>
                            <button id="githubPrevPage" className="github-page-btn" disabled>← Previous</button>
                            <span id="githubPageInfo" className="github-page-info">Page 1</span>
                            <button id="githubNextPage" className="github-page-btn">Next →</button>
                        </div>
                    </div>
                </div>
            </body >
        </html >
    );
}
