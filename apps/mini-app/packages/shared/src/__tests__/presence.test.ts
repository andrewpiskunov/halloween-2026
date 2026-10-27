import { describe, expect, test } from 'vitest';
import { allBut, bundle, checkGold, checkInvariants, content, Fair, gm, makeGame, newGame, player, run } from './helpers';
import type { Command } from '../commands';
import type { Event } from '../events';
import type { GameState } from '../types';
import { computeClosing } from '../engine';

const setPresent = (roleKey: string, present: boolean): Command => ({ type: 'player.setPresent', roleKey, present });

/** Ярмарка на 12 без o11; log собирает все события с начала сессии для checkGold. */
function lateGame(): { f: Fair; log: Event[] } {
  const log: Event[] = [];
  const f = new Fair(makeGame(12, { present: allBut(12, ['o11']), log }));
  return { f, log };
}
/** Команда через Fair с записью событий в журнал. */
function step(f: Fair, log: Event[], cmd: Command, key?: string): Event[] {
  const e = key === undefined ? f.run(cmd, gm) : f.as(key, cmd);
  log.push(...e);
  return e;
}
const errorOf = (s: GameState, cmd: Command, key: string) => {
  const r = run(s, cmd, key === 'gm' ? gm : player(key), 5000);
  return r.ok ? { error: 'ok' } : { error: r.error, detail: r.detail };
};

describe('присутствие после открытия', () => {
  test('опоздавший получает стартовый набор один раз', () => {
    const { f, log } = lateGame();
    expect(f.s.players.o11.startIssuedAt).toBeUndefined();
    const e = step(f, log, setPresent('o11', true));
    expect(e).toEqual([{ type: 'PlayerArrived', at: f.now, roleKey: 'o11', startSet: true }]);
    const p = f.s.players.o11;
    expect(p.present).toBe(true);
    expect(p.gold).toBe(6);
    expect(p.ingredients).toEqual(content.roleByKey.o11.bundle);
    expect(p.startIssuedAt).toBe(f.now);
    checkGold(log, f.s);
    checkInvariants(f.s);

    const issuedAt = p.startIssuedAt;
    step(f, log, setPresent('o11', false));
    const again = step(f, log, setPresent('o11', true));
    expect(again).toEqual([{ type: 'PlayerArrived', at: f.now, roleKey: 'o11', startSet: false }]);
    expect(f.s.players.o11.gold).toBe(6);
    expect(f.s.players.o11.ingredients).toEqual(p.ingredients);
    expect(f.s.players.o11.startIssuedAt).toBe(issuedAt);
    checkGold(log, f.s);
    checkInvariants(f.s);
  });

  test('ушедший: сделки закрыты, резервы сняты', () => {
    const { f, log } = lateGame();
    const created = step(f, log, { type: 'offer.create', to: 'o8', give: bundle({ gold: 2 }), get: bundle(), service: true }, 'o6');
    const offerId = (created[0] as Extract<Event, { type: 'OfferCreated' }>).offer.id;
    expect(f.s.players.o6.reservedGold).toBe(2);
    const asked = step(f, log, { type: 'ability.use', use: { kind: 'cleanseOther', target: 'o8' } }, 'o10');
    const reqId = (asked[0] as Extract<Event, { type: 'ConsentRequested' }>).request.id;

    const e = step(f, log, setPresent('o8', false));
    expect(e).toEqual([
      { type: 'PlayerLeft', at: f.now, roleKey: 'o8' },
      { type: 'OfferClosed', at: f.now, id: offerId, status: 'cancelled', reason: 'left' },
      { type: 'ConsentClosed', at: f.now, id: reqId, status: 'cancelled', reason: 'left' },
    ]);
    expect(f.s.players.o8.present).toBe(false);
    expect(f.s.players.o6.reservedGold).toBe(0);
    expect(f.s.offers[offerId]).toMatchObject({ status: 'cancelled', reason: 'left' });
    expect(f.s.requests[reqId]).toMatchObject({ status: 'cancelled', reason: 'left' });
    expect(f.s.players.o10.abilityPending).toBeUndefined();
    // Вещи и золото остаются у ушедшего.
    expect(f.s.players.o8.gold).toBe(6);
    checkGold(log, f.s);
    checkInvariants(f.s);
  });

  test('ушедший автор: его предложение и просьба тоже закрыты', () => {
    const { f, log } = lateGame();
    step(f, log, { type: 'offer.create', to: 'o6', give: bundle({ gold: 3 }), get: bundle(), service: true }, 'o8');
    step(f, log, { type: 'ability.use', use: { kind: 'cleanseOther', target: 'o9' } }, 'o10');
    const e = step(f, log, setPresent('o10', false));
    expect(e.map(x => x.type)).toEqual(['PlayerLeft', 'ConsentClosed']);
    const e2 = step(f, log, setPresent('o8', false));
    expect(e2.map(x => x.type)).toEqual(['PlayerLeft', 'OfferClosed']);
    expect(f.s.players.o8.reservedGold).toBe(0);
    checkGold(log, f.s);
    checkInvariants(f.s);
  });

  test('команды ушедшего отклоняются', () => {
    const { f } = lateGame();
    f.run(setPresent('o8', false), gm);
    const buy: Command = { type: 'shop.buy', ingredient: 'ash', count: 1 };
    expect(errorOf(f.s, buy, 'o8')).toEqual({ error: 'phase', detail: 'ведущий отметил, что вы ушли' });
    // Другие модули: алтарь и предложение.
    expect(errorOf(f.s, { type: 'altar.contribute', side: 'wake', gold: 1 }, 'o8')).toEqual({ error: 'phase', detail: 'ведущий отметил, что вы ушли' });
    expect(errorOf(f.s, { type: 'offer.create', to: 'o6', give: bundle({ gold: 1 }), get: bundle() }, 'o8'))
      .toEqual({ error: 'phase', detail: 'ведущий отметил, что вы ушли' });
    // Не пришедший к открытию до прихода получает свой текст.
    expect(errorOf(f.s, buy, 'o11')).toEqual({ error: 'phase', detail: 'ведущий ещё не отметил ваш приход' });
    f.run(setPresent('o8', true), gm);
    expect(errorOf(f.s, buy, 'o8').error).toBe('ok');
  });

  test('повтор того же значения: ok без событий', () => {
    const { f } = lateGame();
    const r1 = run(f.s, setPresent('o6', true), gm, 5000);
    expect(r1.ok && r1.events).toEqual([]);
    const r2 = run(f.s, setPresent('o11', false), gm, 5000);
    expect(r2.ok && r2.events).toEqual([]);
  });

  test('в closed отказ phase; ведущий только', () => {
    const { f } = lateGame();
    expect(errorOf(f.s, setPresent('o11', true), 'o6').error).toBe('forbidden');
    f.nextAct();
    f.nextAct();
    f.run({ type: 'session.close' }, gm);
    expect(errorOf(f.s, setPresent('o11', true), 'gm').error).toBe('phase');
    expect(errorOf(f.s, setPresent('o6', false), 'gm').error).toBe('phase');
  });

  test('роль вне состава: not_found', () => {
    const { f } = lateGame();
    expect(errorOf(f.s, setPresent('o30', true), 'gm').error).toBe('not_found');
  });

  test('итоги без ушедшего', () => {
    const { f } = lateGame();
    f.nextAct();
    f.nextAct();
    f.run(setPresent('o8', false), gm);
    f.run(setPresent('o6', false), gm);
    f.run(setPresent('o6', true), gm);
    const players = Object.keys(computeClosing(f.s, content, f.now).players);
    expect(players).not.toContain('o8');
    expect(players).not.toContain('o11');
    expect(players).toContain('o6');
    f.run({ type: 'session.close' }, gm);
    expect(Object.keys(f.s.closing!.players)).not.toContain('o8');
    checkInvariants(f.s);
  });

  test('при открытии startIssuedAt у присутствующих', () => {
    const s = makeGame(12, { present: allBut(12, ['o11']) });
    const opened = s.clock.actStartedAt;
    for (const k of s.roster) {
      if (k === 'o11') expect(s.players[k].startIssuedAt).toBeUndefined();
      else expect(s.players[k].startIssuedAt).toBe(opened);
    }
  });

  test('в setup поведение прежнее: PresenceSet', () => {
    const setN = run(newGame(), { type: 'session.setN', n: 12 }, gm);
    if (!setN.ok) throw new Error(setN.error);
    const first = run(setN.state, setPresent('o6', true), gm);
    if (!first.ok) throw new Error(first.error);
    expect(first.events.map(e => e.type)).toEqual(['PresenceSet']);
    // Повтор в setup по-прежнему даёт событие.
    const again = run(first.state, setPresent('o6', true), gm);
    expect(again.ok && again.events.map(e => e.type)).toEqual(['PresenceSet']);
  });

  test('защита у ушедшего остаётся, инварианты держатся', () => {
    const { f } = lateGame();
    f.as('o9', { type: 'ability.use', use: { kind: 'protectOther', target: 'o8' } });
    const protection = f.s.players.o8.protection;
    expect(protection).toBeDefined();
    f.run(setPresent('o8', false), gm);
    expect(f.s.players.o8.protection).toEqual(protection);
    checkInvariants(f.s);
    f.run(setPresent('o8', true), gm);
    expect(f.s.players.o8.protection).toEqual(protection);
    checkInvariants(f.s);
  });

  test('вещь в предложении ушедшего освобождается', () => {
    const { f } = lateGame();
    const shard = f.find('shard', 'I');
    expect(shard.owner).toEqual({ type: 'player', key: 'o1' });
    const created = f.as('o1', { type: 'offer.create', to: 'o8', give: bundle({ items: [shard.id] }), get: bundle({ gold: 1 }) });
    const offerId = (created[0] as Extract<Event, { type: 'OfferCreated' }>).offer.id;
    expect(f.s.items[shard.id].reservedFor).toBe(offerId);
    const e = f.run(setPresent('o1', false), gm);
    expect(e).toContainEqual({ type: 'OfferClosed', at: f.now, id: offerId, status: 'cancelled', reason: 'left' });
    expect(f.s.items[shard.id].reservedFor).toBeUndefined();
    expect(f.s.items[shard.id].owner).toEqual({ type: 'player', key: 'o1' });
    checkInvariants(f.s);
  });

  test('просьба с вещью закрывается, резерв вещи снят', () => {
    const { f } = lateGame();
    const potion = f.craft('o6', 'cleanse');
    const asked = f.as('o6', { type: 'item.use', itemId: potion, target: 'o8' });
    const req = (asked[0] as Extract<Event, { type: 'ConsentRequested' }>).request;
    expect(req.action.type).toBe('item');
    expect(f.s.items[potion].reservedFor).toBe(req.id);
    const e = f.run(setPresent('o8', false), gm);
    expect(e).toEqual([
      { type: 'PlayerLeft', at: f.now, roleKey: 'o8' },
      { type: 'ConsentClosed', at: f.now, id: req.id, status: 'cancelled', reason: 'left' },
    ]);
    expect(f.s.requests[req.id].status).toBe('cancelled');
    expect(f.s.items[potion].reservedFor).toBeUndefined();
    expect(f.s.items[potion].owner).toEqual({ type: 'player', key: 'o6' });
    checkInvariants(f.s);
  });
});
