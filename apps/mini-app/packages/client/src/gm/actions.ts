import type { ActionRecord, ConsentRequest, ContentData, Effect, GmView, Intel, Player } from '@fair/shared';
import { abilityTitle, goldText, ingredientName, nameCase, plural, roman } from '../labels';

const ITEM_TITLE: Record<'potion' | 'ward' | 'shape', string> = { potion: 'Очищающее зелье', ward: 'Защитный талисман', shape: 'Камень облика' };

const two = (n: number) => String(n).padStart(2, '0');
/** Местное время записи «12:40». */
const hhmm = (ms: number) => { const d = new Date(ms); return `${two(d.getHours())}:${two(d.getMinutes())}`; };

const roleName = (key: string, c: ContentData) => c.roles.find(r => r.key === key)?.name ?? (key === 'gm' ? 'ведущий' : key);

/** «Шипы отражены», «Ловкая рука отражена», «Взыскание отражено», «Досмотр отражён». */
function blockedVerb(title: string): string {
  const last = title.split(' ').pop() ?? title;
  if (/[ыи]$/.test(last)) return 'отражены';
  if (/[аяь]$/.test(last)) return 'отражена';
  if (/[еоё]$/.test(last)) return 'отражено';
  return 'отражён';
}

/**
 * Кто дал защиту, которую сняла заблокированная попытка: проходим журнал акта до записи
 * и повторяем эффекты защиты. Нет записи — защиту поставил ведущий исправлением.
 */
function protectorOf(a: ActionRecord, v: GmView, c: ContentData): string {
  const holders: Record<string, Player['protection']> = {};
  for (const r of v.state.actions) {
    if (r.id === a.id) break;
    if (r.act !== a.act) continue;
    for (const e of r.effects) {
      if (e.type === 'protection') holders[e.player] = e.value ?? undefined;
      else if (e.type === 'protectionMoved') { holders[e.to] = holders[e.from]; holders[e.from] = undefined; }
    }
  }
  const p = a.target !== undefined ? holders[a.target] : undefined;
  if (!p || p.source === 'gm') return 'от ведущего';
  if (p.source === 'ward') return 'от талисмана';
  return `от ${nameCase(roleName(p.by, c), 'gen')}`;
}

const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

/** Суть одного эффекта словами; null — не показывать (служебный эффект). */
function effectText(e: Effect, c: ContentData): string | null {
  switch (e.type) {
    case 'goldMove': return goldText(e.amount);
    case 'gold': return `${signed(e.delta)} ${plural(Math.abs(e.delta), 'золотой', 'золотых', 'золотых')}`;
    case 'ingredientMove': return ingredientName(e.ingredient);
    case 'ingredient': return `${ingredientName(e.ingredient)} ${signed(e.delta)}`;
    case 'workshop': return null;
    case 'itemRemoved': return null;
    case 'itemCreated': return `вещь ${c.recipes.find(r => r.id === e.item.ref)?.name ?? e.item.ref}`;
    case 'protection': return e.value ? 'защита' : 'защита снята';
    case 'protectionMoved': return 'защита перенесена';
    case 'thorns': return e.value ? 'шипы' : null;
    case 'curse': return e.value ? 'проклятие' : null;
    case 'discount': return e.value ? 'скидка' : null;
    case 'guise': return e.value ? `облик «${e.value.name}»` : 'облик снят';
  }
}

function intelText(i: Intel, c: ContentData): string {
  switch (i.kind) {
    case 'inventory': return `сумка: ${goldText(i.gold)}, ${i.items.length} вещ.`;
    case 'gold': return `золото: ${i.gold}`;
    case 'side': return `сторона: ${c.factions.find(f => f.id === i.side)?.name ?? i.side}`;
    case 'sniff': return `у кого: ${i.holders.length ? i.holders.map(k => roleName(k, c)).join(', ') : 'ни у кого'}`;
    case 'question': return i.question ? `вопрос «${i.question}»` : 'вопрос голосом';
  }
}

/** Что сняло очищение: «сняты проклятие и шипы», «снимать нечего». */
function removedText(r: NonNullable<ActionRecord['removed']>): string {
  const parts = [r.curse ? 'проклятие' : '', r.thorns ? 'шипы' : ''].filter(Boolean);
  if (!parts.length) return 'снимать нечего';
  return `${parts.length > 1 || r.thorns ? 'сняты' : 'снято'} ${parts.join(' и ')}`;
}

/** Название вещи по виду и ref из содержимого: реликвия по имени, осколок по номеру, улика и изделия по id. */
function itemName(item: NonNullable<ActionRecord['item']>, c: ContentData): string {
  switch (item.kind) {
    case 'relic': return item.ref;
    case 'shard': return `Осколок ${item.ref}`;
    case 'clue': return c.clues?.find(x => x.id === item.ref)?.name ?? 'улика';
    default: return c.recipes?.find(r => r.id === item.ref)?.name ?? item.ref;
  }
}

/**
 * Строка журнала применений на пульте: «Акт II, 12:40. Никс → Брам: Ловкая рука, 1 золотой».
 * Содержимое приходит отдельным сообщением при подключении, поэтому передаётся рядом с проекцией.
 */
export function actionLine(a: ActionRecord, v: GmView, c: ContentData): string {
  const who = a.from !== undefined && a.to !== undefined
    ? `${roleName(a.author, c)}: ${roleName(a.from, c)} → ${roleName(a.to, c)}`
    : a.target !== undefined && a.target !== a.author ? `${roleName(a.author, c)} → ${roleName(a.target, c)}` : roleName(a.author, c);
  let title = a.source.type === 'item' ? ITEM_TITLE[a.source.kind]
    : a.source.copied ? `${v.abilities[a.author]?.name ?? abilityTitle(a.source.ability)} (${abilityTitle(a.source.copied)})`
      : v.abilities[a.author]?.name ?? abilityTitle(a.source.ability);
  const head = `Акт ${roman(a.act)}, ${hhmm(a.at)}. ${who}: `;
  // Вещь способности (§5.2): «Перековка: Защитный талисман»; созданная вещь из эффектов тогда не повторяется.
  if (a.item) title = `${title}: ${itemName(a.item, c)}`;
  if (a.outcome === 'blocked') return `${head}${title} ${blockedVerb(title)} защитой (${protectorOf(a, v, c)})`;
  const parts: string[] = [];
  if (a.removed) parts.push(removedText(a.removed));
  else for (const e of a.effects) {
    if (a.item && e.type === 'itemCreated') continue;
    const t = effectText(e, c);
    if (t && !parts.includes(t)) parts.push(t);
  }
  if (a.intel) parts.push(intelText(a.intel, c));
  return `${head}${[title, ...parts].join(', ')}`;
}

/** Журнал для пульта: новые сверху; «только враждебные» и игрок (автор, цель или участник переноса). */
export function filterActions(actions: ActionRecord[], f: { hostileOnly?: boolean; player?: string }): ActionRecord[] {
  return actions
    .filter(a => !f.hostileOnly || a.hostile)
    .filter(a => !f.player || a.author === f.player || a.target === f.player || a.from === f.player || a.to === f.player)
    .slice()
    .reverse();
}

/** Открытая просьба для пульта: «Ада → Грета: Изгнание», «Брам → Грета: Очищающее зелье». */
export function requestLine(r: ConsentRequest, v: GmView, c: ContentData): string {
  const a = r.action;
  const author = roleName(r.author, c);
  if (a.type === 'item') {
    // Вид вещи по рецепту; облик бывает только у Камня.
    const shape = a.guise !== undefined || v.state.items?.[a.itemId]?.ref === 'shape';
    const title = shape ? `${ITEM_TITLE.shape}${a.guise ? ` «${a.guise}»` : ''}` : ITEM_TITLE.potion;
    return `${author}${a.target !== r.author ? ` → ${roleName(a.target, c)}` : ''}: ${title}`;
  }
  const u = a.use;
  const inner = u.kind === 'copyAbility' ? u.copy : u;
  const name = v.abilities[r.author]?.name ?? abilityTitle(u.kind);
  const title = u.kind === 'copyAbility' ? `${name} (${abilityTitle(u.copy.kind)})` : name;
  const who = inner.kind === 'transferProtection' ? `${author}: ${roleName(inner.from, c)} → ${roleName(inner.to, c)}`
    : 'target' in inner && inner.target !== r.author ? `${author} → ${roleName(inner.target, c)}` : author;
  return `${who}: ${title}`;
}
