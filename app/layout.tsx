/**
 * Root Layout — Server Component
 *
 * Renders the full page shell: sidebar + canvas area.
 * All interactivity is in page.client.tsx.
 */
import React from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
                                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
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
                            <label>Repository Path</label>
                            <div className="input-group">
                                <input type="text" id="repoPath" placeholder="C:\path\to\repo" />
                                <button id="browseRepo" className="btn-icon" title="Paste path from clipboard">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                                        <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                                    </svg>
                                </button>
                                <button id="browseFolder" className="btn-icon" title="Browse for folder">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                                    </svg>
                                </button>
                                <button id="loadRepo" className="btn-icon" title="Load Repository">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 12a9 9 0 11-9-9" />
                                        <path d="M21 3v6h-6" />
                                    </svg>
                                </button>
                            </div>
                            {/* Hidden file input for browser folder picker */}
                            <input type="file" id="folderPickerInput" style={{ display: 'none' }} />
                        </div>

                        <div className="commit-timeline" id="commitTimeline">
                            <div className="section-header">
                                <h3>Commits</h3>
                                <span className="badge" id="commitCount">0</span>
                            </div>
                            <div className="timeline-container" id="timelineContainer">
                                <div className="empty-state">
                                    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                                        <circle cx="12" cy="12" r="10" />
                                        <path d="M12 6v6l4 2" />
                                    </svg>
                                    <p>Load a repository to see commits</p>
                                </div>
                            </div>
                        </div>

                        <div className="canvas-controls">
                            <h3>Canvas</h3>
                            <div className="control-row">
                                <button id="resetView" className="btn-secondary">
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                        <path d="M3 3v5h5" />
                                    </svg>
                                    Reset View
                                </button>
                                <button id="fitAll" className="btn-secondary">
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                                    </svg>
                                    Fit All
                                </button>
                            </div>
                            <div className="zoom-control">
                                <label>Zoom</label>
                                <input type="range" id="zoomSlider" min="0.1" max="3" step="0.1" defaultValue="1" />
                                <span id="zoomValue">100%</span>
                            </div>

                            <div className="hotkey-legend">
                                <h4>Shortcuts</h4>
                                <div className="hotkey-row"><kbd>Scroll</kbd> <span>Zoom canvas</span></div>
                                <div className="hotkey-row"><kbd>Drag</kbd> <span>Pan / Move card</span></div>
                                <div className="hotkey-row"><kbd>Shift+Click</kbd> <span>Multi-select</span></div>
                                <div className="hotkey-row"><kbd>Delete</kbd> <span>Hide selected files</span></div>
                                <div className="hotkey-row"><kbd>Esc</kbd> <span>Cancel / Close</span></div>
                                <div className="hotkey-row"><kbd>Corner drag</kbd> <span>Resize card</span></div>
                            </div>
                        </div>
                    </nav>

                    <main className="canvas-area">
                        <div className="canvas-header">
                            <div className="view-mode-toggle">
                                <button id="modeCommits" className="mode-btn active" title="View commit diffs">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10" />
                                        <path d="M12 6v6l4 2" />
                                    </svg>
                                    Commits
                                </button>
                                <button id="modeAllFiles" className="mode-btn" title="View all files in working tree">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                        <line x1="16" y1="13" x2="8" y2="13" />
                                        <line x1="16" y1="17" x2="8" y2="17" />
                                    </svg>
                                    All Files
                                </button>
                            </div>

                            <div className="current-commit" id="currentCommitInfo">
                                <span className="commit-hash">No commit selected</span>
                            </div>

                            <div className="header-actions">
                                <div className="file-count">
                                    <span id="fileCount">0</span> files
                                </div>
                                <button id="showHidden" className="btn-secondary btn-sm" title="Show hidden files" style={{ display: 'none' }}>
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                                        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                                        <line x1="1" y1="1" x2="23" y2="23" />
                                    </svg>
                                    <span id="hiddenCount">0</span> hidden
                                </button>
                            </div>
                        </div>

                        {children}

                        <div className="minimap" id="minimap">
                            <div className="minimap-viewport" id="minimapViewport" />
                        </div>
                    </main>
                </div>

                {/* File Preview Modal */}
                <div className="file-preview-modal" id="filePreviewModal">
                    <div className="modal-backdrop" />
                    <div className="modal-content">
                        <div className="modal-header">
                            <span className="file-path" id="previewFilePath" />
                            <button className="modal-close" id="closePreview">&times;</button>
                        </div>
                        <pre className="modal-body"><code id="previewContent" /></pre>
                    </div>
                </div>
            </body>
        </html>
    );
}
