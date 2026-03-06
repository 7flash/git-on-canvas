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

    constructor(container: HTMLElement, options: CanvasTextOptions) {
        this.options = options;
        this.lines = options.content.split('\n');

        // Pre-compute visible drawn lines
        for (let i = 0; i < this.lines.length; i++) {
            if (options.visibleLineIndices && !options.visibleLineIndices.has(i)) continue;
            this.drawnLines.push({ index: i, content: this.lines[i], num: i + 1 });
        }

        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'canvas-text-layer';
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';

        // High DPI support
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        this.ctx = this.canvas.getContext('2d')!;
        this.ctx.scale(dpr, dpr);

        // Setup font
        this.ctx.font = '12px "JetBrains Mono", Consolas, monospace';
        this.ctx.textBaseline = 'top';

        container.appendChild(this.canvas);

        this.viewportHeight = rect.height;

        // Add scroll shim for native scrolling
        const scrollShim = document.createElement('div');
        scrollShim.style.height = `${this.drawnLines.length * this.lineHeight}px`;
        scrollShim.style.width = '1px';
        container.appendChild(scrollShim);

        container.addEventListener('scroll', () => {
            this.scrollTop = container.scrollTop;
            this.render();
        });

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const r = entry.contentRect;
                this.canvas.width = r.width * dpr;
                this.canvas.height = r.height * dpr;
                this.canvas.style.width = `${r.width}px`;
                this.canvas.style.height = `${r.height}px`;
                this.viewportHeight = r.height;
                this.ctx.scale(dpr, dpr);
                this.ctx.font = '12px "JetBrains Mono", Consolas, monospace';
                this.ctx.textBaseline = 'top';
                this.render();
            }
        });
        resizeObserver.observe(container);

        this.render();
    }

    private render() {
        if (!this.ctx) return;

        const w = this.canvas.width / (window.devicePixelRatio || 1);
        const h = this.canvas.height / (window.devicePixelRatio || 1);

        this.ctx.clearRect(0, 0, w, h);

        const startIndex = Math.max(0, Math.floor(this.scrollTop / this.lineHeight) - 2);
        const endIndex = Math.min(this.drawnLines.length, startIndex + Math.ceil(this.viewportHeight / this.lineHeight) + 4);

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
            } else if (isDeleted) {
                this.ctx.fillStyle = 'rgba(248, 81, 73, 0.15)'; // diff-del bg
                this.ctx.fillRect(0, y, w, this.lineHeight);
            }

            // Deleted marker
            if (hasDelBefore) {
                this.ctx.fillStyle = 'rgba(248, 81, 73, 1)';
                // draw small red block at the top edge of this line
                this.ctx.fillRect(0, y, 4, 3);
            }

            // Line numbers
            this.ctx.fillStyle = '#6e7681'; // muted text
            const numStr = String(lineData.num).padStart(4, ' ');
            this.ctx.fillText(numStr, 10, y + 4);

            // Content
            this.ctx.fillStyle = isAdded ? '#7ee787' : isDeleted ? '#ffa198' : '#c9d1d9';
            this.ctx.fillText(lineData.content, 50, y + 4);
        }
    }
}
