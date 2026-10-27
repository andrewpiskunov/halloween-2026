import type { Actor } from '../commands';
import type { Counts, GameState, Item, Lot } from '../types';
import { fail, ok, type CommandHandlers, type EventReducers } from './result';
import { biddingInProgress, shiftLots } from './lots';

const isGm = (a: Actor) => a.type === 'gm';
const isActPhase = (s: GameState) => s.phase === 'act1' || s.phase === 'act2' || s.phase === 'act3';
/** Сдвигает срок каждого pending-предложения на время паузы. */
function shiftPending(offers: GameState['offers'], pausedMs: number): GameState['offers'] {
  const res = { ...offers };
  for (const [id, o] of Object.entries(offers)) {
    if (o.status === 'pending') res[id] = { ...o, expiresAt: o.expiresAt + pausedMs };
  }
  return res;
}

const EVENT_WHEN = { 2: 'Акт II', 3: 'Акт III' } as const;

export const actCommands: CommandHandlers = {
  'act.next': (state, content, _cmd, ctx) => {
    if (!isGm(ctx.actor)) return fail('forbidden');
    if (state.phase !== 'act1' && state.phase !== 'act2') return fail('phase');
    if (biddingInProgress(state)) return fail('invalid', 'сначала завершите торг за лот');
    const act: 2 | 3 = state.phase === 'act1' ? 2 : 3;

    const newLots: Lot[] = [];
    const newItems: Item[] = [];
    const addLot = (items: Pick<Item, 'kind' | 'ref'>[]) => {
      const id = ctx.newId();
      const ids = items.map(it => {
        const itemId = ctx.newId();
        newItems.push({ id: itemId, ...it, owner: { type: 'lot', id } });
        return itemId;
      });
      newLots.push({ id, items: ids, act, status: 'announced', bids: [] });
    };

    const revealedItems: string[] = [];
    if (act === 2) {
      addLot([{ kind: 'shard', ref: 'IV' }, { kind: 'clue', ref: 'A' }]);
    } else {
      const v = Object.values(state.items).find(i => i.kind === 'shard' && i.ref === 'V');
      if (v) revealedItems.push(v.id);
      else addLot([{ kind: 'shard', ref: 'V' }]);
    }

    const announcedLots = Object.values(state.lots).filter(l => l.status === 'queued' && l.act === act).map(l => l.id);
    const ev = content.events.find(e => e.when === EVENT_WHEN[act]);
    return ok({
      type: 'ActStarted', at: ctx.now, act,
      refill: Math.ceil(state.nPresent / 6),
      // Смена акта во время паузы — неявный resume.
      pausedMs: state.clock.pausedAt === undefined ? 0 : ctx.now - state.clock.pausedAt,
      newLots, newItems, announcedLots, revealedItems,
      announcement: { at: ctx.now, title: ev?.title ?? EVENT_WHEN[act], text: ev?.text ?? '' },
    });
  },

  'clock.pause': (state, _content, _cmd, ctx) => {
    if (!isGm(ctx.actor)) return fail('forbidden');
    if (!isActPhase(state)) return fail('phase');
    if (state.clock.pausedAt !== undefined) return fail('invalid', 'часы уже на паузе');
    return ok({ type: 'ClockPaused', at: ctx.now });
  },

  'clock.resume': (state, _content, _cmd, ctx) => {
    if (!isGm(ctx.actor)) return fail('forbidden');
    if (!isActPhase(state)) return fail('phase');
    if (state.clock.pausedAt === undefined) return fail('invalid', 'часы не на паузе');
    return ok({ type: 'ClockResumed', at: ctx.now, pausedMs: ctx.now - state.clock.pausedAt });
  },

  'clock.extend': (state, _content, cmd, ctx) => {
    if (!isGm(ctx.actor)) return fail('forbidden');
    if (!isActPhase(state)) return fail('phase');
    if (!Number.isInteger(cmd.minutes) || cmd.minutes <= 0) return fail('invalid', 'минуты должны быть целым числом больше нуля');
    return ok({ type: 'ClockExtended', at: ctx.now, minutes: cmd.minutes });
  },

  'gm.announce': (_state, _content, cmd, ctx) => {
    if (!isGm(ctx.actor)) return fail('forbidden');
    const text = cmd.text.trim();
    if (!text) return fail('invalid', 'пустой текст');
    return ok({ type: 'Announced', at: ctx.now, title: 'Ведущий', text });
  },

  'gm.correct': (state, _content, cmd, ctx) => {
    if (!isGm(ctx.actor)) return fail('forbidden');
    if (state.phase === 'setup') return fail('phase');
    if (!cmd.reason.trim()) return fail('invalid', 'нужна причина');
    const p = state.players[cmd.playerKey];
    if (!p) return fail('not_found', cmd.playerKey);
    const c = cmd.change;
    if (c.field === 'gold') {
      if (!Number.isInteger(c.delta)) return fail('invalid');
      if (p.gold + c.delta < p.reservedGold) return fail('insufficient', 'ниже зарезервированного золота');
    } else if (c.field === 'ingredient') {
      if (!Number.isInteger(c.delta)) return fail('invalid');
      if (p.ingredients[c.ingredient] + c.delta < 0) return fail('insufficient');
    } else {
      const it = state.items[c.itemId];
      if (!it) return fail('not_found', c.itemId);
      // Вещь из лота или с алтаря остаётся в их списках: перенос оставил бы состояние несогласованным.
      if (it.owner.type !== 'player') return fail('invalid', 'переносить можно только вещь у игрока');
      if (c.owner.type !== 'player') return fail('invalid', 'новый владелец должен быть игроком');
      if (!state.roster.includes(c.owner.key) || !state.players[c.owner.key]) return fail('not_found', c.owner.key);
    }
    return ok({ type: 'Corrected', at: ctx.now, playerKey: cmd.playerKey, change: c, reason: cmd.reason.trim() });
  },

  'gm.rebind': (state, _content, cmd, ctx) => {
    if (!isGm(ctx.actor)) return fail('forbidden');
    if (!state.roster.includes(cmd.roleKey)) return fail('not_found', cmd.roleKey);
    return ok({ type: 'InviteRebound', at: ctx.now, roleKey: cmd.roleKey, code: ctx.newId() });
  },
};

export const actReducers: EventReducers = {
  ActStarted: (state, _content, e) => {
    const players = { ...state.players };
    for (const [key, p] of Object.entries(state.players)) {
      players[key] = {
        ...p, abilityUsedInAct: false, protection: undefined, thorns: false, discount: false,
        pendingModifier: undefined, hostileAttemptsAgainstInAct: 0,
      };
    }
    const lots = { ...state.lots };
    for (const id of e.announcedLots) lots[id] = { ...lots[id], status: 'announced' };
    for (const l of e.newLots) lots[l.id] = l;
    const items = { ...state.items };
    for (const it of e.newItems) items[it.id] = it;
    for (const id of e.revealedItems) {
      const { hiddenUntilAct: _h, ...rest } = items[id];
      items[id] = rest;
    }
    const workshop: Counts = {
      ash: state.workshop.ash + e.refill, moon: state.workshop.moon + e.refill, dew: state.workshop.dew + e.refill,
    };
    return {
      ...state, offers: shiftPending(state.offers, e.pausedMs), phase: e.act === 2 ? 'act2' : 'act3', players, lots, items, workshop,
      clock: { actStartedAt: e.at, pausedTotal: 0 },
      announcements: [...state.announcements, e.announcement],
    };
  },
  ClockPaused: (state, _c, e) => ({ ...state, clock: { ...state.clock, pausedAt: e.at } }),
  ClockResumed: (state, _c, e) => {
    const { pausedAt: _p, ...clock } = state.clock;
    return { ...state, offers: shiftPending(state.offers, e.pausedMs), lots: shiftLots(state.lots, e.pausedMs), clock: { ...clock, pausedTotal: clock.pausedTotal + e.pausedMs } };
  },
  ClockExtended: (state, _c, e) => ({
    ...state, clock: { ...state.clock, pausedTotal: state.clock.pausedTotal + e.minutes * 60000 },
  }),
  Announced: (state, _c, e) => ({ ...state, announcements: [...state.announcements, { at: e.at, title: e.title, text: e.text }] }),
  Corrected: (state, _c, e) => {
    const p = state.players[e.playerKey];
    const c = e.change;
    if (c.field === 'gold') return { ...state, players: { ...state.players, [e.playerKey]: { ...p, gold: p.gold + c.delta } } };
    if (c.field === 'ingredient') {
      const ingredients = { ...p.ingredients, [c.ingredient]: p.ingredients[c.ingredient] + c.delta };
      return { ...state, players: { ...state.players, [e.playerKey]: { ...p, ingredients } } };
    }
    // Резерв снимается: вещь ушла от автора, его предложение закроется при попытке принять.
    const { reservedFor: _r, ...item } = state.items[c.itemId];
    return { ...state, items: { ...state.items, [c.itemId]: { ...item, owner: c.owner } } };
  },
  InviteRebound: (state, _c, e) => {
    const { [e.roleKey]: _old, ...bindings } = state.bindings;
    return {
      ...state,
      bindings,
      invites: { ...state.invites, [e.roleKey]: e.code },
      players: { ...state.players, [e.roleKey]: { ...state.players[e.roleKey], telegramId: undefined } },
    };
  },
};
