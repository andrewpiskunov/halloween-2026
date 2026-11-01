import { gmTab, type GmTab } from '../store';
import { BASE } from '../base';

const TABS: { key: GmTab; label: string; icon: string }[] = [
  { key: 'roster', label: 'Состав', icon: 'gm-roster' },
  { key: 'console', label: 'Пульт', icon: 'gm-console' },
  { key: 'story', label: 'Сюжет', icon: 'gm-story' },
  { key: 'results', label: 'Итоги', icon: 'gm-results' },
];

/** Нижняя панель вкладок ведущего. */
export function GmTabs({ hidden17 = false }: { hidden17?: boolean }) {
  return (
    <nav class="tabs" aria-label="Разделы ведущего">
      <div class="tabs-in">
        {(hidden17 ? [...TABS.slice(0, 3), { key: 'ritual' as const, label: 'Ритуал', icon: 'gm-ritual' }, ...TABS.slice(3)] : TABS).map(t => (
          <button type="button" key={t.key} class={gmTab.value === t.key ? 'on' : ''} aria-current={gmTab.value === t.key ? 'page' : undefined}
            onClick={() => { gmTab.value = t.key; }}>
            <span class="tab-art" aria-hidden="true">
              <span class="tab-art-image">
                <img src={`${BASE}assets/navigation/${t.icon}.webp`} alt="" width="44" height="44" draggable={false} />
              </span>
            </span>
            <span class="tab-label">{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
