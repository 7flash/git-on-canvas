# GitMaps — Spatial Code Explorer

**Transcend the file tree. See your codebase in five dimensions.**

[![Live Demo](https://img.shields.io/badge/demo-live-7c3aed.svg)](https://gitmaps.xyz)
[![npm](https://img.shields.io/npm/v/gitmaps.svg)](https://npmjs.com/package/gitmaps)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

---

## 🌌 What is GitMaps?

GitMaps renders your entire codebase on an **infinite canvas** — with layers, git time-travel, inline diffs, and a minimap to never lose context.

Instead of navigating files one-by-one in a tree, see **all files simultaneously** arranged spatially. Move cards around, draw connections between related code, and switch between commits to see what changed — all in a single view.

### The Five Dimensions

1. **1D — Lines**: Individual lines of code (the atomic unit)
2. **2D — Canvas**: Files arranged spatially, breaking folder hierarchy
3. **3D — Layers**: Extract files into focus layers (Auth, API, UI, etc.)
4. **4D — Time**: Navigate commits while layout persists
5. **5D — Connections**: Draw permanent links between specific lines across files

---

## 🚀 Quick Start

### Run Locally (Full Power)

```bash
# Clone any repo
git clone https://github.com/owner/repo.git
cd repo

# Run GitMaps
npx gitmaps
# or with Bun
bunx gitmaps
```

Opens current directory. Or pass a path:
```bash
npx gitmaps /path/to/repo
```

### Install Globally

```bash
bun install -g gitmaps
gitmaps
```

### Try Online (Read-Only)

Visit **[https://gitmaps.xyz](https://gitmaps.xyz)** to explore popular repos:
- [facebook/react](https://gitmaps.xyz/facebook/react)
- [denoland/deno](https://gitmaps.xyz/denoland/deno)
- [sveltejs/svelte](https://gitmaps.xyz/sveltejs/svelte)
- [oven-sh/bun](https://gitmaps.xyz/oven-sh/bun)

---

## 🎯 Use Cases

### AI Code Review
AI agents generate thousands of lines across dozens of files. GitMaps renders every file simultaneously — so you can see the full picture, spot patterns, and review changes **spatially** instead of one-file-at-a-time.

- 🔍 See all changed files at once — no tab switching
- 🧠 Spatial layout reveals relationships IDEs hide
- ⏱️ Step through commits to trace what the AI changed

### Architecture Exploration
Understand unfamiliar codebases faster by seeing how files relate spatially. Draw connections between related code across layers.

### Onboarding
Senior devs create canvas with key files arranged. Junior devs visit URL to explore codebase spatially.

### Pair Programming
Driver runs locally (leader), navigator visits URL (follower). Both see same spatial arrangement.

---

## 🎮 Features

### Infinite Canvas
- Pan, zoom, drag cards freely
- Minimap for bird's eye view
- Viewport culling for performance

### Git Integration
- Commit timeline in sidebar
- Inline diffs (green/red markers)
- Navigate commits while layout persists
- Branch comparison

### Layers
- Extract files into focus layers independently from folders
- Switch between layers without losing position
- Each layer is a different plane in 3D space

### Connections
- Alt+click to draw permanent links between specific lines
- Connections work across files and layers
- Visualize dependencies and relationships

### Editor
- Double-click any card to open full editor
- Syntax highlighting (CodeMirror)
- Edit, save, commit directly from canvas
- Symbol outline panel

### Search
- Ctrl+F for global search across all files
- Ctrl+O for file finder
- Jump to symbol

### Keyboard Shortcuts
```
Scroll          Zoom
Space+Drag      Pan canvas
Click           Select card
Shift+Click     Multi-select
Drag canvas     Rect select
Drag card       Move card
Del             Hide file
H               Arrange in row
V               Arrange in column
G               Arrange in grid
W               Fit to screen
Ctrl+F          Search across files
Ctrl+O          Find file
Ctrl+/-         Text zoom
Dbl-click       Open editor
Alt+Click       Connect lines
Arrow keys      Prev/next commit
Ctrl+N          New file
Ctrl+S          Save (in editor)
Ctrl+G          Toggle dependency graph
?               Show keyboard shortcuts
```

---

## 👥 Leader/Follower Model

GitMaps uses a **leader/follower** workflow for collaboration:

### 👑 Leader (Local)
- Runs on `localhost:3335`
- Full control: move cards, edit files, arrange layers
- Can push canvas state to remote servers
- Auto-sync positions to server

### 👁️ Follower (Remote)
- Visits `https://gitmaps.xyz/owner/repo`
- Read-only canvas
- Can navigate commits, view files
- Cannot modify layout

### Clone to Edit
Followers can become leaders:
1. Click "📥 Clone to Edit" button
2. Copy clone commands
3. Run locally → Now you're a leader!

**See [`docs/LEADER-FOLLOWER.md`](docs/LEADER-FOLLOWER.md) for complete workflow.**

---

## 🏗️ Architecture

### Rendering Modes
- **Canvas Text**: Hardware-accelerated text rendering (fastest, 1000+ files at 60fps)
- **DOM Cards**: Interactive cards with full styling
- **CodeMirror**: Full editor for editing mode

### Performance
- Viewport culling (only render visible cards)
- Progressive loading for large repos (500+ files)
- LOD (Level of Detail) transitions at low zoom
- Minimap always visible

### Storage
- LocalStorage for positions (instant, offline)
- SQLite via API (synced across devices for leaders)
- Read-only for followers

---

## 📦 Tech Stack

- **Runtime**: Bun / Node.js 18+
- **Framework**: Melina (full-stack TypeScript)
- **State**: XState for canvas state machine
- **Editor**: CodeMirror 6
- **Icons**: Custom SVG
- **Styling**: Custom CSS with CSS variables

---

## 🤝 Contributing

### Development

```bash
# Clone GitMaps itself
git clone https://github.com/7flash/gitmaps.git
cd gitmaps

# Install dependencies
bun install

# Run dev server
bun run dev
```

### Build

```bash
# Build for production
bun run build

# Test
bun test
```

### Publish

```bash
# Publish to npm
npm publish
```

---

## 📚 Documentation

- [Leader/Follower Workflow](docs/LEADER-FOLLOWER.md)
- [Tasks & Roadmap](docs/TASKS.md)
- [WebGL Research](docs/WEBGL-RESEARCH.md)

---

## 🌟 Acknowledgments

Inspired by **Ted Nelson's vision of intertwingularity** — the idea that everything is connected and hierarchical structures hide more relationships than they reveal.

GitMaps transcends the file tree with a spatial model that matches how you actually think about complex domains like code.

---

## 📄 License

ISC © [7flash](https://github.com/7flash)

---

## 🔗 Links

- **Live Demo**: https://gitmaps.xyz
- **GitHub**: https://github.com/7flash/gitmaps
- **npm**: https://npmjs.com/package/gitmaps
- **Twitter**: [@7flash](https://twitter.com/7flash)

---

**Built with ❤️ for the AI-era of development.**
