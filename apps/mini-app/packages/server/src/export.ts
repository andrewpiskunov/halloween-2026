import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Content, Event, GameState } from '@fair/shared';
import type { EventStore } from './store';
import type { Game } from './game';

/** Выгрузка журнала вечера: события и итоговое состояние без личных данных. */
export interface Export { exportedAt: number; contentVersion: string; events: Event[]; state: GameState }

/**
 * Убирает личные данные (спек §5): telegramId игроков и ведущего, привязки, код ведущего (и пересданный) и коды приглашений.
 * Необязательные поля удаляются, обязательные (коды, привязки) становятся пустыми. Входы не меняются.
 */
export function stripPersonal(events: Event[], state: GameState): { events: Event[]; state: GameState } {
  const outEvents = structuredClone(events);
  for (const e of outEvents) {
    if (e.type === 'PlayerBound') delete (e as { telegramId?: number }).telegramId;
    else if (e.type === 'FairOpened') for (const p of Object.values(e.players)) delete p.telegramId;
    else if (e.type === 'SessionCreated') e.codes = {};
    else if (e.type === 'SessionReset') { e.codes = {}; delete e.gmTelegramId; }
    else if (e.type === 'InviteRebound' || e.type === 'GmReissued') e.code = '';
  }
  const outState = structuredClone(state);
  delete outState.gmTelegramId;
  outState.bindings = {};
  outState.invites = {};
  outState.gmCode = '';
  for (const p of Object.values(outState.players)) delete p.telegramId;
  return { events: outEvents, state: outState };
}

export function buildExport(store: EventStore, game: Game, content: Content, now: () => number): Export {
  const { events, state } = stripPersonal(store.all(), game.state());
  return { exportedAt: now(), contentVersion: content.version, events, state };
}

/** Имя файла автозаписи: по времени закрытия, чтобы исправления и показ перезаписывали тот же файл. */
export function exportFileName(closedAt: number): string {
  return `evening-${closedAt}.json`;
}

// Дата вечера по Москве: игра идёт там, и ночная выгрузка не должна получить вчерашнюю дату UTC.
const MOSCOW_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Имя скачиваемого файла: evening-YYYY-MM-DD.json по московской дате момента выгрузки. */
export function exportDownloadName(now: number): string {
  return `evening-${MOSCOW_DATE.format(now)}.json`;
}

/**
 * Автозапись выгрузки после закрытия ярмарки: файл появляется при закрытии и перезаписывается
 * на каждом следующем событии (показ итогов, исправления ведущего). dir null — не писать (база в памяти).
 * Ошибка записи уходит в log и не мешает игре. Возвращает отписку.
 */
export function writeExportOnClose(
  game: Game, store: EventStore, content: Content, dir: string | null, log: (...args: unknown[]) => void,
): () => void {
  if (dir === null) return () => {};
  let writtenSeq: number | undefined;
  return game.subscribe(state => {
    if (!state.closing || state.seq === writtenSeq) return;
    writtenSeq = state.seq;
    try {
      mkdirSync(dir, { recursive: true });
      const file = join(dir, exportFileName(state.closing.closedAt));
      // Через временный файл: прерванная запись не оставит обрезанный JSON.
      writeFileSync(`${file}.tmp`, JSON.stringify(buildExport(store, game, content, Date.now)));
      renameSync(`${file}.tmp`, file);
    } catch (err) {
      log('Не удалось записать выгрузку журнала', err);
    }
  });
}
