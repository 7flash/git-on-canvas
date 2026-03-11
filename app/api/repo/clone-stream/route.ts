import { measure } from 'measure-fn';
import path from 'path';
import fs from 'fs';


const CLONES_DIR = path.join(process.cwd(), 'git-canvas', 'repos');

/**
 * POST /api/repo/clone-stream
 * Body: { url: string }
 * Streams clone progress via SSE, then emits a final "done" or "error" event.
 *
 * SSE events:
 *   event: progress\n data: {"message":"Receiving objects: 45%","percent":45}\n\n
 *   event: done\n     data: {"ok":true,"path":"...","cached":false}\n\n
 *   event: error\n    data: {"error":"Clone failed"}\n\n
 */
export async function POST(req: Request) {
    const { url } = await req.json() as { url: string };

    if (!url || typeof url !== 'string') {
        return Response.json({ error: 'url is required' }, { status: 400 });
    }

    const isGitUrl = url.startsWith('git@') || url.startsWith('https://') || url.startsWith('http://') || url.endsWith('.git');
    if (!isGitUrl) {
        return Response.json({ error: 'Invalid git URL. Use https:// or git@ format.' }, { status: 400 });
    }

    const repoName = url
        .replace(/\.git$/, '')
        .split('/')
        .pop()!
        .split(':')
        .pop()!
        .replace(/[^a-zA-Z0-9._-]/g, '_');

    if (!repoName) {
        return Response.json({ error: 'Could not determine repository name from URL' }, { status: 400 });
    }

    fs.mkdirSync(CLONES_DIR, { recursive: true });
    const targetPath = path.join(CLONES_DIR, repoName);

    // If already cloned, do a quick pull and return immediately
    if (fs.existsSync(path.join(targetPath, '.git'))) {
        return measure('api:repo:clone-stream:cached', async () => {
            try {
                const pull = Bun.spawn(['git', 'pull'], { cwd: targetPath, stdio: ['ignore', 'pipe', 'pipe'] });
                await pull.exited;
                console.log(`[clone-stream] Updated existing repo: ${repoName}`);
            } catch {
                console.log(`[clone-stream] Using existing repo (pull skipped): ${repoName}`);
            }
            return Response.json({ ok: true, path: targetPath, cached: true });
        });
    }

    // ── Stream clone progress via SSE ──
    console.log(`[clone-stream] Cloning ${url} → ${targetPath}`);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            function sendSSE(event: string, data: any) {
                const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
                try { controller.enqueue(encoder.encode(payload)); } catch { /* stream closed */ }
            }

            sendSSE('progress', { message: `Starting clone of ${repoName}...`, percent: 0 });

            const gitProc = Bun.spawn(['git', 'clone', '--depth', '100', '--progress', url, targetPath], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            // Git writes progress to stderr
            let lastPercent = 0;

            function parseProgress(chunk: Buffer) {
                const lines = chunk.toString().split(/[\r\n]+/);
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;

                    // Parse percentage from git output like "Receiving objects:  45% (100/222)"
                    const pctMatch = trimmed.match(/(\d+)%/);
                    let percent = lastPercent;
                    if (pctMatch) {
                        percent = parseInt(pctMatch[1], 10);
                        // Git has multiple phases — scale the overall progress
                        if (trimmed.startsWith('Counting')) percent = Math.round(percent * 0.1);
                        else if (trimmed.startsWith('Compressing')) percent = 10 + Math.round(percent * 0.1);
                        else if (trimmed.startsWith('Receiving')) percent = 20 + Math.round(percent * 0.6);
                        else if (trimmed.startsWith('Resolving')) percent = 80 + Math.round(percent * 0.2);
                        lastPercent = percent;
                    }

                    sendSSE('progress', { message: trimmed, percent: Math.min(percent, 99) });
                }
            }

            async function consumeStream(stream: ReadableStream) {
                try {
                    for await (const chunk of stream) {
                        parseProgress(Buffer.from(chunk));
                    }
                } catch (e) {
                    console.error('[clone-stream] stream parse error:', e);
                }
            }

            if (gitProc.stderr) consumeStream(gitProc.stderr);
            if (gitProc.stdout) consumeStream(gitProc.stdout);

            gitProc.exited.then(code => {
                if (code === 0) {
                    console.log(`[clone-stream] ✅ Cloned ${repoName}`);
                    sendSSE('done', { ok: true, path: targetPath, cached: false });
                } else {
                    console.error(`[clone-stream] ✗ git clone exited with code ${code}`);
                    sendSSE('error', { error: `git clone failed (exit code ${code})` });
                }
                try { controller.close(); } catch { }
            }).catch(err => {
                console.error('[clone-stream] spawn error:', err);
                sendSSE('error', { error: err.message || 'Failed to start git' });
                try { controller.close(); } catch { }
            });
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
