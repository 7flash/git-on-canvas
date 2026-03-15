export function debugURLLoad(): void {
  console.log('[URL Debug] ========== PAGE LOAD ==========');
  console.log('[URL Debug] pathname:', window.location.pathname);
  console.log('[URL Debug] hash:', window.location.hash);
  console.log('[URL Debug] href:', window.location.href);
  
  const rawPath = decodeURIComponent(window.location.pathname.replace(/^\//, ''));
  const pathSlug = rawPath.replace(/^galaxy-canvas\/?/, '');
  const hashSlug = decodeURIComponent(window.location.hash.replace('#', ''));
  const urlSlug = pathSlug || hashSlug;
  
  console.log('[URL Debug] rawPath:', rawPath);
  console.log('[URL Debug] pathSlug:', pathSlug);
  console.log('[URL Debug] hashSlug:', hashSlug);
  console.log('[URL Debug] urlSlug:', urlSlug);
  
  if (urlSlug) {
    const cached = localStorage.getItem(`gitcanvas:slug:${urlSlug}`);
    console.log('[URL Debug] localStorage cached path for', urlSlug, ':', cached);
  }
  
  const lastRepo = localStorage.getItem('gitcanvas:lastRepo');
  console.log('[URL Debug] lastRepo:', lastRepo);
  
  console.log('[URL Debug] ========== END DEBUG ==========');
}
