import type { Bundle, ItemKind } from './types';

export type RitualKnowledge = 'place' | 'joining';
export type GoalStatus = 'achieved' | 'partial' | 'not-achieved';
export interface GoalEvaluation { status: GoalStatus; note: string }
export interface NarrativeDocument { id: string; title: string; source: string; text: string; holders: string[]; knowledge?: RitualKnowledge[] }
export interface NarrativeRole { story: string[]; goals: [string, string]; gmGoals: [string, string]; abilityOrigin: string; documents: string[]; startingItems: Record<string, string> }
export interface ItemLore { name: string; description: string; history: string; uses: string }
export interface NarrativeContent { version: 2; roles: Record<string, NarrativeRole>; documents: NarrativeDocument[]; items: Record<string, ItemLore>; rules: { title: string; text: string; image: string }[]; craftingRules: string[] }
export interface NarrativeTrade {
  id: string; from: string; to: string; give: Bundle; reply?: Bundle; wish: string;
  status: 'offered' | 'replied' | 'completed' | 'declined' | 'cancelled' | 'expired';
  createdAt: number; expiresAt: number; closedAt?: number;
  items: Record<string, { kind: ItemKind; ref: string }>;
}
export interface NarrativeState {
  /** Точные ID стартовых вещей; старой активной партии происхождение не приписываем. */
  startingItemIds?: Record<string, string[]>;
  version: 2; knowledge: Record<string, RitualKnowledge[]>; documentAccess: Record<string, string[]>;
  evaluations: Record<string, Record<string, GoalEvaluation>>; trades: Record<string, NarrativeTrade>;
  announcements: { id: string; author: string; title: string; text: string; at: number }[];
}
export interface NarrativePlayerView {
  role: Omit<NarrativeRole, 'gmGoals'>; documents: Omit<NarrativeDocument, 'holders'>[];
  knowledge: RitualKnowledge[]; evaluations: Record<string, GoalEvaluation>; trades: NarrativeTrade[];
  announcements: NarrativeState['announcements']; rules: NarrativeContent['rules']; craftingRules: string[];
  items: Record<string, ItemLore>; origins: Record<string, string>;
}
export type NarrativeCommand =
 | { type: 'narrative.enable' }
 | { type: 'narrative.trade.create'; to: string; give: Bundle; wish: string }
 | { type: 'narrative.trade.reply'; id: string; give: Bundle }
 | { type: 'narrative.trade.confirm' | 'narrative.trade.decline' | 'narrative.trade.cancel' | 'narrative.trade.expire'; id: string }
 | { type: 'narrative.sell'; ingredient: 'ash' | 'moon' | 'dew'; count: number }
 | { type: 'narrative.announce'; title: string; text: string }
 | { type: 'narrative.document.show'; documentId: string; player: string; allow: boolean }
 | { type: 'narrative.knowledge'; player: string; knowledge: RitualKnowledge }
 | { type: 'narrative.goal'; player: string; goal: 0 | 1; evaluation: GoalEvaluation | null };

export const NARRATIVE_COMMAND_TYPES = { 'narrative.enable': true, 'narrative.trade.create': true, 'narrative.trade.reply': true, 'narrative.trade.confirm': true, 'narrative.trade.decline': true, 'narrative.trade.cancel': true, 'narrative.trade.expire': true, 'narrative.sell': true, 'narrative.announce': true, 'narrative.document.show': true, 'narrative.knowledge': true, 'narrative.goal': true } as const;
