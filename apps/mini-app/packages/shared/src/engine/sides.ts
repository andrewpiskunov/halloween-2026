import { fail, ok, type CommandHandlers, type EventReducers } from './result';
import { participant } from './guards';

export const sideCommands: CommandHandlers = {
  /** Свободный выбирает сторону один раз, в первом или втором акте, из алтарей этой игры (§6.4). */
  'player.chooseSide': (state, content, cmd, ctx) => {
    const key = participant(state, ctx.actor);
    if (!key) return fail('forbidden');
    if (content.roleByKey[key]?.side !== 'free') return fail('forbidden', 'сторону выбирают только свободные');
    if (state.phase !== 'act1' && state.phase !== 'act2') return fail('phase');
    if (state.players[key].side !== undefined) return fail('invalid', 'сторона уже выбрана');
    if (typeof cmd.side !== 'string' || !Object.hasOwn(state.altars, cmd.side) || !state.altars[cmd.side]) return fail('not_found', cmd.side);
    return ok({ type: 'SideChosen', at: ctx.now, player: key, side: cmd.side });
  },
};

export const sideReducers: EventReducers = {
  SideChosen: (state, _c, e) => ({
    ...state, players: { ...state.players, [e.player]: { ...state.players[e.player], side: e.side } },
  }),
};
