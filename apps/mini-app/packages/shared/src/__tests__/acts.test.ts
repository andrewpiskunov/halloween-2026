import { describe, expect, test } from 'vitest';
import { Fair, allBut, buildAltar, checkInvariants, content, gm, makeGame, player, run, wakeReady } from './helpers';
import type { ConsentRequest, GameState, Item, Offer } from '../types';
import type { Command } from '../commands';

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

  test('act.next сбрасывает отметки акта (защиту, шипы, скидку, их авторов, ожидание согласия, попытки); проклятие и облик остаются', () => {
    const s0 = makeGame(15);
    const key = s0.roster[0];
    const guise = { name: 'Тень', at: 1, by: key };
    const s1: GameState = {
      ...s0,
      players: {
        ...s0.players,
        [key]: {
          ...s0.players[key], abilityUsedInAct: true, abilityPending: 'req', protection: { by: 'o9', source: 'ability' },
          thorns: true, thornsBy: 'o12', discount: true, discountBy: 'o14', hostileAttemptsAgainstInAct: 1, curse: true, guise,
        },
      },
    };
    const p = next(s1).players[key];
    expect(p).toMatchObject({ abilityUsedInAct: false, thorns: false, discount: false, hostileAttemptsAgainstInAct: 0, curse: true, guise });
    for (const f of ['protection', 'thornsBy', 'discountBy', 'abilityPending'] as const) expect(p[f]).toBeUndefined();
  });

  test('проклятие Эльмара: ставится при открытии только ему и переживает смену акта; защита и шипы нет', () => {
    const s = makeGame(12);
    expect(s.players.o9.curse).toBe(true);
    for (const key of s.roster.filter(k => k !== 'o9')) expect(s.players[key].curse).toBe(false);
    const withMarks: GameState = {
      ...s, players: { ...s.players, o9: { ...s.players.o9, protection: { by: 'o4', source: 'ability' }, thorns: true, thornsBy: 'o12' } },
    };
    const o9 = next(withMarks).players.o9;
    expect(o9.curse).toBe(true);
    expect(o9.protection).toBeUndefined();
    expect(o9.thorns).toBe(false);
  });

  test('проклятие Эльмара не ставится, если он не пришёл', () => {
    const s = makeGame(12, { present: allBut(12, ['o9']) });
    expect(s.players.o9.curse).toBe(false);
  });

  test('act.next закрывает pending-запросы согласия как expired (act) и снимает резерв их вещей; закрытые не трогает', () => {
    const s0 = makeGame(12);
    const item = Object.values(s0.items).find(i => i.owner.type === 'player' && i.owner.key === 'o1')!;
    const req = (id: string, status: ConsentRequest['status']): ConsentRequest => ({
      id, author: 'o1', action: { type: 'item', itemId: item.id, target: 'o6' }, approvers: ['o6'], approved: [],
      status, createdAt: 0, expiresAt: 300000,
    });
    const s1: GameState = {
      ...s0,
      items: { ...s0.items, [item.id]: { ...item, reservedFor: 'a' } },
      requests: { a: req('a', 'pending'), b: req('b', 'declined') },
    };
    const s2 = next(s1);
    expect(s2.requests.a).toMatchObject({ status: 'expired', reason: 'act' });
    expect(s2.requests.b).toEqual(s1.requests.b);
    expect(s2.items[item.id].reservedFor).toBeUndefined();
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

  test('resume и act.next во время паузы сдвигают сроки pending-запросов согласия', () => {
    const s0 = makeGame(15);
    const req = (id: string, status: ConsentRequest['status']): ConsentRequest => ({
      id, author: 'o1', action: { type: 'ability', use: { kind: 'protectSelf' } }, approvers: ['o6'], approved: [],
      status, createdAt: 0, expiresAt: 300000,
    });
    const s1: GameState = { ...s0, requests: { a: req('a', 'pending'), b: req('b', 'declined') } };
    const p = run(s1, { type: 'clock.pause' }, gm, 10000);
    if (!p.ok) throw new Error(p.error);
    const r = run(p.state, { type: 'clock.resume' }, gm, 70000);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.requests.a.expiresAt).toBe(360000);
    expect(r.state.requests.b.expiresAt).toBe(300000);
    const n = run(p.state, { type: 'act.next' }, gm, 70000);
    if (!n.ok) throw new Error(n.error);
    expect(n.state.requests.a).toMatchObject({ status: 'expired', expiresAt: 300000 });
  });

  test('act.next во время паузы действует как неявный resume: пауза снята, pending сдвинуты, resume → invalid', () => {
    const s0 = makeGame(15);
    const zero = { ash: 0, moon: 0, dew: 0 };
    const offer: Offer = {
      id: 'x', from: 'o6', to: 'o1', give: { gold: 1, ingredients: zero, items: [] }, get: { gold: 0, ingredients: zero, items: [] },
      service: false, status: 'pending', createdAt: 0, expiresAt: 300000,
    };
    const p = run({ ...s0, offers: { x: offer } }, { type: 'clock.pause' }, gm, 0);
    if (!p.ok) throw new Error(p.error);
    const n = run(p.state, { type: 'act.next' }, gm, 60000);
    if (!n.ok) throw new Error(n.error);
    expect(n.state.phase).toBe('act2');
    expect(n.state.clock.pausedAt).toBeUndefined();
    expect(n.state.clock).toEqual({ actStartedAt: 60000, pausedTotal: 0 });
    expect(n.state.offers.x.expiresAt).toBe(360000);
    expect(run(n.state, { type: 'clock.resume' }, gm, 70000)).toMatchObject({ ok: false, error: 'invalid' });
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

  test('correct itemOwner: цель вне состава → not_found, цель не игрок → invalid; вещь в лоте → invalid; резерв снимается', () => {
    const s0 = makeGame(12);
    const shard = Object.values(s0.items).find(i => i.kind === 'shard' && i.owner.type === 'player')!;
    const holder = (shard.owner as { key: string }).key;
    const to = s0.roster.find(k => k !== holder)!;
    const correct = (s: GameState, itemId: string, owner: Item['owner']) =>
      run(s, { type: 'gm.correct', playerKey: holder, change: { field: 'itemOwner', itemId, owner }, reason: 'x' }, gm);

    expect(correct(s0, shard.id, { type: 'player', key: 'o17' })).toMatchObject({ ok: false, error: 'not_found' });
    expect(correct(s0, shard.id, { type: 'altar', side: 'wake' })).toMatchObject({ ok: false, error: 'invalid' });
    const lot = Object.values(s0.lots)[0];
    expect(correct(s0, shard.id, { type: 'lot', id: lot.id })).toMatchObject({ ok: false, error: 'invalid' });
    expect(correct(s0, lot.items[0], { type: 'player', key: to })).toMatchObject({ ok: false, error: 'invalid' });

    const onAltar = run(s0, { type: 'altar.contribute', side: 'wake', itemId: shard.id }, player(holder));
    if (!onAltar.ok) throw new Error(onAltar.error);
    expect(correct(onAltar.state, shard.id, { type: 'altar', side: 'bind' })).toMatchObject({ ok: false, error: 'invalid' });

    const zero = { ash: 0, moon: 0, dew: 0 };
    const offered = run(s0, {
      type: 'offer.create', to,
      give: { gold: 0, ingredients: zero, items: [shard.id] }, get: { gold: 1, ingredients: zero, items: [] },
    }, player(holder));
    if (!offered.ok) throw new Error(offered.error);
    expect(offered.state.items[shard.id].reservedFor).toBeDefined();
    const moved = correct(offered.state, shard.id, { type: 'player', key: to });
    if (!moved.ok) throw new Error(moved.error);
    expect(moved.state.items[shard.id].owner).toEqual({ type: 'player', key: to });
    expect(moved.state.items[shard.id].reservedFor).toBeUndefined();
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

describe('исправления ведущего: отметки способностей (§6.7)', () => {
  type Change = Extract<Command, { type: 'gm.correct' }>['change'];
  const correct = (s: GameState, key: string, change: Change, now = 0) =>
    run(s, { type: 'gm.correct', playerKey: key, change, reason: 'по ходу игры' }, gm, now);
  const must = (s: GameState, key: string, change: Change, now = 0) => {
    const r = correct(s, key, change, now);
    if (!r.ok) throw new Error(`${r.error} ${r.detail ?? ''}`);
    expect(r.state.actions).toEqual(s.actions);
    return r;
  };
  const steal = (s: GameState) => {
    const r = run(s, { type: 'ability.use', use: { kind: 'stealGold', target: 'o2' } }, player('o8'));
    if (!r.ok) throw new Error(r.error);
    return r.state;
  };
  const err = (s: GameState, key: string, change: Change) => {
    const r = correct(s, key, change);
    return r.ok ? 'ok' : r.error;
  };

  test('защита: ставится от ведущего, вторая → invalid, снимается, снять отсутствующую → invalid', () => {
    const s = makeGame(30);
    const on = must(s, 'o1', { field: 'protection', value: true });
    expect(on.state.players.o1.protection).toEqual({ by: 'gm', source: 'gm' });
    expect(on.events[0]).toMatchObject({ type: 'Corrected', effects: [{ type: 'protection', player: 'o1', value: { by: 'gm', source: 'gm' } }] });
    expect(err(on.state, 'o1', { field: 'protection', value: true })).toBe('invalid');
    const off = must(on.state, 'o1', { field: 'protection', value: false });
    expect(off.state.players.o1).not.toHaveProperty('protection');
    expect(err(off.state, 'o1', { field: 'protection', value: false })).toBe('invalid');
  });

  test('шипы, проклятие, скидка: ставятся и снимаются; повтор и снятие отсутствующей → invalid', () => {
    let s = makeGame(30);
    for (const field of ['thorns', 'curse', 'discount'] as const) {
      expect(s.players.o2[field]).toBe(false);
      expect(err(s, 'o2', { field, value: false })).toBe('invalid');
      s = must(s, 'o2', { field, value: true }).state;
      expect(s.players.o2[field]).toBe(true);
      expect(err(s, 'o2', { field, value: true })).toBe('invalid');
    }
    expect(s.players.o2).toMatchObject({ thornsBy: 'gm', discountBy: 'gm' });
    for (const field of ['thorns', 'curse', 'discount'] as const) {
      s = must(s, 'o2', { field, value: false }).state;
      expect(s.players.o2[field]).toBe(false);
    }
    expect(s.players.o2).not.toHaveProperty('thornsBy');
    expect(s.players.o2).not.toHaveProperty('discountBy');
    // Старое проклятие Эльмара снимается исправлением.
    expect(must(s, 'o9', { field: 'curse', value: false }).state.players.o9.curse).toBe(false);
  });

  test('abilityUsed: снимается и ставится; false при ожидающем запросе → invalid', () => {
    let s = makeGame(30);
    s = steal(s);
    expect(s.players.o8.abilityUsedInAct).toBe(true);
    const back = must(s, 'o8', { field: 'abilityUsed', value: false });
    expect(back.state.players.o8.abilityUsedInAct).toBe(false);
    expect(err(back.state, 'o8', { field: 'abilityUsed', value: false })).toBe('invalid');
    expect(must(back.state, 'o8', { field: 'abilityUsed', value: true }).state.players.o8.abilityUsedInAct).toBe(true);

    const pending = run(s, { type: 'ability.use', use: { kind: 'cleanseOther', target: 'o9' } }, player('o10'));
    if (!pending.ok) throw new Error(pending.error);
    // Пока запрос ждёт ответа, ведущему подсказывают сначала отменить его, а не «отметки нет».
    for (const value of [false, true]) {
      const r = correct(pending.state, 'o10', { field: 'abilityUsed', value });
      expect(r).toMatchObject({ ok: false, error: 'invalid', detail: 'способность ждёт ответа: сначала отмените запрос' });
    }
  });

  test('hostileAttempt: снимается и ставится, повтор → invalid', () => {
    let s = makeGame(30);
    s = steal(s);
    expect(s.players.o2.hostileAttemptsAgainstInAct).toBe(1);
    const off = must(s, 'o2', { field: 'hostileAttempt', value: false });
    expect(off.state.players.o2.hostileAttemptsAgainstInAct).toBe(0);
    expect(err(off.state, 'o2', { field: 'hostileAttempt', value: false })).toBe('invalid');
    // Лимит снят: следующая враждебная попытка по цели снова проходит.
    expect(run(off.state, { type: 'ability.use', use: { kind: 'stealGold', target: 'o2' } }, player('r4')).ok).toBe(true);
    const on = must(off.state, 'o2', { field: 'hostileAttempt', value: true });
    expect(on.state.players.o2.hostileAttemptsAgainstInAct).toBe(1);
    expect(err(on.state, 'o2', { field: 'hostileAttempt', value: true })).toBe('invalid');
  });

  test('облик: ставится от ведущего, 41 символ → invalid, пустой и null снимают, снять отсутствующий → invalid', () => {
    const s = makeGame(30);
    const on = must(s, 'o1', { field: 'guise', name: '  Странник  ' }, 500);
    expect(on.state.players.o1.guise).toEqual({ name: 'Странник', at: 500, by: 'gm' });
    expect(err(s, 'o1', { field: 'guise', name: 'я'.repeat(41) })).toBe('invalid');
    expect(err(s, 'o1', { field: 'guise', name: 'две\nстроки' })).toBe('invalid');
    expect(must(s, 'o1', { field: 'guise', name: 'я'.repeat(40) }).state.players.o1.guise?.name).toBe('я'.repeat(40));
    expect(must(on.state, 'o1', { field: 'guise', name: '   ' }).state.players.o1).not.toHaveProperty('guise');
    expect(must(on.state, 'o1', { field: 'guise', name: null }).state.players.o1).not.toHaveProperty('guise');
    expect(err(s, 'o1', { field: 'guise', name: null })).toBe('invalid');
    expect(err(s, 'o1', { field: 'guise', name: '' })).toBe('invalid');
  });

  test('общие проверки: value не булево → invalid, игрок вне состава или не пришёл → not_found, setup → phase', () => {
    const s = makeGame(12, { present: allBut(12, ['o13']) });
    expect(err(s, 'o1', { field: 'curse', value: 'да' as unknown as boolean })).toBe('invalid');
    expect(err(s, 'o1', { field: 'нет такого', value: true } as unknown as Change)).toBe('invalid');
    expect(err(s, 'o1', { field: 'guise' } as unknown as Change)).toBe('invalid');
    expect(err(s, 'o13', { field: 'protection', value: true })).toBe('not_found');
    expect(err(s, 'o17', { field: 'protection', value: true })).toBe('not_found');
    expect(err(s, 'o17', { field: 'gold', delta: 1 })).toBe('not_found');
    expect(err({ ...s, phase: 'setup' }, 'o1', { field: 'protection', value: true })).toBe('phase');
  });
});

describe('исправления ведущего: сторона, цели, вещь с алтаря (этап 5, §2.4)', () => {
  type Change = Extract<Command, { type: 'gm.correct' }>['change'];
  const correct = (s: GameState, key: string, change: Change, now = 0) =>
    run(s, { type: 'gm.correct', playerKey: key, change, reason: 'ошибка учёта' }, gm, now);
  const must = (s: GameState, key: string, change: Change, now = 0) => {
    const r = correct(s, key, change, now);
    if (!r.ok) throw new Error(`${r.error} ${r.detail ?? ''}`);
    return r;
  };

  test('side: у свободного Грима ставит и снимает; у Серафины → invalid; чужая сторона и пустое снятие → invalid', () => {
    const s = makeGame(12);
    const on = must(s, 'o13', { field: 'side', side: 'bind' });
    expect(on.state.players.o13.side).toBe('bind');
    const off = must(on.state, 'o13', { field: 'side', side: null });
    expect(off.state.players.o13).not.toHaveProperty('side');
    expect(correct(s, 'o1', { field: 'side', side: 'bind' })).toMatchObject({ ok: false, error: 'invalid' });
    expect(correct(s, 'o13', { field: 'side', side: 'ship' })).toMatchObject({ ok: false, error: 'invalid' });
    expect(correct(s, 'o13', { field: 'side', side: null })).toMatchObject({ ok: false, error: 'invalid' });
  });

  test('goal: index 1 = true ставит отметку, null снимает; неверные index и value → invalid', () => {
    const s = makeGame(12);
    const on = must(s, 'o1', { field: 'goal', index: 1, value: true });
    expect(on.state.players.o1.goalOverrides?.[1]).toBe(true);
    expect(on.state.players.o1.goalOverrides?.[0]).toBeNull();
    const no = must(on.state, 'o1', { field: 'goal', index: 0, value: false });
    expect(no.state.players.o1.goalOverrides).toEqual([false, true]);
    const off = must(on.state, 'o1', { field: 'goal', index: 1, value: null });
    expect(off.state.players.o1.goalOverrides?.[1] ?? null).toBeNull();
    expect(correct(s, 'o1', { field: 'goal', index: 2, value: true } as unknown as Change)).toMatchObject({ ok: false, error: 'invalid' });
    expect(correct(s, 'o1', { field: 'goal', index: 0, value: 'да' } as unknown as Change)).toMatchObject({ ok: false, error: 'invalid' });
  });

  test('itemOwner с алтаря игроку: вклад удалён, вещь у игрока', () => {
    const f = new Fair(makeGame(12));
    const shard = f.find('shard', 'I');
    const holder = (shard.owner as { key: string }).key;
    const id = f.contribute(holder, 'wake', { itemId: shard.id });
    f.contribute('o2', 'wake', { gold: 2 });
    const r = must(f.s, 'o2', { field: 'itemOwner', itemId: shard.id, owner: { type: 'player', key: 'o2' } });
    expect(r.state.items[shard.id].owner).toEqual({ type: 'player', key: 'o2' });
    expect(r.state.altars.wake!.contributions.some(c => c.id === id)).toBe(false);
    expect(r.state.altars.wake!.contributions).toHaveLength(1);
    checkInvariants(r.state);
  });

  test('после закрытия: исправление несёт пересчитанные итоги (Грим: 11 золота — цель нет, 12 — да)', () => {
    const f = new Fair(makeGame(12));
    f.nextAct();
    f.nextAct();
    f.run({ type: 'session.close' }, gm);
    expect(f.s.players.o13.gold).toBe(6);
    const r = must(f.s, 'o13', { field: 'gold', delta: 5 }, 99);
    const e = r.events[0];
    if (e.type !== 'Corrected') throw new Error(e.type);
    expect(e.closing).toBeDefined();
    expect(e.closing!.closedAt).toBe(f.s.closing!.closedAt);
    expect(r.state.closing).toEqual(e.closing);
    expect(r.state.closing!.players.o13.goals[0]).toBe(false);
    const r2 = must(r.state, 'o13', { field: 'gold', delta: 1 });
    expect(r2.state.closing!.players.o13.goals[0]).toBe(true);
    checkInvariants(r2.state);
    // Ручная отметка цели после закрытия тоже пересчитывает итоги.
    const r3 = must(r2.state, 'o13', { field: 'goal', index: 0, value: false });
    expect(r3.state.closing!.players.o13.goals[0]).toBe(false);
    // До закрытия итогов в событии нет.
    const before = must(makeGame(12), 'o13', { field: 'gold', delta: 1 });
    expect(before.events[0]).not.toHaveProperty('closing');
    expect(before.state).not.toHaveProperty('closing');
  });

  test('два готовых алтаря по ошибке → sleep; ведущий забирает осколок с bind → исход wake, предупреждений нет', () => {
    const f = new Fair(makeGame(12));
    wakeReady(f);
    f.nextAct();
    f.winLot('o5', 2);
    f.nextAct();
    f.moveTo(f.find('shard', 'V').id, 'o5');
    buildAltar(f, 'bind', 'o5', ['IV', 'V'], ['o5', 'o6', 'o8']);
    // Третьего разного осколка командами не получить: ошибку учёта изображает поддельный осколок I на bind.
    const fake = { id: 'fake-shard', kind: 'shard' as const, ref: 'I', owner: { type: 'altar' as const, side: 'bind' as const } };
    const bind = f.s.altars.bind!;
    f.s = {
      ...f.s,
      items: { ...f.s.items, [fake.id]: fake },
      altars: { ...f.s.altars, bind: { ...bind, contributions: [...bind.contributions, { id: 'fake-c', player: 'o5', item: fake.id }] } },
    };
    f.run({ type: 'session.close' }, gm);
    expect(f.s.closing!.outcome).toBe('sleep');
    expect(f.s.closing!.warnings).toHaveLength(1);
    expect(f.s.closing!.players.o1.outcome).toBe(false);

    f.correct('o5', { field: 'itemOwner', itemId: fake.id, owner: { type: 'player', key: 'o5' } });
    expect(f.s.altars.bind!.contributions.some(c => c.id === 'fake-c')).toBe(false);
    expect(f.s.closing!.outcome).toBe('wake');
    expect(f.s.closing!.warnings).toEqual([]);
    expect(f.s.closing!.players.o1.outcome).toBe(true);
    checkInvariants(f.s);
  });
});
