# Аудит единообразия интерфейса

Файл создаёт `python3 tools/design_audit.py --out docs/dev/design-audit.md`. Не правьте его вручную: пересоздайте после изменения стилей. Что делать с цифрами — см. [design.md](design.md).

## 1. Исходники CSS

Токенов (`--имя`), определённых в стилях: **114**.

### Размер шрифта

Значений через токены: **1**; чисел в px: **171**, разных чисел: **17**.

| px | раз |
|---:|---:|
| 13 | 39 |
| 14 | 34 |
| 12 | 28 |
| 18 | 17 |
| 16 | 12 |
| 15 | 8 |
| 20 | 8 |
| 11 | 7 |
| 22 | 6 |
| 17 | 3 |
| 10 | 2 |
| 26 | 2 |
| 24 | 1 |
| 30 | 1 |
| 32 | 1 |
| 36 | 1 |
| 48 | 1 |

### Скругление

Значений через токены: **23**; чисел в px: **64**, разных чисел: **12**.

| px | раз |
|---:|---:|
| 8 | 20 |
| 6 | 12 |
| 12 | 8 |
| 999 | 7 |
| 4 | 5 |
| 10 | 5 |
| 20 | 2 |
| 2 | 1 |
| 5 | 1 |
| 7 | 1 |
| 9 | 1 |
| 14 | 1 |

### Отступы (padding, margin, gap)

Значений через токены: **170**; чисел в px: **459**, разных чисел: **17**.

| px | раз |
|---:|---:|
| 8 | 96 |
| 6 | 91 |
| 4 | 65 |
| 10 | 63 |
| 12 | 56 |
| 2 | 33 |
| 3 | 18 |
| 1 | 11 |
| 14 | 9 |
| 5 | 4 |
| 16 | 4 |
| 18 | 3 |
| -1 | 2 |
| 7 | 1 |
| 9 | 1 |
| 11 | 1 |
| 20 | 1 |

### Минимальная высота

Значений через токены: **87**; чисел в px: **28**, разных чисел: **13**.

| px | раз |
|---:|---:|
| 44 | 7 |
| 16 | 4 |
| 48 | 3 |
| 24 | 2 |
| 64 | 2 |
| 72 | 2 |
| 90 | 2 |
| 40 | 1 |
| 220 | 1 |
| 300 | 1 |
| 320 | 1 |
| 330 | 1 |
| 520 | 1 |

### Селекторы, определённые в нескольких файлах

- `#gAdvice` — `src/css/components.css`, `src/css/game.css`
- `.app-header` — `src/css/base.css`, `src/css/game.css`
- `.check` — `src/css/game.css`, `src/css/learn.css`
- `.field` — `src/css/game.css`, `src/css/learn.css`
- `.field-row` — `src/css/game.css`, `src/css/learn.css`
- `.link-btn` — `src/css/game.css`, `src/css/learn.css`
- `main` — `src/css/base.css`, `src/css/game.css`, `src/css/trainer.css`

### Классы кнопок

- `.btn-primary` — `src/css/drill.css`, `src/css/game.css`
- `.btn-row` — `src/css/learn.css`
- `.btn-sub` — `src/css/game.css`
- `.dock-buttons` — `src/css/game.css`, `src/css/learn.css`
- `.face-btn` — `src/css/base.css`, `src/css/game.css`
- `.hud-tab-btn` — `src/css/game.css`
- `.icon-btn` — `src/css/game.css`
- `.icon-btn-text` — `src/css/game.css`
- `.link-btn` — `src/css/game.css`, `src/css/learn.css`
- `.mode-btn` — `src/css/trainer.css`
- `.read-yn-btn` — `src/css/drill.css`
- `.series-buttons` — `src/css/drill.css`
- `.sit-guess-btn` — `src/css/components.css`
- `.sit-guess-btns` — `src/css/components.css`
- `.sit-plan-btn` — `src/css/components.css`

## 2. Живой интерфейс

Подпись элемента: шрифт · вес · отступы · скругление · рамка · фон · цвет · высота. Чем больше разных подписей у одного вида, тем сильнее он разъехался.

### Кнопки: 72 шт., разных подписей — 24

| раз | подпись | вкладки | примеры |
|---:|---|---|---|
| 15 | 16 · 400 · 0/0 · 10 · 1 · rgba(0, 0, 0, 0) · rgb(26, 31, 43) · 44 | calc, game, train | button.face-btn |
| 9 | 15 · 400 · 4/6 · 8 · 1 · rgb(231, 235, 242) · rgb(26, 31, 43) · 44 | calc | button «+1»; button «+2»; button «+3» |
| 6 | 14 · 400 · 4/14 · 999 · 1 · rgb(231, 235, 242) · rgb(26, 31, 43) · 44 | train | button.mode-btn «Палифико»; button.mode-btn «Эндшпиль»; button.mode-btn «Большой стол» |
| 4 | 14 · 600 · 8/10 · 6 · 0 · rgba(0, 0, 0, 0) · rgb(86, 96, 116) · 50 | drill | button.drill-tab «Правило единиц»; button.drill-tab «Читай вскрытие»; button.drill-tab «Серия» |
| 4 | 16 · 400 · 8/12 · 8 · 1 · rgb(231, 235, 242) · rgb(26, 31, 43) · 44 | duel, game (настройки), stats | button#gFirstPreset «Первая учебная партия»; button#gMemoryReset «Забыть мою игру»; button#dSolve «Рассчитать равновесие» |
| 4 | 22 · 400 · 0/0 · 0 · 1 · rgb(231, 235, 242) · rgb(26, 31, 43) · 52 | calc, game, train | button#gPlus «+»; button#tTPlus «+»; button#tPlus «+» |
| 4 | 22 · 400 · 0/0 · 8 · 1 · rgb(231, 235, 242) · rgb(26, 31, 43) · 52 | calc, game, train | button#gMinus «−»; button#tTMinus «−»; button#tMinus «−» |
| 3 | 14 · 600 · 0/8 · 6 · 0 · rgba(0, 0, 0, 0) · rgb(86, 96, 116) · 40 | game | button#tabCalc.has-hint «Расчёт»; button#tabReview «Разбор»; button#tabOpp «Стол» |
| 3 | 16 · 400 · 0/0 · 10 · 1 · rgb(219, 230, 251) · rgb(26, 31, 43) · 44 | calc, game, train | button.face-btn.sel |
| 3 | 16 · 700 · 6/12 · 8 · 1 · rgb(33, 89, 189) · rgb(255, 255, 255) · 52 | drill, game, train | button#gRaise.btn-primary «Ставлю 1×2шанс 100.0%»; button#tRaise.btn-primary «Ставлю»; button#dACheck.btn-primary «Проверить» |
| 2 | 15 · 600 · 0/8 · 6 · 0 · rgba(0, 0, 0, 0) · rgb(86, 96, 116) · 44 | stats | button#stTabPlayer.stats-tab «Игрок»; button#stTabData.stats-tab «Данные» |
| 2 | 16 · 700 · 6/12 · 8 · 1 · rgb(198, 47, 47) · rgb(255, 255, 255) · 52 | game, train | button#gDudo.bad «Не верю!»; button#tDudo.bad «Не верю!» |
| … | ещё подписей: 12 | | |

### Заголовки и «summary»: 19 шт., разных подписей — 8

| раз | подпись | вкладки | примеры |
|---:|---|---|---|
| 8 | 20 · 700 · 0/0 · 0 · 0 · rgba(0, 0, 0, 0) · rgb(26, 31, 43) · 24 | calc, drill, duel, game, game (настройки), sim, stats, train | h1 «🎲 Перудо» |
| 4 | 12 · 700 · 0/0 · 0 · 0 · rgba(0, 0, 0, 0) · rgb(26, 31, 43) · 15 | game (настройки) | h3#gOppLabel.set-label «Соперники»; h3#gHelpLabel.set-label «Помощь и темп»; h3#gSoundLabel.set-label «Звуки» |
| 2 | 14 · 400 · 0/0 · 0 · 0 · rgba(0, 0, 0, 0) · rgb(86, 96, 116) · 44 | game (настройки) | summary «Что значат стили ботов»; summary «Как повышать ставку» |
| 1 | 13 · 600 · 0/0 · 0 · 0 · rgba(0, 0, 0, 0) · rgb(33, 89, 189) · 44 | drill | summary «Как прикинуть в уме» |
| 1 | 14 · 400 · 4/14 · 999 · 0 · rgb(234, 238, 244) · rgb(86, 96, 116) · 44 | train | summary «⚙️ Классика · порог 0.50» |
| 1 | 16 · 700 · 0/0 · 0 · 0 · rgba(0, 0, 0, 0) · rgb(26, 31, 43) · 44 | calc | summary «Чтение чужих ставок» |
| 1 | 16 · 700 · 4/0 · 0 · 0 · rgba(0, 0, 0, 0) · rgb(26, 31, 43) · 44 | train | summary «📊 Статистика» |
| 1 | 22 · 700 · 0/0 · 0 · 0 · rgba(0, 0, 0, 0) · rgb(26, 31, 43) · 26 | game (настройки) | h2#gSetupTitle.setup-title «Новая партия» |

### Поля и списки: 22 шт., разных подписей — 3

| раз | подпись | вкладки | примеры |
|---:|---|---|---|
| 16 | 16 · 400 · 8/12 · 8 · 1 · rgb(231, 235, 242) · rgb(26, 31, 43) · 44 | calc, game (настройки), sim | input#gDice «5»; input#gBots «3»; select#gBotStyle0 «По умолчанию🎲 Случайный» |
| 4 | 20 · 700 · 0/0 · 0 · 1 · rgb(231, 235, 242) · rgb(26, 31, 43) · 52 | calc, game, train | input#gQ «1»; input#tT «0.5»; input#tQ «2» |
| 2 | 18 · 400 · 12/14 · 10 · 1 · rgb(238, 241, 246) · rgb(26, 31, 43) · 47 | drill | input#dA1.drill-input; input#dA2.drill-input |

### Чипы и значки: 3 шт., разных подписей — 2

| раз | подпись | вкладки | примеры |
|---:|---|---|---|
| 2 | 20 · 700 · 3/10 · 10 · 1 · rgb(231, 235, 242) · rgb(26, 31, 43) · 42 | calc, train | span.chip «4×»; span.chip «7×» |
| 1 | 12 · 600 · 1/8 · 999 · 0 · rgb(227, 236, 251) · rgb(28, 58, 115) · 17 | duel | span.badge «Продвинутый режим» |
