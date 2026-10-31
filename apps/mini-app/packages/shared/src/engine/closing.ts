import { hiddenGoals } from './hidden17';
// Итоги закрытия ярмарки (спецификация этапа 5, §3–4): чистые функции без времени и случайности.
import { ABILITY_BY_ROLE } from '../abilities';
import type { Content } from '../content';
import { GOALS, type GoalCondition } from '../goals';
import type { ActionRecord, AltarResult, AltarSide, Closing, GameState, Item, Side, TradeRecord, TradeSide } from '../types';
import { INGREDIENTS } from './bundles';

/** Порог готовности алтаря (§3.1). */
const READY = { shards: 3, focuses: 2, gold: 6, donors: 3 };
/** Изделия мастерской для holdCraftedKinds. */
const CRAFTED: Item['kind'][] = ['potion', 'ward', 'focus', 'shape'];

/** Подсчёт по каждому алтарю: разные осколки, Фокусы, золото, разные дарители золота. */
export function altarResults(state: GameState): AltarResult[] {
  return Object.values(state.altars).flatMap(altar => {
    if (!altar) return [];
    const items = altar.contributions.flatMap(c => (c.item !== undefined && state.items[c.item] ? [state.items[c.item]] : []));
    const golds = altar.contributions.filter(c => (c.gold ?? 0) > 0);
    const shards = new Set(items.filter(i => i.kind === 'shard').map(i => i.ref)).size;
    const focuses = items.filter(i => i.kind === 'focus').length;
    const gold = golds.reduce((n, c) => n + (c.gold ?? 0), 0);
    const donors = new Set(golds.map(c => c.player)).size;
    const ready = shards >= READY.shards && focuses >= READY.focuses && gold >= READY.gold && donors >= READY.donors;
    return [{ side: altar.side, shards, focuses, gold, donors, ready }];
  });
}

// --- Вспомогательное ---

const ownedBy = (state: GameState, key: string) =>
  Object.values(state.items).filter(i => i.owner.type === 'player' && i.owner.key === key);

/** Сторона сделки, которую отдал игрок, и что он получил; undefined, если он не участник. */
function tradeFor(t: TradeRecord, key: string): { gave: TradeSide; got: TradeSide; partner: string } | undefined {
  if (t.from === key) return { gave: t.give, got: t.get, partner: t.to };
  if (t.to === key) return { gave: t.get, got: t.give, partner: t.from };
  return undefined;
}

/** В стороне сделки есть золото, ингредиент или вещь (слух не в счёт). */
const hasGoods = (side: TradeSide) => side.gold > 0 || INGREDIENTS.some(k => side.ingredients[k] > 0) || side.items.length > 0;

/** Записи способности автора без копий; при kind — только этого вида. */
const doneAbility = (state: GameState, key: string, kind = ABILITY_BY_ROLE[key]): ActionRecord[] =>
  state.actions.filter(a => a.author === key && a.outcome === 'done' && a.source.type === 'ability'
    && a.source.ability === kind && a.source.copied === undefined);

const distinctTargets = (records: ActionRecord[]) => new Set(records.flatMap(r => (r.target !== undefined ? [r.target] : []))).size;

/** Вклады игрока на алтарь стороны, оставшиеся при закрытии. */
const contributions = (state: GameState, key: string, side: AltarSide) =>
  (state.altars[side]?.contributions ?? []).filter(c => c.player === key);

const contributedItems = (state: GameState, key: string, side: AltarSide) =>
  contributions(state, key, side).flatMap(c => (c.item !== undefined && state.items[c.item] ? [state.items[c.item]] : []));

/** Свои изделия, ушедшие по сделкам: сколько вещей и кому. pay — сколько золота пришло в ответ. */
function givenCrafted(state: GameState, key: string, match: (it: TradeSide['items'][number], paid: number) => boolean) {
  let count = 0;
  const receivers = new Set<string>();
  for (const t of state.trades) {
    const side = tradeFor(t, key);
    if (!side) continue;
    const mine = side.gave.items.filter(it => it.createdBy === key && match(it, side.got.gold));
    if (mine.length === 0) continue;
    count += mine.length;
    receivers.add(side.partner);
  }
  return { count, receivers: receivers.size };
}

// --- Условия: по функции на вид ---

const holdItem = (s: GameState, key: string, c: Extract<GoalCondition, { type: 'holdItem' }>) =>
  ownedBy(s, key).some(i => i.ref === c.ref);

const holdRelics = (s: GameState, key: string, c: Extract<GoalCondition, { type: 'holdRelics' }>) =>
  new Set(ownedBy(s, key).filter(i => i.kind === 'relic').map(i => i.ref)).size >= c.count;

const holdCraftedKinds = (s: GameState, key: string, c: Extract<GoalCondition, { type: 'holdCraftedKinds' }>) =>
  new Set(ownedBy(s, key).filter(i => CRAFTED.includes(i.kind)).map(i => i.kind)).size >= c.count;

const holdKind = (s: GameState, key: string, c: Extract<GoalCondition, { type: 'holdKind' }>) =>
  ownedBy(s, key).filter(i => i.kind === c.kind).length >= c.count;

const holdClues = (s: GameState, key: string, c: Extract<GoalCondition, { type: 'holdClues' }>) =>
  new Set(ownedBy(s, key).filter(i => i.kind === 'clue').map(i => i.ref)).size >= c.count;

const goldAtLeast = (s: GameState, key: string, c: Extract<GoalCondition, { type: 'goldAtLeast' }>) =>
  (s.players[key]?.gold ?? 0) >= c.value;

const craftedKinds = (s: GameState, key: string, c: Extract<GoalCondition, { type: 'craftedKinds' }>) =>
  new Set(s.crafts.filter(r => r.player === key).map(r => r.kind)).size >= c.count;

function soldCrafted(s: GameState, key: string, c: Extract<GoalCondition, { type: 'soldCrafted' }>): boolean {
  const sold = givenCrafted(s, key, (_it, paid) => paid >= c.minPrice);
  return sold.count >= c.count && sold.receivers >= c.distinctBuyers;
}

function gaveKind(s: GameState, key: string, c: Extract<GoalCondition, { type: 'gaveKind' }>): boolean {
  const given = givenCrafted(s, key, it => it.kind === c.kind);
  return given.count >= c.count && given.receivers >= c.distinctReceivers;
}

function exchanges(s: GameState, key: string, c: Extract<GoalCondition, { type: 'exchanges' }>): boolean {
  const partners = new Set<string>();
  for (const t of s.trades) {
    const side = tradeFor(t, key);
    if (side && hasGoods(side.gave) && hasGoods(side.got)) partners.add(side.partner);
  }
  return partners.size >= c.distinctPartners;
}

function servicePaid(s: GameState, key: string, c: Extract<GoalCondition, { type: 'servicePaid' }>): boolean {
  const payers = new Set<string>();
  for (const t of s.trades) {
    const side = t.service ? tradeFor(t, key) : undefined;
    if (side && side.got.gold >= c.minGold) payers.add(side.partner);
  }
  return payers.size >= c.distinctPayers;
}

function abilityUsed(s: GameState, key: string, c: Extract<GoalCondition, { type: 'abilityUsed' }>): boolean {
  const records = doneAbility(s, key);
  return records.length >= c.count && (c.distinctTargets === undefined || distinctTargets(records) >= c.distinctTargets);
}

/** Запись применения вещи вида kind. */
const itemRecords = (s: GameState, kind: 'potion' | 'ward' | 'shape') =>
  s.actions.filter(a => a.outcome === 'done' && a.source.type === 'item' && a.source.kind === kind);

const shapeSelf = (s: GameState, key: string) =>
  itemRecords(s, 'shape').some(a => a.author === key && a.target === key);

const potionOnOther = (s: GameState, key: string) =>
  itemRecords(s, 'potion').some(a => a.author === key && a.target !== undefined && a.target !== key);

/** С игрока сняли проклятие зельем (любого автора) или очищением способности. */
const cleansed = (s: GameState, key: string) =>
  s.actions.some(a => a.target === key && a.outcome === 'done' && a.removed?.curse === true
    && (a.source.type === 'item' ? a.source.kind === 'potion' : a.source.ability === 'cleanseOther'));

const cleanseOthers = (s: GameState, key: string, c: Extract<GoalCondition, { type: 'cleanseOthers' }>) =>
  distinctTargets(doneAbility(s, key, 'cleanseOther').filter(a => a.removed?.curse || a.removed?.thorns)) >= c.distinctTargets;

const protectedOthers = (s: GameState, key: string, c: Extract<GoalCondition, { type: 'protectedOthers' }>) =>
  distinctTargets(doneAbility(s, key, 'protectOther')) >= c.distinctTargets;

const contributedGold = (s: GameState, key: string, c: Extract<GoalCondition, { type: 'contributedGold' }>) =>
  contributions(s, key, c.side).reduce((n, x) => n + (x.gold ?? 0), 0) >= c.value;

const contributedFocus = (s: GameState, key: string, c: Extract<GoalCondition, { type: 'contributedFocus' }>) =>
  contributedItems(s, key, c.side).filter(i => i.kind === 'focus').length >= c.count;

const contributedShard = (s: GameState, key: string, c: Extract<GoalCondition, { type: 'contributedShard' }>) =>
  contributedItems(s, key, c.side).some(i => i.kind === 'shard');

/** Выполнена ли цель роли по состоянию и журналам (без ручных исправлений ведущего). */
export function goalDone(state: GameState, _content: Content, roleKey: string, cond: GoalCondition): boolean {
  switch (cond.type) {
    case 'holdItem': return holdItem(state, roleKey, cond);
    case 'holdRelics': return holdRelics(state, roleKey, cond);
    case 'holdCraftedKinds': return holdCraftedKinds(state, roleKey, cond);
    case 'holdKind': return holdKind(state, roleKey, cond);
    case 'holdClues': return holdClues(state, roleKey, cond);
    case 'goldAtLeast': return goldAtLeast(state, roleKey, cond);
    case 'craftedKinds': return craftedKinds(state, roleKey, cond);
    case 'soldCrafted': return soldCrafted(state, roleKey, cond);
    case 'exchanges': return exchanges(state, roleKey, cond);
    case 'servicePaid': return servicePaid(state, roleKey, cond);
    case 'abilityUsed': return abilityUsed(state, roleKey, cond);
    case 'shapeSelf': return shapeSelf(state, roleKey);
    case 'cleansed': return cleansed(state, roleKey);
    case 'cleanseOthers': return cleanseOthers(state, roleKey, cond);
    case 'contributedGold': return contributedGold(state, roleKey, cond);
    case 'contributedFocus': return contributedFocus(state, roleKey, cond);
    case 'contributedShard': return contributedShard(state, roleKey, cond);
    case 'gaveKind': return gaveKind(state, roleKey, cond);
    case 'protectedOthers': return protectedOthers(state, roleKey, cond);
    case 'potionOnOther': return potionOnOther(state, roleKey);
  }
}

/** Сторона, по которой считается исход: у свободных — выбранная, иначе 'free'. */
export function sideOf(state: GameState, content: Content, key: string): Side {
  if (state.story?.sides[key]) return state.story.sides[key];
  const side = content.roleByKey[key]?.side ?? 'free';
  return side === 'free' ? state.players[key].side ?? 'free' : side;
}

/**
 * Итоги закрытия (§3): алтари, исход, «Правда», личные цели присутствующих участников.
 * Ручные отметки ведущего (goalOverrides) заменяют расчёт цели.
 */
export function computeClosing(state: GameState, content: Content, closedAt: number): Closing {
  if (state.hidden17) {
    const goals = hiddenGoals(state, content);
    return { closedAt, altars: [], outcome: 'sleep', warnings: [], players: Object.fromEntries(state.roster.filter(k => state.players[k]?.present).map(k => [k, { goals: goals[k], outcome: false, truth: state.hidden17!.facts.truth, side: 'free' as const }])) };
  }
  const altars = altarResults(state);
  const ready = altars.filter(a => a.ready).map(a => a.side);
  const outcome: Closing['outcome'] = ready.length === 1 ? ready[0] : 'sleep';
  // названия алтарей как в проекции (views.ts): «Алтарь пробуждения», «Алтарь подчинения»
  const altarName = (side: AltarSide) => content.factions.find(f => f.id === side)?.altar ?? side;
  const warnings = ready.length >= 2 ? [`два готовых алтаря: ${ready.map(altarName).join(', ')}`] : [];
  const present = state.roster.filter(k => state.players[k]?.present === true);
  const truthHolder = present.find(k => holdClues(state, k, { type: 'holdClues', count: 3 }));

  const players: Closing['players'] = {};
  for (const key of present) {
    const side = sideOf(state, content, key);
    const overrides = state.players[key].goalOverrides;
    const goal = (i: 0 | 1) => overrides?.[i] ?? goalDone(state, content, key, GOALS[key][i]);
    players[key] = { goals: [goal(0), goal(1)], outcome: outcome !== 'sleep' && side === outcome, truth: key === truthHolder, side };
  }
  return { closedAt, altars, outcome, warnings, ...(truthHolder !== undefined ? { truthHolder } : {}), players };
}
