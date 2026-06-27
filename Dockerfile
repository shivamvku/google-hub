# ═══════════════════════════════════════════════════════════════
# Google Hub — Multi-stage Production Dockerfile
#
# Stage 1 (builder): Node 20 Alpine
#   - Installs npm deps and runs `vite build`
#   - Output: /app/frontend/dist  (static HTML/JS/CSS)
#
# Stage 2 (runtime): Python 3.12 Slim
#   - Installs Python deps (no build tools, no cache)
#   - Copies compiled frontend from Stage 1
#   - FastAPI serves the API on /api/* and static files on /*
#   - Exposes port 8001
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy dependency manifests first (layer cache — only reinstalls on lockfile change)
COPY frontend/package.json frontend/package-lock.json ./

# Clean install — exact versions from lockfile, no scripts
RUN npm ci --legacy-peer-deps

# Copy source and build
# VITE_API_BASE="" means the frontend uses relative paths (/auth/login etc.)
# which resolve to the same origin — correct for production single-container deploy.
# Local dev uses frontend/.env which sets VITE_API_BASE=http://localhost:8001
COPY frontend/ ./
RUN VITE_API_BASE="" npm run build


# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

WORKDIR /app

# Install Python deps — no cache dir saves image size
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy compiled frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create data directory for SQLite (will be overridden by Render Disk mount)
RUN mkdir -p /data && chown appuser:appgroup /data

# Switch to non-root
USER appuser

# Runtime environment defaults (overridden by Render env vars)
ENV DB_FILE=/data/google_hub.db \
    COOKIE_SECURE=true \
    COOKIE_SAMESITE=none \
    PORT=8001

EXPOSE 8001

# Serve with uvicorn
# --proxy-headers: trust X-Forwarded-* from Render's load balancer
# --forwarded-allow-ips="*": required behind Render's proxy
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
