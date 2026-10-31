import { shardNumber } from '../shard-label';
import type { ContentData, GmView } from '@fair/shared';

const present = (v: GmView, key: string): boolean =>
  v.state.roster.includes(key) && !!v.state.players[key]?.present;

/** Владельцы улик, которые уходят в лот, если владелец не пришёл. */
const CLUE_OWNERS: { id: string; owner: string }[] = [
  { id: 'C', owner: 'o16' },
  { id: 'B', owner: 'o10' },
];

/** Какие вещи уйдут в лоты при открытии ярмарки: осколки и улики без пришедшего владельца, реликвии без владельца, но с желающим. */
export function lotsPreview(v: GmView, content: Pick<ContentData, 'shards' | 'relics'>): string[] {
  const out: string[] = [];
  for (const sh of content.shards) {
    if (sh.owner && !present(v, sh.owner)) out.push(`Осколок ${shardNumber(sh.id)}`);
  }
  for (const c of CLUE_OWNERS) {
    if (!present(v, c.owner)) out.push(`Улика ${c.id}`);
  }
  for (const r of content.relics) {
    if (!present(v, r.owner) && r.wants.some(w => v.state.roster.includes(w))) out.push(r.name);
  }
  return out;
}

/** Последствия перехода к следующему акту — текст для подтверждения. */
export function actNextPreview(v: GmView): { act: 'II' | 'III'; lines: string[] } | null {
  const { phase, nPresent, players, lots } = v.state;
  if (phase !== 'act1' && phase !== 'act2') return null;
  const act = phase === 'act1' ? 2 : 3;
  const lines = [`Склад пополнится: по ${Math.ceil(nPresent / 6)} каждого ингредиента.`];
  if (act === 2) lines.push('Выйдет лот: осколок 4 и улика A.');
  else if (!v.state.hidden17) lines.push(players.o14?.present ? 'Осколок 5 откроется у Лиры.' : 'Выйдет лот: осколок 5.');
  const queued = Object.values(lots).filter(l => l.status === 'queued' && l.act === act).length;
  if (queued > 0) lines.push(`Отложенных лотов выйдет: ${queued}.`);
  return { act: act === 2 ? 'II' : 'III', lines };
}
