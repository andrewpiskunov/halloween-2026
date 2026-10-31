import type { Phase, StoryCard } from '@fair/shared';

// Только отображение: сервер повторно проверяет срок и полномочия в engine/story.ts.
export const storyAct = (phase: Phase): number => phase === 'act1' ? 1 : phase === 'act2' ? 2 : phase === 'act3' ? 3 : 0;
export const storyCardActive = (c: StoryCard, phase: Phase): boolean => c.active && (c.expiresAct === null || c.expiresAct === storyAct(phase));
