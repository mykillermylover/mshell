#!/usr/bin/env bash
# AGS 3 dev loop: runs app.tsx and restarts on source edits.
# Run from the dev shell: npm run dev.
#
# Instance: AGS names the app "ags" by default (app.start() in app.tsx
# does not set instanceName). We don't touch other mshell instances: quit targets
# only our name.

set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

INSTANCE="mshell-dev"

# Sources only: recursing over the root would catch node_modules, @girs,
# build, result and .git — the shell would restart on any service file.
WATCH=(app.tsx style.scss styles src)

WATCHER=

quit() {
  # If only the script gets the signal, inotifywait is left orphaned — kill it.
  if [ -n "$WATCHER" ]; then
    kill "$WATCHER" 2>/dev/null || true
    WATCHER=
  fi
  ags quit -i "$INSTANCE" >/dev/null 2>&1 || true
  # While the old process holds the DBus name, a new one with the same name just
  # activates it and will not load the changed code. Wait for the name to be released.
  for _ in {1..40}; do
    ags list 2>/dev/null | grep -qx "$INSTANCE" || return 0
    sleep 0.05
  done
}

trap 'exit 0' INT TERM
trap quit EXIT

quit
while true; do
  ags run app.tsx &

  # One batch of events — one restart. --include filters out editor
  # temporary files; -r is required for lib/.
  #
  # inotifywait in the background, not as a foreground command: while bash waits
  # for an external command, it defers the signal handler until it finishes.
  # With `wait`, kill/TERM take effect at once, without waiting for the next edit.
  inotifywait -r \
    -e modify -e move -e create -e delete -e attrib \
    --include '\.(ts|tsx|scss)$' \
    "${WATCH[@]}" 2>/dev/null &
  WATCHER=$!
  if ! wait "$WATCHER"; then
    echo 'dev.sh: inotifywait exited, cannot restart' >&2
    exit 1
  fi
  WATCHER=

  quit
done
