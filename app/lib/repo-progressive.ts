/**
 * Progressive File Loading — Optimized rendering for large repos (500+ files)
 * 
 * Loads only visible cards initially, defers off-screen cards,
 * and progressively loads as user pans/zooms.
 */

import type { CanvasContext } from './context';
import { measure } from 'measure-fn';
import { createAllFileCard } from './cards';
import { getPositionKey, setPathExpandedInPositions } from './positions';

const LARGE_REPO_THRESHOLD = 500;
const PROGRESSIVE_BATCH_SIZE = 100;
const LOAD_RADIUS = 2.0; // viewport widths

export function isLargeRepo(fileCount: number): boolean {
  return fileCount >= LARGE_REPO_THRESHOLD;
}

export function shouldDeferCard(
  cardX: number,
  cardY: number,
  viewportCenterX: number,
  viewportCenterY: number,
  viewportWidth: number,
  viewportHeight: number
): boolean {
  const dx = Math.abs(cardX - viewportCenterX);
  const dy = Math.abs(cardY - viewportCenterY);
  const maxDistX = viewportWidth * LOAD_RADIUS;
  const maxDistY = viewportHeight * LOAD_RADIUS;
  
  return dx > maxDistX || dy > maxDistY;
}

export async function renderAllFilesProgressive(
  ctx: CanvasContext,
  files: any[]
): Promise<void> {
  return measure('canvas:renderProgressive', async () => {
    const isLarge = isLargeRepo(files.length);
    console.log(`[progressive] Loading ${files.length} files (large: ${isLarge})`);
    
    // Get viewport info
    const vpEl = ctx.canvasViewport;
    const vpW = vpEl?.clientWidth || window.innerWidth;
    const vpH = vpEl?.clientHeight || window.innerHeight;
    const state = ctx.snap().context;
    const zoom = state.zoom || 1;
    const offsetX = state.offsetX || 0;
    const offsetY = state.offsetY || 0;
    
    const viewportCenterX = (-offsetX + vpW / 2) / zoom;
    const viewportCenterY = (-offsetY + vpH / 2) / zoom;
    
    // Separate visible and deferred files
    const visibleFiles: any[] = [];
    const deferredFiles: any[] = [];
    
    files.forEach((file) => {
      const posKey = getPositionKey('allfiles', file.path);
      const pos = ctx.positions.get(posKey);
      const x = pos?.x || 50;
      const y = pos?.y || 50;
      
      if (isLarge && shouldDeferCard(x, y, viewportCenterX, viewportCenterY, vpW, vpH)) {
        deferredFiles.push(file);
        ctx.deferredCards.set(file.path, { x, y, file });
      } else {
        visibleFiles.push(file);
      }
    });
    
    console.log(`[progressive] Visible: ${visibleFiles.length}, Deferred: ${deferredFiles.length}`);
    
    // Load visible files immediately
    await loadFileBatch(ctx, visibleFiles);
    
    // Progressive loading for deferred files
    if (deferredFiles.length > 0) {
      // Load in batches on animation frames
      let batchIndex = 0;
      const loadNextBatch = () => {
        const start = batchIndex * PROGRESSIVE_BATCH_SIZE;
        const end = Math.min(start + PROGRESSIVE_BATCH_SIZE, deferredFiles.length);
        const batch = deferredFiles.slice(start, end);
        
        console.log(`[progressive] Loading batch ${batchIndex + 1} (${batch.length} files)`);
        loadFileBatch(ctx, batch);
        
        batchIndex++;
        if (batchIndex * PROGRESSIVE_BATCH_SIZE < deferredFiles.length) {
          requestAnimationFrame(loadNextBatch);
        }
      };
      
      // Start loading after a short delay
      setTimeout(() => loadNextBatch(), 500);
    }
  });
}

async function loadFileBatch(ctx: CanvasContext, files: any[]): Promise<void> {
  const { createAllFileCard } = require('./cards');
  const { performViewportCulling } = require('./viewport-culling');
  
  files.forEach((file) => {
    const card = createAllFileCard(ctx, file);
    if (card) {
      ctx.canvasContent.appendChild(card);
      ctx.fileCards.set(file.path, card);
      ctx.deferredCards.delete(file.path);
    }
  });
  
  // Re-run culling after loading batch
  performViewportCulling(ctx);
}
