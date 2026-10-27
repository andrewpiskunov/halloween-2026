# Этап 3 Mini App: способности, вещи, согласие, защита. План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Все 30 способностей ролей и три применяемые вещи срабатывают в приложении по нажатию с проверкой правил на сервере, запросом согласия там, где он нужен, и записью в журнал применений.

**Architecture:** Движок в `@fair/shared` получает три новые группы команд (`ability.use`, `item.use`, `consent.*`) и общий список эффектов, который один редьюсер применяет к состоянию. Способности изготовления и покупки исполняются одной командой вместе с изготовлением и порождают обычные `ItemCrafted`/`IngredientBought`. Запрос согласия повторяет механику сделок: срок 5 минут, резерв, повторная проверка при ответе. Клиент получает всё нужное из проекций и из `@fair/shared` импортирует только типы.

**Tech Stack:** TypeScript, pnpm workspace `apps/mini-app`, vitest, Preact + signals, Fastify + ws, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-27-abilities-design.md`. Все десять открытых вопросов (раздел 8) решены ответами по умолчанию из спецификации.

## Global Constraints

- Общение и документация на русском, идентификаторы в коде на английском. Комментарии в коде на русском, как в соседних файлах.
- Коммиты: `GIT_COMMITTER_NAME="Andrew Piskunov" GIT_COMMITTER_EMAIL="45717261+andrewpiskunov@users.noreply.github.com" git commit --author="Andrew Piskunov <45717261+andrewpiskunov@users.noreply.github.com>" -m "<сообщение>"`. Никаких строк `Co-authored-by`, упоминаний инструментов или автоматического авторства. Не пушить.
- Клиент не импортирует значения из `@fair/shared`, только типы (`client/src/__tests__/type-only.test.ts`). Константы, нужные клиенту, либо копируются с комментарием «копия из engine/…», либо приходят в проекции.
- Редьюсеры детерминированы: не читают `random` и `now`, всё нужное лежит в событии. Проигрывание журнала даёт то же состояние, что и последовательное выполнение (инвариант 6.8.13).
- Ничего не сохранять в Git из токенов, секретов и реальных сессий. `docs/design/game-data-v0.2.json` не менять: вид механики живёт в коде.
- Перед заявлением «готово» в каждой задаче: `pnpm typecheck` и `pnpm test` из `apps/mini-app` зелёные. Dev-серверы и e2e только в tmux (хук блокирует строки запуска dev-сервера в Bash).
- Хелперы тестов движка: `apps/mini-app/packages/shared/src/__tests__/helpers.ts` (`content`, `gm`, `system`, `player(key)`, `newGame()`, `makeGame(n, { present? })`, `run(state, cmd, actor, now?)`). `makeGame(30)` даёт состав со всеми 30 ролями (позиции 1–20, торговый дом `t1`–`t4`, резерв `r1`–`r6`), `makeGame(12)` только ядро. В `run` `random` всегда `0.5`, `newId` даёт `id1`, `id2`, …
- Ключи ролей и виды из таблицы 2.2 спецификации. Числа: срок запроса 300000 мс, облик 1–40 символов, вопрос Весты до 200 символов, выкуп и цены мастерской не меняются.

## Review Focus

1. Команда `ability.use` с `use`, у которого `kind` не совпадает с ролью автора (или вложенный `copy.kind === 'copyAbility'`): ожидается `forbidden`, без исключения. Тест в задаче 2 (`abilities-workshop.test.ts`, тест «чужой вид») и задаче 5 (копия копии).
2. Враждебная попытка по цели, у которой есть защита и одновременно нечего взять: ожидается блокировка (защита снята, попытка и применение потрачены), а не отказ. Тест в задаче 3.
3. Согласие после смены акта или после того, как вещь исчезла исправлением ведущего: ожидается `ConsentClosed` со статусом `expired`/`failed`, резерв снят, применение не потрачено. Тесты в задаче 5.
4. Проигрывание журнала с `AbilityUsed`, у которого `effects` содержит `itemCreated` и `goldMove`: состояние после replay равно состоянию после команд (инвариант 13). Сценарный тест в задаче 6.
5. Сообщение по WS `ability.use` с `use`, равным строке, числу или объекту без `kind`: движок отвечает `invalid`, сервер не падает. Тест в задаче 6 (`ws.test.ts`).

---

### Task 1: Типы, каталог способностей, эффекты, состояние

**Files:**
- Create: `apps/mini-app/packages/shared/src/abilities.ts`
- Create: `apps/mini-app/packages/shared/src/engine/effects.ts`
- Modify: `apps/mini-app/packages/shared/src/types.ts` (`Player`, `GameState`, новые типы `Effect`, `Intel`, `ActionRecord`, `ConsentRequest`, `ConsentStatus`, `ConsentAction`)
- Modify: `apps/mini-app/packages/shared/src/commands.ts` (`AbilityUse`, шесть новых команд, новые поля `Correction`)
- Modify: `apps/mini-app/packages/shared/src/events.ts` (`AbilityUsed`, `ItemUsed`, `ConsentRequested`, `ConsentGiven`, `ConsentClosed`; `ItemCrafted.viaAbility?`, `IngredientBought.fromBank?`)
- Modify: `apps/mini-app/packages/shared/src/engine/session.ts` (`emptyState`, `emptyPlayer`, `CURSED_AT_START`, `FairOpened`)
- Modify: `apps/mini-app/packages/shared/src/engine/acts.ts` (`ActStarted`, `ClockResumed`)
- Modify: `apps/mini-app/packages/shared/src/engine/shop.ts` (редьюсеры `ItemCrafted`, `IngredientBought`)
- Modify: `apps/mini-app/packages/shared/src/index.ts` (экспорт `abilities.ts`)
- Test: `apps/mini-app/packages/shared/src/__tests__/abilities-catalog.test.ts`, `effects.test.ts`

**Interfaces:**
- Produces: типы из спецификации §4.5, §6.1–6.5 дословно: `AbilityKind`, `CopyableKind`, `TargetMode`, `AbilitySpec`, `ABILITY_BY_ROLE`, `ABILITY_SPECS`, `COPY_SOURCES` (`abilities.ts`); `AbilityUse`, `Command` с `ability.use`, `item.use`, `consent.accept/decline/cancel/expire`, `Correction` с полями `protection | thorns | curse | discount | abilityUsed | hostileAttempt | guise` (`commands.ts`); `Effect`, `Intel`, `ActionRecord`, `ConsentStatus`, `ConsentAction`, `ConsentRequest`, новые поля `Player` (`abilityPending?`, `protection?: { by; source: 'ability' | 'ward' | 'gm' }`, `thornsBy?`, `discountBy?`, `guise?`), `GameState.requests`, `GameState.actions` (`types.ts`); события §6.4 (`events.ts`).
- Produces: `applyEffects(state: GameState, effects: Effect[]): GameState` и `recordAction(state: GameState, e: AbilityUsed | ItemUsed, act: 1 | 2 | 3): GameState` в `engine/effects.ts`. `recordAction` добавляет `ActionRecord` с `id = String(e.seq ?? state.seq + 1)` (то же правило, что в `reduce`), `act` из `state.phase`.
- Produces: `CURSED_AT_START: string[] = ['o9']` экспортируется из `engine/session.ts`.

- [ ] **Step 1: Тест каталога** в `abilities-catalog.test.ts`:
  - `ABILITY_BY_ROLE` имеет ключи ровно `content.roles.map(r => r.key)` (30 штук, без лишних);
  - каждое значение входит в `Object.keys(ABILITY_SPECS)` (25 видов);
  - `ABILITY_SPECS[k].hostile === true` ровно для `stealGold`, `stealIngredient`, `thorns`; `verbal === true` только у `askYesNo`;
  - `COPY_SOURCES` равен `{ grow: 'o2', substituteIngredient: 'o6', discountOther: 'o14' }`;
  - `CURSED_AT_START` равен ключам ролей, у которых `extra` содержит подстроку «проклят» (регистр не важен).
- [ ] **Step 2: Тест эффектов** в `effects.test.ts` на `makeGame(12)`: `applyEffects` с `gold −2` у `o1`, `goldMove 1 o1→o6`, `ingredient dew +1`, `ingredientMove ash o6→o1`, `workshop moon −1`, `itemRemoved` (вещь `o1`), `itemCreated` (новая вещь `o6`), `protection` (`{ by: 'o9', source: 'ability' }` и `null`), `protectionMoved o1→o6`, `thorns true by o12`, `curse true`, `discount true by o14`, `guise { name, at, by }` и `null`. Проверить каждое поле; `applyEffects` с пустым списком возвращает тот же объект. `recordAction` ставит `id`, равный `String(state.seq + 1)` при `seq` в событии `undefined`, и копирует `author`, `target`, `outcome`, `hostile`, `effects`, `intel`, `removed`, `guise`, `requestId`.
- [ ] **Step 3: Запустить тесты, убедиться, что падают** (`pnpm --filter @fair/shared test` из `apps/mini-app`): ошибка импорта `../abilities` и `../engine/effects`.
- [ ] **Step 4: Реализовать** `abilities.ts` (таблица 2.2: `place: 'workshop'` у `payAshWithGold`, `focusFree`, `substituteIngredient`, `buyCheap`, `buyBulk`, `buyFromBank`, `grow`, `swapIngredient`, `disassemble`, `reforge`, `sellToBank`; остальные `'role'`; `target` по столбцу «Цель»: `none` у `protectSelf`, `focusFree`, `sniffIngredient` и всех «себя»; `self` не используется; `other` у видов «другой присутствующий»; `any` у `discountOther`; `protectedAndOther` у `transferProtection`; `consent: true` у `cleanseOther`, `discountOther`, `transferProtection`, `copyAbility`), типы в `types.ts`, `commands.ts`, `events.ts`, `engine/effects.ts`. Удалить `Player.pendingModifier` везде (`types.ts`, `session.ts`, `acts.ts`).
- [ ] **Step 5: Состояние и редьюсеры.** `emptyState` получает `requests: {}`, `actions: []`. `FairOpened` в `session.ts`: `curse: true` у присутствующих из `CURSED_AT_START`. `ActStarted`: дополнительно сбрасывает `abilityPending`, `thornsBy`, `discountBy`, `protection`, `discount`, `thorns`, `hostileAttemptsAgainstInAct`, закрывает `pending` запросы как `expired` с `reason: 'act'` и снимает `reservedFor` у вещей этих запросов; `offers` и `requests` сдвигаются на `pausedMs`. `ClockResumed`: сдвигает `expiresAt` у `pending` запросов (расширить `shiftPending` или добавить `shiftRequests`). `ItemCrafted`: `thorns: p.thorns && !e.clearedThorns`, `discount: p.discount && !e.clearedDiscount`. `IngredientBought`: при `e.fromBank === true` запас не уменьшается. Добавить тест в `acts.test.ts`: после `act.next` проклятие Эльмара (`o9`) сохраняется, защита и шипы нет; после `session.open` на `makeGame(12)` `players.o9.curse === true`, у остальных `false`.
- [ ] **Step 6: Тесты и typecheck зелёные**: `pnpm typecheck && pnpm test` из `apps/mini-app` (сервер и клиент тоже компилируются: `ws.ts` требует полноты `COMMAND_TYPES`, поэтому добавить шесть новых типов в `COMMAND_TYPES` уже в этой задаче, с `true`).
- [ ] **Step 7: Commit** «Этап 3, основа: каталог способностей, эффекты, запросы согласия в состоянии».

### Task 2: Способности мастерской: изготовление, покупка, обмен с запасом, превращение изделий

**Files:**
- Create: `apps/mini-app/packages/shared/src/engine/abilities.ts` (команда `ability.use`, редьюсер `AbilityUsed`)
- Modify: `apps/mini-app/packages/shared/src/engine/shop.ts` (вынести `craftQuote`)
- Modify: `apps/mini-app/packages/shared/src/engine/index.ts` (подключить `abilityCommands`, `abilityReducers`)
- Test: `apps/mini-app/packages/shared/src/__tests__/abilities-workshop.test.ts`

**Interfaces:**
- Consumes: каталог и типы задачи 1; `available`, `INGREDIENTS` из `engine/bundles.ts`; `participant`, `isActPhase` из `engine/guards.ts`.
- Produces: `craftQuote(state, key, recipe, mod?: { ashByGold?: boolean; freeWork?: boolean; substitute?: { from: Ingredient; to: Ingredient } }): { paidGold: number; paidIngredients: Partial<Counts>; clearedThorns: boolean; clearedDiscount: boolean } | { error: ErrorCode; detail: string }` в `shop.ts`; `shop.craft` использует её без `mod`. Правило цены: `base = recipe.gold + (ashByGold ? 1 : 0) − (freeWork ? 1 : 0)`; `paidGold = max(0, base + thorns − discount)`; `clearedDiscount = discount && base + thorns > 0`; `clearedThorns = thorns`.
- Produces: `abilityCommands['ability.use']` с общими проверками §5.3 шаги 1–5 (функция `checkCommon(state, ctx, use): { author: string } | Result`), реализованная для 11 видов `place: 'workshop'`; остальные виды в этой задаче возвращают `fail('invalid', 'вид ещё не реализован')`. Редьюсер `AbilityUsed`: `applyEffects` + `abilityUsedInAct = true` автору + `recordAction`; для `hostile` и `blocked` логику добавит задача 3. Экспортировать `KIND_BY_RECIPE` из `shop.ts` для `reforge`.
- События одной команды: `AbilityUsed` (effects пусты для изготовления и покупки), затем `ItemCrafted` с `viaAbility` или `IngredientBought` (`buyBulk` с разными ингредиентами: два `IngredientBought`, `paidGold` 2 и 1; одинаковые: один с `count: 2`, `paidGold: 3`; `buyFromBank`: `fromBank: true`, `paidGold: 2`). `grow`, `swapIngredient`, `disassemble`, `reforge`, `sellToBank` целиком через `effects`: `ingredient`/`workshop`/`itemRemoved`/`itemCreated`/`gold`.

- [ ] **Step 1: Тесты** в `abilities-workshop.test.ts` на `makeGame(30)` (у всех по 6 золота и 3 ингредиента по `bundle` роли; при необходимости `gm.correct` добавляет ингредиенты). По одному тесту на вид, в каждом успех и один отказ без расхода (`abilityUsedInAct` остаётся `false`, `actions` пуст):
  - `payAshWithGold` (`o1`, рецепт `cleanse`): списан на один Пепел меньше, `paidGold` на 1 больше базы; отказ `invalid` на рецепте без Пепла (`ward`).
  - `focusFree` (`o5`): `paidGold 0`, `clearedDiscount false` при выданной исправлением скидке и `discount` остаётся `true`; с шипами `paidGold 1`.
  - `substituteIngredient` (`o6`, `cleanse`, `from` из рецепта, `to` другой): `paidIngredients` содержит `to` вместо `from`; отказ `invalid` при `to === from`.
  - `buyCheap` (`o3`): золото −1, запас −1; отказ `insufficient` при пустом запасе.
  - `buyBulk` (`o7`): разные → два события по 2 и 1; одинаковые → одно с `count 2`; отказ при запасе 1 на двойной.
  - `buyFromBank` (`n19`): запас не изменился, золото −2, `fromBank: true`.
  - `grow` (`o2`): отдал Росу, получил две: ингредиент `dew` +1 итого, запас `dew` −1 итого; отказ при запасе Росы < 2.
  - `swapIngredient` (`n18`): отказ при `take === give`.
  - `disassemble` (`o13`): вещь исчезла, два ингредиента из запаса; отказ на реликвии `invalid`.
  - `reforge` (`n20`): новая вещь другого вида с `createdBy: 'n20'`, золото −1; отказ `into: 'shape'` и исходный `shape`.
  - `sellToBank` (`t1`): вещь исчезла, золото +2.
  - Общее: повтор в том же акте → `limit`; после `act.next` снова `ok`; `use.kind` не роли автора → `forbidden`; в `setup` → `phase`; вещь в резерве сделки → `reserved`.
- [ ] **Step 2: Запустить, убедиться, что падают.**
- [ ] **Step 3: Реализовать** `craftQuote`, `engine/abilities.ts`, подключить в `index.ts`.
- [ ] **Step 4: Все тесты и typecheck зелёные.**
- [ ] **Step 5: Commit** «Этап 3: способности мастерской».

### Task 3: Защита, враждебные действия, талисман

**Files:**
- Modify: `apps/mini-app/packages/shared/src/engine/abilities.ts` (виды `protectSelf`, `protectOther`, `stealGold`, `stealIngredient`, `thorns`; порядок §5.3 шаги 6–10)
- Create: `apps/mini-app/packages/shared/src/engine/items.ts` (команда `item.use`, редьюсер `ItemUsed`; в этой задаче только `ward`, зелье и Камень в задаче 5)
- Modify: `apps/mini-app/packages/shared/src/engine/index.ts`
- Test: `apps/mini-app/packages/shared/src/__tests__/abilities-hostile.test.ts`, `items.test.ts`

**Interfaces:**
- Consumes: `checkCommon`, редьюсер `AbilityUsed` из задачи 2.
- Produces: `hostileCheck(state, author, target): Result | undefined` (шаги 7–8; возвращает событие блокировки `AbilityUsed { outcome: 'blocked', hostile: true, effects: [{ type: 'protection', player: target, value: null }] }`); редьюсер `AbilityUsed` при `hostile` ставит `hostileAttemptsAgainstInAct = 1` цели. `item.use` с общими проверками §3 и `ward` (§3.2). Экспорт `usableItem(state, author, itemId): Item | ErrorCode`.

- [ ] **Step 1: Тесты** `abilities-hostile.test.ts` на `makeGame(30)`:
  - Туман (`o4`) `protectSelf` → `protection { by: 'o4', source: 'ability' }`; повтор при защите → `limit` (применение уже), новая защита Эльмара (`o9`, `protectOther`) на Тумана → `invalid`/`limit` «защита уже есть».
  - Никс (`o8`) `stealGold` на Брама (`o2`): золото 6→5 у цели, 6→7 у автора, `hostileAttemptsAgainstInAct` цели 1, запись `hostile: true, outcome: 'done'`; Долф (`r4`) на того же Брама в том же акте → `limit`.
  - Брам с защитой от Эльмара: кража Никса → событие `blocked`, защита снята, золото обоих не изменилось, `abilityUsedInAct` Никса `true`, попытка цели 1; при этом у Брама доступное золото 0 (всё в резерве сделки) → всё равно `blocked` (Review Focus 2).
  - Брам без защиты и с золотом в резерве сделки (6 из 6): кража → `insufficient`, применение и попытка не потрачены.
  - Сцилла (`t4`) `stealIngredient` `ash` у цели без Пепла → `insufficient`; с Пеплом → перенос, `ingredientMove`.
  - Ива (`o12`) `thorns` на Грету: `thorns true, thornsBy 'o12'`; повтор другой ролью невозможен (лимит цели); шипы на цель с шипами → `invalid` (проверить через `gm.correct thorns true` на другой цели).
  - Смена акта снимает защиту, шипы, попытки; проклятие остаётся.
- [ ] **Step 2: Тесты** `items.test.ts`: талисман (`item.use` вещи `ward`, изготовленной `shop.craft`) → вещи нет, `protection { by: author, source: 'ward' }`, запись `source.type 'item'`; при активной защите → `limit`; Фокус → `invalid`; чужая вещь → `not_owner`; вещь в резерве сделки → `reserved`; `target` другой для `ward` → `invalid`.
- [ ] **Step 3: Падают → реализовать → зелёные.**
- [ ] **Step 4: Commit** «Этап 3: защита, враждебные действия, талисман».

### Task 4: Наблюдение и `Intel`

**Files:**
- Modify: `apps/mini-app/packages/shared/src/engine/abilities.ts` (виды `inspectInventory`, `sniffIngredient`, `knowGold`, `askSide`, `askYesNo`)
- Test: `apps/mini-app/packages/shared/src/__tests__/abilities-intel.test.ts`

**Interfaces:**
- Produces: `buildIntel(state, content, use, author): Intel` ; `AbilityUsed.intel` заполнен, `effects` пусты, `hostile: false`. Правила: снимок без вещей с `hiddenUntilAct` в `act1`/`act2`; `sniff.holders` присутствующие, кроме автора, с `ingredients[x] >= 1`; `side` для несвободных `role.side`, для свободных `player.side ?? 'free'`; `question` обрезан до 200 символов, пустой превращается в `undefined`.

- [ ] **Step 1: Тесты** на `makeGame(30)`: Корвин (`o11`) на Лиру (`o14`, скрытый V) в акте I: `intel.items` без осколка V, в акте III с ним; на себя → `invalid`. Сив (`o15`) `sniff dew`: список без `o15`, без отсутствующих (`present: false` через `makeGame(30, { present: … })`), включает тех, у кого Роса. Торвин (`t2`) `knowGold`: `gold` цели целиком, включая резерв сделки. Марта (`r2`) на несвободного: `side` роли; на свободного без выбора: `'free'`. Веста (`r5`) с вопросом из 300 символов: сохранён обрезанный до 200; цель в записи, `effects` пусты. Каждая наблюдательная способность не меняет `hostileAttemptsAgainstInAct` цели и не блокируется защитой.
- [ ] **Step 2: Падают → реализовать → зелёные.**
- [ ] **Step 3: Commit** «Этап 3: наблюдательные способности».

### Task 5: Согласие и всё, что на нём стоит

**Files:**
- Create: `apps/mini-app/packages/shared/src/engine/consent.ts` (команды `consent.accept/decline/cancel/expire`, редьюсеры `ConsentRequested`, `ConsentGiven`, `ConsentClosed`; функция `performConsented(state, content, req, ctx): Result`)
- Modify: `apps/mini-app/packages/shared/src/engine/abilities.ts` (виды `cleanseOther`, `discountOther`, `transferProtection`, `copyAbility`; создание запроса, когда нужно согласие)
- Modify: `apps/mini-app/packages/shared/src/engine/items.ts` (зелье и Камень на себя и на другого)
- Modify: `apps/mini-app/packages/shared/src/engine/index.ts`
- Test: `apps/mini-app/packages/shared/src/__tests__/consent.test.ts`, дополнить `items.test.ts`

**Interfaces:**
- Consumes: `checkCommon`, `hostileCheck`, `usableItem`, `craftQuote` (копия `substituteIngredient`), реализация `grow`/`substituteIngredient`/`discountOther` как функции `performAbility(state, content, author, use, ctx, requestId?): Result`, которую вызывает и прямое применение, и `performConsented`.
- Produces: `needsConsent(state, author, use): string[]` (список одобряющих: пуст, если согласие не нужно; §4.1; владелец оригинала при копии только если `participant`); `ConsentRequest` жизненный цикл §4.2; `abilityPending` на авторе на время запроса; `reservedFor = request.id` у вещи; `ConsentClosed` снимает оба резерва; `AbilityUsed`/`ItemUsed` с `requestId` ставит запросу `accepted`.
- Правила эффектов: `cleanseOther` и зелье → `effects` `curse false`, `thorns false` только для отметок, которые были, и `removed` с фактом; `discountOther` → `discount true by author`; `transferProtection` → `protectionMoved`; Камень → `itemRemoved` + `guise`.

- [ ] **Step 1: Тесты** `consent.test.ts` на `makeGame(30)`:
  - Ада (`o10`) на Эльмара (`o9`): `ConsentRequested` с `approvers ['o9']`, `expiresAt = now + 300000`, у Ады `abilityPending === id`, применение не потрачено; второе `ability.use` Ады → `limit`; `consent.accept` от Эльмара → `ConsentGiven` + `AbilityUsed { removed: { curse: true, thorns: false }, requestId }`, `curse` снят, применение потрачено, статус `accepted`; `consent.accept` от третьего → `forbidden`.
  - `decline` → `declined`, `abilityPending` снят, применение свободно; `cancel` автором; `cancel` ведущим (`reason 'gm'`); `expire` от `system` после срока и `invalid` до; на паузе `phase`; после `clock.resume` срок сдвинут; `act.next` закрывает как `expired` `reason 'act'`.
  - `failed`: Лира (`o14`) просит скидку Грете, ведущий ставит Грете `discount` исправлением, Грета соглашается → `ConsentClosed { status: 'failed' }`, применение Лиры не потрачено. Клёпа (`o16`) переносит защиту Эльмара на Серафину, Серафина получает защиту от Йорика (`t3`) до ответа → `failed`.
  - Клёпа переносит свою защиту (Туман дал? нет: Клёпа сама без защиты; использовать защиту от Эльмара на Клёпе) без запроса: сразу `AbilityUsed` с `protectionMoved`, `by` сохраняется.
  - Лира на себя: без запроса, `discount true`. Лира на цель со скидкой → `invalid`.
  - Астра (`o17`): копия `grow` → запрос к Браму; Брам отсутствует (`makeGame(30, { present: без o2 })`) → без запроса, сразу исполнено, применение Брама не тронуто; копия `discountOther` на Грету → `approvers ['o14', 'o6']`, одно согласие не исполняет, второе исполняет; отказ одного закрывает; `copy.kind: 'copyAbility'` → `forbidden`.
  - Инвариант 8 и 9 после каждого шага (`checkInvariants` из задачи 6 можно добавить здесь в `helpers.ts` в минимальном виде: запросы/резервы/`abilityPending`).
- [ ] **Step 2: Тесты** в `items.test.ts`: зелье на себя (Эльмар с проклятием: `removed.curse true`; Серафина без отметок: `removed` оба `false`, зелье исчезло); зелье на другого: запрос, вещь `reservedFor`, нельзя предложить в сделке (`reserved`) и вложить на алтарь; согласие → `ItemUsed`; отказ → вещь свободна. Камень: `guise` пустой → `invalid`, 41 символ → `invalid`, на себя → `guise { name, by }` у автора, на другого через запрос; новый Камень заменяет облик.
- [ ] **Step 3: Падают → реализовать → зелёные.**
- [ ] **Step 4: Commit** «Этап 3: согласие, очищение, скидка, перенос защиты, копия, зелье и Камень».

### Task 6: Проекции, исправления ведущего, сервер, сценарный тест

**Files:**
- Modify: `apps/mini-app/packages/shared/src/views.ts` (`AbilityView`, `ConsentRequestView`, `PlayerView.me.ability`, `others[].guise`, `requests`, `actions`, `GmView.abilities`)
- Modify: `apps/mini-app/packages/shared/src/engine/acts.ts` (`gm.correct` новые поля §6.7)
- Modify: `apps/mini-app/packages/server/src/ws.ts` (`KEY_FIELDS` + `target`, `TEXT_FIELDS` + `question`, `guise`), `apps/mini-app/packages/server/src/game.ts` (`tick` истекает запросы)
- Modify: `apps/mini-app/packages/shared/src/__tests__/helpers.ts` (`checkInvariants(state)` по §6.8, пункты 1–12)
- Test: `apps/mini-app/packages/shared/src/__tests__/views.test.ts` (дополнить), `scenario-act.test.ts`, `acts.test.ts` (исправления), `apps/mini-app/packages/server/src/__tests__/ws.test.ts`, `game.test.ts`

**Interfaces:**
- Produces: проекции по §6.6 дословно. `AbilityView.state`: `'closed'` вне актов, `'pending'` при `abilityPending`, `'used'` при `abilityUsedInAct`, иначе `'available'`. `actions` для игрока: записи, где он `author | target | from | to`; `intel` только у автора; `question` только у автора. `requests`: где он `author` или в `approvers`; `action.item` без `itemId`. `others[].guise` для всех. `GmView.abilities` по всем ролям содержимого.
- `gm.correct`: проверки §6.7; редьюсер `Corrected` через `applyEffects` для булевых полей и облика; `abilityUsed`/`hostileAttempt` правят поля напрямую.

- [ ] **Step 1: Тесты проекций**: игрок видит `me.ability` с `state 'available'` в акте и `'closed'` в `setup`; Астра видит `copy` из трёх с `owner null` для отсутствующего владельца; цель кражи видит запись без `intel`; автор Корвина видит `intel`; третий игрок не видит записи; `requests` у автора и одобряющего, нет у третьего; `others[].guise` у всех после Камня; `GmView.abilities.o8.hostile === true`.
- [ ] **Step 2: Тесты исправлений**: каждое новое поле ставит и снимает; вторая защита → `invalid`; снять отсутствующую → `invalid`; `abilityUsed false` при `abilityPending` → `invalid`; `guise` 41 символ → `invalid`; исправления не добавляют `actions`.
- [ ] **Step 3: Сценарный тест** `scenario-act.test.ts`: `makeGame(30)`, в акте I каждая из 30 ролей применяет способность (цели подобраны так, чтобы большинство прошло; для согласий сразу `consent.accept`), после каждой команды `checkInvariants`; в конце replay всех событий с `initialState` даёт `toEqual` состояние (инвариант 13, Review Focus 4). Затем `act.next` и инвариант 10.
- [ ] **Step 4: Серверные тесты**: `ws.test.ts` — `ability.use` с `use: 'мусор'`, с `use: {}` и с `guise` длиной 2000 → ответ `result ok:false` с `invalid`, сокет жив (Review Focus 5); `game.test.ts` — `tick()` закрывает просроченный запрос, на паузе нет; повтор `cmdId` для `ability.use` не применяет второй раз.
- [ ] **Step 5: Падают → реализовать → зелёные** (`pnpm typecheck && pnpm test`).
- [ ] **Step 6: Commit** «Этап 3: проекции, исправления ведущего, сервер, сценарий акта».

### Task 7: Клиент игрока: способность, вещи, мастерская, просьбы, уведомления

**Files:**
- Modify: `apps/mini-app/packages/client/src/screens/Role.tsx` (карточка способности и формы §7.1, «Что вы узнали», «Ваши применения», строка облика)
- Create: `apps/mini-app/packages/client/src/screens/AbilityForm.tsx` (формы по видам из таблицы §7.1)
- Modify: `apps/mini-app/packages/client/src/screens/Bag.tsx` («Использовать» §7.2, «обещано в просьбе», блок «На вас действует»)
- Modify: `apps/mini-app/packages/client/src/screens/Workshop.tsx` (кнопки способностей §7.3; `craftPrice(r, v, mod?)` по правилу `craftQuote`)
- Modify: `apps/mini-app/packages/client/src/screens/Trades.tsx` (блок «Просьбы» §7.4)
- Modify: `apps/mini-app/packages/client/src/store.ts` (`abilityDraft`, слежение за новыми `actions`/`requests` для toast §7.5), `App.tsx` и `components/Tabs.tsx` (бейджи: число у «Сделки», точка у «Роль» и «Сумка»)
- Modify: `apps/mini-app/packages/client/src/labels.ts` (`roleName` с обликом «облик (имя)», `abilityText(kind, …)` для описаний просьб и записей), `rules.ts` (`canUseItem(item, v)`, `abilityTargets(v)`, `remainingMs` вместо `offerRemainingMs`)
- Modify: `apps/mini-app/packages/client/src/styles.css`
- Test: `apps/mini-app/packages/client/src/__tests__/rules.test.ts`, `labels.test.ts`

**Interfaces:**
- Consumes: `PlayerView.me.ability`, `requests`, `actions`, `others[].guise` (типы из `@fair/shared`).
- Produces: `canUseItem(item: Item, v: PlayerView): { ok: true } | { ok: false; why: string }` (Фокус, реликвии, осколки, улики → нет; резерв → «обещано»; талисман при защите → «Защита уже есть»); `abilityTargets(v): { roleKey: string; label: string }[]` (с обликом, без себя для `other`, «Себе» первым для `any`); `actionText(a: ActionRecord, v): string` для toast и списков по §7.5; `remainingMs(until, clock, now)`; константа `GUISE_MAX = 40` (копия).

- [ ] **Step 1: Тесты** `rules.test.ts`: `canUseItem` для Фокуса, реликвии, талисмана при защите, вещи в резерве, зелья; `abilityTargets` для `other` без себя и для `any` с «Себе» первым; `labels.test.ts`: `roleName` с обликом даёт «Человек по имени Сивер (Сив)»; `actionText` для кражи, блокировки, защиты, очищения, Весты.
- [ ] **Step 2: Падают → реализовать экраны** по §7.1–7.5. Подтверждения через `ask()`; тексты из таблицы §7.1 и §7.2; отказы сервера показываются как сейчас (`detail`).
- [ ] **Step 3: Ручной прогон** в tmux (сервер `DB_PATH=:memory: ALLOW_DEV_AUTH=1 SESSION_SECRET=dev PORT=8090`, клиент vite 5180, коды из `GET /api/dev/codes`; состав 17, все пришли) через Playwright MCP на ширине 390: Никс крадёт у Брама с защитой от Эльмара (toast блокировки у Брама), Ада просит Эльмара и тот соглашается, Сив применяет Камень к себе и его облик виден Грете в списке целей сделки. Скриншоты только в `.playwright-mcp/` репозитория, удалить перед коммитом.
- [ ] **Step 4: `pnpm typecheck && pnpm test` зелёные; commit** «Этап 3: экраны игрока: способности, вещи, просьбы, уведомления».

### Task 8: Пульт ведущего, e2e, документация

**Files:**
- Modify: `apps/mini-app/packages/client/src/screens/gm/Console.tsx` (блок «Способности и вещи» §7.6: журнал применений с фильтрами, открытые просьбы с «Отменить», таблица отметок, новые поля формы исправления)
- Modify: `apps/mini-app/packages/client/src/styles.css`
- Modify: `apps/mini-app/e2e/trade.spec.ts` (шаг 9: Серафина применяет способность «Дыхание крови» в мастерской или Грета активирует изготовленный талисман, затем ведущий видит запись в журнале применений)
- Modify: `docs/design/mini-app-spec.md` (раздел 6.5 и 8: просьбы во вкладке «Сделки», `pendingModifier` удалён, ответ Марты даёт сервер, новые поля `gm.correct`), `docs/superpowers/specs/2026-10-27-abilities-design.md` (статус «реализовано», ответы на вопросы 8 зафиксированы как принятые по умолчанию)
- Test: `apps/mini-app/packages/client/src/__tests__/gm-actions.test.ts` (чистые функции фильтра журнала и строки записи для пульта)

- [ ] **Step 1: Тест** `gm-actions.test.ts`: `actionLine(a, v: GmView)` даёт «Акт II, 12:40. Никс → Брам: Ловкая рука, 1 золото» и «… Шипы отражены защитой (от Эльмара)»; фильтр «только враждебные» и по игроку.
- [ ] **Step 2: Реализовать блок пульта и форму исправлений.**
- [ ] **Step 3: e2e** в tmux: `tmux new-session -d -s fair-e2e "cd apps/mini-app && pnpm e2e > <scratchpad>/e2e-abilities.log 2>&1; echo EXIT=\$? >> …"`, ждать `EXIT=0`.
- [ ] **Step 4: Документация, `pnpm typecheck && pnpm test`, commit** «Этап 3: пульт ведущего, e2e, документация».
