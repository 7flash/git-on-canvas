#!/bin/bash
# ─── GitMaps Production Deploy Script ─────────────────────
#
# Run this on your VPS to deploy GitMaps:
#   curl -sSL https://raw.githubusercontent.com/7flash/git-on-canvas/master/deploy.sh | bash
#
# Or manually:
#   git clone https://github.com/7flash/git-on-canvas.git /opt/gitmaps
#   cd /opt/gitmaps && bash deploy.sh
#
# Prerequisites:
#   - Ubuntu/Debian server
#   - DNS: gitmaps.xyz → this server's IP
#   - Ports 80, 443 open

set -euo pipefail

INSTALL_DIR="/opt/gitmaps"
REPO_URL="https://github.com/7flash/git-on-canvas.git"

echo "╔══════════════════════════════════════╗"
echo "║    GitMaps Production Deploy         ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ─── 1. Install dependencies ───────────────────────────
echo "→ Installing system dependencies..."

# Bun
if ! command -v bun &>/dev/null; then
    echo "  Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
fi

# Git
if ! command -v git &>/dev/null; then
    echo "  Installing Git..."
    apt-get update -qq && apt-get install -y -qq git
fi

# Caddy (reverse proxy + auto-HTTPS)
if ! command -v caddy &>/dev/null; then
    echo "  Installing Caddy..."
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq && apt-get install -y -qq caddy
fi

echo "  ✓ bun $(bun --version), git $(git --version | cut -d' ' -f3), caddy $(caddy version | head -1)"

# ─── 2. Clone/update repo ──────────────────────────────
echo ""
echo "→ Setting up repository..."

if [ -d "$INSTALL_DIR/.git" ]; then
    echo "  Updating existing installation..."
    cd "$INSTALL_DIR"
    git pull --ff-only
else
    echo "  Cloning fresh..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# ─── 3. Install dependencies ───────────────────────────
echo ""
echo "→ Installing Node dependencies..."
bun install

# ─── 4. Create repos directory ──────────────────────────
mkdir -p /repos
echo "  ✓ /repos directory ready (for cloned GitHub repos)"

# ─── 4b. Clone landing page ─────────────────────────────
echo ""
echo "→ Setting up landing page..."
LANDING_DIR="/srv/landing"
LANDING_REPO="https://github.com/7flash/gonc-landing.git"

if [ -d "$LANDING_DIR/.git" ]; then
    echo "  Updating existing landing page..."
    cd "$LANDING_DIR" && git pull --ff-only
else
    echo "  Cloning landing page..."
    mkdir -p /srv
    git clone "$LANDING_REPO" "$LANDING_DIR"
fi
cd "$INSTALL_DIR"
echo "  ✓ Landing page at $LANDING_DIR"

# ─── 5. Configure Caddy ────────────────────────────────
echo ""
echo "→ Configuring Caddy reverse proxy..."

cp "$INSTALL_DIR/Caddyfile" /etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy
echo "  ✓ Caddy configured (auto-HTTPS for gitmaps.xyz)"

# ─── 6. Create systemd service ─────────────────────────
echo ""
echo "→ Creating systemd service..."

cat > /etc/systemd/system/gitmaps.service << 'EOF'
[Unit]
Description=GitMaps — Spatial Code Explorer
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/gitmaps
ExecStart=/root/.bun/bin/bun run server.ts
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3335

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gitmaps
systemctl restart gitmaps

echo "  ✓ gitmaps.service started"

# ─── 7. Verify ─────────────────────────────────────────
echo ""
echo "→ Verifying deployment..."
sleep 3

if curl -sf http://localhost:3335/ > /dev/null 2>&1; then
    echo "  ✓ GitMaps responding on port 3335"
else
    echo "  ⚠ GitMaps not responding yet (check: journalctl -u gitmaps -f)"
fi

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  ✅ GitMaps deployed!               ║"
echo "║                                     ║"
echo "║  Local:  http://localhost:3335       ║"
echo "║  Public: https://gitmaps.xyz        ║"
echo "║                                     ║"
echo "║  Logs:   journalctl -u gitmaps -f   ║"
echo "║  Caddy:  journalctl -u caddy -f     ║"
echo "╚══════════════════════════════════════╝"
