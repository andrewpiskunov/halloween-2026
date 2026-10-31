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

/** В revealed «Итоги» встают на место «Событий» (спецификация этапа 5, §6.3). */
const RESULTS_TAB = { key: 'results' as const, label: 'Итоги', icon: `✶${T}` };

/** Вкладки для фазы: в revealed без «Событий», с «Итогами». */
export const tabsFor = (revealed: boolean) => revealed ? TABS.map(t => t.key === 'events' ? RESULTS_TAB : t) : TABS;

/** Какую вкладку показать: «Итоги» есть только в revealed, «Событий» там нет. */
export function effectiveTab(t: Tab, revealed: boolean): Tab {
  if (revealed) return t === 'events' ? 'results' : t;
  return t === 'results' ? 'role' : t;
}

/**
 * Нижняя панель вкладок; badges — число на значке вкладки (входящие сделки и просьбы),
 * dots — точка без числа (способность доступна, новая отметка в сумке).
 */
export function Tabs({ badges = {}, dots = [], revealed = false, hidden17 = false }: { badges?: Partial<Record<Tab, number>>; dots?: Tab[]; revealed?: boolean; hidden17?: boolean }) {
  const current = effectiveTab(tab.value, revealed);
  return (
    <nav class="tabs">
      <div class="tabs-in">
        {tabsFor(revealed).map(t => (
          <button type="button" key={t.key} class={current === t.key ? 'on' : ''} aria-current={current === t.key ? 'page' : undefined}
            onClick={() => { tab.value = t.key; }}>
            <i aria-hidden="true">{t.icon}{badges[t.key] ? <em class="badge">{badges[t.key]}</em> : dots.includes(t.key) ? <em class="badge dot-only" aria-label="есть новое" /> : null}</i>
            {hidden17 && t.key === 'altars' ? 'Ритуал' : hidden17 && t.key === 'events' ? 'Таверна' : t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
