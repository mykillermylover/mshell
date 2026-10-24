#!/usr/bin/env bash
# Генерирует палитру mshell из обоев.
#
#   scripts/palette.sh <image> [scheme] [contrast]
#
# Результат: ~/.cache/mshell/palette.css. Пишем во временный файл и
# переименовываем: watcher в AGS видит одно событие и не читает
# частично записанный файл.
set -euo pipefail

image="${1:?usage: palette.sh <image> [scheme] [contrast]}"
scheme="${2:-scheme-tonal-spot}"
contrast="${3:-0}"

case "$scheme" in
  scheme-*) ;;
  *) scheme="scheme-$scheme" ;;
esac

root="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
out="${XDG_CACHE_HOME:-$HOME/.cache}/mshell"
cfg="$(mktemp)"
tmp=""

trap 'rm -f "$cfg" "${tmp:-}"' EXIT
mkdir -p "$out"
tmp="$(mktemp "$out/palette.css.XXXXXX")"

printf '[config]\n\n[templates.mshell]\ninput_path = "%s"\noutput_path = "%s"\n' \
  "$root/matugen/templates/mshell.css.tera" "$tmp" >"$cfg"

# Режим не задаём: шаблон пишет обе темы.
matugen image "$image" --prefer saturation --contrast "$contrast" \
  -t "$scheme" -c "$cfg"
mv "$tmp" "$out/palette.css"
