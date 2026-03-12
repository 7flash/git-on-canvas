// @ts-nocheck
/**
 * Auto-arrange algorithms for initial canvas layout.
 *
 * arrangeByDirectory: Groups files by their parent directory,
 * lays out each directory as a tight grid block, then positions
 * directory blocks in a treemap-like grid layout.
 *
 * This creates a spatially meaningful layout where files from
 * the same directory are clustered together.
 */
import { measure } from 'measure-fn';
import type { CanvasContext } from './context';
import { savePosition, flushPositions } from './positions';
import { updateMinimap } from './canvas';

interface FileEntry {
    path: string;
    [key: string]: any;
}

interface DirBlock {
    dir: string;
    files: FileEntry[];
    // Computed layout
    cols: number;
    rows: number;
    blockW: number;
    blockH: number;
}

/**
 * Arrange files grouped by directory.
 * Each directory gets a tight grid block, and blocks are arranged
 * in a larger treemap-like layout sorted by size (largest first).
 */
export function arrangeByDirectory(
    files: FileEntry[],
    opts: {
        cardWidth?: number;
        cardHeight?: number;
        fileGap?: number;
        dirGap?: number;
        originX?: number;
        originY?: number;
    } = {},
): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    const {
        cardWidth = 580,
        cardHeight = 700,
        fileGap = 20,
        dirGap = 80,
        originX = 50,
        originY = 50,
    } = opts;

    // Group files by parent directory
    const dirMap = new Map<string, FileEntry[]>();
    for (const f of files) {
        const dir = f.path.includes('/') ? f.path.substring(0, f.path.lastIndexOf('/')) : '.';
        if (!dirMap.has(dir)) dirMap.set(dir, []);
        dirMap.get(dir)!.push(f);
    }

    // Sort directories: largest first, then alphabetical
    const dirs = Array.from(dirMap.entries())
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

    // Compute each directory block dimensions
    const blocks: DirBlock[] = dirs.map(([dir, dirFiles]) => {
        const count = dirFiles.length;
        const cols = Math.max(1, Math.min(count, Math.ceil(Math.sqrt(count))));
        const rows = Math.ceil(count / cols);
        return {
            dir,
            files: dirFiles,
            cols,
            rows,
            blockW: cols * (cardWidth + fileGap) - fileGap,
            blockH: rows * (cardHeight + fileGap) - fileGap,
        };
    });

    // Lay out blocks in a wrapping row layout
    // Target total width ~= sqrt(total area) for a square-ish result
    const totalArea = blocks.reduce((sum, b) => sum + (b.blockW + dirGap) * (b.blockH + dirGap), 0);
    const targetRowWidth = Math.max(3000, Math.sqrt(totalArea) * 1.2);

    let curX = originX;
    let curY = originY;
    let rowMaxH = 0;

    for (const block of blocks) {
        // Wrap to next row if this block would exceed target width
        if (curX > originX && curX + block.blockW > targetRowWidth) {
            curX = originX;
            curY += rowMaxH + dirGap;
            rowMaxH = 0;
        }

        // Place files within this block
        block.files.forEach((f, i) => {
            const col = i % block.cols;
            const row = Math.floor(i / block.cols);
            const x = curX + col * (cardWidth + fileGap);
            const y = curY + row * (cardHeight + fileGap);
            positions.set(f.path, { x, y });
        });

        curX += block.blockW + dirGap;
        rowMaxH = Math.max(rowMaxH, block.blockH);
    }

    return positions;
}

/**
 * Apply auto-arrange to a CanvasContext — rearranges ALL files
 * by directory grouping. Only sets positions for files that
 * don't already have saved positions.
 */
export function autoArrangeIfNew(
    ctx: CanvasContext,
    files: FileEntry[],
    forceAll = false,
): Map<string, { x: number; y: number }> {
    return measure('arrange:byDirectory', () => {
        const positions = arrangeByDirectory(files);
        const commitHash = 'allfiles';

        for (const [path, pos] of positions) {
            const posKey = `${commitHash}:${path}`;
            // Only override if no existing position (or forced)
            if (forceAll || !ctx.positions.has(posKey)) {
                savePosition(ctx, commitHash, path, pos.x, pos.y);
            }
        }

        if (forceAll) {
            flushPositions(ctx);
            updateMinimap(ctx);
        }

        return positions;
    });
}
