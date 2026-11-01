import type { Bundle, HiddenOrder, HiddenStep, Item, PlayerView } from '@fair/shared';
import { itemImageUrl } from '../assets';
import { Thumb } from '../components/Thumb';
import { countsText, itemLabel, plainName, roleName } from '../labels';

export const SPECIAL_NAMES: Record<string, string> = {
  'blood-vial': 'Бутылёк крови', 'sealed-powder': 'Запечатанный порошок', 'inscribed-focus': 'Фокус с начертанными линиями', 'copper-vial': 'Сосуд с медным налётом', salt: 'Разрывная соль', sign: 'Управляющий знак', vessel: 'Отводящий сосуд',
  'shape-fixative': 'Закрепитель облика', 'inspection-lens': 'Осмотровая линза', 'herbal-incense': 'Травяной ладан',
};
export const ORDERS: { value: HiddenOrder; label: string }[] = [
  { value: 'leave', label: 'Покинуть заставу' }, { value: 'stay', label: 'Остаться до рассвета' },
  { value: 'restore', label: 'Один раз помочь восстановлению места' },
];
export const STEPS: Record<HiddenStep, string> = {
  preparation: 'Подготовка', assembly: '1 · Собраться у могилы', powder: '2 · Пыль и первый удар',
  choices: '3 · Слова возвращения', responses: '4 · Раскрытие и ответ', 'last-choice': '5 · Последний выбор', finished: 'Эпилог',
};
export const FAIR_STEPS: Record<HiddenStep, string> = { preparation: 'Подготовка', assembly: '1 · Сбор', powder: '2 · Пробуждение и вмешательства', choices: '2 · Пробуждение и вмешательства', responses: '3 · Раскрытие и ответы', 'last-choice': '4 · Последний выбор', finished: '4 · Исход' };
export const methodLabel = (method: string, fair: boolean) => method === 'sign' && fair ? 'Бутылёк крови' : SPECIAL_NAMES[method];
type NamedItem = Pick<Item, 'kind' | 'ref'> & { id?: string; bloodDonor?: string };
const isBloodVial = (it: NamedItem, v: PlayerView) => it.ref === 'blood-vial' ||
  !!(v.hidden17?.fair && it.id && v.hidden17.prepared[it.id]?.method === 'sign' && !v.hidden17.prepared[it.id]?.order);
export function bloodMarkLabel(it: NamedItem, v: PlayerView): string | undefined {
  if (!isBloodVial(it, v)) return;
  const donor = it.bloodDonor ?? (it.id ? v.hidden17?.prepared[it.id]?.controller ?? v.hidden17?.knownItems[it.id]?.bloodDonor : undefined);
  return donor ? `Отметка: ${plainName(donor, v)}` : undefined;
}
export const specialLabel = (it: NamedItem, v: PlayerView) => {
  if (isBloodVial(it, v)) { const mark = bloodMarkLabel(it, v); return `Бутылёк крови${mark ? ` · ${mark}` : ''}`; }
  return SPECIAL_NAMES[it.ref] ?? itemLabel(it, v).name;
};
export function SpecialItemName({ item, v }: { item: NamedItem; v: PlayerView }) {
  const mark = bloodMarkLabel(item, v);
  return <span class="special-item-name"><span>{isBloodVial(item, v) ? 'Бутылёк крови' : specialLabel(item, v)}</span>{mark && <small class="blood-donor-mark">{mark}</small>}</span>;
}
export function HiddenItem({ item, v }: { item: Pick<Item, 'kind' | 'ref'> & { id?: string }; v: PlayerView }) {
  return <span class="hidden-item"><Thumb src={itemImageUrl(item)} emoji={item.kind === 'special' ? '✦' : itemLabel(item, v).emoji} size="sm" /><SpecialItemName item={item} v={v}/></span>;
}
export function Reward({ reward, service, v }: { reward: Bundle; service?: string; v: PlayerView }) {
  const count = countsText(reward);
  return <div class="reward"><b>Награда</b>{count && <span>{count}</span>}{reward.items.map(id => {
    const item = v.me.items.find(i => i.id === id) ?? v.hidden17?.knownItems[id];
    return item ? <HiddenItem key={id} item={item} v={v} /> : <span key={id}>Предъявленная вещь</span>;
  })}{service && <span>Услуга: {service}</span>}{!count && !reward.items.length && !service && <span>По договорённости, без материальной награды</span>}</div>;
}
export const people = (v: PlayerView, self = true) => [
  ...(self ? [{ value: v.me.role.key, label: `${v.me.role.name} (вы)`, avatar: v.me.role.key }] : []),
  ...v.others.map(p => ({ value: p.roleKey, label: roleName(p.roleKey, v), avatar: p.roleKey })),
];
