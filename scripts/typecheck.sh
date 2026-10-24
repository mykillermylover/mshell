#!/usr/bin/env bash
# tsc по проекту. ags и gnim поставляются исходниками .ts, поэтому проверяются
# вместе с нашим кодом; их диагностика лежит в nix-store и не наша. Пропускаем
# ошибки с путём за пределами репозитория, остальные - валим.
set -u

out=$(./node_modules/.bin/tsc -p tsconfig.json --noEmit --pretty false 2>&1 || true)
errors=$(printf '%s\n' "$out" | grep -E '^[^ (]+\([0-9]+,[0-9]+\): error TS[0-9]+' || true)

if [ -z "$errors" ]; then
  if [ -z "$out" ]; then
    echo "typecheck: ok"
    exit 0
  fi
  # Ошибка без файла (tsconfig, отсутствие входов) - не библиотечная.
  printf '%s\n' "$out"
  exit 1
fi

mine=$(printf '%s\n' "$errors" | grep -v '^\.\./' || true)

if [ -n "$mine" ]; then
  printf '%s\n' "$mine"
  exit 1
fi

echo "typecheck: ok (ошибки ags/gnim пропущены)"
