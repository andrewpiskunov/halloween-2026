import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { PlayerView } from '@fair/shared';
import { gameFrozen } from '../rules';

/**
 * Ярмарка закрыта (§6.2): экраны игрока оборачиваются в Frozen.Provider со значением gameFrozen(v),
 * и каждая Button внутри выключается сама, без проверки в каждом обработчике.
 */
export const Frozen = createContext(false);

export const useFrozen = () => useContext(Frozen);

/** Подпись над выключенными кнопками экрана: «Ярмарка закрыта». */
export function FrozenNote({ v }: { v: PlayerView }) {
  if (!gameFrozen(v)) return null;
  return <p class="frozen-note" role="status"><span aria-hidden="true">✠{'︎'}</span> Ярмарка закрыта</p>;
}
