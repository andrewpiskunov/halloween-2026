import type { Content } from '../content';
import type { Command, Ctx } from '../commands';
import type { Event } from '../events';
import type { GameState } from '../types';
import { fail, type CommandHandlers, type ErrorCode, type EventReducers, type Result } from './result';
import { actCommands, actReducers } from './acts';
import { sessionCommands, sessionReducers } from './session';

export type { ErrorCode, Result, CommandHandlers, EventReducers } from './result';
export { defaultRoster } from './roster';

// Новые группы команд (offers, shop, altars) подключаются добавлением в эти списки.
const commandHandlers: CommandHandlers = { ...sessionCommands, ...actCommands };
const eventReducers: EventReducers = { ...sessionReducers, ...actReducers };

type AnyHandler = (state: GameState, content: Content, cmd: Command, ctx: Ctx) => Result;
type AnyReducer = (state: GameState, content: Content, event: Event) => GameState;

/** Пустая сессия в фазе setup с кодами приглашений (по roleKey для всех ролей и 'gm'). */
export function initialState(content: Content, codes: Record<string, string>): GameState {
  const empty: GameState = {
    phase: 'setup', roster: [], nPresent: 0,
    clock: { actStartedAt: 0, pausedTotal: 0 },
    players: {}, items: {}, workshop: { ash: 0, moon: 0, dew: 0 }, offers: {}, lots: {},
    altars: {}, invites: {}, gmCode: '', announcements: [], seq: 0,
  };
  return reduce(empty, content, { type: 'SessionCreated', at: 0, codes });
}

/** Проверяет команду и возвращает события; состояние не меняет. */
export function decide(state: GameState, content: Content, cmd: Command, ctx: Ctx): Result {
  const handler = commandHandlers[cmd.type] as AnyHandler | undefined;
  if (!handler) return fail('invalid', `команда не поддерживается: ${cmd.type}`);
  return handler(state, content, cmd, ctx);
}

/** Применяет одно событие и возвращает новое состояние; seq берётся из события или растёт на 1. */
export function reduce(state: GameState, content: Content, event: Event): GameState {
  const reducer = eventReducers[event.type] as AnyReducer | undefined;
  if (!reducer) throw new Error(`Нет редьюсера для события ${event.type}`);
  return { ...reducer(state, content, event), seq: event.seq ?? state.seq + 1 };
}

export function execute(state: GameState, content: Content, cmd: Command, ctx: Ctx):
  { ok: true; state: GameState; events: Event[] } | { ok: false; error: ErrorCode; detail?: string } {
  const r = decide(state, content, cmd, ctx);
  if (!r.ok) return r;
  return { ok: true, events: r.events, state: r.events.reduce((s, e) => reduce(s, content, e), state) };
}
