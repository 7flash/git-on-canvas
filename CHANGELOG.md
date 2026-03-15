# 📝 Changelog

All notable changes to GitMaps will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-03-15

### 🎉 Added

#### Core Features
- Infinite canvas with pan/zoom functionality
- File cards with code preview and syntax highlighting
- Minimap with click-to-navigate
- Layers system for organizing files by concern
- Commit timeline in sidebar
- Inline diffs with green/red markers
- Git time-travel with persistent layout
- Branch comparison view

#### Performance
- WebGL renderer using Pixi.js for 1000+ cards at 60fps
- DOM renderer for <500 files
- Viewport culling (only render visible cards)
- Progressive loading for large repos
- Large repo timeout increased to 30s (from 5s)

#### Collaboration
- Leader/Follower mode (local edit, remote view)
- Sync controls (push/pull/auto-sync)
- Canvas state persistence to server

#### UX Features
- Progress bar during repo loading
- Image/video rendering in cards
- Canvas export (PNG/JPEG/WebP)
- Interactive onboarding tutorial (10 steps)
- Beautiful landing page
- Shareable URLs (`/owner/repo#commit`)
- Multi-repo tabs
- Auto-fit all cards on screen
- 20+ keyboard shortcuts

#### Developer Experience
- Comprehensive GitHub README
- Getting started guide
- Deployment checklist
- Launch kit with marketing templates
- 9 documentation files

### 🔧 Changed
- Improved card rendering performance
- Enhanced mobile responsiveness
- Better error handling and loading states

### 🐛 Fixed
- Popup bug (multiple hover popups)
- Dropdown display issue
- URL routing for GitHub repos
- Card positioning on load

### 📊 Stats
- 41 commits
- 18+ features
- 10,000+ lines of code
- 21+ tests passing

---

## [0.1.0] - 2026-02-24

### 🎉 Added
- Initial project setup
- Basic canvas rendering
- Git integration
- File card system

---

## Links

- [GitHub Repository](https://github.com/7flash/gitmaps)
- [Live Demo](https://gitmaps.xyz)
- [npm Package](https://npmjs.com/package/gitmaps)
- [jsx-ai](https://npmjs.com/package/jsx-ai)

---

**Built with ❤️ by @7flash**
