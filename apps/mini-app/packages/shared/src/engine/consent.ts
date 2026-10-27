import { COPY_SOURCES } from '../abilities';
import type { AbilityUse, Ctx } from '../commands';
import type { Content } from '../content';
import type { ConsentClosed } from '../events';
import type { ConsentAction, ConsentRequest, GameState } from '../types';
import { performAbility } from './abilities';
import { isConsentedKind, kindApprovers } from './consented-kinds';
import { isActPhase, participant, presentPlayer } from './guards';
import { performItemConsented } from './items';
import { fail, ok, type CommandHandlers, type EventReducers, type Result } from './result';

/** Срок ответа на запрос, как у предложений (§4.2). */
export const CONSENT_TTL_MS = 300000;

/**
 * Кто должен одобрить применение способности (§4.1); пусто, если согласие не нужно.
 * Копия Астры: владелец оригинала, если он на ярмарке, плюс одобряющие копируемого вида.
 */
export function needsConsent(state: GameState, author: string, use: AbilityUse): string[] {
  if (isConsentedKind(use)) return kindApprovers(author, use);
  if (use.kind !== 'copyAbility') return [];
  const owner = COPY_SOURCES[use.copy.kind];
  const list = presentPlayer(state, owner) && owner !== author ? [owner] : [];
  for (const k of needsConsent(state, author, use.copy)) if (!list.includes(k)) list.push(k);
  return list;
}

/** Создаёт запрос согласия: проверки уже пройдены, резерв ставит редьюсер. */
export function requestConsent(author: string, action: ConsentAction, approvers: string[], ctx: Ctx): Result {
  const request: ConsentRequest = {
    id: ctx.newId(), author, action, approvers, approved: [], status: 'pending',
    createdAt: ctx.now, expiresAt: ctx.now + CONSENT_TTL_MS,
  };
  return ok({ type: 'ConsentRequested', at: ctx.now, request });
}

const closed = (id: string, status: ConsentClosed['status'], ctx: Ctx, reason?: string): Result =>
  ok({ type: 'ConsentClosed', at: ctx.now, id, status, ...(reason !== undefined ? { reason } : {}) });

/**
 * Исполнение после последнего согласия: все проверки заново на текущем состоянии.
 * Не прошли — ConsentClosed failed с причиной; применение не тратится, резервы снимаются.
 */
export function performConsented(state: GameState, content: Content, req: ConsentRequest, ctx: Ctx): Result {
  const r = req.action.type === 'ability'
    ? recheckAbility(state, content, req, req.action.use, ctx)
    : performItemConsented(state, req, req.action, ctx);
  return r.ok ? r : closed(req.id, 'failed', ctx, r.detail ?? r.error);
}

/** Повтор §5.3 для автора, чья способность ждёт этого запроса. */
function recheckAbility(state: GameState, content: Content, req: ConsentRequest, use: AbilityUse, ctx: Ctx): Result {
  const p = state.players[req.author];
  if (!presentPlayer(state, req.author)) return fail('forbidden', 'автора нет на ярмарке');
  if (p.abilityUsedInAct) return fail('limit', 'способность в этом акте уже применена');
  return performAbility(state, content, req.author, use, ctx, req.id);
}

/** Открытый запрос или отказ: фаза акта без паузы, запрос есть и ждёт ответа. */
function pendingRequest(state: GameState, id: string): ConsentRequest | Result {
  if (!isActPhase(state) || state.clock.pausedAt !== undefined) return fail('phase');
  const r = state.requests[id];
  if (!r) return fail('not_found', id);
  if (r.status !== 'pending') return fail('invalid', 'запрос уже закрыт');
  return r;
}
const isResult = (x: ConsentRequest | Result): x is Result => 'ok' in x;

export const consentCommands: CommandHandlers = {
  'consent.accept': (state, content, cmd, ctx) => {
    const r = pendingRequest(state, cmd.id);
    if (isResult(r)) return r;
    const by = participant(state, ctx.actor);
    if (by === undefined || !r.approvers.includes(by)) return fail('forbidden');
    if (r.approved.includes(by)) return fail('invalid', 'вы уже согласились');
    if (ctx.now >= r.expiresAt) return fail('phase', 'срок ответа истёк');
    const given = { type: 'ConsentGiven' as const, at: ctx.now, id: r.id, by };
    if (r.approvers.some(k => k !== by && !r.approved.includes(k))) return ok(given);
    const done = performConsented(state, content, r, ctx);
    return done.ok ? ok(given, ...done.events) : done;
  },

  'consent.decline': (state, _content, cmd, ctx) => {
    const r = pendingRequest(state, cmd.id);
    if (isResult(r)) return r;
    const by = participant(state, ctx.actor);
    if (by === undefined || !r.approvers.includes(by)) return fail('forbidden');
    return closed(r.id, 'declined', ctx);
  },

  'consent.cancel': (state, _content, cmd, ctx) => {
    const r = pendingRequest(state, cmd.id);
    if (isResult(r)) return r;
    if (ctx.actor.type === 'gm') return closed(r.id, 'cancelled', ctx, 'gm');
    if (participant(state, ctx.actor) !== r.author) return fail('forbidden');
    return closed(r.id, 'cancelled', ctx);
  },

  'consent.expire': (state, _content, cmd, ctx) => {
    if (ctx.actor.type !== 'system') return fail('forbidden');
    const r = pendingRequest(state, cmd.id);
    if (isResult(r)) return r;
    if (ctx.now < r.expiresAt) return fail('invalid', 'срок ещё не истёк');
    return closed(r.id, 'expired', ctx, 'timeout');
  },
};

/** Снимает резервы запроса: abilityPending автора и reservedFor вещи, если они его. */
function release(state: GameState, req: ConsentRequest): GameState {
  let s = state;
  const p = s.players[req.author];
  if (p?.abilityPending === req.id) {
    const { abilityPending: _a, ...rest } = p;
    s = { ...s, players: { ...s.players, [req.author]: rest } };
  }
  const it = req.action.type === 'item' ? s.items[req.action.itemId] : undefined;
  if (it?.reservedFor === req.id) {
    const { reservedFor: _r, ...rest } = it;
    s = { ...s, items: { ...s.items, [it.id]: rest } };
  }
  return s;
}

const setRequest = (state: GameState, req: ConsentRequest): GameState => ({ ...state, requests: { ...state.requests, [req.id]: req } });

/** Для редьюсеров AbilityUsed и ItemUsed: исполненный по согласию запрос становится accepted. */
export function acceptRequest(state: GameState, id: string | undefined): GameState {
  const req = id !== undefined ? state.requests[id] : undefined;
  if (!req) return state;
  return setRequest(release(state, req), { ...req, status: 'accepted' });
}

export const consentReducers: EventReducers = {
  ConsentRequested: (state, _c, e) => {
    const r = e.request;
    let s = setRequest(state, r);
    if (r.action.type === 'ability') {
      s = { ...s, players: { ...s.players, [r.author]: { ...s.players[r.author], abilityPending: r.id } } };
    } else {
      const id = r.action.itemId;
      s = { ...s, items: { ...s.items, [id]: { ...s.items[id], reservedFor: r.id } } };
    }
    return s;
  },
  ConsentGiven: (state, _c, e) => {
    const r = state.requests[e.id];
    return setRequest(state, { ...r, approved: [...r.approved, e.by] });
  },
  ConsentClosed: (state, _c, e) => {
    const r = state.requests[e.id];
    return setRequest(release(state, r), { ...r, status: e.status, ...(e.reason !== undefined ? { reason: e.reason } : {}) });
  },
};
