import { describe, expect, test } from 'vitest';
import { makeGame, player, run } from './helpers';
import type { Command } from '../commands';
import type { GameState } from '../types';

const errorOf = (s: GameState, cmd: Command, key: string) => {
  const r = run(s, cmd, player(key));
  return r.ok ? 'ok' : r.error;
};
const ownedBy = (s: GameState, key: string, ref: string) =>
  Object.values(s.items).find(i => i.owner.type === 'player' && i.owner.key === key && i.ref === ref)!;
const okRun = (s: GameState, cmd: Command, key: string) => {
  const r = run(s, cmd, player(key));
  if (!r.ok) throw new Error(`${cmd.type}: ${r.error} ${r.detail ?? ''}`);
  return r;
};

describe('алтари: вклад', () => {
  test('contribute осколка: owner = altar, вещь нельзя предложить в сделке', () => {
    const s = makeGame(12);
    const shard = ownedBy(s, 'o1', 'I');
    const r = okRun(s, { type: 'altar.contribute', side: 'wake', itemId: shard.id }, 'o1');
    expect(r.state.items[shard.id].owner).toEqual({ type: 'altar', side: 'wake' });
    expect(r.state.altars.wake!.contributions).toHaveLength(1);
    expect(r.state.altars.wake!.contributions[0]).toMatchObject({ player: 'o1', item: shard.id });
    const bundle = { gold: 0, ingredients: { ash: 0, moon: 0, dew: 0 }, items: [shard.id] };
    const empty = { gold: 0, ingredients: { ash: 0, moon: 0, dew: 0 }, items: [] };
    const offer = run(r.state, { type: 'offer.create', to: 'o6', give: bundle, get: empty }, player('o1'));
    expect(offer.ok).toBe(false);
  });

  test('contribute 3 золота: gold −3, вклад с player и gold; 0 золота → invalid', () => {
    const s = makeGame(12);
    const r = okRun(s, { type: 'altar.contribute', side: 'bind', gold: 3 }, 'o6');
    expect(r.state.players.o6.gold).toBe(s.players.o6.gold - 3);
    expect(r.state.altars.bind!.contributions[0]).toMatchObject({ player: 'o6', gold: 3 });
    expect(r.events[0]).toMatchObject({ type: 'Contributed', side: 'bind' });
    expect(errorOf(s, { type: 'altar.contribute', side: 'bind', gold: 0 }, 'o6')).toBe('invalid');
    expect(errorOf(s, { type: 'altar.contribute', side: 'bind', gold: 1.5 }, 'o6')).toBe('invalid');
    expect(errorOf(s, { type: 'altar.contribute', side: 'bind', gold: 99 }, 'o6')).toBe('insufficient');
    expect(errorOf(s, { type: 'altar.contribute', side: 'bind' }, 'o6')).toBe('invalid');
    expect(errorOf(s, { type: 'altar.contribute', side: 'bind', gold: 1, itemId: 'x' }, 'o6')).toBe('invalid');
  });

  test('contribute вещи в резерве → reserved; чужой → not_owner; potion → invalid; на несуществующий алтарь ship → not_found', () => {
    const s = makeGame(12);
    const shard = ownedBy(s, 'o1', 'I');
    const empty = { gold: 0, ingredients: { ash: 0, moon: 0, dew: 0 }, items: [] };
    const offered = okRun(s, { type: 'offer.create', to: 'o6', give: { ...empty, items: [shard.id] }, get: empty }, 'o1');
    expect(errorOf(offered.state, { type: 'altar.contribute', side: 'wake', itemId: shard.id }, 'o1')).toBe('reserved');
    expect(errorOf(s, { type: 'altar.contribute', side: 'wake', itemId: shard.id }, 'o6')).toBe('not_owner');
    expect(errorOf(s, { type: 'altar.contribute', side: 'wake', itemId: 'нет' }, 'o6')).toBe('not_found');

    const crafted = okRun(s, { type: 'shop.craft', recipeId: 'cleanse' }, 'o6'); // ash 1 + dew 1
    const e = crafted.events[0];
    if (e.type !== 'ItemCrafted') throw new Error('нет ItemCrafted');
    expect(errorOf(crafted.state, { type: 'altar.contribute', side: 'wake', itemId: e.item.id }, 'o6')).toBe('invalid');

    expect(s.altars.ship).toBeUndefined();
    expect(errorOf(s, { type: 'altar.contribute', side: 'ship', gold: 1 }, 'o6')).toBe('not_found');
  });

  test('Фокус можно положить на алтарь', () => {
    const base = makeGame(12);
    const s = { ...base, players: { ...base.players, o6: { ...base.players.o6, ingredients: { ash: 2, moon: 1, dew: 0 } } } };
    const crafted = okRun(s, { type: 'shop.craft', recipeId: 'focus' }, 'o6');
    const e = crafted.events[0];
    if (e.type !== 'ItemCrafted') throw new Error('нет ItemCrafted');
    const r = okRun(crafted.state, { type: 'altar.contribute', side: 'break', itemId: e.item.id }, 'o6');
    expect(r.state.items[e.item.id].owner).toEqual({ type: 'altar', side: 'break' });
  });

  test('осколок V на алтарь в act1 → invalid, в act3 ok', () => {
    const s = makeGame(12);
    const v = ownedBy(s, 'o14', 'V');
    expect(v.hiddenUntilAct).toBe(3);
    expect(errorOf(s, { type: 'altar.contribute', side: 'wake', itemId: v.id }, 'o14')).toBe('invalid');
    const late: GameState = { ...s, phase: 'act3', items: { ...s.items, [v.id]: { ...v } } };
    const r = okRun(late, { type: 'altar.contribute', side: 'wake', itemId: v.id }, 'o14');
    expect(r.state.items[v.id].owner).toEqual({ type: 'altar', side: 'wake' });
  });

  test('вне актов и не участник', () => {
    const s = makeGame(12);
    expect(errorOf({ ...s, phase: 'closed' }, { type: 'altar.contribute', side: 'wake', gold: 1 }, 'o6')).toBe('phase');
    expect(run(s, { type: 'altar.contribute', side: 'wake', gold: 1 }, { type: 'gm' })).toMatchObject({ ok: false, error: 'forbidden' });
  });
});

describe('алтари: отзыв', () => {
  test('withdraw своего вклада возвращает вещь или золото; чужого → forbidden', () => {
    const s = makeGame(12);
    const shard = ownedBy(s, 'o1', 'I');
    const a = okRun(s, { type: 'altar.contribute', side: 'wake', itemId: shard.id }, 'o1');
    const b = okRun(a.state, { type: 'altar.contribute', side: 'bind', gold: 3 }, 'o6');
    const shardContribution = b.state.altars.wake!.contributions[0].id;
    const goldContribution = b.state.altars.bind!.contributions[0].id;

    expect(errorOf(b.state, { type: 'altar.withdraw', contributionId: shardContribution }, 'o6')).toBe('forbidden');
    expect(errorOf(b.state, { type: 'altar.withdraw', contributionId: 'нет' }, 'o6')).toBe('not_found');

    const w1 = okRun(b.state, { type: 'altar.withdraw', contributionId: shardContribution }, 'o1');
    expect(w1.state.items[shard.id].owner).toEqual({ type: 'player', key: 'o1' });
    expect(w1.state.altars.wake!.contributions).toHaveLength(0);
    expect(w1.events[0]).toMatchObject({ type: 'ContributionWithdrawn', side: 'wake', player: 'o1' });

    const w2 = okRun(b.state, { type: 'altar.withdraw', contributionId: goldContribution }, 'o6');
    expect(w2.state.players.o6.gold).toBe(s.players.o6.gold);
    expect(w2.state.altars.bind!.contributions).toHaveLength(0);

    expect(errorOf({ ...b.state, phase: 'closed' }, { type: 'altar.withdraw', contributionId: goldContribution }, 'o6')).toBe('phase');
  });
});
