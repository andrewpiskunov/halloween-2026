import { gmTab, type GmTab } from '../store';

const TABS: { key: GmTab; label: string; icon: string }[] = [
  { key: 'roster', label: 'Состав', icon: '☿︎' },
  { key: 'console', label: 'Пульт', icon: '⧗' },
  { key: 'story', label: 'Сюжет', icon: '✉' },
  { key: 'results', label: 'Итоги', icon: '✶︎' },
];

/** Нижняя панель вкладок ведущего. */
export function GmTabs({ hidden17 = false }: { hidden17?: boolean }) {
  return (
    <nav class="tabs">
      <div class="tabs-in">
        {(hidden17 ? [...TABS.slice(0, 3), { key: 'ritual' as const, label: 'Ритуал', icon: '✠' }, ...TABS.slice(3)] : TABS).map(t => (
          <button type="button" key={t.key} class={gmTab.value === t.key ? 'on' : ''} aria-current={gmTab.value === t.key ? 'page' : undefined}
            onClick={() => { gmTab.value = t.key; }}>
            <i aria-hidden="true">{t.icon}</i>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
