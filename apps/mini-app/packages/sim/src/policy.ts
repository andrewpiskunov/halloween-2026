// Политика бота-игрока (спецификация этапа 6, §2.3): одно действие за ход и ответы на входящие.
// Решения принимаются только по проекции игрока; выбор через rng по стабильным ключам.
import { GOALS, type AltarSide, type Bundle, type Command, type GoalCondition, type Item, type PlayerView, type Want } from '@fair/shared';
import { ALTAR_KINDS, BUY_PRICE, INGREDIENTS, MAX_GUISE, RECIPE_BY_KIND, freeItems as ownFree } from './items';
import type { Rng } from './rng';
import { HOSTILE, useFor } from './uses';

export type Act = 1 | 2 | 3;

/**
 * Память бота между ходами. abilityUsedAct и bids живут весь вечер;
 * serviceDone, cancelDone, withdrawDone оркестратор сбрасывает в начале акта
 * (и заранее ставит true тем, кому отмена или изъятие в этом акте не поручены).
 */
export interface TurnMemory {
  abilityUsedAct: Act | null;
  /** Рецепт, ингредиенты для которого куплены: изготовить на следующем ходу. */
  boughtPending: string | null;
  serviceDone: boolean;
  cancelDone: boolean;
  withdrawDone: boolean;
  /** id лота → моя последняя ставка. */
  bids: Record<string, number>;
}

const RECIPE_IDS = ['cleanse', 'focus', 'shape', 'ward'];
/** Вклад золотом на алтарь по §2.3. */
const ALTAR_GOLD = 2;

const empty = (): Bundle => ({ gold: 0, ingredients: { ash: 0, moon: 0, dew: 0 }, items: [] });
const goalsOf = (roleKey: string): GoalCondition[] => GOALS[roleKey] ?? [];

/** Рецепт по целям роли: изготовление любых видов — любой, конкретный вид — его рецепт; иначе случайный. */
export function recipeFor(roleKey: string, rng: Rng): string {
  const needed: string[] = [];
  for (const g of goalsOf(roleKey)) {
    switch (g.type) {
      case 'craftedKinds': case 'holdCraftedKinds': case 'soldCrafted': needed.push(...RECIPE_IDS); break;
      case 'gaveKind': case 'holdKind': needed.push(RECIPE_BY_KIND[g.kind] ?? 'cleanse'); break;
      case 'contributedFocus': needed.push('focus'); break;
      case 'potionOnOther': needed.push('cleanse'); break;
      case 'shapeSelf': needed.push('shape'); break;
      default: break;
    }
  }
  const list = [...new Set(needed)].sort();
  return rng.pick(list.length > 0 ? list : RECIPE_IDS);
}

/** Мои свободные вещи; скрытый осколок до акта III не трогаем. */
const freeItems = (view: PlayerView, act: Act, kinds?: Item['kind'][]): Item[] => ownFree(view, kinds, act === 3);

/** Следующий присутствующий по составу после меня (по кругу). */
function neighbour(view: PlayerView, roster: string[]): string | null {
  const present = new Set(view.others.map(o => o.roleKey));
  const me = roster.indexOf(view.me.role.key);
  for (let i = 1; i <= roster.length; i++) {
    const k = roster[(me + i) % roster.length];
    if (k !== view.me.role.key && present.has(k)) return k;
  }
  return null;
}

/** Ставка: строго выше прежней (из памяти или из lots[].bids), не больше свободного золота; иначе null. */
export function bidFor(view: PlayerView, lotId: string, mem: TurnMemory, rng: Rng): number | null {
  const lot = view.lots.find(l => l.id === lotId);
  if (!lot) return null;
  const seen = lot.bids.filter(b => b.player === view.me.role.key).map(b => b.amount);
  const prev = Math.max(0, mem.bids[lotId] ?? 0, ...seen);
  const gold = view.me.available.gold;
  if (gold < prev + 1) return null;
  const amount = rng.int(prev + 1, Math.min(gold, prev + 2));
  mem.bids[lotId] = amount;
  return amount;
}

/**
 * Ответы на входящие: предложения мне — принять, если свободного золота после сделки не меньше 1;
 * просьбы, где я одобряющий и ещё не одобрил, — о способности принять, о вещи принять с вероятностью 3/4.
 */
export function answerIncoming(view: PlayerView, rng: Rng): Command[] {
  const me = view.me.role.key;
  const out: Command[] = [];
  // Остаток золота ведётся по циклу: следующее предложение оценивается после принятых.
  let gold = view.me.available.gold;
  for (const o of view.offers) {
    if (o.to !== me || o.status !== 'pending') continue;
    // Я отдаю get и получаю give.
    const after = gold - o.get.gold + o.give.gold;
    if (after >= 1) gold = after;
    out.push({ type: after >= 1 ? 'offer.accept' : 'offer.decline', id: o.id });
  }
  for (const r of view.requests) {
    if (r.status !== 'pending' || !r.approvers.includes(me) || r.approved.includes(me)) continue;
    const yes = r.action.type === 'ability' || rng.chance(0.75);
    out.push({ type: yes ? 'consent.accept' : 'consent.decline', id: r.id });
  }
  return out;
}

/** Пункт 1: своя способность раз за акт; враждебные в акте I пропускаются. */
function ability(view: PlayerView, act: Act, mem: TurnMemory, rng: Rng): Command | null {
  const a = view.me.ability;
  if (mem.abilityUsedAct === act || a.state !== 'available') return null;
  if (act === 1 && HOSTILE.has(a.kind)) return null;
  const use = useFor(a.kind, view, rng);
  if (!use) return null;
  mem.abilityUsedAct = act;
  return { type: 'ability.use', use };
}

/** Пункт 2: купить недостающий ингредиент, на следующем ходу изготовить; если всё есть — изготовить сразу. */
function craft(view: PlayerView, mem: TurnMemory, rng: Rng): Command | null {
  if (mem.boughtPending !== null) {
    const recipeId = mem.boughtPending;
    mem.boughtPending = null;
    return { type: 'shop.craft', recipeId };
  }
  const recipe = view.recipes.find(r => r.id === recipeFor(view.me.role.key, rng));
  if (!recipe) return null;
  const have = view.me.available;
  const lacking = INGREDIENTS.filter(k => (recipe.cost[k] ?? 0) > have.ingredients[k]);
  if (lacking.length === 0) return have.gold >= recipe.gold ? { type: 'shop.craft', recipeId: recipe.id } : null;
  if (lacking.length > 1) return null;
  const k = lacking[0];
  const count = (recipe.cost[k] ?? 0) - have.ingredients[k];
  if (view.workshop[k] < count || have.gold < BUY_PRICE * count + recipe.gold) return null;
  mem.boughtPending = recipe.id;
  return { type: 'shop.buy', ingredient: k, ...(count > 1 ? { count } : {}) };
}

/** Акт III: зелье на себя или другого, талисман на себя, Камень облика; вещи, нужные целям «держать», не тратятся. */
function useItem(view: PlayerView, rng: Rng): Command | null {
  const me = view.me.role.key;
  const goals = goalsOf(me);
  const keep = new Set<Item['kind']>(goals.flatMap(g => (g.type === 'holdKind' ? [g.kind] : [])));
  const items = freeItems(view, 3, ['potion', 'ward', 'shape']).filter(i => !keep.has(i.kind));
  const others = view.others.map(o => o.roleKey).sort();
  for (const it of items) {
    if (it.kind === 'ward') {
      if (view.me.player.protection !== undefined) continue;
      return { type: 'item.use', itemId: it.id };
    }
    if (it.kind === 'potion') {
      const onOther = others.length > 0 && (goals.some(g => g.type === 'potionOnOther') || rng.chance(0.5));
      return { type: 'item.use', itemId: it.id, ...(onOther ? { target: rng.pick(others) } : {}) };
    }
    const guise = `Тень ${view.me.role.name}`.slice(0, MAX_GUISE);
    const onSelf = others.length === 0 || goals.some(g => g.type === 'shapeSelf');
    return { type: 'item.use', itemId: it.id, guise, ...(onSelf ? {} : { target: rng.pick(others) }) };
  }
  return null;
}

/** Просьба по названию: реликвия из моих целей «держать», которой у меня нет, иначе любая чужая реликвия. */
function wantFor(view: PlayerView, rng: Rng): Want | null {
  const mine = new Set(view.me.items.map(i => i.ref));
  const goalRefs = goalsOf(view.me.role.key).flatMap(g => (g.type === 'holdItem' && !mine.has(g.ref) ? [g.ref] : [])).sort();
  const relics = view.public.relics.map(r => r.name).filter(n => !mine.has(n)).sort();
  const list = goalRefs.length > 0 ? goalRefs : relics;
  return list.length > 0 ? { kind: 'relic', ref: rng.pick(list) } : null;
}

/** Пункт 3: сделка соседу по составу; раз за акт услуга; варианты с вероятностью 1/3 каждый. */
function trade(view: PlayerView, act: Act, mem: TurnMemory, rng: Rng, roster: string[]): Command | null {
  const to = neighbour(view, roster);
  if (to === null) return null;
  const offer = (give: Bundle, get: Bundle, service?: boolean): Command =>
    ({ type: 'offer.create', to, give, get, ...(service ? { service } : {}) });
  if (!mem.serviceDone) {
    mem.serviceDone = true;
    return offer(empty(), { ...empty(), gold: 1 }, true);
  }
  const keep = new Set(goalsOf(view.me.role.key).flatMap(g => (g.type === 'holdItem' ? [g.ref] : [])));
  const items = freeItems(view, act).filter(i => !keep.has(i.ref) && i.kind !== 'clue');
  const gold = view.me.available.gold;
  // Три вида сделки равновероятны; невыполнимый вид — ход переходит к алтарю.
  switch (rng.int(0, 2)) {
    case 0:
      return items.length > 0 ? offer({ ...empty(), items: [rng.pick(items).id] }, { ...empty(), gold: rng.int(1, 2) }) : null;
    case 1: {
      if (items.length === 0) return null;
      const want = wantFor(view, rng);
      return want ? offer({ ...empty(), items: [rng.pick(items).id] }, { ...empty(), wants: [want] }) : null;
    }
    default: {
      if (gold < 2) return null;
      const want = wantFor(view, rng);
      return want ? offer({ ...empty(), gold: 1 }, { ...empty(), wants: [want] }) : null;
    }
  }
}

/** Пункт 4: вклад на алтарь своей стороны; свободная роль сначала выбирает сторону (акты I–II). */
function altar(view: PlayerView, act: Act, rng: Rng): Command | null {
  const sides = view.altars.map(a => a.side).sort();
  const roleSide = view.me.role.side;
  const side = roleSide === 'free' ? view.me.player.side : roleSide;
  if (side === undefined || side === 'free') {
    return act !== 3 && sides.length > 0 ? { type: 'player.chooseSide', side: rng.pick(sides) } : null;
  }
  if (!sides.includes(side)) return null;
  const items = freeItems(view, act, ALTAR_KINDS);
  if (items.length > 0) return { type: 'altar.contribute', side, itemId: items[0].id };
  // Золото не всегда: иначе до пункта 5 политика не доходит; 1 золото оставляем себе.
  if (view.me.available.gold >= ALTAR_GOLD + 1 && rng.chance(0.5)) return { type: 'altar.contribute', side: side as AltarSide, gold: ALTAR_GOLD };
  return null;
}

/** Пункт 5: раз за акт отмена своего висящего предложения или изъятие своего вклада. */
function undo(view: PlayerView, mem: TurnMemory): Command | null {
  const me = view.me.role.key;
  if (!mem.cancelDone) {
    const own = view.offers.find(o => o.from === me && o.status === 'pending');
    if (own) { mem.cancelDone = true; return { type: 'offer.cancel', id: own.id }; }
  }
  if (!mem.withdrawDone) {
    const c = view.altars.flatMap(a => a.contributions).find(x => x.player === me);
    if (c) { mem.withdrawDone = true; return { type: 'altar.withdraw', contributionId: c.id }; }
  }
  return null;
}

/**
 * Одно действие хода по §2.3: способность → покупка/изготовление → (акт III) вещи →
 * сделка → алтарь → отмена/изъятие. Первое выполнимое; null, если делать нечего.
 * Память mem обновляется при выборе действия (результат команды здесь неизвестен).
 */
export function playerAction(view: PlayerView, act: Act, mem: TurnMemory, rng: Rng, roster: string[]): Command | null {
  return ability(view, act, mem, rng)
    ?? craft(view, mem, rng)
    ?? (act === 3 ? useItem(view, rng) : null)
    ?? trade(view, act, mem, rng, roster)
    ?? altar(view, act, rng)
    ?? undo(view, mem);
}
