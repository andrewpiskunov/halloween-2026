import type { Content } from '../content';
import type { Command, CommandType, Ctx } from '../commands';
import type { Event, EventType } from '../events';
import type { GameState } from '../types';

export type ErrorCode = 'phase' | 'forbidden' | 'not_found' | 'not_owner' | 'insufficient' | 'reserved' | 'limit' | 'invalid';
export type Result = { ok: true; events: Event[] } | { ok: false; error: ErrorCode; detail?: string };

export const ok = (...events: Event[]): Result => ({ ok: true, events });
export const fail = (error: ErrorCode, detail?: string): Result => ({ ok: false, error, detail });

/** Обработчики команд одной группы: тип команды → проверка и события. */
export type CommandHandlers = {
  [K in CommandType]?: (state: GameState, content: Content, cmd: Extract<Command, { type: K }>, ctx: Ctx) => Result;
};
/** Редьюсеры событий одной группы: тип события → новое состояние (без мутаций входа). */
export type EventReducers = {
  [K in EventType]?: (state: GameState, content: Content, event: Extract<Event, { type: K }>) => GameState;
};
