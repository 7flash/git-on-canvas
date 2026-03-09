// @ts-nocheck
/**
 * CodeMirror editor wrapper for the file modal.
 * Creates a CodeMirror 6 editor instance with syntax highlighting,
 * dark theme, and integration with the save/commit workflow.
 */
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, highlightSpecialChars } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap, HighlightStyle } from '@codemirror/language';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { tags as t } from '@lezer/highlight';

// Language imports
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { yaml } from '@codemirror/lang-yaml';

// ─── Dark theme matching GitMaps ────────────────────────
const gitMapsDarkTheme = EditorView.theme({
    '&': {
        backgroundColor: 'transparent',
        color: '#e2e8f0',
        fontSize: '13px',
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    },
    '.cm-content': {
        caretColor: '#22c55e',
        padding: '8px 0',
    },
    '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: '#22c55e',
        borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        backgroundColor: 'rgba(34, 197, 94, 0.15) !important',
    },
    '.cm-activeLine': {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
    },
    '.cm-activeLineGutter': {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'rgba(148, 163, 184, 0.4)',
        border: 'none',
        borderRight: '1px solid rgba(255, 255, 255, 0.06)',
        minWidth: '40px',
    },
    '.cm-gutter.cm-lineNumbers .cm-gutterElement': {
        padding: '0 8px 0 4px',
        minWidth: '32px',
    },
    '.cm-foldGutter .cm-gutterElement': {
        padding: '0 4px',
        color: 'rgba(148, 163, 184, 0.3)',
        cursor: 'pointer',
    },
    '.cm-foldGutter .cm-gutterElement:hover': {
        color: '#22c55e',
    },
    '.cm-matchingBracket': {
        backgroundColor: 'rgba(34, 197, 94, 0.2)',
        outline: '1px solid rgba(34, 197, 94, 0.4)',
    },
    '.cm-searchMatch': {
        backgroundColor: 'rgba(250, 204, 21, 0.25)',
        outline: '1px solid rgba(250, 204, 21, 0.4)',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'rgba(250, 204, 21, 0.4)',
    },
    '.cm-selectionMatch': {
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
    },
    '.cm-tooltip': {
        backgroundColor: 'var(--bg-elevated, #1e1e2e)',
        border: '1px solid var(--border-default, rgba(255,255,255,0.1))',
        borderRadius: '6px',
    },
    '.cm-panels': {
        backgroundColor: 'var(--bg-elevated, #1e1e2e)',
        color: '#e2e8f0',
    },
    '.cm-panels.cm-panels-top': {
        borderBottom: '1px solid var(--border-default, rgba(255,255,255,0.1))',
    },
    '.cm-panel.cm-search': {
        padding: '4px 8px',
    },
    '.cm-panel.cm-search input': {
        background: 'var(--bg-tertiary, #1a1a2e)',
        border: '1px solid var(--border-default)',
        color: '#e2e8f0',
        borderRadius: '4px',
        padding: '2px 6px',
        outline: 'none',
    },
    '.cm-panel.cm-search button': {
        background: 'transparent',
        color: '#e2e8f0',
        border: 'none',
        cursor: 'pointer',
        opacity: '0.7',
    },
    '.cm-panel.cm-search button:hover': {
        opacity: '1',
    },
    '.cm-scroller': {
        overflow: 'auto',
    },
    '.cm-line': {
        padding: '0 4px',
    },
}, { dark: true });

// ─── Syntax highlighting colors ─────────────────────────
const gitMapsHighlight = HighlightStyle.define([
    { tag: t.keyword, color: '#c084fc' },           // purple for keywords
    { tag: t.controlKeyword, color: '#c084fc' },
    { tag: t.operatorKeyword, color: '#c084fc' },
    { tag: t.definitionKeyword, color: '#c084fc' },
    { tag: t.moduleKeyword, color: '#c084fc' },
    { tag: t.operator, color: '#94a3b8' },
    { tag: t.comment, color: '#6b7280', fontStyle: 'italic' },
    { tag: t.lineComment, color: '#6b7280', fontStyle: 'italic' },
    { tag: t.blockComment, color: '#6b7280', fontStyle: 'italic' },
    { tag: t.docComment, color: '#6b7280', fontStyle: 'italic' },
    { tag: t.string, color: '#34d399' },             // green for strings
    { tag: t.special(t.string), color: '#34d399' },
    { tag: t.number, color: '#f59e0b' },             // amber for numbers
    { tag: t.integer, color: '#f59e0b' },
    { tag: t.float, color: '#f59e0b' },
    { tag: t.bool, color: '#f59e0b' },
    { tag: t.null, color: '#f59e0b' },
    { tag: t.regexp, color: '#f97316' },             // orange for regex
    { tag: t.variableName, color: '#e2e8f0' },
    { tag: t.definition(t.variableName), color: '#60a5fa' }, // blue for definitions
    { tag: t.function(t.variableName), color: '#60a5fa' },   // blue for function names
    { tag: t.typeName, color: '#38bdf8' },           // sky blue for types
    { tag: t.className, color: '#38bdf8' },
    { tag: t.namespace, color: '#38bdf8' },
    { tag: t.propertyName, color: '#93c5fd' },       // light blue for properties
    { tag: t.definition(t.propertyName), color: '#93c5fd' },
    { tag: t.function(t.propertyName), color: '#60a5fa' },
    { tag: t.macroName, color: '#f97316' },
    { tag: t.labelName, color: '#c084fc' },
    { tag: t.meta, color: '#94a3b8' },
    { tag: t.annotation, color: '#f59e0b' },
    { tag: t.modifier, color: '#c084fc' },
    { tag: t.self, color: '#c084fc' },
    { tag: t.processingInstruction, color: '#94a3b8' },
    { tag: t.attributeName, color: '#93c5fd' },      // HTML/JSX attributes
    { tag: t.attributeValue, color: '#34d399' },
    { tag: t.angleBracket, color: '#94a3b8' },
    { tag: t.tagName, color: '#f472b6' },            // pink for HTML tags
    { tag: t.heading, color: '#60a5fa', fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.link, color: '#60a5fa', textDecoration: 'underline' },
    { tag: t.url, color: '#60a5fa', textDecoration: 'underline' },
    { tag: t.inserted, color: '#34d399' },
    { tag: t.deleted, color: '#ef4444' },
    { tag: t.changed, color: '#f59e0b' },
    { tag: t.invalid, color: '#ef4444' },
    { tag: t.escape, color: '#f97316' },
    { tag: t.punctuation, color: '#94a3b8' },
    { tag: t.bracket, color: '#94a3b8' },
    { tag: t.separator, color: '#94a3b8' },
    { tag: t.paren, color: '#94a3b8' },
    { tag: t.squareBracket, color: '#94a3b8' },
    { tag: t.brace, color: '#94a3b8' },
    { tag: t.derefOperator, color: '#94a3b8' },
]);

// ─── Language detection ─────────────────────────────────
function getLanguageExtension(ext: string) {
    switch (ext) {
        case 'js':
        case 'mjs':
        case 'cjs':
            return javascript();
        case 'jsx':
            return javascript({ jsx: true });
        case 'ts':
        case 'mts':
        case 'cts':
            return javascript({ typescript: true });
        case 'tsx':
            return javascript({ typescript: true, jsx: true });
        case 'css':
        case 'scss':
        case 'less':
            return css();
        case 'html':
        case 'htm':
        case 'svg':
            return html();
        case 'json':
        case 'jsonc':
            return json();
        case 'md':
        case 'mdx':
            return markdown();
        case 'py':
        case 'pyw':
            return python();
        case 'yaml':
        case 'yml':
            return yaml();
        default:
            return null;
    }
}

// ─── Create Editor ──────────────────────────────────────
export interface EditorInstance {
    view: EditorView;
    getContent: () => string;
    setContent: (content: string) => void;
    getCursorPosition: () => { line: number; col: number };
    destroy: () => void;
    focus: () => void;
}

export function createCodeEditor(
    parent: HTMLElement,
    content: string,
    ext: string,
    options: {
        onSave?: () => void;
        onChange?: (content: string) => void;
        onCursorMove?: (line: number, col: number) => void;
    } = {}
): EditorInstance {
    const langCompartment = new Compartment();
    const langExt = getLanguageExtension(ext);

    const extensions = [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        rectangularSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        syntaxHighlighting(gitMapsHighlight),
        gitMapsDarkTheme,
        keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            indentWithTab,
        ]),
        // Ctrl+S save handler
        keymap.of([{
            key: 'Mod-s',
            run: () => {
                options.onSave?.();
                return true;
            },
        }]),
        // Cursor position tracking
        EditorView.updateListener.of((update) => {
            if (update.selectionSet || update.docChanged) {
                const pos = update.state.selection.main.head;
                const line = update.state.doc.lineAt(pos);
                options.onCursorMove?.(line.number, pos - line.from + 1);
            }
            if (update.docChanged) {
                options.onChange?.(update.state.doc.toString());
            }
        }),
        // Prevent escape from bubbling (we handle it in the modal)
        EditorView.domEventHandlers({
            keydown(e) {
                if (e.key === 'Escape') {
                    // Let the modal handle Escape
                    return false;
                }
            },
        }),
        EditorView.lineWrapping,
    ];

    if (langExt) {
        extensions.push(langCompartment.of(langExt));
    }

    const state = EditorState.create({
        doc: content,
        extensions,
    });

    const view = new EditorView({
        state,
        parent,
    });

    return {
        view,
        getContent: () => view.state.doc.toString(),
        setContent: (newContent: string) => {
            view.dispatch({
                changes: {
                    from: 0,
                    to: view.state.doc.length,
                    insert: newContent,
                },
            });
        },
        getCursorPosition: () => {
            const pos = view.state.selection.main.head;
            const line = view.state.doc.lineAt(pos);
            return { line: line.number, col: pos - line.from + 1 };
        },
        destroy: () => view.destroy(),
        focus: () => view.focus(),
    };
}
