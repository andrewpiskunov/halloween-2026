import type { PlayerView } from '@fair/shared';
import { actionText, nameCase, offerClosedText, plainName, requestOutcomeText } from './labels';

/** Что клиент уже видел: id записей журнала, статусы просьб и сделок, число объявлений. Живёт в памяти, не в хранилище. */
export interface Seen { actions: Set<string>; requests: Map<string, string>; offers: Map<string, string>; announcements: number; story?: Map<string, string> }

/**
 * Уведомления по новой проекции (§7.5). Первая проекция (seen = null) только запоминается:
 * при подключении и переподключении старые записи не показываются.
 */
export function collectNotices(seen: Seen | null, v: PlayerView): { texts: string[]; seen: Seen } {
  const me = v.me.role.key;
  const next: Seen = {
    actions: new Set(v.actions.map(a => a.id)),
    requests: new Map(v.requests.map(r => [r.id, r.status])),
    offers: new Map(v.offers.map(o => [o.id, o.status])),
    announcements: v.announcements.length,
    story: new Map([
      ...(v.story?.messages ?? []).map(m => [`m:${m.id}`, '1'] as [string, string]),
      ...(v.story?.cards ?? []).map(c => [`c:${c.id}`, String(c.revision)] as [string, string]),
      ...(v.story?.requests ?? []).map(q => [`q:${q.id}`, String(q.revision)] as [string, string]),
    ]),
  };
  if (!seen) return { texts: [], seen: next };
  const texts: string[] = [];
  for (const m of v.story?.messages ?? []) if (!seen.story?.has(`m:${m.id}`)) texts.push(`Послание ведущего: ${m.title}`);
  for (const c of v.story?.cards ?? []) if (seen.story?.get(`c:${c.id}`) !== String(c.revision)) texts.push(`Сюжетная карточка: ${c.title}`);
  for (const q of v.story?.requests ?? []) if (q.reply && seen.story?.get(`q:${q.id}`) !== String(q.revision)) texts.push(`Ответ ведущего: ${q.title}`);
  for (const a of v.actions) {
    if (seen.actions.has(a.id)) continue;
    // Своё: только отражённая попытка, остальное автор видит сам.
    if (a.author !== me || a.outcome === 'blocked') texts.push(actionText(a, v));
  }
  for (const r of v.requests) {
    const before = seen.requests.get(r.id);
    if (before === r.status) continue;
    if (r.author === me) {
      if (r.status === 'pending') continue;
      const t = requestOutcomeText(r, v);
      if (t) texts.push(t);
    } else if (before === undefined && r.status === 'pending' && r.approvers.includes(me)) {
      texts.push(`Новая просьба от ${nameCase(plainName(r.author, v), 'gen')}`);
    }
  }
  // Сделку сервер отменил сам: ведущий отметил уход участника. Остальные закрытия видны на вкладке «Сделки».
  for (const o of v.offers) {
    if (seen.offers.get(o.id) !== 'pending') continue;
    const t = offerClosedText(o);
    if (t) texts.push(t);
  }
  // После показа итогов вкладки «События» нет: новое объявление ведущего приходит уведомлением.
  if (v.phase === 'revealed') {
    for (const a of v.announcements.slice(seen.announcements)) texts.push(`Объявление: ${a.title}`);
  }
  return { texts, seen: next };
}

/** Один toast на экране: последнее уведомление и счётчик остальных. */
export function noticeToast(texts: string[]): string | null {
  if (texts.length === 0) return null;
  const last = texts[texts.length - 1];
  return texts.length > 1 ? `${last} и ещё ${texts.length - 1}` : last;
}
