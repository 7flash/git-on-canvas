// @ts-nocheck
/**
 * Production mode detection — checks if we're running on the SaaS deploy.
 *
 * When in production (gitmaps.xyz), certain features are restricted:
 * - File editing/saving is disabled
 * - Git commits are disabled
 * - Local repo paths are hidden
 *
 * These restrictions exist because the SaaS version works with
 * cloned repos, not local file systems.
 */

const PRODUCTION_HOSTS = ['gitmaps.xyz', 'www.gitmaps.xyz'];

/** Check if the app is running in production SaaS mode */
export function isProductionMode(): boolean {
    if (typeof window === 'undefined') return false;
    return PRODUCTION_HOSTS.includes(window.location.hostname);
}

/** Check if editing is allowed (false in production) */
export function isEditingAllowed(): boolean {
    return !isProductionMode();
}

/** Get the production notice HTML for the editor area */
export function getProductionEditorNotice(): string {
    return `
        <div class="production-notice">
            <div class="production-notice-icon">
                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
            </div>
            <h3 class="production-notice-title">Editing is view-only on GitMaps.xyz</h3>
            <p class="production-notice-desc">
                To edit files, save changes, and commit directly — install GitMaps locally:
            </p>
            <code class="production-notice-cmd">npx gitmaps</code>
            <p class="production-notice-sub">
                Local mode gives you full read-write access to your repositories.
            </p>
        </div>
    `;
}
