import { tab, type Tab } from '../store';

export const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'role', label: 'Роль', icon: '🎭' },
  { key: 'bag', label: 'Сумка', icon: '🎒' },
  { key: 'trades', label: 'Сделки', icon: '🤝' },
  { key: 'workshop', label: 'Мастерская', icon: '⚗️' },
  { key: 'altars', label: 'Алтари', icon: '🕯️' },
  { key: 'events', label: 'События', icon: '📜' },
];

/** Нижняя панель вкладок; badges — число на значке вкладки (например, входящие сделки). */
export function Tabs({ badges = {} }: { badges?: Partial<Record<Tab, number>> }) {
  return (
    <nav class="tabs">
      {TABS.map(t => (
        <button type="button" key={t.key} class={tab.value === t.key ? 'on' : ''} onClick={() => { tab.value = t.key; }}>
          <i>{t.icon}{badges[t.key] ? <em class="badge">{badges[t.key]}</em> : null}</i>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
