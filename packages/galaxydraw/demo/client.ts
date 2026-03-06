/**
 * galaxydraw demo — client entry point
 */
import { GalaxyDraw } from '../src/core/engine';
import type { CardPlugin } from '../src/core/cards';

// ─── Text card plugin ─────────────────────────────────────
const TextCardPlugin: CardPlugin = {
    type: 'text',
    render(data) {
        const card = document.createElement('div');
        const header = document.createElement('div');
        header.className = 'gd-card-header';
        header.innerHTML = `<span class="title">${data.meta?.title || data.id}</span>`;

        const body = document.createElement('div');
        body.className = 'gd-card-body';
        body.style.cssText = 'padding:12px; font-size:13px; color:rgba(255,255,255,0.6); line-height:1.6;';
        body.innerHTML = data.meta?.content || 'Drag by the header, resize from the corner.';

        card.appendChild(header);
        card.appendChild(body);
        return card;
    }
};

// ─── Note card plugin ─────────────────────────────────────
const NoteCardPlugin: CardPlugin = {
    type: 'note',
    render(data) {
        const colors = ['#22c55e', '#eab308', '#ef4444', '#3b82f6', '#a855f7'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const card = document.createElement('div');

        const header = document.createElement('div');
        header.className = 'gd-card-header';
        header.style.borderLeft = `3px solid ${color}`;
        header.innerHTML = `
            <span class="title">${data.meta?.title || 'Note'}</span>
            <span style="font-size:10px; color:${color}; text-transform:uppercase; letter-spacing:0.05em;">Note</span>
        `;

        const body = document.createElement('div');
        body.className = 'gd-card-body';
        body.style.padding = '16px';
        body.innerHTML = `
            <div contenteditable="true" style="font-size:13px; color:rgba(255,255,255,0.7); outline:none; min-height:60px; line-height:1.6;">
                ${data.meta?.text || 'Click to edit...'}
            </div>
        `;

        card.appendChild(header);
        card.appendChild(body);
        return card;
    },
    consumesMouse(target: HTMLElement) {
        return target.closest('[contenteditable]') !== null;
    }
};

// ─── Init ─────────────────────────────────────────────────
const container = document.getElementById('app')!;
const gd = new GalaxyDraw(container, {
    mode: 'simple',
    cards: { defaultWidth: 320, defaultHeight: 240 },
});

gd.registerPlugin(TextCardPlugin);
gd.registerPlugin(NoteCardPlugin);

// ─── Create demo cards ────────────────────────────────────
const items = [
    {
        type: 'text', id: 'welcome', x: 100, y: 100, width: 380, height: 220, meta: {
            title: 'galaxydraw',
            content: '<div style="font-size:20px; font-weight:600; color:#fff; margin-bottom:8px;">Infinite Canvas Framework</div><div>The engine behind <strong>GitMaps</strong> and <strong>WARMAPS</strong>.</div><br/><div style="font-size:11px; color:rgba(255,255,255,0.35);">Pan: drag empty space | Zoom: scroll | Drag cards by headers</div>'
        }
    },
    { type: 'note', id: 'note1', x: 550, y: 80, width: 280, height: 200, meta: { title: 'Architecture', text: 'EventBus > CanvasState > CardManager > ViewportCuller' } },
    {
        type: 'text', id: 'features', x: 100, y: 380, width: 350, height: 280, meta: {
            title: 'Features',
            content: '<ul style="padding-left:16px;"><li>Virtualized rendering</li><li>Card plugins for custom content</li><li>Dual control modes (Simple / Advanced)</li><li>Viewport culling</li><li>Layout persistence</li><li>Minimap</li><li>Type-safe EventBus</li></ul>'
        }
    },
    { type: 'note', id: 'note2', x: 550, y: 340, width: 280, height: 180, meta: { title: 'Performance', text: 'React repo: 6833 files, only 9 DOM cards created. 6824 deferred. Over 300x speedup.' } },
    {
        type: 'text', id: 'modes', x: 900, y: 100, width: 300, height: 200, meta: {
            title: 'Control Modes',
            content: '<div><strong>Simple</strong> (WARMAPS): Drag = pan canvas<br/><strong>Advanced</strong> (GitMaps): Space+Drag = pan, Click = select</div>'
        }
    },
    { type: 'note', id: 'note3', x: 900, y: 360, width: 280, height: 160, meta: { title: 'Next Steps', text: 'Migrate WARMAPS and GitMaps to use galaxydraw as the canvas backbone.' } },
];

for (const c of items) {
    gd.cards.create(c.type, c);
}

// ─── Toolbar ──────────────────────────────────────────────
const toolbar = document.createElement('div');
toolbar.className = 'demo-toolbar';

const label = document.createElement('span');
label.className = 'mode-label';
label.textContent = 'Mode:';
toolbar.appendChild(label);

const btnSimple = document.createElement('button');
btnSimple.textContent = 'Simple (WARMAPS)';
btnSimple.className = 'active';
btnSimple.id = 'modeSimple';
toolbar.appendChild(btnSimple);

const btnAdvanced = document.createElement('button');
btnAdvanced.textContent = 'Advanced (GitMaps)';
btnAdvanced.id = 'modeAdvanced';
toolbar.appendChild(btnAdvanced);

const btnAdd = document.createElement('button');
btnAdd.textContent = '+ Card';
toolbar.appendChild(btnAdd);

const btnFit = document.createElement('button');
btnFit.textContent = 'Fit All';
toolbar.appendChild(btnFit);

document.body.appendChild(toolbar);

btnSimple.onclick = () => {
    gd.setMode('simple');
    btnSimple.classList.add('active');
    btnAdvanced.classList.remove('active');
};

btnAdvanced.onclick = () => {
    gd.setMode('advanced');
    btnAdvanced.classList.add('active');
    btnSimple.classList.remove('active');
};

btnAdd.onclick = () => {
    const id = 'card-' + Date.now();
    gd.cards.create('note', {
        id, x: 200 + Math.random() * 600, y: 200 + Math.random() * 400,
        width: 260, height: 180,
        meta: { title: 'New Note', text: 'Click to edit...' }
    });
};

btnFit.onclick = () => gd.fitAll();

// Global debug access
(window as any).gd = gd;
