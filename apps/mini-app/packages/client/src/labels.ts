import type { Bundle, Ingredient, Item, PlayerView, Want } from '@fair/shared';

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

/** Вид вещи, если известен только ref (вклады на алтарях). Для изделий — любой вид рецепта. */
export function refKind(ref: string, v: PlayerView): Item['kind'] {
  if (v.public.shards.some(s => s.id === ref)) return 'shard';
  if (v.public.clues.some(c => c.id === ref)) return 'clue';
  if (v.recipes.some(r => r.id === ref)) return 'potion';
  return 'relic';
}

/** Название вещи, если известен только ref (вклады на алтарях). */
export function refLabel(ref: string, v: PlayerView): { name: string; emoji: string } {
  return itemLabel({ kind: refKind(ref, v), ref }, v);
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

/** Вид и ref вещи по id: своя вещь или вещь из моего предложения; иначе undefined (вещь не видна). */
export function offerItem(id: string, v: PlayerView): Pick<Item, 'kind' | 'ref'> | undefined {
  return v.me.items.find(i => i.id === id) ?? v.offerItems?.[id];
}

/** Золото и ингредиенты словами: «2 золотых, 1 пепел, 1 роса». */
export function countsText(c: { gold?: number; ingredients?: Partial<Record<Ingredient, number>> }): string {
  const parts: string[] = [];
  if (c.gold) parts.push(goldText(c.gold));
  for (const ing of INGREDIENTS) { const n = c.ingredients?.[ing.key]; if (n) parts.push(`${n} ${ing.short}`); }
  return parts.join(', ');
}

/** Состав набора словами: «2 золотых, 1 пепел, Осколок II, слух: «…»». Невидимые вещи показываются как «вещь». */
export function bundleText(b: Bundle, v: PlayerView): string {
  const parts: string[] = [];
  const counts = countsText(b);
  if (counts) parts.push(counts);
  for (const id of b.items) {
    const it = offerItem(id, v);
    parts.push(it ? itemLabel(it, v).name : 'вещь');
  }
  for (const w of b.wants ?? []) parts.push(itemLabel(w, v).name);
  if (b.rumor) parts.push(`слух: «${b.rumor}»`);
  return parts.length ? parts.join(', ') : 'ничего';
}

export const emptyBundle = (): Bundle => ({ gold: 0, ingredients: { ash: 0, moon: 0, dew: 0 }, items: [] });

export function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Форма слова по числу: plural(2, 'золотой', 'золотых', 'золотых'). */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}
export const goldText = (n: number) => `${n} ${plural(n, 'золотой', 'золотых', 'золотых')}`;

/** Римские цифры для номеров карт и актов (1–39 хватает с запасом). */
export function roman(n: number): string {
  const parts: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  let rest = Math.max(0, Math.floor(n));
  for (const [v, s] of parts) while (rest >= v) { out += s; rest -= v; }
  return out;
}

/** Набор словами без эмодзи — для рукописной строки формы: «2 золотых, пепел ×1, Фокус силы». */
export function bundleWords(b: Bundle, v: PlayerView): string {
  const parts: string[] = [];
  if (b.gold) parts.push(goldText(b.gold));
  for (const ing of INGREDIENTS) if (b.ingredients[ing.key]) parts.push(`${ing.short} ×${b.ingredients[ing.key]}`);
  for (const id of b.items) {
    const it = offerItem(id, v);
    parts.push(it ? itemLabel(it, v).name : 'вещь');
  }
  for (const w of b.wants ?? []) parts.push(itemLabel(w, v).name);
  if (b.rumor?.trim()) parts.push('слух');
  return parts.join(', ');
}

/** Вид изделия по рецепту: копия KIND_BY_RECIPE из engine/shop.ts (клиент берёт из shared только типы). */
const KIND_BY_RECIPE: Record<string, Item['kind']> = { cleanse: 'potion', ward: 'ward', focus: 'focus', shape: 'shape' };

/** Каталог вещей, которые можно попросить по названию: реликвии, осколки, улики, изделия. */
export function wantCatalog(v: PlayerView): (Want & { name: string; emoji: string; group: string })[] {
  const out: (Want & { name: string; emoji: string; group: string })[] = [];
  for (const r of v.public.relics) out.push({ kind: 'relic', ref: r.name, name: r.name, emoji: r.emoji, group: 'Реликвии' });
  for (const s of v.public.shards) out.push({ kind: 'shard', ref: s.id, name: `Осколок ${s.id}`, emoji: '💠', group: 'Осколки' });
  for (const c of v.public.clues) out.push({ kind: 'clue', ref: c.id, name: c.name, emoji: c.emoji, group: 'Улики' });
  for (const r of v.recipes) out.push({ kind: KIND_BY_RECIPE[r.id] ?? 'potion', ref: r.id, name: r.name, emoji: r.emoji, group: 'Изделия' });
  return out;
}

/** Название лота: вещи через « + », например «Осколок IV + Обрывок договора». */
export const lotTitle = (items: Pick<Item, 'kind' | 'ref'>[], v: PlayerView) => items.map(i => itemLabel(i, v).name).join(' + ');
