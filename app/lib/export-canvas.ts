/**
 * Export Canvas — Save canvas layout as image/PDF
 * 
 * Features:
 * - Export as PNG with high resolution
 * - Export visible area or full canvas
 * - Include/hide UI elements
 * - Auto-download or copy to clipboard
 */

import type { CanvasContext } from './context';

export interface ExportOptions {
  format: 'png' | 'jpeg' | 'webp';
  quality: number;
  scale: number;
  includeBackground: boolean;
  visibleOnly: boolean;
}

/**
 * Export canvas to image file
 */
export async function exportCanvasToImage(
  ctx: CanvasContext,
  options: ExportOptions = {
    format: 'png',
    quality: 1,
    scale: 2,
    includeBackground: true,
    visibleOnly: false,
  }
): Promise<void> {
  const { measure } = await import('measure-fn');
  
  return measure('canvas:export', async () => {
    try {
      const canvas = ctx.canvas || ctx.canvasViewport;
      if (!canvas) throw new Error('Canvas not found');

      // Get all file cards
      const cards = Array.from(ctx.fileCards.values());
      if (cards.length === 0) throw new Error('No cards to export');

      // Calculate bounds
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      cards.forEach(card => {
        const x = parseFloat(card.style.left) || 0;
        const y = parseFloat(card.style.top) || 0;
        const w = card.offsetWidth || 580;
        const h = card.offsetHeight || 700;
        
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
      });

      // Add padding
      const padding = 50;
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;

      const width = Math.max(maxX - minX, 1);
      const height = Math.max(maxY - minY, 1);

      // Create export canvas
      const exportCanvas = document.createElement('canvas');
      const scale = options.scale || 2;
      exportCanvas.width = width * scale;
      exportCanvas.height = height * scale;
      
      const exportCtx = exportCanvas.getContext('2d');
      if (!exportCtx) throw new Error('Could not get 2D context');

      // Scale for high DPI
      exportCtx.scale(scale, scale);

      // Background
      if (options.includeBackground) {
        exportCtx.fillStyle = '#0a0a0f';
        exportCtx.fillRect(0, 0, width, height);
      }

      // Translate to origin
      exportCtx.save();
      exportCtx.translate(-minX, -minY);

      // Draw each card
      for (const card of cards) {
        if (options.visibleOnly && !isCardVisible(card)) continue;
        
        await drawCardToCanvas(exportCtx, card, scale);
      }

      exportCtx.restore();

      // Export
      const mimeType = `image/${options.format}`;
      const dataUrl = exportCanvas.toDataURL(mimeType, options.quality);
      
      // Download
      const repoName = ctx.snap().context.repoPath?.split(/[\/]/).pop() || 'canvas';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${repoName}-${timestamp}.${options.format}`;
      
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.click();

      // Show toast
      const { showToast } = await import('./utils');
      showToast(`Exported ${cards.length} cards as ${filename}`, 'success');

    } catch (err: any) {
      const { showToast } = await import('./utils');
      showToast(`Export failed: ${err.message}`, 'error');
      throw err;
    }
  });
}

/**
 * Draw a single card to canvas
 */
async function drawCardToCanvas(
  ctx: CanvasRenderingContext2D,
  card: HTMLElement,
  scale: number
): Promise<void> {
  const x = parseFloat(card.style.left) || 0;
  const y = parseFloat(card.style.top) || 0;
  const width = card.offsetWidth || 580;
  const height = card.offsetHeight || 700;

  // Card background
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  roundRect(ctx, x, y, width, height, 8);
  ctx.fill();

  // Border
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Header
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  roundRect(ctx, x, y, width, 32, [8, 8, 0, 0]);
  ctx.fill();

  // File name
  const fileNameEl = card.querySelector('.file-name') as HTMLElement;
  if (fileNameEl) {
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 11px Inter';
    ctx.fillText(fileNameEl.textContent || '', x + 32, y + 20);
  }

  // Code preview (first 20 lines)
  const codeLines = card.querySelectorAll('.card-line');
  ctx.font = '10px JetBrains Mono';
  ctx.textBaseline = 'top';
  
  codeLines.forEach((lineEl, i) => {
    if (i >= 20) return;
    
    const line = lineEl as HTMLElement;
    const style = window.getComputedStyle(line);
    ctx.fillStyle = style.color;
    
    const text = line.textContent || '';
    ctx.fillText(text.substring(0, 80), x + 12, y + 44 + (i * 16));
  });
}

/**
 * Check if card is visible in viewport
 */
function isCardVisible(card: HTMLElement): boolean {
  const rect = card.getBoundingClientRect();
  return (
    rect.right > 0 &&
    rect.left < window.innerWidth &&
    rect.bottom > 0 &&
    rect.top < window.innerHeight
  );
}

/**
 * Draw rounded rectangle
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number | number[]
): void {
  const radii = Array.isArray(radius) ? radius : [radius, radius, radius, radius];
  
  ctx.beginPath();
  ctx.moveTo(x + radii[0], y);
  ctx.lineTo(x + width - radii[1], y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radii[1]);
  ctx.lineTo(x + width, y + height - radii[2]);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radii[2], y + height);
  ctx.lineTo(x + radii[3], y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radii[3]);
  ctx.lineTo(x, y + radii[0]);
  ctx.quadraticCurveTo(x, y, x + radii[0], y);
  ctx.closePath();
}

/**
 * Export UI component
 */
export function createExportUI(ctx: CanvasContext): HTMLElement {
  const container = document.createElement('div');
  container.className = 'export-ui';
  
  container.innerHTML = `
    <button class="btn-ghost btn-sm" id="exportBtn" title="Export canvas as image">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      Export
    </button>
  `;
  
  const exportBtn = container.querySelector('#exportBtn') as HTMLButtonElement;
  exportBtn.addEventListener('click', () => {
    showExportDialog(ctx);
  });
  
  return container;
}

/**
 * Show export options dialog
 */
async function showExportDialog(ctx: CanvasContext): Promise<void> {
  const { render } = await import('melina/client');
  
  const dialog = document.createElement('div');
  dialog.className = 'export-dialog';
  dialog.innerHTML = `
    <div class="export-backdrop"></div>
    <div class="export-content">
      <h3>Export Canvas</h3>
      <div class="export-options">
        <label>
          Format:
          <select id="exportFormat">
            <option value="png">PNG (Best quality)</option>
            <option value="jpeg">JPEG (Smaller file)</option>
            <option value="webp">WebP (Modern)</option>
          </select>
        </label>
        <label>
          Scale:
          <select id="exportScale">
            <option value="1">1x (Screen resolution)</option>
            <option value="2" selected>2x (High quality)</option>
            <option value="3">3x (Print quality)</option>
          </select>
        </label>
        <label>
          <input type="checkbox" id="exportBackground" checked>
          Include background
        </label>
        <label>
          <input type="checkbox" id="exportVisibleOnly">
          Visible cards only
        </label>
      </div>
      <div class="export-actions">
        <button class="btn-ghost" id="exportCancel">Cancel</button>
     
