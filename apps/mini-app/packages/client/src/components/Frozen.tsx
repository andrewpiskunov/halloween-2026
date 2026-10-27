import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { PlayerView } from '@fair/shared';
import { gameFrozen, playerLeft } from '../rules';

/**
 * Действия игрока недоступны: ярмарка закрыта (§6.2) или ведущий отметил, что игрок ушёл (этап 7, §2.4).
 * Экраны игрока оборачиваются в Frozen.Provider со значением frozenReason(v), и каждая Button внутри
 * выключается сама, без проверки в каждом обработчике. Значение — подсказка на выключенной кнопке, false — всё доступно.
 */
export const Frozen = createContext<string | false>(false);

export const useFrozen = () => useContext(Frozen);

/** Подпись над выключенными кнопками экрана: «Ярмарка закрыта». */
export function FrozenNote({ v }: { v: PlayerView }) {
  if (!gameFrozen(v)) return null;
  return <p class="frozen-note" role="status"><span aria-hidden="true">✠{'︎'}</span> Ярмарка закрыта</p>;
}

/** Почему выключены кнопки экранов игрока; false — не выключены. */
export function frozenReason(v: PlayerView): string | false {
  if (gameFrozen(v)) return 'Ярмарка закрыта';
  if (playerLeft(v)) return 'Вы не на ярмарке';
  return false;
}
