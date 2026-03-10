export interface CanvasTextOptions {
    content: string;
    addedLines?: Set<number>;
    deletedBeforeLine?: Map<number, string[]>;
    isAllAdded?: boolean;
    isAllDeleted?: boolean;
    visibleLineIndices?: Set<number>;
}

export class CanvasTextRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private lines: string[];
    private drawnLines: { index: number; content: string; num: number }[] = [];
    private lineHeight: number = 20;
    private charWidth: number = 7.2;
    private scrollTop: number = 0;
    private scrollLeft: number = 0;
    private viewportHeight: number = 0;
    private viewportWidth: number = 0;
    private options: CanvasTextOptions;
    private container: HTMLElement;
    private hunkRanges: { startIdx: number; endIdx: number; type: 'add' | 'del' }[] = [];
    private maxLineWidth: number = 0;
    private fontSize: number = 12;
    private hoverPopup: HTMLElement | null = null;
    /** Index of the currently highlighted hunk (for nav flash), -1 = none */
    private _highlightedHunkIdx: number = -1;
    /** Dynamic gutter: diff marker (6px) + line number chars + padding */
    private gutterLeft: number = 6;
    private lineNumWidth: number = 42;
    private get contentX() { return this.gutterLeft + this.lineNumWidth; }

    constructor(container: HTMLElement, options: CanvasTextOptions) {
        this.options = options;
        this.container = container;
        this.lines = options.content.split('\n');

        // Read font size from settings
        try {
            const stored = localStorage.getItem('gitcanvas:settings');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.fontSize) this.fontSize = parsed.fontSize;
            }
        } catch { }

        // Compute char width based on font size
        this.charWidth = this.fontSize * 0.6;
        this.lineHeight = this.fontSize + 8;

        // Pre-compute visible drawn lines
        for (let i = 0; i < this.lines.length; i++) {
            if (options.visibleLineIndices && !options.visibleLineIndices.has(i)) continue;
            this.drawnLines.push({ index: i, content: this.lines[i], num: i + 1 });
        }

        // Compute dynamic gutter width based on max line number digits
        this._recomputeGutter();

        // Compute max line width for horizontal scroll
        for (const dl of this.drawnLines) {
            const w = this.contentX + dl.content.length * this.charWidth + 20;
            if (w > this.maxLineWidth) this.maxLineWidth = w;
        }

        // Pre-compute hunk ranges (contiguous blocks of added/deleted lines)
        this._computeHunkRanges();

        // Create canvas — absolute positioned, pinned to visible area on scroll
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'canvas-text-layer';
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.display = 'block';
        this.canvas.style.pointerEvents = 'none';

        // High DPI support
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.height = `${rect.height}px`;

        this.ctx = this.canvas.getContext('2d')!;
        this.ctx.scale(dpr, dpr);

        // Setup font
        this.ctx.font = `${this.fontSize}px "JetBrains Mono", Consolas, monospace`;
        this.ctx.textBaseline = 'top';

        // Ensure container is a positioned scroll parent
        container.style.position = 'relative';

        container.appendChild(this.canvas);

        this.viewportHeight = rect.height;
        this.viewportWidth = rect.width;

        // Scroll shim — tall div giving the container scrollable height (vertical only)
        const scrollShim = document.createElement('div');
        scrollShim.className = 'canvas-scroll-shim';
        scrollShim.style.height = `${this.drawnLines.length * this.lineHeight}px`;
        scrollShim.style.width = '1px';
        scrollShim.style.pointerEvents = 'none';
        container.appendChild(scrollShim);

        // Hide horizontal scrollbar
        container.style.overflowX = 'hidden';

        // Custom scrollbar track for vertical position indicator
        this._buildScrollTrack(container);

        // Change markers gutter (scrollbar-like overlay on right side)
        this._buildChangeGutter(container);

        // Hover popup for long lines and diff markers
        this._setupHoverPopup(container);

        container.addEventListener('scroll', () => {
            this.scrollTop = container.scrollTop;
            // Pin canvas to the visible area of the scrolling container
            this.canvas.style.top = `${this.scrollTop}px`;
            this._updateScrollTrack();
            this.render();
        });

        // Direct wheel handler so mouse wheel scrolling works (viewport-level
        // handler intercepts wheel events, so we must also listen here)
        container.addEventListener('wheel', (e: WheelEvent) => {
            // Don't interfere with Ctrl+scroll zoom
            if (e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            e.stopPropagation();

            const maxScrollX = Math.max(0, this.maxLineWidth - this.viewportWidth);
            const maxScrollY = (this.drawnLines.length * this.lineHeight) - this.viewportHeight;

            // Shift+wheel or trackpad horizontal gesture → horizontal scroll
            if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                const dx = e.shiftKey ? e.deltaY : e.deltaX;
                this.scrollLeft = Math.max(0, Math.min(maxScrollX, this.scrollLeft + dx));
            } else {
                // Normal vertical scroll
                this.scrollTop = Math.max(0, Math.min(maxScrollY, this.scrollTop + e.deltaY));
                container.scrollTop = this.scrollTop;
            }

            this._updateScrollTrack();
            this.render();
        }, { passive: false });

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const r = entry.contentRect;
                this.canvas.width = r.width * dpr;
                this.canvas.height = r.height * dpr;
                this.canvas.style.width = `${r.width}px`;
                this.canvas.style.height = `${r.height}px`;
                this.viewportHeight = r.height;
                this.viewportWidth = r.width;
                // Reset transform to identity before re-applying DPR scale
                // (prevents compounding on repeated resize events)
                this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                this.ctx.font = `${this.fontSize}px "JetBrains Mono", Consolas, monospace`;
                this.ctx.textBaseline = 'top';
                this._updateScrollTrack();
                this.render();
            }
        });
        resizeObserver.observe(container);

        // Listen for settings changes
        window.addEventListener('gitcanvas:settings-changed', ((e: CustomEvent) => {
            const newSize = e.detail?.fontSize;
            if (newSize && newSize !== this.fontSize) {
                this.fontSize = newSize;
                this.charWidth = this.fontSize * 0.6;
                this.lineHeight = this.fontSize + 8;
                this.ctx.font = `${this.fontSize}px "JetBrains Mono", Consolas, monospace`;
                // Recompute gutter and max line width
                this._recomputeGutter();
                this.maxLineWidth = 0;
                for (const dl of this.drawnLines) {
                    const w = this.contentX + dl.content.length * this.charWidth + 20;
                    if (w > this.maxLineWidth) this.maxLineWidth = w;
                }
                // Update scroll shim
                const shim = container.querySelector('.canvas-scroll-shim') as HTMLElement;
                if (shim) {
                    shim.style.height = `${this.drawnLines.length * this.lineHeight}px`;
                    shim.style.width = `${Math.max(this.maxLineWidth, this.viewportWidth)}px`;
                }
                this._updateScrollTrack();
                this.render();
            }
        }) as EventListener);

        this.render();
    }

    /** Recompute gutter width based on font size and line count */
    private _recomputeGutter() {
        const maxNum = this.drawnLines.length > 0
            ? this.drawnLines[this.drawnLines.length - 1].num
            : 1;
        const digits = Math.max(3, String(maxNum).length);
        // gutter = diff marker (6px) + line num chars + padding (12px)
        this.lineNumWidth = digits * this.charWidth + 12;
    }

    /** Build a custom scrollbar track on the right side */
    private _buildScrollTrack(container: HTMLElement) {
        const track = document.createElement('div');
        track.className = 'canvas-scroll-track';
        track.style.cssText = `
            position: absolute; top: 0; right: 0; width: 8px;
            height: 100%; z-index: 10; pointer-events: auto;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 4px; opacity: 0.5;
            transition: opacity 0.2s;
        `;

        const thumb = document.createElement('div');
        thumb.className = 'canvas-scroll-thumb';
        thumb.style.cssText = `
            position: absolute; right: 1px; width: 6px;
            min-height: 24px; border-radius: 3px;
            background: rgba(124, 58, 237, 0.5);
            transition: background 0.15s;
            cursor: pointer;
        `;

        track.appendChild(thumb);
        container.appendChild(track);

        // Scrollbar is always minimally visible; brightens on hover/scroll
        let hideTimeout: any = null;
        const BASELINE_OPACITY = '0.5';
        const ACTIVE_OPACITY = '1';
        const showTrack = () => {
            track.style.opacity = ACTIVE_OPACITY;
            if (hideTimeout) clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => { track.style.opacity = BASELINE_OPACITY; }, 1500);
        };

        container.addEventListener('scroll', showTrack);
        container.addEventListener('mouseenter', showTrack);
        track.addEventListener('mouseenter', () => {
            track.style.opacity = ACTIVE_OPACITY;
            thumb.style.background = 'rgba(124, 58, 237, 0.7)';
            if (hideTimeout) clearTimeout(hideTimeout);
        });
        track.addEventListener('mouseleave', () => {
            thumb.style.background = 'rgba(124, 58, 237, 0.5)';
            hideTimeout = setTimeout(() => { track.style.opacity = BASELINE_OPACITY; }, 800);
        });

        // Click on track background to jump, drag thumb to scrub
        let dragging = false;
        let dragStartY = 0;
        let dragStartScroll = 0;

        track.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const trackRect = track.getBoundingClientRect();
            const thumbRect = thumb.getBoundingClientRect();

            // Check if click is on the thumb
            if (e.clientY >= thumbRect.top && e.clientY <= thumbRect.bottom) {
                // Start dragging the thumb
                dragging = true;
                dragStartY = e.clientY;
                dragStartScroll = this.scrollTop;
                thumb.style.background = 'rgba(124, 58, 237, 0.9)';
                track.style.opacity = ACTIVE_OPACITY;

                const onDragMove = (me: MouseEvent) => {
                    if (!dragging) return;
                    const totalContent = this.drawnLines.length * this.lineHeight;
                    const maxScroll = totalContent - this.viewportHeight;
                    const thumbH = parseFloat(thumb.style.height) || 24;
                    const trackH = trackRect.height - thumbH;
                    const dy = me.clientY - dragStartY;
                    const scrollDelta = (dy / trackH) * maxScroll;
                    this.scrollTop = Math.max(0, Math.min(maxScroll, dragStartScroll + scrollDelta));
                    container.scrollTop = this.scrollTop;
                    this._updateScrollTrack();
                    this.render();
                };

                const onDragEnd = () => {
                    dragging = false;
                    thumb.style.background = 'rgba(124, 58, 237, 0.5)';
                    window.removeEventListener('mousemove', onDragMove);
                    window.removeEventListener('mouseup', onDragEnd);
                    hideTimeout = setTimeout(() => { track.style.opacity = BASELINE_OPACITY; }, 800);
                };

                window.addEventListener('mousemove', onDragMove);
                window.addEventListener('mouseup', onDragEnd);
            } else {
                // Click on track background → jump to position
                const clickY = e.clientY - trackRect.top;
                const totalContent = this.drawnLines.length * this.lineHeight;
                const scrollPct = clickY / trackRect.height;
                this.scrollTop = Math.max(0, scrollPct * (totalContent - this.viewportHeight));
                container.scrollTop = this.scrollTop;
                this._updateScrollTrack();
                this.render();
            }
        });

        // Pin track on scroll
        container.addEventListener('scroll', () => {
            track.style.top = `${container.scrollTop}px`;
        });

        this._updateScrollTrack();
    }

    /** Update custom scrollbar thumb position and size */
    private _updateScrollTrack() {
        const thumb = this.container.querySelector('.canvas-scroll-thumb') as HTMLElement;
        if (!thumb) return;

        const totalContent = this.drawnLines.length * this.lineHeight;
        if (totalContent <= this.viewportHeight) {
            thumb.style.display = 'none';
            return;
        }

        thumb.style.display = 'block';
        const thumbHeight = Math.max(24, (this.viewportHeight / totalContent) * this.viewportHeight);
        const thumbTop = (this.scrollTop / (totalContent - this.viewportHeight)) * (this.viewportHeight - thumbHeight);
        thumb.style.height = `${thumbHeight}px`;
        thumb.style.top = `${thumbTop}px`;
    }

    /** Compute contiguous hunk ranges from addedLines/deletedBeforeLine */
    private _computeHunkRanges() {
        const { addedLines, deletedBeforeLine, isAllAdded } = this.options;
        if (isAllAdded) {
            this.hunkRanges.push({ startIdx: 0, endIdx: this.drawnLines.length - 1, type: 'add' });
            return;
        }

        // Map drawn-line indices to their change type
        const changeMap = new Map<number, 'add' | 'del'>();
        for (let i = 0; i < this.drawnLines.length; i++) {
            const num = this.drawnLines[i].num;
            if (addedLines?.has(num)) changeMap.set(i, 'add');
            else if (deletedBeforeLine?.has(num)) changeMap.set(i, 'del');
        }

        // Build contiguous ranges
        let currentRange: { startIdx: number; endIdx: number; type: 'add' | 'del' } | null = null;
        for (let i = 0; i < this.drawnLines.length; i++) {
            const type = changeMap.get(i);
            if (type) {
                if (currentRange && currentRange.type === type && i - currentRange.endIdx <= 2) {
                    // Extend current range (allow 1-line gaps to group nearby hunks)
                    currentRange.endIdx = i;
                } else {
                    if (currentRange) this.hunkRanges.push(currentRange);
                    currentRange = { startIdx: i, endIdx: i, type };
                }
            } else {
                if (currentRange && i - currentRange.endIdx > 2) {
                    this.hunkRanges.push(currentRange);
                    currentRange = null;
                }
            }
        }
        if (currentRange) this.hunkRanges.push(currentRange);
    }

    /** Build a DOM-based change gutter alongside the scrollbar */
    private _buildChangeGutter(container: HTMLElement) {
        if (this.hunkRanges.length === 0) return;

        const totalLines = this.drawnLines.length;
        if (totalLines === 0) return;

        // Remove any existing change gutter (prevents duplicates on re-render)
        container.querySelector('.canvas-change-gutter')?.remove();

        // Gutter container — overlays on the right side of the card
        const gutter = document.createElement('div');
        gutter.className = 'canvas-change-gutter';
        gutter.style.cssText = `
            position: absolute; top: 0; right: 10px;
            width: 10px; height: ${this.viewportHeight}px;
            z-index: 5; pointer-events: auto;
        `;

        // Re-pin gutter on scroll
        container.addEventListener('scroll', () => {
            gutter.style.top = `${container.scrollTop}px`;
        });

        // Add markers for each hunk
        for (const hunk of this.hunkRanges) {
            const startPct = (hunk.startIdx / totalLines) * 100;
            const endPct = ((hunk.endIdx + 1) / totalLines) * 100;
            const heightPct = Math.max(1.5, endPct - startPct); // Min 1.5% height for visibility

            const marker = document.createElement('div');
            marker.className = `canvas-gutter-marker canvas-gutter-marker--${hunk.type}`;
            marker.style.cssText = `
                position: absolute;
                top: ${startPct}%;
                height: ${heightPct}%;
                width: 8px;
                left: 1px;
                border-radius: 2px;
                cursor: pointer;
                background: ${hunk.type === 'add' ? 'rgba(46, 160, 67, 0.7)' : 'rgba(248, 81, 73, 0.7)'};
                transition: background 0.15s;
                min-height: 4px;
            `;
            marker.title = `${hunk.type === 'add' ? 'Added' : 'Deleted'} lines ${this.drawnLines[hunk.startIdx].num}–${this.drawnLines[hunk.endIdx].num}`;

            // Click → scroll to that hunk
            marker.addEventListener('mousedown', (e) => { e.stopPropagation(); });
            marker.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetScroll = hunk.startIdx * this.lineHeight - this.viewportHeight / 4;
                this.scrollTop = Math.max(0, targetScroll);
                container.scrollTop = this.scrollTop;
                this._updateScrollTrack();
                this.render();
            });

            marker.addEventListener('mouseenter', () => {
                marker.style.background = hunk.type === 'add' ? 'rgba(46, 160, 67, 1)' : 'rgba(248, 81, 73, 1)';
                marker.style.width = '10px';
            });
            marker.addEventListener('mouseleave', () => {
                marker.style.background = hunk.type === 'add' ? 'rgba(46, 160, 67, 0.7)' : 'rgba(248, 81, 73, 0.7)';
                marker.style.width = '8px';
            });

            gutter.appendChild(marker);
        }

        // Navigation arrows (up/down between hunks)
        if (this.hunkRanges.length > 1) {
            const navContainer = document.createElement('div');
            navContainer.style.cssText = `
                position: absolute; top: ${this.viewportHeight - 44}px; right: 24px;
                display: flex; flex-direction: column; gap: 2px;
                z-index: 6; pointer-events: auto;
            `;

            // Re-pin nav on scroll
            container.addEventListener('scroll', () => {
                navContainer.style.top = `${container.scrollTop + this.viewportHeight - 44}px`;
            });

            let currentHunkIdx = -1;

            // Flash a gutter marker when navigated to
            const flashMarker = (idx: number) => {
                const markers = gutter.querySelectorAll('.canvas-gutter-marker');
                const marker = markers[idx] as HTMLElement;
                if (!marker) return;
                marker.style.background = this.hunkRanges[idx].type === 'add'
                    ? 'rgba(46, 160, 67, 1)' : 'rgba(248, 81, 73, 1)';
                marker.style.width = '12px';
                marker.style.boxShadow = this.hunkRanges[idx].type === 'add'
                    ? '0 0 8px rgba(46, 160, 67, 0.8)' : '0 0 8px rgba(248, 81, 73, 0.8)';
                setTimeout(() => {
                    marker.style.background = this.hunkRanges[idx].type === 'add'
                        ? 'rgba(46, 160, 67, 0.7)' : 'rgba(248, 81, 73, 0.7)';
                    marker.style.width = '8px';
                    marker.style.boxShadow = '';
                }, 600);
            };

            // Counter label
            const counterLabel = document.createElement('span');
            counterLabel.style.cssText = `
                font-size: 8px; color: rgba(201, 209, 217, 0.6);
                font-family: 'JetBrains Mono', monospace;
                text-align: center; line-height: 1; pointer-events: none;
            `;
            counterLabel.textContent = `${this.hunkRanges.length}`;

            const makeArrow = (label: string, direction: 'up' | 'down') => {
                const btn = document.createElement('button');
                btn.textContent = label;
                btn.title = direction === 'up' ? 'Previous change (↑)' : 'Next change (↓)';
                btn.style.cssText = `
                    width: 18px; height: 18px; font-size: 10px; line-height: 1;
                    background: rgba(30, 30, 50, 0.85); border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 3px; color: #c9d1d9; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    padding: 0;
                `;
                btn.addEventListener('mousedown', (e) => { e.stopPropagation(); });
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (direction === 'down') {
                        currentHunkIdx = Math.min(currentHunkIdx + 1, this.hunkRanges.length - 1);
                    } else {
                        currentHunkIdx = Math.max(currentHunkIdx - 1, 0);
                    }
                    const hunk = this.hunkRanges[currentHunkIdx];
                    const targetScroll = hunk.startIdx * this.lineHeight - this.viewportHeight / 4;
                    this.scrollTop = Math.max(0, targetScroll);
                    container.scrollTop = this.scrollTop;
                    this._updateScrollTrack();

                    // Highlight the navigated hunk briefly in the canvas render
                    this._highlightedHunkIdx = currentHunkIdx;
                    this.render();
                    setTimeout(() => {
                        this._highlightedHunkIdx = -1;
                        this.render();
                    }, 500);

                    // Flash the gutter marker
                    flashMarker(currentHunkIdx);

                    // Update counter
                    counterLabel.textContent = `${currentHunkIdx + 1}/${this.hunkRanges.length}`;
                });
                return btn;
            };

            navContainer.appendChild(makeArrow('▲', 'up'));
            navContainer.appendChild(counterLabel);
            navContainer.appendChild(makeArrow('▼', 'down'));
            container.appendChild(navContainer);
        }

        container.appendChild(gutter);
    }

    /** Setup hover popup for long lines and diff markers */
    private _setupHoverPopup(container: HTMLElement) {
        let hideTimeout: any = null;
        let showTimeout: any = null;
        let activeLineIdx = -1; // Track which line the popup is currently showing for

        const scheduleHide = () => {
            if (showTimeout) { clearTimeout(showTimeout); showTimeout = null; }
            if (!hideTimeout) {
                hideTimeout = setTimeout(() => {
                    this._hideHoverPopup();
                    activeLineIdx = -1;
                    hideTimeout = null;
                }, 200);
            }
        };

        container.addEventListener('mousemove', (e) => {
            const rect = container.getBoundingClientRect();

            // The container may be inside a CSS-scaled parent (GalaxyDraw zoom).
            // getBoundingClientRect returns scaled dimensions, so we need the
            // scale factor to convert mouse position to unscaled content coords.
            const scaleX = container.offsetWidth > 0 ? rect.width / container.offsetWidth : 1;
            const scaleY = container.offsetHeight > 0 ? rect.height / container.offsetHeight : 1;

            const mouseX = (e.clientX - rect.left) / scaleX + this.scrollLeft;
            const mouseY = (e.clientY - rect.top) / scaleY + this.scrollTop;

            // Which line is under the cursor?
            const lineIdx = Math.floor(mouseY / this.lineHeight);
            if (lineIdx < 0 || lineIdx >= this.drawnLines.length) {
                scheduleHide();
                return;
            }

            const lineData = this.drawnLines[lineIdx];
            const linePixelWidth = this.contentX + lineData.content.length * this.charWidth;

            // Show popup for long lines that extend beyond viewport
            const isLongLine = linePixelWidth > this.viewportWidth + this.scrollLeft;
            // Or show popup for diff markers (deleted-before lines)
            const hasDelBefore = this.options.deletedBeforeLine?.has(lineData.num);

            if (!isLongLine && !hasDelBefore) {
                // Hysteresis: if popup is active for THIS line, keep showing it
                // (prevents flicker when mouse is near the fade boundary)
                if (activeLineIdx === lineIdx && this.hoverPopup?.style.display === 'block') {
                    // Just reposition, don't hide
                    if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
                    return;
                }
                scheduleHide();
                return;
            }

            // Cancel any pending hide — we want to show
            if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }

            // If already showing for this same line, just reposition
            if (activeLineIdx === lineIdx && this.hoverPopup?.style.display === 'block') {
                let px = e.clientX + 12;
                const popupRect = this.hoverPopup.getBoundingClientRect();
                const popupH = popupRect.height || 120;
                let py = e.clientY - popupH - 8;
                if (py < 8) py = e.clientY + 16;
                if (px + 700 > window.innerWidth) px = e.clientX - 400;
                this.hoverPopup.style.left = `${px}px`;
                this.hoverPopup.style.top = `${py}px`;
                return;
            }

            // Debounce show to prevent flash on quick mouse-through
            if (showTimeout) clearTimeout(showTimeout);
            const capturedE = { clientX: e.clientX, clientY: e.clientY };
            showTimeout = setTimeout(() => {
                showTimeout = null;
                activeLineIdx = lineIdx;

                // Build popup content
                if (!this.hoverPopup) {
                    this.hoverPopup = document.createElement('div');
                    this.hoverPopup.className = 'canvas-text-hover-popup';
                    this.hoverPopup.style.cssText = `
                        position: fixed; z-index: 10000;
                        background: rgba(15, 15, 25, 0.95);
                        border: 1px solid rgba(124, 58, 237, 0.3);
                        border-radius: 6px;
                        padding: 8px 12px;
                        max-width: 700px;
                        max-height: 300px;
                        overflow: auto;
                        font-family: "JetBrains Mono", Consolas, monospace;
                        font-size: ${this.fontSize}px;
                        line-height: 1.4;
                        color: #c9d1d9;
                        backdrop-filter: blur(8px);
                        box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 10px rgba(124, 58, 237, 0.15);
                        white-space: pre-wrap;
                        word-break: break-all;
                        pointer-events: auto;
                        transition: opacity 0.15s ease;
                    `;
                    document.body.appendChild(this.hoverPopup);

                    this.hoverPopup.addEventListener('mouseenter', () => {
                        if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
                    });
                    this.hoverPopup.addEventListener('mouseleave', () => {
                        scheduleHide();
                    });
                }

                let popupHTML = '';

                if (hasDelBefore) {
                    const delLines = this.options.deletedBeforeLine!.get(lineData.num)!;
                    popupHTML += `<div style="color: #f87171; font-size: 10px; font-weight: 600; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em;">${delLines.length} deleted line${delLines.length > 1 ? 's' : ''}</div>`;
                    popupHTML += delLines.map(l =>
                        `<div style="color: #ffa198; background: rgba(248,81,73,0.1); padding: 1px 4px; border-radius: 2px;">− ${l.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`
                    ).join('');
                    if (isLongLine) {
                        popupHTML += `<div style="margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px;">`;
                    }
                }

                if (isLongLine) {
                    const isAdded = this.options.isAllAdded || (this.options.addedLines?.has(lineData.num));
                    const lineColor = isAdded ? '#7ee787' : this.options.isAllDeleted ? '#ffa198' : '#c9d1d9';
                    popupHTML += `<div style="color: rgba(110,118,129,0.7); font-size: 10px; margin-bottom: 2px;">Line ${lineData.num} (${lineData.content.length} chars)</div>`;
                    popupHTML += `<div style="color: ${lineColor};">${lineData.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
                    if (hasDelBefore) popupHTML += `</div>`;
                }

                this.hoverPopup.innerHTML = popupHTML;
                this.hoverPopup.style.display = 'block';
                this.hoverPopup.style.opacity = '1';

                // Position popup ABOVE cursor by default, fall below only near top edge
                let px = capturedE.clientX + 12;
                const popupRect = this.hoverPopup.getBoundingClientRect();
                const popupH = popupRect.height || 120;
                let py = capturedE.clientY - popupH - 8;
                if (py < 8) py = capturedE.clientY + 16;
                if (px + 700 > window.innerWidth) px = capturedE.clientX - 400;
                this.hoverPopup.style.left = `${px}px`;
                this.hoverPopup.style.top = `${py}px`;
            }, 80); // 80ms debounce before showing
        });

        container.addEventListener('mouseleave', () => {
            scheduleHide();
        });
    }

    private _hideHoverPopup() {
        if (this.hoverPopup) {
            this.hoverPopup.style.display = 'none';
        }
    }

    /** Scroll to a specific line number */
    public scrollToLine(lineNum: number) {
        const idx = this.drawnLines.findIndex(dl => dl.num === lineNum);
        if (idx < 0) return;
        const targetScroll = idx * this.lineHeight - this.viewportHeight / 4;
        this.container.scrollTop = Math.max(0, targetScroll);
    }

    private render() {
        if (!this.ctx) return;

        const w = this.canvas.width / (window.devicePixelRatio || 1);
        const h = this.canvas.height / (window.devicePixelRatio || 1);

        this.ctx.clearRect(0, 0, w, h);

        const startIndex = Math.max(0, Math.floor(this.scrollTop / this.lineHeight) - 2);
        const endIndex = Math.min(this.drawnLines.length, startIndex + Math.ceil(this.viewportHeight / this.lineHeight) + 4);

        // Left gutter width for diff markers
        const diffGutterW = this.gutterLeft;
        const numDigits = Math.max(3, String(this.drawnLines.length > 0 ? this.drawnLines[this.drawnLines.length - 1].num : 1).length);

        for (let i = startIndex; i < endIndex; i++) {
            const y = (i * this.lineHeight) - this.scrollTop;
            const lineData = this.drawnLines[i];
            const isAdded = this.options.isAllAdded || (this.options.addedLines && this.options.addedLines.has(lineData.num));
            const isDeleted = this.options.isAllDeleted;
            const hasDelBefore = this.options.deletedBeforeLine && this.options.deletedBeforeLine.has(lineData.num);

            // Background highlight
            if (isAdded) {
                this.ctx.fillStyle = 'rgba(46, 160, 67, 0.15)'; // diff-add bg
                this.ctx.fillRect(0, y, w, this.lineHeight);
                // Left gutter marker (green bar)
                this.ctx.fillStyle = 'rgba(46, 160, 67, 0.8)';
                this.ctx.fillRect(0, y, diffGutterW, this.lineHeight);
            } else if (isDeleted) {
                this.ctx.fillStyle = 'rgba(248, 81, 73, 0.15)'; // diff-del bg
                this.ctx.fillRect(0, y, w, this.lineHeight);
                // Left gutter marker (red bar)
                this.ctx.fillStyle = 'rgba(248, 81, 73, 0.8)';
                this.ctx.fillRect(0, y, diffGutterW, this.lineHeight);
            }

            // Navigation highlight flash (when using ▲/▼ buttons)
            if (this._highlightedHunkIdx >= 0 && this._highlightedHunkIdx < this.hunkRanges.length) {
                const hl = this.hunkRanges[this._highlightedHunkIdx];
                if (i >= hl.startIdx && i <= hl.endIdx) {
                    const flashColor = hl.type === 'add'
                        ? 'rgba(46, 160, 67, 0.3)'
                        : 'rgba(248, 81, 73, 0.3)';
                    this.ctx.fillStyle = flashColor;
                    this.ctx.fillRect(0, y, w, this.lineHeight);
                }
            }

            // Deleted-before marker (red triangle indicator)
            if (hasDelBefore) {
                this.ctx.fillStyle = 'rgba(248, 81, 73, 1)';
                // Draw a small red wedge at the top of this line
                this.ctx.fillRect(0, y, diffGutterW, 3);
                // Draw a wider indicator line across
                this.ctx.fillStyle = 'rgba(248, 81, 73, 0.4)';
                this.ctx.fillRect(diffGutterW, y, w - diffGutterW, 1);
            }

            // Line numbers (fixed position, not affected by horizontal scroll)
            this.ctx.fillStyle = '#6e7681'; // muted text
            const numStr = String(lineData.num).padStart(numDigits, ' ');
            this.ctx.fillText(numStr, diffGutterW + 2, y + 4);

            // Content (offset by horizontal scroll)
            this.ctx.fillStyle = isAdded ? '#7ee787' : isDeleted ? '#ffa198' : '#c9d1d9';
            this.ctx.fillText(lineData.content, this.contentX - this.scrollLeft, y + 4);

            // Long line indicator (fade gradient at right edge)
            const contentWidth = this.contentX + lineData.content.length * this.charWidth - this.scrollLeft;
            if (contentWidth > w) {
                const grad = this.ctx.createLinearGradient(w - 30, 0, w, 0);
                grad.addColorStop(0, 'transparent');
                grad.addColorStop(1, 'rgba(15, 15, 25, 0.8)');
                this.ctx.fillStyle = grad;
                this.ctx.fillRect(w - 30, y, 30, this.lineHeight);

                // Right-edge tick to signal more content
                this.ctx.fillStyle = 'rgba(124, 58, 237, 0.4)';
                this.ctx.fillRect(w - 3, y + 3, 2, this.lineHeight - 6);
            }

            // Left-edge fade when scrolled right (content clipped on left)
            if (this.scrollLeft > 0) {
                const contentLeft = this.contentX - this.scrollLeft;
                if (contentLeft < this.contentX) {
                    const gradL = this.ctx.createLinearGradient(this.contentX, 0, this.contentX + 30, 0);
                    gradL.addColorStop(0, 'rgba(15, 15, 25, 0.8)');
                    gradL.addColorStop(1, 'transparent');
                    this.ctx.fillStyle = gradL;
                    this.ctx.fillRect(this.contentX, y, 30, this.lineHeight);
                }
            }
        }

        // ── Horizontal scroll indicator bar at bottom ──
        if (this.maxLineWidth > this.viewportWidth) {
            const maxScrollX = this.maxLineWidth - this.viewportWidth;
            const barWidth = Math.max(40, (this.viewportWidth / this.maxLineWidth) * (w - 40));
            const barLeft = 20 + (this.scrollLeft / maxScrollX) * (w - 40 - barWidth);
            const barY = h - 6;

            // Track
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            this.ctx.beginPath();
            this.ctx.roundRect(20, barY, w - 40, 4, 2);
            this.ctx.fill();

            // Thumb
            this.ctx.fillStyle = this.scrollLeft > 0 ? 'rgba(124, 58, 237, 0.5)' : 'rgba(124, 58, 237, 0.2)';
            this.ctx.beginPath();
            this.ctx.roundRect(barLeft, barY, barWidth, 4, 2);
            this.ctx.fill();
        }
    }
}
