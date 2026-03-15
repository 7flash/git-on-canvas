import { CanvasContext } from './context';

export function initTutorial(ctx: CanvasContext) {
    if (typeof window === 'undefined') return;

    // Check if tutorial was already completed
    if (localStorage.getItem('gitcanvas:tutorial_completed') === 'true') {
        return;
    }

    // Only start tutorial if we actually have a repo loaded (hiding landing overlay)
    const landing = document.getElementById('landingOverlay');
    if (landing && landing.style.display !== 'none') {
        // We'll wait until a repo is loaded. We can do this safely by polling or listening.
        // For simplicity, we just poll until the landing overlay is hidden.
        const interval = setInterval(() => {
            if (landing.style.display === 'none') {
                clearInterval(interval);
                startTutorialSequence(ctx);
            }
        }, 500);
        return;
    }

    startTutorialSequence(ctx);
}

function startTutorialSequence(ctx: CanvasContext) {
    const steps = [
        {
            title: "Welcome to GitMaps 🌌",
            text: "You are now viewing your codebase as a 5-dimensional spatial canvas. Let's learn how to navigate it.",
            target: null,
            position: "center",
        },
        {
            title: "Exploring the Canvas ✋",
            text: "Click and drag anywhere on the empty background to <b>pan</b> around the map.",
            target: "#canvasViewport",
            position: "center",
        },
        {
            title: "Deep Dive 🔍",
            text: "Use your <b>scroll wheel</b> or trackpad to zoom in and out. The canvas will automatically reveal more details as you get closer.",
            target: null,
            position: "center",
        },
        {
            title: "Semantic Layers 🥞",
            text: "Use the layer selector at the bottom to instantly switch your perspective. See the codebase by Files, Functions, or Tokens.",
            target: "#layersBarContainer",
            position: "above",
        },
        {
            title: "Load Another Repo 📂",
            text: "You can map any public GitHub repository instantly. Just use the search bar or import button here.",
            target: ".repo-selector",
            position: "right-of",
        },
        {
            title: "Select & Inspect 🎯",
            text: "Click any file or function block to select it. Right click to access powerful tools.",
            target: null,
            position: "center",
        }
    ];

    let currentStep = 0;

    const overlay = document.createElement('div');
    overlay.id = 'tutorialOverlay';
    overlay.className = 'tutorial-overlay';

    // Inject styles explicitly so it's guaranteed to match the premium theme
    const style = document.createElement('style');
    style.innerHTML = `
        .tutorial-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            z-index: 100000;
            pointer-events: none;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: opacity 0.3s ease;
        }
        .tutorial-dialog {
            pointer-events: auto;
            background: rgba(15, 23, 42, 0.85);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 24px;
            width: 320px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
            color: #fff;
            position: absolute;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            transform: scale(0.95) translateY(10px);
            opacity: 0;
            animation: tutorialSlide 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes tutorialSlide {
            to { transform: scale(1) translateY(0); opacity: 1; }
        }
        .tutorial-title {
            font-size: 18px;
            font-weight: 600;
            margin: 0 0 12px 0;
            background: linear-gradient(135deg, #a78bfa, #60a5fa);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .tutorial-text {
            font-size: 14px;
            color: #cbd5e1;
            line-height: 1.5;
            margin-bottom: 24px;
        }
        .tutorial-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            padding-top: 16px;
        }
        .tutorial-dots {
            display: flex;
            gap: 6px;
        }
        .tutorial-dot {
            width: 6px; height: 6px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.2);
            transition: all 0.3s;
        }
        .tutorial-dot.active {
            background: #a78bfa;
            width: 16px;
            border-radius: 4px;
        }
        .tutorial-btn {
            background: linear-gradient(135deg, #a78bfa, #60a5fa);
            border: none;
            border-radius: 8px;
            color: #fff;
            font-weight: 600;
            padding: 8px 16px;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 4px 12px rgba(96, 165, 250, 0.3);
        }
        .tutorial-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(96, 165, 250, 0.4);
        }
        .tutorial-skip {
            position: absolute;
            top: 24px; right: 24px;
            color: rgba(255, 255, 255, 0.4);
            background: none; border: none;
            font-size: 12px; cursor: pointer;
            transition: color 0.2s;
            pointer-events: auto;
        }
        .tutorial-skip:hover {
            color: #fff;
        }
        .tutorial-highlight {
            position: fixed;
            box-shadow: 0 0 0 9999px rgba(0,0,0,0.7), 0 0 20px 5px rgba(167, 139, 250, 0.4);
            border-radius: 12px;
            pointer-events: none;
            z-index: -1;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            border: 2px solid #a78bfa;
        }
        .tutorial-bg {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            z-index: -2;
            pointer-events: none;
            transition: opacity 0.4s;
        }
    `;
    document.head.appendChild(style);

    const dialog = document.createElement('div');
    dialog.className = 'tutorial-dialog';

    const skipBtn = document.createElement('button');
    skipBtn.className = 'tutorial-skip';
    skipBtn.innerText = 'Skip';
    skipBtn.onclick = finishTutorial;

    const highlightBox = document.createElement('div');
    highlightBox.className = 'tutorial-highlight';
    highlightBox.style.display = 'none';

    const bgShadow = document.createElement('div');
    bgShadow.className = 'tutorial-bg';
    bgShadow.style.display = 'block';

    overlay.appendChild(bgShadow);
    overlay.appendChild(highlightBox);
    overlay.appendChild(skipBtn);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    function renderStep() {
        const step = steps[currentStep];

        const dotsHtml = steps.map((_, i) =>
            `<div class="tutorial-dot ${i === currentStep ? 'active' : ''}"></div>`
        ).join('');

        dialog.innerHTML = `
            <h3 class="tutorial-title">${step.title}</h3>
            <div class="tutorial-text">${step.text}</div>
            <div class="tutorial-footer">
                <div class="tutorial-dots">${dotsHtml}</div>
                <button class="tutorial-btn" id="tutorialNextBtn">${currentStep === steps.length - 1 ? 'Start Mapping 🚀' : 'Next'}</button>
            </div>
        `;

        document.getElementById('tutorialNextBtn')!.onclick = nextStep;

        // Handle target highlighting
        if (step.target) {
            const el = document.querySelector(step.target);
            if (el) {
                const rect = el.getBoundingClientRect();
                highlightBox.style.display = 'block';
                bgShadow.style.display = 'none';
                // Add some padding to highlight
                const p = 8;
                highlightBox.style.top = `${rect.top - p}px`;
                highlightBox.style.left = `${rect.left - p}px`;
                highlightBox.style.width = `${rect.width + p * 2}px`;
                highlightBox.style.height = `${rect.height + p * 2}px`;

                if (step.position === 'left-of') {
                    // Position dialog to the left of the highlight
                    dialog.style.top = `${rect.top}px`;
                    dialog.style.left = `${rect.left - 340}px`;
                    dialog.style.bottom = 'auto';
                    dialog.style.right = 'auto';
                    dialog.style.transform = 'translateY(0)';
                } else if (step.position === 'right-of') {
                    // Position dialog to the right of the highlight
                    dialog.style.top = `${rect.top}px`;
                    dialog.style.left = `${rect.right + 20}px`;
                    dialog.style.bottom = 'auto';
                    dialog.style.right = 'auto';
                    dialog.style.transform = 'translateY(0)';
                } else if (step.position === 'above') {
                    dialog.style.top = `${Math.max(20, rect.top - 200)}px`;
                    dialog.style.left = `${rect.left + (rect.width / 2) - 160}px`;
                    dialog.style.bottom = 'auto';
                    dialog.style.right = 'auto';
                    dialog.style.transform = 'translateY(0)';
                }
            } else {
                highlightBox.style.display = 'none';
                bgShadow.style.display = 'block';
                centerDialog();
            }
        } else {
            highlightBox.style.display = 'none';
            bgShadow.style.display = 'block';
            centerDialog();
        }
    }

    function centerDialog() {
        dialog.style.top = '50%';
        dialog.style.left = '50%';
        dialog.style.transform = 'translate(-50%, -50%)';
    }

    function nextStep() {
        if (currentStep < steps.length - 1) {
            currentStep++;
            renderStep();
        } else {
            finishTutorial();
        }
    }

    function finishTutorial() {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
            style.remove();
        }, 300);
        localStorage.setItem('gitcanvas:tutorial_completed', 'true');
    }

    renderStep();
}
