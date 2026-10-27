// Проекции этапа 3: карточка способности, запросы согласия, журнал применений (§6.6).
import { ABILITY_BY_ROLE, ABILITY_SPECS, COPY_SOURCES, type CopyableKind } from './abilities';
import type { Content } from './content';
import type { ActionRecord, ConsentRequest, GameState } from './types';
import type { AbilityView, ConsentRequestView, GmView } from './views';

const isActPhase = (s: GameState) => s.phase === 'act1' || s.phase === 'act2' || s.phase === 'act3';
const presentInGame = (s: GameState, k: string) => s.roster.includes(k) && !!s.players[k]?.present;

/** Карточка способности роли: вид из каталога, тексты из роли, состояние применения в акте. */
export function abilityView(state: GameState, content: Content, key: string): AbilityView {
  const role = content.roleByKey[key];
  const spec = ABILITY_SPECS[ABILITY_BY_ROLE[key]];
  const p = state.players[key];
  const st: AbilityView['state'] = !isActPhase(state) ? 'closed'
    : p.abilityPending !== undefined ? 'pending'
      : p.abilityUsedInAct ? 'used' : 'available';
  const copy = spec.kind === 'copyAbility'
    ? (Object.keys(COPY_SOURCES) as CopyableKind[]).map(kind => {
      const owner = COPY_SOURCES[kind];
      return { kind, owner: presentInGame(state, owner) ? owner : null, name: content.roleByKey[owner].skill };
    })
    : undefined;
  return {
    name: role.skill, text: role.effect,
    kind: spec.kind, hostile: spec.hostile, verbal: spec.verbal, target: spec.target, place: spec.place,
    ...(copy ? { copy } : {}),
    state: st,
    ...(st === 'pending' ? { pendingRequest: p.abilityPending } : {}),
  };
}

/** Действие запроса для клиента: вид, цель и облик; id вещи не передаётся. */
function requestAction(r: ConsentRequest): ConsentRequestView['action'] {
  const a = r.action;
  if (a.type === 'item') {
    // Облик есть только у Камня: так вид известен и после того, как вещь применена и исчезла.
    return { type: 'item', kind: a.guise !== undefined ? 'shape' : 'potion', target: a.target, ...(a.guise !== undefined ? { guise: a.guise } : {}) };
  }
  const u = a.use;
  const inner = u.kind === 'copyAbility' ? u.copy : u;
  return {
    type: 'ability', ability: u.kind,
    ...(u.kind === 'copyAbility' ? { copied: u.copy.kind } : {}),
    ...('target' in inner ? { target: inner.target } : {}),
    ...(inner.kind === 'transferProtection' ? { from: inner.from, to: inner.to } : {}),
  };
}

/**
 * Запросы, где игрок автор или одобряющий: открытые, созданные в этом акте
 * и закрытые с начала этого акта (закрытые сменой акта видны весь следующий акт).
 */
export function requestsFor(state: GameState, key: string): ConsentRequestView[] {
  return Object.values(state.requests)
    .filter(r => r.author === key || r.approvers.includes(key))
    .filter(r => r.status === 'pending' || Math.max(r.createdAt, r.closedAt ?? r.createdAt) >= state.clock.actStartedAt)
    .map(r => ({
      id: r.id, author: r.author, approvers: r.approvers, approved: r.approved, status: r.status,
      createdAt: r.createdAt, expiresAt: r.expiresAt, ...(r.reason !== undefined ? { reason: r.reason } : {}),
      action: requestAction(r),
    }));
}

/** Записи журнала, где игрок автор, цель или участник переноса; итог наблюдения только у автора. */
export function actionsFor(state: GameState, key: string): ActionRecord[] {
  return state.actions
    .filter(a => a.author === key || a.target === key || a.from === key || a.to === key)
    .map(a => {
      if (a.author === key || a.intel === undefined) return a;
      const { intel: _i, ...rest } = a;
      return rest;
    });
}

/** Способности всех ролей содержимого для пульта ведущего. */
export function gmAbilities(content: Content): GmView['abilities'] {
  const res: GmView['abilities'] = {};
  for (const r of content.roles) {
    const spec = ABILITY_SPECS[ABILITY_BY_ROLE[r.key]];
    res[r.key] = { kind: spec.kind, hostile: spec.hostile, verbal: spec.verbal, name: r.skill };
  }
  return res;
}
