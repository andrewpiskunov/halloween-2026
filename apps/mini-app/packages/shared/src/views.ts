import type { Clue, Content, ContentData, Faction, Recipe, Resource, Role } from './content';
import type { Actor } from './commands';
import { available } from './engine';
import type { AltarSide, Announcement, Contribution, Counts, GameState, Item, Lot, Offer, Phase, Player } from './types';

export interface PlayerView {
  kind: 'player'; phase: Phase; act: 0 | 1 | 2 | 3; clock: { elapsedMs: number; paused: boolean; pausedAt?: number };
  me: { role: Role; player: Player; items: Item[]; available: { gold: number; ingredients: Counts; items: string[] } };
  contacts: { role: string | null; name?: string; text: string; absent: boolean }[];
  others: { roleKey: string; name: string; title: string; emoji: string }[];
  offers: Offer[];
  workshop: Counts; recipes: Recipe[];
  altars: { side: AltarSide; name: string; contributions: (Contribution & { name: string; itemRef?: string })[] }[];
  lots: (Omit<Lot, 'items'> & { items: Item[] })[];
  announcements: Announcement[];
  public: { factions: Faction[]; resources: Resource[]; shards: { id: string; status: 'player' | 'lot' | 'altar' | 'unknown' }[]; clues: Clue[]; story: string };
}

export interface GmView {
  kind: 'gm'; state: GameState; content: ContentData;
  invites: { roleKey: string; code: string; bound: boolean; present: boolean }[];
}

const ALTAR_ORDER: AltarSide[] = ['wake', 'bind', 'break', 'ship'];

function actOf(phase: Phase): 0 | 1 | 2 | 3 {
  switch (phase) {
    case 'setup': return 0;
    case 'act1': return 1;
    case 'act2': return 2;
    default: return 3;
  }
}

function shardStatuses(state: GameState, content: Content): PlayerView['public']['shards'] {
  const act3 = actOf(state.phase) === 3;
  const items = Object.values(state.items).filter(i => i.kind === 'shard');
  return content.shards.map(sh => {
    const it = items.find(i => i.ref === sh.id);
    if (!it) return { id: sh.id, status: 'unknown' as const };
    if (it.owner.type === 'player') {
      return { id: sh.id, status: it.hiddenUntilAct && !act3 ? ('unknown' as const) : ('player' as const) };
    }
    return { id: sh.id, status: it.owner.type };
  });
}

/** Проекция состояния для актора. Чистая функция: `now` передаётся снаружи. */
export function viewFor(state: GameState, content: Content, actor: Actor, now: number): PlayerView | GmView {
  if (actor.type === 'system') throw new Error('system actor has no view');
  if (actor.type === 'gm') {
    const { roleByKey: _r, recipeById: _rc, ...data } = content;
    return {
      kind: 'gm', state, content: data,
      invites: state.roster.map(roleKey => ({
        roleKey,
        code: state.invites[roleKey],
        bound: state.players[roleKey]?.telegramId !== undefined,
        present: !!state.players[roleKey]?.present,
      })),
    };
  }

  const key = actor.roleKey;
  const me = state.players[key];
  if (!me) throw new Error(`role ${key} is not in the game`);
  const role = content.roleByKey[key];
  const presentInGame = (k: string) => state.roster.includes(k) && !!state.players[k]?.present;
  const nameOf = (k: string) => content.roleByKey[k]?.name ?? k;

  const elapsedMs = state.phase === 'setup' ? 0
    : (state.clock.pausedAt ?? now) - state.clock.actStartedAt - state.clock.pausedTotal;

  const items = Object.values(state.items);
  const itemById = (id: string) => state.items[id];

  const altars = ALTAR_ORDER.flatMap(side => {
    const altar = state.altars[side];
    if (!altar) return [];
    return [{
      side,
      name: content.factions.find(f => f.id === side)?.altar ?? side,
      contributions: altar.contributions.map(c => ({
        ...c,
        name: nameOf(c.player),
        ...(c.item ? { itemRef: itemById(c.item)?.ref } : {}),
      })),
    }];
  });

  return {
    kind: 'player',
    phase: state.phase,
    act: actOf(state.phase),
    clock: {
      elapsedMs, paused: state.clock.pausedAt !== undefined,
      ...(state.clock.pausedAt !== undefined ? { pausedAt: state.clock.pausedAt } : {}),
    },
    me: {
      role, player: me,
      items: items.filter(i => i.owner.type === 'player' && i.owner.key === key),
      available: available(state, key),
    },
    contacts: role.contacts.map(c => ({
      role: c.role,
      ...(c.role ? { name: nameOf(c.role) } : {}),
      text: c.text,
      absent: c.role !== null && !presentInGame(c.role),
    })),
    others: state.roster.filter(k => k !== key && presentInGame(k)).map(k => {
      const r = content.roleByKey[k];
      return { roleKey: k, name: r.name, title: r.title, emoji: r.emoji };
    }),
    offers: Object.values(state.offers).filter(o => o.from === key || o.to === key),
    workshop: state.workshop,
    recipes: content.recipes,
    altars,
    lots: Object.values(state.lots).filter(l => l.status !== 'queued').map(l => ({
      ...l,
      // чужие ставки не раскрываем ни в одном статусе торгов
      bids: l.bids.filter(b => b.player === key),
      items: l.items.map(itemById).filter((i): i is Item => !!i && !i.hiddenUntilAct),
    })),
    announcements: state.announcements,
    public: {
      factions: content.factions,
      resources: content.resources,
      shards: shardStatuses(state, content),
      clues: content.clues,
      story: content.story.public,
    },
  };
}
