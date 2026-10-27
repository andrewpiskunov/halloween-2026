import { describe, expect, test } from 'vitest';
import { gm, makeGame, player, run } from './helpers';
import type { Actor, Command } from '../commands';
import type { Event } from '../events';
import type { Bundle, Counts, GameState, Item } from '../types';
import { emptyState } from '../engine/session';

const zero = (): Counts => ({ ash: 0, moon: 0, dew: 0 });
const bundle = (b: Partial<Bundle> = {}): Bundle => ({ gold: 0, ingredients: zero(), items: [], ...b });

function must(s: GameState, cmd: Command, actor: Actor, now = 0) {
  const r = run(s, cmd, actor, now);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.error} ${r.detail ?? ''}`);
  return r;
}
/** Даёт игроку ингредиенты в обход мастерской: тесту важна запись журнала, а не цена. */
const withIngredients = (s: GameState, key: string, ingredients: Counts): GameState =>
  ({ ...s, players: { ...s.players, [key]: { ...s.players[key], ingredients } } });

/** Грета изготавливает Фокус силы; возвращает состояние и id вещи. */
function gretaCraftsFocus(now = 100) {
  const s = withIngredients(makeGame(12), 'o6', { ash: 3, moon: 3, dew: 3 });
  const r = must(s, { type: 'shop.craft', recipeId: 'focus' }, player('o6'), now);
  const e = r.events.find(x => x.type === 'ItemCrafted') as Extract<Event, { type: 'ItemCrafted' }>;
  return { state: r.state, itemId: e.item.id };
}

describe('журналы сделок и изготовлений', () => {
  test('emptyState: журналы пустые, итогов закрытия нет', () => {
    const s = emptyState();
    expect(s.trades).toEqual([]);
    expect(s.crafts).toEqual([]);
    expect(s.closing).toBeUndefined();
  });

  test('shop.craft пишет CraftRecord', () => {
    const { state, itemId } = gretaCraftsFocus(100);
    expect(state.crafts).toEqual([{ at: 100, player: 'o6', kind: 'focus', itemId }]);
  });

  test('offer.accept пишет TradeRecord с createdBy вещей до перемещения', () => {
    const { state: s0, itemId } = gretaCraftsFocus();
    const c = must(s0, { type: 'offer.create', to: 'o1', give: bundle({ items: [itemId] }), get: bundle({ gold: 2 }) }, player('o6'), 200);
    const id = (c.events[0] as Extract<Event, { type: 'OfferCreated' }>).offer.id;
    const a = must(c.state, { type: 'offer.accept', id }, player('o1'), 300);
    expect(a.state.trades).toEqual([{
      id, at: 300, from: 'o6', to: 'o1', service: false,
      give: { gold: 0, ingredients: zero(), items: [{ kind: 'focus', ref: 'focus', createdBy: 'o6' }] },
      get: { gold: 2, ingredients: zero(), items: [] },
    }]);
    // Вещь ушла к Серафине, журнал изготовлений не тронут.
    expect(a.state.items[itemId].owner).toEqual({ type: 'player', key: 'o1' });
    expect(a.state.crafts).toHaveLength(1);
  });

  test('сделка с ингредиентами и чужой вещью без createdBy: поле createdBy не появляется', () => {
    const s0 = withIngredients(makeGame(12), 'o1', { ash: 2, moon: 0, dew: 0 });
    const shard = Object.values(s0.items).find(i => i.owner.type === 'player' && i.owner.key === 'o1' && i.kind === 'shard')!;
    const c = must(s0, { type: 'offer.create', to: 'o6', give: bundle({ ingredients: { ash: 2, moon: 0, dew: 0 }, items: [shard.id] }), get: bundle({ gold: 1 }), service: true }, player('o1'));
    const id = (c.events[0] as Extract<Event, { type: 'OfferCreated' }>).offer.id;
    const a = must(c.state, { type: 'offer.accept', id }, player('o6'));
    expect(a.state.trades[0]).toMatchObject({ from: 'o1', to: 'o6', service: true });
    expect(a.state.trades[0].give).toEqual({ gold: 0, ingredients: { ash: 2, moon: 0, dew: 0 }, items: [{ kind: 'shard', ref: shard.ref }] });
  });

  test('перековка Хельги (n20) пишет CraftRecord с видом новой вещи', () => {
    const s30 = makeGame(30);
    const pot: Item = { id: 'pot', kind: 'potion', ref: 'cleanse', owner: { type: 'player', key: 'n20' }, createdBy: 'o1' };
    const s: GameState = { ...s30, items: { ...s30.items, pot } };
    const r = must(s, { type: 'ability.use', use: { kind: 'reforge', itemId: 'pot', into: 'ward' } }, player('n20'), 500);
    const fresh = Object.values(r.state.items).find(i => !s.items[i.id])!;
    expect(r.state.crafts).toEqual([{ at: 500, player: 'n20', kind: 'ward', itemId: fresh.id }]);
  });

  test('session.reset обнуляет журналы', () => {
    const { state: s0, itemId } = gretaCraftsFocus();
    const c = must(s0, { type: 'offer.create', to: 'o1', give: bundle({ items: [itemId] }), get: bundle({ gold: 2 }) }, player('o6'));
    const id = (c.events[0] as Extract<Event, { type: 'OfferCreated' }>).offer.id;
    const a = must(c.state, { type: 'offer.accept', id }, player('o1'));
    expect(a.state.trades).toHaveLength(1);
    const r = must(a.state, { type: 'session.reset' }, gm);
    expect(r.state.trades).toEqual([]);
    expect(r.state.crafts).toEqual([]);
    expect(r.state.closing).toBeUndefined();
  });
});
