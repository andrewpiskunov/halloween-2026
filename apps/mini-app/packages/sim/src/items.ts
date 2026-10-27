// Общие для симулятора константы и выбор вещей по проекции.
// Константы движка из @fair/shared не экспортируются, поэтому здесь копии с указанием источника.
import type { Ingredient, Item, PlayerView } from '@fair/shared';

/** Копия из engine/bundles.ts (INGREDIENTS). */
export const INGREDIENTS: Ingredient[] = ['ash', 'moon', 'dew'];
/** Копия из engine/abilities.ts (CRAFTED): изделия мастерской. */
export const CRAFTED: Item['kind'][] = ['potion', 'ward', 'focus', 'shape'];
/** Копия из engine/abilities.ts (REFORGEABLE): перековка берёт вещи по 1 золоту. */
export const REFORGEABLE: Item['kind'][] = ['potion', 'ward', 'focus'];
/** Копия из engine/shop.ts (KIND_BY_RECIPE), только рецепты перековки (engine/abilities.ts REFORGE_INTO). */
export const REFORGE_INTO = { cleanse: 'potion', ward: 'ward', focus: 'focus' } as const;
/** Копия из engine/shop.ts (KIND_BY_RECIPE) в обратную сторону: вид изделия → рецепт. */
export const RECIPE_BY_KIND: Partial<Record<Item['kind'], string>> = { potion: 'cleanse', ward: 'ward', focus: 'focus', shape: 'shape' };
/** Копия из engine/shop.ts (BUY_PRICE). */
export const BUY_PRICE = 2;
/** Копия из engine/items.ts (MAX_GUISE). */
export const MAX_GUISE = 40;
/** Копия из engine/altars.ts (ALTAR_KINDS). */
export const ALTAR_KINDS: Item['kind'][] = ['shard', 'focus'];

/**
 * Порядок вещей по стабильным ключам: вид, ref, автор изделия. Серверный id (UUID) не участвует,
 * иначе одно зерно давало бы разные команды; при равных ключах сохраняется порядок view.me.items.
 */
export const byKey = (a: Item, b: Item): number =>
  a.kind.localeCompare(b.kind) || a.ref.localeCompare(b.ref) || (a.createdBy ?? '').localeCompare(b.createdBy ?? '');

/**
 * Мои свободные вещи (не в резерве) нужных видов в стабильном порядке.
 * withHidden: false — скрытый до акта III осколок не берётся.
 */
export function freeItems(view: PlayerView, kinds?: Item['kind'][], withHidden = true): Item[] {
  const free = new Set(view.me.available.items);
  return view.me.items
    .filter(i => free.has(i.id) && (withHidden || i.hiddenUntilAct === undefined) && (!kinds || kinds.includes(i.kind)))
    .sort(byKey);
}
