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
    private viewportHeight: number = 0;
    private options: CanvasTextOptions;
    private container: HTMLElement;
    private hunkRanges: { startIdx: number; endIdx: number; type: 'add' | 'del' }[] = [];

    constructor(container: HTMLElement, options: CanvasTextOptions) {
        this.options = options;
        this.container = container;
        this.lines = options.content.split('\n');

        // Pre-compute visible drawn lines
        for (let i = 0; i < this.lines.length; i++) {
            if (options.visibleLineIndices && !options.visibleLineIndices.has(i)) continue;
            this.drawnLines.push({ index: i, content: this.lines[i], num: i + 1 });
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
        this.ctx.font = '12px "JetBrains Mono", Consolas, monospace';
        this.ctx.textBaseline = 'top';

        // Ensure container is a positioned scroll parent
        container.style.position = 'relative';

        container.appendChild(this.canvas);

        this.viewportHeight = rect.height;

        // Scroll shim — tall div giving the container scrollable height (for native scrollbar)
        const scrollShim = document.createElement('div');
        scrollShim.className = 'canvas-scroll-shim';
        scrollShim.style.height = `${this.drawnLines.length * this.lineHeight}px`;
        scrollShim.style.width = '100%';
        scrollShim.style.pointerEvents = 'none';
        container.appendChild(scrollShim);

        // Change markers gutter (scrollbar-like overlay on right side)
        this._buildChangeGutter(container);

        container.addEventListener('scroll', () => {
            this.scrollTop = container.scrollTop;
            // Pin canvas to the visible area of the scrolling container
            this.canvas.style.top = `${this.scrollTop}px`;
            this.render();
        });

        // Direct wheel handler so mouse wheel scrolling works (viewport-level
        // handler intercepts wheel events, so we must also listen here)
        container.addEventListener('wheel', (e: WheelEvent) => {
            // Don't interfere with Ctrl+scroll zoom
            if (e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            e.stopPropagation();
            const maxScroll = (this.drawnLines.length * this.lineHeight) - this.viewportHeight;
            this.scrollTop = Math.max(0, Math.min(maxScroll, this.scrollTop + e.deltaY));
            container.scrollTop = this.scrollTop;
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
                // Reset transform to identity before re-applying DPR scale
                // (prevents compounding on repeated resize events)
                this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                this.ctx.font = '12px "JetBrains Mono", Consolas, monospace';
                this.ctx.textBaseline = 'top';
                this.render();
            }
        });
        resizeObserver.observe(container);

        this.render();
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

        // Gutter container — overlays on the right side of the card
        const gutter = document.createElement('div');
        gutter.className = 'canvas-change-gutter';
        gutter.style.cssText = `
            position: absolute; top: 0; right: 0; bottom: 0;
            width: 10px; z-index: 5; pointer-events: auto;
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
            marker.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetScroll = hunk.startIdx * this.lineHeight - this.viewportHeight / 4;
                container.scrollTop = Math.max(0, targetScroll);
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
                position: absolute; bottom: 4px; right: 14px;
                display: flex; flex-direction: column; gap: 2px;
                z-index: 6; pointer-events: auto;
            `;

            // Re-pin nav on scroll
            container.addEventListener('scroll', () => {
                navContainer.style.bottom = `${-container.scrollTop + 4}px`;
            });

            let currentHunkIdx = -1;

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
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (direction === 'down') {
                        currentHunkIdx = Math.min(currentHunkIdx + 1, this.hunkRanges.length - 1);
                    } else {
                        currentHunkIdx = Math.max(currentHunkIdx - 1, 0);
                    }
                    const hunk = this.hunkRanges[currentHunkIdx];
                    const targetScroll = hunk.startIdx * this.lineHeight - this.viewportHeight / 4;
                    container.scrollTop = Math.max(0, targetScroll);
                });
                return btn;
            };

            navContainer.appendChild(makeArrow('▲', 'up'));
            navContainer.appendChild(makeArrow('▼', 'down'));
            container.appendChild(navContainer);
        }

        container.appendChild(gutter);
    }

    private render() {
        if (!this.ctx) return;

        const w = this.canvas.width / (window.devicePixelRatio || 1);
        const h = this.canvas.height / (window.devicePixelRatio || 1);

        this.ctx.clearRect(0, 0, w, h);

        const startIndex = Math.max(0, Math.floor(this.scrollTop / this.lineHeight) - 2);
        const endIndex = Math.min(this.drawnLines.length, startIndex + Math.ceil(this.viewportHeight / this.lineHeight) + 4);

        // Left gutter width for diff markers
        const gutterW = 6;

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
                this.ctx.fillRect(0, y, gutterW, this.lineHeight);
            } else if (isDeleted) {
                this.ctx.fillStyle = 'rgba(248, 81, 73, 0.15)'; // diff-del bg
                this.ctx.fillRect(0, y, w, this.lineHeight);
                // Left gutter marker (red bar)
                this.ctx.fillStyle = 'rgba(248, 81, 73, 0.8)';
                this.ctx.fillRect(0, y, gutterW, this.lineHeight);
            }

            // Deleted-before marker (red triangle indicator)
            if (hasDelBefore) {
                this.ctx.fillStyle = 'rgba(248, 81, 73, 1)';
                // Draw a small red wedge at the top of this line
                this.ctx.fillRect(0, y, gutterW, 3);
                // Draw a wider indicator line across
                this.ctx.fillStyle = 'rgba(248, 81, 73, 0.4)';
                this.ctx.fillRect(gutterW, y, w - gutterW, 1);
            }

            // Line numbers
            this.ctx.fillStyle = '#6e7681'; // muted text
            const numStr = String(lineData.num).padStart(4, ' ');
            this.ctx.fillText(numStr, gutterW + 6, y + 4);

            // Content
            this.ctx.fillStyle = isAdded ? '#7ee787' : isDeleted ? '#ffa198' : '#c9d1d9';
            this.ctx.fillText(lineData.content, gutterW + 42, y + 4);
        }
    }
}
