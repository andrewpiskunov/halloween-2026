import type { OfferClosed } from '../events';
import type { Bundle, GameState, Item, Offer, TradeRecord, TradeSide, Want } from '../types';
import { INGREDIENTS, available, isTradable, transfer } from './bundles';
import { isActPhase, participant } from './guards';
import { fail, ok, type CommandHandlers, type ErrorCode, type EventReducers, type Result } from './result';

const OFFER_TTL_MS = 300000;

const isNonNegInt = (n: number) => Number.isInteger(n) && n >= 0;
const ITEM_KINDS: Item['kind'][] = ['relic', 'shard', 'clue', 'potion', 'ward', 'focus', 'shape'];
const MAX_WANTS = 10;
const wantKey = (w: Want) => `${w.kind}:${w.ref}`;
const validWants = (ws: Want[] | undefined) => ws === undefined || (
  Array.isArray(ws) && ws.length <= MAX_WANTS && new Set(ws.map(wantKey)).size === ws.length &&
  ws.every(w => ITEM_KINDS.includes(w.kind) && typeof w.ref === 'string' && w.ref.length > 0 && w.ref.length <= 64));
const validShape = (b: Bundle) =>
  isNonNegInt(b.gold) && INGREDIENTS.every(k => isNonNegInt(b.ingredients[k])) && new Set(b.items).size === b.items.length && validWants(b.wants);
/** Есть ли в наборе что-то материальное: золото, ингредиент, вещь или просьба о вещи. */
const hasGoods = (b: Bundle) => b.gold > 0 || INGREDIENTS.some(k => b.ingredients[k] > 0) || b.items.length > 0 || (b.wants?.length ?? 0) > 0;

/**
 * Подбирает у владельца по одной свободной вещи на каждую просьбу по названию;
 * undefined, если какой-то вещи нет. Уже выбранные id и вещи из b.items не берутся повторно.
 */
function resolveWants(state: GameState, owner: string, b: Bundle): string[] | undefined {
  const taken = new Set(b.items);
  const ids: string[] = [];
  for (const w of b.wants ?? []) {
    const it = Object.values(state.items).find(i =>
      i.kind === w.kind && i.ref === w.ref && i.owner.type === 'player' && i.owner.key === owner &&
      i.reservedFor === undefined && !taken.has(i.id) && isTradable(state, i.id, state.phase));
    if (!it) return undefined;
    taken.add(it.id);
    ids.push(it.id);
  }
  return ids;
}
const hasRumor = (b: Bundle) => (b.rumor?.trim() ?? '') !== '';

/** Проверка, что автор может отдать набор: код ошибки или undefined. */
function checkGive(state: GameState, from: string, b: Bundle): ErrorCode | undefined {
  for (const id of b.items) {
    const it = state.items[id];
    if (!it) return 'not_owner';
    if (it.owner.type === 'player' && it.owner.key !== from) return 'not_owner';
    if (!isTradable(state, id, state.phase)) return 'invalid';
    if (it.reservedFor !== undefined) return 'reserved';
  }
  const a = available(state, from);
  if (b.gold > a.gold) return 'reserved';
  if (INGREDIENTS.some(k => b.ingredients[k] > a.ingredients[k])) return 'reserved';
  return undefined;
}

/** Автор всё ещё владеет зарезервированным под предложение набором. */
function authorStillHas(state: GameState, o: Offer): boolean {
  const p = state.players[o.from];
  if (!p || p.gold < o.give.gold) return false;
  if (INGREDIENTS.some(k => p.ingredients[k] < o.give.ingredients[k])) return false;
  return o.give.items.every(id => {
    const it = state.items[id];
    return it?.reservedFor === o.id && it.owner.type === 'player' && it.owner.key === o.from && isTradable(state, id, state.phase);
  });
}

/** Адресат может отдать запрошенное прямо сейчас: конкретные вещи и вещи по названию. */
const counterpartyHas = (state: GameState, o: Offer) =>
  checkGive(state, o.to, o.get) === undefined && resolveWants(state, o.to, o.get) !== undefined;

function pendingOffer(state: GameState, id: string): Offer | Result {
  const o = state.offers[id];
  if (!o) return fail('not_found', id);
  if (o.status !== 'pending') return fail('invalid', 'предложение уже закрыто');
  return o;
}
const isResult = (x: Offer | Result): x is Result => 'ok' in x;
/** Срок истёк по часам ярмарки: текущая пауза в счёт не идёт (её сдвиг применится при resume). */
const isOverdue = (state: GameState, o: Offer, now: number) => (state.clock.pausedAt ?? now) >= o.expiresAt;

export const offerCommands: CommandHandlers = {
  'offer.create': (state, _content, cmd, ctx) => {
    const from = participant(state, ctx.actor);
    if (!from) return fail('forbidden');
    if (!isActPhase(state)) return fail('phase');
    if (state.clock.pausedAt !== undefined) return fail('phase', 'часы на паузе');
    if (!state.roster.includes(cmd.to) || !state.players[cmd.to]?.present) return fail('not_found', cmd.to);
    if (cmd.to === from) return fail('invalid', 'нельзя предлагать самому себе');
    if (!validShape(cmd.give) || !validShape(cmd.get)) return fail('invalid', 'некорректные количества');
    if ((cmd.give.wants?.length ?? 0) > 0) return fail('invalid', 'отдавать можно только конкретные вещи');
    if (![cmd.give, cmd.get].some(b => hasGoods(b) || hasRumor(b))) return fail('invalid', 'пустое предложение');
    const err = checkGive(state, from, cmd.give);
    if (err) return fail(err);
    const offer: Offer = {
      id: ctx.newId(), from, to: cmd.to, give: cmd.give, get: cmd.get, service: cmd.service ?? false,
      status: 'pending', createdAt: ctx.now, expiresAt: ctx.now + OFFER_TTL_MS,
    };
    return ok({ type: 'OfferCreated', at: ctx.now, offer });
  },

  'offer.accept': (state, _content, cmd, ctx) => {
    if (!isActPhase(state)) return fail('phase');
    const o = pendingOffer(state, cmd.id);
    if (isResult(o)) return o;
    if (participant(state, ctx.actor) !== o.to) return fail('forbidden');
    // На паузе новые сделки не заключаются; отклонить и отозвать можно (спек этапа 7, §7).
    if (state.clock.pausedAt !== undefined) return fail('phase', 'часы на паузе');
    if (isOverdue(state, o, ctx.now)) return fail('phase', 'срок ответа истёк');
    if (!authorStillHas(state, o)) return ok({ type: 'OfferClosed', at: ctx.now, id: o.id, status: 'expired', reason: 'author' });
    if (!counterpartyHas(state, o)) return ok({ type: 'OfferClosed', at: ctx.now, id: o.id, status: 'expired', reason: 'counterparty' });
    // Просьбы по названию превращаются в конкретные вещи адресата; в событии остаются и сами просьбы для журнала.
    const resolved = resolveWants(state, o.to, o.get) ?? [];
    const get: Bundle = resolved.length ? { ...o.get, items: [...o.get.items, ...resolved] } : o.get;
    return ok({
      type: 'OfferAccepted', at: ctx.now, id: o.id, from: o.from, to: o.to, give: o.give, get,
      service: o.service, exchanged: hasGoods(o.give) || hasGoods(o.get),
    });
  },

  'offer.decline': (state, _content, cmd, ctx) => {
    if (!isActPhase(state)) return fail('phase');
    const o = pendingOffer(state, cmd.id);
    if (isResult(o)) return o;
    if (participant(state, ctx.actor) !== o.to) return fail('forbidden');
    return ok({ type: 'OfferClosed', at: ctx.now, id: o.id, status: 'declined' });
  },

  'offer.cancel': (state, _content, cmd, ctx) => {
    if (!isActPhase(state)) return fail('phase');
    const o = pendingOffer(state, cmd.id);
    if (isResult(o)) return o;
    if (participant(state, ctx.actor) !== o.from) return fail('forbidden');
    return ok({ type: 'OfferClosed', at: ctx.now, id: o.id, status: 'cancelled' });
  },

  'offer.expire': (state, _content, cmd, ctx) => {
    if (ctx.actor.type !== 'system') return fail('forbidden');
    if (!isActPhase(state)) return fail('phase');
    // На паузе сроки стоят (спек §10).
    if (state.clock.pausedAt !== undefined) return fail('phase', 'часы на паузе');
    const o = pendingOffer(state, cmd.id);
    if (isResult(o)) return o;
    if (ctx.now < o.expiresAt) return fail('invalid', 'срок ещё не истёк');
    return ok({ type: 'OfferClosed', at: ctx.now, id: o.id, status: 'expired', reason: 'timeout' });
  },
};

/** Отмена ожидающих предложений, где игрок автор или адресат: резервы снимет редьюсер OfferClosed. */
export function cancelOffersOf(state: GameState, key: string, at: number): OfferClosed[] {
  return Object.values(state.offers)
    .filter(o => o.status === 'pending' && (o.from === key || o.to === key))
    .map(o => ({ type: 'OfferClosed', at, id: o.id, status: 'cancelled', reason: 'left' }));
}

/** Снимает резерв автора: золото и метки reservedFor на вещах этого предложения. */
export function release(state: GameState, o: Offer): GameState {
  const p = state.players[o.from];
  const items = { ...state.items };
  for (const id of o.give.items) {
    const it = items[id];
    if (it?.reservedFor === o.id) {
      const { reservedFor: _r, ...rest } = it;
      items[id] = rest;
    }
  }
  return { ...state, items, players: { ...state.players, [o.from]: { ...p, reservedGold: p.reservedGold - o.give.gold } } };
}

/** Сторона сделки для журнала: вещи читаются до перемещения, чтобы сохранить createdBy. */
function tradeSide(state: GameState, b: Bundle): TradeSide {
  return {
    gold: b.gold,
    ingredients: { ...b.ingredients },
    items: b.items.map(id => {
      const it = state.items[id];
      return { kind: it.kind, ref: it.ref, ...(it.createdBy !== undefined ? { createdBy: it.createdBy } : {}) };
    }),
  };
}

export const offerReducers: EventReducers = {
  OfferCreated: (state, _c, e) => {
    const o = e.offer;
    const p = state.players[o.from];
    const items = { ...state.items };
    for (const id of o.give.items) items[id] = { ...items[id], reservedFor: o.id };
    return {
      ...state, items,
      offers: { ...state.offers, [o.id]: o },
      players: { ...state.players, [o.from]: { ...p, reservedGold: p.reservedGold + o.give.gold } },
    };
  },
  OfferAccepted: (state, _c, e) => {
    const o = state.offers[e.id];
    const trade: TradeRecord = {
      id: e.id, at: e.at, from: e.from, to: e.to, service: e.service,
      give: tradeSide(state, e.give), get: tradeSide(state, e.get),
    };
    let s: GameState = { ...release(state, o), trades: [...state.trades, trade] };
    s = transfer(s, e.from, e.to, e.give);
    s = transfer(s, e.to, e.from, e.get);
    return { ...s, offers: { ...s.offers, [e.id]: { ...o, status: 'accepted' } } };
  },
  OfferClosed: (state, _c, e) => {
    const o = state.offers[e.id];
    const s = release(state, o);
    const closed: Offer = { ...o, status: e.status, ...(e.reason !== undefined ? { reason: e.reason } : {}) };
    return { ...s, offers: { ...s.offers, [e.id]: closed } };
  },
};
