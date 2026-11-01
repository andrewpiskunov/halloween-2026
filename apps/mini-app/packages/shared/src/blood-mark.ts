import type { GameState } from './types';

/** Видимая отметка на бутыле; остальные сведения о подготовке остаются личными. */
export function bloodMark(state: GameState, id: string, ref: string): { bloodDonor?: string } {
  const prepared = state.hidden17?.prepared[id];
  return state.hidden17?.fair && ref === 'blood-vial' && prepared?.method === 'sign' && prepared.controller
    ? { bloodDonor: prepared.controller } : {};
}
