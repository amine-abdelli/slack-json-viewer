#!/bin/sh
# Starts a virtual X display, then the app.
#
# slackauth always launches a *headful* browser — startBrowser() hardcodes
# headless=false — so Chromium exits with "Missing X server or $DISPLAY" in a
# container. One Xvfb for the container's lifetime avoids races between
# concurrent logins; tini (PID 1) reaps it.
set -e

DISPLAY_NUM="${DISPLAY_NUM:-99}"
export DISPLAY=":${DISPLAY_NUM}"

mkdir -p /tmp/.X11-unix 2>/dev/null || true

Xvfb "$DISPLAY" -screen 0 1280x1024x24 -nolisten tcp >/dev/null 2>&1 &

# Wait for the socket rather than guessing, so the first login cannot race the
# display coming up. Sub-second sleeps are a busybox extension, so fall back to
# whole seconds if this shell has not got them.
if sleep 0.1 2>/dev/null; then
  wait_step="sleep 0.1"
  wait_max=100
else
  wait_step="sleep 1"
  wait_max=10
fi

i=0
while [ ! -e "/tmp/.X11-unix/X${DISPLAY_NUM}" ]; do
  i=$((i + 1))
  if [ "$i" -gt "$wait_max" ]; then
    echo "entrypoint: Xvfb did not start; Slack login will not work" >&2
    break
  fi
  $wait_step
done

exec "$@"
