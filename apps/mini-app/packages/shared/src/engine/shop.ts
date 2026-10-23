import type { Item, ItemKind } from '../types';
import { INGREDIENTS, available } from './bundles';
import { isActPhase, participant } from './guards';
import { fail, ok, type CommandHandlers, type EventReducers } from './result';

const BUY_PRICE = 2;
const KIND_BY_RECIPE: Record<string, ItemKind> = { cleanse: 'potion', ward: 'ward', focus: 'focus', shape: 'shape' };

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
    const recipe = content.recipeById[cmd.recipeId];
    const kind = KIND_BY_RECIPE[cmd.recipeId];
    if (!recipe || !kind) return fail('not_found', cmd.recipeId);
    const a = available(state, key);
    const lacking = INGREDIENTS.find(k => (recipe.cost[k] ?? 0) > a.ingredients[k]);
    if (lacking) return fail('insufficient', `не хватает ингредиента: ${lacking}`);
    const p = state.players[key];
    const paidGold = Math.max(0, recipe.gold + (p.thorns ? 1 : 0) - (p.discount ? 1 : 0));
    if (a.gold < paidGold) return fail('insufficient', 'не хватает золота');
    const item: Item = { id: ctx.newId(), kind, ref: cmd.recipeId, owner: { type: 'player', key }, createdBy: key };
    return ok({
      type: 'ItemCrafted', at: ctx.now, player: key, item, paidGold, paidIngredients: { ...recipe.cost },
      clearedThorns: p.thorns, clearedDiscount: p.discount,
    });
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
      workshop: { ...state.workshop, [e.ingredient]: state.workshop[e.ingredient] - e.count },
    };
  },
  ItemCrafted: (state, _c, e) => {
    const p = state.players[e.player];
    const ingredients = { ...p.ingredients };
    for (const k of INGREDIENTS) ingredients[k] -= e.paidIngredients[k] ?? 0;
    return {
      ...state,
      items: { ...state.items, [e.item.id]: e.item },
      players: { ...state.players, [e.player]: { ...p, gold: p.gold - e.paidGold, ingredients, thorns: false, discount: false } },
    };
  },
};
