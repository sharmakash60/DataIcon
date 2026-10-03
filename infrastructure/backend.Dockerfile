# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: dependency resolver (uv)
# ─────────────────────────────────────────────────────────────────────────────
FROM ghcr.io/astral-sh/uv:0.11.19 AS uv

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: production app image  (target: production)
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS production
COPY --from=uv /uv /usr/local/bin/uv
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy
# Number of Gunicorn workers — override at runtime via GUNICORN_WORKERS env var.
ENV GUNICORN_WORKERS=4
WORKDIR /workspace/backend
COPY backend/pyproject.toml backend/uv.lock ./
# Install production deps + gunicorn (not in pyproject.toml to keep dev-deps clean).
# The version spec is quoted to prevent the shell from interpreting '<24' as a redirect.
RUN uv sync --frozen --no-install-project \
 && uv pip install --system 'gunicorn>=23,<24'
COPY backend/ ./
COPY tests/backend/ /workspace/tests/backend/
RUN uv sync --frozen \
 && useradd --uid 10001 --create-home datapilot \
 && chown -R datapilot:datapilot /workspace
ENV PATH="/workspace/backend/.venv/bin:$PATH"
USER datapilot
EXPOSE 8000
# Development default: uvicorn with live-reload (used by compose.yaml via volume mount).
# For production, build with --target production and override CMD:
#   gunicorn app.main:app --worker-class uvicorn.workers.UvicornWorker \
#     --workers ${GUNICORN_WORKERS} --bind 0.0.0.0:8000 --timeout 120
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: Nginx reverse-proxy  (target: nginx — full production unit)
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS nginx
# Remove default config
RUN rm /etc/nginx/conf.d/default.conf
# Inline a minimal, hardened reverse-proxy config.
# The upstream "app" must resolve; override via --build-arg if needed.
ARG APP_HOST=backend
COPY --from=production /workspace /workspace
RUN printf 'upstream app { server %s:8000; }\n\
server {\n\
    listen 80;\n\
    server_name _;\n\
    client_max_body_size 10m;\n\
    # Security headers\n\
    add_header X-Frame-Options DENY always;\n\
    add_header X-Content-Type-Options nosniff always;\n\
    add_header Referrer-Policy strict-origin-when-cross-origin always;\n\
    add_header X-XSS-Protection "1; mode=block" always;\n\
    location / {\n\
        proxy_pass http://app;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\
        proxy_read_timeout 120s;\n\
    }\n\
    location /api/v1/health {\n\
        proxy_pass http://app/api/v1/health;\n\
        access_log off;\n\
    }\n\
}\n' "${APP_HOST}" > /etc/nginx/conf.d/datapilot.conf
EXPOSE 80
