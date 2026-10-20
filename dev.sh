#!/usr/bin/env bash
# Dev-цикл AGS 3: запускает app.tsx и перезапускает при правке исходников.
# Запуск из дев-шелла: npm run dev.
#
# Инстанс: AGS по умолчанию называет приложение "ags" (app.start() в app.tsx
# instanceName не задаёт). Чужой инстанс mshell не трогаем: quit адресован
# только нашему имени.

set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

INSTANCE=ags

# Только исходники: рекурсия по корню зацепила бы node_modules, @girs,
# build, result и .git — шелл перезапускался бы от любого служебного файла.
WATCH=(app.tsx style.css lib)

WATCHER=

quit() {
  # При сигнале только скрипту inotifywait остаётся сиротой — гасим его.
  if [ -n "$WATCHER" ]; then
    kill "$WATCHER" 2>/dev/null || true
    WATCHER=
  fi
  ags quit -i "$INSTANCE" >/dev/null 2>&1 || true
  # Пока старый процесс держит DBus-имя, новый с тем же именем просто
  # активирует его и не загрузит изменённый код. Ждём освобождения имени.
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

  # Один пакет событий — один перезапуск. --include отсекает временные
  # файлы редакторов; -r обязателен для lib/.
  #
  # inotifywait в фоне, а не командой на переднем плане: пока bash ждёт
  # внешнюю команду, он откладывает обработчик сигнала до её завершения.
  # С `wait` kill/TERM срабатывают сразу, не дожидаясь следующей правки.
  inotifywait -r \
    -e modify -e move -e create -e delete -e attrib \
    --include '\.(ts|tsx|css)$' \
    "${WATCH[@]}" &
  WATCHER=$!
  if ! wait "$WATCHER"; then
    echo 'dev.sh: inotifywait завершился, перезапуск невозможен' >&2
    exit 1
  fi
  WATCHER=

  quit
done
