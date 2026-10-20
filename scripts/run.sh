#!/usr/bin/env bash
# Лончер собранного шелла (npm run build).
#
#   mshell-dev                      — запустить бандл build/mshell-dev
#   mshell-dev closeall             — IPC-запрос AGS 3 к запущенному инстансу
#   mshell-dev toggle player
#
# В ~/.bin кладётся симлинк (npm run update-binary): путь к бандлу считается
# от самого скрипта, копия в другом каталоге его бы не нашла.

set -euo pipefail

root="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"

if [ "$#" -eq 0 ]; then
  # Сначала бинарник из `nix build`: его обёртка (wrapGAppsHook) кладёт в
  # GI_TYPELIB_PATH путь к Astal из store. Бандл из `npm run build` — голый
  # gjs-скрипт и стартует только там, где Astal установлен системно.
  for bin in "$root/result/bin/mshell-dev" "$root/build/mshell-dev"; do
    if [ -x "$bin" ]; then
      exec "$bin"
    fi
  done
  echo 'run.sh: нет сборки — nix build .# или npm run build' >&2
  exit 1
fi

# Аргументы уходят по отдельности: requestHandler в app.tsx разбирает массив
# argv, а не строку (в AGS 2 было наоборот).
exec ags request "$@"
