/**
 * GalaxyDraw Performance Benchmarks
 *
 * Pure logic profiling — no DOM required.
 * Measures the critical code paths for large repositories (1K–10K cards):
 * - Card defer (bulk Map registration)
 * - materializeInRect (viewport intersection scan)
 * - CanvasState coordinate conversions at scale
 * - getVisibleWorldRect + fitRect computations
 *
 * Run: bun test packages/galaxydraw/perf.test.ts
 */
import { describe, expect, test } from 'bun:test';
import { CanvasState } from './src/core/state';
import { CardManager } from './src/core/cards';
import { EventBus } from './src/core/events';
import type { CardPlugin, CardData } from './src/core/cards';

// ── Synthetic file positions (grid layout like GitMaps) ──
function generateFileGrid(count: number, colWidth = 600, rowHeight = 720, gap = 20) {
    const cols = Math.ceil(Math.sqrt(count));
    return Array.from({ length: count }, (_, i) => ({
        id: `file-${i}`,
        x: (i % cols) * (colWidth + gap),
        y: Math.floor(i / cols) * (rowHeight + gap),
        width: colWidth,
        height: rowHeight,
    }));
}

// ── Timing utility ────────────────────────────────────────
function bench(label: string, fn: () => void, iterations = 5): number {
    // Dry run (warm up JIT)
    fn();
    const start = performance.now();
    for (let i = 0; i < iterations; i++) fn();
    const avg = (performance.now() - start) / iterations;
    console.log(`  ⏱  ${label}: ${avg.toFixed(3)}ms`);
    return avg;
}

// ── AABB intersection (same algorithm as materializeInRect) ──
function intersectsViewport(
    cardX: number, cardY: number, cardW: number, cardH: number,
    vLeft: number, vTop: number, vRight: number, vBottom: number,
): boolean {
    return cardX + cardW > vLeft && cardX < vRight && cardY + cardH > vTop && cardY < vBottom;
}

// ──────────────────────────────────────────────────────────
describe('Performance: CanvasState', () => {
    test('screenToWorld × 100K', () => {
        const state = new CanvasState();
        state.zoom = 0.35;
        state.offsetX = -2400;
        state.offsetY = -1800;

        const OPS = 100_000;
        const t = bench(`screenToWorld × ${OPS.toLocaleString()}`, () => {
            for (let i = 0; i < OPS; i++) {
                state.screenToWorld(i * 0.02, i * 0.01);
            }
        });
        expect(t).toBeLessThan(50);
    });

    test('worldToScreen × 100K', () => {
        const state = new CanvasState();
        state.set(0.25, -5000, -3000);

        const OPS = 100_000;
        const t = bench(`worldToScreen × ${OPS.toLocaleString()}`, () => {
            for (let i = 0; i < OPS; i++) {
                state.worldToScreen(i * 10, i * 7);
            }
        });
        expect(t).toBeLessThan(50);
    });

    test('pan() × 100K', () => {
        const state = new CanvasState();
        const OPS = 100_000;
        const t = bench(`pan() × ${OPS.toLocaleString()}`, () => {
            for (let i = 0; i < OPS; i++) {
                state.pan(1, 1);
            }
        });
        expect(t).toBeLessThan(50);
    });

    test('set() with subscriber × 100K', () => {
        const state = new CanvasState();
        let notified = 0;
        state.subscribe(() => { notified++; });

        const OPS = 100_000;
        const t = bench(`set() + subscriber × ${OPS.toLocaleString()}`, () => {
            for (let i = 0; i < OPS; i++) {
                state.set(1 + (i % 100) * 0.01, i, i >> 1);
            }
        });
        expect(t).toBeLessThan(50);
        expect(notified).toBeGreaterThan(0);
    });

    test('fitRect × 10K', () => {
        const state = new CanvasState();
        const OPS = 10_000;
        const t = bench(`fitRect() × ${OPS.toLocaleString()}`, () => {
            for (let i = 0; i < OPS; i++) {
                state.fitRect(0, 0, 1000 + i, 800 + i, 60);
            }
        });
        expect(t).toBeLessThan(50);
    });
});

// ──────────────────────────────────────────────────────────
describe('Performance: Viewport intersection scan', () => {
    // This exercises the exact same AABB logic used by materializeInRect
    // and ViewportCuller.perform — but without DOM.

    const SIZES = [100, 500, 1_000, 5_000, 10_000];

    for (const count of SIZES) {
        test(`scan ${count.toLocaleString()} cards against viewport`, () => {
            const files = generateFileGrid(count);

            // Simulate viewport at origin, ~2 screens wide
            const vLeft = -500, vTop = -500, vRight = 3000, vBottom = 2000;

            let visible = 0;
            const t = bench(`AABB scan × ${count.toLocaleString()}`, () => {
                visible = 0;
                for (const f of files) {
                    if (intersectsViewport(f.x, f.y, f.width, f.height, vLeft, vTop, vRight, vBottom)) {
                        visible++;
                    }
                }
            });

            console.log(`    → ${visible} visible / ${count} total`);
            expect(visible).toBeGreaterThan(0);
            expect(visible).toBeLessThan(count);
            expect(t).toBeLessThan(count * 0.002); // < 2µs per card
        });
    }

    test('scan 10K with shifted viewport (deep scroll)', () => {
        const files = generateFileGrid(10_000);

        // Simulate having scrolled to the middle of a 10K grid
        const cols = Math.ceil(Math.sqrt(10_000)); // ~100
        const midCol = Math.floor(cols / 2);
        const midRow = Math.floor(cols / 2);
        const vLeft = midCol * 620 - 1000;
        const vTop = midRow * 740 - 500;
        const vRight = vLeft + 3000;
        const vBottom = vTop + 2000;

        let visible = 0;
        const t = bench('AABB scan 10K (mid-scroll)', () => {
            visible = 0;
            for (const f of files) {
                if (intersectsViewport(f.x, f.y, f.width, f.height, vLeft, vTop, vRight, vBottom)) {
                    visible++;
                }
            }
        });

        console.log(`    → ${visible} visible / 10000 total (mid-scroll)`);
        expect(t).toBeLessThan(20);
    });
});

// ──────────────────────────────────────────────────────────
describe('Performance: Map operations (defer simulation)', () => {
    const SIZES = [1_000, 5_000, 10_000];

    for (const count of SIZES) {
        test(`Map.set + Map.delete cycle × ${count.toLocaleString()}`, () => {
            const files = generateFileGrid(count);
            const deferred = new Map<string, typeof files[0]>();

            // Defer
            const tDefer = bench(`defer ${count.toLocaleString()} cards`, () => {
                deferred.clear();
                for (const f of files) {
                    deferred.set(f.id, f);
                }
            });

            expect(deferred.size).toBe(count);
            expect(tDefer).toBeLessThan(count * 0.01);

            // Materialize subset (simulates viewport intersection)
            const vLeft = -500, vTop = -500, vRight = 3000, vBottom = 2000;
            const toRemove: string[] = [];

            const tMaterialize = bench(`scan+remove from ${count.toLocaleString()}`, () => {
                toRemove.length = 0;
                for (const [id, entry] of deferred) {
                    if (intersectsViewport(entry.x, entry.y, entry.width, entry.height, vLeft, vTop, vRight, vBottom)) {
                        toRemove.push(id);
                    }
                }
                for (const id of toRemove) deferred.delete(id);
            });

            console.log(`    → removed ${toRemove.length} from deferred (remaining: ${deferred.size})`);
            expect(tMaterialize).toBeLessThan(count * 0.005);
        });
    }
});

// ──────────────────────────────────────────────────────────
describe('Performance: End-to-end pipeline summary', () => {
    test('10K file repository — full results', () => {
        const COUNT = 10_000;
        const files = generateFileGrid(COUNT);
        const state = new CanvasState();
        state.set(0.15, -2000, -1500); // Zoomed out, scrolled

        const timings: Record<string, number> = {};
        const deferred = new Map<string, typeof files[0]>();

        // Phase 1: Grid generation
        const t0 = performance.now();
        const grid = generateFileGrid(COUNT);
        timings['Grid generation'] = performance.now() - t0;

        // Phase 2: Defer all
        const t1 = performance.now();
        for (const f of grid) deferred.set(f.id, f);
        timings['Defer to Map'] = performance.now() - t1;

        // Phase 3: Viewport scan
        const vLeft = -500, vTop = -500, vRight = 4000, vBottom = 3000;
        const visible: typeof files = [];
        const t2 = performance.now();
        for (const [, f] of deferred) {
            if (intersectsViewport(f.x, f.y, f.width, f.height, vLeft, vTop, vRight, vBottom)) {
                visible.push(f);
            }
        }
        timings['Viewport scan'] = performance.now() - t2;

        // Phase 4: Remove materialized from deferred
        const t3 = performance.now();
        for (const f of visible) deferred.delete(f.id);
        timings['Prune deferred'] = performance.now() - t3;

        // Phase 5: Simulate 50 scroll-triggered scans
        const t4 = performance.now();
        for (let i = 0; i < 50; i++) {
            const shifted = vLeft + i * 620;
            let cnt = 0;
            for (const [, f] of deferred) {
                if (intersectsViewport(f.x, f.y, f.width, f.height, shifted, vTop, shifted + 3500, vBottom)) {
                    cnt++;
                }
            }
        }
        timings['50 scroll scans'] = performance.now() - t4;

        // Report
        console.log(`\n  ┌──────────────────────────────────────────────────┐`);
        console.log(`  │  GalaxyDraw 10K Repository Benchmark             │`);
        console.log(`  ├──────────────────────────────────────────────────┤`);
        for (const [label, ms] of Object.entries(timings)) {
            console.log(`  │  ${label.padEnd(20)} ${ms.toFixed(3).padStart(10)}ms               │`);
        }
        console.log(`  ├──────────────────────────────────────────────────┤`);
        console.log(`  │  Visible on load:     ${visible.length.toString().padStart(6)} / ${COUNT}            │`);
        console.log(`  │  Deferred remaining:  ${deferred.size.toString().padStart(6)} / ${COUNT}            │`);
        console.log(`  │  Total pipeline:      ${Object.values(timings).reduce((a, b) => a + b).toFixed(3).padStart(10)}ms               │`);
        console.log(`  └──────────────────────────────────────────────────┘\n`);

        const total = Object.values(timings).reduce((a, b) => a + b);
        expect(total).toBeLessThan(500); // Full pipeline under 500ms
        expect(visible.length).toBeGreaterThan(0);
        expect(deferred.size).toBeLessThan(COUNT);
    });
});
