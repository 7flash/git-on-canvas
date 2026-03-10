// @ts-nocheck
/**
 * Settings Modal — gear icon opens a premium settings panel
 * with organized toggle switches and sliders.
 */
import { render } from 'melina/client';
import { getSettings, updateSettings, resetSettings, type GitCanvasSettings } from './settings';

let _modal: HTMLElement | null = null;

// ─── JSX Components ─────────────────────────────────────

function ToggleGroup({ id, value, options }: {
    id: string;
    value: string;
    options: { value: string; label: string }[];
}) {
    return (
        <div className="settings-toggle-group" id={id}>
            {options.map(opt => (
                <button
                    key={opt.value}
                    className={`settings-toggle-btn ${value === opt.value ? 'active' : ''}`}
                    data-value={opt.value}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

function Slider({ id, valueId, min, max, step, value, suffix }: {
    id: string; valueId: string;
    min: number; max: number; step: number;
    value: number; suffix: string;
}) {
    return (
        <div className="settings-slider-group">
            <input type="range" id={id} className="settings-slider"
                min={String(min)} max={String(max)} step={String(step)} value={String(value)} />
            <span className="settings-slider-value" id={valueId}>{value}{suffix}</span>
        </div>
    );
}

function Switch({ id, checked }: { id: string; checked: boolean }) {
    return (
        <label className="settings-switch">
            <input type="checkbox" id={id} checked={checked} />
            <span className="settings-switch-slider"></span>
        </label>
    );
}

function SettingsRow({ label, desc, children }: {
    label: string; desc: string; children: any;
}) {
    return (
        <div className="settings-row">
            <div className="settings-label">
                <span className="settings-label-text">{label}</span>
                <span className="settings-label-desc">{desc}</span>
            </div>
            {children}
        </div>
    );
}

function SettingsSection({ title, children }: { title: string; children: any }) {
    return (
        <div className="settings-section">
            <h3 className="settings-section-title">{title}</h3>
            {children}
        </div>
    );
}

function SettingsPanel({ settings }: { settings: GitCanvasSettings }) {
    const cardCols = Math.round(settings.cardWidth / 7.2);
    return (
        <div className="settings-modal">
            <div className="settings-header">
                <h2 className="settings-title">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                    </svg>
                    Settings
                </h2>
                <button className="settings-close" id="closeSettings">✕</button>
            </div>
            <div className="settings-body">
                {/* Rendering Section */}
                <SettingsSection title="Rendering">
                    <SettingsRow label="Text Rendering" desc="Canvas (fast) or DOM (rich interactions)">
                        <ToggleGroup id="settingRenderMode" value={settings.renderMode}
                            options={[{ value: 'canvas', label: 'Canvas' }, { value: 'dom', label: 'DOM' }]} />
                    </SettingsRow>
                    <SettingsRow label="Font Size" desc="Code font size in pixels">
                        <Slider id="settingFontSize" valueId="fontSizeValue"
                            min={10} max={18} step={1} value={settings.fontSize} suffix="px" />
                    </SettingsRow>
                    <SettingsRow label="Popup Font Size" desc="Font size for hover popup previews">
                        <Slider id="settingPopupFontSize" valueId="popupFontSizeValue"
                            min={10} max={24} step={1} value={settings.popupFontSize} suffix="px" />
                    </SettingsRow>
                    <SettingsRow label="Card Width" desc="Character columns per card (like editors)">
                        <Slider id="settingCardWidth" valueId="cardWidthValue"
                            min={40} max={120} step={5} value={cardCols} suffix=" cols" />
                    </SettingsRow>
                </SettingsSection>

                {/* Interface Section */}
                <SettingsSection title="Interface">
                    <SettingsRow label="Control Mode" desc="Simple: drag=pan / Advanced: space+drag=pan">
                        <ToggleGroup id="settingControlMode" value={settings.controlMode}
                            options={[{ value: 'simple', label: 'Simple' }, { value: 'advanced', label: 'Advanced' }]} />
                    </SettingsRow>
                    <SettingsRow label="Show Minimap" desc="Overview map in the corner">
                        <Switch id="settingMinimap" checked={settings.showMinimap} />
                    </SettingsRow>
                    <SettingsRow label="Show Connections" desc="Lines between importing files">
                        <Switch id="settingConnections" checked={settings.showConnections} />
                    </SettingsRow>
                    <SettingsRow label="Auto-detect Imports" desc="Scan files for imports on load">
                        <Switch id="settingAutoImports" checked={settings.autoDetectImports} />
                    </SettingsRow>
                </SettingsSection>

                {/* Visualization Section */}
                <SettingsSection title="Visualization">
                    <SettingsRow label="Git Heatmap" desc="Color-code cards by commit frequency (H key)">
                        <Switch id="settingHeatmap" checked={settings.heatmapEnabled} />
                    </SettingsRow>
                    <SettingsRow label="Heatmap Range" desc="Time range for commit activity">
                        <Slider id="settingHeatmapDays" valueId="heatmapDaysValue"
                            min={7} max={365} step={7} value={settings.heatmapDays} suffix=" days" />
                    </SettingsRow>
                </SettingsSection>

                {/* Advanced Section */}
                <SettingsSection title="Advanced">
                    <SettingsRow label="Max Visible Lines" desc="Lines shown per card before virtual scroll">
                        <Slider id="settingMaxLines" valueId="maxLinesValue"
                            min={30} max={500} step={10} value={settings.maxVisibleLines} suffix="" />
                    </SettingsRow>
                </SettingsSection>
            </div>
            <div className="settings-footer">
                <button className="settings-reset-btn" id="settingsReset">Reset to Defaults</button>
                <span className="settings-footer-note">Changes are saved automatically</span>
            </div>
        </div>
    );
}

/** Open the settings modal */
export function openSettingsModal(ctx?: any) {
    // Remove existing modal if any
    if (_modal) { _modal.remove(); _modal = null; }

    const settings = getSettings();

    _modal = document.createElement('div');
    _modal.id = 'settingsModal';
    _modal.className = 'settings-modal-backdrop';
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

    document.body.appendChild(_modal);
    render(<SettingsPanel settings={settings} />, _modal);

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

    const popupFontSlider = _modal.querySelector('#settingPopupFontSize') as HTMLInputElement;
    const popupFontValue = _modal.querySelector('#popupFontSizeValue')!;
    popupFontSlider?.addEventListener('input', () => {
        popupFontValue.textContent = `${popupFontSlider.value}px`;
        updateSettings({ popupFontSize: parseInt(popupFontSlider.value) });
    });

    const cardWidthSlider = _modal.querySelector('#settingCardWidth') as HTMLInputElement;
    const cardWidthValue = _modal.querySelector('#cardWidthValue')!;
    cardWidthSlider?.addEventListener('input', () => {
        const cols = parseInt(cardWidthSlider.value);
        const px = Math.round(cols * 7.2);
        cardWidthValue.textContent = `${cols} cols`;
        updateSettings({ cardWidth: px });
        applyCardWidth(px);
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

    // Wire heatmap switch
    const heatmapSwitch = _modal.querySelector('#settingHeatmap') as HTMLInputElement;
    heatmapSwitch?.addEventListener('change', () => {
        updateSettings({ heatmapEnabled: heatmapSwitch.checked });
        const repoPath = ctx?.snap?.()?.context?.repoPath;
        if (repoPath) {
            import('./heatmap').then(async ({ toggleHeatmap, injectHeatmapCSS, isHeatmapActive }) => {
                injectHeatmapCSS();
                // Only toggle if state differs from setting
                if (heatmapSwitch.checked !== isHeatmapActive()) {
                    await toggleHeatmap(repoPath);
                }
            });
        }
    });

    // Wire heatmap days slider
    const heatmapDaysSlider = _modal.querySelector('#settingHeatmapDays') as HTMLInputElement;
    const heatmapDaysValue = _modal.querySelector('#heatmapDaysValue')!;
    heatmapDaysSlider?.addEventListener('input', () => {
        heatmapDaysValue.textContent = `${heatmapDaysSlider.value} days`;
        updateSettings({ heatmapDays: parseInt(heatmapDaysSlider.value) });
        const repoPath = ctx?.snap?.()?.context?.repoPath;
        if (repoPath) {
            import('./heatmap').then(async ({ refreshHeatmap, injectHeatmapCSS }) => {
                injectHeatmapCSS();
                await refreshHeatmap(repoPath);
            });
        }
    });

    // Wire reset
    _modal.querySelector('#settingsReset')!.addEventListener('click', () => {
        const defaults = resetSettings();
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

function applyCardWidth(width: number) {
    document.documentElement.style.setProperty('--card-width', `${width}px`);
    document.querySelectorAll('.file-card').forEach(card => {
        const el = card as HTMLElement;
        if (!el.style.height || el.style.height === '') {
            el.style.width = `${width}px`;
        }
    });
}

/** Apply all settings on startup */
export function applyAllSettings(ctx?: any) {
    const s = getSettings();
    applyFontSize(s.fontSize);
    applyCardWidth(s.cardWidth);
    if (ctx) {
        ctx.useCanvasText = s.renderMode === 'canvas';
    }
    requestAnimationFrame(() => applyMinimap(s.showMinimap));
}
