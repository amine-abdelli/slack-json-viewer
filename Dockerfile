# syntax=docker/dockerfile:1
#
# Everything the app needs is built here: the Next.js server, the QR auth
# helper, Chromium and a virtual display. Nothing is installed at runtime.
#
# Slack itself is reached through its Web API, so this image is only required
# for the QR login; the token login runs on any plain Next.js host.
#
#   docker build -t slack-viewer .
#   docker run -p 3000:3000 -v slack-viewer-data:/data --shm-size=512m \
#     -e SLACK_VIEWER_SECRET=$(openssl rand -hex 32) slack-viewer

###############################################################################
# The QR auth helper                                                          #
###############################################################################
FROM golang:1.26-alpine AS native

RUN apk add --no-cache git
ENV CGO_ENABLED=0

# Reading a sign-in QR code and consuming its one-shot link needs a browser,
# which is the one thing the Slack Web API cannot do for us.
WORKDIR /src/qrauth
COPY tools/qrauth/ ./
RUN go mod tidy && go build -trimpath -ldflags="-s -w" -o /out/qrauth .

###############################################################################
# Next.js build                                                               #
###############################################################################
FROM node:22-alpine AS web

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

###############################################################################
# Runtime                                                                     #
###############################################################################
FROM node:22-alpine AS runtime

# xvfb: slackauth always launches a headful browser, so the container needs a
# display. tini: reaps the Chromium processes the auth helper leaves behind.
RUN apk add --no-cache chromium nss freetype harfbuzz ttf-freefont xvfb tini \
 && mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

# COPY keeps the source file's mode, and `chmod +x` on a 0600/0700 file yields
# 0711 — executable but not readable, which a *script* cannot be, since the
# shell has to read it ("can't open: Permission denied"). Set the mode outright.
COPY docker/chromium-wrapper.sh /usr/local/bin/chromium
COPY docker/entrypoint.sh       /usr/local/bin/slack-viewer-entrypoint
RUN chmod 0755 /usr/local/bin/chromium /usr/local/bin/slack-viewer-entrypoint

COPY --from=native /out/qrauth /usr/local/bin/qrauth

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DISPLAY=:99 \
    CHROME_BIN=/usr/local/bin/chromium \
    SLACK_VIEWER_DATA_DIR=/data

WORKDIR /app
COPY --from=web /app/.next/standalone ./
COPY --from=web /app/.next/static ./.next/static
COPY --from=web /app/public ./public

# Chromium needs a writable HOME for its crashpad and XDG directories; without
# one it dies on "Failed to get the path for 1001" before ever opening a window.
RUN addgroup -S app && adduser -S app -G app -h /home/app \
 && mkdir -p /data /home/app \
 && chown -R app:app /data /app /home/app
USER app
ENV HOME=/home/app

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/slack-viewer-entrypoint"]
CMD ["node", "server.js"]
