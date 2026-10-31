import { shardNumber } from '../shard-label';
import type { Content } from '../content';
import type { GameState, Item, Lot } from '../types';
import { available } from './bundles';
import { isActPhase, lookup, participant } from './guards';
import { fail, ok, type CommandHandlers, type EventReducers } from './result';

/** Открытый торг голосом: две минуты. Закрытые ставки: 90 секунд. Без ставок лот выкупается за 4. */
export const OPEN_BIDDING_MS = 120000;
export const SEALED_BIDS_MS = 90000;
export const BUYOUT_PRICE = 4;

const isGm = (s: GameState, a: { type: string }) => a.type === 'gm';
const roleName = (content: Content, key: string) => content.roles.find(r => r.key === key)?.name ?? key;

/** Название вещи для объявлений: «Осколок 4», «Улика „Обрывок договора“», имя реликвии, название изделия. */
export function itemTitle(content: Content, it: Pick<Item, 'kind' | 'ref'>): string {
  switch (it.kind) {
    case 'shard': return `Осколок ${shardNumber(it.ref)}`;
    case 'clue': return `улика «${content.clues.find(c => c.id === it.ref)?.name ?? it.ref}»`;
    case 'relic': return it.ref;
    default: return content.recipes.find(r => r.id === it.ref)?.name ?? it.ref;
  }
}
/** Название лота: вещи через « + ». */
export const lotTitle = (state: GameState, content: Content, lot: Lot) =>
  lot.items.map(id => state.items[id]).filter(Boolean).map(it => itemTitle(content, it)).join(' + ');

function activeLot(state: GameState, id: string): Lot | undefined {
  const l = lookup(state.lots, id);
  return l && l.status !== 'queued' ? l : undefined;
}
const inBidding = (l: Lot) => l.status === 'openBidding' || l.status === 'sealedBidding';
/** Торг идёт по какому-то лоту: смена акта ждёт его конца. */
export const biddingInProgress = (state: GameState) => Object.values(state.lots).some(inBidding);
/** Ставка игрока на лот, если есть. */
const bidOf = (l: Lot, player: string) => l.bids.find(b => b.player === player);

export const lotCommands: CommandHandlers = {
  'lot.openBidding': (state, content, cmd, ctx) => {
    if (!isGm(state, ctx.actor)) return fail('forbidden');
    if (!isActPhase(state)) return fail('phase');
    const l = activeLot(state, cmd.id);
    if (!l) return fail('not_found', cmd.id);
    if (l.status !== 'announced') return fail('invalid', 'лот не ждёт торга');
    if (biddingInProgress(state)) return fail('invalid', 'торг за другой лот ещё идёт');
    return ok({ type: 'LotBiddingOpened', at: ctx.now, id: l.id, until: ctx.now + OPEN_BIDDING_MS, title: lotTitle(state, content, l) });
  },

  'lot.sealedBids': (state, content, cmd, ctx) => {
    if (!isGm(state, ctx.actor)) return fail('forbidden');
    if (!isActPhase(state)) return fail('phase');
    const l = activeLot(state, cmd.id);
    if (!l) return fail('not_found', cmd.id);
    if (l.status !== 'announced' && l.status !== 'openBidding') return fail('invalid', 'лот не ждёт ставок');
    if (l.status === 'announced' && biddingInProgress(state)) return fail('invalid', 'торг за другой лот ещё идёт');
    return ok({ type: 'LotSealedOpened', at: ctx.now, id: l.id, until: ctx.now + SEALED_BIDS_MS, title: lotTitle(state, content, l) });
  },

  'lot.bid': (state, _content, cmd, ctx) => {
    const me = participant(state, ctx.actor);
    if (!me) return fail('forbidden');
    if (!isActPhase(state)) return fail('phase');
    const l = activeLot(state, cmd.id);
    if (!l) return fail('not_found', cmd.id);
    if (l.status !== 'sealedBidding') return fail('invalid', 'ставки сейчас не принимаются');
    if (state.clock.pausedAt === undefined && ctx.now >= (l.sealedUntil ?? 0)) return fail('phase', 'окно ставок закрыто');
    if (!Number.isInteger(cmd.amount) || cmd.amount < 1) return fail('invalid', 'ставка не меньше 1 золотого');
    const mine = bidOf(l, me)?.amount ?? 0;
    if (cmd.amount <= mine) return fail('invalid', 'ставку можно только поднять');
    // Своя прежняя ставка уже в резерве: доступное золото считается вместе с ней.
    if (cmd.amount > available(state, me).gold + mine) return fail('insufficient');
    return ok({ type: 'LotBid', at: ctx.now, id: l.id, player: me, amount: cmd.amount });
  },

  'lot.close': (state, content, cmd, ctx) => {
    if (ctx.actor.type === 'player') return fail('forbidden');
    if (!isActPhase(state)) return fail('phase');
    const l = activeLot(state, cmd.id);
    if (!l) return fail('not_found', cmd.id);
    if (l.status !== 'sealedBidding') return fail('invalid', 'закрытые ставки не идут');
    if (ctx.actor.type === 'system') {
      if (state.clock.pausedAt !== undefined) return fail('phase', 'часы на паузе');
      if (ctx.now < (l.sealedUntil ?? 0)) return fail('invalid', 'окно ставок ещё открыто');
    }
    const title = lotTitle(state, content, l);
    if (l.bids.length === 0) return ok({ type: 'LotClosed', at: ctx.now, id: l.id, title, fixedPrice: BUYOUT_PRICE });
    const top = Math.max(...l.bids.map(b => b.amount));
    const leaders = l.bids.filter(b => b.amount === top);
    // При равенстве жребий; порядок ставок в журнале фиксирован, так что проигрывание журнала даёт того же победителя.
    const winner = leaders[Math.min(leaders.length - 1, Math.floor(ctx.random() * leaders.length))];
    return ok({ type: 'LotClosed', at: ctx.now, id: l.id, title, winner: winner.player, amount: top });
  },

  'lot.buyout': (state, content, cmd, ctx) => {
    const me = participant(state, ctx.actor);
    if (!me) return fail('forbidden');
    if (!isActPhase(state)) return fail('phase');
    const l = activeLot(state, cmd.id);
    if (!l) return fail('not_found', cmd.id);
    if (l.status !== 'fixedPrice' || l.fixedPrice === undefined) return fail('invalid', 'лот не продаётся по цене');
    if (available(state, me).gold < l.fixedPrice) return fail('insufficient');
    return ok({ type: 'LotBought', at: ctx.now, id: l.id, title: lotTitle(state, content, l), player: me, price: l.fixedPrice });
  },
};

const announce = (state: GameState, at: number, text: string): GameState =>
  ({ ...state, announcements: [...state.announcements, { at, title: 'Торг за лот', text }] });

/** Снимает резерв всех ставок лота. */
function releaseBids(state: GameState, l: Lot): GameState {
  const players = { ...state.players };
  for (const b of l.bids) players[b.player] = { ...players[b.player], reservedGold: players[b.player].reservedGold - b.amount };
  return { ...state, players };
}
/** Передаёт вещи лота игроку и списывает плату в банк. */
function handOver(state: GameState, l: Lot, player: string, price: number): GameState {
  const items = { ...state.items };
  for (const id of l.items) items[id] = { ...items[id], owner: { type: 'player', key: player } };
  const p = state.players[player];
  return { ...state, items, players: { ...state.players, [player]: { ...p, gold: p.gold - price } } };
}

export const lotReducers: EventReducers = {
  LotBiddingOpened: (state, _c, e) => announce({
    ...state, lots: { ...state.lots, [e.id]: { ...state.lots[e.id], status: 'openBidding', openUntil: e.until } },
  }, e.at, `${e.title}: две минуты открытого торга голосом.`),
  LotSealedOpened: (state, _c, e) => announce({
    ...state, lots: { ...state.lots, [e.id]: { ...state.lots[e.id], status: 'sealedBidding', sealedUntil: e.until } },
  }, e.at, `${e.title}: полторы минуты на закрытые ставки, ставьте в приложении на экране «События».`),
  LotBid: (state, _c, e) => {
    const l = state.lots[e.id];
    const prev = bidOf(l, e.player)?.amount ?? 0;
    const bids = [...l.bids.filter(b => b.player !== e.player), { player: e.player, amount: e.amount, at: e.at }];
    const p = state.players[e.player];
    return {
      ...state,
      lots: { ...state.lots, [e.id]: { ...l, bids } },
      players: { ...state.players, [e.player]: { ...p, reservedGold: p.reservedGold + e.amount - prev } },
    };
  },
  LotClosed: (state, content, e) => {
    const l = state.lots[e.id];
    let s = releaseBids(state, l);
    if (e.winner === undefined || e.amount === undefined) {
      s = { ...s, lots: { ...s.lots, [e.id]: { ...l, status: 'fixedPrice', fixedPrice: e.fixedPrice ?? BUYOUT_PRICE } } };
      return announce(s, e.at, `${e.title}: ставок нет, лот можно выкупить за ${e.fixedPrice ?? BUYOUT_PRICE} золота, кто первый.`);
    }
    s = handOver(s, l, e.winner, e.amount);
    s = { ...s, lots: { ...s.lots, [e.id]: { ...l, status: 'sold', winner: e.winner, price: e.amount } } };
    return announce(s, e.at, `${e.title} уходит: ${roleName(content, e.winner)}, ${e.amount} золота.`);
  },
  LotBought: (state, content, e) => {
    const l = state.lots[e.id];
    let s = handOver(state, l, e.player, e.price);
    s = { ...s, lots: { ...s.lots, [e.id]: { ...l, status: 'sold', winner: e.player, price: e.price } } };
    return announce(s, e.at, `${e.title} выкуплен: ${roleName(content, e.player)}, ${e.price} золота.`);
  },
};

/** Сдвигает окна торга на время паузы. */
export function shiftLots(lots: GameState['lots'], pausedMs: number): GameState['lots'] {
  const res = { ...lots };
  for (const [id, l] of Object.entries(lots)) {
    if (l.status === 'openBidding' && l.openUntil !== undefined) res[id] = { ...l, openUntil: l.openUntil + pausedMs };
    if (l.status === 'sealedBidding' && l.sealedUntil !== undefined) res[id] = { ...l, sealedUntil: l.sealedUntil + pausedMs };
  }
  return res;
}
