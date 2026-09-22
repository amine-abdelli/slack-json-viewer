#!/bin/sh
# Installed at /usr/local/bin/chromium, ahead of the real binary on PATH.
#
# slackauth locates a browser by name and cannot pass flags of its own, so the
# ones a container needs are added here.
for bin in /usr/bin/chromium /usr/bin/chromium-browser; do
  [ -x "$bin" ] && exec "$bin" \
    --no-sandbox \
    --disable-dev-shm-usage \
    --disable-gpu \
    --disable-software-rasterizer \
    "$@"
done
echo "chromium not found" >&2
exit 127
