import type { Contribution, GameState, Item } from '../types';
import { available } from './bundles';
import { isActPhase, lookup, participant } from './guards';
import { fail, ok, type CommandHandlers, type EventReducers } from './result';

/** Какую вещь можно положить на алтарь. */
const ALTAR_KINDS: Item['kind'][] = ['shard', 'focus'];

export const altarCommands: CommandHandlers = {
  'altar.contribute': (state, _content, cmd, ctx) => {
    const key = participant(state, ctx.actor);
    if (!key) return fail('forbidden');
    if (!isActPhase(state)) return fail('phase');
    if ((cmd.itemId === undefined) === (cmd.gold === undefined)) return fail('invalid', 'нужно указать ровно одно: вещь или золото');
    if (!lookup(state.altars, cmd.side)) return fail('not_found', cmd.side);
    const contribution: Contribution = { id: ctx.newId(), player: key };
    if (cmd.gold !== undefined) {
      if (!Number.isInteger(cmd.gold) || cmd.gold < 1) return fail('invalid', 'золото: целое число не меньше 1');
      if (available(state, key).gold < cmd.gold) return fail('insufficient', 'не хватает золота');
      contribution.gold = cmd.gold;
    } else {
      const it = lookup(state.items, cmd.itemId);
      if (!it) return fail('not_found', cmd.itemId);
      if (it.owner.type !== 'player' || it.owner.key !== key) return fail('not_owner');
      if (it.reservedFor !== undefined) return fail('reserved');
      if (!ALTAR_KINDS.includes(it.kind)) return fail('invalid', 'на алтарь кладут только осколок или Фокус');
      if (it.hiddenUntilAct !== undefined && state.phase !== 'act3') return fail('invalid', 'вещь ещё скрыта');
      contribution.item = it.id;
    }
    return ok({ type: 'Contributed', at: ctx.now, side: cmd.side, contribution });
  },

  'altar.withdraw': (state, _content, cmd, ctx) => {
    const key = participant(state, ctx.actor);
    if (!key) return fail('forbidden');
    if (!isActPhase(state)) return fail('phase');
    for (const altar of Object.values(state.altars)) {
      const c = altar?.contributions.find(x => x.id === cmd.contributionId);
      if (!altar || !c) continue;
      if (c.player !== key) return fail('forbidden');
      return ok({
        type: 'ContributionWithdrawn', at: ctx.now, side: altar.side, contributionId: c.id, player: key,
        ...(c.item !== undefined ? { item: c.item } : {}), ...(c.gold !== undefined ? { gold: c.gold } : {}),
      });
    }
    return fail('not_found', cmd.contributionId);
  },
};

export const altarReducers: EventReducers = {
  Contributed: (state, _c, e) => {
    const c = e.contribution;
    const altar = state.altars[e.side]!;
    const p = state.players[c.player];
    const next: GameState = {
      ...state,
      altars: { ...state.altars, [e.side]: { ...altar, contributions: [...altar.contributions, c] } },
    };
    if (c.gold !== undefined) return { ...next, players: { ...state.players, [c.player]: { ...p, gold: p.gold - c.gold } } };
    if (c.item !== undefined) {
      return { ...next, items: { ...state.items, [c.item]: { ...state.items[c.item], owner: { type: 'altar', side: e.side } } } };
    }
    return next;
  },
  ContributionWithdrawn: (state, _c, e) => {
    const altar = state.altars[e.side]!;
    const p = state.players[e.player];
    const next: GameState = {
      ...state,
      altars: { ...state.altars, [e.side]: { ...altar, contributions: altar.contributions.filter(c => c.id !== e.contributionId) } },
    };
    if (e.gold !== undefined) return { ...next, players: { ...state.players, [e.player]: { ...p, gold: p.gold + e.gold } } };
    if (e.item !== undefined) {
      return { ...next, items: { ...state.items, [e.item]: { ...state.items[e.item], owner: { type: 'player', key: e.player } } } };
    }
    return next;
  },
};
