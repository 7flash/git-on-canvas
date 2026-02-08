import { createMachine, assign } from 'xstate';

/**
 * Git Canvas state machine.
 * 
 * Parallel regions:
 * - repo: manages repository loading lifecycle
 * - view: which canvas content is shown (commits diff vs all files)
 * - canvasMode: interaction mode on the canvas (pan/select/resize/connect)
 * - connection: connection creation flow (only active in connect mode)
 */
export const canvasMachine = createMachine({
    id: 'gitcanvas',
    type: 'parallel',
    context: {
        // Repo
        repoPath: '',
        commits: [],
        currentCommitHash: null,
        commitFiles: [],

        // All files
        allFiles: [],

        // Canvas
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        selectedCards: [],  // file paths of selected cards

        // Connections
        connections: [],
        pendingConnection: null, // { sourceFile, sourceLineStart, sourceLineEnd }

        // Card sizes
        cardSizes: {},

        // Scroll positions
        scrollPositions: {},

        // Error
        error: null,
    },

    states: {
        repo: {
            initial: 'idle',
            states: {
                idle: {
                    on: {
                        LOAD_REPO: {
                            target: 'loading',
                            actions: assign({ repoPath: ({ event }) => event.path, error: null }),
                        }
                    }
                },
                loading: {
                    on: {
                        REPO_LOADED: {
                            target: 'loaded',
                            actions: assign({
                                commits: ({ event }) => event.commits,
                                currentCommitHash: ({ event }) => event.commits.length > 0 ? event.commits[0].hash : null,
                            }),
                        },
                        REPO_ERROR: {
                            target: 'error',
                            actions: assign({ error: ({ event }) => event.error }),
                        }
                    }
                },
                loaded: {
                    on: {
                        LOAD_REPO: {
                            target: 'loading',
                            actions: assign({ repoPath: ({ event }) => event.path, error: null }),
                        },
                        SELECT_COMMIT: {
                            actions: assign({ currentCommitHash: ({ event }) => event.hash }),
                        },
                        COMMIT_FILES_LOADED: {
                            actions: assign({ commitFiles: ({ event }) => event.files }),
                        },
                        ALL_FILES_LOADED: {
                            actions: assign({ allFiles: ({ event }) => event.files }),
                        },
                    }
                },
                error: {
                    on: {
                        LOAD_REPO: {
                            target: 'loading',
                            actions: assign({ repoPath: ({ event }) => event.path, error: null }),
                        }
                    }
                }
            }
        },

        view: {
            initial: 'commits',
            states: {
                commits: {
                    on: {
                        SWITCH_TO_ALLFILES: 'allfiles',
                    }
                },
                allfiles: {
                    on: {
                        SWITCH_TO_COMMITS: 'commits',
                    }
                }
            }
        },
    },

    on: {
        // Global events — available in any state
        SET_ZOOM: {
            actions: assign({ zoom: ({ event }) => event.zoom }),
        },
        SET_OFFSET: {
            actions: assign({
                offsetX: ({ event }) => event.x,
                offsetY: ({ event }) => event.y,
            }),
        },
        SELECT_CARD: {
            actions: assign({
                selectedCards: ({ context, event }) => {
                    if (event.shift) {
                        const idx = context.selectedCards.indexOf(event.path);
                        if (idx >= 0) {
                            return context.selectedCards.filter(p => p !== event.path);
                        }
                        return [...context.selectedCards, event.path];
                    }
                    return [event.path];
                }
            }),
        },
        DESELECT_ALL: {
            actions: assign({ selectedCards: [] }),
        },
        RESIZE_CARD: {
            actions: assign({
                cardSizes: ({ context, event }) => ({
                    ...context.cardSizes,
                    [event.path]: { width: event.width, height: event.height }
                })
            }),
        },
        START_CONNECTION: {
            actions: assign({
                pendingConnection: ({ event }) => ({
                    sourceFile: event.sourceFile,
                    sourceLineStart: event.lineStart,
                    sourceLineEnd: event.lineEnd,
                })
            }),
        },
        COMPLETE_CONNECTION: {
            actions: assign({
                connections: ({ context, event }) => {
                    if (!context.pendingConnection) return context.connections;
                    return [...context.connections, {
                        id: `conn-${Date.now()}`,
                        ...context.pendingConnection,
                        targetFile: event.targetFile,
                        targetLineStart: event.lineStart,
                        targetLineEnd: event.lineEnd,
                        comment: event.comment || '',
                    }];
                },
                pendingConnection: null,
            }),
        },
        CANCEL_CONNECTION: {
            actions: assign({ pendingConnection: null }),
        },
        DELETE_CONNECTION: {
            actions: assign({
                connections: ({ context, event }) =>
                    context.connections.filter(c => c.id !== event.id)
            }),
        },
        SAVE_SCROLL: {
            actions: assign({
                scrollPositions: ({ context, event }) => ({
                    ...context.scrollPositions,
                    [event.path]: event.scrollTop,
                })
            }),
        },
    },
});
