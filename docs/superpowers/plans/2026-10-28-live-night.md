# Этап 7 «Подготовка к живому вечеру»: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Приложение переживает опоздавших и ушедших гостей, обрывы связи, смерть телефона ведущего и два часа нагрузки от 30 человек без бумаги и перезапуска.

**Architecture:** Правила меняются только в чистом движке `@fair/shared` (присутствие после открытия, пауза для сделок, `gm.reissue`, вещь в `AbilityUsed`). Сервер шлёт содержимое одним сообщением при подключении и получает административный маршрут. Клиент хранит содержимое в сигнале и добавляет экраны устойчивости. Симулятор получает опоздавшего и ушедшего в сценарии и отдельный нагрузочный режим.

**Tech Stack:** TypeScript, pnpm workspace, Fastify 4 + ws + better-sqlite3, Preact + signals, vitest, `@fair/sim` с `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-27-live-night-design.md`

## Global Constraints

- Работа из `apps/mini-app`, ветка `live-night`. Коммиты с автором и коммитером `Andrew Piskunov <45717261+andrewpiskunov@users.noreply.github.com>`, сообщения на русском, без `Co-authored-by` и упоминаний инструментов.
- Идентификаторы на английском, комментарии, тексты интерфейса и документация на русском. Клиент импортирует из `@fair/shared` только типы (тест `type-only.test.ts`).
- `docs/design/game-data-v0.2.json` и `docs/references` не менять. Не коммитить `.superpowers/`, `sim-out/`, `exports/`, `*.sqlite`.
- Никаких секретов, личных данных и реальных состояний в Git. Токен бота только в `.env` сервера.
- Перед заявлением «готово» из `apps/mini-app`: `pnpm typecheck && pnpm test` зелёные. Сейчас: shared 376, client 55, server 51, sim 60. Сквозной тест `pnpm e2e` (в tmux, лог в scratchpad) остаётся зелёным.
- Боты не используют `Math.random`; `session.reset` симулятор не шлёт.
- Хук оболочки блокирует строки запуска dev-сервера в командах: такие команды писать в скрипт через Write и запускать скрипт.

## Review Focus

1. Опоздавший, которого ведущий отметил, снял и снова отметил, получает стартовый набор ровно один раз (`startIssuedAt`). Тест в Task 1.
2. У ушедшего с ожидающим предложением резервы золота и вещей снимаются, `checkGold`/`checkInvariants` проходят. Тест в Task 1.
3. Клиент ведущего, получивший проекцию раньше сообщения `content` (переподключение), не падает и рисует пульт после прихода содержимого. Тест в Task 4.
4. `POST /api/admin/gm-reissue` с неверным, пустым или отсутствующим секретом даёт 403 и не меняет состояние; сравнение постоянное по времени. Тест в Task 3.
5. Нагрузочный прогон считает переподключения: любое закрытие сокета во время прогона попадает в отчёт и проваливает критерий. Тест в Task 5.

---

### Task 1: Движок: присутствие после открытия и пауза для сделок

**Files:**
- Modify: `packages/shared/src/types.ts` (`Player.startIssuedAt?: number`)
- Modify: `packages/shared/src/events.ts` (`PlayerArrived`, `PlayerLeft`, объединение `Event`)
- Modify: `packages/shared/src/engine/session.ts` (`player.setPresent` после открытия, `startIssuedAt` в `FairOpened`)
- Modify: `packages/shared/src/engine/offers.ts` (пауза для `offer.create`, `offer.accept`), `packages/shared/src/engine/guards.ts` (отказ ушедшему)
- Modify: `packages/shared/src/engine/index.ts` (редьюсеры новых событий), `packages/shared/src/invariants.ts` если нужно
- Test: `packages/shared/src/__tests__/presence.test.ts`, дополнения в `offers.test.ts`

**Interfaces:**
- Consumes: `ok(...events)` из `engine/result.ts`; помощник `Fair`, `makeGame(n, { present })`, `run`, `checkGold`, `checkInvariants` из `__tests__/helpers.ts`.
- Produces: события `PlayerArrived { type; at; roleKey; startSet: boolean }`, `PlayerLeft { type; at; roleKey }`; `OfferClosed { status: 'cancelled', reason: 'left' }`, `ConsentClosed { status: 'cancelled', reason: 'left' }`; отказ игрока `fail('phase', 'ведущий отметил, что вы ушли')`; отказ сделок на паузе `fail('phase', 'часы на паузе')`.

- [ ] **Step 1: Тесты присутствия** в `presence.test.ts` (игра `makeGame(12, { present: allBut(12, ['o11']) })`, открыта):
  - «опоздавший получает стартовый набор один раз»: `player.setPresent o11 true` в `act1` → события `[PlayerArrived{startSet:true}]`, `gold 6`, ингредиенты по `bundle`, `startIssuedAt` задан; затем `false`, затем `true` → `PlayerArrived{startSet:false}`, золото не изменилось (Review Focus 1).
  - «ушедший: сделки закрыты, резервы сняты»: `o6` создаёт предложение `o8` с 2 золотыми, `setPresent o8 false` → события `[PlayerLeft, OfferClosed{status:'cancelled', reason:'left'}]`, `reservedGold` у `o6` равен 0, `checkGold` и `checkInvariants` без ошибок (Review Focus 2); просьба с участием ушедшего закрыта `ConsentClosed{cancelled, left}`.
  - «команды ушедшего отклоняются»: `shop.buy` от `o8` → `phase` с текстом «ведущий отметил, что вы ушли»; после возврата проходит.
  - «повтор того же значения: ok без событий»; «в closed отказ phase»; «роль вне состава: not_found».
  - «итоги без ушедшего»: ушедший в акте III не входит в `computeClosing().players`, вернувшийся входит.
  - «при открытии startIssuedAt у присутствующих».
- [ ] **Step 2: Запустить, убедиться, что падают** (`pnpm --filter @fair/shared test -- presence`).
- [ ] **Step 3: Реализовать** команду и редьюсеры. Отказ ушедшему: в общем месте проверки актёра-игрока (`guards.ts`, где строится «игрок не найден»): если фаза не `setup` и `players[key].present === false` → `fail('phase', 'ведущий отметил, что вы ушли')`. Закрытие предложений: переиспользовать существующую логику отмены (снятие резервов) из `offers.ts`, вызывать из `session.ts` для всех `pending` с `from`/`to` равным роли; просьбы по аналогии из `consent.ts`.
- [ ] **Step 4: Тесты паузы** в `offers.test.ts`: на паузе `offer.create` и `offer.accept` от игрока → `phase` «часы на паузе»; `offer.decline`, `offer.cancel` проходят; после `clock.resume` всё проходит.
- [ ] **Step 5: Реализовать** проверку паузы по образцу `consent.ts:82`.
- [ ] **Step 6: `pnpm typecheck && pnpm test`**, зелёные.
- [ ] **Step 7: Commit** «Этап 7: присутствие после открытия, сделки на паузе».

---

### Task 2: Движок: поиск по ключу, вещь в записи журнала, пересдача кода ведущего

**Files:**
- Modify: `packages/shared/src/engine/guards.ts` (`lookup`), `altars.ts`, `bundles.ts`, `acts.ts`, `offers.ts`, `consent.ts`, `lots.ts` (все `state.items[cmd.*]`, `state.offers[cmd.*]`, `state.requests[cmd.*]`, `state.lots[cmd.*]`, `state.players[cmd.*]` из входа)
- Modify: `packages/shared/src/events.ts` (`AbilityUsed.item?`, `GmReissued`), `packages/shared/src/types.ts` (`ActionRecord.item?`), `packages/shared/src/engine/effects.ts` (`recordAction`), `packages/shared/src/engine/abilities.ts` (строки около 104, 238–270), `packages/shared/src/commands.ts` (`gm.reissue`, `COMMAND_TYPES`), `packages/shared/src/engine/session.ts` (`gm.reissue`, редьюсер `GmReissued`)
- Test: `packages/shared/src/__tests__/lookup.test.ts`, дополнения в `abilities-workshop.test.ts`, `reset.test.ts` (или новый `reissue.test.ts`)

**Interfaces:**
- Consumes: `codesFrom(content, ctx)` в `session.ts` для генерации кода (взять ту же функцию, что у `SessionReset`, но один код ведущего).
- Produces: `lookup<T>(record: Record<string, T>, id: unknown): T | undefined` в `guards.ts`; `AbilityUsed.item?: { kind: ItemKind; ref: string }`; `ActionRecord.item?` того же вида; команда `{ type: 'gm.reissue' }` только для актёра `system`; событие `GmReissued { type; at; code }` (применение: `gmCode = code`, `gmTelegramId` удалён).

- [ ] **Step 1: Тесты `lookup`**: для каждого из модулей команда с ключом `'constructor'` (`altar.withdraw contributionId`, `offer.accept offerId`, `consent.accept requestId`, `lot.bid lotId`, `item.use itemId`, `gm.correct playerKey`) даёт `not_found`, не `internal` и не исключение.
- [ ] **Step 2: Реализовать `lookup`** и заменить прямые обращения по ключам из входа.
- [ ] **Step 3: Тесты вещи в журнале**: изготовление способностью → `AbilityUsed.item = { kind, ref: recipeId }` и `state.actions.at(-1).item` тот же; `reforge` → созданная; `disassemble`, `sellToBank` → убранная; покупка (`buyCheap`) → поля нет.
- [ ] **Step 4: Реализовать** (поле в событии и копирование в `recordAction`).
- [ ] **Step 5: Тесты `gm.reissue`**: от `gm` и от игрока `forbidden`; от `system` → `[GmReissued{code}]`, `gmCode` новый, `gmTelegramId` отсутствует, старые коды игроков не изменились, `actorForToken`-подобная проверка через `player.bind` новым кодом ведущего проходит.
- [ ] **Step 6: Реализовать**.
- [ ] **Step 7: `pnpm typecheck && pnpm test`**, зелёные.
- [ ] **Step 8: Commit** «Этап 7: поиск по ключу, вещь в журнале способности, пересдача кода ведущего».

---

### Task 3: Сервер: содержимое одним сообщением, память в health, административный маршрут

**Files:**
- Modify: `packages/shared/src/views.ts` (`GmView`: убрать `content`, добавить `contentVersion: string`)
- Modify: `packages/server/src/ws.ts` (сообщение `content` до первой проекции), `packages/server/src/http.ts` (`/api/health` с `memory` при `allowDevAuth`; `POST /api/admin/gm-reissue`), `packages/server/src/export.ts` (`GmReissued.code = ''`)
- Test: `packages/server/src/__tests__/ws.test.ts`, `http.test.ts` (или `admin.test.ts`), `export.test.ts`

**Interfaces:**
- Consumes: `gm.reissue` и `GmReissued` из Task 2; `game.submit(cmdId, cmd, { type: 'system' })`.
- Produces: сообщение `{ kind: 'content'; version: string; data: ContentData }` первым после открытия сокета; `GmView.contentVersion`; `GET /api/health` → `{ ok, seq, memory?: { rss: number; heapUsed: number } }`; `POST /api/admin/gm-reissue` с заголовком `X-Admin-Secret` → `200 { code }` или `403 { error: 'forbidden' }`.

- [ ] **Step 1: Тесты ws**: первое сообщение после подключения `kind: 'content'` с `version === content.version` и `data.roles`; второе `kind: 'view'`; у `view.view` ведущего нет поля `content`, есть `contentVersion`; после `gm.reissue` через маршрут подключение ведущего закрывается кодом 4403 (и подключение «Играть за» того же аккаунта тоже).
- [ ] **Step 2: Тесты маршрута**: без заголовка 403; с неверным 403, `game.state().gmCode` не изменился (Review Focus 4); с верным 200, `code` длиной как у кодов приглашений, `gmTelegramId` снят; `health` без dev-входа не содержит `memory`, с dev-входом содержит числа.
- [ ] **Step 3: Тест выгрузки**: после `gm.reissue` в `stripPersonal` событие `GmReissued.code === ''`, новый код ведущего не встречается в строке выгрузки.
- [ ] **Step 4: Реализовать**. Сравнение секрета: `timingSafeEqual` по `sha256` обеих строк. Сообщение `content` формируется один раз при старте (`JSON.stringify` кэшируется в замыкании `attachWs`).
- [ ] **Step 5: `pnpm typecheck && pnpm test`** (client упадёт на `view.content`: это чинит Task 4, поэтому в этой задаче допустимо временно оставить в клиенте чтение `contentVersion` без использования — нет: порядок задач последовательный, Task 3 должен оставить `pnpm typecheck` зелёным; поэтому минимальная правка клиента здесь: `Roster.tsx`, `gm/lots.ts`, `gm/actions.ts` читают содержимое из нового сигнала `content` в `store.ts`, который Task 3 добавляет с заполнением из сообщения `content` в `api.ts`; Task 4 доводит экраны и тесты).
- [ ] **Step 6: Commit** «Этап 7: содержимое одним сообщением, память в health, пересдача кода ведущего по маршруту».

---

### Task 4: Клиент: устойчивость, улики, журнал, присутствие, пауза

**Files:**
- Modify: `packages/client/src/api.ts` (`retryNow()`, id без `randomUUID`, обработка `kind: 'content'`), `packages/client/src/store.ts` (`status 'auth_failed'`, `retryLogin()`, сигнал `content`), `packages/client/src/App.tsx` (экран `auth_failed` с кнопкой «Повторить», кнопка у `unauthorized`, полоса «Нет связи, переподключение…» с кнопкой «Сейчас», полоса ушедшего), `packages/client/src/labels.ts` (причина `left`: «участник ушёл» для предложений и просьб; название вещи в записи), `packages/client/src/screens/Bag.tsx` (текст улики), `packages/client/src/screens/Events.tsx` и `screens/gm/*` журнал (вещь в записи), `packages/client/src/screens/gm/Roster.tsx` (столбец «пришёл» активен после открытия, подтверждения §2.5), `packages/client/src/screens/Trades.tsx` (на паузе кнопки «Предложить» и «Принять» скрыты, подпись «пауза»), `packages/client/src/rules.ts` (`playerLeft(v)`, `tradesPaused(v)`)
- Test: `packages/client/src/__tests__/api.test.ts`, `rules.test.ts`, `labels.test.ts`, `store.test.ts` (новый, с подменой `fetch`)

**Interfaces:**
- Consumes: сообщение `content` и `GmView.contentVersion` из Task 3; `PlayerView.me.player.present`; `ActionRecord.item`; `OfferClosed.reason === 'left'`.
- Produces: `Connection.retryNow(): void`; `exportUrl`, `hasOwnToken` без изменений; `content` сигнал `ContentData | null`; чистые функции `playerLeft(v: PlayerView): boolean`, `tradesPaused(v: PlayerView): boolean`.

- [ ] **Step 1: Тесты `api.test.ts`**: `send` даёт разные непустые id при `crypto.randomUUID === undefined`; `retryNow()` во время ожидания открывает новый сокет сразу (фиктивный `WebSocketImpl` считает открытия); сообщение `content` вызывает `onContent`.
- [ ] **Step 2: Тест `store.test.ts`**: `auth()` бросает сетевую ошибку → `status === 'auth_failed'`; `retryLogin()` вызывает `auth` снова; проекция ведущего до сообщения `content` не приводит к исключению в `App` (Review Focus 3: проверить функцией выбора экрана, что при `view.kind === 'gm' && content === null` возвращается экран ожидания).
- [ ] **Step 3: Тесты `rules.test.ts`, `labels.test.ts`**: `playerLeft`, `tradesPaused`, подпись «участник ушёл», подпись записи с вещью «Перековка: Защитный талисман».
- [ ] **Step 4: Реализовать** всё по §3.2, §4, §5, §2.5, §7 спецификации. Тексты подтверждений в `Roster.tsx` дословно из §2.5.
- [ ] **Step 5: `pnpm typecheck && pnpm test`**, затем `pnpm e2e` в tmux (`EXIT=0`).
- [ ] **Step 6: Commit** «Этап 7: клиент: повтор входа, переподключение, улики, журнал, присутствие, пауза».

---

### Task 5: Симулятор: содержимое, опоздавший и ушедший, нагрузочный прогон

**Files:**
- Modify: `packages/sim/src/client.ts` (приём `content`, размер), `packages/sim/src/evening.ts` (`content` из сообщения, `sizes.content`, порог ведущего 96 КБ), `packages/sim/src/scenario.ts` (Корвин `o11` опаздывает, Никс `o8` уходит и возвращается, §2.6), `packages/sim/src/checks.ts` (`checkStart` с поздним; `phase` «ведущий отметил» в разрешённых), `packages/sim/src/report.ts` (три размера)
- Create: `packages/sim/src/load.ts` (`runLoad(opts: LoadOptions): Promise<LoadResult>`), `packages/sim/src/load-report.ts`, `packages/sim/src/load-cli.ts`
- Modify: `packages/sim/package.json` (`"load": "tsx src/load-cli.ts"`), `apps/mini-app/package.json` (`"sim:load": "pnpm --filter @fair/sim load"`), `packages/sim/README.md`
- Test: `packages/sim/src/__tests__/evening.test.ts`, `checks.test.ts`, `load.test.ts`

**Interfaces:**
- Consumes: `openBot(baseUrl, userId, code)`, `BotConn`, `playerAction(view, act, mem, rng, roster)`, `answerIncoming(view, rng)`, `startChildServer`, `Rng`.
- Produces: `LoadOptions { baseUrl: string; players: number; seconds: number; intervalMs: number; seed: number; log?: (line: string) => void }`; `LoadResult { ok: boolean; minutes: { minute: number; commands: number; p50: number; p95: number; max: number; player: number; gm: number; rss: number | null }[]; reconnects: number; failures: string[] }`; `renderLoadReport(result, meta)`; CLI `pnpm sim:load -- --players 30 --minutes 10 --seed 1 [--url] [--out ./sim-out]`, отчёт `<out>/load-<players>-<minutes>.md`, код выхода 1 при `!ok`.

- [ ] **Step 1: Тесты сценария**: прогон на 12 в `evening.test.ts` дополнительно ждёт: в журнале `PlayerArrived{o11, startSet:true}` и `PlayerLeft{o8}`, затем `PlayerArrived{o8, startSet:false}`; покрытие полное; `sizes.content > 0`; проекция ведущего меньше 96 КБ на 12 (на 30 порог проверяет прогон CLI).
- [ ] **Step 2: Реализовать** сценарий, `checkStart`, размеры, порог, отчёт.
- [ ] **Step 3: Тест `load.test.ts`**: `runLoad` против `startServer()` с `players: 5, seconds: 15, intervalMs: 1000, seed: 1` → `minutes.length === 1`, `commands > 20`, `reconnects === 0`, `ok === true`; с фиктивным закрытием одного сокета в середине (через `BotConn.close()` из теста) → `reconnects === 1`, `ok === false`, `failures` содержит «переподключение» (Review Focus 5).
- [ ] **Step 4: Реализовать `runLoad`**: ведущий ставит состав `players`, всех отмечает, открывает; боты параллельно (`Promise.all`), каждый цикл: ждать `intervalMs ± 20 %` от `rng`, ответить на входящие, одно действие; задержки из `CmdOutcome.ms`; раз в минуту `GET /api/health` для `rss`; закрытие сокета фиксируется и прогон продолжается без этого бота. Критерии §9.
- [ ] **Step 5: CLI и отчёт**; прогоны: `pnpm sim -- --players 12 --seed 1`, `--players 30 --seed 1`, `--players 30 --seed 7` (код 0, покрытие полное); `pnpm sim:load -- --players 30 --minutes 10 --seed 1` (код 0). Выжимки в отчёт задачи; `pgrep -f "server/src/index.ts"` пуст.
- [ ] **Step 6: `pnpm typecheck && pnpm test`**, зелёные.
- [ ] **Step 7: Commit** «Этап 7: симулятор: опоздавший и ушедший, содержимое отдельно, нагрузочный прогон».

---

### Task 6: Документация

**Files:**
- Modify: `docs/design/gm-runbook.md` (опоздавший, ушедший, «телефон ведущего умер», сделки на паузе, полоса «Нет связи»), `apps/mini-app/DEPLOY.md` (пересдача кода ведущего), `apps/mini-app/README.md` (`pnpm sim:load`, команда на 120 минут, health с памятью), `docs/design/mini-app-spec.md` (§9 присутствие, §13 нагрузка, §16, §17), `docs/superpowers/specs/2026-10-27-live-night-design.md` (статус «реализовано (ветка `live-night`)», раздел 13 с выжимкой нагрузочного прогона из отчёта Task 5)

- [ ] **Step 1: Прочитать** отчёт Task 5 и код пульта (`Roster.tsx`, `App.tsx`) для точных названий кнопок и текстов.
- [ ] **Step 2: Написать** разделы, без ИИ-маркеров (проверка списком из `humanizer-ru`).
- [ ] **Step 3: `pnpm typecheck && pnpm test`** (не меняются, но прогон обязателен перед коммитом).
- [ ] **Step 4: Commit** «Этап 7: памятка и документация подготовки к живому вечеру».
