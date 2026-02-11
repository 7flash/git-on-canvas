# Melina.js — Change Suggestions for Package Developer

## Issue: Client Mount Scripts Not Auto-Loaded

### Problem

In `src/web.ts` (`createAppRouter`), the framework correctly discovers and builds `page.client.tsx` files (line ~1329-1344), storing the bundle path in `pageMeta.client`. However, the injected HTML only includes:

```html
<script id="__MELINA_META__" type="application/json">{"client":"/page.client-xxxx.js"}</script>
<script src="/melina-runtime-xxxx.js" type="module"></script>
```

The runtime (`src/runtime.ts`) initializes the Island Orchestrator and link interception, but **never reads `__MELINA_META__` to load the page client script**. The `pageMeta.client` path is stored but never used.

### Suggested Fix

In `src/web.ts`, around line 1382-1388, add client script loading:

```diff
       // Inject scripts before </body>
+      let clientScriptTag = '';
+      if (clientBundlePath) {
+        clientScriptTag = `
+        <script type="module">
+          import mount from '${clientBundlePath}';
+          if (typeof mount === 'function') {
+            const cleanup = mount();
+            if (cleanup) window.__melinaPageCleanup = cleanup;
+          }
+        </script>`;
+      }
+
       const scripts = `
         <script id="__MELINA_META__" type="application/json">${JSON.stringify(pageMeta)}</script>
         <script src="${runtimePath}" type="module"></script>
+        ${clientScriptTag}
       `;
```

Similarly for `layoutClientPaths` — each layout client script should also be loaded.

### Current Workaround

Apps can work around this by adding an inline `<script type="module">` in their `layout.tsx` that reads `__MELINA_META__` and dynamically imports the client bundle.
