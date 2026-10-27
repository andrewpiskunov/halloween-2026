import { describe, expect, test } from 'vitest';
import { gm, makeGame, player, run } from './helpers';
import type { Bundle, Counts, GameState, Item, Player } from '../types';

const zero = (): Counts => ({ ash: 0, moon: 0, dew: 0 });
const bundle = (b: Partial<Bundle> = {}): Bundle => ({ gold: 0, ingredients: zero(), items: [], ...b });
const withPlayer = (s: GameState, key: string, patch: Partial<Player>): GameState => ({
  ...s, players: { ...s.players, [key]: { ...s.players[key], ...patch } },
});

/** Изготавливает вещь в мастерской и возвращает состояние и вещь. */
function craft(s: GameState, key: string, recipeId: string): { state: GameState; item: Item } {
  const r = run(s, { type: 'shop.craft', recipeId }, player(key));
  if (!r.ok) throw new Error(`${r.error} ${r.detail ?? ''}`);
  const e = r.events.find(x => x.type === 'ItemCrafted');
  if (e?.type !== 'ItemCrafted') throw new Error('нет ItemCrafted');
  return { state: r.state, item: e.item };
}

const useItem = (s: GameState, key: string, itemId: string, target?: string) =>
  run(s, { type: 'item.use', itemId, ...(target !== undefined ? { target } : {}) }, player(key));
const errorOf = (r: ReturnType<typeof useItem>) => (r.ok ? 'ok' : r.error);

describe('item.use: Защитный талисман', () => {
  test('талисман исчезает и даёт защиту автору; запись журнала от вещи', () => {
    const { state: s, item } = craft(makeGame(30), 'o2', 'ward');
    expect(item.kind).toBe('ward');
    const r = useItem(s, 'o2', item.id);
    if (!r.ok) throw new Error(`${r.error} ${r.detail ?? ''}`);
    expect(r.events).toEqual([{
      type: 'ItemUsed', at: 0, player: 'o2', itemId: item.id, kind: 'ward', target: 'o2',
      effects: [{ type: 'itemRemoved', itemId: item.id }, { type: 'protection', player: 'o2', value: { by: 'o2', source: 'ward' } }],
    }]);
    expect(r.state.items[item.id]).toBeUndefined();
    expect(r.state.players.o2.protection).toEqual({ by: 'o2', source: 'ward' });
    // Вещь не расходует применение способности.
    expect(r.state.players.o2.abilityUsedInAct).toBe(false);
    expect(r.state.actions).toEqual([expect.objectContaining({
      author: 'o2', act: 1, source: { type: 'item', kind: 'ward' }, target: 'o2', outcome: 'done', hostile: false,
    })]);
    // target, равный автору, допустим.
    expect(errorOf(useItem(s, 'o2', item.id, 'o2'))).toBe('ok');
  });

  test('при активной защите → limit «защита уже есть»; другая цель → invalid', () => {
    const { state: s, item } = craft(makeGame(30), 'o2', 'ward');
    const prot = withPlayer(s, 'o2', { protection: { by: 'o9', source: 'ability' } });
    const r = useItem(prot, 'o2', item.id);
    expect(errorOf(r)).toBe('limit');
    expect(r.ok ? '' : r.detail).toBe('защита уже есть');
    expect(errorOf(useItem(s, 'o2', item.id, 'o6'))).toBe('invalid');
  });
});

describe('item.use: общие проверки', () => {
  test('Фокус и реликвия → invalid «эту вещь не применяют»', () => {
    const { state: s, item } = craft(makeGame(30), 'o4', 'focus');
    expect(item.kind).toBe('focus');
    const r = useItem(s, 'o4', item.id);
    expect(errorOf(r)).toBe('invalid');
    expect(r.ok ? '' : r.detail).toBe('эту вещь не применяют');
    const relic = Object.values(s.items).find(i => i.kind === 'relic' && i.owner.type === 'player' && i.owner.key === 'o2')!;
    expect(errorOf(useItem(s, 'o2', relic.id))).toBe('invalid');
  });

  test('чужая вещь → not_owner; нет вещи → not_found; вещь в резерве сделки → reserved', () => {
    const { state: s, item } = craft(makeGame(30), 'o2', 'ward');
    expect(errorOf(useItem(s, 'o4', item.id))).toBe('not_owner');
    expect(errorOf(useItem(s, 'o2', 'нет-такой'))).toBe('not_found');
    const offered = run(s, { type: 'offer.create', to: 'o6', give: bundle({ items: [item.id] }), get: bundle({ gold: 1 }) }, player('o2'));
    if (!offered.ok) throw new Error(offered.error);
    expect(errorOf(useItem(offered.state, 'o2', item.id))).toBe('reserved');
  });

  test('ведущий → forbidden; не в акте → phase', () => {
    const { state: s, item } = craft(makeGame(30), 'o2', 'ward');
    expect(errorOf(run(s, { type: 'item.use', itemId: item.id }, gm))).toBe('forbidden');
    expect(errorOf(useItem({ ...s, phase: 'closed' } as GameState, 'o2', item.id))).toBe('phase');
  });
});
