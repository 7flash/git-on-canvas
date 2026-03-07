/**
 * galaxydraw core unit tests — CanvasState & EventBus
 *
 * Pure logic tests (no DOM). Validates coordinate conversion,
 * zoom clamping, snapshot/subscribe, and pub/sub.
 *
 * Run: bun test app/lib/galaxydraw.test.ts
 */
import { describe, expect, test } from 'bun:test'
import { CanvasState } from 'galaxydraw'
import { EventBus } from 'galaxydraw'

// ─── CanvasState ────────────────────────────────────────

describe('CanvasState', () => {
    test('initial state is zoom=1, offset=0,0', () => {
        const s = new CanvasState()
        expect(s.zoom).toBe(1)
        expect(s.offsetX).toBe(0)
        expect(s.offsetY).toBe(0)
    })

    test('snapshot returns a copy', () => {
        const s = new CanvasState()
        const snap = s.snapshot()
        expect(snap).toEqual({ zoom: 1, offsetX: 0, offsetY: 0 })

        // Mutation doesn't affect original
        snap.zoom = 999
        expect(s.zoom).toBe(1)
    })

    test('set() updates zoom and offset', () => {
        const s = new CanvasState()
        s.set(2, 100, 200)
        expect(s.zoom).toBe(2)
        expect(s.offsetX).toBe(100)
        expect(s.offsetY).toBe(200)
    })

    test('set() clamps zoom to MIN_ZOOM', () => {
        const s = new CanvasState()
        s.set(0.001, 0, 0)
        expect(s.zoom).toBe(s.MIN_ZOOM)
    })

    test('set() clamps zoom to MAX_ZOOM', () => {
        const s = new CanvasState()
        s.set(100, 0, 0)
        expect(s.zoom).toBe(s.MAX_ZOOM)
    })

    test('pan() accumulates delta', () => {
        const s = new CanvasState()
        s.pan(10, 20)
        expect(s.offsetX).toBe(10)
        expect(s.offsetY).toBe(20)
        s.pan(5, -10)
        expect(s.offsetX).toBe(15)
        expect(s.offsetY).toBe(10)
    })

    test('subscribe() is called on set()', () => {
        const s = new CanvasState()
        let callCount = 0
        s.subscribe(() => { callCount++ })
        s.set(2, 0, 0)
        expect(callCount).toBe(1)
    })

    test('unsubscribe works', () => {
        const s = new CanvasState()
        let callCount = 0
        const unsub = s.subscribe(() => { callCount++ })
        s.set(2, 0, 0)
        expect(callCount).toBe(1)
        unsub()
        s.set(3, 0, 0)
        expect(callCount).toBe(1) // No additional call
    })

    test('subscribe() is called on pan()', () => {
        const s = new CanvasState()
        let called = false
        s.subscribe(() => { called = true })
        s.pan(10, 20)
        expect(called).toBe(true)
    })

    test('screenToWorld identity at zoom=1 offset=0 (no viewport)', () => {
        const s = new CanvasState()
        // Without a viewport, rect defaults are 0, so screenToWorld
        // just divides by zoom and subtracts offset
        const p = s.screenToWorld(100, 200)
        expect(p.x).toBe(100)
        expect(p.y).toBe(200)
    })

    test('screenToWorld with zoom=2', () => {
        const s = new CanvasState()
        s.set(2, 0, 0)
        const p = s.screenToWorld(200, 400)
        expect(p.x).toBe(100)
        expect(p.y).toBe(200)
    })

    test('screenToWorld with offset', () => {
        const s = new CanvasState()
        s.set(1, 50, 100)
        const p = s.screenToWorld(150, 200)
        expect(p.x).toBe(100)
        expect(p.y).toBe(100)
    })

    test('worldToScreen identity at zoom=1 offset=0 (no viewport)', () => {
        const s = new CanvasState()
        const p = s.worldToScreen(100, 200)
        expect(p.x).toBe(100)
        expect(p.y).toBe(200)
    })

    test('worldToScreen with zoom=2', () => {
        const s = new CanvasState()
        s.set(2, 0, 0)
        const p = s.worldToScreen(100, 200)
        expect(p.x).toBe(200)
        expect(p.y).toBe(400)
    })

    test('screenToWorld/worldToScreen roundtrip', () => {
        const s = new CanvasState()
        s.set(1.5, 30, -40)
        const world = s.screenToWorld(300, 250)
        const screen = s.worldToScreen(world.x, world.y)
        expect(screen.x).toBeCloseTo(300, 5)
        expect(screen.y).toBeCloseTo(250, 5)
    })
})

// ─── EventBus ───────────────────────────────────────────

describe('EventBus', () => {
    test('on() receives emitted events', () => {
        const bus = new EventBus()
        let received: any = null
        bus.on('canvas:pan', (data) => { received = data })
        bus.emit('canvas:pan', { offsetX: 10, offsetY: 20 })
        expect(received).toEqual({ offsetX: 10, offsetY: 20 })
    })

    test('multiple handlers receive same event', () => {
        const bus = new EventBus()
        let count = 0
        bus.on('canvas:zoom', () => { count++ })
        bus.on('canvas:zoom', () => { count++ })
        bus.emit('canvas:zoom', { zoom: 2, centerX: 0, centerY: 0 })
        expect(count).toBe(2)
    })

    test('unsubscribe via returned function', () => {
        const bus = new EventBus()
        let count = 0
        const unsub = bus.on('canvas:pan', () => { count++ })
        bus.emit('canvas:pan', { offsetX: 0, offsetY: 0 })
        expect(count).toBe(1)
        unsub()
        bus.emit('canvas:pan', { offsetX: 0, offsetY: 0 })
        expect(count).toBe(1)
    })

    test('once() fires only once', () => {
        const bus = new EventBus()
        let count = 0
        bus.once('card:create', () => { count++ })
        bus.emit('card:create', { id: '1', x: 0, y: 0 })
        bus.emit('card:create', { id: '2', x: 0, y: 0 })
        expect(count).toBe(1)
    })

    test('off() without handler removes all handlers for event', () => {
        const bus = new EventBus()
        let count = 0
        bus.on('canvas:pan', () => { count++ })
        bus.on('canvas:pan', () => { count++ })
        bus.off('canvas:pan')
        bus.emit('canvas:pan', { offsetX: 0, offsetY: 0 })
        expect(count).toBe(0)
    })

    test('off() with handler removes only that handler', () => {
        const bus = new EventBus()
        let aCount = 0
        let bCount = 0
        const handlerA = () => { aCount++ }
        const handlerB = () => { bCount++ }
        bus.on('canvas:pan', handlerA)
        bus.on('canvas:pan', handlerB)
        bus.off('canvas:pan', handlerA)
        bus.emit('canvas:pan', { offsetX: 0, offsetY: 0 })
        expect(aCount).toBe(0)
        expect(bCount).toBe(1)
    })

    test('clear() removes all event handlers', () => {
        const bus = new EventBus()
        let count = 0
        bus.on('canvas:pan', () => { count++ })
        bus.on('canvas:zoom', () => { count++ })
        bus.clear()
        bus.emit('canvas:pan', { offsetX: 0, offsetY: 0 })
        bus.emit('canvas:zoom', { zoom: 1, centerX: 0, centerY: 0 })
        expect(count).toBe(0)
    })

    test('emit with no handlers does not throw', () => {
        const bus = new EventBus()
        expect(() => bus.emit('canvas:pan', { offsetX: 0, offsetY: 0 })).not.toThrow()
    })

    test('handler error does not break other handlers', () => {
        const bus = new EventBus()
        let secondCalled = false
        bus.on('canvas:pan', () => { throw new Error('boom') })
        bus.on('canvas:pan', () => { secondCalled = true })
        // Should not throw, errors are caught internally
        bus.emit('canvas:pan', { offsetX: 0, offsetY: 0 })
        expect(secondCalled).toBe(true)
    })
})
