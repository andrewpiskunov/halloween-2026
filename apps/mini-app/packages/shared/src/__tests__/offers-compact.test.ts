import { describe, expect, test } from 'vitest';
import { bundle, content, gm, makeGame, newGame, player, run } from './helpers';
import type { Actor, Command } from '../commands';
import type { Event } from '../events';
import type { GameState } from '../types';
import { CLOSED_OFFERS_KEPT, reduce } from '../engine';
import { offersFor } from '../views';

/** Ярмарка на 12 с журналом событий от newGame() и сквозными часами. */
class Log {
  events: Event[] = [];
  now = 1000;
  s: GameState;
  constructor() { this.s = makeGame(12, { log: this.events }); }
  run(cmd: Command, actor: Actor): Event[] {
    this.now += 1000;
    const r = run(this.s, cmd, actor, this.now);
    if (!r.ok) throw new Error(`${cmd.type}: ${r.error} ${r.detail ?? ''}`);
    this.s = r.state;
    this.events.push(...r.events);
    return r.events;
  }
  /** Предложение from → to на 1 золотой; возвращает id. */
  offer(from: string, to: string): string {
    const e = this.run({ type: 'offer.create', to, give: bundle({ gold: 1 }), get: bundle() }, player(from));
    const created = e.find(x => x.type === 'OfferCreated');
    if (created?.type !== 'OfferCreated') throw new Error('нет OfferCreated');
    return created.offer.id;
  }
  /** Предложение from → to, отклонённое адресатом. */
  declined(from: string, to: string): string {
    const id = this.offer(from, to);
    this.run({ type: 'offer.decline', id }, player(to));
    return id;
  }
}

const closedIds = (s: GameState) => Object.values(s.offers).filter(o => o.status !== 'pending').map(o => o.id);

/** 25 отклонённых o2 → o4 и одно ожидающее. */
function twentyFive() {
  const g = new Log();
  const closed = Array.from({ length: 25 }, () => g.declined('o2', 'o4'));
  const pending = g.offer('o2', 'o4');
  return { g, closed, pending };
}

describe('уплотнение закрытых предложений', () => {
  test('после 25 закрытых между A и B в состоянии 20 самых новых, ожидающие остаются', () => {
    const { g, closed, pending } = twentyFive();
    expect(CLOSED_OFFERS_KEPT).toBe(20);
    expect(closedIds(g.s)).toHaveLength(20);
    for (const id of closed.slice(0, 5)) expect(g.s.offers[id]).toBeUndefined();
    expect(closedIds(g.s).sort()).toEqual(closed.slice(5).sort());
    expect(g.s.offers[pending]?.status).toBe('pending');
  });

  test('двадцатка считается на участника', () => {
    const g = new Log();
    for (let i = 0; i < 20; i++) g.declined('o2', 'o4');
    const toC = g.declined('o2', 'o5');
    for (let i = 0; i < 20; i++) g.declined('o2', 'o4');
    // У o2 предложение к o5 уже вне двадцатки самых новых, у o5 оно единственное.
    const mineA = Object.values(g.s.offers).filter(o => o.from === 'o2' && o.status !== 'pending');
    expect(mineA.filter(o => o.to === 'o4')).toHaveLength(20);
    expect(g.s.offers[toC]?.status).toBe('declined');
    expect(closedIds(g.s)).toHaveLength(21);
  });

  test('ушедший: закрытые предложения тоже уплотняются', () => {
    const g = new Log();
    g.run({ type: 'gm.correct', playerKey: 'o2', change: { field: 'gold', delta: 20 }, reason: 'тест' }, gm);
    const ids = Array.from({ length: 21 }, () => g.offer('o2', 'o4'));
    const e = g.run({ type: 'player.setPresent', roleKey: 'o4', present: false }, gm);
    const closedEvents = e.filter(x => x.type === 'OfferClosed');
    expect(closedEvents).toHaveLength(21);
    for (const x of closedEvents) expect(x).toMatchObject({ status: 'cancelled', reason: 'left' });
    expect(closedIds(g.s)).toHaveLength(20);
    expect(g.s.offers[ids[0]]).toBeUndefined();
    expect(Object.values(g.s.offers).every(o => o.reason === 'left')).toBe(true);
    expect(g.s.players.o2.reservedGold).toBe(0);
  });

  test('replay после уплотнения', () => {
    const { g } = twentyFive();
    const toC = g.declined('o2', 'o5');
    g.run({ type: 'offer.cancel', id: g.offer('o4', 'o2') }, player('o4'));
    g.run({ type: 'offer.accept', id: g.offer('o2', 'o5') }, player('o5'));
    expect(g.s.offers[toC]).toBeDefined();
    const replayed = g.events.reduce((s, e) => reduce(s, content, e), newGame());
    expect(replayed).toEqual(g.s);
  });

  test('offersFor не меняется', () => {
    const { g, closed, pending } = twentyFive();
    // На полном словаре offersFor дал бы 20 самых новых закрытых и ожидающее в порядке состояния.
    const expected = [...closed.slice(5), pending];
    for (const k of ['o2', 'o4']) expect(offersFor(g.s, k).map(o => o.id), k).toEqual(expected);
    expect(offersFor(g.s, 'o1')).toEqual([]);
  });
});
