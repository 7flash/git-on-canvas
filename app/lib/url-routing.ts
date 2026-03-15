/**
 * URL Routing - Debug and fix auto-load from URL
 */

export function debugURLRouting(): void {
  console.log('[URL Routing] ========== DEBUG ==========');
  console.log('[URL Routing] pathname:', window.location.pathname);
  console.log('[URL Routing] hash:', window.location.hash);
  console.log('[URL Routing] href:', window.location.href);
  
  const rawPath = decodeURIComponent(window.location.pathname.replace(/^\//, ''));
  const pathSlug = rawPath.replace(/^galaxy-canvas\/?/, '');
  const hashSlug = decodeURIComponent(window.location.hash.replace('#', ''));
  const urlSlug = pathSlug || hashSlug;
  
  console.log('[URL Routing] rawPath:', rawPath);
  console.log('[URL Routing] pathSlug:', pathSlug);
  console.log('[URL Routing] hashSlug:', hashSlug);
  console.log('[URL Routing] urlSlug:', urlSlug);
  
  const isGitHubSlug = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(urlSlug) &&
    !urlSlug.includes('\') && !urlSlug.includes(':');
  
  console.log('[URL Routing] isGitHubSlug:', isGitHubSlug);
  
  if (urlSlug) {
    const cached = localStorage.getItem(`gitcanvas:slug:${urlSlug}`);
    console.log('[URL Routing] localStorage cached path:', cached);
  }
  
  console.log('[URL Routing] ========== END DEBUG ==========');
}

export function forceLoadRepo(ctx: any, path: string): void {
  console.log('[URL Routing] forceLoadRepo:', path);
  const { loadRepository } = require('./repo');
  const { updateFavoriteStar } = require('./user');
  
  const landing = document.getElementById('landingOverlay');
  if (landing) landing.style.display = 'none';
  
  const sel = document.getElementById('repoSelect') as HTMLSelectElement;
  if (sel) sel.value = path;
  
  ctx.actor.send({ type: 'LOAD_REPO', path });
  ctx.snap().context.repoPath = path;
  
  loadRepository(ctx, path);
  updateFavoriteStar(path);
}
