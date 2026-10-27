import { readFileSync } from 'node:fs';
import { loadContent } from '../content';
import { defaultContentPath } from '../node';
import type { AbilityUse, Actor, Command, Correction } from '../commands';
import type { Event } from '../events';
import type { AltarSide, Bundle, Counts, GameState, Item } from '../types';
import { available, execute, initialState } from '../engine';

export const content = loadContent(JSON.parse(readFileSync(defaultContentPath(), 'utf8')));

export const gm: Actor = { type: 'gm' };
export const system: Actor = { type: 'system' };
export const player = (key: string): Actor => ({ type: 'player', roleKey: key });

// Сквозной счётчик id: 'id1', 'id2', … — уникальны в пределах тестового файла.
let idCounter = 0;
const newId = () => `id${++idCounter}`;

/** Коды приглашений вида code-<roleKey> для всех ролей и code-gm для ведущего. */
export function testCodes(): Record<string, string> {
  const codes: Record<string, string> = { gm: 'code-gm' };
  for (const r of content.roles) codes[r.key] = `code-${r.key}`;
  return codes;
}

/** Свежая сессия в фазе setup, состав ещё не задан. */
export function newGame(): GameState {
  return initialState(content, testCodes());
}

export function run(state: GameState, cmd: Command, actor: Actor, now = 0) {
  return execute(state, content, cmd, { now, actor, newId, random: () => 0.5 });
}

function must(state: GameState, cmd: Command, actor: Actor, log?: Event[]): GameState {
  const r = run(state, cmd, actor);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.error} ${r.detail ?? ''}`);
  log?.push(...r.events);
  return r.state;
}

/**
 * Состав N, привязка всех ролей (telegramId = 1000 + pos), явка (по умолчанию все), открытие.
 * log: сюда складываются события подготовки, чтобы проиграть журнал с newGame().
 */
export function makeGame(n: number, opts: { present?: string[]; log?: Event[] } = {}): GameState {
  const { log } = opts;
  let s = must(newGame(), { type: 'session.setN', n }, gm, log);
  const present = new Set(opts.present ?? s.roster);
  for (const key of s.roster) {
    s = must(s, { type: 'player.bind', code: `code-${key}`, telegramId: 1000 + content.roleByKey[key].pos }, system, log);
    if (present.has(key)) s = must(s, { type: 'player.setPresent', roleKey: key, present: true }, gm, log);
  }
  return must(s, { type: 'session.open' }, gm, log);
}

/** Все роли состава N, кроме перечисленных. */
export function allBut(n: number, absent: string[]): string[] {
  return must(newGame(), { type: 'session.setN', n }, gm).roster.filter(k => !absent.includes(k));
}

const ACT_BY_PHASE: Partial<Record<GameState['phase'], 1 | 2 | 3>> = { act1: 1, act2: 2, act3: 3, closed: 3, revealed: 3 };

/**
 * Инварианты §6.8, пункты 1–12, по одному состоянию. Пункт 7 (золото банка) требует истории: checkGold;
 * пункт 10 здесь только для запросов, отметки после смены акта проверяет checkActStart.
 * Исправления abilityUsed и hostileAttempt состояние не помнит, поэтому пункты 2 и 3 строгие:
 * вызывать в сценариях без таких исправлений.
 */
export function checkInvariants(state: GameState): void {
  const fail = (msg: string) => { throw new Error(`инвариант: ${msg}`); };
  const present = (k: string) => state.roster.includes(k) && state.players[k]?.present === true;
  const act = ACT_BY_PHASE[state.phase];
  const current = act === undefined ? [] : state.actions.filter(a => a.act === act);
  const abilityRecords = current.filter(a => a.source.type === 'ability');
  for (const [key, p] of Object.entries(state.players)) {
    // 1. Защита только у присутствующего.
    if (p.protection !== undefined && !present(key)) fail(`защита у отсутствующего ${key}`);
    // 5–6. Ресурсы не в минусе, резерв покрыт, кража не тронула обещанное.
    if (p.gold < 0 || p.gold < p.reservedGold) fail(`золото ${key}: ${p.gold} < резерва ${p.reservedGold}`);
    const a = available(state, key);
    for (const [ing, n] of Object.entries(p.ingredients)) if (n < 0) fail(`ингредиент ${ing} у ${key} < 0`);
    for (const [ing, n] of Object.entries(a.ingredients)) if (n < 0) fail(`обещанный ингредиент ${ing} у ${key} больше наличного`);
    // 3. Счётчик попыток в {0, 1}.
    if (p.hostileAttemptsAgainstInAct !== 0 && p.hostileAttemptsAgainstInAct !== 1) fail(`попыток против ${key}: ${p.hostileAttemptsAgainstInAct}`);
    if (act === undefined) continue;
    // 2. Применение потрачено ровно вместе с записью способности этого акта.
    const own = abilityRecords.filter(r => r.author === key);
    if (own.length > 1) fail(`у ${key} ${own.length} записей способности в акте ${act}`);
    if (p.abilityUsedInAct !== (own.length === 1)) fail(`abilityUsedInAct ${key} = ${p.abilityUsedInAct}, записей ${own.length}`);
    // 3. По цели не больше одной враждебной записи за акт, и счётчик с ней согласован.
    const hostile = current.filter(r => r.hostile && r.target === key);
    if (hostile.length > 1) fail(`по ${key} ${hostile.length} враждебных записей в акте ${act}`);
    if (p.hostileAttemptsAgainstInAct !== hostile.length) fail(`попыток против ${key} ${p.hostileAttemptsAgainstInAct}, записей ${hostile.length}`);
  }
  for (const [ing, n] of Object.entries(state.workshop)) if (n < 0) fail(`запас мастерской ${ing} < 0`);

  for (const r of state.actions) {
    // 4. Отражение только у враждебных и только снимает защиту цели.
    if (r.outcome === 'blocked') {
      if (!r.hostile || r.target === undefined) fail(`отражённая невраждебная запись ${r.id}`);
      const only = r.effects.length === 1 && r.effects[0].type === 'protection' && r.effects[0].player === r.target && r.effects[0].value === null;
      if (!only) fail(`отражённая запись ${r.id} меняет не только защиту цели`);
    }
    // 11. Скрытый осколок V не виден наблюдению до акта III.
    if (r.act < 3 && r.intel?.kind === 'inventory' && r.intel.items.some(i => i.kind === 'shard' && i.ref === 'V')) {
      fail(`осколок V в Intel записи ${r.id}`);
    }
    // 12. Применённая или уничтоженная вещь исчезла.
    for (const e of r.effects) if (e.type === 'itemRemoved' && state.items[e.itemId]) fail(`вещь ${e.itemId} осталась после записи ${r.id}`);
  }

  for (const r of Object.values(state.requests)) {
    if (r.status !== 'pending') continue;
    // 8. Открытый запрос: участники на месте, резерв стоит; 10: открытые запросы только этого акта.
    if (r.approvers.length === 0) fail(`запрос ${r.id} без одобряющих`);
    for (const k of [r.author, ...r.approvers]) if (!present(k)) fail(`участник ${k} запроса ${r.id} не на ярмарке`);
    if (r.action.type === 'ability' && state.players[r.author]?.abilityPending !== r.id) fail(`у автора ${r.author} нет abilityPending ${r.id}`);
    if (r.action.type === 'item') {
      const it = state.items[r.action.itemId];
      if (it?.reservedFor !== r.id || it.owner.type !== 'player' || it.owner.key !== r.author) fail(`вещь ${r.action.itemId} не у автора в резерве ${r.id}`);
    }
    if (r.createdAt < state.clock.actStartedAt) fail(`открытый запрос ${r.id} из прошлого акта`);
  }
  // 9. abilityPending указывает только на открытый запрос.
  for (const [key, p] of Object.entries(state.players)) {
    if (p.abilityPending !== undefined && state.requests[p.abilityPending]?.status !== 'pending') fail(`abilityPending ${key} → закрытый запрос`);
  }
  // 8. У закрытых запросов вещей в резерве нет.
  for (const it of Object.values(state.items)) {
    const r = it.reservedFor !== undefined ? state.requests[it.reservedFor] : undefined;
    if (r && r.status !== 'pending') fail(`вещь ${it.id} в резерве закрытого запроса ${r.id}`);
  }
}

/**
 * Инвариант 10 сразу после ActStarted: открытых запросов нет, применения возвращены,
 * отметки акта сняты; проклятие и облик сравниваются с состоянием до смены акта.
 */
export function checkActStart(before: GameState, after: GameState): void {
  const fail = (msg: string) => { throw new Error(`инвариант 10: ${msg}`); };
  for (const r of Object.values(after.requests)) if (r.status === 'pending') fail(`запрос ${r.id} открыт`);
  for (const [key, p] of Object.entries(after.players)) {
    if (p.abilityUsedInAct || p.abilityPending !== undefined) fail(`применение ${key} не возвращено`);
    if (p.protection !== undefined || p.thorns || p.thornsBy !== undefined || p.discount || p.discountBy !== undefined) fail(`отметки акта у ${key}`);
    if (p.hostileAttemptsAgainstInAct !== 0) fail(`попытки против ${key}`);
    const was = before.players[key];
    if (p.curse !== was.curse) fail(`проклятие ${key} изменилось`);
    if (JSON.stringify(p.guise) !== JSON.stringify(was.guise)) fail(`облик ${key} изменился`);
  }
}

/** Золото игроков и алтарей. */
function goldInPlay(state: GameState): number {
  const players = Object.values(state.players).reduce((n, p) => n + p.gold, 0);
  const altars = Object.values(state.altars).reduce((n, a) => n + (a?.contributions ?? []).reduce((m, c) => m + (c.gold ?? 0), 0), 0);
  return players + altars;
}

/** Сколько золота событие выдало из банка (плюс) или забрало в банк (минус). */
function bankFlow(e: Event): number {
  switch (e.type) {
    case 'IngredientBought': case 'ItemCrafted': return -e.paidGold;
    case 'LotClosed': return e.winner !== undefined ? -(e.amount ?? 0) : 0;
    case 'LotBought': return -e.price;
    case 'Corrected': return e.change.field === 'gold' ? e.change.delta : 0;
    case 'AbilityUsed': case 'ItemUsed':
      return e.effects.reduce((n, x) => n + (x.type === 'gold' ? x.delta : 0), 0);
    default: return 0;
  }
}

/**
 * Инвариант 7: золото на руках и алтарях после открытия ярмарки меняется только известными потоками банка.
 * events — все события с начала сессии, state — состояние после них.
 */
export function checkGold(events: Event[], state: GameState): void {
  const open = events.findIndex(e => e.type === 'FairOpened');
  if (open < 0) return;
  const start = events[open];
  if (start.type !== 'FairOpened') return;
  const base = Object.values(start.players).reduce((n, p) => n + p.gold, 0);
  const flow = events.slice(open + 1).reduce((n, e) => n + bankFlow(e), 0);
  if (goldInPlay(state) !== base + flow) throw new Error(`инвариант: золото ${goldInPlay(state)} ≠ ${base} + ${flow}`);
}

const zeroCounts = (): Counts => ({ ash: 0, moon: 0, dew: 0 });
/** Набор для предложения: пустой, поверх него заданные поля. */
export const bundle = (b: Partial<Bundle> = {}): Bundle => ({ gold: 0, ingredients: zeroCounts(), items: [], ...b });

/**
 * Ведомая командами ярмарка для сценариев: каждая команда проходит через движок и должна быть принята.
 * Согласия на способности и вещи сразу даются всеми одобряющими.
 */
export class Fair {
  now = 1000;
  constructor(public s: GameState) {}

  run(cmd: Command, actor: Actor): Event[] {
    this.now += 1000;
    const r = run(this.s, cmd, actor, this.now);
    if (!r.ok) throw new Error(`${cmd.type} от ${actor.type === 'player' ? actor.roleKey : actor.type}: ${r.error} ${r.detail ?? ''}`);
    this.s = r.state;
    return r.events;
  }
  as(key: string, cmd: Command): Event[] { return this.run(cmd, player(key)); }
  correct(key: string, change: Correction): void { this.run({ type: 'gm.correct', playerKey: key, change, reason: 'сценарий теста' }, gm); }
  addGold(key: string, delta: number): void { this.correct(key, { field: 'gold', delta }); }
  addIngredients(key: string, c: Partial<Counts>): void {
    for (const [ingredient, delta] of Object.entries(c)) if (delta) this.correct(key, { field: 'ingredient', ingredient: ingredient as keyof Counts, delta });
  }
  /** Вещи игрока. */
  owned(key: string): Item[] { return Object.values(this.s.items).filter(i => i.owner.type === 'player' && i.owner.key === key); }
  /** Вещь по виду и ref где угодно. */
  find(kind: Item['kind'], ref: string): Item {
    const it = Object.values(this.s.items).find(i => i.kind === kind && i.ref === ref);
    if (!it) throw new Error(`нет вещи ${kind} ${ref}`);
    return it;
  }
  /** Перенос вещи от игрока к игроку исправлением ведущего. */
  moveTo(itemId: string, key: string): void { this.correct(key, { field: 'itemOwner', itemId, owner: { type: 'player', key } }); }
  /** Изготовление по рецепту: недостающие ингредиенты и золото докладывает ведущий. Возвращает id вещи. */
  craft(key: string, recipeId: string): string {
    const recipe = content.recipeById[recipeId];
    this.addIngredients(key, recipe.cost);
    const p = this.s.players[key];
    if (p.gold - p.reservedGold < recipe.gold + 1) this.addGold(key, recipe.gold + 1);
    const e = this.as(key, { type: 'shop.craft', recipeId }).find(x => x.type === 'ItemCrafted');
    if (e?.type !== 'ItemCrafted') throw new Error('нет ItemCrafted');
    return e.item.id;
  }
  /** Все одобряющие запроса из событий соглашаются. */
  private approve(events: Event[]): Event[] {
    const req = events.find(e => e.type === 'ConsentRequested');
    if (req?.type !== 'ConsentRequested') return events;
    const out = [...events];
    for (const by of req.request.approvers) out.push(...this.as(by, { type: 'consent.accept', id: req.request.id }));
    return out;
  }
  ability(key: string, use: AbilityUse): Event[] { return this.approve(this.as(key, { type: 'ability.use', use })); }
  useItem(key: string, itemId: string, target?: string, guise?: string): Event[] {
    return this.approve(this.as(key, { type: 'item.use', itemId, ...(target !== undefined ? { target } : {}), ...(guise !== undefined ? { guise } : {}) }));
  }
  /** Предложение from → to и его принятие. */
  trade(from: string, to: string, give: Partial<Bundle>, get: Partial<Bundle> = {}, service = false): void {
    const e = this.as(from, { type: 'offer.create', to, give: bundle(give), get: bundle(get), service });
    const created = e.find(x => x.type === 'OfferCreated');
    if (created?.type !== 'OfferCreated') throw new Error('нет OfferCreated');
    const done = this.as(to, { type: 'offer.accept', id: created.offer.id });
    if (!done.some(x => x.type === 'OfferAccepted')) throw new Error('сделка не состоялась');
  }
  /** Вклад на алтарь; возвращает id вклада. */
  contribute(key: string, side: AltarSide, what: { itemId: string } | { gold: number }): string {
    const e = this.as(key, { type: 'altar.contribute', side, ...what }).find(x => x.type === 'Contributed');
    if (e?.type !== 'Contributed') throw new Error('нет Contributed');
    return e.contribution.id;
  }
  nextAct(): void { this.run({ type: 'act.next' }, gm); }
  /** Лот текущего акта уходит игроку закрытой ставкой в 1 золото. */
  winLot(key: string, act: 2 | 3): void {
    const lot = Object.values(this.s.lots).find(l => l.act === act && l.status === 'announced');
    if (!lot) throw new Error(`нет лота акта ${act}`);
    this.run({ type: 'lot.sealedBids', id: lot.id }, gm);
    this.as(key, { type: 'lot.bid', id: lot.id, amount: 1 });
    this.run({ type: 'lot.close', id: lot.id }, gm);
  }
}
