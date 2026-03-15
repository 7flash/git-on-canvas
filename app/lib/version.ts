/**
 * Version display - shows commit hash for debugging deployments
 */

const COMMIT_HASH = "463df72"; // Updated on each deploy
const COMMIT_DATE = "2026-03-15";

export function getVersion(): string {
  return COMMIT_HASH;
}

export function getVersionDate(): string {
  return COMMIT_DATE;
}

export function renderVersionBadge(): void {
  const existing = document.getElementById('versionBadge');
  if (existing) existing.remove();

  const badge = document.createElement('div');
  badge.id = 'versionBadge';
  badge.style.cssText = `
    position: fixed;
    bottom: 12px;
    right: 12px;
    padding: 6px 12px;
    background: rgba(30, 41, 59, 0.9);
    border: 1px solid rgba(124, 58, 237, 0.3);
    border-radius: 8px;
    font-size: 10px;
    color: rgba(167, 139, 250, 0.8);
    font-family: 'JetBrains Mono', monospace;
    z-index: 9999;
    backdrop-filter: blur(8px);
    cursor: pointer;
    transition: all 0.2s;
  `;
  badge.innerHTML = `
    <span style="opacity:0.6">GitMaps</span>
    <span style="margin:0 6px">·</span>
    <span style="color:#a78bfa">${COMMIT_HASH}</span>
  `;
  badge.title = `GitMaps ${COMMIT_HASH}\nDeployed: ${COMMIT_DATE}\nClick to copy commit hash`;
  
  badge.addEventListener('click', () => {
    navigator.clipboard.writeText(COMMIT_HASH);
    const { showToast } = require('./utils');
    showToast(`Copied commit ${COMMIT_HASH}`, 'success', 2000);
  });
  
  badge.addEventListener('mouseenter', () => {
    badge.style.background = 'rgba(30, 41, 59, 0.95)';
    badge.style.borderColor = 'rgba(124, 58, 237, 0.6)';
  });
  badge.addEventListener('mouseleave', () => {
    badge.style.background = 'rgba(30, 41, 59, 0.9)';
    badge.style.borderColor = 'rgba(124, 58, 237, 0.3)';
  });
  
  document.body.appendChild(badge);
}
