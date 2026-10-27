import type { Actor } from '../commands';
import type { GameState } from '../types';
import { fail, type Result } from './result';

/** Идут ли сейчас акты 1–3. */
export const isActPhase = (s: GameState) => s.phase === 'act1' || s.phase === 'act2' || s.phase === 'act3';
/** Ярмарка закрыта: итоги посчитаны или уже показаны. */
export const isClosed = (s: GameState) => s.phase === 'closed' || s.phase === 'revealed';

/**
 * Отказ игроку, которого ведущий отметил ушедшим (или который ещё не пришёл) после открытия.
 * Проверяется для любой команды игрока до её обработчика.
 */
export function leftPlayer(state: GameState, a: Actor): Result | undefined {
  if (a.type !== 'player' || state.phase === 'setup') return undefined;
  return state.players[a.roleKey]?.present === false ? fail('phase', 'ведущий отметил, что вы ушли') : undefined;
}

/** Ключ игрока-участника ярмарки: роль в составе, запись есть и игрок пришёл. */
export function participant(state: GameState, a: Actor): string | undefined {
  const key = a.type === 'player' ? a.roleKey : undefined;
  return key !== undefined && state.roster.includes(key) && state.players[key]?.present ? key : undefined;
}

/** Роль в составе и пришла: годится целью способности или вещи. */
export const presentPlayer = (state: GameState, key: string) =>
  typeof key === 'string' && state.roster.includes(key) && state.players[key]?.present === true;

/** Цель способности «на другого» (§5.3 шаг 6): в составе и присутствует, не сам автор. */
export function otherTarget(state: GameState, author: string, target: string): Result | undefined {
  if (!presentPlayer(state, target)) return fail('not_found', 'участник не на ярмарке');
  if (target === author) return fail('invalid', 'цель должна быть другим игроком');
  return undefined;
}
