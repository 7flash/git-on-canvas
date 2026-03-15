/**
 * Large Repo Optimizations — Progressive card loading for 500+ file repos
 * 
 * Strategies:
 * 1. Load only visible cards + nearby cards initially
 * 2. Defer cards > 2 viewport widths away
 * 3. Progressive loading as user pans
 * 4. Aggressive culling at low zoom for huge repos
 */

const LARGE_REPO_THRESHOLD = 500;
const PROGRESSIVE_LOAD_RADIUS = 2.0; // viewport widths

export function isLargeRepo(fileCount: number): boolean {
  return fileCount >= LARGE_REPO_THRESHOLD;
}

export function shouldDeferCard(cardX: number, cardY: number, viewportCenterX: number, viewportCenterY: number, viewportWidth: number, viewportHeight: number): boolean {
  const dx = Math.abs(cardX - viewportCenterX);
  const dy = Math.abs(cardY - viewportCenterY);
  const maxDistX = viewportWidth * PROGRESSIVE_LOAD_RADIUS;
  const maxDistY = viewportHeight * PROGRESSIVE_LOAD_RADIUS;
  
  return dx > maxDistX || dy > maxDistY;
}

export function getLODThreshold(fileCount: number): number {
  if (fileCount >= 2000) return 0.15; // Very aggressive culling
  if (fileCount >= 1000) return 0.20; // Aggressive culling
  return 0.25; // Default
}

export function getProgressiveBatchSize(fileCount: number): number {
  if (fileCount >= 2000) return 50;  // Load 50 cards at a time
  if (fileCount >= 1000) return 100; // Load 100 cards at a time
  return 200; // Load 200 cards at a time
}
