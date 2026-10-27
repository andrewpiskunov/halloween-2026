import { describe, expect, test } from 'vitest';
import { bundle, gm, makeGame, player, run, system } from './helpers';
import type { Actor, Command } from '../commands';
import { lookup } from '../engine/guards';
import type { GameState } from '../types';

/** Ключи, которые есть у любого объекта через прототип. */
const PROTO_KEYS = ['constructor', 'toString', 'hasOwnProperty', '__proto__'];

/** Команда отклонена с not_found и без исключения. */
function notFound(s: GameState, cmd: Command, actor: Actor) {
  let r: ReturnType<typeof run> | undefined;
  expect(() => { r = run(s, cmd, actor); }).not.toThrow();
  expect(r!.ok ? 'ok' : r!.error).toBe('not_found');
}

describe('lookup', () => {
  test('возвращает только собственные ключи; не строка → undefined', () => {
    const rec: Record<string, number> = { a: 1 };
    expect(lookup(rec, 'a')).toBe(1);
    for (const k of PROTO_KEYS) expect(lookup(rec, k)).toBeUndefined();
    expect(lookup(rec, undefined)).toBeUndefined();
    expect(lookup(rec, 1)).toBeUndefined();
    expect(lookup(rec, null)).toBeUndefined();
  });
});

describe('ключ из прототипа в команде → not_found', () => {
  const s = makeGame(30);
  for (const k of PROTO_KEYS) {
    test(`ключ ${k}`, () => {
      notFound(s, { type: 'altar.withdraw', contributionId: k }, player('o1'));
      notFound(s, { type: 'altar.contribute', side: k as 'wake', gold: 1 }, player('o1'));
      notFound(s, { type: 'altar.contribute', side: 'wake', itemId: k }, player('o1'));
      notFound(s, { type: 'offer.accept', id: k }, player('o1'));
      notFound(s, { type: 'offer.decline', id: k }, player('o1'));
      notFound(s, { type: 'offer.cancel', id: k }, player('o1'));
      notFound(s, { type: 'offer.expire', id: k }, system);
      notFound(s, { type: 'offer.create', to: k, give: bundle({ gold: 1 }), get: bundle() }, player('o1'));
      notFound(s, { type: 'consent.accept', id: k }, player('o1'));
      notFound(s, { type: 'consent.decline', id: k }, player('o1'));
      notFound(s, { type: 'consent.cancel', id: k }, gm);
      notFound(s, { type: 'consent.expire', id: k }, system);
      notFound(s, { type: 'lot.bid', id: k, amount: 1 }, player('o1'));
      notFound(s, { type: 'lot.openBidding', id: k }, gm);
      notFound(s, { type: 'lot.sealedBids', id: k }, gm);
      notFound(s, { type: 'lot.close', id: k }, gm);
      notFound(s, { type: 'lot.buyout', id: k }, player('o1'));
      notFound(s, { type: 'item.use', itemId: k }, player('o1'));
      notFound(s, { type: 'gm.correct', playerKey: k, change: { field: 'gold', delta: 1 }, reason: 'тест' }, gm);
      notFound(s, { type: 'gm.correct', playerKey: 'o1', change: { field: 'itemOwner', itemId: k, owner: { type: 'player', key: 'o1' } }, reason: 'тест' }, gm);
      notFound(s, { type: 'gm.rebind', roleKey: k }, gm);
      notFound(s, { type: 'ability.use', use: { kind: 'disassemble', itemId: k, take: ['ash', 'ash'] } }, player('o13'));
      notFound(s, { type: 'ability.use', use: { kind: 'sellToBank', itemId: k } }, player('t1'));
      notFound(s, { type: 'ability.use', use: { kind: 'payAshWithGold', recipeId: k } }, player('o1'));
    });
  }

  test('setup: роль из прототипа → not_found', () => {
    const r = run(makeGame(30), { type: 'session.reset' }, gm);
    if (!r.ok) throw new Error(r.error);
    const setup = run(r.state, { type: 'session.setN', n: 30 }, gm);
    if (!setup.ok) throw new Error(setup.error);
    for (const k of PROTO_KEYS) {
      notFound(setup.state, { type: 'session.toggleRole', roleKey: k }, gm);
      notFound(setup.state, { type: 'player.setPresent', roleKey: k, present: true }, gm);
    }
  });

  test('тип команды из прототипа → invalid без исключения', () => {
    const s = makeGame(30);
    for (const k of PROTO_KEYS) {
      let r: ReturnType<typeof run> | undefined;
      expect(() => { r = run(s, { type: k } as unknown as Command, gm); }).not.toThrow();
      expect(r!.ok ? 'ok' : r!.error).toBe('invalid');
    }
  });

  test('вещь из прототипа в наборе предложения не роняет движок', () => {
    const s = makeGame(30);
    for (const k of PROTO_KEYS) {
      let r: ReturnType<typeof run> | undefined;
      expect(() => { r = run(s, { type: 'offer.create', to: 'o2', give: bundle({ items: [k] }), get: bundle() }, player('o1')); }).not.toThrow();
      expect(r!.ok).toBe(false);
      expect(r!.ok ? 'ok' : r!.error).not.toBe('internal');
    }
  });
});
