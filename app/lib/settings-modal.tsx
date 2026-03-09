// @ts-nocheck
/**
 * Settings Modal — gear icon opens a premium settings panel
 * with organized toggle switches and sliders.
 */
import { getSettings, updateSettings, resetSettings, type GitCanvasSettings } from './settings';

let _modal: HTMLElement | null = null;

/** Open the settings modal */
export function openSettingsModal(ctx?: any) {
    // Remove existing modal if any
    if (_modal) { _modal.remove(); _modal = null; }

    const settings = getSettings();

    _modal = document.createElement('div');
    _modal.id = 'settingsModal';
    _modal.className = 'settings-modal-backdrop';
    // Force inline positioning to guarantee correct placement regardless of CSS containment
    Object.assign(_modal.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        zIndex: '10000',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    });
    _modal.innerHTML = `
        <div class="settings-modal">
            <div class="settings-header">
                <h2 class="settings-title">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
                    </svg>
                    Settings
                </h2>
                <button class="settings-close" id="closeSettings">✕</button>
            </div>
            <div class="settings-body">
                <!-- Rendering Section -->
                <div class="settings-section">
                    <h3 class="settings-section-title">Rendering</h3>
                    <div class="settings-row">
                        <div class="settings-label">
                            <span class="settings-label-text">Text Rendering</span>
                            <span class="settings-label-desc">Canvas (fast) or DOM (rich interactions)</span>
                        </div>
                        <div class="settings-toggle-group" id="settingRenderMode">
                            <button class="settings-toggle-btn ${settings.renderMode === 'canvas' ? 'active' : ''}" data-value="canvas">Canvas</button>
                            <button class="settings-toggle-btn ${settings.renderMode === 'dom' ? 'active' : ''}" data-value="dom">DOM</button>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <span class="settings-label-text">Font Size</span>
                            <span class="settings-label-desc">Code font size in pixels</span>
                        </div>
                        <div class="settings-slider-group">
                            <input type="range" id="settingFontSize" class="settings-slider" min="10" max="18" step="1" value="${settings.fontSize}" />
                            <span class="settings-slider-value" id="fontSizeValue">${settings.fontSize}px</span>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <span class="settings-label-text">Card Width</span>
                            <span class="settings-label-desc">Default width for file cards</span>
                        </div>
                        <div class="settings-slider-group">
                            <input type="range" id="settingCardWidth" class="settings-slider" min="300" max="900" step="20" value="${settings.cardWidth}" />
                            <span class="settings-slider-value" id="cardWidthValue">${settings.cardWidth}px</span>
                        </div>
                    </div>
                </div>

                <!-- Interface Section -->
                <div class="settings-section">
                    <h3 class="settings-section-title">Interface</h3>
                    <div class="settings-row">
                        <div class="settings-label">
                            <span class="settings-label-text">Control Mode</span>
                            <span class="settings-label-desc">Simple: drag=pan / Advanced: space+drag=pan</span>
                        </div>
                        <div class="settings-toggle-group" id="settingControlMode">
                            <button class="settings-toggle-btn ${settings.controlMode === 'simple' ? 'active' : ''}" data-value="simple">Simple</button>
                            <button class="settings-toggle-btn ${settings.controlMode === 'advanced' ? 'active' : ''}" data-value="advanced">Advanced</button>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <span class="settings-label-text">Show Minimap</span>
                            <span class="settings-label-desc">Overview map in the corner</span>
                        </div>
                        <label class="settings-switch">
                            <input type="checkbox" id="settingMinimap" ${settings.showMinimap ? 'checked' : ''} />
                            <span class="settings-switch-slider"></span>
                        </label>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <span class="settings-label-text">Show Connections</span>
                            <span class="settings-label-desc">Lines between importing files</span>
                        </div>
                        <label class="settings-switch">
                            <input type="checkbox" id="settingConnections" ${settings.showConnections ? 'checked' : ''} />
                            <span class="settings-switch-slider"></span>
                        </label>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <span class="settings-label-text">Auto-detect Imports</span>
                            <span class="settings-label-desc">Scan files for imports on load</span>
                        </div>
                        <label class="settings-switch">
                            <input type="checkbox" id="settingAutoImports" ${settings.autoDetectImports ? 'checked' : ''} />
                            <span class="settings-switch-slider"></span>
                        </label>
                    </div>
                </div>

                <!-- Advanced Section -->
                <div class="settings-section">
                    <h3 class="settings-section-title">Advanced</h3>
                    <div class="settings-row">
                        <div class="settings-label">
                            <span class="settings-label-text">Max Visible Lines</span>
                            <span class="settings-label-desc">Lines shown per card before virtual scroll</span>
                        </div>
                        <div class="settings-slider-group">
                            <input type="range" id="settingMaxLines" class="settings-slider" min="30" max="500" step="10" value="${settings.maxVisibleLines}" />
                            <span class="settings-slider-value" id="maxLinesValue">${settings.maxVisibleLines}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="settings-footer">
                <button class="settings-reset-btn" id="settingsReset">Reset to Defaults</button>
                <span class="settings-footer-note">Changes are saved automatically</span>
            </div>
        </div>
    `;

    document.body.appendChild(_modal);

    // Wire close
    const close = () => { if (_modal) { _modal.remove(); _modal = null; } };
    _modal.querySelector('#closeSettings')!.addEventListener('click', close);
    _modal.addEventListener('click', (e) => { if (e.target === _modal) close(); });
    document.addEventListener('keydown', function onEsc(e) {
        if (e.key === 'Escape' && _modal) { close(); document.removeEventListener('keydown', onEsc); }
    });

    // Wire render mode toggle
    const renderModeBtns = _modal.querySelectorAll('#settingRenderMode .settings-toggle-btn');
    renderModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            renderModeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateSettings({ renderMode: btn.dataset.value as 'canvas' | 'dom' });
            applyRenderMode(ctx, btn.dataset.value as string);
        });
    });

    // Wire control mode toggle
    const controlModeBtns = _modal.querySelectorAll('#settingControlMode .settings-toggle-btn');
    controlModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            controlModeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateSettings({ controlMode: btn.dataset.value as 'simple' | 'advanced' });
            applyControlMode(btn.dataset.value as string);
        });
    });

    // Wire sliders
    const fontSlider = _modal.querySelector('#settingFontSize') as HTMLInputElement;
    const fontValue = _modal.querySelector('#fontSizeValue')!;
    fontSlider?.addEventListener('input', () => {
        fontValue.textContent = `${fontSlider.value}px`;
        updateSettings({ fontSize: parseInt(fontSlider.value) });
        applyFontSize(parseInt(fontSlider.value));
    });

    const cardWidthSlider = _modal.querySelector('#settingCardWidth') as HTMLInputElement;
    const cardWidthValue = _modal.querySelector('#cardWidthValue')!;
    cardWidthSlider?.addEventListener('input', () => {
        cardWidthValue.textContent = `${cardWidthSlider.value}px`;
        updateSettings({ cardWidth: parseInt(cardWidthSlider.value) });
    });

    const maxLinesSlider = _modal.querySelector('#settingMaxLines') as HTMLInputElement;
    const maxLinesValue = _modal.querySelector('#maxLinesValue')!;
    maxLinesSlider?.addEventListener('input', () => {
        maxLinesValue.textContent = maxLinesSlider.value;
        updateSettings({ maxVisibleLines: parseInt(maxLinesSlider.value) });
    });

    // Wire switches
    const minimapSwitch = _modal.querySelector('#settingMinimap') as HTMLInputElement;
    minimapSwitch?.addEventListener('change', () => {
        updateSettings({ showMinimap: minimapSwitch.checked });
        applyMinimap(minimapSwitch.checked);
    });

    const connectionsSwitch = _modal.querySelector('#settingConnections') as HTMLInputElement;
    connectionsSwitch?.addEventListener('change', () => {
        updateSettings({ showConnections: connectionsSwitch.checked });
    });

    const autoImportsSwitch = _modal.querySelector('#settingAutoImports') as HTMLInputElement;
    autoImportsSwitch?.addEventListener('change', () => {
        updateSettings({ autoDetectImports: autoImportsSwitch.checked });
    });

    // Wire reset
    _modal.querySelector('#settingsReset')!.addEventListener('click', () => {
        const defaults = resetSettings();
        // Re-open modal to refresh all values
        close();
        setTimeout(() => openSettingsModal(ctx), 50);
    });
}

// ─── Apply functions ─────────────────────────────────────

function applyRenderMode(ctx: any, mode: string) {
    if (!ctx) return;
    ctx.useCanvasText = mode === 'canvas';
    localStorage.setItem('gitcanvas:useCanvasText', String(ctx.useCanvasText));
    const textToggle = document.getElementById('toggleCanvasText');
    if (textToggle) textToggle.classList.toggle('active', ctx.useCanvasText);
}

function applyControlMode(mode: string) {
    localStorage.setItem('gitcanvas:controlMode', mode);
    const toggle = document.getElementById('toggleControlMode');
    const icon = document.getElementById('controlModeIcon');
    if (toggle) toggle.title = mode === 'simple'
        ? 'Toggle control mode: Simple (drag=pan) / Advanced (space+drag=pan)'
        : 'Toggle control mode: Advanced (space+drag=pan) / Simple (drag=pan)';
}

function applyFontSize(size: number) {
    document.documentElement.style.setProperty('--code-font-size', `${size}px`);
}

function applyMinimap(show: boolean) {
    const minimap = document.getElementById('minimapCanvas') || document.querySelector('.minimap-container');
    if (minimap) (minimap as HTMLElement).style.display = show ? '' : 'none';
}

/** Apply all settings on startup */
export function applyAllSettings(ctx?: any) {
    const s = getSettings();
    applyFontSize(s.fontSize);
    if (ctx) {
        ctx.useCanvasText = s.renderMode === 'canvas';
    }
    // Minimap: delay slightly to wait for DOM
    requestAnimationFrame(() => applyMinimap(s.showMinimap));
}
