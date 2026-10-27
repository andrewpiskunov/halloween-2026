import type { AbilityKind, CopyableKind, TargetMode } from './abilities';
import type { Clue, Content, Faction, Recipe, Resource, Role } from './content';
import type { Actor } from './commands';
import { available } from './engine';
import type {
  ActionRecord, AltarSide, Announcement, ConsentStatus, Contribution, Counts, GameState, Item, Lot, Offer, Phase, Player,
} from './types';
import { abilityView, actionsFor, gmAbilities, requestsFor } from './views-abilities';
import { closingFor, goalsFor, type ClosingView, type GoalView } from './views-closing';

export type { ClosingView, GoalView } from './views-closing';

export interface AbilityView {
  name: string; text: string;            // из роли: skill, effect
  kind: AbilityKind; hostile: boolean; verbal: boolean;
  target: TargetMode; place: 'role' | 'workshop';
  /** Для Астры: какие виды можно скопировать и чьё согласие нужно (null, если владельца нет на ярмарке). */
  copy?: { kind: CopyableKind; owner: string | null; name: string }[];
  state: 'available' | 'used' | 'pending' | 'closed';   // closed: не акт
  pendingRequest?: string;
}

export interface ConsentRequestView {
  id: string; author: string; approvers: string[]; approved: string[];
  status: ConsentStatus; createdAt: number; expiresAt: number; reason?: string;
  /** Описание словами собирает клиент по этим полям. */
  action:
    | { type: 'ability'; ability: AbilityKind; copied?: CopyableKind; target?: string; from?: string; to?: string }
    | { type: 'item'; kind: 'potion' | 'shape'; target: string; guise?: string };
}

export interface PlayerView {
  kind: 'player'; phase: Phase; act: 0 | 1 | 2 | 3; clock: { elapsedMs: number; paused: boolean; pausedAt?: number };
  me: {
    role: Role; player: Player; items: Item[]; available: { gold: number; ingredients: Counts; items: string[] }; ability: AbilityView;
    /** Мои цели в порядке role.goals: предпросмотр до закрытия, итог после. */
    goals: GoalView[];
  };
  contacts: { role: string | null; name?: string; text: string; absent: boolean }[];
  /** guise: облик присутствующего после Камня, виден всем. */
  others: { roleKey: string; name: string; title: string; emoji: string; guise?: string }[];
  offers: Offer[];
  /** Вид и ref вещей из моих предложений (в обе стороны): адресат должен видеть, что ему предлагают. Без владельца. */
  offerItems: Record<string, { kind: Item['kind']; ref: string }>;
  workshop: Counts; recipes: Recipe[];
  altars: { side: AltarSide; name: string; contributions: (Contribution & { name: string; itemRef?: string })[] }[];
  /** Лоты с вещами; чужие ставки скрыты, виден только их счёт. */
  lots: (Omit<Lot, 'items'> & { items: Item[]; bidders: number })[];
  announcements: Announcement[];
  public: {
    factions: Faction[]; resources: Resource[]; shards: { id: string; status: 'player' | 'lot' | 'altar' | 'unknown' }[]; clues: Clue[]; story: string;
    /** Каталог реликвий для просьб по названию: без стартовых владельцев. */
    relics: { name: string; emoji: string; lore: string }[];
  };
  /** Запросы, где я автор или одобряющий; pending и закрытые этого акта. */
  requests: ConsentRequestView[];
  /** Записи журнала применений, где я автор или цель (или from/to переноса). */
  actions: ActionRecord[];
  /** Итоги ярмарки: только в revealed. */
  closing?: ClosingView;
}

export interface GmView {
  /** Содержимое приходит отдельным сообщением `content` при подключении; здесь только его версия. */
  kind: 'gm'; state: GameState; contentVersion: string;
  invites: { roleKey: string; code: string; bound: boolean; present: boolean }[];
  /** state содержит requests и actions целиком; здесь каталог способностей всех ролей. */
  abilities: Record<string, { kind: AbilityKind; hostile: boolean; verbal: boolean; name: string }>;
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
    return {
      kind: 'gm', state, contentVersion: content.version,
      invites: state.roster.map(roleKey => ({
        roleKey,
        code: state.invites[roleKey],
        bound: state.players[roleKey]?.telegramId !== undefined,
        present: !!state.players[roleKey]?.present,
      })),
      abilities: gmAbilities(content),
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

  const offers = Object.values(state.offers).filter(o => o.from === key || o.to === key);
  const offerItems: PlayerView['offerItems'] = {};
  for (const o of offers) {
    for (const id of [...o.give.items, ...o.get.items]) {
      const it = itemById(id);
      if (it) offerItems[id] = { kind: it.kind, ref: it.ref };
    }
  }

  const closing = closingFor(state, content, key);
  // telegramId игроку не нужен: аккаунт Telegram остаётся только в проекции ведущего.
  const { telegramId: _telegramId, ...player } = me;

  return {
    kind: 'player',
    phase: state.phase,
    act: actOf(state.phase),
    clock: {
      elapsedMs, paused: state.clock.pausedAt !== undefined,
      ...(state.clock.pausedAt !== undefined ? { pausedAt: state.clock.pausedAt } : {}),
    },
    me: {
      role, player,
      items: items.filter(i => i.owner.type === 'player' && i.owner.key === key),
      available: available(state, key),
      ability: abilityView(state, content, key),
      goals: goalsFor(state, content, key),
    },
    contacts: role.contacts.map(c => ({
      role: c.role,
      ...(c.role ? { name: nameOf(c.role) } : {}),
      text: c.text,
      absent: c.role !== null && !presentInGame(c.role),
    })),
    others: state.roster.filter(k => k !== key && presentInGame(k)).map(k => {
      const r = content.roleByKey[k];
      const guise = state.players[k].guise?.name;
      return { roleKey: k, name: r.name, title: r.title, emoji: r.emoji, ...(guise !== undefined ? { guise } : {}) };
    }),
    offers,
    offerItems,
    workshop: state.workshop,
    recipes: content.recipes,
    altars,
    lots: Object.values(state.lots).filter(l => l.status !== 'queued').map(l => ({
      ...l,
      // чужие ставки не раскрываем ни в одном статусе торгов
      bids: l.bids.filter(b => b.player === key),
      bidders: l.bids.length,
      items: l.items.map(itemById).filter((i): i is Item => !!i && !i.hiddenUntilAct),
    })),
    announcements: state.announcements,
    public: {
      factions: content.factions,
      resources: content.resources,
      shards: shardStatuses(state, content),
      clues: content.clues,
      story: content.story.public,
      relics: content.relics.map(r => ({ name: r.name, emoji: r.emoji, lore: r.lore })),
    },
    requests: requestsFor(state, key),
    actions: actionsFor(state, key),
    ...(closing ? { closing } : {}),
  };
}
