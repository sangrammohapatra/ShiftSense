# ─── client/Dockerfile ────────────────────────────────────────────────────────
# Stage 1: build the React/Vite app
# Stage 2: serve the static output with Nginx
# Final image ~25 MB (nginx:alpine)

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Accept build arg so Vite can embed the API URL at compile time
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build
# Output is in /app/dist

# ── Stage 2: nginx serve ──────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Remove default nginx html
RUN rm -rf /usr/share/nginx/html/*

# Copy Vite build output
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom nginx config:
#   - Serve index.html for all routes (React Router client-side routing)
#   - Proxy /api/v1 to the backend server
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
