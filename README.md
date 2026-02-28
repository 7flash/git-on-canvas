<p align="center">
  <img src="https://img.shields.io/badge/runtime-Bun-f472b6?style=flat-square" alt="Bun">
  <img src="https://img.shields.io/badge/framework-Melina-7c3aed?style=flat-square" alt="Melina">
  <img src="https://img.shields.io/badge/license-ISC-4ade80?style=flat-square" alt="License">
</p>

# 🪐 Git on Canvas

**See every file at once.** Pan, zoom, drag — arrange your codebase the way *you* think about it, not the way the file system forces you to.

---

## The Problem

Traditional code review: Open file → read → close → open next file → forget what you just saw → repeat.

**Git on Canvas:**
All changed files laid out on an infinite canvas. Drag them next to each other. Draw connections between related lines. Switch commits with arrow keys. Your spatial layout persists across sessions.

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🖼️ **Infinite Canvas** | Pan, zoom, drag files anywhere. Your layout is saved per-commit. |
| 📊 **Inline Diffs** | Green additions, red deletions — right inside each card. Scrollbar markers show *where* changes are. |
| ⏳ **Commit Timeline** | `←` `→` arrow keys through history. Each commit shows exactly which files changed. |
| 📌 **Persistent Layout** | Drag files where they belong in *your* mental model. Switch commits — arrangement stays. |
| ⌨️ **Keyboard First** | Navigate commits, search files (`Ctrl+F`), expand cards (`F`), arrange (`H`/`V`/`G`), select all (`Ctrl+A`). |
| 🔗 **Connections** | `Alt+click` a line → pick target file → click target line. Visual bezier curves link related code across files. |
| 📁 **Layers** | Group files into focused subsets. Right-click → add to layer. Switch layers instantly — each remembers its own viewport. |
| 🤖 **AI Chat** | Press `I` to open an AI sidebar that understands your current canvas context. |

## 🚀 Quick Start

```sh
# Clone and install
git clone <repo-url>
cd galaxy-canvas
bun install

# Start the dev server
bun run dev
# → http://localhost:3333
```

Open a repository by entering its path in the sidebar dropdown, or navigate directly:

```
http://localhost:3333/#c%3A%2Fpath%2Fto%2Fyour%2Frepo
```

## 🖥️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` `→` | Previous / next commit |
| `Ctrl+F` or `/` | Search files on canvas |
| `F` | Toggle expand/collapse selected cards |
| `W` | Fit selected cards to screen |
| `H` | Arrange selected in a row |
| `V` | Arrange selected in a column |
| `G` | Arrange selected in a grid |
| `Ctrl+A` | Select all cards |
| `Del` / `Backspace` | Hide selected files |
| `Space+Drag` | Pan canvas |
| `Scroll` | Zoom in/out |
| `Ctrl+`/`Ctrl-` | Increase/decrease card font size |
| `I` | Toggle AI chat sidebar |
| `Alt+Click` | Start connection from clicked line |
| `Esc` | Cancel / deselect all |

## 🔗 Connections

Draw visual links between related code across files:

1. **Alt+click** a line number in any file card (source)
2. A **file picker** appears — search and select the target file
3. **Click a line** in the target file to complete the connection

Connection markers appear as colored dots on the left side of each card. Click a marker to jump to the other end. Navigation buttons (`◀ 🔗N ▶`) in the file header let you cycle through all connections for that file.

## 📁 Layers

Layers let you isolate subsets of files for focused review:

- **Create**: Click `+ New Layer` in the bottom bar
- **Add files**: Right-click a card → "Add to Layer"  
- **Switch**: Click any layer tab — canvas shows only that layer's files
- **Default**: "All Files" layer shows everything

Each layer remembers its own viewport position, so switching layers is instant context-switching.

## ⚙️ Stack

| Component | Technology |
|-----------|------------|
| Runtime | [Bun](https://bun.sh) |
| Framework | [Melina](https://github.com/7flash/melina.js) (file-based routing, SSR + client mount) |
| State | [XState](https://statemachine.js.org/) v5 |
| Database | [sqlite-zod-orm](https://github.com/7flash/measure-fn) (positions, connections, layers) |
| Git | [simple-git](https://github.com/steveukx/git-js) |
| Profiling | [measure-fn](https://github.com/7flash/measure-fn) |

## License

ISC
