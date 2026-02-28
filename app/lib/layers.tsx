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
        renderLayersUI(ctx);
        if (layer.id === layerState.activeLayerId) applyLayer(ctx);
    }
}

export function removeFileFromLayer(ctx: CanvasContext, layerId: string, path: string) {
    const layer = layerState.layers.find(l => l.id === layerId);
    if (!layer || layer.id === 'default') return;
    if (layer.files[path]) {
        delete layer.files[path];
        saveLayers(ctx);
        renderLayersUI(ctx);
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
    const state = ctx.snap().context;
    const commitHash = state.currentCommitHash || 'allfiles';
    import('./repo').then(({ selectCommit, renderAllFilesOnCanvas, populateChangedFilesPanel }) => {
        if (commitHash === 'allfiles' && ctx.allFilesData) {
            renderAllFilesOnCanvas(ctx, ctx.allFilesData);
            // Also repopulate the changed files panel with the new layer filter
            if (ctx.commitFilesData) {
                populateChangedFilesPanel(ctx.commitFilesData);
            }
        } else if (commitHash && commitHash !== 'allfiles') {
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

export function renderLayersUI(ctx: CanvasContext) {
    const container = document.getElementById('layersBarContainer');
    if (!container) return;

    render(
        <div className="layers-bar">
            {layerState.layers.map(l => (
                <LayerItem key={`${l.id}_${Object.keys(l.files).length}`} layer={l} activeId={layerState.activeLayerId} ctx={ctx} />
            ))}
            <button
                className="layers-bar-add"
                id="newLayerBtn"
                title="Create a new Layer"
            >
                + New Layer
            </button>
        </div>,
        container
    );

    // Attach click handler via DOM (Melina onClick doesn't reliably bind here)
    const btn = document.getElementById('newLayerBtn');
    if (btn) {
        btn.onclick = () => {
            const name = prompt('Enter a name for the new layer:');
            if (name) createLayer(ctx, name);
        };
    }
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
