# ─── server/Dockerfile ────────────────────────────────────────────────────────
# Multi-stage: deps install → production image
# Final image ~140 MB (node:20-alpine base)

# ── Stage 1: dependency install ──────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy only package files first — maximises layer cache
# (deps layer only rebuilds when package.json changes)
COPY package.json package-lock.json* ./

RUN npm ci --omit=dev --ignore-scripts

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Install dumb-init for proper PID 1 signal handling
# Prevents zombie processes and ensures SIGTERM reaches Node
RUN apk add --no-cache dumb-init

# Non-root user for security
RUN addgroup -S shiftsense && adduser -S shiftsense -G shiftsense

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY --chown=shiftsense:shiftsense . .

# Switch to non-root user
USER shiftsense

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

# dumb-init wraps Node so signals (SIGTERM from docker stop) are handled cleanly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/app.js"]
