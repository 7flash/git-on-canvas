/**
 * WebGL Toggle — Switch between DOM and WebGL rendering
 *
 * Persists user preference in localStorage.
 * Defaults to DOM for compatibility, WebGL for performance.
 */

const STORAGE_KEY = "gitcanvas:webglEnabled";

export function isWebGLEnabled(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return JSON.parse(stored);
    return false; // Default to DOM for now
  } catch {
    return false;
  }
}

export function setWebGLEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
  console.log(`[webgl] ${enabled ? "Enabled" : "Disabled"}`);
}

export function toggleWebGL(): boolean {
  const enabled = !isWebGLEnabled();
  setWebGLEnabled(enabled);
  return enabled;
}

export function createWebGLToggleUI(): HTMLElement {
  const btn = document.createElement("button");
  btn.id = "webglToggle";
  btn.className = "btn-ghost btn-sm";
  btn.title = "Toggle WebGL rendering (experimental)";

  const enabled = isWebGLEnabled();
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
    </svg>
    WebGL ${enabled ? "ON" : "OFF"}
  `;

  btn.addEventListener("click", () => {
    const enabled = toggleWebGL();
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
      </svg>
      WebGL ${enabled ? "ON" : "OFF"}
    `;

    const { showToast } = require("./utils");
    showToast(
      `WebGL ${enabled ? "enabled" : "disabled"}. Reload to apply.`,
      "info",
      3000,
    );
  });

  return btn;
}
