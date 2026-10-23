import type { GameState, Item, Offer, Phase, PlayerView } from '@fair/shared';

const PHASE_LABEL: Record<Phase, string> = {
  setup: 'Подготовка', act1: 'Акт 1', act2: 'Акт 2', act3: 'Акт 3', closed: 'Закрыто', revealed: 'Закрыто',
};
/** Фаза по-русски для верхней полосы. */
export const phaseLabel = (phase: Phase) => PHASE_LABEL[phase];

/** Сколько осталось на ответ; на паузе отсчёт стоит (сервер сдвинет срок при продолжении). */
export function offerRemainingMs(o: Pick<Offer, 'expiresAt'>, clock: { paused: boolean; pausedAt?: number }, now: number): number {
  return o.expiresAt - (clock.paused && clock.pausedAt !== undefined ? clock.pausedAt : now);
}

/** Повторяет проверки сервера: свободная вещь, не скрытая до третьего акта. */
export function canOffer(item: Item, v: PlayerView): boolean {
  if (!v.me.available.items.includes(item.id)) return false;
  return !(item.hiddenUntilAct !== undefined && v.act !== 3);
}

/** Какие вещи сервер примет на алтарь: копия ALTAR_KINDS из engine/altars.ts (клиент берёт из shared только типы). */
const ALTAR_KINDS: Item['kind'][] = ['shard', 'focus'];
export const canPutOnAltar = (item: Item, v: PlayerView) => canOffer(item, v) && ALTAR_KINDS.includes(item.kind);

/** Вещи, которые ведущий может передать исправлением: только находящиеся у игроков. */
export const correctableItems = (state: GameState) => Object.values(state.items).filter(it => it.owner.type === 'player');
