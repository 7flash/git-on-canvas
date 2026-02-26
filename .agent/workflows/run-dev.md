---
description: How to run the galaxy-canvas dev server. ALWAYS use bgrun instead of bun run dev.
---

# Running Galaxy Canvas Dev Server

**IMPORTANT: NEVER use `bun run dev` directly. ALWAYS use bgrun for better logging and process management.**

## Steps

// turbo-all

1. Start the server with bgrun:
```
bgrun --name galaxy-canvas --command "bun run dev" --directory "c:\Code\galaxy-canvas" --force
```

2. Check the server is running:
```
bgrun galaxy-canvas
```

3. View logs:
```
bgrun galaxy-canvas --logs --lines 50
```

4. The server runs on `http://localhost:3333` (configured in `.config.toml`).

## Why bgrun?

- Better structured logging with timing metrics
- Process management (restart, stop, view logs)
- Watch mode for auto-restart on file changes
- Dashboard integration for monitoring
