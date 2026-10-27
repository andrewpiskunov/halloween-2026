import { describe, expect, test } from 'vitest';
import type { Actor, Command } from '../commands';
import { reduce } from '../engine';
import { computeClosing } from '../engine/closing';
import type { Event } from '../events';
import type { GameState } from '../types';
import { Fair, bundle, checkGold, checkInvariants, content, gm, makeGame, newGame, player, run, system } from './helpers';

/** Ярмарка в третьем акте; события с начала сессии собираются в log. */
function act3(n: number, log: Event[]): Fair {
  const f = new Fair(makeGame(n, { log }));
  for (let i = 0; i < 2; i++) log.push(...f.run({ type: 'act.next' }, gm));
  expect(f.s.phase).toBe('act3');
  return f;
}

/** Отказ команды: код ошибки и отсутствие событий. */
function refusal(s: GameState, cmd: Command, actor: Actor, now = 0): string {
  const r = run(s, cmd, actor, now);
  return r.ok ? 'ok' : r.error;
}

/**
 * Перед закрытием: pending предложение с золотом и вещью, pending просьба Ады об очищении Эльмара,
 * лот акта II без ставок продаётся по цене.
 */
function prepared() {
  const log: Event[] = [];
  const f = act3(30, log);
  const shard = f.find('shard', 'I');
  const from = (shard.owner as { key: string }).key;
  const to = f.s.roster.find(k => k !== from && k !== 'o10' && k !== 'o9')!;
  const offerEv = f.as(from, { type: 'offer.create', to, give: bundle({ gold: 2, items: [shard.id] }), get: bundle({ gold: 1 }) });
  log.push(...offerEv);
  const offer = offerEv[0].type === 'OfferCreated' ? offerEv[0].offer : undefined;
  const reqEv = f.as('o10', { type: 'ability.use', use: { kind: 'cleanseOther', target: 'o9' } });
  log.push(...reqEv);
  const req = reqEv[0].type === 'ConsentRequested' ? reqEv[0].request : undefined;
  const lot = Object.values(f.s.lots).find(l => l.act === 2 && l.status === 'announced')!;
  log.push(...f.run({ type: 'lot.sealedBids', id: lot.id }, gm));
  log.push(...f.run({ type: 'lot.close', id: lot.id }, gm));
  expect(f.s.lots[lot.id].status).toBe('fixedPrice');
  expect(offer && req).toBeTruthy();
  expect(f.s.players[from].reservedGold).toBe(2);
  expect(f.s.items[shard.id].reservedFor).toBe(offer!.id);
  expect(f.s.players.o10.abilityPending).toBe(req!.id);
  return { f, log, offer: offer!, req: req!, lot, from, to, shard };
}

describe('session.close', () => {
  test('от игрока → forbidden, из act2 → phase, во время торга → invalid; отказ без событий', () => {
    const { f } = prepared();
    expect(refusal(f.s, { type: 'session.close' }, player('o1'))).toBe('forbidden');
    const act2 = new Fair(makeGame(12));
    act2.run({ type: 'act.next' }, gm);
    expect(refusal(act2.s, { type: 'session.close' }, gm)).toBe('phase');
    expect(refusal(makeGame(12), { type: 'session.close' }, gm)).toBe('phase');
    // В составе 12 лоты первого акта ещё ждут торга.
    const g = act3(12, []);
    const announced = Object.values(g.s.lots).find(l => l.status === 'announced')!;
    g.run({ type: 'lot.openBidding', id: announced.id }, gm);
    const r = run(g.s, { type: 'session.close' }, gm);
    expect(r).toMatchObject({ ok: false, error: 'invalid' });
    if (!r.ok) expect(r.detail).toContain('идёт торг');
  });

  test('одно событие FairClosed: предложения, просьбы и лоты закрыты, резервы сняты, итоги посчитаны', () => {
    const { f, log, offer, req, lot, from } = prepared();
    const open = Object.values(f.s.lots).filter(l => ['queued', 'announced', 'fixedPrice'].includes(l.status)).map(l => l.id).sort();
    expect(open).toContain(lot.id);
    const sold = Object.values(f.s.lots).filter(l => l.status === 'sold').map(l => l.id);
    const goldBefore = f.s.players[from].gold;

    const events = f.run({ type: 'session.close' }, gm);
    log.push(...events);
    expect(events).toHaveLength(1);
    const e = events[0];
    if (e.type !== 'FairClosed') throw new Error(e.type);
    expect(e.closedOffers).toEqual([offer.id]);
    expect(e.closedRequests).toEqual([req.id]);
    expect([...e.closedLots].sort()).toEqual(open);

    const s = f.s;
    expect(s.phase).toBe('closed');
    expect(s.offers[offer.id]).toMatchObject({ status: 'cancelled', reason: 'closed' });
    expect(s.requests[req.id]).toMatchObject({ status: 'expired', reason: 'closed', closedAt: f.now });
    for (const p of Object.values(s.players)) {
      expect(p.reservedGold).toBe(0);
      expect(p.abilityPending).toBeUndefined();
    }
    expect(Object.values(s.items).some(i => i.reservedFor !== undefined)).toBe(false);
    for (const id of open) expect(s.lots[id].status).toBe('unsold');
    for (const id of sold) expect(s.lots[id].status).toBe('sold');
    // Вещи лота остаются у лота, золото автора предложения при нём.
    for (const id of s.lots[lot.id].items) expect(s.items[id].owner).toEqual({ type: 'lot', id: lot.id });
    expect(s.players[from].gold).toBe(goldBefore);
    // Журнал применений не тронут: просьба не исполнена.
    expect(s.actions.some(a => a.requestId === req.id)).toBe(false);

    expect(e.closing).toEqual(computeClosing(s, content, f.now));
    expect(s.closing).toEqual(e.closing);
    expect(Object.keys(s.closing!.players).sort()).toEqual(s.roster.slice().sort());
    checkInvariants(s);
    checkGold(log, s);
    expect(log.reduce((st: GameState, ev) => reduce(st, content, ev), newGame())).toEqual(s);
  });

  test('закрытие на паузе снимает паузу и добавляет её время в pausedTotal', () => {
    const f = act3(12, []);
    f.run({ type: 'clock.extend', minutes: 1 }, gm);
    const total = f.s.clock.pausedTotal;
    f.run({ type: 'clock.pause' }, gm);
    const pausedAt = f.s.clock.pausedAt!;
    f.run({ type: 'session.close' }, gm);
    expect(f.s.clock.pausedAt).toBeUndefined();
    expect(f.s.clock).not.toHaveProperty('pausedAt');
    expect(f.s.clock.pausedTotal).toBe(total + (f.now - pausedAt));
    checkInvariants(f.s);
  });

  test('в closed каждая игровая команда → phase; announce, rebind, bind и исправления работают', () => {
    const { f, offer, req, lot } = prepared();
    const contribution = f.contribute('o1', 'wake', { gold: 1 });
    const potion = f.craft('o2', 'cleanse');
    f.run({ type: 'session.close' }, gm);
    const s = f.s;
    const p = (k: string) => player(k);
    const blocked: [Command, Actor][] = [
      [{ type: 'offer.create', to: 'o1', give: bundle({ gold: 1 }), get: bundle() }, p('o2')],
      [{ type: 'offer.accept', id: offer.id }, p(offer.to)],
      [{ type: 'offer.decline', id: offer.id }, p(offer.to)],
      [{ type: 'offer.cancel', id: offer.id }, p(offer.from)],
      [{ type: 'offer.expire', id: offer.id }, system],
      [{ type: 'shop.buy', ingredient: 'ash' }, p('o2')],
      [{ type: 'shop.craft', recipeId: 'focus' }, p('o2')],
      [{ type: 'altar.contribute', side: 'wake', gold: 1 }, p('o2')],
      [{ type: 'altar.withdraw', contributionId: contribution }, p('o1')],
      [{ type: 'ability.use', use: { kind: 'protectSelf' } }, p('o4')],
      [{ type: 'item.use', itemId: potion, target: 'o9' }, p('o2')],
      [{ type: 'consent.accept', id: req.id }, p('o9')],
      [{ type: 'consent.decline', id: req.id }, p('o9')],
      [{ type: 'consent.cancel', id: req.id }, p('o10')],
      [{ type: 'consent.cancel', id: req.id }, gm],
      [{ type: 'consent.expire', id: req.id }, system],
      [{ type: 'lot.openBidding', id: lot.id }, gm],
      [{ type: 'lot.sealedBids', id: lot.id }, gm],
      [{ type: 'lot.bid', id: lot.id, amount: 1 }, p('o2')],
      [{ type: 'lot.close', id: lot.id }, gm],
      [{ type: 'lot.buyout', id: lot.id }, p('o2')],
      [{ type: 'player.chooseSide', side: 'wake' }, p('o13')],
      [{ type: 'act.next' }, gm],
      [{ type: 'clock.pause' }, gm],
      [{ type: 'clock.resume' }, gm],
      [{ type: 'clock.extend', minutes: 5 }, gm],
      [{ type: 'session.close' }, gm],
    ];
    for (const [cmd, actor] of blocked) expect([cmd.type, refusal(s, cmd, actor)]).toEqual([cmd.type, 'phase']);

    const announce = run(s, { type: 'gm.announce', text: 'Ярмарка закрыта' }, gm, 1);
    if (!announce.ok) throw new Error(announce.error);
    expect(announce.state.announcements.at(-1)).toMatchObject({ title: 'Ведущий', text: 'Ярмарка закрыта' });
    expect(run(s, { type: 'gm.rebind', roleKey: 'o1' }, gm).ok).toBe(true);
    expect(run(s, { type: 'player.bind', code: s.invites.o1, telegramId: s.players.o1.telegramId! }, system).ok).toBe(true);
    expect(run(s, { type: 'gm.correct', playerKey: 'o1', change: { field: 'gold', delta: 1 }, reason: 'x' }, gm).ok).toBe(true);
  });
});

describe('session.reveal и сброс', () => {
  test('от игрока → forbidden, из act3 → phase; из closed → Revealed; повторно → phase; reset → setup без итогов', () => {
    const f = act3(12, []);
    expect(refusal(f.s, { type: 'session.reveal' }, gm)).toBe('phase');
    f.run({ type: 'session.close' }, gm);
    expect(refusal(f.s, { type: 'session.reveal' }, player('o1'))).toBe('forbidden');
    const events = f.run({ type: 'session.reveal' }, gm);
    expect(events).toEqual([{ type: 'Revealed', at: f.now }]);
    expect(f.s.phase).toBe('revealed');
    expect(f.s.closing).toBeDefined();
    checkInvariants(f.s);
    expect(refusal(f.s, { type: 'session.reveal' }, gm)).toBe('phase');
    expect(refusal(f.s, { type: 'session.close' }, gm)).toBe('phase');

    f.run({ type: 'session.reset' }, gm);
    expect(f.s.phase).toBe('setup');
    expect(f.s).not.toHaveProperty('closing');
    checkInvariants(f.s);
  });
});
