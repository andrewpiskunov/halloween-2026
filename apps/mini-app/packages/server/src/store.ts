import Database from 'better-sqlite3';
import type { Event } from '@fair/shared';

/** Журнал событий сессии, результаты команд и служебные значения в SQLite. */
export class EventStore {
  private readonly db: Database.Database;
  private readonly insertEvent: Database.Statement;
  private readonly lastSeq: Database.Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    if (dbPath !== ':memory:') this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, type TEXT NOT NULL, at INTEGER NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS results (cmd_id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    this.insertEvent = this.db.prepare('INSERT INTO events (seq, type, at, body) VALUES (?, ?, ?, ?)');
    this.lastSeq = this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM events');
  }

  /** Дописывает события по порядку в одной транзакции и возвращает их с проставленным seq. */
  append(events: Event[]): Event[] {
    return this.db.transaction((list: Event[]) => this.insert(list))(events);
  }

  /**
   * Атомарно дописывает события и сохраняет результат команды cmdId:
   * результат строится по записанным событиям (с seq). Исключение откатывает всё.
   */
  commit(events: Event[], cmdId: string, result: (stored: Event[]) => unknown): Event[] {
    return this.db.transaction((list: Event[]) => {
      const stored = this.insert(list);
      this.saveResult(cmdId, result(stored));
      return stored;
    })(events);
  }

  /** Вставка без собственной транзакции: вызывать только внутри db.transaction. */
  private insert(list: Event[]): Event[] {
    let seq = (this.lastSeq.get() as { seq: number }).seq;
    return list.map(e => {
      const { seq: _ignored, ...rest } = e;
      this.insertEvent.run(++seq, e.type, e.at, JSON.stringify(rest));
      return { ...rest, seq } as Event;
    });
  }

  /** Все события в порядке seq. */
  all(): Event[] {
    const rows = this.db.prepare('SELECT seq, body FROM events ORDER BY seq').all() as { seq: number; body: string }[];
    return rows.map(r => ({ ...JSON.parse(r.body), seq: r.seq }) as Event);
  }

  saveResult(cmdId: string, result: unknown): void {
    this.db.prepare('INSERT OR REPLACE INTO results (cmd_id, body) VALUES (?, ?)').run(cmdId, JSON.stringify(result));
  }

  getResult(cmdId: string): unknown | undefined {
    const row = this.db.prepare('SELECT body FROM results WHERE cmd_id = ?').get(cmdId) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }

  saveMeta(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value);
  }

  getMeta(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }

  close(): void {
    this.db.close();
  }
}
