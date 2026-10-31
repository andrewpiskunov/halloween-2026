// Инварианты §6.8 по состоянию и журналу: общие для тестов движка и прогона вечера (@fair/sim).
// Без node:* и чтения файлов: пакет собирается и в клиент.
import type { Event } from './events';
import type { GameState } from './types';
import { available } from './engine';
import { isClosed } from './engine/guards';
import { START_GOLD } from './engine/session';

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
    // Этап 7, §2.2: присутствующий после открытия получил стартовый набор.
    if (state.phase !== 'setup' && present(key) && p.startIssuedAt === undefined) fail(`у ${key} нет стартового набора`);
    // 1. Защита только у присутствующего; у ушедшего после открытия она остаётся (этап 7, §2.3).
    if (p.protection !== undefined && !present(key) && p.startIssuedAt === undefined) fail(`защита у отсутствующего ${key}`);
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
    if (!state.hidden17 && r.act < 3 && r.intel?.kind === 'inventory' && r.intel.items.some(i => i.kind === 'shard' && i.ref === 'V')) {
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
  checkClosed(state, present);
}

/** Этап 5, §8: после закрытия всё заморожено, итоги есть ровно для присутствующих; до закрытия итогов нет. */
function checkClosed(state: GameState, present: (k: string) => boolean): void {
  const fail = (msg: string) => { throw new Error(`инвариант закрытия: ${msg}`); };
  if (!isClosed(state)) {
    if (state.closing !== undefined) fail(`итоги в фазе ${state.phase}`);
    return;
  }
  for (const o of Object.values(state.offers)) if (o.status === 'pending') fail(`открытое предложение ${o.id}`);
  for (const r of Object.values(state.requests)) if (r.status === 'pending') fail(`открытый запрос ${r.id}`);
  for (const l of Object.values(state.lots)) if (l.status === 'openBidding' || l.status === 'sealedBidding') fail(`торг за лот ${l.id}`);
  for (const [key, p] of Object.entries(state.players)) {
    if (p.reservedGold !== 0) fail(`резерв золота у ${key}`);
    if (p.abilityPending !== undefined) fail(`abilityPending у ${key}`);
  }
  for (const it of Object.values(state.items)) if (it.reservedFor !== undefined) fail(`вещь ${it.id} в резерве`);
  if (!state.closing) fail('нет итогов');
  const keys = Object.keys(state.closing!.players).sort();
  const expected = state.roster.filter(present).sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) fail(`итоги для ${keys.join(',')}, присутствуют ${expected.join(',')}`);
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
    case 'Hidden17Changed': return e.bankDelta ?? 0;
    case 'IngredientBought': case 'ItemCrafted': return -e.paidGold;
    case 'LotClosed': return e.winner !== undefined ? -(e.amount ?? 0) : 0;
    case 'LotBought': return -e.price;
    case 'Corrected': return e.change.field === 'gold' ? e.change.delta : 0;
    // Стартовое золото опоздавшего: 6, как при открытии.
    case 'PlayerArrived': return e.startSet ? START_GOLD : 0;
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
