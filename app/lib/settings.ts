// @ts-nocheck
/**
 * Settings — persistent user preferences stored in localStorage.
 * All settings have safe defaults and are loaded synchronously.
 */

const STORAGE_KEY = 'gitcanvas:settings';

export interface GitCanvasSettings {
    /** Text rendering mode: 'canvas' (default, fast) or 'dom' (rich, slower) */
    renderMode: 'canvas' | 'dom';
    /** Font size for code display (px) */
    fontSize: number;
    /** Show connection lines between imports */
    showConnections: boolean;
    /** Control mode: 'simple' (drag=pan) or 'advanced' (space+drag=pan) */
    controlMode: 'simple' | 'advanced';
    /** Show minimap */
    showMinimap: boolean;
    /** Card width (px) */
    cardWidth: number;
    /** Max visible lines before virtual scroll kicks in */
    maxVisibleLines: number;
    /** Auto-detect import connections on load */
    autoDetectImports: boolean;
    /** Theme: 'dark' (default) or 'light' */
    theme: 'dark' | 'light';
}

const DEFAULTS: GitCanvasSettings = {
    renderMode: 'canvas',
    fontSize: 12,
    showConnections: true,
    controlMode: 'simple',
    showMinimap: true,
    cardWidth: 540,
    maxVisibleLines: 100,
    autoDetectImports: false,
    theme: 'dark',
};

let _settings: GitCanvasSettings | null = null;

/** Load settings from localStorage (synchronous, uses cache) */
export function getSettings(): GitCanvasSettings {
    if (_settings) return _settings;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            _settings = { ...DEFAULTS, ...parsed };
        } else {
            _settings = { ...DEFAULTS };
        }
    } catch {
        _settings = { ...DEFAULTS };
    }
    return _settings!;
}

/** Update one or more settings and persist */
export function updateSettings(partial: Partial<GitCanvasSettings>): GitCanvasSettings {
    const current = getSettings();
    Object.assign(current, partial);
    _settings = current;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch { }

    // Dispatch custom event so listeners can react
    window.dispatchEvent(new CustomEvent('gitcanvas:settings-changed', { detail: current }));
    return current;
}

/** Reset all settings to defaults */
export function resetSettings(): GitCanvasSettings {
    _settings = { ...DEFAULTS };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_settings));
    } catch { }
    window.dispatchEvent(new CustomEvent('gitcanvas:settings-changed', { detail: _settings }));
    return _settings;
}

/** Get a single setting value */
export function getSetting<K extends keyof GitCanvasSettings>(key: K): GitCanvasSettings[K] {
    return getSettings()[key];
}
