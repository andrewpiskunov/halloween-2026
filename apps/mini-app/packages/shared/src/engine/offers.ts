import type { Actor } from '../commands';
import type { Bundle, GameState, Offer } from '../types';
import { INGREDIENTS, available, isTradable, transfer } from './bundles';
import { fail, ok, type CommandHandlers, type ErrorCode, type EventReducers, type Result } from './result';

const OFFER_TTL_MS = 300000;

const isActPhase = (s: GameState) => s.phase === 'act1' || s.phase === 'act2' || s.phase === 'act3';
const playerKey = (a: Actor) => (a.type === 'player' ? a.roleKey : undefined);

const isNonNegInt = (n: number) => Number.isInteger(n) && n >= 0;
const validShape = (b: Bundle) =>
  isNonNegInt(b.gold) && INGREDIENTS.every(k => isNonNegInt(b.ingredients[k])) && new Set(b.items).size === b.items.length;
/** Есть ли в наборе что-то материальное: золото, ингредиент или вещь. */
const hasGoods = (b: Bundle) => b.gold > 0 || INGREDIENTS.some(k => b.ingredients[k] > 0) || b.items.length > 0;
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

/** Адресат может отдать запрошенное прямо сейчас. */
const counterpartyHas = (state: GameState, o: Offer) => checkGive(state, o.to, o.get) === undefined;

function pendingOffer(state: GameState, id: string): Offer | Result {
  const o = state.offers[id];
  if (!o) return fail('not_found', id);
  if (o.status !== 'pending') return fail('invalid', 'предложение уже закрыто');
  return o;
}
const isResult = (x: Offer | Result): x is Result => 'ok' in x;

export const offerCommands: CommandHandlers = {
  'offer.create': (state, _content, cmd, ctx) => {
    const from = playerKey(ctx.actor);
    if (!from) return fail('forbidden');
    if (!isActPhase(state)) return fail('phase');
    if (!state.roster.includes(cmd.to) || !state.players[cmd.to]?.present) return fail('not_found', cmd.to);
    if (cmd.to === from) return fail('invalid', 'нельзя предлагать самому себе');
    if (!validShape(cmd.give) || !validShape(cmd.get)) return fail('invalid', 'некорректные количества');
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
    const o = pendingOffer(state, cmd.id);
    if (isResult(o)) return o;
    if (playerKey(ctx.actor) !== o.to) return fail('forbidden');
    if (!authorStillHas(state, o)) return ok({ type: 'OfferClosed', at: ctx.now, id: o.id, status: 'expired', reason: 'author' });
    if (!counterpartyHas(state, o)) return ok({ type: 'OfferClosed', at: ctx.now, id: o.id, status: 'expired', reason: 'counterparty' });
    return ok({
      type: 'OfferAccepted', at: ctx.now, id: o.id, from: o.from, to: o.to, give: o.give, get: o.get,
      service: o.service, exchanged: hasGoods(o.give) || hasGoods(o.get),
    });
  },

  'offer.decline': (state, _content, cmd, ctx) => {
    const o = pendingOffer(state, cmd.id);
    if (isResult(o)) return o;
    if (playerKey(ctx.actor) !== o.to) return fail('forbidden');
    return ok({ type: 'OfferClosed', at: ctx.now, id: o.id, status: 'declined' });
  },

  'offer.cancel': (state, _content, cmd, ctx) => {
    const o = pendingOffer(state, cmd.id);
    if (isResult(o)) return o;
    if (playerKey(ctx.actor) !== o.from) return fail('forbidden');
    return ok({ type: 'OfferClosed', at: ctx.now, id: o.id, status: 'cancelled' });
  },

  'offer.expire': (state, _content, cmd, ctx) => {
    if (ctx.actor.type !== 'system') return fail('forbidden');
    const o = pendingOffer(state, cmd.id);
    if (isResult(o)) return o;
    if (ctx.now < o.expiresAt) return fail('invalid', 'срок ещё не истёк');
    return ok({ type: 'OfferClosed', at: ctx.now, id: o.id, status: 'expired', reason: 'timeout' });
  },
};

/** Снимает резерв автора: золото и метки reservedFor на вещах этого предложения. */
function release(state: GameState, o: Offer): GameState {
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
    let s = release(state, o);
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
