# GitMaps Leader/Follower Workflow

## Overview

GitMaps uses a **leader/follower model** for collaborative code exploration:

- **Leaders** run GitMaps locally and have full control (move cards, edit files, arrange layers)
- **Followers** visit the production site (gitmaps.xyz) and view read-only canvases

## Roles

### 👑 Leader (Local)

**Who:** Developers running GitMaps on their machine

**URL:** `http://localhost:3335`

**Capabilities:**

- ✅ Move cards around the canvas
- ✅ Edit files and commit changes
- ✅ Create/delete layers
- ✅ Draw connection lines
- ✅ Push canvas state to remote servers
- ✅ Auto-sync positions to server

**How to become a leader:**

```bash
# Clone any repo
git clone https://github.com/owner/repo.git
cd repo

# Run GitMaps locally
npx gitmaps
# or
bunx gitmaps
```

### 👁️ Follower (Remote)

**Who:** Anyone visiting gitmaps.xyz

**URL:** `https://gitmaps.xyz/owner/repo`

**Capabilities:**

- ✅ View canvas layout created by leader
- ✅ Navigate commits
- ✅ Read file contents
- ✅ See connection lines and layers
- ❌ Cannot move cards (read-only)
- ❌ Cannot edit files

**How followers access:**

1. Leader pushes canvas state to production server
2. Follower visits `https://gitmaps.xyz/owner/repo`
3. Follower sees the leader's canvas arrangement

## Sync Workflow

### Leader Pushes to Server

1. **Manual Push:**
   - Click the sync controls in toolbar (top-right)
   - Select server from dropdown (e.g., gitmaps.xyz)
   - Click "Push" button

2. **Auto-Sync:**
   - Enable "Auto-sync" checkbox in sync controls
   - Every position change is automatically pushed

### Follower Views

1. Visit `https://gitmaps.xyz/owner/repo`
2. Canvas loads with leader's arrangement
3. Can navigate commits, view files, but cannot modify layout

## Clone to Edit

Followers can become leaders by cloning the repo:

1. Click "👁️ Follower" badge in toolbar
2. Click "📥 Clone to Edit" button
3. Copy the clone commands:
   ```bash
   git clone https://github.com/owner/repo.git
   cd repo
   bunx gitmaps
   ```
4. Run locally → Now you're a leader!

## URL Format

Shareable URLs include commit hash:

```
https://gitmaps.xyz/owner/repo#abc123def456
```

- `owner/repo` — GitHub repository
- `#abc123def456` — Specific commit hash

## Technical Details

### Role Detection

```typescript
// Detected by hostname
const isLeader =
  host === "localhost" ||
  host === "127.0.0.1" ||
  host.startsWith("192.168.") ||
  host.startsWith("10.") ||
  host.startsWith("172.");
```

### Position Storage

**Leaders:**

- LocalStorage (primary, instant)
- SQLite via API (secondary, synced)

**Followers:**

- Read-only from server API
- No write access

### API Endpoints

```
GET  /api/auth/positions?repo=<url>  — Load positions (public)
POST /api/auth/positions             — Save positions (leader-only)
```

POST requests from followers (remote IPs) return `403 Forbidden`.

## Security

- ✅ Followers cannot modify canvas state
- ✅ API enforces read-only for remote requests
- ✅ Leader detection by IP address
- ✅ Positions synced only from localhost/local network

## Use Cases

### 1. Code Review

- Leader arranges changed files spatially
- Pushes to server
- Team members view as followers
- See relationships between files at a glance

### 2. Onboarding

- Senior dev creates canvas with key files arranged
- Junior devs visit URL to explore codebase
- Spatial layout helps understand architecture

### 3. Documentation

- Create canvas showing system architecture
- Share URL in docs
- Readers see interactive diagram

### 4. Pair Programming

- Driver runs locally (leader)
- Navigator visits URL (follower)
- Both see same spatial arrangement

## Troubleshooting

### Follower can't see canvas

- Leader must push to server first
- Check sync controls → select server → click Push
- Verify URL is correct: `https://gitmaps.xyz/owner/repo`

### Leader can't push

- Check internet connection
- Verify server is accessible
- Try manual push instead of auto-sync

### Positions not syncing

- Clear browser cache
- Check localStorage: `gitcanvas:slug:owner/repo`
- Re-push from leader

## Future Enhancements

- [ ] Real-time collaboration (WebSocket cursors)
- [ ] Multi-leader support (conflict resolution)
- [ ] Canvas snapshots (save/restore layouts)
- [ ] Export canvas as image/PDF

---

**Built with ❤️ by @7flash**

Open source under ISC license.
