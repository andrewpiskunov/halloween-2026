import type { Ctx } from '../commands';
import type { ItemUsed } from '../events';
import type { ConsentAction, ConsentRequest, Effect, GameState, Item, ItemKind } from '../types';
import { acceptRequest, requestConsent } from './consent';
import { cleanseEffects } from './consented-kinds';
import { actOf, applyEffects, recordAction } from './effects';
import { isActPhase, lookup, participant, presentPlayer } from './guards';
import { fail, ok, type CommandHandlers, type ErrorCode, type EventReducers, type Result } from './result';

/** Вещи, которые применяют командой item.use (§3); Фокус кладётся на алтарь. */
const USABLE: ItemKind[] = ['potion', 'ward', 'shape'];
type UsableKind = ItemUsed['kind'];
type ItemAction = Extract<ConsentAction, { type: 'item' }>;
const MAX_GUISE = 40;

const DETAIL: Partial<Record<ErrorCode, string>> = {
  invalid: 'эту вещь не применяют',
  reserved: 'вещь в резерве',
};

/** Общие проверки вещи (§3): существует, лежит у автора, свободна, применяемого вида. */
export function usableItem(state: GameState, author: string, itemId: string): Item | ErrorCode {
  const it = lookup(state.items, itemId);
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

/** Облик Камня (§3.4): строка без переводов строк, после обрезки 1–40 символов. */
function validGuise(g: unknown): string | undefined {
  if (typeof g !== 'string' || /[\r\n]/.test(g)) return undefined;
  const name = g.trim();
  return name.length >= 1 && name.length <= MAX_GUISE ? name : undefined;
}

/** Эффект зелья или Камня на цель; вызывается сразу на себя и после согласия на другого. */
function performItem(state: GameState, author: string, it: Item, a: Omit<ItemAction, 'type'>, ctx: Ctx, requestId?: string): Result {
  const base = { type: 'ItemUsed' as const, at: ctx.now, player: author, itemId: it.id, target: a.target, ...(requestId !== undefined ? { requestId } : {}) };
  const removedItem: Effect = { type: 'itemRemoved', itemId: it.id };
  if (it.kind === 'potion') {
    const c = cleanseEffects(state, a.target);
    return ok({ ...base, kind: 'potion', effects: [removedItem, ...c.effects], removed: c.removed });
  }
  const name = a.guise ?? '';
  return ok({
    ...base, kind: 'shape', guise: name,
    effects: [removedItem, { type: 'guise', player: a.target, value: { name, at: ctx.now, by: author } }],
  });
}

/** Зелье и Камень (§3.1, §3.4): на себя сразу, на другого — запрос согласия цели с резервом вещи. */
function useOnTarget(state: GameState, author: string, it: Item, target: unknown, guise: unknown, ctx: Ctx): Result {
  const t = target ?? author;
  if (typeof t !== 'string' || !presentPlayer(state, t)) return fail('not_found', String(t));
  const name = it.kind === 'shape' ? validGuise(guise) : undefined;
  if (it.kind === 'shape' && name === undefined) return fail('invalid', `облик: от 1 до ${MAX_GUISE} символов в одну строку`);
  const a = { itemId: it.id, target: t, ...(name !== undefined ? { guise: name } : {}) };
  if (t === author) return performItem(state, author, it, a, ctx);
  return requestConsent(author, { type: 'item', ...a }, [t], ctx);
}

/** Повторная проверка вещи после согласия: всё ещё у автора и в резерве этого запроса. */
export function performItemConsented(state: GameState, req: ConsentRequest, a: ItemAction, ctx: Ctx): Result {
  const it = lookup(state.items, a.itemId);
  if (!it || it.owner.type !== 'player' || it.owner.key !== req.author) return fail('not_owner', 'вещи больше нет у автора');
  if (it.reservedFor !== req.id) return fail('reserved', DETAIL.reserved);
  if (!presentPlayer(state, req.author)) return fail('forbidden', 'автора нет на ярмарке');
  if (!presentPlayer(state, a.target)) return fail('not_found', 'цели нет на ярмарке');
  return performItem(state, req.author, it, a, ctx, req.id);
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
      case 'potion': case 'shape': return useOnTarget(state, author, it, cmd.target, cmd.guise, ctx);
    }
  },
};

export const itemReducers: EventReducers = {
  ItemUsed: (state, _c, e) => acceptRequest(recordAction(applyEffects(state, e.effects), e, actOf(state)), e.requestId),
};
