import { describe, expect, test } from 'vitest';
import { gm, makeGame, player, run } from './helpers';
import type { AbilityUse } from '../commands';
import type { Event } from '../events';
import type { Counts, GameState, Item, Player } from '../types';

const withPlayer = (s: GameState, key: string, patch: Partial<Player>): GameState => ({
  ...s, players: { ...s.players, [key]: { ...s.players[key], ...patch } },
});
const withWorkshop = (s: GameState, patch: Partial<Counts>): GameState => ({ ...s, workshop: { ...s.workshop, ...patch } });
const withItem = (s: GameState, item: Item): GameState => ({ ...s, items: { ...s.items, [item.id]: item } });
const ownItem = (id: string, key: string, kind: Item['kind'], ref: string, extra: Partial<Item> = {}): Item =>
  ({ id, kind, ref, owner: { type: 'player', key }, ...extra });

/** Добавляет игроку ингредиенты исправлением ведущего. */
function addIngredients(s: GameState, key: string, add: Partial<Counts>): GameState {
  for (const [ingredient, delta] of Object.entries(add) as [keyof Counts, number][]) {
    const r = run(s, { type: 'gm.correct', playerKey: key, change: { field: 'ingredient', ingredient, delta }, reason: 'тест' }, gm);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return s;
}

const use = (s: GameState, key: string, u: AbilityUse) => run(s, { type: 'ability.use', use: u }, player(key));

function done(s: GameState, key: string, u: AbilityUse) {
  const r = use(s, key, u);
  if (!r.ok) throw new Error(`${r.error} ${r.detail ?? ''}`);
  expect(r.events[0]).toMatchObject({ type: 'AbilityUsed', author: key, ability: u.kind, outcome: 'done', hostile: false });
  expect(r.state.players[key].abilityUsedInAct).toBe(true);
  expect(r.state.actions).toHaveLength(1);
  expect(r.state.actions[0]).toMatchObject({ author: key, act: 1, source: { type: 'ability', ability: u.kind }, outcome: 'done' });
  return r;
}

/** Отказ без расхода: код ошибки, применение не потрачено, журнал пуст. */
function refused(s: GameState, key: string, u: AbilityUse, code: string) {
  const r = use(s, key, u);
  expect(r.ok ? 'ok' : r.error).toBe(code);
  expect(s.players[key].abilityUsedInAct).toBe(false);
  expect(s.actions).toEqual([]);
}

const crafted = (events: Event[]) => {
  const e = events[1];
  if (e?.type !== 'ItemCrafted') throw new Error('нет ItemCrafted');
  return e;
};

describe('способности изготовления', () => {
  test('payAshWithGold (o1): Пепел не списан, плата на 1 больше; рецепт без Пепла → invalid', () => {
    const s = addIngredients(makeGame(30), 'o1', { ash: 1, dew: 1 });
    const r = done(s, 'o1', { kind: 'payAshWithGold', recipeId: 'cleanse' });
    expect(r.events).toHaveLength(2);
    expect(r.events[0]).toMatchObject({ effects: [] });
    const e = crafted(r.events);
    expect(e).toMatchObject({ paidGold: 2, paidIngredients: { dew: 1 }, viaAbility: 'payAshWithGold' });
    expect(e.paidIngredients.ash ?? 0).toBe(0);
    expect(r.state.players.o1.ingredients.ash).toBe(s.players.o1.ingredients.ash);
    expect(r.state.players.o1.ingredients.dew).toBe(s.players.o1.ingredients.dew - 1);
    expect(r.state.players.o1.gold).toBe(s.players.o1.gold - 2);
    expect(r.state.items[e.item.id]).toMatchObject({ kind: 'potion', ref: 'cleanse', createdBy: 'o1' });

    refused(addIngredients(s, 'o1', { moon: 1 }), 'o1', { kind: 'payAshWithGold', recipeId: 'ward' }, 'invalid');
  });

  test('focusFree (o5): без платы, скидка не тратится; с шипами плата 1; нет ингредиентов → insufficient', () => {
    const s = addIngredients(makeGame(30), 'o5', { ash: 1, moon: 1 });
    const disc = withPlayer(s, 'o5', { discount: true, discountBy: 'o14' });
    const r = done(disc, 'o5', { kind: 'focusFree' });
    const e = crafted(r.events);
    expect(e).toMatchObject({ paidGold: 0, clearedDiscount: false, clearedThorns: false, viaAbility: 'focusFree' });
    expect(e.item).toMatchObject({ kind: 'focus', ref: 'focus', createdBy: 'o5' });
    expect(r.state.players.o5.discount).toBe(true);
    expect(r.state.players.o5.gold).toBe(s.players.o5.gold);

    const th = done(withPlayer(s, 'o5', { thorns: true, thornsBy: 'o12' }), 'o5', { kind: 'focusFree' });
    expect(crafted(th.events)).toMatchObject({ paidGold: 1, clearedThorns: true });
    expect(th.state.players.o5.thorns).toBe(false);

    refused(withPlayer(s, 'o5', { ingredients: { ash: 0, moon: 0, dew: 0 } }), 'o5', { kind: 'focusFree' }, 'insufficient');
  });

  test('substituteIngredient (o6): to вместо from; to === from → invalid', () => {
    const s = addIngredients(makeGame(30), 'o6', { moon: 1, dew: 1 });
    const r = done(s, 'o6', { kind: 'substituteIngredient', recipeId: 'cleanse', from: 'ash', to: 'moon' });
    const e = crafted(r.events);
    expect(e.paidIngredients).toEqual({ moon: 1, dew: 1 });
    expect(e).toMatchObject({ paidGold: 1, viaAbility: 'substituteIngredient' });
    expect(r.state.players.o6.ingredients.ash).toBe(s.players.o6.ingredients.ash);
    expect(r.state.players.o6.ingredients.moon).toBe(s.players.o6.ingredients.moon - 1);

    refused(s, 'o6', { kind: 'substituteIngredient', recipeId: 'cleanse', from: 'ash', to: 'ash' }, 'invalid');
  });
});

describe('способности покупки', () => {
  test('buyCheap (o3): −1 золото, запас −1; пустой запас → insufficient', () => {
    const s = makeGame(30);
    const r = done(s, 'o3', { kind: 'buyCheap', ingredient: 'moon' });
    expect(r.events[1]).toMatchObject({ type: 'IngredientBought', player: 'o3', ingredient: 'moon', count: 1, paidGold: 1 });
    expect(r.state.players.o3.gold).toBe(s.players.o3.gold - 1);
    expect(r.state.players.o3.ingredients.moon).toBe(s.players.o3.ingredients.moon + 1);
    expect(r.state.workshop.moon).toBe(s.workshop.moon - 1);

    refused(withWorkshop(s, { moon: 0 }), 'o3', { kind: 'buyCheap', ingredient: 'moon' }, 'insufficient');
  });

  test('buyBulk (o7): разные → два события 2 + 1; одинаковые → одно с count 2; запас 1 на двойной → insufficient', () => {
    const s = makeGame(30);
    const r = done(s, 'o7', { kind: 'buyBulk', take: ['ash', 'moon'] });
    expect(r.events.slice(1)).toMatchObject([
      { type: 'IngredientBought', ingredient: 'ash', count: 1, paidGold: 2 },
      { type: 'IngredientBought', ingredient: 'moon', count: 1, paidGold: 1 },
    ]);
    expect(r.events).toHaveLength(3);
    expect(r.state.players.o7.gold).toBe(s.players.o7.gold - 3);
    expect(r.state.workshop.ash).toBe(s.workshop.ash - 1);
    expect(r.state.workshop.moon).toBe(s.workshop.moon - 1);

    const same = done(s, 'o7', { kind: 'buyBulk', take: ['dew', 'dew'] });
    expect(same.events).toHaveLength(2);
    expect(same.events[1]).toMatchObject({ type: 'IngredientBought', ingredient: 'dew', count: 2, paidGold: 3 });
    expect(same.state.players.o7.ingredients.dew).toBe(s.players.o7.ingredients.dew + 2);

    refused(withWorkshop(s, { dew: 1 }), 'o7', { kind: 'buyBulk', take: ['dew', 'dew'] }, 'insufficient');
  });

  test('buyFromBank (n19): запас не меняется, −2 золота, fromBank; золота 1 → insufficient', () => {
    const s = withWorkshop(makeGame(30), { ash: 0 });
    const r = done(s, 'n19', { kind: 'buyFromBank', ingredient: 'ash' });
    expect(r.events[1]).toMatchObject({ type: 'IngredientBought', ingredient: 'ash', count: 1, paidGold: 2, fromBank: true });
    expect(r.state.workshop).toEqual(s.workshop);
    expect(r.state.players.n19.gold).toBe(s.players.n19.gold - 2);
    expect(r.state.players.n19.ingredients.ash).toBe(s.players.n19.ingredients.ash + 1);

    refused(withPlayer(s, 'n19', { gold: 1 }), 'n19', { kind: 'buyFromBank', ingredient: 'ash' }, 'insufficient');
  });
});

describe('обмен с запасом', () => {
  test('grow (o2): отдал Росу, получил две; другой ингредиент уходит в запас; Рос в запасе < 2 → insufficient', () => {
    const s = addIngredients(makeGame(30), 'o2', { dew: 1, moon: 1 });
    const r = done(s, 'o2', { kind: 'grow', give: 'dew' });
    expect(r.events).toHaveLength(1);
    expect(r.state.players.o2.ingredients.dew).toBe(s.players.o2.ingredients.dew + 1);
    expect(r.state.workshop.dew).toBe(s.workshop.dew - 1);

    const m = done(s, 'o2', { kind: 'grow', give: 'moon' });
    expect(m.state.players.o2.ingredients).toMatchObject({ moon: s.players.o2.ingredients.moon - 1, dew: s.players.o2.ingredients.dew + 2 });
    expect(m.state.workshop).toMatchObject({ moon: s.workshop.moon + 1, dew: s.workshop.dew - 2 });

    refused(withWorkshop(s, { dew: 1 }), 'o2', { kind: 'grow', give: 'dew' }, 'insufficient');
  });

  test('swapIngredient (n18): свой на любой из запаса; take === give → invalid', () => {
    const s = addIngredients(makeGame(30), 'n18', { ash: 1 });
    const r = done(s, 'n18', { kind: 'swapIngredient', give: 'ash', take: 'dew' });
    expect(r.state.players.n18.ingredients).toMatchObject({ ash: s.players.n18.ingredients.ash - 1, dew: s.players.n18.ingredients.dew + 1 });
    expect(r.state.workshop).toMatchObject({ ash: s.workshop.ash + 1, dew: s.workshop.dew - 1 });
    expect(r.state.players.n18.gold).toBe(s.players.n18.gold);

    refused(s, 'n18', { kind: 'swapIngredient', give: 'ash', take: 'ash' }, 'invalid');
  });
});

describe('превращение изделий', () => {
  test('disassemble (o13): вещь исчезла, два ингредиента из запаса; реликвия → invalid', () => {
    const s = withItem(makeGame(30), ownItem('pot', 'o13', 'potion', 'cleanse'));
    const r = done(s, 'o13', { kind: 'disassemble', itemId: 'pot', take: ['moon', 'moon'] });
    expect(r.state.items.pot).toBeUndefined();
    expect(r.state.players.o13.ingredients.moon).toBe(s.players.o13.ingredients.moon + 2);
    expect(r.state.workshop.moon).toBe(s.workshop.moon - 2);

    const rel = withItem(s, ownItem('rel', 'o13', 'relic', 'Тестовая реликвия'));
    refused(rel, 'o13', { kind: 'disassemble', itemId: 'rel', take: ['ash', 'dew'] }, 'invalid');
  });

  test('reforge (n20): новая вещь другого вида, createdBy n20, −1 золото; into shape и исходный shape → invalid', () => {
    const s = withItem(makeGame(30), ownItem('pot', 'n20', 'potion', 'cleanse', { createdBy: 'o1' }));
    const r = done(s, 'n20', { kind: 'reforge', itemId: 'pot', into: 'ward' });
    expect(r.state.items.pot).toBeUndefined();
    const fresh = Object.values(r.state.items).filter(i => !s.items[i.id]);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({ kind: 'ward', ref: 'ward', owner: { type: 'player', key: 'n20' }, createdBy: 'n20' });
    expect(fresh[0].id).not.toBe('pot');
    expect(r.state.players.n20.gold).toBe(s.players.n20.gold - 1);

    refused(s, 'n20', { kind: 'reforge', itemId: 'pot', into: 'shape' as 'ward' }, 'invalid');
    refused(s, 'n20', { kind: 'reforge', itemId: 'pot', into: 'cleanse' }, 'invalid');
    const shape = withItem(s, ownItem('stone', 'n20', 'shape', 'shape'));
    refused(shape, 'n20', { kind: 'reforge', itemId: 'stone', into: 'focus' }, 'invalid');
  });

  test('sellToBank (t1): вещь исчезла, +2 золота; чужая вещь → not_owner', () => {
    const s = withItem(makeGame(30), ownItem('st', 't1', 'shape', 'shape'));
    const r = done(s, 't1', { kind: 'sellToBank', itemId: 'st' });
    expect(r.state.items.st).toBeUndefined();
    expect(r.state.players.t1.gold).toBe(s.players.t1.gold + 2);

    const other = withItem(s, ownItem('alien', 'o1', 'potion', 'cleanse'));
    refused(other, 't1', { kind: 'sellToBank', itemId: 'alien' }, 'not_owner');
  });
});

describe('ability.use: общие проверки', () => {
  test('повтор в том же акте → limit; после act.next снова ok', () => {
    const s = makeGame(30);
    const r = done(s, 'n19', { kind: 'buyFromBank', ingredient: 'dew' });
    const again = use(r.state, 'n19', { kind: 'buyFromBank', ingredient: 'dew' });
    expect(again.ok ? 'ok' : again.error).toBe('limit');

    const next = run(r.state, { type: 'act.next' }, gm);
    if (!next.ok) throw new Error(next.error);
    const act2 = use(next.state, 'n19', { kind: 'buyFromBank', ingredient: 'dew' });
    if (!act2.ok) throw new Error(act2.error);
    expect(act2.state.actions.at(-1)).toMatchObject({ act: 2, author: 'n19' });
  });

  test('чужой вид → forbidden; setup → phase; вещь в резерве → reserved; ожидание согласия → limit', () => {
    const s = makeGame(30);
    refused(s, 'n19', { kind: 'buyCheap', ingredient: 'ash' }, 'forbidden');
    refused({ ...s, phase: 'setup' }, 'n19', { kind: 'buyFromBank', ingredient: 'ash' }, 'phase');
    const res = withItem(s, ownItem('st', 't1', 'potion', 'cleanse', { reservedFor: 'offer1' }));
    refused(res, 't1', { kind: 'sellToBank', itemId: 'st' }, 'reserved');
    refused(withPlayer(s, 'n19', { abilityPending: 'req1' }), 'n19', { kind: 'buyFromBank', ingredient: 'ash' }, 'limit');
  });

  test('ведущий → forbidden; неверный ингредиент → invalid; нет рецепта → not_found; вид не реализован → invalid', () => {
    const s = makeGame(30);
    const byGm = run(s, { type: 'ability.use', use: { kind: 'buyFromBank', ingredient: 'ash' } }, gm);
    expect(byGm.ok ? 'ok' : byGm.error).toBe('forbidden');
    refused(s, 'n19', { kind: 'buyFromBank', ingredient: 'gold' as 'ash' }, 'invalid');
    refused(s, 'o1', { kind: 'payAshWithGold', recipeId: 'nope' }, 'not_found');
    refused(s, 'o10', { kind: 'cleanseOther', target: 'o2' }, 'invalid');
  });
});
