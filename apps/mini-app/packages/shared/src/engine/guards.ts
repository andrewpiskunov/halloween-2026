import type { Actor } from '../commands';
import type { GameState } from '../types';

/** Идут ли сейчас акты 1–3. */
export const isActPhase = (s: GameState) => s.phase === 'act1' || s.phase === 'act2' || s.phase === 'act3';

/** Ключ игрока-участника ярмарки: роль в составе, запись есть и игрок пришёл. */
export function participant(state: GameState, a: Actor): string | undefined {
  const key = a.type === 'player' ? a.roleKey : undefined;
  return key !== undefined && state.roster.includes(key) && state.players[key]?.present ? key : undefined;
}
