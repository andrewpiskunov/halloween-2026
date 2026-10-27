import type { Content } from '../content';
import type { Actor, Ctx } from '../commands';
import type { FairOpened } from '../events';
import type { Altar, AltarSide, Counts, GameState, Item, Lot, Player } from '../types';
import { fail, ok, type CommandHandlers, type EventReducers } from './result';
import { defaultRoster, MAX_N, MIN_N } from './roster';

/** Пустое состояние до SessionCreated: фаза setup, ни состава, ни кодов. */
export const emptyState = (): GameState => ({
  phase: 'setup', roster: [], nPresent: 0,
  clock: { actStartedAt: 0, pausedTotal: 0 },
  players: {}, items: {}, workshop: { ash: 0, moon: 0, dew: 0 }, offers: {}, lots: {},
  altars: {}, invites: {}, bindings: {}, gmCode: '', announcements: [], seq: 0, requests: {}, actions: [],
});

const CODE_LENGTH = 12;
/**
 * Коды приглашений для сброса: из newId (на сервере это UUID) берутся первые 12 знаков без дефисов.
 * Уникальность обеспечивает сам newId.
 */
function codesFrom(content: Content, ctx: Ctx): Record<string, string> {
  const codes: Record<string, string> = {};
  const used = new Set<string>();
  for (const key of ['gm', ...content.roles.map(r => r.key)]) {
    let code = ctx.newId().replace(/-/g, '').slice(0, CODE_LENGTH);
    while (used.has(code)) code = ctx.newId().replace(/-/g, '').slice(0, CODE_LENGTH);
    used.add(code);
    codes[key] = code;
  }
  return codes;
}

const START_GOLD = 6;
const FIRST_ACT_LOTS = 4;
const BASE_ALTARS: AltarSide[] = ['wake', 'bind', 'break'];
// Стартовые владельцы улик; улика A приходит с осколком IV во втором акте и при открытии не создаётся.
const CLUE_OWNERS: Record<string, string> = { B: 'o10', C: 'o16' };
const HIDDEN_SHARD = 'V';
/** Роли, проклятые с открытия ярмарки (extra: «старое проклятие»); тест сверяет с содержимым. */
export const CURSED_AT_START: string[] = ['o9'];

const zero = (): Counts => ({ ash: 0, moon: 0, dew: 0 });

export function emptyPlayer(roleKey: string): Player {
  return {
    roleKey, present: false, gold: 0, reservedGold: 0, ingredients: zero(),
    abilityUsedInAct: false, thorns: false, curse: false, discount: false, hostileAttemptsAgainstInAct: 0,
  };
}

const isGm = (a: Actor) => a.type === 'gm';

/** Состав в порядке позиций содержимого. */
function sortRoster(content: Content, keys: string[]): string[] {
  const set = new Set(keys);
  return [...content.roles].sort((a, b) => a.pos - b.pos).filter(r => set.has(r.key)).map(r => r.key);
}

/** Игроки для нового состава: существующие записи сохраняются, новые с нулями и прежней привязкой. */
function playersFor(state: GameState, roster: string[]): Record<string, Player> {
  const players: Record<string, Player> = {};
  for (const key of roster) {
    const tid = state.bindings[key];
    players[key] = state.players[key] ?? (tid === undefined ? emptyPlayer(key) : { ...emptyPlayer(key), telegramId: tid });
  }
  return players;
}

/** Привязки без этого аккаунта: у одного аккаунта не больше одной роли. */
function bindingsWithout(bindings: Record<string, number>, telegramId: number): Record<string, number> {
  return Object.fromEntries(Object.entries(bindings).filter(([, tid]) => tid !== telegramId));
}

/** Начальная раздача по правилам 6.6 и 16.5: вещи владельцам или в пул лотов. */
function buildOpening(state: GameState, content: Content, newId: () => string, at: number): FairOpened {
  const inRoster = new Set(state.roster);
  const present = (key: string) => inRoster.has(key) && state.players[key]?.present === true;

  const players: Record<string, Player> = {};
  for (const key of state.roster) {
    const p = state.players[key];
    players[key] = p.present
      ? { ...p, gold: START_GOLD, ingredients: { ...zero(), ...content.roleByKey[key].bundle }, curse: CURSED_AT_START.includes(key) }
      : { ...p, gold: 0, ingredients: zero() };
  }
  const nPresent = state.roster.filter(present).length;

  const items: Record<string, Item> = {};
  const pool: { kind: Item['kind']; ref: string }[] = [];
  const place = (kind: Item['kind'], ref: string, owner: string, toPool: boolean) => {
    if (present(owner)) {
      const id = newId();
      items[id] = { id, kind, ref, owner: { type: 'player', key: owner } };
    } else if (toPool) pool.push({ kind, ref });
  };

  // Пул упорядочен: осколки, улики, реликвии.
  for (const sh of content.shards) {
    if (sh.owner) place('shard', sh.id, sh.owner, true);
    else if (sh.id === HIDDEN_SHARD && sh.hidden && present(sh.hidden)) {
      const id = newId();
      items[id] = { id, kind: 'shard', ref: sh.id, owner: { type: 'player', key: sh.hidden }, hiddenUntilAct: 3 };
    }
  }
  for (const c of content.clues) {
    const owner = CLUE_OWNERS[c.id];
    if (owner) place('clue', c.id, owner, true);
  }
  for (const r of content.relics) place('relic', r.name, r.owner, r.wants.some(w => inRoster.has(w)));

  const lots: Record<string, Lot> = {};
  pool.forEach(({ kind, ref }, i) => {
    const itemId = newId();
    const id = newId();
    const first = i < FIRST_ACT_LOTS;
    items[itemId] = { id: itemId, kind, ref, owner: { type: 'lot', id } };
    lots[id] = { id, items: [itemId], act: first ? 1 : 2, status: first ? 'announced' : 'queued', bids: [] };
  });

  const each = Math.ceil(nPresent / 3);
  const altars: Partial<Record<AltarSide, Altar>> = {};
  const hasShip = state.roster.some(k => content.roleByKey[k]?.side === 'ship');
  for (const side of hasShip ? [...BASE_ALTARS, 'ship' as const] : BASE_ALTARS) altars[side] = { side, contributions: [] };

  const ev = content.events.find(e => e.when === 'Открытие');
  return {
    type: 'FairOpened', at, nPresent, players, items, lots, workshop: { ash: each, moon: each, dew: each }, altars,
    announcement: { at, title: ev?.title ?? 'Ярмарка открыта', text: ev?.text ?? '' },
  };
}

export const sessionCommands: CommandHandlers = {
  'session.setN': (state, content, cmd, ctx) => {
    if (!isGm(ctx.actor)) return fail('forbidden');
    if (state.phase !== 'setup') return fail('phase');
    if (!Number.isInteger(cmd.n) || cmd.n < MIN_N || cmd.n > MAX_N) return fail('invalid', `N должно быть от ${MIN_N} до ${MAX_N}`);
    return ok({ type: 'RosterSet', at: ctx.now, roster: defaultRoster(content, cmd.n) });
  },

  'session.toggleRole': (state, content, cmd, ctx) => {
    if (!isGm(ctx.actor)) return fail('forbidden');
    if (state.phase !== 'setup') return fail('phase');
    if (!content.roleByKey[cmd.roleKey]) return fail('not_found', cmd.roleKey);
    return ok({ type: 'RoleToggled', at: ctx.now, roleKey: cmd.roleKey, inRoster: !state.roster.includes(cmd.roleKey) });
  },

  /** Полный сброс с пульта: всё начальное, коды новые, ведущий остаётся ведущим. */
  'session.reset': (state, content, _cmd, ctx) => {
    if (ctx.actor.type !== 'gm') return fail('forbidden');
    return ok({ type: 'SessionReset', at: ctx.now, codes: codesFrom(content, ctx), ...(state.gmTelegramId !== undefined ? { gmTelegramId: state.gmTelegramId } : {}) });
  },

  'player.bind': (state, _content, cmd, ctx) => {
    if (ctx.actor.type === 'player') return fail('forbidden');
    // Аккаунт уже занимает роль состава (кроме roleKey) или место ведущего.
    const takenElsewhere = (roleKey: string | 'gm') =>
      (roleKey !== 'gm' && state.gmTelegramId === cmd.telegramId)
      || state.roster.some(k => k !== roleKey && state.players[k]?.telegramId === cmd.telegramId);
    if (cmd.code === state.gmCode) {
      if (state.gmTelegramId === cmd.telegramId) return ok();
      if (state.gmTelegramId !== undefined) return fail('forbidden', 'код ведущего уже привязан');
      if (takenElsewhere('gm')) return fail('forbidden', 'аккаунт уже привязан');
      return ok({ type: 'PlayerBound', at: ctx.now, roleKey: 'gm', telegramId: cmd.telegramId });
    }
    const roleKey = Object.keys(state.invites).find(k => state.invites[k] === cmd.code);
    if (!roleKey) return fail('not_found', 'неизвестный код');
    const p = state.players[roleKey];
    if (!state.roster.includes(roleKey) || !p) return fail('forbidden', 'роль вне состава');
    if (p.telegramId === cmd.telegramId) return ok();
    if (p.telegramId !== undefined) return fail('forbidden', 'код уже привязан к другому аккаунту');
    if (takenElsewhere(roleKey)) return fail('forbidden', 'аккаунт уже привязан');
    return ok({ type: 'PlayerBound', at: ctx.now, roleKey, telegramId: cmd.telegramId });
  },

  'player.setPresent': (state, _content, cmd, ctx) => {
    if (!isGm(ctx.actor)) return fail('forbidden');
    if (state.phase !== 'setup') return fail('phase');
    if (!state.players[cmd.roleKey]) return fail('not_found', cmd.roleKey);
    return ok({ type: 'PresenceSet', at: ctx.now, roleKey: cmd.roleKey, present: cmd.present });
  },

  'session.open': (state, content, _cmd, ctx) => {
    if (!isGm(ctx.actor)) return fail('forbidden');
    if (state.phase !== 'setup') return fail('phase');
    if (state.roster.length === 0) return fail('invalid', 'состав пуст');
    if (!state.roster.some(k => state.players[k]?.present)) return fail('invalid', 'никто не отмечен как пришедший');
    return ok(buildOpening(state, content, ctx.newId, ctx.now));
  },
};

export const sessionReducers: EventReducers = {
  SessionCreated: (state, _content, e) => {
    const { gm, ...invites } = e.codes;
    return { ...state, invites, gmCode: gm ?? '' };
  },
  SessionReset: (_state, _content, e) => {
    const { gm, ...invites } = e.codes;
    return { ...emptyState(), invites, gmCode: gm ?? '', ...(e.gmTelegramId !== undefined ? { gmTelegramId: e.gmTelegramId } : {}) };
  },
  RosterSet: (state, _content, e) => ({ ...state, roster: [...e.roster], players: playersFor(state, e.roster) }),
  RoleToggled: (state, content, e) => {
    const roster = e.inRoster
      ? sortRoster(content, [...state.roster, e.roleKey])
      : state.roster.filter(k => k !== e.roleKey);
    return { ...state, roster, players: playersFor(state, roster) };
  },
  // Прежние привязки аккаунта к ролям вне состава снимаются: иначе роль вернётся уже занятой им.
  PlayerBound: (state, _content, e) => {
    const bindings = bindingsWithout(state.bindings, e.telegramId);
    if (e.roleKey === 'gm') return { ...state, bindings, gmTelegramId: e.telegramId };
    return {
      ...state,
      bindings: { ...bindings, [e.roleKey]: e.telegramId },
      players: { ...state.players, [e.roleKey]: { ...state.players[e.roleKey], telegramId: e.telegramId } },
    };
  },
  PresenceSet: (state, _content, e) => ({
    ...state, players: { ...state.players, [e.roleKey]: { ...state.players[e.roleKey], present: e.present } },
  }),
  FairOpened: (state, _content, e) => ({
    ...state,
    phase: 'act1',
    nPresent: e.nPresent,
    players: e.players,
    items: e.items,
    lots: e.lots,
    workshop: e.workshop,
    altars: e.altars,
    clock: { actStartedAt: e.at, pausedTotal: 0 },
    announcements: [...state.announcements, e.announcement],
  }),
};
