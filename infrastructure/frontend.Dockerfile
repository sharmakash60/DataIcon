# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build the Vite production bundle
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS builder
WORKDIR /workspace/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Produce a minified, tree-shaken static bundle in /workspace/frontend/dist
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Serve with Nginx  (DEP-01 — no dev server in production)
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS production
RUN rm /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/frontend/dist /usr/share/nginx/html
# Hardened Nginx config: gzip, SPA routing, security headers
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    gzip on;\n\
    gzip_types text/plain text/css application/json application/javascript text/xml\n\
                application/xml application/xml+rss text/javascript;\n\
    # SPA fallback — send all unknown paths to index.html\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
    # Cache static assets aggressively\n\
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
    add_header X-Frame-Options DENY always;\n\
    add_header X-Content-Type-Options nosniff always;\n\
    add_header Referrer-Policy strict-origin-when-cross-origin always;\n\
    add_header X-XSS-Protection "1; mode=block" always;\n\
}\n' > /etc/nginx/conf.d/datapilot-frontend.conf
EXPOSE 80
