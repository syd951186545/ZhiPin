# ============================================================
# Stage 1: Build React app with Vite
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# VITE_* env vars are inlined at build time by Vite (import.meta.env)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Install dependencies first (layer cache — only re-runs when lockfile changes)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy source files and build
COPY frontend/index.html frontend/tsconfig.json frontend/vite.config.ts ./
COPY frontend/src/ src/
RUN npm run build

# ============================================================
# Stage 2: Serve with nginx
# ============================================================
FROM nginx:1.27-alpine

# Remove default nginx site
RUN rm /etc/nginx/conf.d/default.conf

# Copy our nginx config and built frontend
COPY deploy/docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
