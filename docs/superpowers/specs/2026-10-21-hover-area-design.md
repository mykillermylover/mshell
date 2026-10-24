# Дизайн: hover-area у попапов (одна геометрия)

> **Историческая запись.** Актуальный код — источник истины; документ не поддерживается.

Дата: 2026-10-22 (обновлено; изначально 2026-10-21)
Статус: принято, реализовано

## 1. Контекст

`Pop` — `Gtk.Revealer`, прижатый к внутренней кромке рамки. `Frame` отдаёт
тела в `LiquidField` (фон/жидкость) и `FrameInput` (input region); `FrameMotion`
считает магнит и тик-цикл по тем же телам.

Нужна hover-зона: наведение раскрывает попап, уход скрывает. Зона должна быть
частью поля (тот же blur clipping), настраиваться толщиной и уметь содержать
контент; попап без зоны работает как раньше.

## 2. Цель

**Одна геометрия.** `depth` — толщина губы — это и видимая зона, и зона ввода
(плюс полоса рамки до края экрана). Никаких величин, выведенных из рендера:
input не должен зависеть от `meltRadius`, σ или мостиков.

Hover-логика живёт внутри `Pop`; lib-слой (жидкость, input, магнит) про hover
не знает.

## 3. Требования

R1. Контракт. Lib видит `WindowBody`: `bounds` (видимое тело),
`inputBounds` (область ввода), `open`/`animating`, `setOpen`/`toggle`,
`subscribe`. `Gtk.Revealer` в контракте нет.

R2. Семантика `depth`. `hover.depth` (default `style.hoverDepth`, минимум 1) —
толщина губы от внутренней кромки рамки. Она же — толщина input. `depth = 0`
не существует: конфиг зажимается в `[1, 64]`, per-pop override клампится в
`max(1, depth)`.

R3. API. `PopSpec.hover`:
- `true` — дефолтные значения;
- `{ depth?, content?, hideOnReveal? }` — точечные override;
- отсутствует — hover-логики нет.

R4. Input. Закрытая зона: `input = body + border` со стороны рамки (до края
экрана). Открытая: `input = body`. Полоса рамки в input открытого попапа не
входит — уход на рамку даёт `leave`.

R5. Только `Pop` отрезает `spacer` от тела. `spacer` — деталь раскладки
(зона не теряет толщину, Revealer стоит на внутренней кромке), в тело поля не
входит: рамку рисует `LiquidField`, и тело не должно перекрывать её.

R6. Мостик не рисует материал за пределами соединяемых тел. Заход в тело
(`intoBody`) клампится `min(w, h)` тела. Иначе капсула прорастает тонкую губу
насквозь, её blur даёт свечение в комнате, и `depth` перестаёт что-либо
значить.

R7. Hover: `EventControllerMotion` на корне (окне), проверка точки по
`inputBounds`. `enter/leave` → `Frame.open/close`.

R8. `hideOnReveal`: зона уезжает через `zoneRevealer` с началом открытия
(`SLIDE`, без fade) и возвращается с началом закрытия.

R9. Full-bleed: CSS `window.frame { box-shadow: none; border: none }`, чтобы
тема не съедала 2 px content'а внутри полного surface.

R10. Тесты: `popLayout` (края, align, hover/no-hover, spacer), `hoverInput`
(4 края), `bridges` (тонкая губа не выпускает мостик), конфиг (default 6,
лимиты `[1, 64]`).

## 4. Модель

### 4.1 Контракт

```ts
export interface WindowBody {
  bounds(relativeTo: Gtk.Widget): Rect | null;
  inputBounds(relativeTo: Gtk.Widget): Rect | null;
  readonly open: boolean;
  readonly animating: boolean;
  setOpen(open: boolean): void;
  toggle(): void;
  subscribe(fn: () => void): () => void;
}
```

`Pop` и `Float` реализуют контракт. `bounds` — `compute_bounds` тела;
`inputBounds` у Float = `bounds`, у Pop — тело + полоса рамки (см. 4.3).

### 4.2 Компонент `Pop`

```
Pop.widget = Gtk.Box (прижат к кромке; align вдоль края)
  top:    [spacer, Revealer, zoneRevealer]
  bottom: [zoneRevealer, Revealer, spacer]
  left:   [spacer, Revealer, zoneRevealer]
  right:  [zoneRevealer, Revealer, spacer]

zoneRevealer → zone (hover-zone) → hover.content() или filler
spacer → filler
```

- При hover frame-side margin = 0, spacer = `border`; без hover margin =
  `border`, spacer'а нет. `spacer` в тело поля не входит.
- `Revealer` — контент; начинается на внутренней кромке.
- `zoneRevealer` — `SLIDE`, направление противоположно попапу.
- `bounds()` = Box без полосы рамки (`bodyRect`); при нулевом теле — `null`.
- `depth()` = `max(1, hover.depth ?? style.hoverDepth)`; при отсутствии hover
  — 0 (тела/зоны нет).
- `inputBounds()`: открыт (`child_revealed`) — тело; закрыт — `hoverInput`
  (тело + `border` до края экрана).

### 4.3 Геометрия input

`hoverInput(body, edge, border)`:

| край | input |
| --- | --- |
| top | `y -= border`, `h += border` |
| bottom | `h += border` |
| left | `x -= border`, `w += border` |
| right | `w += border` |

Полный input закрытой зоны от края экрана = `border + depth`.
Никакого `blurReach`/`visibleDepth`/ветки `child_revealed` для extension нет.

### 4.4 Мостики

`bridges()` клампит заход в тело: `into = min(spec.intoBody, body.w, body.h)`
для контактов с рамкой и для каждой стороны контакта тел. Для толстых тел
(`min(w,h) > 2σ+2`) поведение прежнее; тонкая губа не выпускает капсулу
наружу.

### 4.5 Конфиг

```
style.hoverDepth: number = 6   // LIMITS [1, 64]
PopSpec.hover?: true | {
  depth?: number               // override, >= 1
  content?: Content
  hideOnReveal?: boolean
}
```

`meltRadius` на hover больше не влияет.

### 4.6 Как lib использует контракт

- `Frame.bodies()` = попапы + флоаты.
- `rects()` (сцена) → `bounds()`; `inputs()` (регион) → `inputBounds()`.
- `snapTarget`: соседи — `open && !animating`, геометрия — `bounds`.
- `animating` tick-цикла — `bodies().some(b => b.animating)`.
- `open/close/toggle/closeAll` — через контракт.
- `poke` — `b.subscribe(() => motion.poke())`.
- Debug: `rects`, `inputs`, `region`.

## 5. Тесты

Unit:

- `popLayout`: 4 края × align, hover/no-hover, spacer, порядок детей, ось зоны.
- `hoverInput`: 4 края, `body + border`.
- `bridges`: тонкая губа (9 px) — капсула не выходит за тело (верх/право).
- config: `hoverDepth = 6`, `LIMITS.style.hoverDepth = [1, 64]`, покрытие ключей.

Живой прогон (инстанс `ags`):

- Закрытый Settings: тело = `depth`, input = `border + depth`; ховер ловится
  только в этом диапазоне.
- Открытый: input = тело; уход на рамку закрывает.
- `hover: true` — дефолтная зона; `{ depth }` — override; без `hover` — нет
  зоны.
- `depth: 0` в конфиге/override → 1.
- Player с контентом и `hideOnReveal`.
- Закрытие без рывка в конце (мостик не переворачивается).

## 6. Риски

- Малая цель при `hoverDepth = 6`: осознанно; поднимается конфигом/override.
- Кламп мостика затрагивает тела с `min(w,h) < 2σ+2` (тонкие губы, крошечные
  флоаты); для обычных окон поведение прежнее, тесты покрывают.
- Input закрытой зоны включает полосу рамки и губу — клики там съедаются.
- Жидкостного свечения вокруг губы больше нет: губа чёткая и стыкуется с
  рамкой. Если понадобится — отдельная задача «полоса как часть рамки».

## 7. Вне рамок

- Полоса hover как часть рамки (`frameBands` в `LiquidField`).
- Кривые углов и точная досягаемость на дугах.
- Позиционирование `align: start/end` через mount.
- Hover для Float, задержки, pin-режим.

## 8. Критерии приёмки

- `depth` управляет и видимой губой, и input; при `depth < ...` input не
  уходит дальше губы.
- `depth = 0` не существует (минимум 1); выключение — отсутствие `hover`.
- `hover: true` работает как дефолт; объект — как override.
- Тонкая губа не выпускает мостик; закрытие без скачка.
- Unit-тесты, eslint, tsc по файлам репо зелёные.
