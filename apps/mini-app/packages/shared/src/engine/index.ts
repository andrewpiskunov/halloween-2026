import type { Content } from '../content';
import type { Command, Ctx } from '../commands';
import type { Event } from '../events';
import type { GameState } from '../types';
import { fail, type CommandHandlers, type ErrorCode, type EventReducers, type Result } from './result';
import { abilityCommands, abilityReducers } from './abilities';
import { actCommands, actReducers } from './acts';
import { altarCommands, altarReducers } from './altars';
import { consentCommands, consentReducers } from './consent';
import { itemCommands, itemReducers } from './items';
import { offerCommands, offerReducers } from './offers';
import { lotCommands, lotReducers } from './lots';
import { shopCommands, shopReducers } from './shop';
import { sideCommands, sideReducers } from './sides';
import { emptyState, sessionCommands, sessionReducers } from './session';

export type { ErrorCode, Result, CommandHandlers, EventReducers } from './result';
export { defaultRoster } from './roster';
export { available, hasBundle, isTradable, transfer } from './bundles';
export { BUYOUT_PRICE, OPEN_BIDDING_MS, SEALED_BIDS_MS, itemTitle, lotTitle } from './lots';

// Новые группы команд подключаются добавлением в эти списки.
const commandHandlers: CommandHandlers = { ...sessionCommands, ...actCommands, ...offerCommands, ...shopCommands, ...altarCommands, ...lotCommands, ...abilityCommands, ...itemCommands, ...consentCommands, ...sideCommands };
const eventReducers: EventReducers = { ...sessionReducers, ...actReducers, ...offerReducers, ...shopReducers, ...altarReducers, ...lotReducers, ...abilityReducers, ...itemReducers, ...consentReducers, ...sideReducers };

type AnyHandler = (state: GameState, content: Content, cmd: Command, ctx: Ctx) => Result;
type AnyReducer = (state: GameState, content: Content, event: Event) => GameState;

/** Пустая сессия в фазе setup с кодами приглашений (по roleKey для всех ролей и 'gm'). */
export function initialState(content: Content, codes: Record<string, string>): GameState {
  return reduce(emptyState(), content, { type: 'SessionCreated', at: 0, codes });
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
