import type { Ctx } from '../commands';
import type { ItemUsed } from '../events';
import type { GameState, Item, ItemKind } from '../types';
import { actOf, applyEffects, recordAction } from './effects';
import { isActPhase, participant } from './guards';
import { fail, ok, type CommandHandlers, type ErrorCode, type EventReducers, type Result } from './result';

/** Вещи, которые применяют командой item.use (§3); Фокус кладётся на алтарь. */
const USABLE: ItemKind[] = ['potion', 'ward', 'shape'];
type UsableKind = ItemUsed['kind'];

const DETAIL: Partial<Record<ErrorCode, string>> = {
  invalid: 'эту вещь не применяют',
  reserved: 'вещь в резерве',
};

/** Общие проверки вещи (§3): существует, лежит у автора, свободна, применяемого вида. */
export function usableItem(state: GameState, author: string, itemId: string): Item | ErrorCode {
  const it = state.items[itemId];
  if (!it) return 'not_found';
  if (it.owner.type !== 'player' || it.owner.key !== author) return 'not_owner';
  if (it.reservedFor !== undefined) return 'reserved';
  if (!USABLE.includes(it.kind)) return 'invalid';
  return it;
}

/** Защитный талисман (§3.2): только на себя, одна активная защита. */
function useWard(state: GameState, author: string, it: Item, target: string | undefined, ctx: Ctx): Result {
  if (target !== undefined && target !== author) return fail('invalid', 'талисман применяют только на себя');
  if (state.players[author].protection !== undefined) return fail('limit', 'защита уже есть');
  return ok({
    type: 'ItemUsed', at: ctx.now, player: author, itemId: it.id, kind: 'ward', target: author,
    effects: [{ type: 'itemRemoved', itemId: it.id }, { type: 'protection', player: author, value: { by: author, source: 'ward' } }],
  });
}

export const itemCommands: CommandHandlers = {
  'item.use': (state, _content, cmd, ctx) => {
    if (!isActPhase(state)) return fail('phase');
    const author = participant(state, ctx.actor);
    if (!author) return fail('forbidden');
    const it = typeof cmd.itemId === 'string' ? usableItem(state, author, cmd.itemId) : 'not_found';
    if (typeof it === 'string') return fail(it, DETAIL[it]);
    switch (it.kind as UsableKind) {
      case 'ward': return useWard(state, author, it, cmd.target, ctx);
      // Зелье и Камень облика добавляет задача 5.
      default: return fail('invalid', 'вид ещё не реализован');
    }
  },
};

export const itemReducers: EventReducers = {
  ItemUsed: (state, _c, e) => recordAction(applyEffects(state, e.effects), e, actOf(state)),
};
