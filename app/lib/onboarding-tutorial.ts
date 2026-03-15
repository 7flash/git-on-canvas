/**
 * Interactive Onboarding Tutorial — Guide new users through GitMaps
 * 
 * Features:
 * - Step-by-step interactive tour
 * - Highlights UI elements as it explains them
 * - Keyboard shortcuts cheat sheet
 * - Skip/resume anytime
 * - Persists completion state
 */

import type { CanvasContext } from './context';

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  highlightSelector: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  action?: () => void;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to GitMaps! 🎉',
    description: 'Explore codebases on an infinite canvas. Let\'s take a quick tour of the features.',
    highlightSelector: '#app',
    position: 'bottom',
  },
  {
    id: 'repo-selector',
    title: 'Repository Selector',
    description: 'Select any loaded repository from the dropdown. Import new repos from GitHub with the button.',
    highlightSelector: '#repoSelect',
    position: 'bottom',
  },
  {
    id: 'commit-timeline',
    title: 'Commit Timeline',
    description: 'Browse through commit history. Click any commit to see what changed. Use ← → arrow keys to navigate.',
    highlightSelector: '#commitTimeline',
    position: 'right',
  },
  {
    id: 'canvas-area',
    title: 'Infinite Canvas',
    description: 'Your code lives here! Each file is a card. Pan with Space+Drag or middle-click. Scroll to zoom.',
    highlightSelector: '#canvasViewport',
    position: 'top',
  },
  {
    id: 'file-cards',
    title: 'File Cards',
    description: 'Each card shows a file with code preview. Green/red markers show additions/deletions. Hover to see full preview.',
    highlightSelector: '.file-card',
    position: 'bottom',
  },
  {
    id: 'minimap',
    title: 'Minimap',
    description: 'Never get lost! The minimap shows your entire canvas. Click to jump to any area.',
    highlightSelector: '#minimap',
    position: 'top',
  },
  {
    id: 'arrange-toolbar',
    title: 'Arrange Tools',
    description: 'Organize cards with H (row), V (column), or G (grid). W fits all cards on screen.',
    highlightSelector: '#arrangeToolbar',
    position: 'bottom',
  },
  {
    id: 'zoom-controls',
    title: 'Zoom Controls',
    description: 'Fine-tune zoom with the slider or +/- keys. Current zoom level shown in percentage.',
    highlightSelector: '#zoomSlider',
    position: 'top',
  },
  {
    id: 'shortcuts',
    title: 'Keyboard Shortcuts',
    description: 'Press ? anytime to see all shortcuts. Power users love Ctrl+F (search), Ctrl+G (dependency graph), and Ctrl+O (find file).',
    highlightSelector: '#hotkeyToggle',
    position: 'bottom',
  },
  {
    id: 'done',
    title: 'You\'re Ready! 🚀',
    description: 'Start exploring! Import a repo, arrange cards your way, and enjoy spatial code exploration.',
    highlightSelector: '#app',
    position: 'bottom',
    action: () => {
      localStorage.setItem('gitcanvas:onboardingComplete', 'true');
    },
  },
];

let currentStep = 0;
let tutorialOverlay: HTMLElement | null = null;

/**
 * Check if user has completed onboarding
 */
export function hasCompletedOnboarding(): boolean {
  return localStorage.getItem('gitcanvas:onboardingComplete') === 'true';
}

/**
 * Reset onboarding progress
 */
export function resetOnboarding(): void {
  localStorage.removeItem('gitcanvas:onboardingComplete');
  currentStep = 0;
}

/**
 * Start the onboarding tutorial
 */
export function startOnboarding(ctx: CanvasContext): void {
  if (tutorialOverlay) return;
  
  currentStep = 0;
  showTutorialStep(ctx, currentStep);
}

/**
 * Show a specific tutorial step
 */
function showTutorialStep(ctx: CanvasContext, stepIndex: number): void {
  if (stepIndex < 0 || stepIndex >= TUTORIAL_STEPS.length) {
    hideTutorial();
    return;
  }

  const step = TUTORIAL_STEPS[stepIndex];
  
  // Create overlay if needed
  if (!tutorialOverlay) {
    tutorialOverlay = document.createElement('div');
    tutorialOverlay.className = 'tutorial-overlay';
    tutorialOverlay.innerHTML = `
      <div class="tutorial-backdrop"></div>
      <div class="tutorial-content">
        <div class="tutorial-header">
          <h3 class="tutorial-title"></h3>
          <button class="tutorial-close" id="tutorialClose">×</button>
        </div>
        <div class="tutorial-description"></div>
        <div class="tutorial-progress">
          <span class="tutorial-step-count"></span>
        </div>
        <div class="tutorial-actions">
          <button class="btn-ghost" id="tutorialSkip">Skip Tour</button>
          <button class="btn-primary" id="tutorialNext">Next →</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(tutorialOverlay);
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .tutorial-overlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease;
      }
      .tutorial-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(10, 10, 15, 0.85);
        backdrop-filter: blur(4px);
      }
      .tutorial-content {
        position: relative;
        background: var(--bg-secondary);
        border: 1px solid var(--border-primary);
        border-radius: 12px;
        padding: 24px;
        max-width: 450px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        animation: slideUp 0.3s ease;
      }
      .tutorial-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }
      .tutorial-title {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        background: linear-gradient(135deg, #a78bfa, #60a5fa);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .tutorial-close {
        background: none;
        border: none;
        color: var(--text-muted);
        font-size: 24px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        transition: all 0.2s;
      }
      .tutorial-close:hover {
        background: var(--bg-tertiary);
        color: var(--text-primary);
      }
      .tutorial-description {
        color: var(--text-primary);
        font-size: 14px;
        line-height: 1.6;
        margin-bottom: 20px;
      }
      .tutorial-progress {
        margin-bottom: 20px;
      }
      .tutorial-step-count {
        font-size: 12px;
        color: var(--text-muted);
      }
      .tutorial-actions {
        display: flex;
        gap: 8px;
        justify-content: space-between;
      }
      .tutorial-actions button {
        padding: 10px 20px;
        border-radius: 8px;
        border: none;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      .btn-primary {
        background: linear-gradient(135deg, #7c3aed, #3b82f6);
        color: white;
      }
      .btn-primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    // Wire up buttons
    tutorialOverlay.querySelector('#tutorialClose')?.addEventListener('click', hideTutorial);
    tutorialOverlay.querySelector('#tutorialSkip')?.addEventListener('click', () => {
      hideTutorial();
      localStorage.setItem('gitcanvas:onboardingComplete', 'true');
    });
    tutorialOverlay.querySelector('#tutorialNext')?.addEventListener('click', () => {
      const step = TUTORIAL_STEPS[currentStep];
      if (step.action) step.action();
      currentStep++;
      showTutorialStep(ctx, currentStep);
    });
    
    // Keyboard navigation
    document.addEventListener('keydown', ha
