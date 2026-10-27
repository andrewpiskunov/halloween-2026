import type { Bundle, GameState, Item, Phase, PlayerView, TargetMode, Want } from '@fair/shared';
import { roleName } from './labels';
import type { Tab } from './store';

const PHASE_LABEL: Record<Phase, string> = {
  setup: 'Подготовка', act1: 'Акт 1', act2: 'Акт 2', act3: 'Акт 3', closed: 'Закрыто', revealed: 'Итоги',
};
/** Фаза по-русски для верхней полосы. */
export const phaseLabel = (phase: Phase) => PHASE_LABEL[phase];

/**
 * Вкладка игрока по новой проекции: «Итоги» открываются сами один раз на каждое закрытие
 * (closedKey — closing.closedAt). shownFor — закрытие, для которого это уже сделано;
 * переподключение его не сбрасывает, выход из revealed (сброс игры) — сбрасывает.
 */
export function nextTab(phase: Phase, shownFor: number | null, current: Tab, closedKey: number | null): { tab: Tab; shownFor: number | null } {
  if (phase !== 'revealed') return { tab: current, shownFor: null };
  if (closedKey !== null && closedKey !== shownFor) return { tab: 'results', shownFor: closedKey };
  return { tab: current, shownFor };
}

/** Ярмарка закрыта: вкладки читаются, действия выключены (спецификация этапа 5, §6.2). */
export const gameFrozen = (v: PlayerView) => v.phase === 'closed' || v.phase === 'revealed';

/** Кнопка «Выбрать сторону»: свободная роль, сторона ещё не выбрана, первый или второй акт (§6.4). */
export const canChooseSide = (v: PlayerView) =>
  v.me.role.side === 'free' && !v.me.player.side && (v.phase === 'act1' || v.phase === 'act2');

/**
 * Сколько осталось до срока по часам ярмарки: ответ на сделку или просьбу, окно торга.
 * На паузе отсчёт стоит (сервер сдвинет срок при продолжении).
 */
export function remainingMs(until: number, clock: { paused: boolean; pausedAt?: number }, now: number): number {
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

/** Вещи, которые ведущий может передать исправлением: у игроков и на алтарях (вклад снимется); из лота нельзя. */
export const correctableItems = (state: GameState) => Object.values(state.items).filter(it => it.owner.type !== 'lot');

/** Длина облика Камня: копия MAX_GUISE из engine/items.ts. */
export const GUISE_MAX = 40;

/** Вещи, которые применяют из сумки: копия USABLE из engine/items.ts. */
const USABLE: Item['kind'][] = ['potion', 'ward', 'shape'];

/** Можно ли нажать «Использовать»: повторяет проверки сервера, why — подсказка под кнопкой. */
export function canUseItem(item: Item, v: PlayerView): { ok: true } | { ok: false; why: string } {
  if (item.kind === 'focus') return { ok: false, why: 'Кладётся на алтарь' };
  if (!USABLE.includes(item.kind)) return { ok: false, why: 'Не применяется' };
  if (item.reservedFor !== undefined) {
    return { ok: false, why: v.requests.some(r => r.id === item.reservedFor) ? 'обещано в просьбе' : 'обещано в сделке' };
  }
  if (v.act === 0 || v.phase === 'closed' || v.phase === 'revealed') return { ok: false, why: 'Только во время акта' };
  if (!v.me.available.items.includes(item.id)) return { ok: false, why: 'Вещь занята' };
  if (item.kind === 'ward' && v.me.player.protection) return { ok: false, why: 'Защита уже есть' };
  return { ok: true };
}

/**
 * Кого можно выбрать целью: «other» — присутствующие без себя, «any» — «Себе» первым.
 * Подпись с обликом: «Тётушка Мэй (Грета)». Для «protectedAndOther» список «кому».
 */
export function abilityTargets(v: PlayerView, mode: TargetMode = v.me.ability.target): { roleKey: string; label: string }[] {
  const others = v.others.map(o => ({ roleKey: o.roleKey, label: roleName(o.roleKey, v) }));
  switch (mode) {
    case 'other': case 'protectedAndOther': return others;
    case 'any': return [{ roleKey: v.me.role.key, label: 'Себе' }, ...others];
    default: return [];
  }
}
