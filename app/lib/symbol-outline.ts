// @ts-nocheck
/**
 * Symbol outline panel — extracts functions, classes, interfaces, types,
 * and exports from file content and renders them as a navigable list.
 */

export interface SymbolEntry {
    name: string;
    kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'variable' | 'enum' | 'method' | 'export';
    line: number;
    indent: number; // nesting depth
}

// ─── Symbol extraction patterns ─────────────────────
const PATTERNS: Array<{ regex: RegExp; kind: SymbolEntry['kind'] }> = [
    // JS/TS: export function / async function / function
    { regex: /^(\s*)(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm, kind: 'function' },
    // JS/TS: arrow function assigned to const/let/var
    { regex: /^(\s*)(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>/gm, kind: 'function' },
    // JS/TS: class
    { regex: /^(\s*)(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm, kind: 'class' },
    // TS: interface
    { regex: /^(\s*)(?:export\s+)?interface\s+(\w+)/gm, kind: 'interface' },
    // TS: type alias
    { regex: /^(\s*)(?:export\s+)?type\s+(\w+)\s*[=<]/gm, kind: 'type' },
    // TS: enum
    { regex: /^(\s*)(?:export\s+)?enum\s+(\w+)/gm, kind: 'enum' },
    // JS/TS: exported const (non-arrow)
    { regex: /^(\s*)export\s+(?:const|let|var)\s+(\w+)\s*[=:]/gm, kind: 'const' },
    // Class methods
    { regex: /^(\s+)(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/gm, kind: 'method' },
    // Python: def / class
    { regex: /^(\s*)def\s+(\w+)/gm, kind: 'function' },
    { regex: /^(\s*)class\s+(\w+)/gm, kind: 'class' },
];

/**
 * Extract symbols from file content.
 */
export function extractSymbols(content: string, fileName: string): SymbolEntry[] {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const isPython = ext === 'py';
    const isCSS = ext === 'css' || ext === 'scss' || ext === 'less';
    const isJSON = ext === 'json';
    const isMarkdown = ext === 'md';

    // CSS: extract selectors/rules
    if (isCSS) return extractCSSSymbols(content);
    // JSON: extract top-level keys
    if (isJSON) return extractJSONSymbols(content);
    // Markdown: extract headings
    if (isMarkdown) return extractMarkdownSymbols(content);

    const symbols: SymbolEntry[] = [];
    const lines = content.split('\n');

    for (const pattern of PATTERNS) {
        // Skip Python-specific patterns for non-Python, and vice versa
        if (isPython && pattern.kind === 'interface') continue;
        if (isPython && pattern.kind === 'type') continue;
        if (isPython && pattern.kind === 'enum') continue;

        pattern.regex.lastIndex = 0;
        let match;
        while ((match = pattern.regex.exec(content)) !== null) {
            const indent = (match[1] || '').length;
            const name = match[2];
            if (!name || name === 'if' || name === 'for' || name === 'while' || name === 'switch' || name === 'catch' || name === 'return') continue;

            // Calculate line number
            const beforeMatch = content.slice(0, match.index);
            const line = beforeMatch.split('\n').length;

            // Skip methods that are too deeply nested (likely control flow)
            if (pattern.kind === 'method' && indent < 2) continue;

            symbols.push({ name, kind: pattern.kind, line, indent: Math.floor(indent / 2) });
        }
    }

    // Deduplicate (same name + line)
    const seen = new Set<string>();
    return symbols
        .filter(s => {
            const key = `${s.name}:${s.line}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => a.line - b.line);
}

function extractCSSSymbols(content: string): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const regex = /^([.#@][^\s{]+)\s*\{/gm;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const beforeMatch = content.slice(0, match.index);
        const line = beforeMatch.split('\n').length;
        symbols.push({ name: match[1], kind: 'class', line, indent: 0 });
    }
    return symbols.sort((a, b) => a.line - b.line);
}

function extractJSONSymbols(content: string): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const regex = /^(\s*)"(\w+)"\s*:/gm;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const indent = (match[1] || '').length;
        if (indent > 4) continue; // Only top-level and one level deep
        const beforeMatch = content.slice(0, match.index);
        const line = beforeMatch.split('\n').length;
        symbols.push({ name: match[2], kind: 'const', line, indent: Math.floor(indent / 2) });
    }
    return symbols.sort((a, b) => a.line - b.line);
}

function extractMarkdownSymbols(content: string): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const regex = /^(#{1,6})\s+(.+)$/gm;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const level = match[1].length;
        const beforeMatch = content.slice(0, match.index);
        const line = beforeMatch.split('\n').length;
        symbols.push({ name: match[2].trim(), kind: 'export', line, indent: level - 1 });
    }
    return symbols.sort((a, b) => a.line - b.line);
}

// ─── Symbol icons ───────────────────────────────────
const SYMBOL_ICONS: Record<SymbolEntry['kind'], string> = {
    function: 'ƒ',
    class: '◆',
    interface: '◇',
    type: 'T',
    const: '●',
    variable: '○',
    enum: 'E',
    method: 'μ',
    export: '→',
};

const SYMBOL_COLORS: Record<SymbolEntry['kind'], string> = {
    function: '#c4b5fd',
    class: '#86efac',
    interface: '#67e8f9',
    type: '#fde68a',
    const: '#93c5fd',
    variable: '#9ca3af',
    enum: '#f9a8d4',
    method: '#a5b4fc',
    export: '#fdba74',
};

/**
 * Render the symbol outline panel.
 */
export function renderSymbolOutline(
    container: HTMLElement,
    content: string,
    fileName: string,
    onSymbolClick: (line: number) => void
) {
    const symbols = extractSymbols(content, fileName);

    if (symbols.length === 0) {
        container.innerHTML = '<div class="outline-empty">No symbols found</div>';
        return;
    }

    container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'outline-header';
    header.innerHTML = `<span class="outline-title">Outline</span><span class="outline-count">${symbols.length}</span>`;
    container.appendChild(header);

    // Symbol list
    const list = document.createElement('div');
    list.className = 'outline-list';

    for (const sym of symbols) {
        const item = document.createElement('button');
        item.className = 'outline-item';
        item.style.paddingLeft = `${12 + sym.indent * 14}px`;
        item.title = `${sym.kind}: ${sym.name} (line ${sym.line})`;

        const icon = document.createElement('span');
        icon.className = 'outline-icon';
        icon.textContent = SYMBOL_ICONS[sym.kind];
        icon.style.color = SYMBOL_COLORS[sym.kind];
        item.appendChild(icon);

        const name = document.createElement('span');
        name.className = 'outline-name';
        name.textContent = sym.name;
        item.appendChild(name);

        const lineNo = document.createElement('span');
        lineNo.className = 'outline-lineno';
        lineNo.textContent = `:${sym.line}`;
        item.appendChild(lineNo);

        item.addEventListener('click', () => onSymbolClick(sym.line));
        list.appendChild(item);
    }

    container.appendChild(list);
}
