/**
 * Virtual Files — Transclusion-based compression for large files
 * 
 * Detects repeating content in large files and extracts it into virtual cards.
 * Virtual cards are connected to the real file and show on hover.
 * 
 * Use cases:
 * - Log files with repeated timestamps/prefixes
 * - Config files with repeated structures
 * - Code files with boilerplate
 */

import type { CanvasContext } from './context';

export interface VirtualSegment {
  id: string;
  content: string;
  occurrences: number;
  lineNumbers: number[];
  type: 'prefix' | 'repeating' | 'boilerplate';
}

export interface VirtualFile {
  path: string;
  originalPath: string;
  segments: VirtualSegment[];
  compressionRatio: number;
}

// ─── Detection ───────────────────────────────────────────

/**
 * Analyze file content for repeating patterns
 */
export function detectVirtualSegments(content: string, filePath: string): VirtualSegment[] {
  const lines = content.split('\n');
  const segments: VirtualSegment[] = [];
  
  // Skip small files
  if (lines.length < 50) return segments;
  
  // Detect common prefixes (e.g., log timestamps)
  const prefixSegments = detectCommonPrefixes(lines, filePath);
  segments.push(...prefixSegments);
  
  // Detect repeating blocks
  const repeatingSegments = detectRepeatingBlocks(lines, filePath);
  segments.push(...repeatingSegments);
  
  // Sort by compression potential
  segments.sort((a, b) => {
    const aCompression = a.content.length * a.occurrences;
    const bCompression = b.content.length * b.occurrences;
    return bCompression - aCompression;
  });
  
  return segments.slice(0, 5); // Top 5 segments max
}

/**
 * Detect common line prefixes (e.g., "2024-01-15 10:30:45 INFO [MainThread] ")
 */
function detectCommonPrefixes(lines: string[], filePath: string): VirtualSegment[] {
  const prefixMap = new Map<string, number[]>();
  const MIN_PREFIX_LENGTH = 20;
  const MIN_OCCURRENCES = 10;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < MIN_PREFIX_LENGTH) continue;
    
    // Try different prefix lengths
    for (let len = MIN_PREFIX_LENGTH; len <= Math.min(100, line.length); len += 10) {
      const prefix = line.substring(0, len);
      if (!prefixMap.has(prefix)) {
        prefixMap.set(prefix, []);
      }
      prefixMap.get(prefix)!.push(i);
    }
  }
  
  const segments: VirtualSegment[] = [];
  let idCounter = 0;
  
  for (const [prefix, lineNumbers] of prefixMap.entries()) {
    if (lineNumbers.length >= MIN_OCCURRENCES) {
      segments.push({
        id: `virtual-${filePath.replace(/[^a-z0-9]/gi, '-')}-prefix-${idCounter++}`,
        content: prefix,
        occurrences: lineNumbers.length,
        lineNumbers,
        type: 'prefix',
      });
    }
  }
  
  return segments;
}

/**
 * Detect repeating blocks of text
 */
function detectRepeatingBlocks(lines: string[], filePath: string): VirtualSegment[] {
  const blockMap = new Map<string, number[]>();
  const BLOCK_SIZE = 5; // 5 lines
  const MIN_OCCURRENCES = 3;
  
  for (let i = 0; i <= lines.length - BLOCK_SIZE; i++) {
    const block = lines.slice(i, i + BLOCK_SIZE).join('\n');
    if (block.length < 50) continue; // Skip tiny blocks
    
    if (!blockMap.has(block)) {
      blockMap.set(block, []);
    }
    blockMap.get(block)!.push(i);
  }
  
  const segments: VirtualSegment[] = [];
  let idCounter = 0;
  
  for (const [block, lineNumbers] of blockMap.entries()) {
    if (lineNumbers.length >= MIN_OCCURRENCES) {
      segments.push({
        id: `virtual-${filePath.replace(/[^a-z0-9]/gi, '-')}-block-${idCounter++}`,
        content: block,
        occurrences: lineNumbers.length,
        lineNumbers,
        type: 'repeating',
      });
    }
  }
  
  return segments;
}

// ─── Virtual Card Creation ───────────────────────────────

/**
 * Create virtual card element for a segment
 */
export function createVirtualCard(
  ctx: CanvasContext,
  segment: VirtualSegment,
  originalFilePath: string
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'file-card virtual-card';
  card.dataset.virtual = 'true';
  card.dataset.originalPath = originalFilePath;
  card.dataset.segmentId = segment.id;
  
  const typeIcon = segment.type === 'prefix' ? '🔖' : segment.type === 'repeating' ? '🔁' : '📋';
  const compressionRatio = Math.round((1 - 1 / segment.occurrences) * 100);
  
  card.innerHTML = `
    <div class="card-header" style="background: linear-gradient(135deg, rgba(124, 58, 237, 0.2), rgba(59, 130, 246, 0.2)); border-bottom: 1px solid var(--border-primary);">
      <span style="font-size: 14px;">${typeIcon}</span>
      <span style="flex: 1; font-weight: 600; font-size: 11px;">
        ${segment.type === 'prefix' ? 'Common Prefix' : 'Repeating Block'}
      </span>
      <span style="font-size: 10px; color: var(--accent-primary);">
        -${compressionRatio}%
      </span>
    </div>
    <div class="card-body" style="padding: 12px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--text-muted); overflow: hidden;">
      <div style="color: var(--text-primary); margin-bottom: 8px;">
        ${segment.occurrences} occurrences
      </div>
      <div style="background: rgba(0, 0, 0, 0.3); padding: 8px; border-radius: 4px; max-height: 150px; overflow: auto;">
        <code style="white-space: pre-wrap; word-break: break-all; color: #94a3b8;">
          ${escapeHtml(segment.content.substring(0, 500))}${segment.content.length > 500 ? '...' : ''}
        </code>
      </div>
    </div>
  `;
  
  (card as HTMLElement).style.cssText = `
    position: absolute;
    width: 350px;
    background: var(--bg-card);
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    transition: all 0.2s;
  `;
  
  // Hover shows connection to original file
  card.addEventListener('mouseenter', () => {
    highlightConnections(ctx, segment.id, originalFilePath);
  });
  
  card.addEventListener('mouseleave', () => {
    clearConnectionHighlights(ctx);
  });
  
  return card;
}

// ─── Connection Highlighting ─────────────────────────────

function highlightConnections(
  ctx: CanvasContext,
  segmentId: string,
  originalFilePath: string
): void {
  // Highlight virtual card
  const virtualCard = document.querySelector(`[data-segment-id="${segmentId}"]`) as HTMLElement;
  if (virtualCard) {
    virtualCard.style.boxShadow = '0 0 20px var(--accent-glow)';
    virtualCard.style.borderColor = 'var(--accent-primary)';
  }
  
  // Highlight original file card
  const originalCard = Array.from(ctx.fileCards.values()).find(
    card => card.dataset.path === originalFilePath
  );
  if (originalCard) {
    (originalCard as HTMLElement).style.boxShadow = '0 0 20px var(--accent-glow)';
    (originalCard as HTMLElement).style.borderColor = 'var(--accent-primary)';
  }
  
  // Draw connection line
  if (virtualCard && originalCard) {
    drawConnectionLine(virtualCard, originalCard as HTMLElement);
  }
}

function clearConnectionHighlights(ctx: CanvasContext): void {
  // Remove highlights from all virtual cards
  document.querySelectorAll('.virtual-card').forEach(card => {
    (card as HTMLElement).style.boxShadow = '';
    (card as HTMLElement).style.borderColor = '';
  });
  
  // Remove highlights from original cards
  ctx.fileCards.forEach(card => {
    card.style.boxShadow = '';
    card.style.borderColor = '';
  });
  
  // Remove connection lines
  const overlay = document.getElementById('connectionsOverlay') as unknown as SVGSVGElement | null;
  if (overlay) {
    overlay.querySelectorAll('.virtual-connection').forEach(line => line.remove());
  }
}

function drawConnectionLine(from: HTMLElement, to: HTMLElement): void {
  const overlay = document.getElementById('connectionsOverlay') as unknown as SVGSVGElement | null;
  if (!overlay) return;
  
  const fromRect = from.getBoundingClientRect();
  const toRect = to.getBoundingClientRect();
  const viewport = overlay.getBoundingClientRect();
  
  const x1 = fromRect.left + fromRect.width / 2 - viewp
