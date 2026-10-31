import type { Phase, Side } from './types';

export type StoryKind = 'item' | 'ability' | 'state' | 'goal' | 'contract';
export interface StoryCardInput {
  kind: StoryKind; owner: string; title: string; text: string; price: string;
  visibility: 'private' | 'public'; readers: string[];
  uses: number | null; duration: 'act' | 'game'; replacesAbility: boolean;
  active: boolean; completed: boolean;
}
export interface StoryCard extends StoryCardInput { id: string; revision: number; at: number; expiresAct: number | null }
export interface StoryRequest {
  id: string; revision: number; author: string; title: string; text: string; stake: string;
  cardId?: string; cardRevision?: number;
  status: 'pending' | 'conditions' | 'done' | 'rejected' | 'cancelled'; reply: string; at: number;
}
export interface StoryMessage { id: string; title: string; text: string; recipients: string[]; at: number; active: boolean }
export interface StoryChange {
  id: string; at: number; label: string; undone?: boolean;
  card?: { before: StoryCard | null; after: StoryCard };
  request?: { before: StoryRequest; after: StoryRequest };
  side?: { player: string; before: Side | null; after: Side | null };
  message?: StoryMessage;
}
export interface StoryState {
  cards: Record<string, StoryCard>; requests: Record<string, StoryRequest>;
  messages: StoryMessage[]; history: StoryChange[]; sides: Record<string, Side>;
}
export interface StoryView { cards: StoryCard[]; requests: StoryRequest[]; messages: StoryMessage[] }
export const emptyStory = (): StoryState => ({ cards: {}, requests: {}, messages: [], history: [], sides: {} });
export const storyAct = (phase: Phase): number => phase === 'act1' ? 1 : phase === 'act2' ? 2 : phase === 'act3' ? 3 : 0;
export const storyCardActive = (c: StoryCard, phase: Phase): boolean => c.active && (c.expiresAct === null || c.expiresAct === storyAct(phase));
export const storyReplacesAbility = (story: StoryState | undefined, key: string, phase: Phase): boolean =>
  Object.values(story?.cards ?? {}).some(c => c.owner === key && c.kind === 'ability' && c.replacesAbility && storyCardActive(c, phase));
export function storyFor(story: StoryState | undefined, key: string): StoryView {
  const s = story ?? emptyStory();
  return {
    cards: Object.values(s.cards).filter(c => c.owner === key || c.visibility === 'public' || c.readers.includes(key)),
    requests: Object.values(s.requests).filter(q => q.author === key),
    messages: s.messages.filter(m => m.active && (m.recipients.length === 0 || m.recipients.includes(key))),
  };
}
export type StoryCommand =
  | { type: 'story.request'; title: string; text: string; stake: string; cardId?: string }
  | { type: 'story.cancel'; id: string; revision: number }
  | { type: 'story.respond'; id: string; revision: number; status: 'conditions' | 'done' | 'rejected'; reply: string }
  | { type: 'story.card.save'; id?: string; revision?: number; card: StoryCardInput }
  | { type: 'story.message'; title: string; text: string; recipients: string[] }
  | { type: 'story.side'; player: string; side: Side | null; reason: string }
  | { type: 'story.undo'; id: string };
export type StoryEvent =
  | { type: 'StoryRequested'; at: number; seq?: number; request: StoryRequest }
  | { type: 'StoryChanged'; at: number; seq?: number; change: StoryChange }
  | { type: 'StoryUndone'; at: number; seq?: number; id: string };
