import type { AbilityKind, ActionRecord, Bundle, ConsentRequestView, CopyableKind, Ingredient, Item, PlayerView, Want } from '@fair/shared';

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

/** Имя роли по ключу без облика: я, другие участники, контакты; иначе сам ключ. */
export function plainName(key: string, v: PlayerView): string {
  if (key === v.me.role.key) return v.me.role.name;
  return v.others.find(o => o.roleKey === key)?.name ?? v.contacts.find(c => c.role === key)?.name ?? key;
}

/** Имя роли для списков: у участника в облике Камня — «облик (имя)». */
export function roleName(key: string, v: PlayerView): string {
  const guise = v.others.find(o => o.roleKey === key)?.guise;
  return guise ? `${guise} (${plainName(key, v)})` : plainName(key, v);
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

// ——— Этап 3: способности, вещи, просьбы, уведомления ———

export type NameCase = 'gen' | 'dat' | 'acc';
/** Имена, которые не склоняются по общему правилу (беглая гласная). */
const NAME_CASES: Record<string, Record<NameCase, string>> = {
  'Бубен': { gen: 'Бубна', dat: 'Бубну', acc: 'Бубна' },
};
const HUSHING = /[гкхжшчщ]$/;

/** Склонение слова-имени: «Ива» → «Ивы», «Корвин» → «Корвину». Остальные окончания не меняются. */
function declineWord(w: string, c: NameCase): string {
  if (NAME_CASES[w]) return NAME_CASES[w][c];
  if (/[ая]$/.test(w)) {
    const stem = w.slice(0, -1);
    if (c === 'dat') return `${stem}е`;
    if (c === 'acc') return `${stem}${w.endsWith('я') ? 'ю' : 'у'}`;
    return `${stem}${HUSHING.test(stem) || w.endsWith('я') ? 'и' : 'ы'}`;
  }
  if (/[бвгджзклмнпрстфхцчшщ]$/.test(w)) return `${w}${c === 'dat' ? 'у' : 'а'}`;
  return w;
}

/** Имя в падеже для подтверждений и уведомлений; в «Магда Вейн» склоняется только имя. */
export function nameCase(name: string, c: NameCase): string {
  const [first, ...rest] = name.split(' ');
  if (rest.length === 0) return declineWord(first, c);
  if (isFemaleName(name)) return [declineWord(first, c), ...rest].join(' ');
  return [first, ...rest].map(w => declineWord(w, c)).join(' ');
}

/** Пола в содержимом нет: имена на -а/-я считаются женскими (Ада, Хельга, Клёпа). */
export const isFemaleName = (name: string) => /[ая]$/.test(name.split(' ')[0]);
/** Глагол прошедшего времени по имени: verb('Ада', 'дал', 'дала'). */
const verb = (name: string, m: string, f: string) => (isFemaleName(name) ? f : m);

/** Ингредиенты в винительном падеже: «взять Лунную пыль». */
const ING_ACC: Record<Ingredient, string> = { ash: 'Пепел феникса', moon: 'Лунную пыль', dew: 'Росу' };
export const ingredientAcc = (i: Ingredient) => ING_ACC[i];
export const ingredientName = (i: Ingredient) => INGREDIENTS.find(x => x.key === i)?.name ?? i;

/** Короткое название способности по виду: для просьб, журнала и пульта. */
const ABILITY_TITLE: Record<AbilityKind, string> = {
  payAshWithGold: 'Пепел за золото', focusFree: 'Фокус без платы за работу', substituteIngredient: 'Замена ингредиента',
  buyCheap: 'Покупка за 1', buyBulk: 'Покупка оптом', buyFromBank: 'Покупка из банка',
  grow: 'Рост', swapIngredient: 'Обмен ингредиента', disassemble: 'Разбор вещи', reforge: 'Перековка', sellToBank: 'Продажа банку',
  protectSelf: 'Защита себе', protectOther: 'Защита', transferProtection: 'Перенос защиты',
  cleanseOther: 'Очищение', discountOther: 'Скидка', copyAbility: 'Копия способности',
  stealGold: 'Кража золота', stealIngredient: 'Кража ингредиента', thorns: 'Шипы',
  inspectInventory: 'Осмотр сумки', sniffIngredient: 'Нюх на товар', knowGold: 'Оценка золота',
  askSide: 'Вопрос о стороне', askYesNo: 'Вопрос о целях',
};
export const abilityTitle = (kind: AbilityKind) => ABILITY_TITLE[kind];

/**
 * Описание применения словами: «Перенос защиты: Эльмар → Серафина», «Шипы → Грета».
 * copied: вид, который скопировала Астра.
 */
export function abilityText(
  kind: AbilityKind, p: { target?: string; from?: string; to?: string; copied?: CopyableKind }, v: PlayerView,
): string {
  const title = p.copied ? `${ABILITY_TITLE.copyAbility}: ${ABILITY_TITLE[p.copied]}` : ABILITY_TITLE[kind];
  const me = v.me.role.key;
  const who = (k: string) => (k === me ? 'вы' : roleName(k, v));
  if (p.from !== undefined && p.to !== undefined) return `${title}: ${who(p.from)} → ${who(p.to)}`;
  if (p.target !== undefined) return `${title} → ${who(p.target)}`;
  return title;
}

const ITEM_TITLE: Record<'potion' | 'ward' | 'shape', string> = { potion: 'Очищающее зелье', ward: 'Защитный талисман', shape: 'Камень облика' };

/** Что снято очищением: «проклятие и шипы», «шипы»; null — снимать было нечего. */
function removedText(r: ActionRecord['removed']): string | null {
  const parts = [r?.curse ? 'проклятие' : '', r?.thorns ? 'шипы' : ''].filter(Boolean);
  return parts.length ? parts.join(' и ') : null;
}

/** Своя запись журнала: «Акт I. Шипы → Грета: отражено защитой». */
export function ownActionText(a: ActionRecord, v: PlayerView): string {
  const head = a.source.type === 'ability'
    ? abilityText(a.source.ability, { target: a.target !== a.author ? a.target : undefined, from: a.from, to: a.to, copied: a.source.copied }, v)
    : `${ITEM_TITLE[a.source.kind]}${a.target && a.target !== a.author ? ` → ${roleName(a.target, v)}` : ''}${a.guise ? `: «${a.guise}»` : ''}`;
  return `Акт ${roman(a.act)}. ${head}: ${a.outcome === 'blocked' ? 'отражено защитой' : 'исполнено'}`;
}

/**
 * Уведомление о чужом действии, где я цель или участник переноса (§7.5).
 * Имена без облика: так проще читать и склонять. Своё действие — строка журнала.
 */
export function actionText(a: ActionRecord, v: PlayerView): string {
  const me = v.me.role.key;
  if (a.author === me) return ownActionText(a, v);
  const n = plainName(a.author, v);
  if (a.outcome === 'blocked') return `Ваша защита отразила попытку ${nameCase(n, 'gen')}`;
  if (a.source.type === 'item') {
    if (a.source.kind === 'shape') return `${n} ${verb(n, 'дал', 'дала')} вам облик «${a.guise ?? ''}»`;
    const what = removedText(a.removed);
    return what ? `${n} ${verb(n, 'снял', 'сняла')} с вас ${what} зельем` : `${n} ${verb(n, 'дал', 'дала')} вам зелье: снимать было нечего`;
  }
  const kind = a.source.copied ?? a.source.ability;
  switch (kind) {
    case 'stealGold': return `${n} ${verb(n, 'забрал', 'забрала')} у вас 1 золото`;
    case 'stealIngredient': {
      const ing = a.effects.find(e => e.type === 'ingredientMove');
      return `${n} ${verb(n, 'забрал', 'забрала')} у вас ${ing?.type === 'ingredientMove' ? ingredientAcc(ing.ingredient) : 'ингредиент'}`;
    }
    case 'thorns': return `${n} ${verb(n, 'наложил', 'наложила')} на вас шипы: следующее изготовление дороже`;
    case 'protectOther': return `${n} ${verb(n, 'дал', 'дала')} вам защиту до конца акта`;
    case 'cleanseOther': {
      const what = removedText(a.removed);
      return what ? `${n} ${verb(n, 'снял', 'сняла')} с вас ${what}` : `${n} ${verb(n, 'провёл', 'провела')} очищение: снимать было нечего`;
    }
    case 'discountOther': return `${n} ${verb(n, 'дал', 'дала')} вам скидку на следующее изготовление`;
    case 'transferProtection':
      return a.to === me
        ? `${n} ${verb(n, 'перенёс', 'перенесла')} на вас защиту до конца акта`
        : `${n} ${verb(n, 'перенёс', 'перенесла')} вашу защиту: теперь она у ${nameCase(plainName(a.to ?? '', v), 'gen')}`;
    case 'inspectInventory': return `${n} ${verb(n, 'осмотрел', 'осмотрела')} вашу сумку`;
    case 'knowGold': return `${n} ${verb(n, 'узнал', 'узнала')} ваше золото`;
    case 'askSide': return `${n} ${verb(n, 'узнал', 'узнала')} вашу сторону`;
    case 'askYesNo': return `${n} задаёт вопрос о ваших целях. Ответьте честно, голосом`;
    default: return `${n}: ${abilityTitle(kind)}`;
  }
}

/** Просьба словами с точки зрения читателя: автору — что он просит, одобряющему — что с ним сделают. */
export function requestText(r: ConsentRequestView, v: PlayerView): string {
  const me = v.me.role.key;
  const a = r.action;
  if (a.type === 'item') {
    const title = ITEM_TITLE[a.kind];
    if (a.target !== me) return `${title} → ${roleName(a.target, v)}${a.guise ? `: «${a.guise}»` : ''}`;
    return a.kind === 'shape' ? `${title}: ваш облик станет «${a.guise ?? ''}»` : `${title} на вас: снимет проклятие и шипы`;
  }
  if (r.author === me) return abilityText(a.ability, a, v);
  const kind = a.copied ?? a.ability;
  const parts: string[] = [];
  if (a.copied) parts.push(`копия способности «${ABILITY_TITLE[a.copied]}»`);
  if (kind === 'cleanseOther' && a.target === me) parts.push('очищение: снимет с вас проклятие и шипы');
  else if (kind === 'discountOther' && a.target === me) parts.push('скидка −1 золото на ваше следующее изготовление');
  else if (kind === 'transferProtection' && a.from === me) parts.push(`отдать вашу защиту: получит ${roleName(a.to ?? '', v)}`);
  else if (!a.copied) parts.push(abilityText(a.ability, a, v));
  const text = parts.join('; ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Кто из одобряющих ещё не ответил. */
export const waitingFor = (r: ConsentRequestView) => r.approvers.filter(k => !r.approved.includes(k));

/** Итог своей просьбы для уведомления автору (§7.5); null — показывать нечего. */
export function requestOutcomeText(r: ConsentRequestView, v: PlayerView): string | null {
  const names = r.approvers.map(k => plainName(k, v));
  const first = names[0] ?? '';
  const many = names.length > 1;
  switch (r.status) {
    case 'accepted': {
      const rec = v.actions.find(x => x.requestId === r.id);
      const what = rec && (rec.source.type === 'item' ? rec.source.kind === 'potion' : (rec.source.copied ?? rec.source.ability) === 'cleanseOther')
        ? removedText(rec.removed) : undefined;
      const tail = what === undefined ? '' : what ? `: ${what} ${what === 'проклятие' ? 'снято' : 'сняты'}` : ': снимать было нечего';
      return `${names.join(', ')} ${many ? 'согласились' : verb(first, 'согласился', 'согласилась')}${tail}`;
    }
    // Кто именно из нескольких отказал, проекция не знает: без имён.
    case 'declined': return many ? 'Просьба отклонена' : `${first} ${verb(first, 'отказался', 'отказалась')}`;
    case 'expired': return r.reason === 'act' ? 'Просьба закрыта: акт закончился' : `Просьба к ${names.map(n => nameCase(n, 'dat')).join(', ')} истекла`;
    case 'failed': return `Не выполнено: ${r.reason ?? 'условия изменились'}`;
    // Свою отмену автор видит сам; уведомляем только об отмене ведущим.
    case 'cancelled': return r.reason === 'gm' ? 'Ведущий отменил вашу просьбу' : null;
    default: return null;
  }
}

/** Отметки на игроке словами для блока «На вас действует». */
export function marksText(v: PlayerView): { label: string; value: string }[] {
  const p = v.me.player;
  const out: { label: string; value: string }[] = [];
  if (p.protection) {
    const src = p.protection.source === 'ward' ? 'от талисмана' : p.protection.source === 'gm' ? 'от ведущего' : `от ${nameCase(plainName(p.protection.by, v), 'gen')}`;
    out.push({ label: 'Защита', value: `${src}, до конца акта` });
  }
  if (p.thorns) out.push({ label: 'Шипы: следующее изготовление на 1 золото дороже', value: p.thornsBy ? `от ${nameCase(plainName(p.thornsBy, v), 'gen')}` : '' });
  if (p.discount) out.push({ label: 'Скидка: следующее изготовление на 1 золото дешевле', value: p.discountBy ? `от ${nameCase(plainName(p.discountBy, v), 'gen')}` : '' });
  if (p.curse) out.push({ label: 'Проклятие', value: 'снимается только очищением' });
  if (p.guise) out.push({ label: 'Облик', value: p.guise.name });
  return out;
}
