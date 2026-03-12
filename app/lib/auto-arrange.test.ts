/**
 * Tests for auto-arrange layout algorithms.
 * Run with: bun test app/lib/auto-arrange.test.ts
 */
import { describe, expect, test } from 'bun:test';
import { arrangeByDirectory } from './auto-arrange';

// ─── Helpers ────────────────────────────────────────────

function makeFiles(paths: string[]) {
    return paths.map(path => ({ path, content: '' }));
}

// ─── arrangeByDirectory ─────────────────────────────────

describe('arrangeByDirectory', () => {
    test('returns position for every file', () => {
        const files = makeFiles(['src/a.ts', 'src/b.ts', 'lib/c.ts']);
        const positions = arrangeByDirectory(files);
        expect(positions.size).toBe(3);
        expect(positions.has('src/a.ts')).toBe(true);
        expect(positions.has('src/b.ts')).toBe(true);
        expect(positions.has('lib/c.ts')).toBe(true);
    });

    test('groups files from same directory together', () => {
        const files = makeFiles(['src/a.ts', 'src/b.ts', 'src/c.ts', 'lib/x.ts']);
        const positions = arrangeByDirectory(files);

        const srcPositions = ['src/a.ts', 'src/b.ts', 'src/c.ts'].map(p => positions.get(p)!);
        const libPos = positions.get('lib/x.ts')!;

        // src files should be close together (within one block)
        const srcXs = srcPositions.map(p => p.x);
        const srcYs = srcPositions.map(p => p.y);
        const srcSpanX = Math.max(...srcXs) - Math.min(...srcXs);
        const srcSpanY = Math.max(...srcYs) - Math.min(...srcYs);

        // Span should be small — within one block (3 files, likely 2 cols)
        expect(srcSpanX).toBeLessThan(2000);
        expect(srcSpanY).toBeLessThan(2000);

        // lib file should NOT overlap with src block
        const srcMinX = Math.min(...srcXs);
        const srcMaxX = Math.max(...srcXs) + 580; // card width
        const srcMinY = Math.min(...srcYs);
        const srcMaxY = Math.max(...srcYs) + 700; // card height

        // lib should be outside the src bounding box (separated by dirGap)
        const isOutside = libPos.x >= srcMaxX || libPos.x + 580 <= srcMinX ||
            libPos.y >= srcMaxY || libPos.y + 700 <= srcMinY;
        expect(isOutside).toBe(true);
    });

    test('handles single file', () => {
        const files = makeFiles(['README.md']);
        const positions = arrangeByDirectory(files);
        expect(positions.size).toBe(1);
        const pos = positions.get('README.md')!;
        expect(pos.x).toBeGreaterThanOrEqual(0);
        expect(pos.y).toBeGreaterThanOrEqual(0);
    });

    test('handles root-level files (no directory)', () => {
        const files = makeFiles(['README.md', 'package.json', '.gitignore']);
        const positions = arrangeByDirectory(files);
        // All should be in the "." directory group
        expect(positions.size).toBe(3);
    });

    test('no two files share the same position', () => {
        const paths = [];
        for (let i = 0; i < 50; i++) {
            const dir = `dir${i % 5}`;
            paths.push(`${dir}/file${i}.ts`);
        }
        const files = makeFiles(paths);
        const positions = arrangeByDirectory(files);

        const posStrings = new Set<string>();
        for (const [, pos] of positions) {
            const key = `${pos.x},${pos.y}`;
            expect(posStrings.has(key)).toBe(false);
            posStrings.add(key);
        }
    });

    test('respects custom origin', () => {
        const files = makeFiles(['a.ts']);
        const positions = arrangeByDirectory(files, { originX: 500, originY: 300 });
        const pos = positions.get('a.ts')!;
        expect(pos.x).toBe(500);
        expect(pos.y).toBe(300);
    });

    test('respects custom card dimensions', () => {
        const files = makeFiles(['src/a.ts', 'src/b.ts']);
        const positions = arrangeByDirectory(files, { cardWidth: 200, fileGap: 10 });
        const posA = positions.get('src/a.ts')!;
        const posB = positions.get('src/b.ts')!;

        // With 2 files in 1 dir, they should be in a row
        // Gap between them should be based on card width + gap
        const dx = Math.abs(posB.x - posA.x);
        expect(dx).toBe(210); // 200 + 10
    });

    test('larger directories get more columns', () => {
        // 9 files should get ceil(sqrt(9)) = 3 columns
        const files = makeFiles(Array.from({ length: 9 }, (_, i) => `src/f${i}.ts`));
        const positions = arrangeByDirectory(files);

        const xs = new Set<number>();
        for (const [, pos] of positions) {
            xs.add(pos.x);
        }
        expect(xs.size).toBe(3); // 3 unique x positions = 3 columns
    });

    test('handles deeply nested paths', () => {
        const files = makeFiles([
            'src/components/ui/Button.tsx',
            'src/components/ui/Modal.tsx',
            'src/lib/utils/helpers.ts',
        ]);
        const positions = arrangeByDirectory(files);
        expect(positions.size).toBe(3);

        // Button and Modal should be grouped (same dir: src/components/ui)
        const btnPos = positions.get('src/components/ui/Button.tsx')!;
        const modalPos = positions.get('src/components/ui/Modal.tsx')!;
        // They share a directory so should be adjacent
        const distance = Math.hypot(modalPos.x - btnPos.x, modalPos.y - btnPos.y);
        expect(distance).toBeLessThan(1500);
    });

    test('empty input returns empty map', () => {
        const positions = arrangeByDirectory([]);
        expect(positions.size).toBe(0);
    });

    test('directories sorted largest-first', () => {
        // 5 files in "big/", 1 file in "small/"
        const files = makeFiles([
            'big/a.ts', 'big/b.ts', 'big/c.ts', 'big/d.ts', 'big/e.ts',
            'small/x.ts',
        ]);
        const positions = arrangeByDirectory(files);

        // "big" directory should come first (top-left area)
        const bigMinX = Math.min(...['big/a.ts', 'big/b.ts', 'big/c.ts', 'big/d.ts', 'big/e.ts']
            .map(p => positions.get(p)!.x));
        const smallX = positions.get('small/x.ts')!.x;

        // big should start at origin, small should be offset
        expect(bigMinX).toBeLessThanOrEqual(smallX);
    });
});
