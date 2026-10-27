import { describe, expect, test } from 'vitest';
import { content, gm, makeGame, newGame, player, run, system } from './helpers';
import type { Actor, Command } from '../commands';
import type { GameState } from '../types';
import { available } from '../engine/bundles';
import { BUYOUT_PRICE, OPEN_BIDDING_MS, SEALED_BIDS_MS } from '../engine/lots';

function must(s: GameState, cmd: Command, actor: Actor, now = 0) {
  const r = run(s, cmd, actor, now);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.error} ${r.detail ?? ''}`);
  return r;
}
const errorOf = (s: GameState, cmd: Command, actor: Actor, now = 0) => {
  const r = run(s, cmd, actor, now);
  return r.ok ? 'ok' : r.error;
};
/** Ярмарка на 12 без названных ролей: их осколки и реликвии уходят лотами первого акта. */
function gameWithout(absent: string[]): GameState {
  const r = run(newGame(), { type: 'session.setN', n: 12 }, gm);
  if (!r.ok) throw new Error(r.error);
  return makeGame(12, { present: r.state.roster.filter(k => !absent.includes(k)) });
}
/** Без o5 (Вельда): Осколок II уходит лотом. */
function withLot() {
  const s0 = gameWithout(['o5']);
  const lot = Object.values(s0.lots).find(l => l.status === 'announced')!;
  return { s0, lot };
}

describe('торг за лот', () => {
  test('открытый торг → закрытые ставки → победитель платит в банк и получает вещи; резервы сняты; объявления', () => {
    const { s0, lot } = withLot();
    const r1 = must(s0, { type: 'lot.openBidding', id: lot.id }, gm, 1000);
    expect(r1.state.lots[lot.id]).toMatchObject({ status: 'openBidding', openUntil: 1000 + OPEN_BIDDING_MS });
    const r2 = must(r1.state, { type: 'lot.sealedBids', id: lot.id }, gm, 2000);
    expect(r2.state.lots[lot.id]).toMatchObject({ status: 'sealedBidding', sealedUntil: 2000 + SEALED_BIDS_MS });

    const s3 = must(r2.state, { type: 'lot.bid', id: lot.id, amount: 3 }, player('o1'), 3000).state;
    expect(s3.players.o1.reservedGold).toBe(3);
    expect(available(s3, 'o1').gold).toBe(3);
    const s4 = must(s3, { type: 'lot.bid', id: lot.id, amount: 5 }, player('o6'), 3500).state;
    // Поднять свою: резерв растёт на разницу, ставка одна.
    const s5 = must(s4, { type: 'lot.bid', id: lot.id, amount: 4 }, player('o1'), 4000).state;
    expect(s5.players.o1.reservedGold).toBe(4);
    expect(s5.lots[lot.id].bids.filter(b => b.player === 'o1')).toHaveLength(1);

    const r6 = must(s5, { type: 'lot.close', id: lot.id }, gm, 5000);
    const s6 = r6.state;
    expect(r6.events[0]).toMatchObject({ type: 'LotClosed', winner: 'o6', amount: 5 });
    expect(s6.lots[lot.id]).toMatchObject({ status: 'sold', winner: 'o6', price: 5 });
    expect(s6.players.o6).toMatchObject({ gold: 1, reservedGold: 0 });
    expect(s6.players.o1).toMatchObject({ gold: 6, reservedGold: 0 });
    for (const id of lot.items) expect(s6.items[id].owner).toEqual({ type: 'player', key: 'o6' });
    expect(s6.announcements.map(a => a.text).join('\n')).toContain('Грета');
  });

  test('ставки: не ниже 1, только поднять, не больше доступного золота с учётом своей ставки, только в окне, только участник', () => {
    const { s0, lot } = withLot();
    const s1 = must(s0, { type: 'lot.sealedBids', id: lot.id }, gm, 0).state;
    expect(errorOf(s0, { type: 'lot.bid', id: lot.id, amount: 1 }, player('o1'))).toBe('invalid');
    expect(errorOf(s1, { type: 'lot.bid', id: lot.id, amount: 0 }, player('o1'))).toBe('invalid');
    expect(errorOf(s1, { type: 'lot.bid', id: lot.id, amount: 7 }, player('o1'))).toBe('insufficient');
    const s2 = must(s1, { type: 'lot.bid', id: lot.id, amount: 6 }, player('o1')).state;
    expect(errorOf(s2, { type: 'lot.bid', id: lot.id, amount: 6 }, player('o1'))).toBe('invalid');
    expect(errorOf(s1, { type: 'lot.bid', id: lot.id, amount: 1 }, player('o1'), SEALED_BIDS_MS)).toBe('phase');
    expect(errorOf(s1, { type: 'lot.bid', id: lot.id, amount: 1 }, player('o5'))).toBe('forbidden');
    expect(errorOf(s1, { type: 'lot.bid', id: lot.id, amount: 1 }, gm)).toBe('forbidden');
    // Зарезервированное под ставку золото нельзя предложить в сделке.
    const zero = { ash: 0, moon: 0, dew: 0 };
    expect(errorOf(s2, { type: 'offer.create', to: 'o6', give: { gold: 1, ingredients: zero, items: [] }, get: { gold: 0, ingredients: zero, items: [] } }, player('o1'))).toBe('reserved');
  });

  test('система закрывает торг только после окна и не на паузе; при равенстве ставок жребий; без ставок — выкуп за 4', () => {
    const { s0, lot } = withLot();
    const s1 = must(s0, { type: 'lot.sealedBids', id: lot.id }, gm, 0).state;
    expect(errorOf(s1, { type: 'lot.close', id: lot.id }, system, SEALED_BIDS_MS - 1)).toBe('invalid');
    expect(errorOf(s1, { type: 'lot.close', id: lot.id }, player('o1'), SEALED_BIDS_MS)).toBe('forbidden');
    const paused = must(s1, { type: 'clock.pause' }, gm, 10).state;
    expect(errorOf(paused, { type: 'lot.close', id: lot.id }, system, SEALED_BIDS_MS)).toBe('phase');
    // После паузы окно сдвинуто на её длину.
    const resumed = must(paused, { type: 'clock.resume' }, gm, 10 + 5000).state;
    expect(resumed.lots[lot.id].sealedUntil).toBe(SEALED_BIDS_MS + 5000);

    const s2 = must(s1, { type: 'lot.bid', id: lot.id, amount: 2 }, player('o1')).state;
    const s3 = must(s2, { type: 'lot.bid', id: lot.id, amount: 2 }, player('o6')).state;
    // random = 0.5 при двух лидерах выбирает второго по порядку ставок.
    const r = must(s3, { type: 'lot.close', id: lot.id }, system, SEALED_BIDS_MS);
    expect(r.events[0]).toMatchObject({ type: 'LotClosed', winner: 'o6', amount: 2 });

    const r0 = must(s1, { type: 'lot.close', id: lot.id }, system, SEALED_BIDS_MS);
    expect(r0.state.lots[lot.id]).toMatchObject({ status: 'fixedPrice', fixedPrice: BUYOUT_PRICE });
    expect(errorOf(r0.state, { type: 'lot.bid', id: lot.id, amount: 1 }, player('o1'))).toBe('invalid');
    const bought = must(r0.state, { type: 'lot.buyout', id: lot.id }, player('o1')).state;
    expect(bought.lots[lot.id]).toMatchObject({ status: 'sold', winner: 'o1', price: BUYOUT_PRICE });
    expect(bought.players.o1.gold).toBe(6 - BUYOUT_PRICE);
    expect(errorOf(bought, { type: 'lot.buyout', id: lot.id }, player('o6'))).toBe('invalid');
  });

  test('пока торг идёт, второй лот не открыть и акт не сменить; закрытые ставки можно открыть сразу, минуя открытый торг', () => {
    const s0 = gameWithout(['o5', 'o9']);
    const [a, b] = Object.values(s0.lots).filter(l => l.status === 'announced');
    const s1 = must(s0, { type: 'lot.sealedBids', id: a.id }, gm).state;
    expect(errorOf(s1, { type: 'lot.openBidding', id: b.id }, gm)).toBe('invalid');
    expect(errorOf(s1, { type: 'lot.sealedBids', id: b.id }, gm)).toBe('invalid');
    expect(errorOf(s1, { type: 'act.next' }, gm)).toBe('invalid');
    const s2 = must(s1, { type: 'lot.close', id: a.id }, gm).state;
    expect(errorOf(s2, { type: 'act.next' }, gm)).toBe('ok');
    expect(errorOf(s2, { type: 'lot.openBidding', id: b.id }, gm)).toBe('ok');
    expect(errorOf(s2, { type: 'lot.openBidding', id: a.id }, gm)).toBe('invalid');
    expect(errorOf(s2, { type: 'lot.openBidding', id: 'нет' }, gm)).toBe('not_found');
    expect(content.roles.length).toBe(30);
  });
});
