import { describe, expect, test } from 'vitest';
import { gm, makeGame, player, run } from './helpers';
import type { AbilityUse } from '../commands';
import type { Bundle, Counts, GameState, Player } from '../types';
import { available } from '../engine/bundles';

const zero = (): Counts => ({ ash: 0, moon: 0, dew: 0 });
const bundle = (b: Partial<Bundle> = {}): Bundle => ({ gold: 0, ingredients: zero(), items: [], ...b });
const withPlayer = (s: GameState, key: string, patch: Partial<Player>): GameState => ({
  ...s, players: { ...s.players, [key]: { ...s.players[key], ...patch } },
});

/** Добавляет игроку ингредиенты исправлением ведущего. */
function addIngredients(s: GameState, key: string, add: Partial<Counts>): GameState {
  for (const [ingredient, delta] of Object.entries(add) as [keyof Counts, number][]) {
    const r = run(s, { type: 'gm.correct', playerKey: key, change: { field: 'ingredient', ingredient, delta }, reason: 'тест' }, gm);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return s;
}

/** Всё золото игрока в резерве ожидающей сделки. */
function reserveAllGold(s: GameState, key: string, to: string): GameState {
  const r = run(s, { type: 'offer.create', to, give: bundle({ gold: s.players[key].gold }), get: bundle({ gold: 1 }) }, player(key));
  if (!r.ok) throw new Error(r.error);
  expect(available(r.state, key).gold).toBe(0);
  return r.state;
}

const use = (s: GameState, key: string, u: AbilityUse) => run(s, { type: 'ability.use', use: u }, player(key));

function done(s: GameState, key: string, u: AbilityUse, hostile: boolean) {
  const r = use(s, key, u);
  if (!r.ok) throw new Error(`${r.error} ${r.detail ?? ''}`);
  expect(r.events).toHaveLength(1);
  expect(r.events[0]).toMatchObject({ type: 'AbilityUsed', author: key, ability: u.kind, outcome: 'done', hostile });
  expect(r.state.players[key].abilityUsedInAct).toBe(true);
  expect(r.state.actions.at(-1)).toMatchObject({ author: key, act: 1, source: { type: 'ability', ability: u.kind }, outcome: 'done', hostile });
  return r;
}

/** Отказ без расхода: код ошибки, событий нет, применение и попытка не потрачены. */
function refused(s: GameState, key: string, u: AbilityUse, code: string, target?: string) {
  const r = use(s, key, u);
  expect(r.ok ? 'ok' : r.error).toBe(code);
  expect(s.players[key].abilityUsedInAct).toBe(false);
  if (target) expect(s.players[target].hostileAttemptsAgainstInAct).toBe(0);
}

describe('защита способностью', () => {
  test('protectSelf (o4): защита себе; повтор → limit; защита Эльмара на защищённого → limit', () => {
    const s = makeGame(30);
    const r = done(s, 'o4', { kind: 'protectSelf' }, false);
    expect(r.events[0]).toMatchObject({ effects: [{ type: 'protection', player: 'o4', value: { by: 'o4', source: 'ability' } }] });
    expect(r.state.players.o4.protection).toEqual({ by: 'o4', source: 'ability' });

    expect((use(r.state, 'o4', { kind: 'protectSelf' }) as { error: string }).error).toBe('limit');
    // Применение не потрачено, но защита уже есть (например, от талисмана).
    refused(withPlayer(s, 'o4', { protection: { by: 'o4', source: 'ward' } }), 'o4', { kind: 'protectSelf' }, 'limit');
    refused(r.state, 'o9', { kind: 'protectOther', target: 'o4' }, 'limit');
    const e = use(r.state, 'o9', { kind: 'protectOther', target: 'o4' });
    expect(e.ok ? '' : e.detail).toBe('защита уже есть');
  });

  test('protectOther (o9, t3): защита другому без согласия; на себя → invalid; цель вне ярмарки → not_found', () => {
    const s = makeGame(30);
    const r = done(s, 'o9', { kind: 'protectOther', target: 'o2' }, false);
    expect(r.events[0]).toMatchObject({ target: 'o2', effects: [{ type: 'protection', player: 'o2', value: { by: 'o9', source: 'ability' } }] });
    expect(r.state.players.o2.protection).toEqual({ by: 'o9', source: 'ability' });
    expect(r.state.requests).toEqual(s.requests);

    refused(s, 't3', { kind: 'protectOther', target: 't3' }, 'invalid');
    refused(s, 't3', { kind: 'protectOther', target: 'zz' }, 'not_found');
    refused(s, 't3', { kind: 'protectOther', target: 7 as unknown as string }, 'invalid');
    done(s, 't3', { kind: 'protectOther', target: 'o4' }, false);
  });
});

describe('враждебные действия', () => {
  test('stealGold (o8 → o2): 1 золото, попытка цели; второй вор (r4) в том же акте → limit', () => {
    const s = makeGame(30);
    const r = done(s, 'o8', { kind: 'stealGold', target: 'o2' }, true);
    expect(r.events[0]).toMatchObject({ target: 'o2', effects: [{ type: 'goldMove', from: 'o2', to: 'o8', amount: 1 }] });
    expect(r.state.players.o2.gold).toBe(5);
    expect(r.state.players.o8.gold).toBe(7);
    expect(r.state.players.o2.hostileAttemptsAgainstInAct).toBe(1);
    expect(r.state.actions[0]).toMatchObject({ target: 'o2', hostile: true, outcome: 'done' });

    const second = use(r.state, 'r4', { kind: 'stealGold', target: 'o2' });
    expect(second.ok ? 'ok' : second.error).toBe('limit');
    expect(r.state.players.r4.abilityUsedInAct).toBe(false);
  });

  test('защита блокирует кражу даже без доступного золота: защита снята, ресурсы на месте', () => {
    const prot = done(makeGame(30), 'o9', { kind: 'protectOther', target: 'o2' }, false).state;
    const s = reserveAllGold(prot, 'o2', 'o6');
    const r = use(s, 'o8', { kind: 'stealGold', target: 'o2' });
    if (!r.ok) throw new Error(r.error);
    expect(r.events).toEqual([{
      type: 'AbilityUsed', at: 0, author: 'o8', ability: 'stealGold', target: 'o2', outcome: 'blocked', hostile: true,
      effects: [{ type: 'protection', player: 'o2', value: null }],
    }]);
    expect(r.state.players.o2.protection).toBeUndefined();
    expect(r.state.players.o2.gold).toBe(6);
    expect(r.state.players.o8.gold).toBe(6);
    expect(r.state.players.o8.abilityUsedInAct).toBe(true);
    expect(r.state.players.o2.hostileAttemptsAgainstInAct).toBe(1);
    expect(r.state.actions.at(-1)).toMatchObject({ author: 'o8', target: 'o2', outcome: 'blocked', hostile: true });

    const again = use(r.state, 'r4', { kind: 'stealGold', target: 'o2' });
    expect(again.ok ? 'ok' : again.error).toBe('limit');
  });

  test('без защиты и с золотом в резерве сделки: insufficient, ничего не потрачено', () => {
    const s = reserveAllGold(makeGame(30), 'o2', 'o6');
    refused(s, 'o8', { kind: 'stealGold', target: 'o2' }, 'insufficient', 'o2');
    const r = use(s, 'o8', { kind: 'stealGold', target: 'o2' });
    expect(r.ok ? '' : r.detail).toBe('у цели нечего взять');
  });

  test('цель — сам автор → invalid; цель вне ярмарки → not_found', () => {
    const s = makeGame(30);
    refused(s, 'o8', { kind: 'stealGold', target: 'o8' }, 'invalid');
    refused(s, 'o8', { kind: 'stealGold', target: 'zz' }, 'not_found');
  });

  test('stealIngredient (t4): у цели нет Пепла → insufficient; с Пеплом → ingredientMove', () => {
    const s = makeGame(30);
    refused(s, 't4', { kind: 'stealIngredient', target: 'o2', ingredient: 'ash' }, 'insufficient', 'o2');
    refused(s, 't4', { kind: 'stealIngredient', target: 'o2', ingredient: 'gold' as never }, 'invalid');

    const withAsh = addIngredients(s, 'o2', { ash: 1 });
    const r = done(withAsh, 't4', { kind: 'stealIngredient', target: 'o2', ingredient: 'ash' }, true);
    expect(r.events[0]).toMatchObject({ effects: [{ type: 'ingredientMove', from: 'o2', to: 't4', ingredient: 'ash' }] });
    expect(r.state.players.o2.ingredients.ash).toBe(0);
    expect(r.state.players.t4.ingredients.ash).toBe(withAsh.players.t4.ingredients.ash + 1);
    expect(r.state.players.o2.hostileAttemptsAgainstInAct).toBe(1);
  });

  test('thorns (o12 → o6): шипы с автором; другой атакующий → limit; цель уже с шипами → invalid', () => {
    const s = makeGame(30);
    const r = done(s, 'o12', { kind: 'thorns', target: 'o6' }, true);
    expect(r.events[0]).toMatchObject({ effects: [{ type: 'thorns', player: 'o6', value: true, by: 'o12' }] });
    expect(r.state.players.o6).toMatchObject({ thorns: true, thornsBy: 'o12', hostileAttemptsAgainstInAct: 1 });

    refused(r.state, 'o8', { kind: 'stealGold', target: 'o6' }, 'limit');

    const thorny = withPlayer(s, 'o14', { thorns: true, thornsBy: 'o12' });
    refused(thorny, 'o12', { kind: 'thorns', target: 'o14' }, 'invalid', 'o14');
    const e = use(thorny, 'o12', { kind: 'thorns', target: 'o14' });
    expect(e.ok ? '' : e.detail).toBe('у цели уже есть шипы');
    // Защита проверяется раньше шипов.
    const both = withPlayer(thorny, 'o14', { protection: { by: 'o14', source: 'ward' } });
    const b = use(both, 'o12', { kind: 'thorns', target: 'o14' });
    expect(b.ok && b.events[0]).toMatchObject({ outcome: 'blocked' });
  });

  test('смена акта снимает защиту, шипы и попытки; проклятие остаётся', () => {
    let s = makeGame(30);
    s = done(s, 'o4', { kind: 'protectSelf' }, false).state;
    s = done(s, 'o12', { kind: 'thorns', target: 'o6' }, true).state;
    s = done(s, 'o8', { kind: 'stealGold', target: 'o2' }, true).state;
    expect(s.players.o9.curse).toBe(true);
    const r = run(s, { type: 'act.next' }, gm);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.players.o4.protection).toBeUndefined();
    expect(r.state.players.o6).toMatchObject({ thorns: false, hostileAttemptsAgainstInAct: 0 });
    expect(r.state.players.o6.thornsBy).toBeUndefined();
    expect(r.state.players.o2.hostileAttemptsAgainstInAct).toBe(0);
    expect(r.state.players.o8.abilityUsedInAct).toBe(false);
    expect(r.state.players.o9.curse).toBe(true);
  });
});
