# Mini App, этап 1: каркас и ядро правил. План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Приложение, в котором ведущий раздаёт роли и открывает ярмарку, а 12–30 игроков с телефонов в Telegram видят свою роль, торгуют с подтверждением, покупают и изготавливают в мастерской, вкладывают в алтари и видят смену актов. Это этапы 1–2 из раздела 14 спецификации плюс минимальные экраны ведущего «Состав» и «Пульт», без которых игру не начать.

**Architecture:** Монорепозиторий `apps/mini-app` из трёх пакетов: `shared` (типы содержимого, состояние, чистый движок правил `decide`/`reduce`, проекции для игрока и ведущего), `server` (Fastify + WebSocket, журнал событий в SQLite, вход через Telegram `initData`, бот) и `client` (Vite + Preact, экраны). Сервер после каждого события шлёт каждому подключённому клиенту его полную проекцию состояния; клиент ничего не считает и не хранит, только рисует и шлёт команды с клиентским `id`.

**Tech Stack:** Node 20+, pnpm 9 workspaces, TypeScript 5, Vitest, Fastify 4, `ws`, `better-sqlite3`, `grammy` (бот), Vite 5 + Preact 10, `@playwright/test` для сквозного теста.

**Spec:** `docs/design/mini-app-spec.md` (приложение), `docs/design/magic-fair-v0.2.md` (правила), `docs/design/game-data-v0.2.json` (содержимое).

Вне этого плана, отдельными планами после него: способности 25 видов, запросы согласия, лоты с торгом (этапы 3–4), закрытие с подсчётом целей, журнал с исправлениями всех полей, экран результатов (этап 5), RPG-оформление с портретами, сквозной прогон на 17 ботов (этап 6).

## Global Constraints

- Весь текст интерфейса, документов и сообщений коммитов на русском языке.
- Коммиты только с автором и коммитером `Andrew Piskunov <45717261+andrewpiskunov@users.noreply.github.com>`, без строк `Co-authored-by` и без упоминаний инструментов. Каждый коммит делать так:
  `GIT_COMMITTER_NAME="Andrew Piskunov" GIT_COMMITTER_EMAIL="45717261+andrewpiskunov@users.noreply.github.com" git commit --author="Andrew Piskunov <45717261+andrewpiskunov@users.noreply.github.com>" -m "<сообщение>"`
- Работа в ветке `mini-app-core`, не в `main`. Пуш только `git push -u origin HEAD`, и только если владелец попросит.
- Никаких токенов, секретов и реальных списков гостей в репозитории. В репозиторий кладётся только `apps/mini-app/.env.example` с пустыми значениями. Корневой `.gitignore` уже исключает `.env`, `*.sqlite`, `node_modules`.
- Содержимое игры читается из `docs/design/game-data-v0.2.json`, файл не копируется и не редактируется кодом приложения.
- Движок правил (`shared/src/engine`) не импортирует ничего из Node: ни `fs`, ни `crypto`, ни таймеров. Время, случайность и генерация `id` приходят через контекст команды.
- Числа из спеки: золото на старте 6; ингредиент в мастерской 2 золота; запас мастерской на открытии `ceil(nPresent/3)` каждого вида, пополнение в актах II и III `ceil(nPresent/6)`; срок ответа на предложение 5 минут (300000 мс); лотов в первом акте не больше четырёх; выкуп лота 4 золота (торг вне этого плана).
- Пакеты лежат в `apps/mini-app/packages/` и называются `@fair/shared`, `@fair/server`, `@fair/client`.
- Dev-сервер запускать только в tmux (требование хука в этом окружении): `tmux new-session -d -s fair "pnpm run dev"`.

## Review Focus

1. Принятие предложения после того, как у одной из сторон уже нет обещанного (вещь ушла на алтарь, золото потрачено): предложение закрывается как `expired` с причиной, ничего не переносится. Тест в задаче 4.
2. Повторная отправка команды с тем же `id` после обрыва связи: сервер возвращает прежний результат и не применяет команду второй раз. Тест в задаче 7.
3. Перезапуск сервера посреди игры: состояние после проигрывания журнала совпадает с состоянием до остановки. Тест в задаче 7.
4. `initData` с неверной подписью или старше 24 часов: вход отклонён, аккаунт ни к чему не привязан. Тест в задаче 7.
5. Ведущий меняет состав или явку после открытия ярмарки, или открывает её дважды: команда отклонена, состояние не меняется. Тест в задаче 2.

---

## Структура файлов

```
apps/mini-app/
  package.json                 # workspaces, скрипты test/build/dev/typecheck/e2e
  pnpm-workspace.yaml
  tsconfig.base.json
  .env.example
  README.md                    # обновить: как запустить
  packages/shared/
    package.json
    src/content.ts             # типы содержимого и loadContent(json)
    src/types.ts               # GameState, Player, Item, Offer, Lot, Altar, Side, Ingredient, Phase
    src/commands.ts            # Command (discriminated union), Actor, Ctx
    src/events.ts              # Event (discriminated union)
    src/engine/index.ts        # decide, reduce, execute, initialState
    src/engine/roster.ts       # defaultRoster(content, n)
    src/engine/session.ts      # setN, toggleRole, bind, setPresent, open, act.next, clock.*, gm.announce, gm.correct, gm.rebind
    src/engine/offers.ts       # offer.*
    src/engine/shop.ts         # shop.buy, shop.craft
    src/engine/altars.ts       # altar.contribute, altar.withdraw
    src/engine/bundles.ts      # available, hasBundle, transfer
    src/views.ts               # viewFor(state, content, actor) → PlayerView | GmView
    src/__tests__/*.test.ts
  packages/server/
    package.json
    src/index.ts               # старт: конфиг, store, game, http, ws, bot
    src/config.ts              # чтение .env
    src/store.ts               # EventStore поверх better-sqlite3
    src/game.ts                # Game: состояние в памяти, очередь команд, подписчики
    src/auth.ts                # verifyInitData, issueToken, verifyToken
    src/http.ts                # POST /api/auth, GET /api/health, dev-вход
    src/ws.ts                  # WebSocket: cmd → result, рассылка view
    src/bot.ts                 # grammy: /start → кнопка Mini App
    src/__tests__/*.test.ts
  packages/client/
    package.json
    index.html
    vite.config.ts
    src/main.tsx               # инициализация Telegram, вход, подключение
    src/api.ts                 # auth(), connect(): WS-клиент с переподключением и очередью команд
    src/store.ts               # сигнал с текущей проекцией и статусом соединения
    src/styles.css             # токены цветов из прототипа
    src/App.tsx                # маршрутизация по роли: игрок или ведущий
    src/screens/Role.tsx
    src/screens/Bag.tsx
    src/screens/Trades.tsx
    src/screens/Workshop.tsx
    src/screens/Altars.tsx
    src/screens/Events.tsx     # лента объявлений и смен актов; лоты как справка
    src/screens/gm/Roster.tsx
    src/screens/gm/Console.tsx
    src/components/*.tsx       # Tabs, Button, Confirm, ItemCard, Portrait
  e2e/
    playwright.config.ts
    trade.spec.ts
```

Ключевые типы, которые используют все задачи (`packages/shared/src/types.ts`):

```ts
export type Side = 'wake' | 'bind' | 'break' | 'ship' | 'free';
export type AltarSide = Exclude<Side, 'free'>;
export type Ingredient = 'ash' | 'moon' | 'dew';
export type Phase = 'setup' | 'act1' | 'act2' | 'act3' | 'closed' | 'revealed';
export type ItemKind = 'relic' | 'shard' | 'clue' | 'potion' | 'ward' | 'focus' | 'shape';
export type Owner = { type: 'player'; key: string } | { type: 'altar'; side: AltarSide } | { type: 'lot'; id: string };
export interface Item { id: string; kind: ItemKind; ref: string; owner: Owner; createdBy?: string; hiddenUntilAct?: 3; reservedFor?: string }
export type Counts = Record<Ingredient, number>;
export interface Bundle { gold: number; ingredients: Counts; items: string[]; rumor?: string }
export interface Player {
  roleKey: string; telegramId?: number; present: boolean;
  gold: number; reservedGold: number; ingredients: Counts;
  abilityUsedInAct: boolean; pendingModifier?: unknown; protection?: { by: string };
  thorns: boolean; curse: boolean; discount: boolean; side?: Side; hostileAttemptsAgainstInAct: number;
}
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
export interface Offer { id: string; from: string; to: string; give: Bundle; get: Bundle; service: boolean; status: OfferStatus; createdAt: number; expiresAt: number; reason?: string }
export type LotStatus = 'queued' | 'announced' | 'openBidding' | 'sealedBidding' | 'fixedPrice' | 'sold' | 'unsold';
export interface Lot { id: string; items: string[]; act: 1 | 2 | 3; status: LotStatus; bids: { player: string; amount: number; at: number }[]; fixedPrice?: number }
export interface Contribution { id: string; player: string; item?: string; gold?: number }
export interface Altar { side: AltarSide; contributions: Contribution[] }
export interface Announcement { at: number; title: string; text: string }
export interface GameState {
  phase: Phase; roster: string[]; nPresent: number;
  clock: { actStartedAt: number; pausedAt?: number; pausedTotal: number };
  players: Record<string, Player>; items: Record<string, Item>;
  workshop: Counts; offers: Record<string, Offer>; lots: Record<string, Lot>;
  altars: Partial<Record<AltarSide, Altar>>; invites: Record<string, string>;   // roleKey → код
  gmTelegramId?: number; announcements: Announcement[]; seq: number;
}
```

`packages/shared/src/commands.ts`:

```ts
export type Actor = { type: 'gm' } | { type: 'player'; roleKey: string } | { type: 'system' };
export interface Ctx { now: number; actor: Actor; newId: () => string; random: () => number }
export type Correction =
  | { field: 'gold'; delta: number }
  | { field: 'ingredient'; ingredient: Ingredient; delta: number }
  | { field: 'itemOwner'; itemId: string; owner: Owner };
export type Command =
  | { type: 'session.setN'; n: number }
  | { type: 'session.toggleRole'; roleKey: string }
  | { type: 'player.bind'; code: string; telegramId: number }
  | { type: 'player.setPresent'; roleKey: string; present: boolean }
  | { type: 'session.open' }
  | { type: 'act.next' }
  | { type: 'clock.pause' } | { type: 'clock.resume' } | { type: 'clock.extend'; minutes: number }
  | { type: 'gm.announce'; text: string }
  | { type: 'gm.correct'; playerKey: string; change: Correction; reason: string }
  | { type: 'gm.rebind'; roleKey: string }
  | { type: 'offer.create'; to: string; give: Bundle; get: Bundle; service?: boolean }
  | { type: 'offer.accept'; id: string } | { type: 'offer.decline'; id: string } | { type: 'offer.cancel'; id: string }
  | { type: 'offer.expire'; id: string }                       // только actor system
  | { type: 'shop.buy'; ingredient: Ingredient; count?: number }
  | { type: 'shop.craft'; recipeId: string }
  | { type: 'altar.contribute'; side: AltarSide; itemId?: string; gold?: number }
  | { type: 'altar.withdraw'; contributionId: string };
```

`packages/shared/src/engine/index.ts`:

```ts
export type ErrorCode = 'phase' | 'forbidden' | 'not_found' | 'not_owner' | 'insufficient' | 'reserved' | 'limit' | 'invalid';
export type Result = { ok: true; events: Event[] } | { ok: false; error: ErrorCode; detail?: string };
export function initialState(content: Content, codes: Record<string, string>): GameState;   // codes: код для каждой из 30 ролей по roleKey плюс ключ 'gm' с кодом ведущего
export function decide(state: GameState, content: Content, cmd: Command, ctx: Ctx): Result;
export function reduce(state: GameState, content: Content, event: Event): GameState;        // чистая, без мутаций входа
export function execute(state: GameState, content: Content, cmd: Command, ctx: Ctx):
  { ok: true; state: GameState; events: Event[] } | { ok: false; error: ErrorCode; detail?: string };
```

События (`events.ts`) описывают факт и несут всё, что нужно `reduce`: `SessionCreated { codes }`, `RosterSet { roster }`, `RoleToggled { roleKey, inRoster }`, `PlayerBound { roleKey | 'gm', telegramId }`, `PresenceSet`, `FairOpened` (с начальными `players`, `items`, `lots`, `workshop`, `altars`, `nPresent`), `ActStarted { act, title, text, refill, newLots, revealedItems }`, `ClockPaused`, `ClockResumed { pausedMs }`, `ClockExtended`, `Announced`, `Corrected { playerKey, change, reason }`, `InviteRebound { roleKey, code }`, `OfferCreated { offer }`, `OfferAccepted { id, from, to, give, get, service, exchanged }`, `OfferClosed { id, status, reason? }`, `IngredientBought`, `ItemCrafted { item, paidGold, paidIngredients }`, `Contributed { contribution, side }`, `ContributionWithdrawn`. Каждое событие несёт `at: number` и после записи в журнал `seq: number`.

---

### Task 1: Каркас монорепозитория и загрузка содержимого

**Files:**
- Create: `apps/mini-app/package.json`, `apps/mini-app/pnpm-workspace.yaml`, `apps/mini-app/tsconfig.base.json`, `apps/mini-app/.env.example`
- Create: `apps/mini-app/packages/shared/package.json`, `apps/mini-app/packages/shared/tsconfig.json`, `apps/mini-app/packages/shared/src/content.ts`, `apps/mini-app/packages/shared/src/types.ts`
- Test: `apps/mini-app/packages/shared/src/__tests__/content.test.ts`

**Interfaces:**
- Produces: `loadContent(json: unknown): Content` в `content.ts`. `Content` повторяет структуру `game-data-v0.2.json`: `version`, `factions[]` (`id`, `name`, `color`, `desc`, `motto`, `altar`), `roles[]` (`key`, `id`, `pos`, `block`, `side`, `name`, `title`, `intro`, `goals: string[]`, `skill`, `effect`, `extra`, `bundle: Counts`, `contacts: {role: string|null; text: string}[]`, `joke`, `style`, `acting`, `secret`, `rumor`, `backstory`, `motivation`, `emoji`), `relics[]` (`name`, `owner`, `wants[]`, `lore`, `emoji`), `shards[]` (`id`, `owner?`, `hidden?`, `lot?`), `clues[]` (`id`, `name`, `where`, `text`, `emoji`), `recipes[]` (`id`, `name`, `cost: Partial<Counts>`, `gold`, `text`, `lore`, `emoji`), `events[]` (`when`, `title`, `text`), `resources[]`, `story`, `rooms[]`, `icons`. Плюс индексы `roleByKey: Record<string, Role>`, `recipeById: Record<string, Recipe>`.
- Produces: `defaultContentPath(): string` = `docs/design/game-data-v0.2.json` относительно корня репозитория (путь вычисляется от `import.meta.url` пакета `shared`).

- [ ] **Step 1: Создать ветку и закоммитить проектные документы**

```bash
git checkout -b mini-app-core
git add docs apps/mini-app/README.md
git commit ... -m "Описать проект игры 0.2 и спецификацию приложения"
```

- [ ] **Step 2: Создать рабочее пространство pnpm**

`apps/mini-app/package.json`: `"private": true`, скрипты `test` (`pnpm -r test`), `typecheck` (`pnpm -r typecheck`), `build`, `dev` (`pnpm -r --parallel dev`), `e2e` (`playwright test -c e2e`). `pnpm-workspace.yaml`: `packages: ['packages/*']`. `tsconfig.base.json`: `strict`, `module: NodeNext`, `target: ES2022`, `moduleResolution: NodeNext`. `.env.example` с ключами `BOT_TOKEN=`, `BOT_NAME=`, `SESSION_SECRET=`, `CLIENT_URL=`, `DB_PATH=./data/session.sqlite`, `CONTENT_PATH=`, `PORT=8080`, `ALLOW_DEV_AUTH=0`, `BOT_POLLING=0`.

- [ ] **Step 3: Написать падающий тест загрузки содержимого**

```ts
// content.test.ts
import { readFileSync } from 'node:fs';
import { loadContent, defaultContentPath } from '../content';
const content = loadContent(JSON.parse(readFileSync(defaultContentPath(), 'utf8')));
test('30 ролей, позиции 1..30 без повторов', () => {
  expect(content.roles).toHaveLength(30);
  expect(new Set(content.roles.map(r => r.pos)).size).toBe(30);
});
test('индексы', () => {
  expect(content.roleByKey['o6'].name).toBe('Грета');
  expect(content.recipeById['focus'].gold).toBe(1);
});
test('ошибка на пустом объекте', () => { expect(() => loadContent({})).toThrow(); });
```

- [ ] **Step 4: Запустить `pnpm --filter @fair/shared test`, убедиться, что падает** (модуль не найден)

- [ ] **Step 5: Реализовать `types.ts` (из раздела «Структура файлов») и `loadContent`**

Проверка структуры руками: наличие массивов и обязательных полей, без библиотек валидации.

- [ ] **Step 6: Запустить тесты, убедиться, что проходят**

- [ ] **Step 7: Commit** `Создать каркас приложения и загрузку содержимого игры`

---

### Task 2: Движок: состав, привязка, явка, открытие ярмарки

**Files:**
- Create: `packages/shared/src/commands.ts`, `packages/shared/src/events.ts`, `packages/shared/src/engine/index.ts`, `packages/shared/src/engine/roster.ts`, `packages/shared/src/engine/session.ts`, `packages/shared/src/__tests__/helpers.ts`
- Test: `packages/shared/src/__tests__/roster.test.ts`, `packages/shared/src/__tests__/open.test.ts`

**Interfaces:**
- Consumes: `Content`, типы из задачи 1.
- Produces: `defaultRoster(content: Content, n: number): string[]`; `initialState`, `decide`, `reduce`, `execute` (сигнатуры выше). Тестовый помощник `helpers.ts`: `makeGame(n: number, opts?: { present?: string[] /* по умолчанию все */ }): GameState` (создаёт состояние с кодами `code-<roleKey>`, выполняет `setN`, `bind` с `telegramId = 1000 + pos`, `setPresent`, `open`; `ctx = { now: 0, newId: 'id1','id2',…, random: () => 0.5 }`) и `run(state, cmd, actor, now = 0)`, возвращающий результат `execute`. Константы актёров `gm`, `player(key)`, `system`.

- [ ] **Step 1: Тесты состава** (`roster.test.ts`)

```ts
test.each([[12, []], [17, []], [20, []], [23, ['r1','r2','r3']], [24, ['t1','t2','t3','t4']], [30, ['t1','t2','t3','t4','r1','r2','r3','r4','r5','r6']]])
  ('состав при N=%i', (n, tail) => {
    const r = defaultRoster(content, n);
    expect(r).toHaveLength(n);
    expect(r.slice(0, Math.min(n, 20))).toEqual(content.roles.filter(x => x.pos <= Math.min(n, 20)).map(x => x.key));
    expect(r.slice(20)).toEqual(tail);
  });
test('setN вне 12..30 отклоняется с invalid', ...);
test('toggleRole убирает роль из roster и добавляет обратно; роль вне состава не привязывается по коду', ...);
test('bind: первый аккаунт привязан, второй по тому же коду получает forbidden, тот же аккаунт повторно ok без событий', ...);
test('bind кодом ведущего (codes.gm) ставит gmTelegramId', ...);
```

- [ ] **Step 2: Тесты открытия** (`open.test.ts`; сценарий А: N=17, пришли все кроме `o13` Грима и `o14` Лиры; сценарий Б: N=12, пришли все)

```ts
test('А: стартовые наборы: 6 золота и bundle роли', () => { expect(p('o6').gold).toBe(6); expect(p('o6').ingredients).toEqual(content.roleByKey.o6.bundle); });
test('А: отсутствующие не получают наборов и вещей', () => expect(p('o13').gold).toBe(0));
test('А: nPresent 15, запас мастерской ceil(15/3)=5 каждого', () => expect(s.workshop).toEqual({ ash: 5, moon: 5, dew: 5 }));
test('А: осколки I–III у владельцев, IV и V не созданы', ...);
test('А: Корона пепла Грима в лоте первого акта (претендент Серафина в составе)', ...);
test('А: улика B у Ады, улика C у Клёпы', ...);
test('А: алтари wake, bind, break есть, ship нет', ...);
test('Б: все 12 пришли → ровно один лот: Медный жезл (владелец Астра o17 вне состава, претендент Вельда o5 в составе); Изумрудный глаз (претенденты o7 и r2 вне состава) не создан', ...);
test('В: N=12, Клёпа o16 не пришла → улика C и Лунный рог в лотах первого акта', ...);
test('Г: N=12, не пришли o1, o5, o9, o13, o16 → пул из 7 вещей (осколки I–III, улика C, Корона, Лунный рог, Медный жезл): ровно 4 лота announced, 3 queued с act 2; осколки и улика в announced раньше реликвий', ...);
test('open дважды → phase; setPresent и toggleRole после open → phase', ...);   // Review Focus 5
```

- [ ] **Step 3: Запустить, убедиться, что падает**

- [ ] **Step 4: Реализовать**

`roster.ts` по правилу 6.1 спеки. `session.ts`: `setN` (12..30, только `setup`), `toggleRole` (только `setup`), `bind` (код ведущего `codes.gm` или код роли из `roster`), `setPresent`, `open`. Правило вещей при открытии: реликвия к владельцу, если он в составе и пришёл; иначе в пул лотов, если хоть один из `wants` в составе; иначе не создаётся. Осколки I–III: владельцу или в пул. Улики B (`o10`) и C (`o16`): владельцу или в пул. Осколок V: `o14`, если пришла, с `hiddenUntilAct: 3`; иначе не создаётся (появится в акте III). Пул упорядочен: осколки, улики, реликвии по порядку в содержимом; первые четыре становятся лотами `announced` акта 1, остальные `queued` с `act: 2`. Алтарь `ship` создаётся, только если в `roster` есть роль со `side: 'ship'`.

- [ ] **Step 5: Запустить тесты, убедиться, что проходят**

- [ ] **Step 6: Commit** `Добавить движок: состав, привязка и открытие ярмарки`

---

### Task 3: Движок: акты, часы, объявления, исправления

**Files:**
- Modify: `packages/shared/src/engine/session.ts`
- Test: `packages/shared/src/__tests__/acts.test.ts`

**Interfaces:**
- Produces: обработка `act.next`, `clock.pause/resume/extend`, `gm.announce`, `gm.correct` (поля `gold`, `ingredient`, `itemOwner`), `gm.rebind`. Все только от `gm`.

- [ ] **Step 1: Тесты**

```ts
test('act.next из act1: phase act2, пополнение ceil(15/6)=3 каждого, queued лоты акта 2 стали announced, создан лот с осколком IV и уликой A', ...);
test('act.next в act3 без Лиры: создан лот с осколком V; с Лирой: hiddenUntilAct снят', ...);
test('act.next сбрасывает abilityUsedInAct, protection, thorns, discount, pendingModifier, hostileAttemptsAgainstInAct; curse остаётся', ...);
test('act.next из act3 → phase (закрытие в другом плане); announcement акта добавлен с title из content.events', ...);
test('pause/resume: resume через 60000 мс увеличивает pausedTotal на 60000 и сдвигает expiresAt каждого pending предложения на 60000 (предложение для теста кладётся в state.offers руками, команды сделок появятся в задаче 4); resume без паузы → invalid', ...);
test('announce от игрока → forbidden; от gm добавляет Announcement', ...);
test('correct gold −2 с причиной ok; без причины → invalid; результат ниже reservedGold → insufficient; itemOwner переносит вещь', ...);
test('rebind выдаёт код из ctx.newId и снимает telegramId', ...);
```

- [ ] **Step 2: Запустить, убедиться, что падает**
- [ ] **Step 3: Реализовать.** Текст события акта брать из `content.events` по `when`: `'Акт II'` и `'Акт III'`.
- [ ] **Step 4: Запустить тесты, убедиться, что проходят**
- [ ] **Step 5: Commit** `Добавить смену актов, часы и исправления ведущего`

---

### Task 4: Движок: сделки с резервом

**Files:**
- Create: `packages/shared/src/engine/bundles.ts`, `packages/shared/src/engine/offers.ts`
- Test: `packages/shared/src/__tests__/offers.test.ts`

**Interfaces:**
- Produces в `bundles.ts`: `available(state, playerKey): { gold: number; ingredients: Counts; items: string[] }` (за вычетом `reservedGold`, зарезервированных ингредиентов из pending-предложений и вещей с `reservedFor`); `hasBundle(state, playerKey, b: Bundle): boolean`; `transfer(state, from, to, b): GameState`; `isTradable(state, itemId, phase): boolean` (не на алтаре, не в лоте, не скрыт до акта 3).
- Produces в `offers.ts`: `offer.create/accept/decline/cancel/expire`. `OfferAccepted.exchanged = true`, если хоть одна сторона передала золото, ингредиент или вещь.

- [ ] **Step 1: Тесты**

```ts
test('create: available.gold уменьшилось, gold не изменилось, expiresAt = now + 300000, у вещи reservedFor = id', ...);
test('create отклонён: нет вещи (not_owner), вещь уже в другом pending (reserved), вещь на алтаре (invalid), скрытый V в act1 (invalid), адресат не пришёл (not_found), адресат = автор (invalid), фаза setup (phase), пустые обе стороны (invalid)', ...);
test('accept переносит обе стороны атомарно, снимает резерв, OfferAccepted с обеими сторонами и exchanged=true', ...);
test('accept, когда у адресата уже нет золота (после shop.buy): статус expired, reason "counterparty", у автора всё на месте', ...);   // Review Focus 1
test('accept, когда вещь автора ушла через gm.correct: статус expired, reason "author", резерв снят', ...);
test('decline и cancel снимают резерв; accept чужого предложения → forbidden', ...);
test('expire только от system; после срока pending → expired; до срока → invalid', ...);
test('service сохраняется в OfferAccepted', ...);
test('предложение из одних слухов: exchanged=false', ...);
test('ингредиенты тоже резервируются: два предложения на один последний Пепел, второе → reserved', ...);
```

- [ ] **Step 2: Запустить, убедиться, что падает**
- [ ] **Step 3: Реализовать `bundles.ts` и `offers.ts`**
- [ ] **Step 4: Запустить тесты, убедиться, что проходят**
- [ ] **Step 5: Commit** `Добавить сделки с резервом и подтверждением`

---

### Task 5: Движок: мастерская и алтари

**Files:**
- Create: `packages/shared/src/engine/shop.ts`, `packages/shared/src/engine/altars.ts`
- Test: `packages/shared/src/__tests__/shop.test.ts`, `packages/shared/src/__tests__/altars.test.ts`

**Interfaces:**
- Produces: `shop.buy` (цена 2 за штуку из доступного золота, запас уменьшается, `count` по умолчанию 1); `shop.craft` (списывает `recipe.cost` и `recipe.gold`; шипы +1 золото, скидка −1 не ниже 0; после изготовления шипы и скидка снимаются; `pendingModifier` в этом плане не учитывается). Вещь: `kind` по рецепту (`cleanse→potion`, `ward→ward`, `focus→focus`, `shape→shape`), `ref = recipeId`, `createdBy = roleKey`. `altar.contribute` (осколок, Фокус или золото ≥ 1), `altar.withdraw` (только свой вклад, только до закрытия).

- [ ] **Step 1: Тесты мастерской**

```ts
test('buy: −2 золота, +1 ингредиент, запас −1; запас 0 → insufficient; available.gold < 2 → insufficient', ...);
test('craft focus у Греты (ash 2, moon 1): −1 ash −1 moon −1 золото, вещь focus с createdBy o6', ...);
test('craft без ингредиентов → insufficient, ничего не списано', ...);
test('шипы: craft стоит на 1 дороже и снимает thorns; discount: на 1 дешевле, не ниже 0, и снимается', ...);
test('craft в setup → phase; неизвестный рецепт → not_found', ...);
```

- [ ] **Step 2: Тесты алтарей**

```ts
test('contribute осколка: owner = altar, вещь нельзя предложить в сделке', ...);
test('contribute 3 золота: gold −3, вклад с player и gold; 0 золота → invalid', ...);
test('contribute вещи в резерве → reserved; чужой → not_owner; potion → invalid; на несуществующий алтарь ship → not_found', ...);
test('осколок V на алтарь в act1 → invalid, в act3 ok', ...);
test('withdraw своего вклада возвращает вещь или золото; чужого → forbidden', ...);
```

- [ ] **Step 3: Запустить, убедиться, что падает**
- [ ] **Step 4: Реализовать**
- [ ] **Step 5: Запустить тесты, убедиться, что проходят**
- [ ] **Step 6: Commit** `Добавить мастерскую и алтари`

---

### Task 6: Проекции для игрока и ведущего

**Files:**
- Create: `packages/shared/src/views.ts`
- Test: `packages/shared/src/__tests__/views.test.ts`

**Interfaces:**

```ts
export interface PlayerView {
  kind: 'player'; phase: Phase; act: 0 | 1 | 2 | 3; clock: { elapsedMs: number; paused: boolean };
  me: { role: Role; player: Player; items: Item[]; available: { gold: number; ingredients: Counts; items: string[] } };
  contacts: { role: string | null; name?: string; text: string; absent: boolean }[];
  others: { roleKey: string; name: string; title: string; emoji: string }[];   // только присутствующие, без стороны и целей
  offers: Offer[];                                                           // где я автор или адресат
  workshop: Counts; recipes: Recipe[];
  altars: { side: AltarSide; name: string; contributions: (Contribution & { name: string; itemRef?: string })[] }[];
  lots: (Lot & { items: Item[] })[];
  announcements: Announcement[];
  public: { factions: Faction[]; resources: Resource[]; shards: { id: string; status: 'player' | 'lot' | 'altar' | 'unknown' }[]; clues: Clue[]; story: string };
}
export interface GmView { kind: 'gm'; state: GameState; content: Content; invites: { roleKey: string; code: string; bound: boolean; present: boolean }[] }
export function viewFor(state: GameState, content: Content, actor: Actor): PlayerView | GmView;   // для system бросает ошибку
```

- [ ] **Step 1: Тесты**

```ts
test('игрок не видит чужих целей, тайн, сторон, инвентарей и чужих предложений', ...);
test('скрытый V у Лиры: в me.items с hiddenUntilAct; в public.shards статус unknown до act3; у других игроков вещи нет', ...);
test('контакт на отсутствующую роль: absent=true, name подставлено; контакт без роли: absent=false', ...);
test('ведущий видит state целиком и коды', ...);
test('clock.elapsedMs учитывает pausedTotal и текущую паузу', ...);
```

- [ ] **Step 2: Запустить, убедиться, что падает**
- [ ] **Step 3: Реализовать**
- [ ] **Step 4: Запустить тесты, убедиться, что проходят**
- [ ] **Step 5: Commit** `Добавить проекции состояния для игрока и ведущего`

---

### Task 7: Сервер: журнал событий, игра в памяти, вход через Telegram

**Files:**
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`, `src/config.ts`, `src/store.ts`, `src/game.ts`, `src/auth.ts`
- Test: `packages/server/src/__tests__/store.test.ts`, `game.test.ts`, `auth.test.ts`

**Interfaces:**

```ts
// store.ts
export class EventStore {
  constructor(dbPath: string);                  // ':memory:' в тестах
  append(events: Event[]): Event[];             // проставляет seq, одна транзакция
  all(): Event[];
  saveResult(cmdId: string, result: unknown): void; getResult(cmdId: string): unknown | undefined;
  saveMeta(key: string, value: string): void; getMeta(key: string): string | undefined;
}
// game.ts
export interface GameOpts { now: () => number; newId: () => string; random: () => number }
export class Game {
  static open(store: EventStore, content: Content, opts: GameOpts): Game;   // пустой журнал → SessionCreated с кодами и meta gmCode; иначе проигрывание
  state(): GameState;
  submit(cmdId: string, cmd: Command, actor: Actor): Promise<{ ok: true; seq: number } | { ok: false; error: ErrorCode; detail?: string }>;   // строго по одной
  subscribe(fn: (state: GameState) => void): () => void;
  tick(): void;                                 // offer.expire от system для просроченных; вызывать раз в секунду
  actorFor(telegramId: number): Actor | undefined;
  bindByCode(code: string, telegramId: number): Promise<Actor | undefined>;
  gmCode(): string;
}
// auth.ts
export function verifyInitData(initData: string, botToken: string, now: number): { user: { id: number; first_name: string }; startParam?: string } | null;
export function issueToken(payload: { telegramId: number }, secret: string, now: number): string;   // HMAC-SHA256, срок 12 ч
export function verifyToken(token: string, secret: string, now: number): { telegramId: number } | null;
```

Коды приглашений и ведущего: 12 символов из `A–Za–z0–9` через `crypto.randomBytes`. `Game.open` генерирует их при пустом журнале, передаёт в `initialState` (ключ `gm` для ведущего) и записывает в событие `SessionCreated`, чтобы проигрывание журнала восстанавливало те же коды.

- [ ] **Step 1: Тесты store и game**

```ts
test('append проставляет seq 1,2,3; all после переоткрытия того же файла возвращает их', ...);
test('submit с тем же cmdId второй раз: тот же результат, число событий не выросло', ...);   // Review Focus 2
test('два submit одновременно на одну вещь: ровно один ok', ...);
test('перезапуск: Game.open на том же store → state toEqual прежнему', ...);                    // Review Focus 3
test('tick при now ≥ expiresAt закрывает предложение как expired', ...);
test('bindByCode кодом ведущего → {type:"gm"}, кодом роли → {type:"player"}, неизвестным → undefined', ...);
```

- [ ] **Step 2: Тесты auth.** Подпись в тесте считать по алгоритму Telegram: `secret = HMAC_SHA256(key: 'WebAppData', data: botToken)`, `hash = HMAC_SHA256(key: secret, data: data_check_string)`, где строка проверки это пары `key=value`, кроме `hash`, отсортированные по ключу и соединённые `\n`.

```ts
test('верная подпись: user.id и startParam извлечены', ...);
test('подмена user → null; auth_date старше 24 ч → null', ...);   // Review Focus 4
test('token выдан и проверен; с другим секретом null; через 13 ч null', ...);
```

- [ ] **Step 3: Запустить, убедиться, что падает**
- [ ] **Step 4: Реализовать**
- [ ] **Step 5: Запустить тесты, убедиться, что проходят**
- [ ] **Step 6: Commit** `Добавить сервер: журнал событий, очередь команд и вход через Telegram`

---

### Task 8: Сервер: HTTP, WebSocket, бот, запуск

**Files:**
- Create: `packages/server/src/http.ts`, `src/ws.ts`, `src/bot.ts`, `src/index.ts`
- Test: `packages/server/src/__tests__/ws.test.ts`

**Interfaces:**
- `POST /api/auth` body `{ initData: string }` или, при `ALLOW_DEV_AUTH=1`, `{ dev: { userId: number; startParam?: string } }`. Если `start_param` это код, сервер делает `bindByCode`. Ответ `{ token, actor, botName }` или 401 `{ error: 'unauthorized' }`; гость без роли получает 200 с `actor: null`.
- `GET /api/health` → `{ ok: true, seq }`.
- `GET /api/dev/codes` только при `ALLOW_DEV_AUTH=1` → `{ gm: string; roles: Record<string, string> }`.
- WebSocket `/ws?token=...`. Клиент шлёт `{ kind: 'cmd', id: string, cmd: Command }`; сервер отвечает `{ kind: 'result', id, ok, error?, detail?, seq? }`. При подключении и после каждого изменения состояния сервер шлёт каждому `{ kind: 'view', seq, view }` с его проекцией. Плохой токен: закрытие с кодом 4401.
- Бот (`grammy`): `/start` отвечает кнопкой `web_app` на `CLIENT_URL`; запускается только при `BOT_POLLING=1`.
- `index.ts`: конфиг, `EventStore(DB_PATH)`, `Game.open`, `setInterval(tick, 1000)`, HTTP и WS на `PORT`; печатает код ведущего в лог, если `gmTelegramId` не задан.

- [ ] **Step 1: Тест ws** (Fastify на случайном порту, `DB_PATH=':memory:'`, dev-вход двух ролей)

```ts
test('подключение даёт view своей роли; offer.create у автора ok, адресат получает view с pending предложением', ...);
test('actor берётся из токена: игрок o6 не может выполнить gm.announce (forbidden)', ...);
test('невалидный token → закрытие 4401', ...);
```

- [ ] **Step 2: Запустить, убедиться, что падает**
- [ ] **Step 3: Реализовать**
- [ ] **Step 4: Запустить тесты; запустить сервер в tmux и проверить `curl localhost:8080/api/health`**
- [ ] **Step 5: Commit** `Добавить HTTP, WebSocket и бота`

---

### Task 9: Клиент: вход, соединение, экраны игрока

**Files:**
- Create: `packages/client/package.json`, `index.html`, `vite.config.ts`, `src/main.tsx`, `src/api.ts`, `src/store.ts`, `src/styles.css`, `src/App.tsx`, `src/screens/{Role,Bag,Trades,Workshop,Altars,Events}.tsx`, `src/components/{Tabs,Button,Confirm,ItemCard,Portrait}.tsx`
- Test: `packages/client/src/__tests__/api.test.ts`

**Interfaces:**
- Consumes: протокол задачи 8, `PlayerView` задачи 6.
- `api.ts`: `auth(): Promise<{ token: string; actor: Actor | null; botName: string }>` берёт `window.Telegram.WebApp.initData`; если пусто и в URL есть `?dev=<userId>&code=<код>`, идёт dev-входом. `connect(token, onView: (v) => void): Connection`, где `Connection.send(cmd: Command): Promise<Result>` ставит `id = crypto.randomUUID()`, держит очередь неотправленного на время обрыва и повторяет с тем же `id`; переподключение с паузами 1, 2, 4, … до 30 с. `vite.config.ts` проксирует `/api` и `/ws` на `localhost:8080`.
- `store.ts`: сигналы `view`, `connected`, `error`.
- `index.html` подключает `https://telegram.org/js/telegram-web-app.js`; `main.tsx` вызывает `WebApp.ready()` и `WebApp.expand()`.

Экраны по макетам `docs/prototypes/magic-fair-v2.html`, раздел 10, без картинок: `Portrait` показывает `emoji` роли и слот `assets/portraits/<key>.png` с `onerror`. Цвета и шрифты из `styles.css` прототипа (`--bg #151b18`, `--amber #e8ad65`, `--purple #c4b0ec`, `--green #b9d499`, `--blue #9cced2`).
- `Role`: портрет, имя, титул, сторона, легенда, предыстория, мотивация, цели с подписью «проверяется при закрытии», способность текстом и неактивной кнопкой «В следующей версии», контакты с пометкой «не на ярмарке» при `absent`, тайна, слух.
- `Bag`: золото «доступно / обещано», ингредиенты, вещи карточками с подписью «сделал <имя>» по `createdBy`, кнопки «Предложить» (в `Trades` с предзаполненной вещью), «На алтарь» (выбор алтаря, подтверждение), «Использовать» неактивна.
- `Trades`: входящие с «Принять / Отклонить», исходящие с «Отменить» и обратным отсчётом по `expiresAt`, форма нового предложения (адресат из `others`, отдаю и прошу: золото, ингредиенты, вещи, слух), история закрытых.
- `Workshop`: запас, «Купить» с подтверждением, рецепты с кнопкой, неактивной при нехватке, подпись чего не хватает.
- `Altars`: карточка на алтарь с вкладами по именам, «Вложить» (вещь или золото), «Забрать своё».
- `Events`: объявления и лоты как справка.
- Общее: верхняя полоса «Акт N · мм:сс», нижние вкладки с эмодзи, `Confirm` на необратимые действия, ошибки словами по коду: `insufficient` «Не хватает», `phase` «Сейчас нельзя», `reserved` «Уже обещано в другой сделке», `not_owner` «Это не ваше», `forbidden` «Нельзя», `not_found` «Не найдено», `invalid` «Так нельзя», `limit` «Лимит исчерпан».

- [ ] **Step 1: Тест api** (мок `WebSocket`): команда во время обрыва встаёт в очередь и уходит после переподключения с тем же `id`; `send` возвращает результат по `id`.
- [ ] **Step 2: Запустить, убедиться, что падает**
- [ ] **Step 3: Реализовать `api.ts`, `store.ts`, затем экраны**
- [ ] **Step 4: Запустить тест; запустить `pnpm run dev` в tmux; открыть `http://localhost:5173/?dev=1&code=<код роли>` и `?dev=2&code=<другой>`: роль видна, предложение одного появляется у другого**
- [ ] **Step 5: Commit** `Добавить клиент: вход, соединение и экраны игрока`

---

### Task 10: Клиент: экраны ведущего «Состав» и «Пульт»

**Files:**
- Create: `packages/client/src/screens/gm/Roster.tsx`, `packages/client/src/screens/gm/Console.tsx`
- Modify: `packages/client/src/App.tsx`

**Interfaces:**
- Consumes: `GmView`, `botName` из ответа `/api/auth`.
- `Roster`: поле N и кнопка «Состав по умолчанию» (`session.setN`), список ролей по `pos` с переключателями «в составе» (`session.toggleRole`) и «пришёл» (`player.setPresent`), признак «привязан», кнопка «Скопировать ссылку» (`https://t.me/<botName>?startapp=<код>`), «Перевыдать код» (`gm.rebind`), большая кнопка «Открыть ярмарку» с подтверждением и сводкой: сколько пришло, какие вещи уйдут в лоты.
- `Console`: часы, «Пауза / Продолжить», «+5 минут», «Акт II» и «Акт III» с подтверждением и описанием последствий, поле объявления, «Закрыть ярмарку» неактивна с подписью «В следующей версии», форма исправления (игрок, поле, значение, причина → `gm.correct`).

- [ ] **Step 1: Реализовать экраны**
- [ ] **Step 2: Проверить руками: dev-вход кодом ведущего, N=12, все «пришли», «Открыть ярмарку»; игрок видит акт 1 и свой набор**
- [ ] **Step 3: Commit** `Добавить экраны ведущего: состав и пульт`

---

### Task 11: Сквозной тест и инструкция запуска

**Files:**
- Create: `apps/mini-app/e2e/playwright.config.ts`, `apps/mini-app/e2e/trade.spec.ts`
- Modify: `apps/mini-app/README.md`

- [ ] **Step 1: Сквозной тест.** Конфиг через `webServer` поднимает сервер с `DB_PATH=:memory:`, `ALLOW_DEV_AUTH=1`, `SESSION_SECRET=test` и клиент.

```ts
test('ведущий открывает ярмарку на 12, Грета продаёт Фокус Серафине', async ({ browser }) => {
  // 1. GET /api/dev/codes; страница ведущего ?dev=100&code=<gm>: N=12, все «пришли», «Открыть ярмарку»
  // 2. страница o6 (?dev=6&code=<o6>): Мастерская → изготовить Фокус; Сумка → Предложить → Серафине за 2 золота
  // 3. страница o1: Сделки → Принять
  // 4. у o1 в Сумке Фокус и золото 4; у o6 золото 7
});
```

- [ ] **Step 2: Запустить `pnpm e2e`, добиться прохождения**
- [ ] **Step 3: README:** установка, запуск в dev без Telegram, где взять код ведущего, переменные `.env`, что входит в эту версию и чего нет (ссылка на спеку, разделы 2 и 14).
- [ ] **Step 4: Прогнать `pnpm test`, `pnpm typecheck`, `pnpm e2e`, всё зелёное**
- [ ] **Step 5: Commit** `Добавить сквозной тест и инструкцию запуска`
