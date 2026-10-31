import type { Bundle, HiddenOrder, HiddenStep, Item, PlayerView } from '@fair/shared';
import { itemImageUrl } from '../assets';
import { Thumb } from '../components/Thumb';
import { countsText, itemLabel, roleName } from '../labels';

export const SPECIAL_NAMES: Record<string, string> = {
  'sealed-powder': 'Запечатанный порошок', 'inscribed-focus': 'Фокус с начертанными линиями', 'copper-vial': 'Сосуд с медным налётом', salt: 'Разрывная соль', sign: 'Управляющий знак', vessel: 'Отводящий сосуд',
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
export const specialLabel = (it: Pick<Item, 'kind' | 'ref'>, v: PlayerView) => SPECIAL_NAMES[it.ref] ?? itemLabel(it, v).name;
export function HiddenItem({ item, v }: { item: Pick<Item, 'kind' | 'ref'>; v: PlayerView }) {
  return <span class="hidden-item"><Thumb src={itemImageUrl(item)} emoji={item.kind === 'special' ? '✦' : itemLabel(item, v).emoji} size="sm" />{specialLabel(item, v)}</span>;
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
