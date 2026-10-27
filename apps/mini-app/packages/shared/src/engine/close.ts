// Закрытие ярмарки и показ итогов (спецификация этапа 5, §2).
import type { FairClosed } from '../events';
import type { GameState, LotStatus } from '../types';
import { computeClosing } from './closing';
import { release as releaseRequest } from './consent';
import { biddingInProgress } from './lots';
import { release as releaseOffer } from './offers';
import { fail, ok, type CommandHandlers, type EventReducers } from './result';

/** Лоты, которые закрытие снимает с продажи: торга по ним нет, вещи остаются у лота. */
const UNSOLD_ON_CLOSE: LotStatus[] = ['queued', 'announced', 'fixedPrice'];

/**
 * Заморозка по событию FairClosed без итогов: перечисленные предложения и просьбы закрыты с причиной closed,
 * резервы сняты, лоты непроданы, пауза снята (её время ушло в pausedTotal), фаза closed.
 * Обработчик применяет её к черновику, чтобы посчитать итоги на уже замороженном состоянии; редьюсер — к состоянию.
 */
export function freeze(state: GameState, e: Pick<FairClosed, 'at' | 'closedOffers' | 'closedRequests' | 'closedLots'>): GameState {
  let s = state;
  for (const id of e.closedOffers) {
    const o = s.offers[id];
    s = releaseOffer(s, o);
    s = { ...s, offers: { ...s.offers, [id]: { ...o, status: 'cancelled', reason: 'closed' } } };
  }
  for (const id of e.closedRequests) {
    const r = s.requests[id];
    s = releaseRequest(s, r);
    s = { ...s, requests: { ...s.requests, [id]: { ...r, status: 'expired', reason: 'closed', closedAt: e.at } } };
  }
  const lots = { ...s.lots };
  for (const id of e.closedLots) lots[id] = { ...lots[id], status: 'unsold' };
  const { pausedAt, ...clock } = s.clock;
  const pausedTotal = clock.pausedTotal + (pausedAt === undefined ? 0 : e.at - pausedAt);
  return { ...s, lots, clock: { ...clock, pausedTotal }, phase: 'closed' };
}

export const closeCommands: CommandHandlers = {
  /** Ведущий закрывает ярмарку из третьего акта; на паузе можно, во время торга нельзя (§2.1). */
  'session.close': (state, content, _cmd, ctx) => {
    if (ctx.actor.type !== 'gm') return fail('forbidden');
    if (state.phase !== 'act3') return fail('phase');
    if (biddingInProgress(state)) return fail('invalid', 'идёт торг за лот: сначала закройте его');
    const closure = {
      at: ctx.now,
      closedOffers: Object.values(state.offers).filter(o => o.status === 'pending').map(o => o.id),
      closedRequests: Object.values(state.requests).filter(r => r.status === 'pending').map(r => r.id),
      closedLots: Object.values(state.lots).filter(l => UNSOLD_ON_CLOSE.includes(l.status)).map(l => l.id),
    };
    // Итоги считаются после снятия резервов: золото и вещи уже вернулись владельцам.
    const closing = computeClosing(freeze(state, closure), content, ctx.now);
    return ok({ type: 'FairClosed', ...closure, closing });
  },

  /** Показ итогов игрокам; необратим, откат только сбросом (§2.3). */
  'session.reveal': (state, _content, _cmd, ctx) => {
    if (ctx.actor.type !== 'gm') return fail('forbidden');
    if (state.phase !== 'closed') return fail('phase');
    return ok({ type: 'Revealed', at: ctx.now });
  },
};

export const closeReducers: EventReducers = {
  FairClosed: (state, _c, e) => ({ ...freeze(state, e), closing: e.closing }),
  Revealed: state => ({ ...state, phase: 'revealed' }),
};
