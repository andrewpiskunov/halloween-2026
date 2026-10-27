// Проекции итогов закрытия для игрока (спецификация этапа 5, §6.1 и §6.3).
import { OUTCOME_TEXTS, OUTCOME_TITLES } from './closing-texts';
import type { Content } from './content';
import { computeClosing, goalDone, sideOf } from './engine/closing';
import { GOALS } from './goals';
import type { AltarSide, GameState, Side } from './types';

export interface GoalView { text: string; done: boolean; byGm: boolean }

export interface ClosingView {
  outcome: AltarSide | 'sleep'; title: string; text: string;
  /** «Правду» держит кто-то; кто именно, игроку не сообщается. */
  truthTold: boolean;
  me: { outcome: boolean; truth: boolean; side: Side };
}

/**
 * Мои цели: после закрытия — из state.closing, до него — предпросмотр computeClosing на текущем состоянии.
 * byGm: цель отмечена ведущим вручную (goalOverrides).
 */
export function goalsFor(state: GameState, content: Content, key: string): GoalView[] {
  const closing = state.closing ?? computeClosing(state, content, 0);
  const overrides = state.players[key]?.goalOverrides;
  // отсутствующего участника в итогах нет: считаем его цели напрямую
  const done = (i: 0 | 1) => closing.players[key]?.goals[i] ?? overrides?.[i] ?? goalDone(state, content, key, GOALS[key][i]);
  return content.roleByKey[key].goals.map((text, i) => ({
    text,
    done: done(i as 0 | 1),
    byGm: overrides?.[i] !== null && overrides?.[i] !== undefined,
  }));
}

/** Итоги для игрока: только в revealed; без чужих итогов и без имени держателя «Правды». */
export function closingFor(state: GameState, content: Content, key: string): ClosingView | undefined {
  const closing = state.closing;
  if (state.phase !== 'revealed' || !closing) return undefined;
  const mine = closing.players[key];
  return {
    outcome: closing.outcome,
    title: OUTCOME_TITLES[closing.outcome],
    text: OUTCOME_TEXTS[closing.outcome],
    truthTold: closing.truthHolder !== undefined,
    me: mine
      ? { outcome: mine.outcome, truth: mine.truth, side: mine.side }
      : { outcome: false, truth: false, side: sideOf(state, content, key) },
  };
}
