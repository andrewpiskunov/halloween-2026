import type { Bundle, GameState, Item, Offer, Phase, PlayerView, Want } from '@fair/shared';

const PHASE_LABEL: Record<Phase, string> = {
  setup: 'Подготовка', act1: 'Акт 1', act2: 'Акт 2', act3: 'Акт 3', closed: 'Закрыто', revealed: 'Закрыто',
};
/** Фаза по-русски для верхней полосы. */
export const phaseLabel = (phase: Phase) => PHASE_LABEL[phase];

/** Сколько осталось на ответ; на паузе отсчёт стоит (сервер сдвинет срок при продолжении). */
export function offerRemainingMs(o: Pick<Offer, 'expiresAt'>, clock: { paused: boolean; pausedAt?: number }, now: number): number {
  return o.expiresAt - (clock.paused && clock.pausedAt !== undefined ? clock.pausedAt : now);
}

/** Остаток окна торга по часам ярмарки: на паузе стоит. Копия логики offerRemainingMs для лотов. */
export function untilRemainingMs(until: number, clock: { paused: boolean; pausedAt?: number }, now: number): number {
  return until - (clock.paused && clock.pausedAt !== undefined ? clock.pausedAt : now);
}

/** Ставка на лот: от «своя + 1» до «доступное золото + своя» (своя уже в резерве). */
export function bidBounds(lot: { bids: { player: string; amount: number }[] }, v: PlayerView): { min: number; max: number; mine: number } {
  const mine = lot.bids.find(b => b.player === v.me.role.key)?.amount ?? 0;
  return { min: mine + 1, max: v.me.available.gold + mine, mine };
}

/** Повторяет проверки сервера: свободная вещь, не скрытая до третьего акта. */
export function canOffer(item: Item, v: PlayerView): boolean {
  if (!v.me.available.items.includes(item.id)) return false;
  return !(item.hiddenUntilAct !== undefined && v.act !== 3);
}

/** Просьбы по названию из входящего предложения, на которые у меня нет свободной подходящей вещи. */
export function missingWants(get: Bundle, v: PlayerView): Want[] {
  const taken = new Set(get.items);
  const missing: Want[] = [];
  for (const w of get.wants ?? []) {
    const it = v.me.items.find(i => i.kind === w.kind && i.ref === w.ref && !taken.has(i.id) && canOffer(i, v));
    if (it) taken.add(it.id); else missing.push(w);
  }
  return missing;
}

/** Какие вещи сервер примет на алтарь: копия ALTAR_KINDS из engine/altars.ts (клиент берёт из shared только типы). */
const ALTAR_KINDS: Item['kind'][] = ['shard', 'focus'];
export const canPutOnAltar = (item: Item, v: PlayerView) => canOffer(item, v) && ALTAR_KINDS.includes(item.kind);

/** Вещи, которые ведущий может передать исправлением: только находящиеся у игроков. */
export const correctableItems = (state: GameState) => Object.values(state.items).filter(it => it.owner.type === 'player');
