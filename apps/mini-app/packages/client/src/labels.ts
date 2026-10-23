import type { Bundle, Ingredient, Item, PlayerView } from '@fair/shared';

export const INGREDIENTS: { key: Ingredient; name: string; short: string; emoji: string }[] = [
  { key: 'ash', name: 'Пепел феникса', short: 'пепел', emoji: '🔥' },
  { key: 'moon', name: 'Лунная пыль', short: 'пыль', emoji: '🌙' },
  { key: 'dew', name: 'Роса', short: 'роса', emoji: '💧' },
];
export const GOLD = { name: 'Золото', emoji: '🪙' };
export const SHOP_PRICE = 2;

const KIND_LABEL: Record<Item['kind'], string> = {
  relic: 'реликвия', shard: 'осколок сердца Сарна', clue: 'улика',
  potion: 'зелье', ward: 'оберег', focus: 'фокус', shape: 'форма',
};
export const kindLabel = (kind: Item['kind']) => KIND_LABEL[kind];

/** Название и эмодзи вещи по её виду и ref. */
export function itemLabel(item: Pick<Item, 'kind' | 'ref'>, v: PlayerView): { name: string; emoji: string } {
  switch (item.kind) {
    case 'relic': return { name: item.ref, emoji: '🏺' };
    case 'shard': return { name: `Осколок ${item.ref}`, emoji: '💠' };
    case 'clue': return { name: v.public.clues.find(c => c.id === item.ref)?.name ?? 'Улика', emoji: '🔍' };
    default: {
      const r = v.recipes.find(x => x.id === item.ref);
      return { name: r?.name ?? item.ref, emoji: r?.emoji ?? '🧪' };
    }
  }
}

/** Название вещи, если известен только ref (вклады на алтарях). */
export function refLabel(ref: string, v: PlayerView): { name: string; emoji: string } {
  if (v.public.shards.some(s => s.id === ref)) return itemLabel({ kind: 'shard', ref }, v);
  if (v.public.clues.some(c => c.id === ref)) return itemLabel({ kind: 'clue', ref }, v);
  if (v.recipes.some(r => r.id === ref)) return itemLabel({ kind: 'potion', ref }, v);
  return itemLabel({ kind: 'relic', ref }, v);
}

/** Имя роли по ключу: я, другие участники, контакты; иначе сам ключ. */
export function roleName(key: string, v: PlayerView): string {
  if (key === v.me.role.key) return v.me.role.name;
  return v.others.find(o => o.roleKey === key)?.name ?? v.contacts.find(c => c.role === key)?.name ?? key;
}
export function roleEmoji(key: string, v: PlayerView): string {
  if (key === v.me.role.key) return v.me.role.emoji;
  return v.others.find(o => o.roleKey === key)?.emoji ?? '🧭';
}

/** Состав набора текстом: «🪙 2 · 🔥 1 · Осколок II · слух». Чужие вещи не видны и показываются как «вещь». */
export function bundleText(b: Bundle, v: PlayerView): string {
  const parts: string[] = [];
  if (b.gold) parts.push(`${GOLD.emoji} ${b.gold}`);
  for (const ing of INGREDIENTS) if (b.ingredients[ing.key]) parts.push(`${ing.emoji} ${ing.name} ×${b.ingredients[ing.key]}`);
  for (const id of b.items) {
    const it = v.me.items.find(i => i.id === id);
    if (it) { const l = itemLabel(it, v); parts.push(`${l.emoji} ${l.name}`); } else parts.push('📦 вещь');
  }
  if (b.rumor) parts.push(`👂 слух: «${b.rumor}»`);
  return parts.length ? parts.join(' · ') : 'ничего';
}

export const emptyBundle = (): Bundle => ({ gold: 0, ingredients: { ash: 0, moon: 0, dew: 0 }, items: [] });

export function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
