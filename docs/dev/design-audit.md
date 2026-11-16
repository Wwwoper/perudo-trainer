# Аудит единообразия интерфейса

Файл создаёт `python3 tools/design_audit.py --out docs/dev/design-audit.md`. Не правьте его вручную: пересоздайте после изменения стилей. Что делать с цифрами — см. [design.md](design.md).

## 1. Исходники CSS

Токенов (`--имя`), определённых в стилях: **125**.

### Размер шрифта

Значений через токены: **184**; чисел в px: **0**, разных чисел: **0**.

### Скругление

Значений через токены: **86**; чисел в px: **3**, разных чисел: **1**.

| px | раз |
|---:|---:|
| 2 | 3 |

### Отступы (padding, margin, gap)

Значений через токены: **501**; чисел в px: **46**, разных чисел: **3**.

| px | раз |
|---:|---:|
| 2 | 33 |
| 1 | 11 |
| -1 | 2 |

### Минимальная высота

Значений через токены: **95**; чисел в px: **23**, разных чисел: **12**.

| px | раз |
|---:|---:|
| 16 | 4 |
| 44 | 3 |
| 48 | 3 |
| 24 | 2 |
| 64 | 2 |
| 72 | 2 |
| 90 | 2 |
| 220 | 1 |
| 300 | 1 |
| 320 | 1 |
| 330 | 1 |
| 520 | 1 |

### Селекторы, определённые в нескольких файлах

- `#gAdvice` — `src/css/components.css`, `src/css/game.css`
- `.app-header` — `src/css/base.css`, `src/css/game.css`
- `.check` — `src/css/game.css`, `src/css/learn.css`
- `.drill-tab` — `src/css/components.css`, `src/css/drill.css`
- `.drill-tabs` — `src/css/components.css`, `src/css/drill.css`
- `.field` — `src/css/game.css`, `src/css/learn.css`
- `.field-row` — `src/css/game.css`, `src/css/learn.css`
- `.side-tabs` — `src/css/components.css`, `src/css/game.css`
- `.stats-tabs` — `src/css/components.css`, `src/css/learn.css`
- `main` — `src/css/base.css`, `src/css/game.css`, `src/css/trainer.css`

### Классы кнопок

- `.btn` — `src/css/base.css`
- `.btn-primary` — `src/css/base.css`, `src/css/drill.css`, `src/css/game.css`
- `.btn-row` — `src/css/learn.css`
- `.btn-sub` — `src/css/game.css`
- `.dock-buttons` — `src/css/game.css`, `src/css/learn.css`
- `.face-btn` — `src/css/base.css`, `src/css/game.css`
- `.hud-tab-btn` — `src/css/game.css`
- `.icon-btn` — `src/css/game.css`
- `.icon-btn-text` — `src/css/game.css`
- `.link-btn` — `src/css/game.css`
- `.mode-btn` — `src/css/trainer.css`
- `.read-yn-btn` — `src/css/drill.css`
- `.series-buttons` — `src/css/drill.css`
- `.sit-guess-btn` — `src/css/components.css`
- `.sit-guess-btns` — `src/css/components.css`
- `.sit-plan-btn` — `src/css/components.css`

## 2. Живой интерфейс

Подпись элемента: шрифт · вес · отступы · скругление · рамка · фон · цвет · высота. Чем больше разных подписей у одного вида, тем сильнее он разъехался.

### Кнопки: 72 шт., разных подписей — 18

| раз | подпись | вкладки | примеры |
|---:|---|---|---|
| 15 | 16 · 400 · 0/0 · 12 · 1 · rgba(0, 0, 0, 0) · rgb(26, 31, 43) · 44 | calc, game, train | button.face-btn |
| 9 | 14 · 600 · 0/8 · 6 · 0 · rgba(0, 0, 0, 0) · rgb(86, 96, 116) · 44 | drill, game, stats | button#tabCalc.has-hint «Расчёт»; button#tabReview «Разбор»; button#tabOpp «Стол» |
| 9 | 16 · 400 · 4/8 · 8 · 1 · rgb(231, 235, 242) · rgb(26, 31, 43) · 44 | calc | button «+1»; button «+2»; button «+3» |
| 6 | 14 · 400 · 4/12 · 999 · 1 · rgb(231, 235, 242) · rgb(26, 31, 43) · 44 | train | button.mode-btn «Палифико»; button.mode-btn «Эндшпиль»; button.mode-btn «Большой стол» |
| 4 | 16 · 400 · 8/12 · 8 · 1 · rgb(231, 235, 242) · rgb(26, 31, 43) · 44 | duel, game (настройки), stats | button#gFirstPreset «Первая учебная партия»; button#gMemoryReset «Забыть мою игру»; button#dSolve «Рассчитать равновесие» |
| 4 | 16 · 700 · 8/12 · 8 · 1 · rgb(33, 89, 189) · rgb(255, 255, 255) · 52 | drill, game, sim, train | button#gRaise.btn-primary «Ставлю 1×2шанс 100.0%»; button#tRaise.btn-primary «Ставлю»; button#dACheck.btn-primary «Проверить» |
| 4 | 20 · 400 · 0/0 · 0 · 1 · rgb(231, 235, 242) · rgb(26, 31, 43) · 52 | calc, game, train | button#gPlus «+»; button#tTPlus «+»; button#tPlus «+» |
| 4 | 20 · 400 · 0/0 · 8 · 1 · rgb(231, 235, 242) · rgb(26, 31, 43) · 52 | calc, game, train | button#gMinus «−»; button#tTMinus «−»; button#tMinus «−» |
| 3 | 14 · 600 · 0/8 · 6 · 0 · rgb(33, 89, 189) · rgb(255, 255, 255) · 44 | drill, game, stats | button#tabLog «Журнал»; button.drill-tab.on «Оценка в уме»; button#stTabResults.stats-tab «Результаты» |
| 3 | 16 · 400 · 0/0 · 12 · 1 · rgb(219, 230, 251) · rgb(26, 31, 43) · 44 | calc, game, train | button.face-btn.sel |
| 3 | 16 · 700 · 8/12 · 8 · 1 · rgb(33, 89, 189) · rgb(255, 255, 255) · 44 | duel, game (настройки), stats | button.btn-primary.side-start «Начать партию»; button#dStart.btn-primary.duel-start «Играть против оптимально»; button.btn-primary «Сыграть партию» |
| 2 | 16 · 700 · 8/12 · 8 · 1 · rgb(198, 47, 47) · rgb(255, 255, 255) · 52 | game, train | button#gDudo.bad «Не верю!»; button#tDudo.bad «Не верю!» |
| … | ещё подписей: 6 | | |

### Заголовки и «summary»: 19 шт., разных подписей — 5

| раз | подпись | вкладки | примеры |
|---:|---|---|---|
| 9 | 20 · 700 · 0/0 · 0 · 0 · rgba(0, 0, 0, 0) · rgb(26, 31, 43) · 24 | calc, drill, duel, game, game (настройки), sim, stats, train | h1 «🎲 Перудо»; h2#gSetupTitle.setup-title «Новая партия» |
| 4 | 12 · 700 · 0/0 · 0 · 0 · rgba(0, 0, 0, 0) · rgb(26, 31, 43) · 15 | game (настройки) | h3#gOppLabel.set-label «Соперники»; h3#gHelpLabel.set-label «Помощь и темп»; h3#gSoundLabel.set-label «Звуки» |
| 3 | 14 · 600 · 0/0 · 0 · 0 · rgba(0, 0, 0, 0) · rgb(33, 89, 189) · 44 | drill, game (настройки) | summary «Что значат стили ботов»; summary «Как повышать ставку»; summary «Как прикинуть в уме» |
| 2 | 16 · 700 · 0/0 · 0 · 0 · rgba(0, 0, 0, 0) · rgb(26, 31, 43) · 44 | calc, train | summary «📊 Статистика»; summary «Чтение чужих ставок» |
| 1 | 14 · 400 · 4/12 · 999 · 0 · rgb(234, 238, 244) · rgb(86, 96, 116) · 44 | train | summary «⚙️ Классика · порог 0.50» |

### Поля и списки: 22 шт., разных подписей — 3

| раз | подпись | вкладки | примеры |
|---:|---|---|---|
| 16 | 16 · 400 · 8/12 · 8 · 1 · rgb(231, 235, 242) · rgb(26, 31, 43) · 44 | calc, game (настройки), sim | input#gDice «5»; input#gBots «3»; select#gBotStyle0 «По умолчанию🎲 Случайный» |
| 4 | 20 · 700 · 0/0 · 0 · 1 · rgb(231, 235, 242) · rgb(26, 31, 43) · 52 | calc, game, train | input#gQ «1»; input#tT «0.5»; input#tQ «2» |
| 2 | 18 · 400 · 12/12 · 12 · 1 · rgb(238, 241, 246) · rgb(26, 31, 43) · 47 | drill | input#dA1.drill-input; input#dA2.drill-input |

### Чипы и значки: 3 шт., разных подписей — 2

| раз | подпись | вкладки | примеры |
|---:|---|---|---|
| 2 | 20 · 700 · 4/12 · 12 · 1 · rgb(231, 235, 242) · rgb(26, 31, 43) · 44 | calc, train | span.chip «4×»; span.chip «7×» |
| 1 | 12 · 600 · 1/8 · 999 · 0 · rgb(227, 236, 251) · rgb(28, 58, 115) · 17 | duel | span.badge «Продвинутый режим» |
