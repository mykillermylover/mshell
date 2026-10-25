#!/usr/bin/env bash
# tsc over the project. ags and gnim ship as .ts sources, so they are typechecked
# together with our code; their diagnostics live in the nix-store and are not ours. We skip
# errors with a path outside the repository, and fail on the rest.
set -u

out=$(./node_modules/.bin/tsc -p tsconfig.json --noEmit --pretty false 2>&1 || true)
errors=$(printf '%s\n' "$out" | grep -E '^[^ (]+\([0-9]+,[0-9]+\): error TS[0-9]+' || true)

if [ -z "$errors" ]; then
  if [ -z "$out" ]; then
    echo "typecheck: ok"
    exit 0
  fi
  # An error with no file (tsconfig, missing inputs) is not a library one.
  printf '%s\n' "$out"
  exit 1
fi

mine=$(printf '%s\n' "$errors" | grep -v '^\.\./' || true)

if [ -n "$mine" ]; then
  printf '%s\n' "$mine"
  exit 1
fi

echo "typecheck: ok (ags/gnim errors skipped)"
