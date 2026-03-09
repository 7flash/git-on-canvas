// @ts-nocheck
/**
 * Auto-save drafts for the file editor modal.
 * Stores unsaved edits in localStorage so they survive page refresh,
 * accidental close, or browser crash.
 *
 * Draft key: `gitcanvas:draft:<repoPath>:<filePath>`
 * Each draft stores: { content, timestamp, originalContent }
 */

const DRAFT_PREFIX = 'gitcanvas:draft:';
const AUTO_SAVE_INTERVAL_MS = 3000; // save draft every 3 seconds if dirty
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // expire after 7 days

let _autoSaveTimer: any = null;
let _lastSavedContent: string | null = null;

/** Build the localStorage key for a draft */
function draftKey(repoPath: string, filePath: string): string {
    return `${DRAFT_PREFIX}${repoPath}:${filePath}`;
}

export interface DraftData {
    content: string;
    timestamp: number;
    originalContent: string;
}

/** Save a draft to localStorage */
export function saveDraft(repoPath: string, filePath: string, content: string, originalContent: string): void {
    if (content === originalContent) {
        // No changes — remove any existing draft
        clearDraft(repoPath, filePath);
        return;
    }
    try {
        const key = draftKey(repoPath, filePath);
        const draft: DraftData = {
            content,
            timestamp: Date.now(),
            originalContent,
        };
        localStorage.setItem(key, JSON.stringify(draft));
        _lastSavedContent = content;
    } catch {
        // localStorage full or unavailable — silently skip
    }
}

/** Load a draft from localStorage (returns null if none or expired) */
export function loadDraft(repoPath: string, filePath: string): DraftData | null {
    try {
        const key = draftKey(repoPath, filePath);
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const draft: DraftData = JSON.parse(raw);

        // Skip if expired
        if (Date.now() - draft.timestamp > DRAFT_MAX_AGE_MS) {
            localStorage.removeItem(key);
            return null;
        }

        return draft;
    } catch {
        return null;
    }
}

/** Clear a draft (called on explicit save or discard) */
export function clearDraft(repoPath: string, filePath: string): void {
    try {
        const key = draftKey(repoPath, filePath);
        localStorage.removeItem(key);
    } catch { }
    _lastSavedContent = null;
}

/** Start auto-save timer for the current editor session */
export function startAutoSave(
    repoPath: string,
    filePath: string,
    getContent: () => string,
    originalContent: string
): void {
    stopAutoSave();
    _lastSavedContent = null;

    _autoSaveTimer = setInterval(() => {
        const current = getContent();
        // Only write if content actually changed since last auto-save
        if (current !== _lastSavedContent) {
            saveDraft(repoPath, filePath, current, originalContent);
        }
    }, AUTO_SAVE_INTERVAL_MS);
}

/** Stop the auto-save timer */
export function stopAutoSave(): void {
    if (_autoSaveTimer) {
        clearInterval(_autoSaveTimer);
        _autoSaveTimer = null;
    }
    _lastSavedContent = null;
}

/** Check if a draft exists (quick check without parsing) */
export function hasDraft(repoPath: string, filePath: string): boolean {
    try {
        return localStorage.getItem(draftKey(repoPath, filePath)) !== null;
    } catch {
        return false;
    }
}

/** Clean up all expired drafts (call on app startup) */
export function cleanExpiredDrafts(): void {
    try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(DRAFT_PREFIX)) keys.push(key);
        }
        for (const key of keys) {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                const draft = JSON.parse(raw);
                if (Date.now() - draft.timestamp > DRAFT_MAX_AGE_MS) {
                    localStorage.removeItem(key);
                }
            } catch {
                localStorage.removeItem(key);
            }
        }
    } catch { }
}
