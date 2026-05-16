# ─── scraper/Dockerfile ───────────────────────────────────────────────────────
# Puppeteer requires Chromium and several system libraries.
# Alpine is used to keep the image small (~380 MB with Chromium).
#
# IMPORTANT: We install Chromium from Alpine's package repo rather than
# letting Puppeteer download its own bundled Chromium. This is smaller,
# more reproducible, and works in CI/Docker without extra flags.
# PUPPETEER_EXECUTABLE_PATH tells Puppeteer where our system Chromium lives.

FROM node:20-alpine

# ── System dependencies for Chromium ──────────────────────────────────────────
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto \
    font-noto-devanagari \
    dumb-init

# ── Puppeteer: skip bundled Chromium download, use system install ──────────────
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# ── Non-root user (Chromium refuses to run as root without --no-sandbox) ───────
RUN addgroup -S scraper && adduser -S scraper -G scraper

WORKDIR /app

# ── Install Node dependencies ─────────────────────────────────────────────────
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

# ── Copy scraper source ───────────────────────────────────────────────────────
COPY --chown=scraper:scraper . .

USER scraper

# ── Default command: run the monthly cron scheduler ───────────────────────────
# Override with "node seedWages.js" for one-time seeding:
#   docker-compose exec scraper node seedWages.js
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "cron.js"]
