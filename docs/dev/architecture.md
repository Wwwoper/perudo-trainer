# Устройство кода

Часть [CONTRIBUTING.md](../../CONTRIBUTING.md): структура проекта, слои, API и события движка.

## Структура проекта

```
index.html           разметка всех вкладок и небольшой скрипт настроек
package.json         скрипты npm (test, test:e2e, test:e2e:ui, start), devDependencies для e2e
package-lock.json    зафиксированные версии npm-пакетов
playwright.config.js настройки e2e-тестов (десктоп и телефон)
requirements-test.txt зависимости Python-тестов вёрстки (playwright, Pillow)
CHANGELOG.md         история изменений по версиям
tools/               эмуляторы партий, тренажёра и упражнений на Python (см. [tools/README.md](../../tools/README.md))
.github/workflows/   проверка тестов на GitHub при каждом push и pull request
LICENSE              лицензия MIT
.nojekyll            отключает Jekyll на GitHub Pages
README.md            краткое описание проекта (GitHub показывает его на главной странице)
CONTRIBUTING.md      запуск, тесты и правила вклада
docs/dev/            описание устройства кода (эта папка)
docs/guide/          руководство для новичков (HTML для GitHub Pages)
src/
├── app_v2.js        точка входа: запуск вкладок и ядро партии (ход игры, стол, ход бота)
├── ui/              части интерфейса: common.js (помощники), modes.js (режимы тренажёра), tabs.js (разделы и ☰), calculator.js, trainer.js, drill.js, duel.js, sim.js, stats.js (вкладки), side_panel.js (панель партии), bot_styles.js и bot_mind.js (настройки ботов), reveal_dialog.js и result_dialog.js (окна партии), decisions.js (запись решений), key_moments.js (итог: ключевые моменты), options_view.js (список вариантов хода), weak_spots.js (блок «Над чем поработать»), player_card.js (блок «Игрок»), stats_tabs.js (подвкладки статистики), cloud_card.js (блок «Копия на Яндекс Диске»), backup_reminder.js (напоминание о копии в итоге партии)
├── core.js          вероятности, симуляция, решатель CFR (классический скрипт, глобальный Perudo)
├── rules.js         правила ставок: legal(), minLegal()          ← чистая логика
├── engine.js        игровой движок без привязки к интерфейсу     ← чистая логика
├── bots.js          стили ботов, ошибки в расчётах, принятие решений ← чистая логика
├── memory.js        что боты помнят об игроке (доля блефа)       ← чистая логика
├── assist.js        режимы помощи, оценка решений                ← чистая логика
├── result.js        итог партии: победитель, тексты окна         ← чистая логика
├── moments.js       ключевые решения партии: метки, отбор, чтение   ← чистая логика
├── compare.js       сравнение вариантов хода по шансу ставки       ← чистая логика
├── repeat_pick.js   выбор повтора с паузой между показами          ← чистая логика
├── backup_reminder.js  когда напомнить про копию, сколько раз просили хранилище ← чистая логика
├── cloud_policy.js  правила облачной копии: что делать при запуске      ← чистая логика
├── cloud_yandex.js  копия в папке приложения на Яндекс Диске игрока   ← чистая логика (fetch передаётся)
├── persistence.js   просьба к браузеру не удалять данные сайта    ← чистая логика
├── avatar_photo.js  обрезка и сжатие фото аватара (расчёты)     ← чистая логика
├── player.js        профиль игрока: имя и аватар, проверка данных  ← чистая логика
├── weak_spots.js    слабые темы по счётчикам решений               ← чистая логика
├── stats_summary.js итоги статистики: проценты, «мало данных», пустое состояние ← чистая логика
├── stats_tabs.js    подвкладки статистики: выбор и клавиши          ← чистая логика
├── games_list.js    строки списка партий                          ← чистая логика
├── trainer_rules.js проверка ставки в тренажёре по правилам          ← чистая логика
├── drill_rule.js    правило «ожидание → безопасная ставка»           ← чистая логика
├── drill_input.js   разбор ответов в упражнениях                    ← чистая логика
├── drill_note.js    пояснения к ответу в «Оценке в уме»             ← чистая логика
├── table_read.js    шанс с учётом ставок за столом для «Разбора»     ← чистая логика
├── backup.js        формат и проверка резервной копии              ← чистая логика
├── cloud_sync.js    запись и восстановление копии в облаке        ← чистая логика (fetch передаётся)
├── cloud_diag.js    отчёт «Диагностика связи» (без токена)         ← чистая логика
├── reveal.js        модель окна вскрытия кубиков                 ← чистая логика
├── game_log.js      строки журнала партии: потеря кубика, выбывание, Calza ← чистая логика
├── table.js         отрисовка стола и мест игроков (строки HTML)
├── storage.js       localStorage с версией схемы
├── theme.js         режимы темы оформления и выбор фактической темы        ← чистая логика
├── theme_boot.js    ставит тему до отрисовки страницы (обычный скрипт в <head>)
├── table.css        стол и места игроков
└── css/             themes (цветовые токены), base, game, learn, components, trainer, drill
tests/
├── *.test.js        тесты логики (node --test)
├── core.test.cjs    тесты core.js: вероятности и CFR (node --test)
├── e2e/table.spec.js  сценарии партии в браузере (Playwright Test)
├── e2e/learning.spec.js  сценарии Калькулятора, Тренажёра и Упражнений
├── e2e/stats.spec.js  сценарии статистики
├── e2e/helpers.js   общие помощники e2e (открыть вкладку на телефоне через ☰)
├── e2e/static-server.mjs  сервер статики для этих тестов
├── __init__.py      делает папку пакетом для `python3 -m unittest`
├── test_layout.py   тесты вёрстки в браузере (Playwright)
├── test_learning_layout.py  пороги вёрстки учебных вкладок
└── layout_audit.py  измеритель вёрстки учебных вкладок (таблица показателей)
docs/img/            скриншоты для README (game-desktop.png также служит превью ссылки); все снимает tools/screenshots.py
```

## Как устроен код

Слои в общих чертах идут снизу вверх, и нижние ничего не знают о верхних:

```
rules.js → engine.js → memory.js / bots.js / assist.js → result.js / reveal.js / table.js → app_v2.js
```

- **Логика отделена от интерфейса.** `rules`, `engine`, `bots`, `assist`, `result`, `reveal`, `moments`, `compare` — чистые функции без DOM, поэтому они тестируются в Node за доли секунды.
- **Ошибки и память ботов.** `botDecide` получает необязательные `noise` (множитель из `noiseForLevel(level)`; 0 — без ошибок) и `opponent` (`{ bluffRate, samples }` из `opponentModel`). Ошибка — равномерный сдвиг оценки вероятности в пределах `noise` стиля, один на ставку за ход. Память — поправка к оценке *текущей* ставки человека: `adapt × (bluffRate − 0,3)`, не больше ±0,25. Без `noise` и `opponent` функция по-прежнему детерминирована. `memory.js` ничего не знает о браузере: сохраняет её `app_v2.js` через `storage.js` (ключ `perudo.botMemory`), а пополняется она событиями движка `DICE_REVEALED` с `kind: 'dudo'`.
- **Новый стиль бота** — это запись в `BOT_STYLES` (`src/bots.js`): имя, значок, описание и параметры (`raiseMin`, `dudoBelow`, `bluff`, `calza`, `noise`, `adapt`; смысл каждого описан комментарием над списком). Выпадающие списки в настройках и подсказка строятся из этого объекта сами, менять разметку не нужно. Тест `tests/bot-styles.test.js` проверит новую запись сам: пороги в диапазоне 0–1, уникальные имя и значок.
- **Формат ставки везде `{ q, f }`** (количество и грань). В движке `game.bid = { q, f, playerId, playerName }`.
- **Интерфейс перерисовывается функцией `renderGame()`**, а стол строится строкой HTML в `table.js`. Окна вскрытия и итога — нативные `<dialog>`.
- **Хранилище.** Все данные лежат в `localStorage` под ключами `perudo.*` (см. `storage.js`, там же версия схемы).
- **Для отладки и тестов** в консоли доступен объект `window.__perudo_v2` (`game`, `startNewGame`, `renderGame`).

### API движка

```javascript
import { createGame, startGame, applyAction, getLegalActions, getPublicState } from './src/engine.js';

const game = createGame({
  playerId: 'human',
  botCount: 2,
  startDice: 5,
  calzaEnabled: true,
  palificoEnabled: true,
  assistMode: 'training',
  botSpeed: 'normal',          // необязательно: темп ботов (для интерфейса)
  botNames: ['Иван', 'Мария'], // необязательно: имена ботов вместо случайных
});
// botCount — целое от 1 до 5, startDice — целое от 1 до 10 (константа LIMITS),
// иначе createGame бросает RangeError.

startGame(game);

getLegalActions(game, 'human');                       // допустимые действия игрока
const res = applyAction(game, 'human', { type: 'raise', quantity: 8, face: 4 });
// также { type: 'dudo' } и { type: 'calza' }
// res = { success, events } либо { success: false, error }

getPublicState(game);                                 // без скрытых рук
```

### События движка (`res.events`)

| Событие | Когда |
|---|---|
| `GAME_STARTED`, `GAME_ENDED` | начало и конец партии |
| `ROUND_STARTED`, `DICE_ROLLED` | новый раунд, раздача кубиков |
| `BID_PLACED` | сделана ставка |
| `DUDO_CALLED`, `CALZA_CALLED` | вызов проверки |
| `DICE_REVEALED` | кубики вскрыты: `kind` (`dudo`/`calza`), `bid`, `actualCount`, `bidSuccessful` или `calzaExact`, `wild`, `challengerId`, `bidderId`, `loserId`, **`hands`** (копия рук всех живых игроков: после вскрытия движок сразу раздаёт новые кубики) |
| `PLAYER_LOST_DIE`, `PLAYER_GAINED_DIE` | изменилось число кубиков |
| `PLAYER_ELIMINATED` | игрок выбыл |
| `PALIFICO_STARTED` | начался раунд Палифико |
