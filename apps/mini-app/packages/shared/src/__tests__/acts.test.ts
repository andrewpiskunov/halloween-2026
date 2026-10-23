import { describe, expect, test } from 'vitest';
import { allBut, content, gm, makeGame, player, run } from './helpers';
import type { GameState, Offer } from '../types';

const next = (s: GameState, now = 0) => {
  const r = run(s, { type: 'act.next' }, gm, now);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const find = (s: GameState, kind: string, ref: string) => Object.values(s.items).find(i => i.kind === kind && i.ref === ref);

describe('смена актов', () => {
  test('act.next из act1: phase act2, пополнение ceil(15/6)=3 каждого, queued лоты акта 2 стали announced, создан лот с осколком IV и уликой A', () => {
    const s1 = makeGame(15);
    expect(s1.nPresent).toBe(15);
    const queued = Object.values(s1.lots).filter(l => l.status === 'queued' && l.act === 2).map(l => l.id);
    const s2 = next(s1);
    expect(s2.phase).toBe('act2');
    for (const k of ['ash', 'moon', 'dew'] as const) expect(s2.workshop[k]).toBe(s1.workshop[k] + 3);
    for (const id of queued) expect(s2.lots[id].status).toBe('announced');
    const iv = find(s2, 'shard', 'IV')!;
    const a = find(s2, 'clue', 'A')!;
    expect(iv.owner.type).toBe('lot');
    expect(a.owner).toEqual(iv.owner);
    const lot = s2.lots[(iv.owner as { id: string }).id];
    expect(lot).toMatchObject({ act: 2, status: 'announced' });
    expect(lot.items.sort()).toEqual([iv.id, a.id].sort());
  });

  test('act.next в act3 без Лиры: создан лот с осколком V; с Лирой: hiddenUntilAct снят', () => {
    const without = next(next(makeGame(17, { present: allBut(17, ['o14']) })));
    const v = find(without, 'shard', 'V')!;
    expect(v.owner.type).toBe('lot');
    expect(without.phase).toBe('act3');

    const withLyra = next(next(makeGame(17)));
    const v2 = find(withLyra, 'shard', 'V')!;
    expect(v2.owner).toEqual({ type: 'player', key: 'o14' });
    expect(v2.hiddenUntilAct).toBeUndefined();
    expect(Object.values(withLyra.items).filter(i => i.ref === 'V')).toHaveLength(1);
  });

  test('act.next сбрасывает abilityUsedInAct, protection, thorns, discount, pendingModifier, hostileAttemptsAgainstInAct; curse остаётся', () => {
    const s0 = makeGame(15);
    const key = s0.roster[0];
    const s1: GameState = {
      ...s0,
      players: {
        ...s0.players,
        [key]: {
          ...s0.players[key], abilityUsedInAct: true, protection: { by: 'o1' }, thorns: true, discount: true,
          pendingModifier: { x: 1 }, hostileAttemptsAgainstInAct: 2, curse: true,
        },
      },
    };
    const p = next(s1).players[key];
    expect(p).toMatchObject({ abilityUsedInAct: false, thorns: false, discount: false, hostileAttemptsAgainstInAct: 0, curse: true });
    expect(p.protection).toBeUndefined();
    expect(p.pendingModifier).toBeUndefined();
  });

  test('act.next из act3 → phase; из setup → phase; от игрока → forbidden; объявление акта добавлено с title из content.events', () => {
    const s1 = makeGame(15);
    const s2 = next(s1, 5000);
    const ev2 = content.events.find(e => e.when === 'Акт II')!;
    expect(s2.announcements.at(-1)).toEqual({ at: 5000, title: ev2.title, text: ev2.text });
    const s3 = next(s2, 7000);
    const ev3 = content.events.find(e => e.when === 'Акт III')!;
    expect(s3.announcements.at(-1)).toEqual({ at: 7000, title: ev3.title, text: ev3.text });
    expect(s3.clock).toEqual({ actStartedAt: 7000, pausedTotal: 0 });
    const r = run(s3, { type: 'act.next' }, gm);
    expect(r).toMatchObject({ ok: false, error: 'phase' });
    expect(run(s1, { type: 'act.next' }, player(s1.roster[0]))).toMatchObject({ ok: false, error: 'forbidden' });
  });
});

describe('часы', () => {
  test('pause/resume: resume через 60000 мс увеличивает pausedTotal на 60000 и сдвигает expiresAt каждого pending предложения; resume без паузы → invalid', () => {
    const s0 = makeGame(15);
    const zero = { ash: 0, moon: 0, dew: 0 };
    const mk = (id: string, status: Offer['status']): Offer => ({
      id, from: 'o6', to: 'o1', give: { gold: 1, ingredients: zero, items: [] }, get: { gold: 0, ingredients: zero, items: [] },
      service: false, status, createdAt: 0, expiresAt: 300000,
    });
    const s1: GameState = { ...s0, offers: { x: mk('x', 'pending'), y: mk('y', 'declined') } };
    expect(run(s1, { type: 'clock.resume' }, gm, 1000)).toMatchObject({ ok: false, error: 'invalid' });
    const p = run(s1, { type: 'clock.pause' }, gm, 10000);
    if (!p.ok) throw new Error(p.error);
    expect(p.state.clock.pausedAt).toBe(10000);
    expect(run(p.state, { type: 'clock.pause' }, gm, 11000)).toMatchObject({ ok: false, error: 'invalid' });
    const r = run(p.state, { type: 'clock.resume' }, gm, 70000);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.clock.pausedTotal).toBe(60000);
    expect(r.state.clock.pausedAt).toBeUndefined();
    expect(r.state.offers.x.expiresAt).toBe(360000);
    expect(r.state.offers.y.expiresAt).toBe(300000);
  });

  test('extend добавляет минуты к pausedTotal; неверные минуты → invalid; от игрока → forbidden', () => {
    const s = makeGame(15);
    const r = run(s, { type: 'clock.extend', minutes: 5 }, gm);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.clock.pausedTotal).toBe(300000);
    expect(run(s, { type: 'clock.extend', minutes: 0 }, gm)).toMatchObject({ ok: false, error: 'invalid' });
    expect(run(s, { type: 'clock.extend', minutes: 1.5 }, gm)).toMatchObject({ ok: false, error: 'invalid' });
    expect(run(s, { type: 'clock.extend', minutes: 5 }, player(s.roster[0]))).toMatchObject({ ok: false, error: 'forbidden' });
  });
});

describe('ведущий', () => {
  test('announce от игрока → forbidden; от gm добавляет Announcement; пустой текст → invalid', () => {
    const s = makeGame(15);
    expect(run(s, { type: 'gm.announce', text: 'Привет' }, player(s.roster[0]))).toMatchObject({ ok: false, error: 'forbidden' });
    expect(run(s, { type: 'gm.announce', text: '  ' }, gm)).toMatchObject({ ok: false, error: 'invalid' });
    const r = run(s, { type: 'gm.announce', text: 'Привет' }, gm, 42);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.announcements.at(-1)).toEqual({ at: 42, title: 'Ведущий', text: 'Привет' });
  });

  test('correct gold −2 с причиной ok; без причины → invalid; результат ниже reservedGold → insufficient; itemOwner переносит вещь', () => {
    const s0 = makeGame(15);
    const key = s0.roster[0];
    const s: GameState = { ...s0, players: { ...s0.players, [key]: { ...s0.players[key], gold: 6, reservedGold: 5 } } };
    const r = run(s, { type: 'gm.correct', playerKey: key, change: { field: 'gold', delta: -1 }, reason: 'штраф' }, gm);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.players[key].gold).toBe(5);
    expect(run(s, { type: 'gm.correct', playerKey: key, change: { field: 'gold', delta: -1 }, reason: '' }, gm)).toMatchObject({ ok: false, error: 'invalid' });
    expect(run(s, { type: 'gm.correct', playerKey: key, change: { field: 'gold', delta: -2 }, reason: 'штраф' }, gm)).toMatchObject({ ok: false, error: 'insufficient' });
    expect(run(s, { type: 'gm.correct', playerKey: key, change: { field: 'ingredient', ingredient: 'ash', delta: -99 }, reason: 'x' }, gm)).toMatchObject({ ok: false, error: 'insufficient' });
    const ing = run(s, { type: 'gm.correct', playerKey: key, change: { field: 'ingredient', ingredient: 'ash', delta: 2 }, reason: 'x' }, gm);
    if (!ing.ok) throw new Error(ing.error);
    expect(ing.state.players[key].ingredients.ash).toBe(s.players[key].ingredients.ash + 2);
    const item = Object.values(s.items)[0];
    const mv = run(s, { type: 'gm.correct', playerKey: key, change: { field: 'itemOwner', itemId: item.id, owner: { type: 'player', key } }, reason: 'ошибка' }, gm);
    if (!mv.ok) throw new Error(mv.error);
    expect(mv.state.items[item.id].owner).toEqual({ type: 'player', key });
    expect(run(s, { type: 'gm.correct', playerKey: key, change: { field: 'itemOwner', itemId: 'нет', owner: { type: 'player', key } }, reason: 'x' }, gm)).toMatchObject({ ok: false, error: 'not_found' });
    expect(run(s, { type: 'gm.correct', playerKey: 'zzz', change: { field: 'gold', delta: 1 }, reason: 'x' }, gm)).toMatchObject({ ok: false, error: 'not_found' });
  });

  test('rebind выдаёт код из ctx.newId и снимает telegramId', () => {
    const s = makeGame(15);
    const key = s.roster[0];
    expect(s.players[key].telegramId).toBeDefined();
    const r = run(s, { type: 'gm.rebind', roleKey: key }, gm);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.players[key].telegramId).toBeUndefined();
    expect(r.state.invites[key]).toMatch(/^id\d+$/);
    expect(r.state.invites[key]).not.toBe(s.invites[key]);
    expect(run(s, { type: 'gm.rebind', roleKey: 'zzz' }, gm)).toMatchObject({ ok: false, error: 'not_found' });
    expect(run(s, { type: 'gm.rebind', roleKey: key }, player(key))).toMatchObject({ ok: false, error: 'forbidden' });
  });
});
