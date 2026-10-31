import type { Content, Recipe } from '../content';
import type { Counts, GameState, Ingredient, Item, ItemKind, Player } from '../types';
import { INGREDIENTS, available } from './bundles';
import { isActPhase, participant } from './guards';
import { fail, ok, type CommandHandlers, type ErrorCode, type EventReducers } from './result';

const BUY_PRICE = 2;
export const KIND_BY_RECIPE: Record<string, ItemKind> = { cleanse: 'potion', ward: 'ward', focus: 'focus', shape: 'shape' };

/**
 * Рецепт и вид изделия по id из команды. Только собственные ключи: 'constructor' или 'toString'
 * иначе нашлись бы в прототипе объекта.
 */
export function recipeOf(content: Content, recipeId: string): { recipe: Recipe; kind: ItemKind } | undefined {
  if (!Object.hasOwn(content.recipeById, recipeId) || !Object.hasOwn(KIND_BY_RECIPE, recipeId)) return undefined;
  return { recipe: content.recipeById[recipeId], kind: KIND_BY_RECIPE[recipeId] };
}

/** Поправки способностей к изготовлению: Пепел золотом, работа бесплатно, замена ингредиента. */
export interface CraftModifier { ashByGold?: boolean; freeWork?: boolean; substitute?: { from: Ingredient; to: Ingredient } }
export type CraftQuote =
  | { paidGold: number; paidIngredients: Partial<Counts>; clearedThorns: boolean; clearedDiscount: boolean }
  | { error: ErrorCode; detail: string };

/**
 * Цена изготовления по рецепту для игрока: база с поправкой способности, плюс шипы, минус скидка, не ниже нуля.
 * Скидка тратится, только если цена до неё больше нуля; шипы тратятся всегда.
 */
export function craftQuote(state: GameState, key: string, recipe: Recipe, mod: CraftModifier = {}): CraftQuote {
  const cost: Partial<Counts> = { ...recipe.cost };
  if (mod.ashByGold) {
    if (!cost.ash) return { error: 'invalid', detail: 'в рецепте нет Пепла' };
    cost.ash -= 1;
  }
  if (mod.substitute) {
    const { from, to } = mod.substitute;
    if (!INGREDIENTS.includes(from) || !INGREDIENTS.includes(to)) return { error: 'invalid', detail: 'неизвестный ингредиент' };
    if (!cost[from]) return { error: 'invalid', detail: `в рецепте нет ингредиента: ${from}` };
    if (to === from) return { error: 'invalid', detail: 'заменять ингредиент на тот же нельзя' };
    cost[from] -= 1;
    cost[to] = (cost[to] ?? 0) + 1;
  }
  for (const k of INGREDIENTS) if (cost[k] === 0) delete cost[k];
  const a = available(state, key);
  const lacking = INGREDIENTS.find(k => (cost[k] ?? 0) > a.ingredients[k]);
  if (lacking) return { error: 'insufficient', detail: `не хватает ингредиента: ${lacking}` };
  const p = state.players[key];
  const base = recipe.gold + (mod.ashByGold ? 1 : 0) - (mod.freeWork ? 1 : 0);
  const beforeDiscount = state.hidden17 ? Math.max(0, base) : base + (p.thorns ? 1 : 0);
  const paidGold = Math.max(0, beforeDiscount - (p.discount ? 1 : 0)) + (state.hidden17 && p.thorns ? 1 : 0);
  if (a.gold < paidGold) return { error: 'insufficient', detail: 'не хватает золота' };
  return { paidGold, paidIngredients: cost, clearedThorns: p.thorns, clearedDiscount: p.discount && beforeDiscount > 0 };
}

export const shopCommands: CommandHandlers = {
  'shop.buy': (state, _content, cmd, ctx) => {
    const key = participant(state, ctx.actor);
    if (!key) return fail('forbidden');
    if (!isActPhase(state)) return fail('phase');
    const count = cmd.count ?? 1;
    if (!Number.isInteger(count) || count < 1) return fail('invalid', 'количество должно быть целым и положительным');
    if (!INGREDIENTS.includes(cmd.ingredient)) return fail('invalid', cmd.ingredient);
    if (state.workshop[cmd.ingredient] < count) return fail('insufficient', `в мастерской мало: ${cmd.ingredient}`);
    const paidGold = BUY_PRICE * count;
    if (available(state, key).gold < paidGold) return fail('insufficient', 'не хватает золота');
    return ok({ type: 'IngredientBought', at: ctx.now, player: key, ingredient: cmd.ingredient, count, paidGold });
  },

  'shop.craft': (state, content, cmd, ctx) => {
    const key = participant(state, ctx.actor);
    if (!key) return fail('forbidden');
    if (!isActPhase(state)) return fail('phase');
    const found = recipeOf(content, cmd.recipeId);
    if (!found) return fail('not_found', cmd.recipeId);
    const { recipe, kind } = found;
    const q = craftQuote(state, key, recipe);
    if ('error' in q) return fail(q.error, q.detail);
    const item: Item = { id: ctx.newId(), kind, ref: cmd.recipeId, owner: { type: 'player', key }, ...(state.hidden17 ? {} : { createdBy: key }) };
    return ok({ type: 'ItemCrafted', at: ctx.now, player: key, item, ...q });
  },
};

export const shopReducers: EventReducers = {
  IngredientBought: (state, _c, e) => {
    const p = state.players[e.player];
    return {
      ...state,
      players: {
        ...state.players,
        [e.player]: { ...p, gold: p.gold - e.paidGold, ingredients: { ...p.ingredients, [e.ingredient]: p.ingredients[e.ingredient] + e.count } },
      },
      workshop: e.fromBank ? state.workshop : { ...state.workshop, [e.ingredient]: state.workshop[e.ingredient] - e.count },
    };
  },
  ItemCrafted: (state, _c, e) => {
    const { thornsBy, discountBy, ...p } = state.players[e.player];
    const ingredients = { ...p.ingredients };
    for (const k of INGREDIENTS) ingredients[k] -= e.paidIngredients[k] ?? 0;
    // Снимается только то, что потрачено изготовлением; вместе с отметкой уходит её автор.
    const thorns = p.thorns && !e.clearedThorns;
    const discount = p.discount && !e.clearedDiscount;
    const player: Player = {
      ...p, gold: p.gold - e.paidGold, ingredients, thorns, discount,
      ...(thorns && thornsBy !== undefined ? { thornsBy } : {}),
      ...(discount && discountBy !== undefined ? { discountBy } : {}),
    };
    return {
      ...state, items: { ...state.items, [e.item.id]: e.item }, players: { ...state.players, [e.player]: player },
      crafts: state.hidden17 && !e.item.createdBy ? state.crafts : [...state.crafts, { at: e.at, player: e.item.createdBy ?? e.player, kind: e.item.kind, itemId: e.item.id }],
    };
  },
};
