// @ts-nocheck
/**
 * Syntax highlighting & diff HTML builders.
 */
import { escapeHtml } from './utils';

// ─── Check if position is inside a string literal ────────
export function isInsideString(line: string, idx: number): boolean {
    let inSingle = false, inDouble = false;
    for (let i = 0; i < idx; i++) {
        if (line[i] === "'" && !inDouble) inSingle = !inSingle;
        if (line[i] === '"' && !inSingle) inDouble = !inDouble;
    }
    return inSingle || inDouble;
}

// ─── Syntax-highlighted HTML from file content ───────────
export function highlightSyntax(content: string, ext: string): string {
    const lines = content.split('\n');
    const isJSLike = ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(ext);
    const isPyLike = ['py', 'pyw'].includes(ext);
    const isCSSLike = ['css', 'scss', 'less', 'sass'].includes(ext);
    const isHTMLLike = ['html', 'htm', 'xml', 'svg', 'jsx', 'tsx'].includes(ext);
    const isRustGo = ['rs', 'go'].includes(ext);
    const isJSON = ext === 'json';
    const isMD = ['md', 'mdx'].includes(ext);
    const isYAML = ['yml', 'yaml', 'toml'].includes(ext);
    const isShell = ['sh', 'bash', 'zsh', 'fish', 'bat', 'cmd', 'ps1'].includes(ext);
    const isSQL = ext === 'sql';

    return lines.map((line, i) => {
        const lineNum = `<span class="line-num">${String(i + 1).padStart(4, ' ')}</span>`;
        let highlighted = escapeHtml(line);

        if (isJSON) {
            highlighted = highlighted
                .replace(/(&quot;[^&]*?&quot;)\s*:/g, '<span style="color:#7dd3fc">$1</span>:')
                .replace(/:(\s*)(&quot;[^&]*?&quot;)/g, ':$1<span style="color:#86efac">$2</span>')
                .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:#fbbf24">$1</span>')
                .replace(/\b(true|false|null)\b/g, '<span style="color:#c084fc">$1</span>');
        } else if (isCSSLike) {
            highlighted = highlighted
                .replace(/(\/\*.*?\*\/)/g, '<span style="color:#6b7280;font-style:italic">$1</span>')
                .replace(/(\/\/.*$)/g, '<span style="color:#6b7280;font-style:italic">$1</span>')
                .replace(/([.#][\w-]+)/g, '<span style="color:#7dd3fc">$1</span>')
                .replace(/(:\s*)([^;{}]+)(;)/g, '$1<span style="color:#86efac">$2</span>$3')
                .replace(/\b(\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms)?)\b/g, '<span style="color:#fbbf24">$1</span>');
        } else if (isMD) {
            highlighted = highlighted
                .replace(/^(#{1,6}\s.*)$/, '<span style="color:#c084fc;font-weight:600">$1</span>')
                .replace(/(\*\*[^*]+\*\*)/g, '<span style="color:#f0abfc;font-weight:600">$1</span>')
                .replace(/(\*[^*]+\*)/g, '<span style="color:#f0abfc;font-style:italic">$1</span>')
                .replace(/(`[^`]+`)/g, '<span style="color:#86efac;background:rgba(134,239,172,0.08);padding:1px 3px;border-radius:2px">$1</span>')
                .replace(/(\[[^\]]+\]\([^)]+\))/g, '<span style="color:#7dd3fc;text-decoration:underline">$1</span>')
                .replace(/^(\s*[-*+]\s)/g, '<span style="color:#fbbf24">$1</span>')
                .replace(/^(\s*\d+\.\s)/g, '<span style="color:#fbbf24">$1</span>')
                .replace(/^(&gt;\s.*)/g, '<span style="color:#6b7280;font-style:italic;border-left:2px solid #6b7280;padding-left:8px">$1</span>');
        } else if (isYAML) {
            highlighted = highlighted
                .replace(/(#.*$)/g, '<span style="color:#6b7280;font-style:italic">$1</span>')
                .replace(/^(\s*[\w.-]+)(\s*[:=])/g, '<span style="color:#7dd3fc">$1</span>$2')
                .replace(/:\s*(&quot;[^&]*?&quot;)/g, ': <span style="color:#86efac">$1</span>')
                .replace(/:\s*(&amp;#x27;[^&]*?&amp;#x27;)/g, ': <span style="color:#86efac">$1</span>')
                .replace(/\b(true|false|yes|no|null|~)\b/gi, '<span style="color:#c084fc">$1</span>')
                .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:#fbbf24">$1</span>')
                .replace(/^(\s*-\s)/g, '<span style="color:#fbbf24">$1</span>')
                .replace(/([\w.-]+\])/g, '<span style="color:#c084fc;font-weight:500">$1</span>');
        } else if (isShell) {
            highlighted = highlighted
                .replace(/(#.*$)/g, '<span style="color:#6b7280;font-style:italic">$1</span>')
                .replace(/(\$[\w{][^}\s]*}?)/g, '<span style="color:#7dd3fc">$1</span>')
                .replace(/(&quot;[^&]*?&quot;)/g, '<span style="color:#86efac">$1</span>')
                .replace(/(&amp;#x27;[^&]*?&amp;#x27;)/g, '<span style="color:#86efac">$1</span>');
            const shKeywords = 'if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|echo|export|source|local|set|unset|cd|mkdir|rm|cp|mv|cat|grep|sed|awk|chmod|chown';
            highlighted = highlighted.replace(
                new RegExp(`\\b(${shKeywords})\\b`, 'g'),
                '<span style="color:#c084fc">$1</span>'
            );
        } else if (isSQL) {
            const sqlKeywords = 'SELECT|FROM|WHERE|INSERT|INTO|UPDATE|SET|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|VIEW|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|NOT|IN|EXISTS|BETWEEN|LIKE|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|ALL|AS|IS|NULL|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|DEFAULT|CHECK|CONSTRAINT|VALUES|COUNT|SUM|AVG|MIN|MAX|DISTINCT';
            highlighted = highlighted
                .replace(/(--.*$)/g, '<span style="color:#6b7280;font-style:italic">$1</span>')
                .replace(/(&amp;#x27;[^&]*?&amp;#x27;)/g, '<span style="color:#86efac">$1</span>');
            highlighted = highlighted.replace(
                new RegExp(`\\b(${sqlKeywords})\\b`, 'gi'),
                '<span style="color:#c084fc">$1</span>'
            );
            highlighted = highlighted.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:#fbbf24">$1</span>');
        } else if (isJSLike || isPyLike || isRustGo) {
            const commentIdx = highlighted.indexOf('//');
            const hashIdx = isPyLike ? highlighted.indexOf('#') : -1;
            if (commentIdx >= 0 && !isInsideString(line, line.indexOf('//'))) {
                const before = highlighted.substring(0, commentIdx);
                const comment = highlighted.substring(commentIdx);
                highlighted = before + `<span style="color:#6b7280;font-style:italic">${comment}</span>`;
            } else if (hashIdx >= 0 && isPyLike && !isInsideString(line, line.indexOf('#'))) {
                const before = highlighted.substring(0, hashIdx);
                const comment = highlighted.substring(hashIdx);
                highlighted = before + `<span style="color:#6b7280;font-style:italic">${comment}</span>`;
            }

            highlighted = highlighted
                .replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)/g, '<span style="color:#86efac">$1</span>')
                .replace(/(&amp;#x27;(?:[^&]|&(?!#x27;))*?&amp;#x27;)/g, '<span style="color:#86efac">$1</span>')
                .replace(/(`[^`]*?`)/g, '<span style="color:#86efac">$1</span>');

            if (isJSLike || isPyLike) {
                highlighted = highlighted.replace(
                    /(@[\w.]+)/g,
                    '<span style="color:#fb923c">$1</span>'
                );
            }

            const keywords = isJSLike
                ? 'const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|delete|typeof|instanceof|in|of|class|extends|super|import|export|from|default|async|await|yield|this|null|undefined|true|false|void|static|get|set|type|interface|enum|as|is'
                : isPyLike
                    ? 'def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|raise|with|yield|lambda|pass|break|continue|and|or|not|in|is|True|False|None|self|async|await'
                    : 'fn|let|mut|const|if|else|for|while|loop|match|return|struct|enum|impl|trait|use|mod|pub|self|Self|true|false|async|await|type|func|go|defer|chan|select|range|package|import|var';
            highlighted = highlighted.replace(
                new RegExp(`\\b(${keywords})\\b`, 'g'),
                '<span style="color:#c084fc">$1</span>'
            );

            highlighted = highlighted.replace(/\b(\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/gi, '<span style="color:#fbbf24">$1</span>');
            highlighted = highlighted.replace(/\b([A-Z][a-zA-Z0-9_]*)\b/g, '<span style="color:#7dd3fc">$1</span>');
        } else if (isHTMLLike) {
            highlighted = highlighted
                .replace(/(&lt;\/?[\w-]+)/g, '<span style="color:#c084fc">$1</span>')
                .replace(/([\w-]+)(=)/g, '<span style="color:#7dd3fc">$1</span>$2')
                .replace(/(&quot;[^&]*?&quot;)/g, '<span style="color:#86efac">$1</span>');
        }

        return `<span class="diff-line">${lineNum}${highlighted}</span>`;
    }).join('\n');
}

// ─── Build diff HTML for the modal view ──────────────────
export function buildModalDiffHTML(file: any): string {
    let html = '';

    if (file.status === 'added' && file.content) {
        const lines = file.content.split('\n');
        html = lines.map((line: string, i: number) =>
            `<span class="diff-line diff-add" data-line="${i + 1}"><span class="line-num">${String(i + 1).padStart(4, ' ')}</span>+  ${escapeHtml(line)}</span>`
        ).join('\n');
    } else if (file.status === 'deleted' && file.content) {
        const lines = file.content.split('\n');
        html = lines.map((line: string, i: number) =>
            `<span class="diff-line diff-del" data-line="${i + 1}"><span class="line-num">${String(i + 1).padStart(4, ' ')}</span>-  ${escapeHtml(line)}</span>`
        ).join('\n');
    } else if (file.status === 'modified' && file.hunks?.length > 0) {
        const hunkSections = file.hunks.map((hunk: any) => {
            const header = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${hunk.context ? ' ' + escapeHtml(hunk.context) : ''}`;
            let oldLine = hunk.oldStart;
            let newLine = hunk.newStart;

            const lineItems = hunk.lines.map((l: any) => {
                if (l.type === 'add') {
                    const ln = newLine++;
                    return `<span class="diff-line diff-add" data-line="${ln}"><span class="line-num">${String(ln).padStart(4, ' ')}</span>+  ${escapeHtml(l.content)}</span>`;
                } else if (l.type === 'del') {
                    const ln = oldLine++;
                    return `<span class="diff-line diff-del" data-line="${ln}"><span class="line-num">${String(ln).padStart(4, ' ')}</span>-  ${escapeHtml(l.content)}</span>`;
                } else {
                    oldLine++; newLine++;
                    const ln = newLine - 1;
                    return `<span class="diff-line diff-ctx" data-line="${ln}"><span class="line-num">${String(ln).padStart(4, ' ')}</span>   ${escapeHtml(l.content)}</span>`;
                }
            }).join('\n');

            return `<span class="diff-line diff-hunk-header-line" style="color:var(--accent-tertiary);background:rgba(124,58,237,0.08);font-weight:500;">${header}</span>\n${lineItems}`;
        });
        html = hunkSections.join('\n\n');
    }

    return html || '<span style="color: var(--text-muted); font-style: italic;">No diff available</span>';
}
