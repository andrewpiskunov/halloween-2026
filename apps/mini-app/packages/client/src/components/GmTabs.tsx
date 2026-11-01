import { gmTab, type GmTab } from '../store';
import { BASE } from '../base';
import { openGmTab } from '../gm/navigation';

const TABS: { key: GmTab; label: string; icon: string }[] = [
  { key: 'roster', label: 'Состав', icon: 'gm-roster' },
  { key: 'console', label: 'Пульт', icon: 'gm-console' },
  { key: 'story', label: 'Сюжет', icon: 'gm-story' },
  { key: 'results', label: 'Итоги', icon: 'gm-results' },
];

/** Нижняя панель вкладок ведущего. */
export function GmTabs({ hidden17 = false, badges = {} }: { hidden17?: boolean; badges?: Partial<Record<GmTab, number>> }) {
  return (
    <nav class="tabs" aria-label="Разделы ведущего">
      <div class="tabs-in">
        {(hidden17 ? [...TABS.slice(0, 3), { key: 'ritual' as const, label: 'Ритуал', icon: 'gm-ritual' }, ...TABS.slice(3)] : TABS).map(t => (
          <button type="button" key={t.key} class={gmTab.value === t.key ? 'on' : ''} aria-current={gmTab.value === t.key ? 'page' : undefined}
            onClick={() => openGmTab(t.key)}>
            <span class="tab-art" aria-hidden="true">
              <span class="tab-art-image">
                <img src={`${BASE}assets/navigation/${t.icon}.webp`} alt="" width="44" height="44" draggable={false} />
              </span>
              {!!badges[t.key] && <em class="badge">{badges[t.key]}</em>}
            </span>
            <span class="tab-label">{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
