// Проверки прогона вечера (спецификация этапа 6, §3): ответы, инварианты, проекции, воспроизведение, покрытие.
import { isDeepStrictEqual } from 'node:util';
import {
  ABILITY_BY_ROLE, COMMAND_TYPES, checkActStart, checkGold, checkInvariants,
  type AbilityKind, type Content, type Event, type GameState, type PlayerView,
} from '@fair/shared';
import type { BotConn } from './client';
import type { CheckResult, CommandLog } from './evening';
import { forbiddenStrings, privacyViolations } from './privacy';
import { ALLOWED_INVALID } from './uses';

/** Отказы, допустимые на любом шаге (§3.1): ресурсы, резерв, лимит, вещь ушла, фаза. */
const ALLOWED_ERRORS = new Set(['insufficient', 'reserved', 'limit', 'not_found', 'not_owner', 'phase']);
/** Отказ ведущему на lot.close, когда торг уже закрыл сервер по сроку (§2.3, акт II). Текст из engine/lots.ts. */
const GM_LATE_CLOSE = 'закрытые ставки не идут';
/**
 * Причины ConsentClosed failed, допустимые как отказы §3.1: тексты FAIL_REASONS из engine/consent.ts
 * для допустимых кодов и русские detail этих кодов из engine/*.ts (движок ставит detail вместо текста по коду).
 * Строки с параметром заданы префиксом. Тест сверяет каждую строку с исходниками движка.
 */
export const ALLOWED_FAIL_REASONS = [
  // FAIL_REASONS: insufficient, limit, not_found, not_owner, reserved, phase.
  'не хватает ресурсов', 'уже есть', 'участника нет на ярмарке', 'вещи у автора уже нет', 'вещь занята', 'сейчас нельзя',
  // insufficient
  'в мастерской меньше двух Рос', 'в мастерской не хватает ингредиентов', 'у цели нечего взять', 'не хватает золота',
  // limit
  'по этому игроку в этом акте уже была враждебная попытка', 'способность в этом акте уже применена',
  'у получателя уже есть защита', 'защита уже есть',
  // not_found, not_owner, reserved, phase
  'цели нет на ярмарке', 'участник не на ярмарке', 'вещи больше нет у автора', 'вещь в резерве сделки', 'часы на паузе',
];
/** Префиксы detail с параметром (ингредиент): insufficient. */
export const ALLOWED_FAIL_PREFIXES = ['в мастерской мало: ', 'в мастерской нет: ', 'нет ингредиента: ', 'не хватает ингредиента: '];

const allowedFailReason = (reason: string) =>
  ALLOWED_FAIL_REASONS.includes(reason) || ALLOWED_FAIL_PREFIXES.some(p => reason.startsWith(p));
/** Копия START_GOLD из engine/session.ts. */
const START_GOLD = 6;
/** Вещи, применение которых обязательно в покрытии (§3.6). */
const ITEM_KINDS = ['potion', 'ward', 'shape'];

const result = (name: string, details: string[]): CheckResult => ({ name, ok: details.length === 0, details });
const describe = (e: CommandLog) => `#${e.turn} ${e.actor} ${e.cmd.type}: ${e.outcome.ok ? 'ok' : `${e.outcome.error}${e.outcome.detail ? ` (${e.outcome.detail})` : ''}`}`;

/**
 * §3.1: каждый отказ — из допустимых; invalid только из белого списка способностей (по detail);
 * forbidden и прочее только в нарочных пробах, где ожидаемый код обязан совпасть.
 * Со state проверяются и причины просьб, закрытых failed (белый список по виду автора).
 */
export function checkResponses(log: CommandLog[], state?: GameState): CheckResult {
  const bad: string[] = [];
  for (const e of log) {
    const o = e.outcome;
    if (e.expectedRefusal !== undefined) {
      if (o.ok || o.error !== e.expectedRefusal) bad.push(`проба ожидала ${e.expectedRefusal}: ${describe(e)}`);
      continue;
    }
    if (o.ok || ALLOWED_ERRORS.has(o.error ?? '')) continue;
    if (o.error === 'invalid') {
      if (e.cmd.type === 'ability.use' && ALLOWED_INVALID[e.cmd.use.kind].some(t => o.detail?.includes(t))) continue;
      if (e.actor === 'gm' && e.cmd.type === 'lot.close' && o.detail === GM_LATE_CLOSE) continue;
    }
    bad.push(`недопустимый отказ: ${describe(e)}`);
  }
  for (const r of Object.values(state?.requests ?? {})) {
    if (r.status !== 'failed') continue;
    const reason = r.reason ?? '';
    const whitelist = r.action.type === 'ability' ? ALLOWED_INVALID[r.action.use.kind] : [];
    if (allowedFailReason(reason) || whitelist.some(t => reason.includes(t))) continue;
    bad.push(`просьба ${r.author} (${r.action.type === 'ability' ? r.action.use.kind : 'вещь'}) не исполнилась: ${reason}`);
  }
  return result('responses', bad);
}

/** Метки пар снимков вокруг act.next: сценарий пишет «act.next N: до» и «act.next N: после». */
export const actNextLabel = (act: number, when: 'до' | 'после') => `act.next ${act}: ${when}`;

/** §3.2: checkInvariants на каждом снимке, checkActStart на парах до и после act.next. */
export function checkInvariantsAt(snapshots: { label: string; state: GameState }[]): CheckResult {
  const bad: string[] = [];
  const at = (label: string) => snapshots.find(s => s.label === label)?.state;
  for (const s of snapshots) {
    try { checkInvariants(s.state); } catch (err) { bad.push(`${s.label}: ${(err as Error).message}`); }
  }
  for (const act of [2, 3]) {
    const before = at(actNextLabel(act, 'до'));
    const after = at(actNextLabel(act, 'после'));
    if (!before || !after) { bad.push(`нет пары снимков вокруг act.next ${act}`); continue; }
    try { checkActStart(before, after); } catch (err) { bad.push(`act.next ${act}: ${(err as Error).message}`); }
  }
  return result('invariants', bad);
}

const ownedCount = (state: GameState, role: string) =>
  Object.values(state.items).filter(i => i.owner.type === 'player' && i.owner.key === role).length;

/**
 * §3.3 при равных seq: золото и число вещей в проекции равны состоянию ведущего; приватность (privacy.ts);
 * текста «Правды» нет; в revealed есть итоги и две цели.
 */
export function checkViews(bots: Record<string, BotConn>, gmState: GameState, content: Content): CheckResult {
  const bad: string[] = [];
  const truth = [content.story.truth, content.story.truth_read].filter(t => t.trim().length > 0);
  for (const [role, bot] of Object.entries(bots)) {
    const view = bot.view() as PlayerView;
    if (bot.seq() !== gmState.seq) bad.push(`${role}: seq ${bot.seq()} ≠ ${gmState.seq}`);
    const p = gmState.players[role];
    if (view.me.player.gold !== p.gold) bad.push(`${role}: золото ${view.me.player.gold} ≠ ${p.gold}`);
    const owned = ownedCount(gmState, role);
    if (view.me.items.length !== owned) bad.push(`${role}: вещей ${view.me.items.length} ≠ ${owned}`);
    const json = JSON.stringify(view);
    for (const v of privacyViolations(json, view, forbiddenStrings(content, gmState, role))) bad.push(`${role}: ${v}`);
    if (truth.some(t => json.includes(JSON.stringify(t).slice(1, -1)))) bad.push(`${role}: текст «Правды» в проекции`);
    if (gmState.phase === 'revealed') {
      if (!view.closing) bad.push(`${role}: нет итогов в revealed`);
      if (view.me.goals.length !== 2) bad.push(`${role}: целей ${view.me.goals.length}, ожидалось 2`);
    }
  }
  return result('views', bad);
}

/** Подготовка (§2.3): у каждого стартовые золото, ингредиенты и вещи по содержимому. */
export function checkStart(bots: Record<string, BotConn>, gmState: GameState, content: Content): CheckResult {
  const bad: string[] = [];
  if (gmState.phase !== 'act1') bad.push(`фаза ${gmState.phase}, ожидалась act1`);
  for (const [role, bot] of Object.entries(bots)) {
    const view = bot.view() as PlayerView;
    const r = content.roleByKey[role];
    if (view.me.player.gold !== START_GOLD) bad.push(`${role}: золото ${view.me.player.gold}`);
    if (!isDeepStrictEqual(r.bundle, view.me.player.ingredients)) bad.push(`${role}: ингредиенты ${JSON.stringify(view.me.player.ingredients)}`);
    const refs = new Set(view.me.items.map(i => `${i.kind}:${i.ref}`));
    const expected = [
      ...content.relics.filter(x => x.owner === role).map(x => `relic:${x.name}`),
      ...content.shards.filter(x => x.owner === role).map(x => `shard:${x.id}`),
    ];
    for (const e of expected) if (!refs.has(e)) bad.push(`${role}: нет стартовой вещи ${e}`);
    if (view.me.items.length !== ownedCount(gmState, role)) bad.push(`${role}: вещей ${view.me.items.length} ≠ ${ownedCount(gmState, role)}`);
  }
  return result('start', bad);
}

/** Команды, которые прогон не обязан выполнить (§3.6): системные и сброс; при 30 ещё выкуп. */
function excludedCommands(players: 12 | 30): Set<string> {
  const ex = new Set(['offer.expire', 'consent.expire', 'session.reset']);
  if (players === 30) ex.add('lot.buyout');
  return ex;
}

/** Способность роли сработала (§2.4): done-запись своего вида или принятая просьба. */
function abilityWorked(state: GameState, role: string, kind: AbilityKind): boolean {
  return state.actions.some(a => a.author === role && a.source.type === 'ability' && a.source.ability === kind && a.outcome === 'done')
    || Object.values(state.requests).some(r => r.author === role && r.action.type === 'ability' && r.status === 'accepted');
}

/** Недостающее покрытие §3.6 и пояснения к исключениям. */
export function coverageOf(log: CommandLog[], players: 12 | 30, state: GameState, itemKinds: Record<string, string>) {
  const done = new Set(log.filter(e => e.outcome.ok && e.expectedRefusal === undefined).map(e => e.cmd.type as string));
  const excluded = excludedCommands(players);
  const missingCommands = Object.keys(COMMAND_TYPES).filter(t => !excluded.has(t) && !done.has(t)).sort();

  const notes: string[] = [];
  const present = state.roster.filter(k => state.players[k]?.present);
  const protector = present.some(k => ABILITY_BY_ROLE[k] === 'protectOther');
  const missingAbilities: string[] = [];
  for (const role of present) {
    const kind = ABILITY_BY_ROLE[role];
    if (abilityWorked(state, role, kind)) continue;
    // Перенос Клёпы возможен только со своей защитой; без защитника способность не проверяется.
    if (kind === 'transferProtection' && !protector) { notes.push(`${role} (${kind}): не сработала — нет защитника`); continue; }
    missingAbilities.push(`${role}:${kind}`);
  }

  const used = new Set(log.filter(e => e.cmd.type === 'item.use' && e.outcome.ok).map(e => itemKinds[(e.cmd as { itemId: string }).itemId]));
  const missingItems = ITEM_KINDS.filter(k => !used.has(k));
  return { missingCommands, missingAbilities, missingItems, notes };
}

/** §3.6: все команды (кроме исключений), способности присутствующих ролей и виды вещей. */
export function checkCoverage(log: CommandLog[], players: 12 | 30, state: GameState, itemKinds: Record<string, string> = {}): CheckResult {
  const c = coverageOf(log, players, state, itemKinds);
  const details = [
    ...c.missingCommands.map(t => `команда без ok: ${t}`),
    ...c.missingAbilities.map(a => `способность не сработала: ${a}`),
    ...c.missingItems.map(k => `вещь не применена: ${k}`),
  ];
  return { name: 'coverage', ok: details.length === 0, details: [...details, ...c.notes] };
}

/** Верхние ключи, в которых состояния расходятся: для понятного отчёта. */
function diffKeys(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => !isDeepStrictEqual(a[k], b[k])).sort();
}

/** §3.4: состояние из журнала базы совпадает с последней проекцией ведущего; без replay — пропуск. */
export function checkReplay(final: GameState, replayed?: GameState): CheckResult {
  if (!replayed) return { name: 'replay', ok: true, details: ['пропущено: воспроизведение журнала не передано'] };
  const a = JSON.parse(JSON.stringify(replayed)) as Record<string, unknown>;
  const b = JSON.parse(JSON.stringify(final)) as Record<string, unknown>;
  if (isDeepStrictEqual(a, b)) return result('replay', []);
  return result('replay', [`состояние из журнала расходится с проекцией ведущего: ${diffKeys(a, b).join(', ')}`]);
}

/** §3.2 checkGold по событиям из базы; без events — пропуск. */
export function checkGoldLog(events: Event[] | undefined, state: GameState): CheckResult {
  if (!events) return { name: 'gold', ok: true, details: ['пропущено: журнал событий не передан'] };
  try {
    checkGold(events, state);
    return result('gold', []);
  } catch (err) {
    return result('gold', [(err as Error).message]);
  }
}
