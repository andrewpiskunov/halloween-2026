import { ABILITY_BY_ROLE, COPY_SOURCES, type AbilityKind, type CopyableKind } from '../abilities';
import type { AbilityUse, Ctx } from '../commands';
import type { Content } from '../content';
import type { AbilityUsed, Event } from '../events';
import type { Effect, GameState, Ingredient, Item, ItemKind } from '../types';
import { INGREDIENTS, available } from './bundles';
import { acceptRequest, needsConsent, requestConsent } from './consent';
import { consentedKind } from './consented-kinds';
import { actOf, applyEffects, recordAction } from './effects';
import { isActPhase, otherTarget, participant } from './guards';
import { buildIntel, isObservation, type ObservationUse } from './intel';
import { KIND_BY_RECIPE, craftQuote, recipeOf, type CraftModifier } from './shop';
import { fail, ok, type CommandHandlers, type EventReducers, type Result } from './result';

/** Изделия мастерской; реликвии, осколки и улики способностями не превращаются. */
const CRAFTED: ItemKind[] = ['potion', 'ward', 'focus', 'shape'];
/** Перековка: только вещи по 1 золоту, Камень облика не участвует. */
const REFORGEABLE: ItemKind[] = ['potion', 'ward', 'focus'];
const REFORGE_INTO = ['cleanse', 'ward', 'focus'];
const REFORGE_PRICE = 1;
const SELL_PRICE = 2;
const BANK_PRICE = 2;
const CHEAP_PRICE = 1;
/** Оптовая цена двух ингредиентов, разложенная по событиям: 2 + 1. */
const BULK_PRICES = [2, 1];
const MAX_KEY = 64;

const isIngredient = (x: unknown): x is Ingredient => INGREDIENTS.includes(x as Ingredient);
const isKey = (x: unknown) => typeof x === 'string' && x.length > 0 && x.length <= MAX_KEY;
const isPair = (x: unknown) => Array.isArray(x) && x.length === 2 && x.every(isIngredient);

/** Форма параметров (§5.3 шаг 5); у копии — форма копируемого вида. */
function validForm(use: AbilityUse): boolean {
  switch (use.kind) {
    case 'payAshWithGold': return isKey(use.recipeId);
    case 'focusFree': return true;
    case 'substituteIngredient': return isKey(use.recipeId) && isIngredient(use.from) && isIngredient(use.to);
    case 'buyCheap': case 'buyFromBank': return isIngredient(use.ingredient);
    case 'buyBulk': return isPair(use.take);
    case 'grow': return isIngredient(use.give);
    case 'swapIngredient': return isIngredient(use.give) && isIngredient(use.take);
    case 'disassemble': return isKey(use.itemId) && isPair(use.take);
    case 'reforge': return isKey(use.itemId) && REFORGE_INTO.includes(use.into);
    case 'sellToBank': return isKey(use.itemId);
    case 'protectSelf': return true;
    case 'protectOther': case 'stealGold': case 'thorns': return isKey(use.target);
    case 'cleanseOther': case 'discountOther': return isKey(use.target);
    case 'transferProtection': return isKey(use.from) && isKey(use.to);
    case 'copyAbility': return validForm(use.copy);
    case 'stealIngredient': return isKey(use.target) && isIngredient(use.ingredient);
    case 'inspectInventory': case 'knowGold': case 'askSide': return isKey(use.target);
    case 'sniffIngredient': return isIngredient(use.ingredient);
    case 'askYesNo': return isKey(use.target) && (use.question === undefined || typeof use.question === 'string');
  }
}

/** Общие проверки §5.3 шаги 1–5: фаза, участник, вид роли, лимит акта, форма параметров. */
export function checkCommon(state: GameState, ctx: Ctx, use: AbilityUse): { author: string } | Result {
  if (!isActPhase(state)) return fail('phase');
  const author = participant(state, ctx.actor);
  if (!author) return fail('forbidden');
  if (typeof use !== 'object' || use === null || ABILITY_BY_ROLE[author] !== use.kind) return fail('forbidden', 'это не способность вашей роли');
  if (use.kind === 'copyAbility' && !(typeof use.copy === 'object' && use.copy !== null && Object.hasOwn(COPY_SOURCES, use.copy.kind))) {
    return fail('forbidden', 'этот вид нельзя скопировать');
  }
  const p = state.players[author];
  if (p.abilityUsedInAct) return fail('limit', 'способность в этом акте уже применена');
  if (p.abilityPending !== undefined) return fail('limit', 'способность ждёт ответа');
  if (!validForm(use)) return fail('invalid', 'неверные параметры способности');
  return { author };
}

/** AbilityUsed невраждебной исполненной способности. */
function used(author: string, kind: AbilityKind, effects: Effect[], ctx: Ctx, requestId?: string): AbilityUsed {
  return {
    type: 'AbilityUsed', at: ctx.now, author, ability: kind, outcome: 'done', hostile: false, effects,
    ...(requestId !== undefined ? { requestId } : {}),
  };
}

/** Своё свободное изделие нужного вида: вещь или отказ. */
function ownFreeItem(state: GameState, author: string, itemId: string, kinds: ItemKind[]): Item | Result {
  // Только собственные ключи: «constructor» и подобные из прототипа — не вещи.
  const it = typeof itemId === 'string' && Object.hasOwn(state.items, itemId) ? state.items[itemId] : undefined;
  if (!it) return fail('not_found', itemId);
  if (it.owner.type !== 'player' || it.owner.key !== author) return fail('not_owner');
  if (it.reservedFor !== undefined) return fail('reserved', 'вещь в резерве сделки');
  if (!kinds.includes(it.kind)) return fail('invalid', 'эта вещь не подходит');
  return it;
}

const isResult = (x: Item | Result): x is Result => 'ok' in x;

/** Изготовление со способностью: AbilityUsed без эффектов, затем ItemCrafted с viaAbility. */
function craftWith(
  state: GameState, content: Content, author: string, kind: AbilityKind, recipeId: string,
  mod: CraftModifier, ctx: Ctx, requestId?: string,
): Result {
  const found = recipeOf(content, recipeId);
  if (!found) return fail('not_found', recipeId);
  const { recipe, kind: itemKind } = found;
  const q = craftQuote(state, author, recipe, mod);
  if ('error' in q) return fail(q.error, q.detail);
  const item: Item = { id: ctx.newId(), kind: itemKind, ref: recipeId, owner: { type: 'player', key: author }, createdBy: author };
  return ok(
    used(author, kind, [], ctx, requestId),
    { type: 'ItemCrafted', at: ctx.now, player: author, item, ...q, viaAbility: kind },
  );
}

/** Сколько каждого ингредиента в паре: для одинаковых — 2. */
function countPair(take: [Ingredient, Ingredient]): Partial<Record<Ingredient, number>> {
  const n: Partial<Record<Ingredient, number>> = {};
  for (const k of take) n[k] = (n[k] ?? 0) + 1;
  return n;
}

/** Хватает ли в запасе мастерской пары ингредиентов. */
const stockHas = (state: GameState, take: [Ingredient, Ingredient]) =>
  Object.entries(countPair(take)).every(([k, n]) => state.workshop[k as Ingredient] >= (n ?? 0));

/**
 * Враждебная попытка (§5.3 шаги 7–8): лимит цели за акт, затем защита цели.
 * Возвращает отказ, событие блокировки или undefined, если можно проверять предусловия дальше.
 */
export function hostileCheck(
  state: GameState, author: string, target: string, kind: AbilityKind, ctx: Ctx, requestId?: string,
): Result | undefined {
  const t = state.players[target];
  if (t.hostileAttemptsAgainstInAct >= 1) return fail('limit', 'по этому игроку в этом акте уже была враждебная попытка');
  if (t.protection === undefined) return undefined;
  return ok({
    type: 'AbilityUsed', at: ctx.now, author, ability: kind, target, outcome: 'blocked', hostile: true,
    effects: [{ type: 'protection', player: target, value: null }],
    ...(requestId !== undefined ? { requestId } : {}),
  });
}

/** Предусловие враждебного эффекта (§5.3 шаг 9) и его эффекты. */
function hostileEffects(state: GameState, author: string, use: Extract<AbilityUse, { kind: 'stealGold' | 'stealIngredient' | 'thorns' }>): Effect[] | Result {
  const t = available(state, use.target);
  switch (use.kind) {
    case 'stealGold':
      if (t.gold < 1) return fail('insufficient', 'у цели нечего взять');
      return [{ type: 'goldMove', from: use.target, to: author, amount: 1 }];
    case 'stealIngredient':
      if (t.ingredients[use.ingredient] < 1) return fail('insufficient', 'у цели нечего взять');
      return [{ type: 'ingredientMove', from: use.target, to: author, ingredient: use.ingredient }];
    case 'thorns':
      if (state.players[use.target].thorns) return fail('invalid', 'у цели уже есть шипы');
      return [{ type: 'thorns', player: use.target, value: true, by: author }];
  }
}

/** Защита способностью: одна активная защита на игрока. */
function protect(state: GameState, author: string, target: string): Effect[] | Result {
  if (state.players[target].protection !== undefined) return fail('limit', 'защита уже есть');
  return [{ type: 'protection', player: target, value: { by: author, source: 'ability' } }];
}

const isEffects = (x: Effect[] | Result): x is Effect[] => Array.isArray(x);

/** Наблюдение (§5.2): без эффектов, не враждебно, лимит попыток и защиту цели не трогает. */
function observe(
  state: GameState, content: Content, author: string, use: ObservationUse, ctx: Ctx, requestId?: string,
): Result {
  if (use.kind !== 'sniffIngredient') {
    const stop = otherTarget(state, author, use.target);
    if (stop) return stop;
  }
  const intel = buildIntel(state, content, use, author);
  return ok({ ...used(author, use.kind, [], ctx, requestId), ...('target' in use ? { target: use.target } : {}), intel });
}

/**
 * Исполнение способности после общих проверок: проверки вида и события.
 * Вызывается и из ability.use, и после согласия (requestId).
 */
export function performAbility(
  state: GameState, content: Content, author: string, use: AbilityUse, ctx: Ctx, requestId?: string,
): Result {
  const a = available(state, author);
  const done = (effects: Effect[], ...rest: Event[]) => ok(used(author, use.kind, effects, ctx, requestId), ...rest);
  const bought = (ingredient: Ingredient, count: number, paidGold: number, fromBank?: true): Event =>
    ({ type: 'IngredientBought', at: ctx.now, player: author, ingredient, count, paidGold, ...(fromBank ? { fromBank } : {}) });

  if (isObservation(use)) return observe(state, content, author, use, ctx, requestId);

  switch (use.kind) {
    case 'payAshWithGold':
      return craftWith(state, content, author, use.kind, use.recipeId, { ashByGold: true }, ctx, requestId);
    case 'focusFree':
      return craftWith(state, content, author, use.kind, 'focus', { freeWork: true }, ctx, requestId);
    case 'substituteIngredient':
      return craftWith(state, content, author, use.kind, use.recipeId, { substitute: { from: use.from, to: use.to } }, ctx, requestId);

    case 'buyCheap':
      if (state.workshop[use.ingredient] < 1) return fail('insufficient', `в мастерской нет: ${use.ingredient}`);
      if (a.gold < CHEAP_PRICE) return fail('insufficient', 'не хватает золота');
      return done([], bought(use.ingredient, 1, CHEAP_PRICE));

    case 'buyBulk': {
      if (!stockHas(state, use.take)) return fail('insufficient', 'в мастерской не хватает ингредиентов');
      const total = BULK_PRICES[0] + BULK_PRICES[1];
      if (a.gold < total) return fail('insufficient', 'не хватает золота');
      const [x, y] = use.take;
      return x === y
        ? done([], bought(x, 2, total))
        : done([], bought(x, 1, BULK_PRICES[0]), bought(y, 1, BULK_PRICES[1]));
    }

    case 'buyFromBank':
      if (a.gold < BANK_PRICE) return fail('insufficient', 'не хватает золота');
      return done([], bought(use.ingredient, 1, BANK_PRICE, true));

    case 'grow':
      if (a.ingredients[use.give] < 1) return fail('insufficient', `нет ингредиента: ${use.give}`);
      // Роса, которую отдаёт сам автор, до обмена не считается.
      if (state.workshop.dew < 2) return fail('insufficient', 'в мастерской меньше двух Рос');
      return done([
        { type: 'ingredient', player: author, ingredient: use.give, delta: -1 },
        { type: 'workshop', ingredient: use.give, delta: 1 },
        { type: 'workshop', ingredient: 'dew', delta: -2 },
        { type: 'ingredient', player: author, ingredient: 'dew', delta: 2 },
      ]);

    case 'swapIngredient':
      if (use.take === use.give) return fail('invalid', 'менять ингредиент на такой же нельзя');
      if (a.ingredients[use.give] < 1) return fail('insufficient', `нет ингредиента: ${use.give}`);
      if (state.workshop[use.take] < 1) return fail('insufficient', `в мастерской нет: ${use.take}`);
      return done([
        { type: 'ingredient', player: author, ingredient: use.give, delta: -1 },
        { type: 'workshop', ingredient: use.give, delta: 1 },
        { type: 'workshop', ingredient: use.take, delta: -1 },
        { type: 'ingredient', player: author, ingredient: use.take, delta: 1 },
      ]);

    case 'disassemble': {
      const it = ownFreeItem(state, author, use.itemId, CRAFTED);
      if (isResult(it)) return it;
      if (!stockHas(state, use.take)) return fail('insufficient', 'в мастерской не хватает ингредиентов');
      return done([
        { type: 'itemRemoved', itemId: it.id },
        ...use.take.flatMap((ingredient): Effect[] => [
          { type: 'workshop', ingredient, delta: -1 },
          { type: 'ingredient', player: author, ingredient, delta: 1 },
        ]),
      ]);
    }

    case 'reforge': {
      const it = ownFreeItem(state, author, use.itemId, REFORGEABLE);
      if (isResult(it)) return it;
      // into уже сверен со списком REFORGE_INTO в validForm.
      const kind = KIND_BY_RECIPE[use.into];
      if (kind === it.kind) return fail('invalid', 'новая вещь должна быть другого вида');
      if (a.gold < REFORGE_PRICE) return fail('insufficient', 'не хватает золота');
      const item: Item = { id: ctx.newId(), kind, ref: use.into, owner: { type: 'player', key: author }, createdBy: author };
      return done([
        { type: 'itemRemoved', itemId: it.id },
        { type: 'itemCreated', item },
        { type: 'gold', player: author, delta: -REFORGE_PRICE },
      ]);
    }

    case 'sellToBank': {
      const it = ownFreeItem(state, author, use.itemId, CRAFTED);
      if (isResult(it)) return it;
      return done([
        { type: 'itemRemoved', itemId: it.id },
        { type: 'gold', player: author, delta: SELL_PRICE },
      ]);
    }

    case 'protectSelf': {
      const eff = protect(state, author, author);
      return isEffects(eff) ? done(eff) : eff;
    }

    case 'protectOther': {
      const eff = otherTarget(state, author, use.target) ?? protect(state, author, use.target);
      return isEffects(eff) ? ok({ ...used(author, use.kind, eff, ctx, requestId), target: use.target }) : eff;
    }

    case 'stealGold': case 'stealIngredient': case 'thorns': {
      const stop = otherTarget(state, author, use.target) ?? hostileCheck(state, author, use.target, use.kind, ctx, requestId);
      if (stop) return stop;
      const eff = hostileEffects(state, author, use);
      if (!isEffects(eff)) return eff;
      return ok({ ...used(author, use.kind, eff, ctx, requestId), target: use.target, hostile: true });
    }

    case 'copyAbility':
      return asCopy(performAbility(state, content, author, use.copy, ctx, requestId), use.copy.kind);

    default: {
      const f = consentedKind(state, author, use);
      return 'ok' in f ? f : ok({ ...used(author, use.kind, f.effects, ctx, requestId), ...f });
    }
  }
}

/** Копия Астры: события копируемого вида от имени copyAbility, с отметкой исполненного вида. */
function asCopy(r: Result, copied: CopyableKind): Result {
  if (!r.ok) return r;
  return ok(...r.events.map((e): Event => {
    if (e.type === 'AbilityUsed') return { ...e, ability: 'copyAbility', copied };
    if (e.type === 'ItemCrafted') return { ...e, viaAbility: 'copyAbility' };
    return e;
  }));
}

export const abilityCommands: CommandHandlers = {
  'ability.use': (state, content, cmd, ctx) => {
    const c = checkCommon(state, ctx, cmd.use);
    if ('ok' in c) return c;
    const r = performAbility(state, content, c.author, cmd.use, ctx);
    const approvers = needsConsent(state, c.author, cmd.use);
    // Нужно согласие: проверки пройдены пробным исполнением, событий исполнения пока нет.
    if (!r.ok || approvers.length === 0) return r;
    return requestConsent(c.author, { type: 'ability', use: cmd.use }, approvers, ctx);
  },
};

export const abilityReducers: EventReducers = {
  AbilityUsed: (state, _c, e) => {
    const s = applyEffects(state, e.effects);
    const players = { ...s.players, [e.author]: { ...s.players[e.author], abilityUsedInAct: true } };
    // Враждебная попытка, исполненная или отражённая, расходует лимит цели на акт.
    if (e.hostile && e.target !== undefined) players[e.target] = { ...players[e.target], hostileAttemptsAgainstInAct: 1 };
    // Перековка считается изготовлением: новая вещь в журнал изготовлений.
    const crafts = e.ability === 'reforge'
      ? [...s.crafts, ...e.effects.flatMap(x => x.type === 'itemCreated' ? [{ at: e.at, player: e.author, kind: x.item.kind, itemId: x.item.id }] : [])]
      : s.crafts;
    return acceptRequest(recordAction({ ...s, players, crafts }, e, actOf(state)), e.requestId);
  },
};
