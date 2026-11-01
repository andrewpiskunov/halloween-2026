import { signal } from '@preact/signals';
import { gmTab, type GmTab } from '../store';

export const gmPanel = signal<{ kind: 'dossier'; player: string } | { kind: 'admin' } | null>(null);
export const gmStorySection = signal<'requests' | 'cards' | 'messages' | 'history'>('requests');
export const gmCardDraft = signal<string | null>(null);
const top = () => { if (typeof window !== 'undefined') window.scrollTo(0, 0); };
export function openGmTab(tab: GmTab) { gmPanel.value = null; gmTab.value = tab; top(); }
export function openGmPanel(panel: NonNullable<typeof gmPanel.value>) { gmPanel.value = panel; top(); }
export function closeGmPanel() { gmPanel.value = null; top(); }
export function openGmMessages() { gmStorySection.value = 'messages'; openGmTab('story'); }
export function createGmStoryCard(player: string) {
  gmCardDraft.value = player;
  gmStorySection.value = 'cards';
  openGmTab('story');
}
