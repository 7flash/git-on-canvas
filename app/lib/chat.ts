// @ts-nocheck
/**
 * Chat — AI chat sidebar for files and canvas.
 * Uses SSE streaming from /api/chat endpoint.
 */
import { measure } from 'measure-fn';
import type { CanvasContext } from './context';
import { escapeHtml } from './utils';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface ChatState {
    messages: ChatMessage[];
    isStreaming: boolean;
    fileContext?: { path: string; content: string; status: string; diff?: string };
    canvasContext?: { repoPath: string; commitHash: string; commitMessage: string; files: any[] };
}

// Per-file chat histories
const fileChatStates = new Map<string, ChatState>();
let canvasChatState: ChatState = { messages: [], isStreaming: false };

// ─── Render markdown-ish content to HTML ────────────────
function renderChatContent(text: string): string {
    let html = escapeHtml(text);

    // Code blocks with language
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre class="chat-code-block"><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
}

// ─── Create chat panel HTML ─────────────────────────────
function createChatPanel(containerId: string, title: string): string {
    return `
        <div class="chat-panel" id="${containerId}">
            <div class="chat-header">
                <div class="chat-header-left">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                    <span class="chat-title">${title}</span>
                </div>
                <button class="chat-close btn-ghost btn-xs" data-close="${containerId}">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="chat-messages" id="${containerId}Messages"></div>
            <div class="chat-input-area">
                <textarea class="chat-input" id="${containerId}Input" placeholder="Ask about this code..." rows="2"></textarea>
                <button class="chat-send" id="${containerId}Send">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="22" y1="2" x2="11" y2="13"/>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

// ─── Render messages into a chat container ──────────────
function renderMessages(containerId: string, messages: ChatMessage[]) {
    const msgContainer = document.getElementById(`${containerId}Messages`);
    if (!msgContainer) return;

    if (messages.length === 0) {
        msgContainer.innerHTML = `
            <div class="chat-empty">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
                <span>Ask AI about this code</span>
            </div>
        `;
        return;
    }

    msgContainer.innerHTML = messages.map(msg => `
        <div class="chat-message chat-${msg.role}">
            <div class="chat-message-role">${msg.role === 'user' ? 'You' : 'AI'}</div>
            <div class="chat-message-content">${renderChatContent(msg.content)}</div>
        </div>
    `).join('');

    // Auto-scroll to bottom
    msgContainer.scrollTop = msgContainer.scrollHeight;
}

// ─── Stream a response from the API ─────────────────────
async function streamResponse(
    state: ChatState,
    containerId: string,
    onDone?: () => void
) {
    if (state.isStreaming) return;
    state.isStreaming = true;

    const msgContainer = document.getElementById(`${containerId}Messages`);
    const sendBtn = document.getElementById(`${containerId}Send`) as HTMLButtonElement;
    if (sendBtn) sendBtn.disabled = true;

    // Add assistant placeholder
    state.messages.push({ role: 'assistant', content: '' });
    const assistantIdx = state.messages.length - 1;

    // Show typing indicator
    if (msgContainer) {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'chat-message chat-assistant';
        typingDiv.id = `${containerId}Typing`;
        typingDiv.innerHTML = `
            <div class="chat-message-role">AI</div>
            <div class="chat-message-content chat-typing">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `;
        msgContainer.appendChild(typingDiv);
        msgContainer.scrollTop = msgContainer.scrollHeight;
    }

    try {
        const body: any = {
            messages: state.messages.slice(0, -1), // exclude empty assistant placeholder
        };
        if (state.fileContext) body.fileContext = state.fileContext;
        if (state.canvasContext) body.canvasContext = state.canvasContext;

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let firstChunk = true;

        while (reader) {
            const { done, value } = await reader.read();
            if (done) break;

            const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '));

            for (const line of lines) {
                const data = line.slice(6);
                if (data === '[DONE]') break;

                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        fullText += `\n\n**Error:** ${parsed.error}`;
                        break;
                    }
                    if (parsed.text) {
                        fullText += parsed.text;

                        // Remove typing indicator on first chunk
                        if (firstChunk) {
                            const typing = document.getElementById(`${containerId}Typing`);
                            if (typing) typing.remove();
                            firstChunk = false;
                        }

                        // Update the assistant message
                        state.messages[assistantIdx].content = fullText;
                        renderMessages(containerId, state.messages);
                    }
                } catch (e) { /* skip malformed */ }
            }
        }

        if (!fullText) {
            state.messages[assistantIdx].content = '*No response received.*';
        }

    } catch (err) {
        state.messages[assistantIdx].content = `**Error:** ${err.message}`;
        const typing = document.getElementById(`${containerId}Typing`);
        if (typing) typing.remove();
    }

    state.isStreaming = false;
    if (sendBtn) sendBtn.disabled = false;
    renderMessages(containerId, state.messages);
    if (onDone) onDone();
}

// ─── Send a message ─────────────────────────────────────
function sendMessage(state: ChatState, containerId: string, text: string) {
    if (!text.trim() || state.isStreaming) return;

    state.messages.push({ role: 'user', content: text.trim() });
    renderMessages(containerId, state.messages);

    const input = document.getElementById(`${containerId}Input`) as HTMLTextAreaElement;
    if (input) input.value = '';

    streamResponse(state, containerId);
}

// ─── Wire up a chat panel ───────────────────────────────
function wireChat(containerId: string, state: ChatState) {
    const input = document.getElementById(`${containerId}Input`) as HTMLTextAreaElement;
    const sendBtn = document.getElementById(`${containerId}Send`);
    const closeBtn = document.querySelector(`[data-close="${containerId}"]`);

    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            if (input) sendMessage(state, containerId, input.value);
        });
    }

    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(state, containerId, input.value);
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            const panel = document.getElementById(containerId);
            if (panel) panel.style.display = 'none';
        });
    }

    renderMessages(containerId, state.messages);
}

// ─── Open file chat in modal sidebar ────────────────────
export function openFileChatInModal(filePath: string, content: string, status: string, diff?: string) {
    measure('chat:openFileChat', () => {
        // Get or create chat state for this file
        if (!fileChatStates.has(filePath)) {
            fileChatStates.set(filePath, {
                messages: [],
                isStreaming: false,
                fileContext: { path: filePath, content, status, diff },
            });
        }
        const state = fileChatStates.get(filePath)!;
        // Update context in case file changed
        state.fileContext = { path: filePath, content, status, diff };

        // Check if chat panel already exists in modal
        let chatPanel = document.getElementById('modalFileChat');
        if (!chatPanel) {
            const modalContent = document.querySelector('.modal-content');
            if (!modalContent) return;

            // Insert chat panel
            modalContent.insertAdjacentHTML('beforeend', createChatPanel('modalFileChat', `AI Chat`));
            chatPanel = document.getElementById('modalFileChat');
        }

        if (chatPanel) {
            chatPanel.style.display = 'flex';
            wireChat('modalFileChat', state);
        }
    });
}

// ─── Open canvas-wide AI chat sidebar ───────────────────
export function openCanvasChat(ctx: CanvasContext) {
    measure('chat:openCanvasChat', () => {
        const state = ctx.snap().context;

        // Build canvas context from current state
        const files = [];
        ctx.fileCards.forEach((card, path) => {
            const status = card.querySelector('.diff-badge')?.textContent || 'file';
            files.push({ path, status });
        });

        canvasChatState.canvasContext = {
            repoPath: state.repoPath,
            commitHash: state.currentCommitHash || '',
            commitMessage: '',
            files,
        };

        let chatSidebar = document.getElementById('canvasChat');
        if (!chatSidebar) {
            const main = document.querySelector('.canvas-area');
            if (!main) return;

            main.insertAdjacentHTML('beforeend', createChatPanel('canvasChat', 'Canvas AI'));
            chatSidebar = document.getElementById('canvasChat');
        }

        if (chatSidebar) {
            chatSidebar.style.display = 'flex';
            wireChat('canvasChat', canvasChatState);

            // Focus input
            const input = document.getElementById('canvasChatInput') as HTMLTextAreaElement;
            if (input) setTimeout(() => input.focus(), 100);
        }
    });
}

// ─── Toggle canvas chat ─────────────────────────────────
export function toggleCanvasChat(ctx: CanvasContext) {
    const chatSidebar = document.getElementById('canvasChat');
    if (chatSidebar && chatSidebar.style.display !== 'none') {
        chatSidebar.style.display = 'none';
    } else {
        openCanvasChat(ctx);
    }
}
