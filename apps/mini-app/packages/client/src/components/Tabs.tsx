import { navigateTab } from '../narrative-navigation';
import { tab, type Tab } from '../store';
import { portraitUrl } from '../assets';
import { BASE } from '../base';

export const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'role', label: 'Роль', icon: '' },
  { key: 'bag', label: 'Сумка', icon: 'navigation/bag.webp' },
  { key: 'trades', label: 'Сделки', icon: 'navigation/trades.webp' },
  { key: 'workshop', label: 'Мастерская', icon: 'navigation/workshop.webp' },
  { key: 'altars', label: 'Алтари', icon: 'navigation/outpost.webp' },
  { key: 'events', label: 'События', icon: 'navigation/tavern.webp' },
];

/** В revealed «Итоги» встают на место «Событий» (спецификация этапа 5, §6.3). */
const RESULTS_TAB = { key: 'results' as const, label: 'Итоги', icon: 'documents/notebook.webp' };

/** Вкладки для фазы: в revealed без «Событий», с «Итогами». */
export const tabsFor = (revealed: boolean) => revealed ? TABS.map(t => t.key === 'events' ? RESULTS_TAB : t) : TABS;

/** Какую вкладку показать: «Итоги» есть только в revealed, «Событий» там нет. */
export function effectiveTab(t: Tab, revealed: boolean): Tab {
  if (revealed) return t === 'events' ? 'results' : t;
  return t === 'results' ? 'role' : t;
}

/**
 * Нижняя панель вкладок; badges — число на значке вкладки (входящие сделки и просьбы),
 * dots — точка без числа для новых отметок в сумке.
 */
export function Tabs({ roleKey, badges = {}, dots = [], revealed = false, hidden17 = false, narrative = false }: { roleKey: string; badges?: Partial<Record<Tab, number>>; dots?: Tab[]; revealed?: boolean; hidden17?: boolean; narrative?: boolean }) {
  const current = effectiveTab(tab.value, revealed);
  return (
    <nav class="tabs" aria-label="Разделы ярмарки">
      <div class="tabs-in">
        {tabsFor(revealed).map(t => (
          <button type="button" key={t.key} class={current === t.key ? 'on' : ''} aria-current={current === t.key ? 'page' : undefined}
            onClick={() => { if(narrative) navigateTab(t.key); else tab.value = t.key; }}>
            <span class="tab-art" aria-hidden="true">
              <span class={t.key === 'role' ? 'tab-art-image tab-art-portrait' : 'tab-art-image'}>
                <img src={t.key === 'role' ? portraitUrl(roleKey) : `${BASE}assets/${t.icon}`} alt="" width="44" height="44" draggable={false} />
              </span>
              {badges[t.key] ? <em class="badge">{badges[t.key]}</em> : dots.includes(t.key) ? <em class="badge dot-only" /> : null}
            </span>
            <span class="tab-label">{narrative && t.key === 'role' ? 'Персонаж' : narrative && t.key === 'altars' ? 'Застава' : hidden17 && t.key === 'altars' ? 'Ритуал' : hidden17 && t.key === 'events' ? 'Таверна' : t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
