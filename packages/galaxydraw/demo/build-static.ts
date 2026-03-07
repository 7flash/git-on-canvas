/**
 * Build a standalone static index.html demo for GitHub Pages
 */
const css = await Bun.file(import.meta.dir + '/../src/galaxydraw.css').text();

// Bundle the client code
const buildResult = await Bun.build({
    entrypoints: [import.meta.dir + '/client.ts'],
    target: 'browser',
    format: 'esm',
    minify: true,
});
const js = await buildResult.outputs[0].text();

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>galaxydraw — Interactive Demo</title>
    <meta name="description" content="Interactive demo of galaxydraw, a zero-dependency infinite canvas framework for spatial applications.">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌌</text></svg>">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; background: #060812; color: #e4e4e7; font-family: 'Inter', sans-serif; overflow: hidden; }
        #app { width: 100vw; height: 100vh; }

        .demo-toolbar {
            position: fixed;
            top: 16px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000;
            display: flex;
            gap: 8px;
            padding: 8px 16px;
            border-radius: 12px;
            background: rgba(13, 15, 28, 0.85);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .demo-toolbar button {
            padding: 6px 14px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: transparent;
            color: rgba(255, 255, 255, 0.7);
            cursor: pointer;
            font-size: 12px;
            font-family: 'Inter', sans-serif;
            font-weight: 500;
            transition: all 0.15s ease;
        }

        .demo-toolbar button:hover {
            background: rgba(147, 130, 255, 0.15);
            border-color: rgba(147, 130, 255, 0.3);
            color: #fff;
        }

        .demo-toolbar button.active {
            background: rgba(147, 130, 255, 0.2);
            border-color: rgba(147, 130, 255, 0.4);
            color: #fff;
        }

        .demo-toolbar .mode-label {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.4);
            display: flex;
            align-items: center;
            padding: 0 8px;
        }

        /* Responsive toolbar */
        @media (max-width: 640px) {
            .demo-toolbar {
                flex-wrap: wrap;
                max-width: 90vw;
                justify-content: center;
            }
            .demo-toolbar button {
                font-size: 11px;
                padding: 5px 10px;
            }
        }

        ${css}
    </style>
</head>
<body>
    <div id="app"></div>
    <script type="module">${js}</script>
</body>
</html>`;

await Bun.write(import.meta.dir + '/index.html', html);
console.log(`✓ demo/index.html created (${(html.length / 1024).toFixed(1)}KB)`);
