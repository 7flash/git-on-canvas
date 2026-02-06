/**
 * Local measure utility - nested performance timing
 * Used because the @ments/web package export may vary between versions
 */
export function measure(name, callback) {
    const start = performance.now();
    try {
        const result = callback();
        if (result instanceof Promise) {
            return result.then(val => {
                console.log(`[r] ✓ ${(performance.now() - start).toFixed(2)}ms ${name}`);
                return val;
            });
        }
        console.log(`[r] ✓ ${(performance.now() - start).toFixed(2)}ms ${name}`);
        return result;
    } catch (e) {
        console.error(`[r] ✗ ${name} failed:`, e);
        throw e;
    }
}
