// @ts-nocheck
/**
 * Card diff markers — scrollbar annotations, deleted-lines overlay,
 * and scroll-to-line helper.
 *
 * Extracted from cards.tsx to reduce file size.
 * These are internal helpers called from createFileCard / createAllFileCard.
 */
import { escapeHtml } from './utils';

// ─── Scroll to line helper ──────────────────────────────
export function scrollToLine(body: HTMLElement, lineNum: number, totalLines: number) {
    const lineEl = body.querySelector(`.diff-line[data-line="${lineNum}"]`) as HTMLElement;
    const pre = body.querySelector('.file-content-preview pre') as HTMLElement;
    if (!pre) return;

    if (lineEl) {
        // getBoundingClientRect() returns viewport coordinates (affected by CSS transform/zoom).
        // pre.scrollTop works in LOCAL content coordinates (unaffected by zoom).
        // Compute the effective zoom from rendered vs logical dimensions.
        const preRect = pre.getBoundingClientRect();
        const zoom = preRect.height / pre.clientHeight || 1;
        const lineRect = lineEl.getBoundingClientRect();
        // Convert viewport delta to content delta by dividing by zoom
        pre.scrollTop += (lineRect.top - preRect.top) / zoom;
    } else {
        // Fallback to percentage-based scroll
        const pct = (lineNum - 1) / totalLines;
        pre.scrollTop = pct * pre.scrollHeight;
    }
}

// ─── Merge line numbers into contiguous regions ─────────
function mergeIntoRegions(lineNums: number[], gap = 4): { start: number; end: number }[] {
    const sorted = lineNums.sort((a, b) => a - b);
    const regions: { start: number; end: number }[] = [];
    for (const line of sorted) {
        const last = regions[regions.length - 1];
        if (last && line <= last.end + gap) {
            last.end = line;
        } else {
            regions.push({ start: line, end: line });
        }
    }
    return regions;
}

// ─── Diff marker strip (scrollbar annotations) ─────────
export function buildDiffMarkerStrip(card: HTMLElement, body: HTMLElement, addedLines: Set<number>, totalLines: number, deletedBeforeLine?: Map<number, string[]>, fileHunks?: any[]) {
    if (!body || totalLines === 0) return;

    const strip = document.createElement('div');
    strip.className = 'diff-marker-strip';

    // Green markers for added lines
    const addedRegions = mergeIntoRegions(Array.from(addedLines));
    for (const region of addedRegions) {
        const topPct = ((region.start - 1) / totalLines) * 100;
        const heightPct = Math.max(0.5, ((region.end - region.start + 1) / totalLines) * 100);

        const marker = document.createElement('div');
        marker.className = 'diff-marker diff-marker--add';
        marker.style.top = `${topPct}%`;
        marker.style.height = `${heightPct}%`;
        marker.title = region.start === region.end
            ? `Added: line ${region.start}`
            : `Added: lines ${region.start}–${region.end}`;

        marker.addEventListener('click', (e) => {
            e.stopPropagation();
            scrollToLine(body, region.start, totalLines);
        });

        strip.appendChild(marker);
    }

    // Red markers for deleted line locations
    if (deletedBeforeLine && deletedBeforeLine.size > 0) {
        const deletedRegions = mergeIntoRegions(Array.from(deletedBeforeLine.keys()));
        for (const region of deletedRegions) {
            const topPct = ((region.start - 1) / totalLines) * 100;
            const heightPct = Math.max(0.5, ((region.end - region.start + 1) / totalLines) * 100);

            const marker = document.createElement('div');
            marker.className = 'diff-marker diff-marker--del';
            marker.style.top = `${topPct}%`;
            marker.style.height = `${heightPct}%`;
            let delCount = 0;
            for (let ln = region.start; ln <= region.end; ln++) {
                delCount += (deletedBeforeLine.get(ln) || []).length;
            }
            marker.title = `${delCount} deleted line${delCount > 1 ? 's' : ''} near line ${region.start}`;

            marker.addEventListener('click', (e) => {
                e.stopPropagation();
                scrollToLine(body, region.start, totalLines);
            });

            strip.appendChild(marker);
        }
    }

    // Build navigation regions
    const allChangedLines = [
        ...Array.from(addedLines),
        ...(deletedBeforeLine ? Array.from(deletedBeforeLine.keys()) : [])
    ];
    const allRegions = mergeIntoRegions(allChangedLines);

    const navRegions: { start: number; end: number }[] = fileHunks && fileHunks.length > 0
        ? fileHunks.map((h: any) => ({ start: h.newStart, end: h.newStart + (h.newCount || 1) - 1 }))
        : allRegions;

    // Insert nav buttons inline inside the .file-path element
    if (navRegions.length > 0) {
        let currentIdx = -1;

        const filePath = body.querySelector('.file-path') as HTMLElement;
        if (filePath) {
            filePath.style.display = 'flex';
            filePath.style.alignItems = 'center';
            filePath.style.justifyContent = 'space-between';

            const pathText = filePath.textContent || '';
            filePath.textContent = '';
            const pathSpan = document.createElement('span');
            pathSpan.textContent = pathText;
            pathSpan.style.overflow = 'hidden';
            pathSpan.style.textOverflow = 'ellipsis';
            filePath.appendChild(pathSpan);

            const navGroup = document.createElement('span');
            navGroup.className = 'diff-nav-inline';
            navGroup.title = `${navRegions.length} change${navRegions.length > 1 ? 's' : ''}`;

            const navLabel = document.createElement('span');
            navLabel.className = 'diff-nav-label';
            navLabel.textContent = `—/${navRegions.length}`;

            const navUp = document.createElement('button');
            navUp.className = 'diff-nav-btn';
            navUp.textContent = '▲';
            navUp.title = 'Previous change';
            navUp.addEventListener('click', (e) => {
                e.stopPropagation();
                if (currentIdx <= 0) currentIdx = navRegions.length - 1;
                else currentIdx--;
                scrollToLine(body, navRegions[currentIdx].start, totalLines);
                navLabel.textContent = `${currentIdx + 1}/${navRegions.length}`;
            });

            const navDown = document.createElement('button');
            navDown.className = 'diff-nav-btn';
            navDown.textContent = '▼';
            navDown.title = 'Next change';
            navDown.addEventListener('click', (e) => {
                e.stopPropagation();
                if (currentIdx >= navRegions.length - 1) currentIdx = 0;
                else currentIdx++;
                scrollToLine(body, navRegions[currentIdx].start, totalLines);
                navLabel.textContent = `${currentIdx + 1}/${navRegions.length}`;
            });

            navGroup.appendChild(navUp);
            navGroup.appendChild(navLabel);
            navGroup.appendChild(navDown);
            filePath.appendChild(navGroup);
        }
    }

    // Append strip to card (not body) so it doesn't scroll with content
    card.appendChild(strip);
}

// ─── Deleted lines hover overlay ────────────────────────
export function setupDeletedLinesOverlay(card: HTMLElement) {
    let overlay: HTMLElement | null = null;
    let hideTimeout: any = null;

    card.addEventListener('mouseover', (e) => {
        const target = e.target as HTMLElement;
        const lineNum = target.closest('.line-num');
        const diffLine = target.closest('.has-deleted') as HTMLElement;
        if (!lineNum || !diffLine) return;

        const delLinesRaw = diffLine.dataset.delLines;
        if (!delLinesRaw) return;

        if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }

        try {
            const deletedLines: string[] = JSON.parse(decodeURIComponent(delLinesRaw));
            if (deletedLines.length === 0) return;

            if (overlay) overlay.remove();

            overlay = document.createElement('div');
            overlay.className = 'deleted-lines-overlay';

            const header = document.createElement('div');
            header.className = 'deleted-overlay-header';
            header.textContent = `${deletedLines.length} deleted line${deletedLines.length > 1 ? 's' : ''}`;
            overlay.appendChild(header);

            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.innerHTML = deletedLines.map((line, i) =>
                `<span class="diff-line diff-del"><span class="line-num del-line-num">  −</span>${escapeHtml(line)}</span>`
            ).join('\n');
            pre.appendChild(code);
            overlay.appendChild(pre);

            const lineRect = diffLine.getBoundingClientRect();
            const cardRect = card.getBoundingClientRect();
            overlay.style.top = `${lineRect.top - cardRect.top - overlay.offsetHeight}px`;
            overlay.style.left = '50px';

            card.appendChild(overlay);

            requestAnimationFrame(() => {
                if (!overlay) return;
                const overlayH = overlay.offsetHeight;
                const yPos = lineRect.top - cardRect.top;
                if (yPos - overlayH > 36) {
                    overlay.style.top = `${yPos - overlayH}px`;
                } else {
                    overlay.style.top = `${yPos + lineRect.height}px`;
                }
            });

            overlay.addEventListener('mouseenter', () => {
                if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
            });
            overlay.addEventListener('mouseleave', () => {
                hideTimeout = setTimeout(() => {
                    if (overlay) { overlay.remove(); overlay = null; }
                }, 200);
            });
        } catch (err) { /* ignore parse errors */ }
    });

    card.addEventListener('mouseout', (e) => {
        const target = e.target as HTMLElement;
        const lineNum = target.closest('.line-num');
        const diffLine = target.closest('.has-deleted');
        if (!lineNum || !diffLine) return;

        hideTimeout = setTimeout(() => {
            if (overlay) { overlay.remove(); overlay = null; }
        }, 300);
    });
}
