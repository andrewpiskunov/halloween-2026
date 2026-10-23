import { gmTab, type GmTab } from '../store';

const TABS: { key: GmTab; label: string; icon: string }[] = [
  { key: 'roster', label: 'Состав', icon: '👥' },
  { key: 'console', label: 'Пульт', icon: '🎛️' },
];

/** Нижняя панель вкладок ведущего. */
export function GmTabs() {
  return (
    <nav class="tabs">
      {TABS.map(t => (
        <button type="button" key={t.key} class={gmTab.value === t.key ? 'on' : ''} onClick={() => { gmTab.value = t.key; }}>
          <i>{t.icon}</i>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
