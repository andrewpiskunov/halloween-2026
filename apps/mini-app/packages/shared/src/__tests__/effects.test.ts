import { describe, expect, test } from 'vitest';
import { applyEffects, recordAction } from '../engine/effects';
import type { AbilityUsed, ItemUsed } from '../events';
import type { Item } from '../types';
import { makeGame } from './helpers';

const itemOf = (s: ReturnType<typeof makeGame>, key: string) =>
  Object.values(s.items).find(i => i.owner.type === 'player' && i.owner.key === key)!;

describe('applyEffects', () => {
  test('золото, ингредиенты, запас мастерской', () => {
    const s = makeGame(12);
    const r = applyEffects(s, [
      { type: 'gold', player: 'o1', delta: -2 },
      { type: 'goldMove', from: 'o1', to: 'o6', amount: 1 },
      { type: 'ingredient', player: 'o1', ingredient: 'dew', delta: 1 },
      { type: 'ingredientMove', from: 'o6', to: 'o1', ingredient: 'ash' },
      { type: 'workshop', ingredient: 'moon', delta: -1 },
    ]);
    expect(r.players.o1.gold).toBe(s.players.o1.gold - 3);
    expect(r.players.o6.gold).toBe(s.players.o6.gold + 1);
    expect(r.players.o1.ingredients).toEqual({ ...s.players.o1.ingredients, dew: s.players.o1.ingredients.dew + 1, ash: s.players.o1.ingredients.ash + 1 });
    expect(r.players.o6.ingredients).toEqual({ ...s.players.o6.ingredients, ash: s.players.o6.ingredients.ash - 1 });
    expect(r.workshop).toEqual({ ...s.workshop, moon: s.workshop.moon - 1 });
    // Вход не мутирован.
    expect(s.players.o1.gold).toBe(6);
  });

  test('вещи: удаление и создание', () => {
    const s = makeGame(12);
    const old = itemOf(s, 'o1');
    const created: Item = { id: 'new1', kind: 'potion', ref: 'cleanse', owner: { type: 'player', key: 'o6' }, createdBy: 'o6' };
    const r = applyEffects(s, [{ type: 'itemRemoved', itemId: old.id }, { type: 'itemCreated', item: created }]);
    expect(r.items[old.id]).toBeUndefined();
    expect(r.items.new1).toEqual(created);
    expect(s.items[old.id]).toEqual(old);
  });

  test('защита: поставить, перенести, снять', () => {
    const s = makeGame(12);
    const set = applyEffects(s, [{ type: 'protection', player: 'o1', value: { by: 'o9', source: 'ability' } }]);
    expect(set.players.o1.protection).toEqual({ by: 'o9', source: 'ability' });
    const moved = applyEffects(set, [{ type: 'protectionMoved', from: 'o1', to: 'o6' }]);
    expect(moved.players.o1.protection).toBeUndefined();
    expect(moved.players.o6.protection).toEqual({ by: 'o9', source: 'ability' });
    const cleared = applyEffects(moved, [{ type: 'protection', player: 'o6', value: null }]);
    expect(cleared.players.o6.protection).toBeUndefined();
    expect('protection' in cleared.players.o6).toBe(false);
  });

  test('шипы, проклятие, скидка с автором и снятие', () => {
    const s = makeGame(12);
    const on = applyEffects(s, [
      { type: 'thorns', player: 'o1', value: true, by: 'o12' },
      { type: 'curse', player: 'o1', value: true },
      { type: 'discount', player: 'o6', value: true, by: 'o14' },
    ]);
    expect(on.players.o1).toMatchObject({ thorns: true, thornsBy: 'o12', curse: true });
    expect(on.players.o6).toMatchObject({ discount: true, discountBy: 'o14' });
    const off = applyEffects(on, [
      { type: 'thorns', player: 'o1', value: false },
      { type: 'curse', player: 'o1', value: false },
      { type: 'discount', player: 'o6', value: false },
    ]);
    expect(off.players.o1).toMatchObject({ thorns: false, curse: false });
    expect(off.players.o1.thornsBy).toBeUndefined();
    expect(off.players.o6.discount).toBe(false);
    expect(off.players.o6.discountBy).toBeUndefined();
  });

  test('облик: поставить и снять', () => {
    const s = makeGame(12);
    const guise = { name: 'Тень', at: 100, by: 'o1' };
    const on = applyEffects(s, [{ type: 'guise', player: 'o1', value: guise }]);
    expect(on.players.o1.guise).toEqual(guise);
    const off = applyEffects(on, [{ type: 'guise', player: 'o1', value: null }]);
    expect(off.players.o1.guise).toBeUndefined();
  });

  test('пустой список возвращает тот же объект', () => {
    const s = makeGame(12);
    expect(applyEffects(s, [])).toBe(s);
  });
});

describe('recordAction', () => {
  test('AbilityUsed: id по seq состояния, акт из фазы, поля скопированы', () => {
    const s = makeGame(12);
    const e: AbilityUsed = {
      type: 'AbilityUsed', at: 500, author: 'o10', ability: 'cleanseOther', target: 'o9', outcome: 'done', hostile: false,
      effects: [{ type: 'curse', player: 'o9', value: false }], removed: { curse: true, thorns: false }, requestId: 'req1',
    };
    const r = recordAction(s, e, 1);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]).toEqual({
      id: String(s.seq + 1), at: 500, act: 1, author: 'o10', source: { type: 'ability', ability: 'cleanseOther' },
      target: 'o9', outcome: 'done', hostile: false, effects: e.effects, removed: { curse: true, thorns: false }, requestId: 'req1',
    });
  });

  test('AbilityUsed с seq, копией и разведкой: id из seq события', () => {
    const s = makeGame(12);
    const e: AbilityUsed = {
      type: 'AbilityUsed', at: 1, seq: 77, author: 'o11', ability: 'inspectInventory', target: 'o1', outcome: 'blocked', hostile: true,
      effects: [], intel: { kind: 'gold', target: 'o1', gold: 6 },
    };
    const r = recordAction(s, e, 2);
    expect(r.actions[0]).toMatchObject({ id: '77', act: 2, outcome: 'blocked', hostile: true, intel: { kind: 'gold', target: 'o1', gold: 6 } });
  });

  test('ItemUsed: автор — игрок, источник — вещь, облик скопирован', () => {
    const s = makeGame(12);
    const e: ItemUsed = {
      type: 'ItemUsed', at: 9, player: 'o1', itemId: 'x', kind: 'shape', target: 'o1',
      effects: [{ type: 'itemRemoved', itemId: 'x' }], guise: 'Тень',
    };
    const r = recordAction(s, e, 3);
    expect(r.actions[0]).toEqual({
      id: String(s.seq + 1), at: 9, act: 3, author: 'o1', source: { type: 'item', kind: 'shape' },
      target: 'o1', outcome: 'done', hostile: false, effects: e.effects, guise: 'Тень',
    });
  });
});
