// @ts-nocheck
/**
 * Chat — AI chat sidebar for files and canvas.
 * Uses melina/client render + JSX instead of innerHTML.
 */
import { measure } from 'measure-fn';
import { render } from 'melina/client';
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

// ─── Render markdown-ish content to safe HTML string ────
function renderChatContent(text: string): string {
    let html = escapeHtml(text);
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) =>
        `<pre class="chat-code-block"><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`);
    html = html.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

// ─── JSX Components ─────────────────────────────────────

function TypingIndicator() {
    return (
        <div className="chat-message chat-assistant">
            <div className="chat-message-role">AI</div>
            <div className="chat-message-content chat-typing">
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
            </div>
        </div>
    );
}

function EmptyChat() {
    return (
        <div className="chat-empty">
            <span style="opacity:0.3;font-size:28px">💬</span>
            <span>Ask AI about this code</span>
        </div>
    );
}

function MessageList({ messages, isTyping }: { messages: ChatMessage[]; isTyping: boolean }) {
    if (messages.length === 0 && !isTyping) {
        return <EmptyChat />;
    }
    return (
        <div className="chat-message-list-inner">
            {messages.map((msg, i) => (
                <div key={i} className={`chat-message chat-${msg.role}`}>
                    <div className="chat-message-role">{msg.role === 'user' ? 'You' : 'AI'}</div>
                    <div className="chat-message-content" dangerouslySetInnerHTML={{ __html: renderChatContent(msg.content) }} />
                </div>
            ))}
            {isTyping && <TypingIndicator />}
        </div>
    );
}

function ChatPanel({
    containerId, title, messages, isTyping, onSend, onClose
}: {
    containerId: string; title: string; messages: ChatMessage[];
    isTyping: boolean; onSend: (text: string) => void; onClose: () => void;
}) {
    const handleSend = () => {
        const input = document.getElementById(`${containerId}Input`) as HTMLTextAreaElement;
        if (input && input.value.trim()) {
            onSend(input.value);
            input.value = '';
        }
    };

    const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="chat-panel" id={containerId}>
            <div className="chat-header">
                <div className="chat-header-left">
                    <span style="font-size:14px">💬</span>
                    <span className="chat-title">{title}</span>
                </div>
                <button className="chat-close btn-ghost btn-xs" onClick={onClose}>✕</button>
            </div>
            <div className="chat-messages" id={`${containerId}Messages`}>
                <MessageList messages={messages} isTyping={isTyping} />
            </div>
            <div className="chat-input-area">
                <textarea
                    className="chat-input"
                    id={`${containerId}Input`}
                    placeholder="Ask about this code..."
                    rows={2}
                    onKeydown={handleKeydown}
                />
                <button className="chat-send" id={`${containerId}Send`} onClick={handleSend} disabled={isTyping}>
                    ➤
                </button>
            </div>
        </div>
    );
}

// ─── Render/re-render a chat panel into a container ─────
function renderChatPanel(container: HTMLElement, containerId: string, title: string, state: ChatState) {
    const onSend = (text: string) => {
        if (!text.trim() || state.isStreaming) return;
        state.messages = [...state.messages, { role: 'user', content: text.trim() }];
        rerender();
        streamResponse(state, container, containerId, title, () => rerender());
    };

    const onClose = () => {
        container.style.display = 'none';
    };

    function rerender() {
        render(
            <ChatPanel
                containerId={containerId}
                title={title}
                messages={state.messages}
                isTyping={state.isStreaming && state.messages[state.messages.length - 1]?.content === ''}
                onSend={onSend}
                onClose={onClose}
            />,
            container
        );
        // Auto-scroll
        const msgEl = document.getElementById(`${containerId}Messages`);
        if (msgEl) msgEl.scrollTop = msgEl.scrollHeight;
    }

    rerender();
    return rerender;
}

// ─── Stream a response from the API ─────────────────────
async function streamResponse(
    state: ChatState,
    container: HTMLElement,
    containerId: string,
    title: string,
    onUpdate: () => void
) {
    if (state.isStreaming) return;
    state.isStreaming = true;

    // Add assistant placeholder
    state.messages = [...state.messages, { role: 'assistant', content: '' }];
    const assistantIdx = state.messages.length - 1;
    onUpdate();

    try {
        const body: any = {
            messages: state.messages.slice(0, -1),
        };
        if (state.fileContext) body.fileContext = state.fileContext;
        if (state.canvasContext) body.canvasContext = state.canvasContext;

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) throw new Error(await response.text());

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';

        while (reader) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (!data || data === '[DONE]') break;

                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        fullText += `\n\n**Error:** ${parsed.error}`;
                        state.messages = [...state.messages];
                        state.messages[assistantIdx].content = fullText;
                        onUpdate();
                        break;
                    }
                    if (parsed.text) {
                        fullText += parsed.text;
                        state.messages = [...state.messages];
                        state.messages[assistantIdx].content = fullText;
                        onUpdate();
                    }
                } catch (e) { /* skip */ }
            }
        }

        if (!fullText) state.messages[assistantIdx].content = '*No response received.*';

    } catch (err) {
        state.messages = [...state.messages];
        state.messages[assistantIdx].content = `**Error:** ${err.message}`;
    }

    state.isStreaming = false;
    onUpdate();
}

// ─── Open file chat in modal ────────────────────────────
export function openFileChatInModal(filePath: string, content: string, status: string, diff?: string) {
    measure('chat:openFileChat', () => {
        if (!fileChatStates.has(filePath)) {
            fileChatStates.set(filePath, {
                messages: [], isStreaming: false,
                fileContext: { path: filePath, content, status, diff },
            });
        }
        const state = fileChatStates.get(filePath)!;
        state.fileContext = { path: filePath, content, status, diff };

        let chatContainer = document.getElementById('modalChatContainer');
        if (!chatContainer) return;

        chatContainer.style.display = 'flex';
        renderChatPanel(chatContainer, 'modalFileChat', 'AI Chat', state);
    });
}

// ─── Open canvas-wide AI chat sidebar ───────────────────
export function openCanvasChat(ctx: CanvasContext) {
    measure('chat:openCanvasChat', () => {
        const state = ctx.snap().context;
        const selected = state.selectedCards || [];

        const files: any[] = [];
        ctx.fileCards.forEach((card, path) => {
            if (selected.length > 0 && !selected.includes(path)) return;
            const status = card.querySelector('.diff-badge')?.textContent || 'file';
            files.push({ path, status });
        });

        canvasChatState.canvasContext = {
            repoPath: state.repoPath,
            commitHash: state.currentCommitHash || '',
            commitMessage: '',
            files,
        };

        let chatSidebar = document.getElementById('canvasChatWrapper');
        if (!chatSidebar) {
            const main = document.querySelector('.canvas-area');
            if (!main) return;
            chatSidebar = document.createElement('div');
            chatSidebar.id = 'canvasChatWrapper';
            chatSidebar.style.display = 'flex';
            main.appendChild(chatSidebar);
        }

        chatSidebar.style.display = 'flex';
        renderChatPanel(chatSidebar, 'canvasChat', 'Canvas AI', canvasChatState);

        const input = document.getElementById('canvasChatInput') as HTMLTextAreaElement;
        if (input) setTimeout(() => input.focus(), 100);
    });
}

// ─── Toggle canvas chat ─────────────────────────────────
export function toggleCanvasChat(ctx: CanvasContext) {
    const chatSidebar = document.getElementById('canvasChatWrapper');
    if (chatSidebar && chatSidebar.style.display !== 'none') {
        chatSidebar.style.display = 'none';
    } else {
        openCanvasChat(ctx);
    }
}
