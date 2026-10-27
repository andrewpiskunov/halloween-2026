import { describe, expect, test } from 'vitest';
import { content, makeGame, player, run } from './helpers';
import { reduce } from '../engine';
import type { GameState } from '../types';

const grete = player('o6');
const withPlayer = (s: GameState, key: string, patch: Partial<GameState['players'][string]>): GameState => ({
  ...s, players: { ...s.players, [key]: { ...s.players[key], ...patch } },
});
const errorOf = (s: GameState, cmd: Parameters<typeof run>[1], a = grete) => {
  const r = run(s, cmd, a);
  return r.ok ? 'ok' : r.error;
};

describe('мастерская: покупка', () => {
  test('buy: −2 золота, +1 ингредиент, запас −1; запас 0 → insufficient; available.gold < 2 → insufficient', () => {
    const s = makeGame(12);
    const r = run(s, { type: 'shop.buy', ingredient: 'dew' }, grete);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.players.o6.gold).toBe(s.players.o6.gold - 2);
    expect(r.state.players.o6.ingredients.dew).toBe(s.players.o6.ingredients.dew + 1);
    expect(r.state.workshop.dew).toBe(s.workshop.dew - 1);
    expect(r.events[0]).toMatchObject({ type: 'IngredientBought', player: 'o6', ingredient: 'dew', count: 1, paidGold: 2 });

    const many = run(s, { type: 'shop.buy', ingredient: 'ash', count: 3 }, grete);
    if (!many.ok) throw new Error(many.error);
    expect(many.state.players.o6.gold).toBe(s.players.o6.gold - 6);
    expect(many.state.players.o6.ingredients.ash).toBe(s.players.o6.ingredients.ash + 3);

    const empty = { ...s, workshop: { ...s.workshop, moon: 0 } };
    expect(errorOf(empty, { type: 'shop.buy', ingredient: 'moon' })).toBe('insufficient');
    expect(errorOf(withPlayer(s, 'o6', { gold: 1 }), { type: 'shop.buy', ingredient: 'ash' })).toBe('insufficient');
    // золото в резерве предложения недоступно для покупки
    expect(errorOf(withPlayer(s, 'o6', { gold: 3, reservedGold: 2 }), { type: 'shop.buy', ingredient: 'ash' })).toBe('insufficient');
  });

  test('buy: неверное количество → invalid, не участник → forbidden, setup → phase', () => {
    const s = makeGame(12);
    expect(errorOf(s, { type: 'shop.buy', ingredient: 'ash', count: 0 })).toBe('invalid');
    expect(errorOf(s, { type: 'shop.buy', ingredient: 'ash', count: 1.5 })).toBe('invalid');
    expect(errorOf(s, { type: 'shop.buy', ingredient: 'ash' }, { type: 'gm' })).toBe('forbidden');
    expect(errorOf({ ...s, phase: 'setup' }, { type: 'shop.buy', ingredient: 'ash' })).toBe('phase');
    expect(errorOf({ ...s, phase: 'closed' }, { type: 'shop.buy', ingredient: 'ash' })).toBe('phase');
  });
});

describe('мастерская: изготовление', () => {
  test('craft focus у Греты (ash 2, moon 1): −1 ash −1 moon −1 золото, вещь focus с createdBy o6', () => {
    // стартовый набор Греты в данных иной, поэтому задаём сценарий из правил явно
    const s = withPlayer(makeGame(12), 'o6', { ingredients: { ash: 2, moon: 1, dew: 0 } });
    const r = run(s, { type: 'shop.craft', recipeId: 'focus' }, grete);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.players.o6.gold).toBe(s.players.o6.gold - 1);
    expect(r.state.players.o6.ingredients).toEqual({ ash: 1, moon: 0, dew: 0 });
    const e = r.events[0];
    if (e.type !== 'ItemCrafted') throw new Error('нет ItemCrafted');
    expect(e.paidGold).toBe(1);
    expect(r.state.items[e.item.id]).toMatchObject({
      kind: 'focus', ref: 'focus', owner: { type: 'player', key: 'o6' }, createdBy: 'o6',
    });
  });

  test('craft без ингредиентов → insufficient, ничего не списано', () => {
    const s = withPlayer(makeGame(12), 'o6', { ingredients: { ash: 2, moon: 1, dew: 0 } });
    const r = run(s, { type: 'shop.craft', recipeId: 'shape' }, grete);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('insufficient');
      expect(r.detail).toContain('dew');
    }
    expect(s.players.o6.ingredients).toEqual({ ash: 2, moon: 1, dew: 0 });
  });

  test('craft: не хватает золота → insufficient; соответствие kind рецептам', () => {
    const s = withPlayer(makeGame(12), 'o6', { gold: 0, ingredients: { ash: 2, moon: 2, dew: 2 } });
    expect(errorOf(s, { type: 'shop.craft', recipeId: 'ward' })).toBe('insufficient');
    const rich = withPlayer(makeGame(12), 'o6', { gold: 20, ingredients: { ash: 5, moon: 5, dew: 5 } });
    const kinds: Record<string, string> = { cleanse: 'potion', ward: 'ward', focus: 'focus', shape: 'shape' };
    for (const [id, kind] of Object.entries(kinds)) {
      const r = run(rich, { type: 'shop.craft', recipeId: id }, grete);
      if (!r.ok) throw new Error(`${id}: ${r.error}`);
      const e = r.events[0];
      if (e.type !== 'ItemCrafted') throw new Error('нет ItemCrafted');
      expect(r.state.items[e.item.id]).toMatchObject({ kind, ref: id });
    }
  });

  test('шипы: craft стоит на 1 дороже и снимает thorns; discount: на 1 дешевле, не ниже 0, и снимается', () => {
    const base = withPlayer(makeGame(12), 'o6', { gold: 10, ingredients: { ash: 3, moon: 3, dew: 3 } });
    const thorny = run(withPlayer(base, 'o6', { thorns: true }), { type: 'shop.craft', recipeId: 'focus' }, grete);
    if (!thorny.ok) throw new Error(thorny.error);
    expect(thorny.state.players.o6.gold).toBe(10 - 2);
    expect(thorny.state.players.o6.thorns).toBe(false);

    const disc = run(withPlayer(base, 'o6', { discount: true }), { type: 'shop.craft', recipeId: 'shape' }, grete);
    if (!disc.ok) throw new Error(disc.error);
    expect(disc.state.players.o6.gold).toBe(10 - 1);
    expect(disc.state.players.o6.discount).toBe(false);

    // скидка не опускает цену ниже 0, шипы и скидка вместе гасят друг друга
    const both = run(withPlayer(base, 'o6', { thorns: true, discount: true }), { type: 'shop.craft', recipeId: 'focus' }, grete);
    if (!both.ok) throw new Error(both.error);
    expect(both.state.players.o6.gold).toBe(10 - 1);
    expect(both.state.players.o6.thorns).toBe(false);
    expect(both.state.players.o6.discount).toBe(false);

    // нулевая цена: золота 0, скидка → цена max(0, …) покрыта только если recipe.gold = 1 → 0
    const zero = run(withPlayer(base, 'o6', { gold: 0, discount: true }), { type: 'shop.craft', recipeId: 'focus' }, grete);
    if (!zero.ok) throw new Error(zero.error);
    expect(zero.state.players.o6.gold).toBe(0);
    // шипы: без лишнего золота не хватает
    expect(errorOf(withPlayer(base, 'o6', { gold: 1, thorns: true }), { type: 'shop.craft', recipeId: 'focus' })).toBe('insufficient');
  });

  test('craft в setup → phase; неизвестный рецепт → not_found; не участник → forbidden', () => {
    const s = makeGame(12);
    expect(errorOf({ ...s, phase: 'setup' }, { type: 'shop.craft', recipeId: 'focus' })).toBe('phase');
    expect(errorOf(s, { type: 'shop.craft', recipeId: 'nope' })).toBe('not_found');
    expect(errorOf(s, { type: 'shop.craft', recipeId: 'focus' }, { type: 'system' })).toBe('forbidden');
  });
});

describe('мастерская: редьюсеры событий способностей', () => {
  test('ItemCrafted снимает только отмеченные cleared шипы и скидку вместе с их авторами', () => {
    const s = withPlayer(makeGame(12), 'o6', { thorns: true, thornsBy: 'o12', discount: true, discountBy: 'o14' });
    const item = { id: 'c1', kind: 'focus' as const, ref: 'focus', owner: { type: 'player' as const, key: 'o6' }, createdBy: 'o6' };
    const crafted = (clearedThorns: boolean, clearedDiscount: boolean) => reduce(s, content, {
      type: 'ItemCrafted', at: 0, player: 'o6', item, paidGold: 0, paidIngredients: {}, clearedThorns, clearedDiscount, viaAbility: 'focusFree',
    }).players.o6;
    expect(crafted(true, false)).toMatchObject({ thorns: false, discount: true, discountBy: 'o14' });
    expect(crafted(true, false).thornsBy).toBeUndefined();
    expect(crafted(false, true)).toMatchObject({ thorns: true, thornsBy: 'o12', discount: false });
    expect(crafted(false, true).discountBy).toBeUndefined();
  });

  test('IngredientBought из банка не уменьшает запас мастерской', () => {
    const s = makeGame(12);
    const bought = (fromBank?: boolean) => reduce(s, content, {
      type: 'IngredientBought', at: 0, player: 'o6', ingredient: 'dew', count: 1, paidGold: 2, ...(fromBank ? { fromBank } : {}),
    });
    expect(bought(true).workshop).toEqual(s.workshop);
    expect(bought(true).players.o6.ingredients.dew).toBe(s.players.o6.ingredients.dew + 1);
    expect(bought().workshop.dew).toBe(s.workshop.dew - 1);
  });
});
