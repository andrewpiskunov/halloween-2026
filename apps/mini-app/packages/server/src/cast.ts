import { readFileSync } from 'node:fs';
import { execute, reduce, type Content, type Event, type GameState } from '@fair/shared';

interface CastPatch { excludedRoles: string[]; replacements: [string, string][] }

/** Вариант вымышленного состава. Исходная книга остаётся доступной для полной партии. */
export function applyCast(content: Content, name?: string): Content {
  if (!name) return content;
  if (name !== 'without-iva') throw new Error(`Неизвестный вариант состава: ${name}`);
  if (content.hidden17?.rulesVersion !== 2 || !content.hidden17.narrative) throw new Error('Вариант состава требует актуальной сюжетной редакции');
  const patch: CastPatch = JSON.parse(readFileSync(new URL(`../../../content/casts/${name}.json`, import.meta.url), 'utf8'));
  const excluded = new Set(patch.excludedRoles);
  const rewrite = (value: unknown): unknown => {
    if (typeof value === 'string') return patch.replacements.reduce((text, [from, to]) => text.split(from).join(to), value);
    if (Array.isArray(value)) return value.filter(v => !excluded.has(v) && !(v && typeof v === 'object' && (excluded.has(v.key) || excluded.has(v.role))))
      .map(rewrite);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !excluded.has(key)).map(([key, v]) => [key, rewrite(v)]));
    return value;
  };
  const result = rewrite(content) as Content;
  // Архивный справочник нужен при воспроизведении уже записанных событий. Клиент его не получает.
  result.roleByKey = { ...content.roleByKey, ...Object.fromEntries(result.roles.map(r => [r.key, r])) };
  result.hidden17!.excludedRoles = [...excluded];
  return result;
}

/** Одноразовое, записываемое в журнал исключение роли без пересоздания партии. */
export function reconcileCast(state: GameState, content: Content, opts: { now(): number; newId(): string; random(): number }): Event[] {
  const removed = (content.hidden17?.excludedRoles ?? []).filter(key => state.roster.includes(key));
  if (!removed.length) return [];
  if (state.hidden17?.rulesVersion !== 2 || state.hidden17.ritual.step !== 'preparation' || !['setup', 'act1', 'act2', 'act3'].includes(state.phase)) {
    throw new Error('Менять состав можно только до начала обряда в текущей редакции');
  }
  const events: Event[] = [];
  let next = state;
  const at = opts.now();
  for (const roleKey of removed) {
    const left = execute(next, content, { type: 'player.setPresent', roleKey, present: false }, { ...opts, now: at, actor: { type: 'gm' } });
    if (!left.ok) throw new Error(`Не удалось исключить роль: ${left.detail ?? left.error}`);
    events.push(...left.events);
    next = left.state;
  }
  next = structuredClone(next);
  for (const key of removed) {
    // Старые незавершённые услуги требуют отдельного решения, а не потери резервов.
    const h = next.hidden17!;
    if (Object.values(h.production).some(p => p.status === 'pending' && (p.maker === key || p.customer === key)) ||
        Object.values(h.uses).some(u => u.status === 'pending' && (u.author === key || u.targets.includes(key))) ||
        Object.values(h.board).some(b => ['open', 'accepted'].includes(b.status) && (b.author === key || b.worker === key)) ||
        Object.values(h.dice).some(d => ['pending', 'accepted', 'started'].includes(d.status) && (d.from === key || d.to === key))) {
      throw new Error('Сначала завершите незаконченные услуги исключаемой роли');
    }
    for (const lot of Object.values(next.lots)) if (['announced', 'openBidding', 'sealedBidding'].includes(lot.status)) {
      const bid = lot.bids.find(b => b.player === key);
      if (bid) next.players[key].reservedGold -= bid.amount;
      lot.bids = lot.bids.filter(b => b.player !== key);
    }
    for (const item of Object.values(next.items)) if (item.owner.type === 'player' && item.owner.key === key) {
      if (item.reservedFor) throw new Error('У вещи исключаемой роли остался резерв');
      const id = opts.newId();
      item.owner = { type: 'lot', id };
      delete item.hiddenUntilAct;
      next.lots[id] = { id, items: [item.id], act: 1, status: 'announced', bids: [] };
      h.ritual.circle = h.ritual.circle.filter(held => held !== item.id);
      h.ritual.focuses = h.ritual.focuses.filter(held => held !== item.id);
    }
    delete next.invites[key];
    delete next.bindings[key];
    if (h.fair) delete h.fair.admissions[key];
  }
  next.roster = next.roster.filter(key => !removed.includes(key));
  next.nPresent = next.roster.filter(key => next.players[key]?.present).length;
  const { roster, players, items, lots, invites, bindings, nPresent, hidden17 } = next;
  events.push({ type: 'Hidden17Changed', at, action: 'cast.exclude', patch: { roster, players, items, lots, invites, bindings, nPresent, hidden17 } });
  // Проверка применимости до того, как вызывающая сторона запишет события атомарно.
  events.reduce((s, e) => reduce(s, content, e), state);
  return events;
}
