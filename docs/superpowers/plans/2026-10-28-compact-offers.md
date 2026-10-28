# Уплотнение закрытых предложений: план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** состояние движка перестаёт копить закрытые предложения обмена, задержка сервера не растёт с длиной вечера; двухчасовой нагрузочный прогон проходит критерии.

**Architecture:** уплотнение в редьюсерах `OfferAccepted`/`OfferClosed` (`packages/shared/src/engine/offers.ts`), общая константа `CLOSED_OFFERS_KEPT`, проверка `replay` симулятора сравнивает предложения как подмножество, скрипт замера `pnpm sim:bench`.

**Tech Stack:** TypeScript, vitest, `@fair/shared` (чистый движок), `@fair/sim` (tsx).

**Spec:** `docs/superpowers/specs/2026-10-28-compact-offers-design.md`

## Global Constraints

- Русский язык в комментариях, текстах и документации; английские идентификаторы.
- Коммиты с автором и коммитером `Andrew Piskunov <45717261+andrewpiskunov@users.noreply.github.com>`, без упоминаний инструментов и `Co-authored-by`.
- Детерминизм: уплотнение зависит только от состояния; никакого `Math.random`, никакого `Date.now` в движке.
- Не изменять `docs/design/game-data-v0.2.json` и `docs/references`.
- Тесты до изменений: shared 410, client 76, server 56, sim 68. После: не меньше.

## Review Focus

1. Предложение, закрытое сменой участника (`reason: 'left'`), уплотняется по тому же правилу, что и остальные: тест в задаче 1 («ушедший: закрытые предложения тоже уплотняются»).
2. Воспроизведение журнала после 25 закрытых даёт то же состояние, что живая игра: тест в задаче 1 («replay после уплотнения»).
3. Игрок с одним закрытым предложением не теряет его из-за активности других пар: тест в задаче 1 («двадцатка считается на участника»).
4. `checkReplay` краснеет, когда в журнале есть предложение, которого нет в накопленном: тест в задаче 1 (sim).
5. Прогон на 30 игроков сохраняет полное покрытие способностей и исход: шаг прогона в задаче 1.

---

### Task 1: Уплотнение в движке, проверка `replay`, замер

**Files:**
- Modify: `packages/shared/src/engine/offers.ts` (редьюсеры `OfferAccepted`, `OfferClosed`; новая `compactOffers`, константа `CLOSED_OFFERS_KEPT = 20`)
- Modify: `packages/shared/src/views.ts` (`PLAYER_CLOSED_OFFERS` становится реэкспортом/псевдонимом `CLOSED_OFFERS_KEPT`)
- Modify: `packages/shared/src/engine/index.ts` или `packages/shared/src/index.ts` (экспорт константы, если нужен симулятору)
- Modify: `packages/sim/src/checks.ts` (`checkReplay`: предложения как подмножество)
- Create: `packages/sim/src/bench-views.ts`; Modify: `packages/sim/package.json` (`"bench": "tsx src/bench-views.ts"`), `apps/mini-app/package.json` (`"sim:bench": "pnpm --filter @fair/sim bench"`)
- Test: `packages/shared/src/__tests__/offers-compact.test.ts` (новый), `packages/sim/src/__tests__/checks.test.ts` (существующий, найти через `find packages/sim -name "checks*.test.ts"`)

**Interfaces:**
- Produces: `export const CLOSED_OFFERS_KEPT = 20` и `export function compactOffers(state: GameState): GameState` в `engine/offers.ts`. `compactOffers` оставляет все `pending`; закрытое остаётся, если входит в `CLOSED_OFFERS_KEPT` самых новых закрытых (по `createdAt` убыв., при равенстве `id` возр.) у `from` или у `to`. Возвращает тот же объект `state`, если удалять нечего.
- Consumes: редьюсеры в `offers.ts` (строки около 192–209), `offersFor` в `views.ts`, `checkReplay(final, replayed?, accumulated?, replayedFull?)` в `checks.ts`.

- [ ] **Step 1: Тесты движка (красные)** в `offers-compact.test.ts`, по образцу соседних тестов (`__tests__/offers*.test.ts` или `views*.test.ts`: как они строят состояние и прогоняют команды):
  - «после 25 закрытых между A и B в состоянии 20 самых новых, ожидающие остаются»: создать 25 предложений A→B, закрыть все (`offer.decline` адресатом), создать ещё одно ожидающее; `Object.values(state.offers).filter(o => o.status !== 'pending').length === 20`, самые старые 5 id отсутствуют, ожидающее присутствует.
  - «двадцатка считается на участника»: A→B 20 закрытых, затем одно закрытое A→C, затем ещё 5 закрытых A→B. Предложение A→C остаётся (у C оно единственное), хотя у A оно вышло из двадцатки.
  - «ушедший: закрытые предложения тоже уплотняются»: 21 ожидающее A→B, затем `player.setPresent {present:false}` для B в акте: все 21 закрыты с `reason: 'left'`, в состоянии остаются 20.
  - «replay после уплотнения»: собрать события тех же команд, применить `reduce` с нуля, `expect(replayed).toEqual(live)`.
  - «offersFor не меняется»: для состояния из первого теста `offersFor(state, 'A')` даёт 20 закрытых + ожидающее в том же порядке, что до уплотнения (сравнить с результатом `offersFor` на неуплотнённом состоянии, полученном прямым применением редьюсеров без `compactOffers`; проще: проверить длины и множества id).
- [ ] **Step 2: Запустить `pnpm --filter @fair/shared test -- offers-compact`**, ожидание: падает (функции нет).
- [ ] **Step 3: Реализовать** `CLOSED_OFFERS_KEPT`, `compactOffers` и вызвать её в конце редьюсеров `OfferAccepted` и `OfferClosed`. `views.ts`: `export const PLAYER_CLOSED_OFFERS = CLOSED_OFFERS_KEPT` (импорт из движка), комментарий к `offersFor` дополнить: словарь уже уплотнён движком. Сложность `compactOffers` не хуже O(n log n) по числу закрытых, вызывать только когда закрытых больше `CLOSED_OFFERS_KEPT` (быстрый выход).
- [ ] **Step 4: `pnpm --filter @fair/shared test`**: всё зелёное, включая существующие тесты `views` («25 закрытых → 20 у игрока»).
- [ ] **Step 5: Тесты `checkReplay` (красные)** в тесте checks симулятора: (а) журнал содержит подмножество накопленных предложений → ok; (б) в журнале есть предложение, которого нет в накопленном → не ok, текст содержит «предложени»; (в) поля одного предложения различаются → не ok; (г) множества ожидающих расходятся → не ok; просьбы и обмены по-прежнему сравниваются целиком (существующий тест остаётся).
- [ ] **Step 6: Реализовать** в `checkReplay`: `requests` и `trades` как раньше; для `offers`: для каждого `id` из `replayedFull.offers` — `isDeepStrictEqual(replayedFull.offers[id], accumulated.offers[id])`, иначе сообщение; множества id со `status === 'pending'` равны. Комментарий к функции обновить (§3 спецификации).
- [ ] **Step 7: `pnpm --filter @fair/sim test`** зелёный.
- [ ] **Step 8: Скрипт замера** `bench-views.ts` (§4 спецификации): без сервера, через `decide`/`reduce` движка и фиксированное содержимое (как в тестах/симуляторе: найти, как `cli.ts` или тесты загружают `content`), ростер 30, ярмарка открыта в акте I; `now` детерминированный счётчик. Вариант «отклонены»: N циклов `offer.create` (A→B, 1 золотой) + `offer.decline`; вариант «приняты»: `offer.create` + `offer.accept` с чередованием направления, чтобы золото не кончалось. Для N в `[0, 2000, 8000]`: 20 повторов `viewFor` для 30 игроков и ведущего, печать таблицы: вариант, N, закрытых предложений в состоянии, обменов, записей действий, мс на полный круг проекций (среднее). Скрипты `bench` и `sim:bench` в package.json. Запустить, таблицу в отчёт.
- [ ] **Step 9: Прогоны** из `apps/mini-app`: `pnpm sim -- --players 12 --seed 1`, `pnpm sim -- --players 30 --seed 1` (код 0, покрытие полное, `replay` ок), `pnpm sim:load -- --players 30 --minutes 10 --seed 1` (код 0; в отчёт p50/p95 минут 1 и 10 для сравнения с прошлым: было 12,6 → 31,2 мс p50). После прогонов `pgrep -f "server/src/index.ts"` пуст.
- [ ] **Step 10: `pnpm typecheck && pnpm test`**, коммит: «Этап 8: уплотнение закрытых предложений в состоянии, замер проекций».

### Task 2: Документация по итогам двухчасового прогона

Выполняется после того, как контролёр проведёт `pnpm sim:load -- --players 30 --minutes 120 --seed 1` на коде задачи 1 и передаст цифры.

**Files:**
- Modify: `docs/superpowers/specs/2026-10-28-compact-offers-design.md` (раздел 7: таблица замера из задачи 1, выжимка 120-минутного прогона по минутам 1, 10, 30, 60, 90, 120, вердикт; статус «реализовано»)
- Modify: `apps/mini-app/README.md` («Чего пока нет»: убрать пункты о двухчасовом прогоне и о росте задержки, если прогон прошёл; иначе переписать по факту)
- Modify: `docs/design/mini-app-spec.md` (§13: итоги двухчасового прогона одной строкой с цифрами; §17: решение об уплотнении)
- Modify: `apps/mini-app/DEPLOY.md` (раздел «Выгрузка журнала»: в снимке состояния выгрузки закрытых предложений не больше 20 на участника, полный список в событиях)

- [ ] **Step 1: Внести правки**, сверив каждую цифру с переданным отчётом и каждое название с кодом.
- [ ] **Step 2: Коммит** «Этап 8: итоги двухчасового прогона и документация».
