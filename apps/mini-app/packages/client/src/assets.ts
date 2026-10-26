import type { Ingredient, Item } from '@fair/shared';

/** Слаги картинок реликвий: имя реликвии из данных игры → файл в /assets/items. */
export const RELIC_SLUGS: Record<string, string> = {
  'Корона пепла': 'crown-of-ash',
  'Семя леса': 'forest-seed',
  'Костяная флейта': 'bone-flute',
  'Серебряная чешуя': 'silver-scale',
  'Медный жезл': 'copper-wand',
  'Изумрудный глаз': 'emerald-eye',
  'Клятвенный перстень': 'oath-ring',
  'Лунный рог': 'moon-horn',
  'Звёздная уздечка': 'star-bridle',
  'Колокольчик тишины': 'silence-bell',
  'Молот-гаситель': 'quench-hammer',
  'Печать торгового дома': 'house-seal',
  'Весы оценщика': 'appraiser-scales',
  'Фонарь перевозчика': 'carrier-lantern',
  'Ключ от ворот': 'gate-key',
  'Маска смеха': 'laughing-mask',
  'Чётки молчания': 'silence-beads',
  'Карта подземных троп': 'tunnel-map',
  'Книга долгов': 'debt-book',
  'Зеркало лжи': 'lying-mirror',
  'Лопата могильщика': 'gravedigger-shovel',
};

const RECIPE_KINDS = new Set<Item['kind']>(['potion', 'ward', 'focus', 'shape']);

/** Портрет роли: /assets/portraits/<key>.jpg. */
export function portraitUrl(roleKey: string): string {
  return `/assets/portraits/${roleKey}.jpg`;
}

/** Картинка предмета или undefined, если для него нет арта. Для изделий ref — id рецепта. */
export function itemImageUrl(item: Pick<Item, 'kind' | 'ref'>): string | undefined {
  let file: string | undefined;
  if (item.kind === 'relic') file = RELIC_SLUGS[item.ref] && `${RELIC_SLUGS[item.ref]}.jpg`;
  else if (item.kind === 'shard') file = 'shard.jpg';
  else if (item.kind === 'clue') file = `clue-${item.ref}.jpg`;
  else if (RECIPE_KINDS.has(item.kind)) file = `${item.ref}.jpg`;
  return file && `/assets/items/${file}`;
}

/** Монета и ингредиенты: /assets/items/<gold|ash|moon|dew>.jpg. */
export function resourceImageUrl(key: 'gold' | Ingredient): string {
  return `/assets/items/${key}.jpg`;
}
