# ─── GitMaps Production Dockerfile ───────────────────────
# Multi-stage build with Bun runtime + Git
#
# Build:   docker build -t gitmaps .
# Run:     docker run -p 3335:3335 gitmaps
# Compose: docker compose up -d

FROM oven/bun:1 AS builder

WORKDIR /app

# Install git (needed by simple-git at runtime)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Copy package files first for better layer caching
COPY package.json bunfig.toml ./
COPY packages/galaxydraw/package.json packages/galaxydraw/

# Install dependencies
RUN bun install --frozen-lockfile || bun install

# Copy application code
COPY . .

# ─── Runtime ───────────────────────────────────────────────
FROM oven/bun:1-slim

WORKDIR /app

# Install git (required at runtime for repository operations)
RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Copy from builder
COPY --from=builder /app /app

# Create directory for cloned repositories
RUN mkdir -p /repos

# Environment
ENV NODE_ENV=production
ENV PORT=3335

EXPOSE 3335

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3335/ || exit 1

CMD ["bun", "run", "server.ts"]
