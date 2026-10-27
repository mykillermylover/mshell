#!/usr/bin/env bash
# Launcher for the built shell (npm run build).
#
#   mshell-dev                      — run the build/mshell-dev bundle
#   mshell-dev window closeall      — AGS 3 IPC request to the running instance
#   mshell-dev window toggle player
#   mshell-dev window close settings --monitor DP-3
#
# A symlink is placed in ~/.bin (npm run update-binary): the bundle path is resolved
# from the script itself, a copy in another directory would not find it.

set -euo pipefail

root="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"

if [ "$#" -eq 0 ]; then
  # First the binary from `nix build`: its wrapper (wrapGAppsHook) puts the
  # path to Astal from the store into GI_TYPELIB_PATH. The bundle from `npm run build` is a bare
  # gjs script and starts only where Astal is installed system-wide.
  for bin in "$root/result/bin/mshell-dev" "$root/build/mshell-dev"; do
    if [ -x "$bin" ]; then
      exec "$bin"
    fi
  done
  echo 'run.sh: no build — use nix build .# or npm run build' >&2
  exit 1
fi

# Arguments are passed separately: requestHandler in app.tsx parses the
# argv array, not a string (in AGS 2 it was the other way around).
#
# `--` ends the flags of `ags request` itself (cobra would reject --monitor
# as its own unknown flag), so the shell always receives the arguments as-is.
exec ags request -- "$@"
