import { tab, type Tab } from '../store';

/** U+FE0E просит текстовое начертание символа, а не цветной эмодзи. */
const T = '︎';

export const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'role', label: 'Роль', icon: `☉${T}` },
  { key: 'bag', label: 'Сумка', icon: `⚱${T}` },
  { key: 'trades', label: 'Сделки', icon: `⚖${T}` },
  { key: 'workshop', label: 'Мастерская', icon: `⚗${T}` },
  { key: 'altars', label: 'Алтари', icon: `✠${T}` },
  { key: 'events', label: 'События', icon: `☽${T}` },
];

/**
 * Нижняя панель вкладок; badges — число на значке вкладки (входящие сделки и просьбы),
 * dots — точка без числа (способность доступна, новая отметка в сумке).
 */
export function Tabs({ badges = {}, dots = [] }: { badges?: Partial<Record<Tab, number>>; dots?: Tab[] }) {
  return (
    <nav class="tabs">
      <div class="tabs-in">
        {TABS.map(t => (
          <button type="button" key={t.key} class={tab.value === t.key ? 'on' : ''} aria-current={tab.value === t.key ? 'page' : undefined}
            onClick={() => { tab.value = t.key; }}>
            <i aria-hidden="true">{t.icon}{badges[t.key] ? <em class="badge">{badges[t.key]}</em> : dots.includes(t.key) ? <em class="badge dot-only" aria-label="есть новое" /> : null}</i>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
