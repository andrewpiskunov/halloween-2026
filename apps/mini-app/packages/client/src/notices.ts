import type { PlayerView } from '@fair/shared';
import { actionText, nameCase, plainName, requestOutcomeText } from './labels';

/** Что клиент уже видел: id записей журнала, статусы просьб и число объявлений. Живёт в памяти, не в хранилище. */
export interface Seen { actions: Set<string>; requests: Map<string, string>; announcements: number }

/**
 * Уведомления по новой проекции (§7.5). Первая проекция (seen = null) только запоминается:
 * при подключении и переподключении старые записи не показываются.
 */
export function collectNotices(seen: Seen | null, v: PlayerView): { texts: string[]; seen: Seen } {
  const me = v.me.role.key;
  const next: Seen = {
    actions: new Set(v.actions.map(a => a.id)),
    requests: new Map(v.requests.map(r => [r.id, r.status])),
    announcements: v.announcements.length,
  };
  if (!seen) return { texts: [], seen: next };
  const texts: string[] = [];
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
