import type { ActionRecord, ConsentRequest, Effect, GmView, Intel, Player } from '@fair/shared';
import { abilityTitle, ingredientName, nameCase, roman } from '../labels';

const ITEM_TITLE: Record<'potion' | 'ward' | 'shape', string> = { potion: 'Очищающее зелье', ward: 'Защитный талисман', shape: 'Камень облика' };

const two = (n: number) => String(n).padStart(2, '0');
/** Местное время записи «12:40». */
const hhmm = (ms: number) => { const d = new Date(ms); return `${two(d.getHours())}:${two(d.getMinutes())}`; };

const roleName = (key: string, v: GmView) => v.content.roles.find(r => r.key === key)?.name ?? (key === 'gm' ? 'ведущий' : key);

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
function protectorOf(a: ActionRecord, v: GmView): string {
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
  return `от ${nameCase(roleName(p.by, v), 'gen')}`;
}

const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

/** Суть одного эффекта словами; null — не показывать (служебный эффект). */
function effectText(e: Effect, v: GmView): string | null {
  switch (e.type) {
    case 'goldMove': return `${e.amount} золото`;
    case 'gold': return `${signed(e.delta)} золото`;
    case 'ingredientMove': return ingredientName(e.ingredient);
    case 'ingredient': return `${ingredientName(e.ingredient)} ${signed(e.delta)}`;
    case 'workshop': return null;
    case 'itemRemoved': return null;
    case 'itemCreated': return `вещь ${v.content.recipes.find(r => r.id === e.item.ref)?.name ?? e.item.ref}`;
    case 'protection': return e.value ? 'защита' : 'защита снята';
    case 'protectionMoved': return 'защита перенесена';
    case 'thorns': return e.value ? 'шипы' : null;
    case 'curse': return e.value ? 'проклятие' : null;
    case 'discount': return e.value ? 'скидка' : null;
    case 'guise': return e.value ? `облик «${e.value.name}»` : 'облик снят';
  }
}

function intelText(i: Intel, v: GmView): string {
  switch (i.kind) {
    case 'inventory': return `сумка: ${i.gold} золото, ${i.items.length} вещ.`;
    case 'gold': return `золото: ${i.gold}`;
    case 'side': return `сторона: ${v.content.factions.find(f => f.id === i.side)?.name ?? i.side}`;
    case 'sniff': return `у кого: ${i.holders.length ? i.holders.map(k => roleName(k, v)).join(', ') : 'ни у кого'}`;
    case 'question': return i.question ? `вопрос «${i.question}»` : 'вопрос голосом';
  }
}

/** Что сняло очищение: «сняты проклятие и шипы», «снимать нечего». */
function removedText(r: NonNullable<ActionRecord['removed']>): string {
  const parts = [r.curse ? 'проклятие' : '', r.thorns ? 'шипы' : ''].filter(Boolean);
  if (!parts.length) return 'снимать нечего';
  return `${parts.length > 1 || r.thorns ? 'сняты' : 'снято'} ${parts.join(' и ')}`;
}

/** Строка журнала применений на пульте: «Акт II, 12:40. Никс → Брам: Ловкая рука, 1 золото». */
export function actionLine(a: ActionRecord, v: GmView): string {
  const who = a.from !== undefined && a.to !== undefined
    ? `${roleName(a.author, v)}: ${roleName(a.from, v)} → ${roleName(a.to, v)}`
    : a.target !== undefined && a.target !== a.author ? `${roleName(a.author, v)} → ${roleName(a.target, v)}` : roleName(a.author, v);
  const title = a.source.type === 'item' ? ITEM_TITLE[a.source.kind]
    : a.source.copied ? `${v.abilities[a.author]?.name ?? abilityTitle(a.source.ability)} (${abilityTitle(a.source.copied)})`
      : v.abilities[a.author]?.name ?? abilityTitle(a.source.ability);
  const head = `Акт ${roman(a.act)}, ${hhmm(a.at)}. ${who}: `;
  if (a.outcome === 'blocked') return `${head}${title} ${blockedVerb(title)} защитой (${protectorOf(a, v)})`;
  const parts: string[] = [];
  if (a.removed) parts.push(removedText(a.removed));
  else for (const e of a.effects) { const t = effectText(e, v); if (t && !parts.includes(t)) parts.push(t); }
  if (a.intel) parts.push(intelText(a.intel, v));
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
export function requestLine(r: ConsentRequest, v: GmView): string {
  const a = r.action;
  const author = roleName(r.author, v);
  if (a.type === 'item') {
    // Вид вещи по рецепту; облик бывает только у Камня.
    const shape = a.guise !== undefined || v.state.items?.[a.itemId]?.ref === 'shape';
    const title = shape ? `${ITEM_TITLE.shape}${a.guise ? ` «${a.guise}»` : ''}` : ITEM_TITLE.potion;
    return `${author}${a.target !== r.author ? ` → ${roleName(a.target, v)}` : ''}: ${title}`;
  }
  const u = a.use;
  const inner = u.kind === 'copyAbility' ? u.copy : u;
  const name = v.abilities[r.author]?.name ?? abilityTitle(u.kind);
  const title = u.kind === 'copyAbility' ? `${name} (${abilityTitle(u.copy.kind)})` : name;
  const who = inner.kind === 'transferProtection' ? `${author}: ${roleName(inner.from, v)} → ${roleName(inner.to, v)}`
    : 'target' in inner && inner.target !== r.author ? `${author} → ${roleName(inner.target, v)}` : author;
  return `${who}: ${title}`;
}
