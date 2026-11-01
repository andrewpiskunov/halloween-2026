import type { GameState } from '@fair/shared';

export interface GmAttentionEntry {
  kind: 'story' | 'inspection' | 'destruction' | 'consent' | 'production' | 'use';
  id: string;
  player: string;
}

/** Дела ведущего отдельно от ожидания игрока или окончания сцены. */
export function attentionFor(state: GameState, at: number) {
  const ready: GmAttentionEntry[] = [], waiting: GmAttentionEntry[] = [];
  if (!['act1', 'act2', 'act3'].includes(state.phase)) return { ready, waiting };
  for (const q of Object.values(state.story?.requests ?? {}).sort((a, b) => a.at - b.at)) {
    const entry: GmAttentionEntry = { kind: 'story', id: q.id, player: q.author };
    if (q.status === 'pending') ready.push(entry);
    if (q.status === 'conditions') waiting.push(entry);
  }
  for (const u of Object.values(state.hidden17?.uses ?? {})) {
    if (u.status !== 'pending') continue;
    const entry: GmAttentionEntry = { kind: u.question ? 'inspection' : 'use', id: u.id, player: u.author };
    (u.question && u.targets.every(k => u.approved.includes(k)) ? ready : waiting).push(entry);
  }
  const current = state.clock.pausedAt ?? at;
  for (const s of Object.values(state.hidden17?.fair?.destruction ?? {})) {
    const entry: GmAttentionEntry = { kind: 'destruction', id: s.id, player: s.author };
    if (s.status === 'pending' || s.status === 'active' && s.endsAt !== undefined && s.endsAt <= current) ready.push(entry);
    else if (s.status === 'active') waiting.push(entry);
  }
  for (const q of Object.values(state.requests)) {
    if (q.status === 'pending') waiting.push({ kind: 'consent', id: q.id, player: q.author });
  }
  for (const q of Object.values(state.hidden17?.production ?? {})) {
    if (q.status === 'pending') waiting.push({ kind: 'production', id: q.id, player: q.customer });
  }
  return { ready, waiting };
}
