// @ts-nocheck
/**
 * New file dialog — create files directly from the canvas.
 * Opens a dialog to enter the file path, creates the file via API,
 * then adds a card and opens it in edit mode.
 */
import { render } from 'melina/client';
import type { CanvasContext } from './context';
import { showToast, escapeHtml } from './utils';

// ─── New File Dialog JSX ────────────────────────────────
function NewFileDialog({ onSubmit, onCancel, repoPath }: {
    onSubmit: (filePath: string) => void;
    onCancel: () => void;
    repoPath: string;
}) {
    const repoName = repoPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || repoPath;
    return (
        <div className="new-file-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
            <div className="new-file-dialog">
                <div className="new-file-header">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="12" y1="18" x2="12" y2="12" />
                        <line x1="9" y1="15" x2="15" y2="15" />
                    </svg>
                    <h3>Create New File</h3>
                </div>
                <div className="new-file-body">
                    <label className="new-file-label">File path relative to <code>{repoName}</code></label>
                    <input
                        type="text"
                        id="newFilePathInput"
                        className="new-file-input"
                        placeholder="src/components/Button.tsx"
                        autoComplete="off"
                        spellCheck={false}
                        autofocus
                    />
                    <div className="new-file-hint">
                        Directories will be created automatically. Use <code>/</code> as separator.
                    </div>
                </div>
                <div className="new-file-actions">
                    <button className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
                    <button className="btn-primary btn-sm new-file-create-btn" id="newFileCreateBtn">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="12" y1="18" x2="12" y2="12" />
                            <line x1="9" y1="15" x2="15" y2="15" />
                        </svg>
                        Create File
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Show New File Dialog ───────────────────────────────
export function showNewFileDialog(ctx: CanvasContext) {
    const state = ctx.snap().context;
    if (!state.repoPath) {
        showToast('Load a repository first', 'error');
        return;
    }

    // Remove existing dialog if open
    document.getElementById('newFileOverlay')?.remove();

    const container = document.createElement('div');
    container.id = 'newFileOverlay';
    document.body.appendChild(container);

    function close() {
        render(null, container);
        container.remove();
    }

    async function submit(filePath: string) {
        const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
        if (!normalizedPath) {
            showToast('Please enter a file path', 'error');
            return;
        }

        // Check for dangerous paths
        if (normalizedPath.includes('..') || normalizedPath.startsWith('/')) {
            showToast('Invalid path — cannot use .. or start with /', 'error');
            return;
        }

        const createBtn = document.getElementById('newFileCreateBtn');
        if (createBtn) { createBtn.textContent = 'Creating...'; createBtn.setAttribute('disabled', 'true'); }

        try {
            // Determine initial template content based on extension
            const ext = normalizedPath.split('.').pop()?.toLowerCase() || '';
            const fileName = normalizedPath.split('/').pop() || normalizedPath;
            const content = getTemplateContent(fileName, ext);

            const res = await fetch('/api/repo/file-save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: state.repoPath,
                    filePath: normalizedPath,
                    content,
                }),
            });

            if (!res.ok) {
                const err = await res.text();
                showToast(`Failed to create file: ${err}`, 'error');
                if (createBtn) { createBtn.textContent = 'Create File'; createBtn.removeAttribute('disabled'); }
                return;
            }

            const data = await res.json();
            close();

            showToast(`Created ${normalizedPath}`, 'success');

            // Create file object and open in the modal for editing
            const newFile = {
                path: normalizedPath,
                name: fileName,
                lines: data.lines || 1,
                content,
                status: 'added',
            };

            // Open the file modal in edit mode
            const { openFileModal } = await import('./file-modal');
            openFileModal(ctx, newFile);

            // Switch to edit tab after a brief delay to let modal render
            setTimeout(() => {
                const editTab = document.querySelector('.modal-tab[data-view="edit"]') as HTMLElement;
                if (editTab) editTab.click();
            }, 200);

        } catch (err: any) {
            showToast(`Error: ${err.message}`, 'error');
            if (createBtn) { createBtn.textContent = 'Create File'; createBtn.removeAttribute('disabled'); }
        }
    }

    render(
        <NewFileDialog
            onSubmit={submit}
            onCancel={close}
            repoPath={state.repoPath}
        />,
        container
    );

    // Focus and wire up the input
    requestAnimationFrame(() => {
        const input = document.getElementById('newFilePathInput') as HTMLInputElement;
        if (input) {
            input.focus();
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submit(input.value.trim());
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    close();
                }
            });
        }
        // Also wire create button click
        const createBtn = document.getElementById('newFileCreateBtn');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                const input = document.getElementById('newFilePathInput') as HTMLInputElement;
                if (input) submit(input.value.trim());
            });
        }
    });
}

// ─── Template content for new files ─────────────────────
function getTemplateContent(fileName: string, ext: string): string {
    const baseName = fileName.replace(/\.[^.]+$/, '');

    switch (ext) {
        case 'ts':
        case 'tsx':
            return `/**\n * ${baseName}\n */\n\nexport function ${toCamelCase(baseName)}() {\n    // TODO: implement\n}\n`;
        case 'js':
        case 'jsx':
            return `/**\n * ${baseName}\n */\n\nexport function ${toCamelCase(baseName)}() {\n    // TODO: implement\n}\n`;
        case 'py':
            return `"""${baseName}"""\n\n\ndef ${toSnakeCase(baseName)}():\n    \"\"\"TODO: implement\"\"\"\n    pass\n`;
        case 'css':
            return `/* ${baseName} styles */\n\n`;
        case 'html':
            return `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>${baseName}</title>\n</head>\n<body>\n    \n</body>\n</html>\n`;
        case 'json':
            return `{\n    \n}\n`;
        case 'md':
            return `# ${baseName}\n\n`;
        case 'yaml':
        case 'yml':
            return `# ${baseName}\n\n`;
        case 'toml':
            return `# ${baseName}\n\n`;
        default:
            return ``;
    }
}

function toCamelCase(str: string): string {
    return str
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
        .replace(/^[A-Z]/, c => c.toLowerCase());
}

function toSnakeCase(str: string): string {
    return str
        .replace(/([A-Z])/g, '_$1')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}
