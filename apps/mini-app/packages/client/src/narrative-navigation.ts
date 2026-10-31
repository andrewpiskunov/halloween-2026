import { signal } from '@preact/signals';
import { tab, type Tab } from './store';

export type DetailPage = { kind: 'item' | 'document' | 'trade' | 'recipe' | 'resource'; id: string };
export const detailPage = signal<DetailPage | null>(null);
const tabs = ['role', 'bag', 'trades', 'workshop', 'altars', 'events', 'results'];
const kinds = ['item', 'document', 'trade', 'recipe', 'resource'];
export function parseNarrativeRoute(hash: string): { tab: Tab; page: DetailPage | null } | null {
  const parts = hash.replace(/^#/, '').split('/');
  if (!tabs.includes(parts[0])) return null;
  if (parts.length === 1) return { tab: parts[0] as Tab, page: null };
  if (parts.length !== 3 || !kinds.includes(parts[1]) || !parts[2]) return null;
  try { return { tab: parts[0] as Tab, page: { kind: parts[1] as DetailPage['kind'], id: decodeURIComponent(parts[2]) } }; }
  catch { return null; }
}
let active = false;
let scope = '';
const hash = () => `#${tab.value}${detailPage.value ? `/${detailPage.value.kind}/${encodeURIComponent(detailPage.value.id)}` : ''}`;
function backButton() {
  const b = window.Telegram?.WebApp?.BackButton;
  if (detailPage.value) b?.show(); else b?.hide();
}
function restore() {
  if (!active) return;
  const route = parseNarrativeRoute(location.hash);
  if (route) { tab.value = route.tab; detailPage.value = route.page; }
  else { detailPage.value = null; }
  backButton();
  window.scrollTo(0, history.state?.scrollY ?? 0);
}
export function activateNarrativeNavigation(player: string) {
  active = true;
  if (scope && scope !== player) {
    detailPage.value = null; tab.value = 'events'; history.replaceState({}, '', '#events');
  } else if (!parseNarrativeRoute(location.hash)) {
    tab.value = 'events'; history.replaceState({}, '', '#events');
  }
  scope = player; restore();
  window.addEventListener('popstate', restore);
  window.addEventListener('hashchange', restore);
  const b = window.Telegram?.WebApp?.BackButton;
  b?.onClick(closePage);
  return () => { active = false; window.removeEventListener('popstate', restore); window.removeEventListener('hashchange', restore); b?.offClick(closePage); b?.hide(); };
}
export function openPage(page: DetailPage) {
  history.replaceState({ ...history.state, scrollY: window.scrollY }, '', location.href);
  detailPage.value = page;
  history.pushState({ detail: true }, '', hash());
  backButton(); window.scrollTo(0, 0);
}
export function closePage() {
  if (history.state?.detail) history.back();
  else { detailPage.value = null; history.replaceState({}, '', `#${tab.value}`); backButton(); window.scrollTo(0, 0); }
}
export function navigateTab(next: Tab) {
  tab.value = next; detailPage.value = null;
  if (active) { history.pushState({}, '', `#${next}`); backButton(); window.scrollTo(0, 0); }
}
