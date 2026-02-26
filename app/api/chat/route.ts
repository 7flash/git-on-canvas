// @ts-nocheck
import { measure } from 'measure-fn';
import { streamLLM } from 'jsx-ai';

/**
 * POST /api/chat
 * Streams an AI chat response about a file or the whole canvas.
 * 
 * Body: { messages: [{role, content}], fileContext?: {path, content}, canvasContext?: {files: [{path, status}]} }
 */
export async function POST(req: Request) {
    return measure('api:chat', async () => {
        try {
            const body = await req.json();
            const { messages, fileContext, canvasContext, model } = body;

            if (!messages || !Array.isArray(messages)) {
                return new Response('messages array is required', { status: 400 });
            }

            // Build system prompt based on context
            let systemPrompt = '';

            if (fileContext) {
                systemPrompt = `You are an AI code assistant analyzing a specific file in a Git repository.

FILE: ${fileContext.path}
STATUS: ${fileContext.status || 'unknown'}

FILE CONTENT:
\`\`\`
${fileContext.content || '(no content available)'}
\`\`\`

${fileContext.diff ? `DIFF (changes in current commit):\n\`\`\`diff\n${fileContext.diff}\n\`\`\`` : ''}

Help the user understand this file. You can:
- Explain what the code does
- Point out potential issues or improvements
- Answer questions about specific parts
- Suggest refactorings
- Explain the diff/changes

Be concise but thorough. Use code blocks with language tags for code examples. Reference line numbers when relevant.`;
            } else if (canvasContext) {
                systemPrompt = `You are an AI code assistant helping analyze a Git repository's commit changes.

REPOSITORY: ${canvasContext.repoPath || 'unknown'}
CURRENT COMMIT: ${canvasContext.commitHash || 'none'} — ${canvasContext.commitMessage || ''}

FILES ON CANVAS:
${(canvasContext.files || []).map(f => `- ${f.path} (${f.status})`).join('\n')}

Help the user understand the codebase, the commit changes, relationships between files, architecture patterns, and potential issues. Be concise and actionable.`;
            } else {
                systemPrompt = `You are an AI code assistant. Help the user with their coding questions. Be concise and use code blocks with language tags.`;
            }

            // Build message array for streamLLM
            const llmMessages = [
                { role: 'system', content: systemPrompt },
                ...messages.map(m => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                })),
            ];

            const selectedModel = model || 'gemini-2.5-flash';

            // Create a ReadableStream that streams chunks
            const stream = new ReadableStream({
                async start(controller) {
                    try {
                        for await (const chunk of streamLLM(selectedModel, llmMessages, {
                            temperature: 0.3,
                            maxTokens: 4000,
                        })) {
                            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
                        }
                        controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
                        controller.close();
                    } catch (err) {
                        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
                        controller.close();
                    }
                },
            });

            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                },
            });
        } catch (error: any) {
            console.error('api:chat:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
