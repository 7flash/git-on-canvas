// @ts-nocheck
import { render } from 'melina/client';
import type { CanvasContext } from './context';
import { renderAllFilesOnCanvas } from './repo';

export interface FileSection {
    startString: string;
    endString: string;
}

export interface LayerData {
    id: string;
    name: string;
    files: Record<string, { sections: FileSection[] }>;
}

export const layerState = {
    layers: [] as LayerData[],
    activeLayerId: 'default' as string
};

const DEFAULT_LAYER: LayerData = { id: 'default', name: 'All Files (Default)', files: {} };

export function initLayers(ctx: CanvasContext) {
    // Load from local storage for now or maybe an API? Let's use localStorage to persist across commits.
    try {
        const stored = localStorage.getItem(`gitcanvas:layers:${ctx.snap().context.repoPath}`);
        if (stored) {
            layerState.layers = JSON.parse(stored);
        } else {
            layerState.layers = [DEFAULT_LAYER];
        }
    } catch {
        layerState.layers = [DEFAULT_LAYER];
    }

    // Ensure default exists
    if (!layerState.layers.find(l => l.id === 'default')) {
        layerState.layers.unshift(DEFAULT_LAYER);
    }

    const savedActive = localStorage.getItem(`gitcanvas:activeLayer:${ctx.snap().context.repoPath}`);
    if (savedActive && layerState.layers.find(l => l.id === savedActive)) {
        layerState.activeLayerId = savedActive;
    } else {
        layerState.activeLayerId = layerState.layers[0].id;
    }
}

export function saveLayers(ctx: CanvasContext) {
    if (!ctx.snap().context.repoPath) return;
    localStorage.setItem(`gitcanvas:layers:${ctx.snap().context.repoPath}`, JSON.stringify(layerState.layers));
}

export function createLayer(ctx: CanvasContext, name: string) {
    const newLayer: LayerData = {
        id: `layer_${Date.now()}`,
        name,
        files: {}
    };
    layerState.layers.push(newLayer);
    layerState.activeLayerId = newLayer.id;
    saveLayers(ctx);
    renderLayersUI(ctx);
    applyLayer(ctx);
}

export function renameLayer(ctx: CanvasContext, id: string, newName: string) {
    const layer = layerState.layers.find(l => l.id === id);
    if (!layer || layer.id === 'default') return;
    layer.name = newName;
    saveLayers(ctx);
    renderLayersUI(ctx);
}

export function deleteLayer(ctx: CanvasContext, id: string) {
    if (id === 'default') return;
    layerState.layers = layerState.layers.filter(l => l.id !== id);
    if (layerState.activeLayerId === id) {
        setActiveLayer(ctx, 'default');
    } else {
        saveLayers(ctx);
        renderLayersUI(ctx);
    }
}

export function addFileToLayer(ctx: CanvasContext, layerId: string, path: string) {
    const layer = layerState.layers.find(l => l.id === layerId);
    if (!layer || layer.id === 'default') return;
    if (!layer.files[path]) {
        layer.files[path] = { sections: [] };
        saveLayers(ctx);
        if (layer.id === layerState.activeLayerId) applyLayer(ctx);
    }
}

export function addSectionToLayer(ctx: CanvasContext, layerId: string, path: string, startString: string, endString: string) {
    const layer = layerState.layers.find(l => l.id === layerId);
    if (!layer || layer.id === 'default') return;
    if (!layer.files[path]) {
        layer.files[path] = { sections: [] };
    }
    layer.files[path].sections.push({ startString, endString });
    saveLayers(ctx);
    if (layer.id === layerState.activeLayerId) applyLayer(ctx);
}

export function setActiveLayer(ctx: CanvasContext, id: string) {
    layerState.activeLayerId = id;
    localStorage.setItem(`gitcanvas:activeLayer:${ctx.snap().context.repoPath}`, id);
    renderLayersUI(ctx);
    applyLayer(ctx);
}

export function getActiveLayer(): LayerData | null {
    if (layerState.activeLayerId === 'default') return null;
    return layerState.layers.find(l => l.id === layerState.activeLayerId) || null;
}

export function applyLayer(ctx: CanvasContext) {
    // Re-render the canvas with the new layer rules
    const state = ctx.snap().context;
    const commitHash = state.currentCommitHash || 'allfiles';
    import('./repo').then(({ selectCommit, renderAllFilesOnCanvas }) => {
        if (commitHash === 'allfiles' && ctx.allFilesData) {
            renderAllFilesOnCanvas(ctx, ctx.allFilesData);
            // Also repopulate changed files panel with layer filter
            if (ctx.commitFilesData) {
                import('./repo').then(m => {
                    // Force panel repopulation via selectCommit's side-effects
                    // by directly calling the exported populateChangedFilesPanel
                });
                // Trigger panel re-render by dispatching an internal call
                const panel = document.getElementById('changedFilesPanel');
                if (panel && panel.style.display !== 'none' && ctx.commitFilesData) {
                    // Re-import and call populateChangedFilesPanel
                    // It's called from selectCommit, so we simulate it
                    selectCommit(ctx, state.currentCommitHash || '', true);
                }
            }
        } else if (commitHash !== 'allfiles') {
            selectCommit(ctx, commitHash, true);
        }
    });
}

function LayerItem({ layer, activeId, ctx }: { layer: LayerData; activeId: string; ctx: CanvasContext }) {
    const isActive = layer.id === activeId;
    return (
        <div
            className={`layers-bar-item ${isActive ? 'active' : ''}`}
            onClick={() => setActiveLayer(ctx, layer.id)}
            onContextMenu={(e) => {
                e.preventDefault();
                if (layer.id === 'default') return;
                if (confirm(`Delete layer "${layer.name}"?`)) {
                    deleteLayer(ctx, layer.id);
                }
            }}
            onDoubleClick={(e) => {
                e.preventDefault();
                if (layer.id === 'default') return;
                const newName = prompt('Rename layer:', layer.name);
                if (newName) {
                    renameLayer(ctx, layer.id, newName);
                }
            }}
            title={layer.id === 'default' ? 'Default Layer' : 'Double-click to rename, Right-click to delete'}
        >
            <span className="layer-name">{layer.name}</span>
            {layer.id !== 'default' && (
                <span className="layer-badge">{Object.keys(layer.files).length}</span>
            )}
        </div>
    );
}

export function autoGenerateLayers(ctx: CanvasContext) {
    // Assuming ctx.fileCards or something similar has the list of known files.
    // If not, we can infer from the fileCards map keys.
    const paths = Array.from(ctx.fileCards.keys());
    if (paths.length === 0) {
        alert("No files available to categorize.");
        return;
    }

    const rules = [
        { name: 'UI Components', pattern: /\/?(components|ui|cards|events|layers|chat|page\.client)\.tsx?$/i },
        { name: 'State & Data', pattern: /\/?(state|context|store|machine|repo)\.tsx?$/i },
        { name: 'Utilities', pattern: /\/?(lib|utils|helpers|connections|canvas|positions|hidden-files)\.tsx?$/i },
        { name: 'Styles', pattern: /\.css$/i }
    ];

    let addedCount = 0;
    for (const rule of rules) {
        const matches = paths.filter(p => rule.pattern.test(p));
        if (matches.length > 0) {
            let layer = layerState.layers.find(l => l.name === rule.name);
            if (!layer) {
                layer = { id: `layer_auto_${Date.now()}_${addedCount}`, name: rule.name, files: {} };
                layerState.layers.push(layer);
                addedCount++;
            }
            matches.forEach(p => {
                if (!layer!.files[p]) layer!.files[p] = { sections: [] };
            });
        }
    }

    if (addedCount > 0) {
        saveLayers(ctx);
        renderLayersUI(ctx);
        // alert(`Auto-generated ${addedCount} layers!`);
    }
}

export function renderLayersUI(ctx: CanvasContext) {
    const container = document.getElementById('layersBarContainer');
    if (!container) return;

    function handleNewLayer() {
        const name = prompt('Enter a name for the new layer:');
        if (name) createLayer(ctx, name);
    }

    render(
        <div className="layers-bar">
            {layerState.layers.map(l => (
                <LayerItem key={l.id} layer={l} activeId={layerState.activeLayerId} ctx={ctx} />
            ))}
            <button
                className="layers-bar-add autogen"
                onClick={() => autoGenerateLayers(ctx)}
                title="Auto-generate Layers"
            >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 2l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1 3-6z" />
                </svg>
                Auto
            </button>
            <button
                className="layers-bar-add"
                onClick={handleNewLayer}
                title="Create a new Layer"
            >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New Layer
            </button>
        </div>,
        container
    );
}

// UI to configure section extraction
export function promptAddSection(ctx: CanvasContext, path: string, layerId?: string) {
    const layer = layerId ? layerState.layers.find(l => l.id === layerId) : getActiveLayer();
    if (!layer || layer.id === 'default') {
        alert("Please select a valid layer to add sections to it.");
        return;
    }
    const startStr = prompt(`Extracting ${path.split('/').pop()} into "${layer.name}"\nEnter starting string for the section (leave blank to include whole file):`);
    // If user presses Cancel, startStr is null. If they just hit Enter, startStr is ''.
    if (startStr === null) return;
    const endStr = prompt("Enter ending string for the section (leave blank for end of file):");
    if (endStr === null) return;

    addSectionToLayer(ctx, layer.id, path, startStr, endStr);
}

export function filterFileContentByLayer(content: string, sections: FileSection[]): { filteredContent: string; visibleLineIndices: Set<number> } {
    if (!content) return { filteredContent: '', visibleLineIndices: new Set() };
    if (!sections || sections.length === 0) {
        return { filteredContent: content, visibleLineIndices: new Set(content.split('\n').map((_, i) => i)) };
    }

    const lines = content.split('\n');
    const visibleLines = new Set<number>();

    for (const sec of sections) {
        let inSection = false;
        let startConditionMet = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (!inSection && line.includes(sec.startString)) {
                inSection = true;
                startConditionMet = true;
            }

            if (inSection) {
                visibleLines.add(i);

                // End after we add the closing line
                if (line.includes(sec.endString) && (!sec.startString || line !== sec.startString || !startConditionMet)) {
                    inSection = false;
                }
            }
        }
    }

    return { filteredContent: content, visibleLineIndices: visibleLines };
}
