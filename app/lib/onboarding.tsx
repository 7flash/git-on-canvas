import { render } from 'melina/client';
import type { CanvasContext } from './context';
import { updateCanvasTransform } from './canvas';

const steps = [
    {
        title: "Welcome to GitMaps ✨",
        text: "Let's take a quick tour to help you navigate your code visually.",
        highlightId: null,
        position: 'center'
    },
    {
        title: "Pan & Zoom 🗺️",
        text: "Drag the background or hold Space to pan around. Scroll your mouse wheel or use the slider below to zoom in and out.",
        highlightId: 'zoomSlider',
        position: 'bottom'
    },
    {
        title: "Organize Cards 🗂️",
        text: "You can drag any file card by its header to organize your workspace. The layout saves automatically.",
        highlightId: null,
        position: 'center'
    },
    {
        title: "Draw Connections 🔗",
        text: "Hold Shift, click a specific line of code, and drag to another file to create a lasting connection.",
        highlightId: 'toggleConnections',
        position: 'top-left'
    },
    {
        title: "Layers & Focus 🥞",
        text: "Group files into Layers to filter your view and focus on specific subsystems without clutter.",
        highlightId: 'layersBarContainer',
        position: 'top-right'
    },
    {
        title: "You're all set! 🚀",
        text: "Use the arrangement tools on the right to tidy up. Happy exploring!",
        highlightId: 'arrangeGrid',
        position: 'right'
    }
];

export function startOnboarding(ctx: CanvasContext) {
    if (document.getElementById('onboardingOverlay')) return;

    localStorage.setItem('gitcanvas:onboarded', 'true');

    const overlay = document.createElement('div');
    overlay.id = 'onboardingOverlay';
    overlay.className = 'onboarding-overlay';
    document.body.appendChild(overlay);

    let currentStep = 0;

    function renderStep() {
        const step = steps[currentStep];

        // Clear previous highlights
        document.querySelectorAll('.onboarding-highlight').forEach(el => {
            el.classList.remove('onboarding-highlight');
        });

        if (step.highlightId) {
            const el = document.getElementById(step.highlightId);
            if (el) el.classList.add('onboarding-highlight');
        }

        render(
            <div className={`onboarding-modal pos-${step.position}`}>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <div className="onboarding-controls">
                    <div className="onboarding-dots">
                        {steps.map((s, i) => (
                            <span className={i === currentStep ? 'active' : ''} key={i}></span>
                        ))}
                    </div>
                    <div className="onboarding-buttons">
                        {currentStep < steps.length - 1 ? (
                            <>
                                <button className="btn-secondary" onClick={closeOnboarding}>Skip</button>
                                <button className="btn-primary" onClick={nextStep}>Next</button>
                            </>
                        ) : (
                            <button className="btn-primary" onClick={closeOnboarding}>Get Started</button>
                        )}
                    </div>
                </div>
            </div>,
            overlay
        );
    }

    function nextStep() {
        if (currentStep < steps.length - 1) {
            currentStep++;
            renderStep();
        }
    }

    function closeOnboarding() {
        document.querySelectorAll('.onboarding-highlight').forEach(el => {
            el.classList.remove('onboarding-highlight');
        });
        render(null, overlay);
        overlay.remove();

        // After onboarding is done, quickly focus on the canvas center
        // so they don't get lost
        const state = ctx.snap().context;
        ctx.actor.send({ type: 'SET_ZOOM', zoom: 1 });
        ctx.actor.send({ type: 'SET_OFFSET', x: 0, y: 0 });
        updateCanvasTransform(ctx);
    }

    // Include basic styles for the onboarding inline
    const styleId = 'onboardingStyles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .onboarding-overlay {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.6);
                z-index: 99999;
                display: flex;
                pointer-events: all;
            }
            .onboarding-modal {
                background: var(--bg-secondary);
                border: 1px solid var(--border-color);
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                border-radius: 12px;
                padding: 24px;
                width: 360px;
                position: absolute;
                animation: slide-up 0.3s ease-out forwards;
                color: var(--text-primary);
            }
            .onboarding-modal h3 {
                margin: 0 0 12px 0;
                font-size: 1.25rem;
                color: var(--accent-primary);
            }
            .onboarding-modal p {
                margin: 0 0 24px 0;
                font-size: 0.95rem;
                line-height: 1.5;
                color: var(--text-secondary);
            }
            .onboarding-controls {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .onboarding-dots span {
                display: inline-block;
                width: 8px; height: 8px;
                background: var(--border-color);
                border-radius: 50%;
                margin-right: 6px;
                transition: background 0.2s;
            }
            .onboarding-dots span.active {
                background: var(--accent-primary);
            }
            .onboarding-buttons {
                display: flex;
                gap: 12px;
            }
            .onboarding-buttons .btn-secondary {
                background: transparent;
                border: none;
                color: var(--text-muted);
                cursor: pointer;
            }
            .onboarding-buttons .btn-secondary:hover {
                color: var(--text-primary);
            }
            .onboarding-buttons .btn-primary {
                background: var(--accent-primary);
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 500;
            }
            .onboarding-buttons .btn-primary:hover {
                filter: brightness(1.1);
            }
            .pos-center { top: 50%; left: 50%; transform: translate(-50%, -50%); }
            .pos-bottom { bottom: 80px; left: 50%; transform: translateX(-50%); }
            .pos-top-left { top: 80px; left: 24px; }
            .pos-top-right { top: 80px; right: 24px; }
            .pos-right { top: 50%; right: 80px; transform: translateY(-50%); }
            
            .onboarding-highlight {
                position: relative;
                z-index: 100000;
                box-shadow: 0 0 0 4px var(--accent-primary), 0 0 20px rgba(99, 102, 241, 0.5) !important;
                border-radius: 4px;
                transition: all 0.3s;
                background: var(--bg-secondary);
            }
        `;
        document.head.appendChild(style);
    }

    renderStep();
}
