import type { GameState } from '../types';
import type { Ctx } from '../commands';
import { emptyStory, storyAct, storyCardActive, type StoryCard, type StoryChange, type StoryRequest, type StoryState } from '../story';
import { lookup, participant } from './guards';
import { fail, ok, type CommandHandlers, type EventReducers } from './result';

const text = (x: unknown, max: number, required = true): x is string => typeof x === 'string' && x.length <= max && (!required || x.trim().length > 0);
const live = (s: GameState) => storyAct(s.phase) > 0;
const open = (q: StoryRequest) => q.status === 'pending' || q.status === 'conditions';
const hasPlayer = (s: GameState, k: unknown): k is string => typeof k === 'string' && s.roster.includes(k) && !!lookup(s.players, k);
const audience = (s: GameState, keys: unknown): keys is string[] => Array.isArray(keys) && keys.length <= 30 && keys.every(k => hasPlayer(s, k)) && new Set(keys).size === keys.length;
const blocked = (s: GameState, ctx: Ctx) => ctx.actor.type !== 'gm' ? fail('forbidden') : !live(s) ? fail('phase', 'изменения сюжета доступны во время актов') : null;
const change = (s: StoryState, ctx: Ctx, label: string, fields: Omit<StoryChange, 'id' | 'at' | 'label'>) =>
  s.history.length >= 2000 ? fail('limit', 'журнал сюжетных вмешательств заполнен')
    : ok({ type: 'StoryChanged', at: ctx.now, change: { id: ctx.newId(), at: ctx.now, label, ...fields } });
const pendingCard = (s: StoryState, id: string) => Object.values(s.requests).some(q => q.cardId === id && open(q));

export const storyCommands: CommandHandlers = {
  'story.request': (state, _content, cmd, ctx) => {
    const author = participant(state, ctx.actor);
    if (!author) return fail('forbidden');
    if (!live(state)) return fail('phase');
    if (!text(cmd.title, 120) || !text(cmd.text, 2000) || !text(cmd.stake, 500, false)) return fail('invalid', 'заполните название и описание заявки');
    const s = state.story ?? emptyStory();
    if (Object.keys(s.requests).length >= 1000 || Object.values(s.requests).filter(q => q.author === author && open(q)).length >= 5) return fail('limit', 'не более пяти открытых заявок');
    let c: StoryCard | undefined;
    if (cmd.cardId !== undefined) {
      c = lookup(s.cards, cmd.cardId);
      if (!c || c.owner !== author) return fail('not_owner');
      if (!['item', 'ability'].includes(c.kind) || !storyCardActive(c, state.phase) || c.uses === 0) return fail('invalid', 'карточка сейчас недоступна');
      if (pendingCard(s, c.id)) return fail('limit', 'применение уже ожидает ведущего');
    }
    return ok({ type: 'StoryRequested', at: ctx.now, request: {
      id: ctx.newId(), revision: 1, author, title: cmd.title.trim(), text: cmd.text.trim(), stake: cmd.stake.trim(),
      status: 'pending', reply: '', at: ctx.now, ...(c ? { cardId: c.id, cardRevision: c.revision } : {}),
    } });
  },
  'story.cancel': (state, _content, cmd, ctx) => {
    if (!live(state)) return fail('phase');
    const s = state.story ?? emptyStory();
    const q = lookup(s.requests, cmd.id);
    if (!q || ctx.actor.type !== 'player' || q.author !== ctx.actor.roleKey) return fail('forbidden');
    if (!open(q) || q.revision !== cmd.revision) return fail('invalid', 'заявка уже изменилась');
    return ok({ type: 'StoryRequested', at: ctx.now, request: { ...q, revision: q.revision + 1, status: 'cancelled' } });
  },
  'story.respond': (state, _content, cmd, ctx) => {
    const denied = blocked(state, ctx); if (denied) return denied;
    const s = state.story ?? emptyStory();
    const q = lookup(s.requests, cmd.id);
    if (!q) return fail('not_found');
    if (!open(q) || q.revision !== cmd.revision) return fail('invalid', 'заявка уже изменилась, обновите решение');
    if (!['conditions', 'done', 'rejected'].includes(cmd.status) || !text(cmd.reply, 2000)) return fail('invalid', 'напишите условия или результат');
    let card: StoryChange['card'];
    if (cmd.status === 'done' && q.cardId) {
      const c = lookup(s.cards, q.cardId);
      if (!c || c.owner !== q.author || c.revision !== q.cardRevision || !storyCardActive(c, state.phase) || c.uses === 0 || !state.players[q.author]?.present) return fail('invalid', 'владелец, срок или карточка изменились; отклоните заявку и создайте новую');
      card = { before: c, after: { ...c, revision: c.revision + 1, uses: c.uses === null ? null : c.uses - 1 } };
    }
    return change(s, ctx, `Ответ: ${q.title}`, { request: { before: q, after: { ...q, revision: q.revision + 1, status: cmd.status, reply: cmd.reply.trim() } }, ...(card ? { card } : {}) });
  },
  'story.card.save': (state, _content, cmd, ctx) => {
    const denied = blocked(state, ctx); if (denied) return denied;
    const s = state.story ?? emptyStory();
    const c = cmd.card;
    if (!c || !['item', 'ability', 'state', 'goal', 'contract'].includes(c.kind)
      || !hasPlayer(state, c.owner) || !text(c.title, 120) || !text(c.text, 2000) || !text(c.price, 500, false)
      || !['private', 'public'].includes(c.visibility) || !audience(state, c.readers)
      || !(c.uses === null || Number.isInteger(c.uses) && c.uses >= 0 && c.uses <= 99)
      || !['act', 'game'].includes(c.duration) || typeof c.active !== 'boolean' || typeof c.completed !== 'boolean'
      || typeof c.replacesAbility !== 'boolean' || c.replacesAbility && c.kind !== 'ability') return fail('invalid', 'проверьте поля карточки');
    const before = cmd.id === undefined ? null : lookup(s.cards, cmd.id);
    if (before === undefined) return fail('not_found');
    if (before && (before.revision !== cmd.revision || pendingCard(s, before.id))) return fail('invalid', 'карточка изменилась или ждёт применения; сначала завершите заявку');
    if (!before && Object.keys(s.cards).length >= 300) return fail('limit');
    const after: StoryCard = {
      id: before?.id ?? ctx.newId(), revision: (before?.revision ?? 0) + 1, at: ctx.now,
      kind: c.kind, owner: c.owner, title: c.title.trim(), text: c.text.trim(), price: c.price.trim(),
      visibility: c.visibility, readers: [...c.readers], uses: c.uses, duration: c.duration,
      expiresAct: c.duration === 'act' ? storyAct(state.phase) : null,
      replacesAbility: c.replacesAbility, active: c.active, completed: c.completed,
    };
    if (after.replacesAbility && after.active && state.players[after.owner].abilityPending) return fail('invalid', 'сначала завершите просьбу по основной способности');
    return change(s, ctx, `${before ? 'Изменена' : 'Выдана'} карточка: ${after.title}`, { card: { before, after } });
  },
  'story.message': (state, _content, cmd, ctx) => {
    const denied = blocked(state, ctx); if (denied) return denied;
    if (!text(cmd.title, 120) || !text(cmd.text, 2000) || !audience(state, cmd.recipients)) return fail('invalid');
    const s = state.story ?? emptyStory();
    if (s.messages.length >= 500) return fail('limit');
    return change(s, ctx, `Сообщение: ${cmd.title.trim()}`, { message: { id: ctx.newId(), at: ctx.now, title: cmd.title.trim(), text: cmd.text.trim(), recipients: [...cmd.recipients], active: true } });
  },
  'story.side': (state, _content, cmd, ctx) => {
    const denied = blocked(state, ctx); if (denied) return denied;
    if (!hasPlayer(state, cmd.player) || !text(cmd.reason, 500) || !(cmd.side === null || cmd.side === 'free' || lookup(state.altars, cmd.side))) return fail('invalid', 'выберите сторону с доступным алтарём');
    const s = state.story ?? emptyStory();
    return change(s, ctx, `Смена стороны: ${cmd.reason.trim()}`, { side: { player: cmd.player, before: s.sides[cmd.player] ?? null, after: cmd.side } });
  },
  'story.undo': (state, _content, cmd, ctx) => {
    const denied = blocked(state, ctx); if (denied) return denied;
    const s = state.story ?? emptyStory();
    const h = s.history.find(h => h.id === cmd.id);
    if (!h || h.undone) return fail('invalid', 'изменение уже отменено');
    if (h.card && (s.cards[h.card.after.id]?.revision !== h.card.after.revision || Object.values(s.requests).some(q => q.cardId === h.card!.after.id && open(q) && q.id !== h.request?.after.id))) return fail('invalid', 'после этого карточка изменилась или ожидает применения');
    if (h.request && s.requests[h.request.after.id]?.revision !== h.request.after.revision) return fail('invalid', 'после этого заявка изменилась');
    if (h.card?.before?.replacesAbility && storyCardActive(h.card.before, state.phase) && state.players[h.card.before.owner].abilityPending) return fail('invalid', 'сначала завершите просьбу по основной способности');
    if (h.request && open(h.request.before)) {
      const q = h.request.before;
      const others = Object.values(s.requests).filter(x => x.id !== q.id && open(x));
      if (others.filter(x => x.author === q.author).length >= 5) return fail('limit', 'не более пяти открытых заявок');
      if (q.cardId && others.some(x => x.cardId === q.cardId)) return fail('invalid', 'другое применение этой карточки уже ожидает ведущего');
    }
    if (h.side && s.history.filter(x => !x.undone && x.side?.player === h.side!.player).at(-1)?.id !== h.id) return fail('invalid', 'после этого сторона изменилась');
    return ok({ type: 'StoryUndone', at: ctx.now, id: h.id });
  },
};

export const storyReducers: EventReducers = {
  StoryRequested: (state, _content, e) => {
    const s = state.story ?? emptyStory();
    return { ...state, story: { ...s, requests: { ...s.requests, [e.request.id]: e.request } } };
  },
  StoryChanged: (state, _content, e) => {
    const s = state.story ?? emptyStory();
    const h = e.change;
    const sides = { ...s.sides };
    if (h.side) { if (h.side.after === null) delete sides[h.side.player]; else sides[h.side.player] = h.side.after; }
    return { ...state, story: {
      ...s, sides, history: [...s.history, h],
      cards: h.card ? { ...s.cards, [h.card.after.id]: h.card.after } : s.cards,
      requests: h.request ? { ...s.requests, [h.request.after.id]: h.request.after } : s.requests,
      messages: h.message ? [...s.messages, h.message] : s.messages,
    } };
  },
  StoryUndone: (state, _content, e) => {
    const s = state.story!;
    const h = s.history.find(h => h.id === e.id)!;
    const cards = { ...s.cards }, requests = { ...s.requests }, sides = { ...s.sides };
    if (h.card) {
      const id = h.card.after.id;
      if (h.card.before) cards[id] = { ...h.card.before, revision: cards[id].revision + 1 };
      else delete cards[id];
    }
    if (h.request) requests[h.request.before.id] = {
      ...h.request.before, revision: requests[h.request.before.id].revision + 1,
      ...(h.card ? { cardRevision: cards[h.card.after.id].revision } : {}),
    };
    if (h.side) { if (h.side.before === null) delete sides[h.side.player]; else sides[h.side.player] = h.side.before; }
    return { ...state, story: { ...s, cards, requests, sides,
      messages: h.message ? s.messages.map(m => m.id === h.message!.id ? { ...m, active: false } : m) : s.messages,
      history: s.history.map(x => x.id === h.id ? { ...x, undone: true } : x),
    } };
  },
};
