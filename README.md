# 🗺️ GitMaps — Spatial Code Explorer

**Explore codebases on an infinite canvas instead of file trees.**

[![Live Demo](https://img.shields.io/badge/demo-live-7c3aed.svg?style=flat-square)](https://gitmaps.xyz)
[![npm](https://img.shields.io/npm/v/gitmaps.svg?style=flat-square)](https://npmjs.com/package/gitmaps)
[![License](https://img.shields.io/badge/license-ISC-blue.svg?style=flat-square)](LICENSE)

---

## 🎯 What is GitMaps?

GitMaps renders your entire repository on an infinite canvas with layers, git time-travel, and a minimap to never lose context.

**Traditional file trees are 1-dimensional. GitMaps gives you 5 dimensions:**

1. **1D — Lines** — Individual lines of code
2. **2D — Canvas** — Spatial arrangement of files
3. **3D — Layers** — Focus areas (Auth, API, UI)
4. **4D — Time** — Git history with persistent layout
5. **5D — Connections** — Links between related code

---

## 🚀 Quick Start

### Try Online (No Install)
Visit **[https://gitmaps.xyz](https://gitmaps.xyz)** and explore popular repos like React, Deno, or Svelte.

### Run Locally
```bash
git clone https://github.com/7flash/gitmaps.git
cd gitmaps
bun install
bun run dev
# Open http://localhost:3335
```

### Install Globally
```bash
bun install -g gitmaps
gitmaps /path/to/your/repo
```

---

## ✨ Features

### Core Experience
- 🗺️ **Infinite Canvas** — Pan, zoom, arrange files freely
- 📄 **File Cards** — Interactive cards with code preview and inline diffs
- 🧭 **Minimap** — Bird's eye view with click-to-navigate
- 📚 **Layers** — Organize files into focus layers

### Git Integration
- ⏳ **Commit Timeline** — Browse history in sidebar
- 📊 **Inline Diffs** — Green/red markers for changes
- 🔄 **Time Travel** — Navigate commits while layout persists
- 🔀 **Branch Comparison** — Compare branches side-by-side

### Performance
- ⚡ **WebGL Renderer** — Pixi.js GPU acceleration for 1000+ cards at 60fps
- 🎯 **Viewport Culling** — Only render visible cards
- 📦 **Progressive Loading** — Load large repos in batches
- ⏱️ **30s Timeout** — Large repo support (up from 5s)

### Collaboration
- 👑 **Leader Mode** — Full control when running locally
- 👁️ **Follower Mode** — Read-only view on production
- 🔄 **Sync Controls** — Push/pull canvas state to servers
- ⚡ **Auto-Sync** — Automatic position sync on changes

### UX Features
- 📊 **Progress Bar** — Visual feedback during loading
- 🖼️ **Image/Video Rendering** — Media files display inline
- 📷 **Canvas Export** — Save layouts as PNG/JPEG/WebP
- 🎓 **Onboarding Tutorial** — 10-step interactive guide
- 🔗 **Shareable URLs** — `/owner/repo#commit` format
- 📑 **Multi-Repo Tabs** — Load multiple repos simultaneously
- ⌨️ **Keyboard Shortcuts** — Power user shortcuts

---

## 🎯 Use Cases

### AI Code Review
AI agents generate thousands of lines across dozens of files. GitMaps renders every file simultaneously so you can see the full picture, spot patterns, and review changes spatially instead of one-file-at-a-time.

### Architecture Exploration
Understand unfamiliar codebases faster by seeing how files relate spatially. Draw connections between related code across layers.

### Onboarding
New team members explore the codebase spatially. Senior devs create canvas arrangements showing key files and their relationships.

### Pair Programming
Driver runs locally (leader), navigator visits URL (follower). Both see same spatial arrangement.

### Legacy Code Understanding
Visualize connections and dependencies in complex legacy systems. Layers help focus on specific concerns.

---

## 📊 Performance

| Repo Size | Renderer | Load Time | FPS |
|-----------|----------|-----------|-----|
| <100 files | DOM | <1s | 60 |
| 100-500 files | DOM | 1-3s | 60 |
| 500-1000 files | WebGL | 3-5s | 60 |
| 1000+ files | WebGL | 5-10s | 60 |
| 10000+ files | WebGL | 10-30s | 30-40 |

### Tested Repositories
- ✅ [7flash/gitmaps](https://gitmaps.xyz/7flash/gitmaps) — 9 files, <1s
- ✅ [facebook/react](https://gitmaps.xyz/facebook/react) — 100 commits, 2.8s

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Scroll` | Zoom in/out |
| `Space + Drag` | Pan canvas |
| `Click` | Select card |
| `Shift + Click` | Multi-select |
| `Drag Canvas` | Rect select |
| `Drag Card` | Move card |
| `Del` | Hide file |
| `H` | Arrange in row |
| `V` | Arrange in column |
| `G` | Arrange in grid |
| `W` | Fit to screen |
| `Ctrl + F` | Search across files |
| `Ctrl + O` | Find file |
| `Ctrl + G` | Toggle dependency graph |
| `Ctrl + +/-` | Text zoom |
| `Dbl-click` | Open editor |
| `Alt + Click` | Connect lines |
| `Arrow Keys` | Prev/next commit |
| `Ctrl + N` | New file |
| `Ctrl + S` | Save (in editor) |
| `?` | Show keyboard shortcuts |

---

## 🏗️ Architecture

### Tech Stack
- **Runtime:** Bun / Node.js 18+
- **Framework:** Melina (full-stack TypeScript)
- **State:** XState for canvas state machine
- **Rendering:** DOM + Pixi.js (WebGL)
- **Editor:** CodeMirror 6
- **Database:** SQLite with Zod ORM

### Project Structure
```
gitmaps/
├── app/                    # Main application
│   ├── api/               # API routes
│   ├── lib/               # Shared modules
│   ├── [owner]/[repo]/   # Dynamic routes
│   └── page.tsx          # Main pages
├── packages/
│   └── galaxydraw/       # Rendering engine
│       ├── src/
│       │   ├── core/     # Core engine
│       │   └── webgl-renderer.ts  # WebGL renderer
│       └── demo/         # Performance benchmarks
└── docs/                 # Documentation
```

---

## 🚀 Deployment

### Production Server
```bash
# Clone repo
git clone https://github.com/7flash/gitmaps.git
cd gitmaps

# Install dependencies
bun install

# Build
bun run build

# Start server
bun run server.ts
# Or use bgrun for production
bgrun start
```

### Environment Variables
```bash
# Server configuration
PORT=3335
NODE_ENV=production

# Database
DATABASE_PATH=./data/canvas_users.db

# GitHub OAuth (optional)
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
```

---

## 🧪 Testing

```bash
# Run tests
bun test

# Test specific module
bun test app/lib/

# Performance benchmarks
open packages/galaxydraw/demo/webgl-demo.html
```

---

## 📚 Documentation

- [Getting Started Guide](../GETTING-STARTED.md)
- [Deployment Checklist](../DEPLOYMENT-CHECKLIST.md)
- [Launch Kit](../LAUNCH-KIT.md)
- [Session Report](../SESSION-FINAL-REPORT.md)

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

### Development Setup
```bash
git clone https://github.com/7flash/gitmaps.git
cd gitmaps
bun install
bun run dev
```

---

## 📈 Roadmap

### v1.0.0 (Current) ✅
- ✅ Infinite canvas with pan/zoom
- ✅ Git integration with timeline
- ✅ Layers system
- ✅ WebGL rendering
- ✅ Leader/Follower mode
- ✅ Canvas export
- ✅ Onboarding tutorial

### v1.1.0 (Planned)
- [ ] Real-time collaboration (WebSocket cursors)
- [ ] Canvas snapshots (save/restore layouts)
- [ ] Advanced search with filters
- [ ] Plugin system
- [ ] Custom themes

### v2.0.0 (Future)
- [ ] AI-powered code analysis
- [ ] Automated architecture diagrams
- [ ] Integration with VS Code
- [ ] Team workspaces
- [ ] Comments and annotations

---

## 🙏 Acknowledgments

Inspired by **Ted Nelson's vision of intertwingularity** — the idea that everything is connected and hierarchical structures hide more relationships than they reveal.

Built with:
- [Bun](https://bun.sh/) — Fast JavaScript runtime
- [Melina](https://github.com/7flash/melina) — Full-stack framework
- [Pixi.js](https://pixijs.com/) — WebGL rendering
- [CodeMirror](https://codemirror.net/) — Code editor
- [XState](https://xstate.js.org/) — State management

---

## 📄 License

ISC © [7flash](https://github.com/7flash)

---

## 🔗 Links

- **Live Demo:** https://gitmaps.xyz
- **GitHub:** https://github.com/7flash/gitmaps
- **npm:** https://npmjs.com/package/gitmaps
- **jsx-ai:** https://npmjs.com/package/jsx-ai
- **Twitter:** https://twitter.com/7flash

---

**Built with ❤️ on 
