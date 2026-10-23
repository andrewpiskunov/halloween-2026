import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { Event } from '@fair/shared';
import { EventStore } from '../store';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const ev = (text: string, at: number): Event => ({ type: 'Announced', at, text } as unknown as Event);

test('append проставляет seq 1,2,3; all после переоткрытия того же файла возвращает их', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fair-store-'));
  dirs.push(dir);
  const path = join(dir, 'session.sqlite');

  const store = new EventStore(path);
  const first = store.append([ev('a', 1), ev('b', 2)]);
  const second = store.append([ev('c', 3)]);
  expect([...first, ...second].map(e => e.seq)).toEqual([1, 2, 3]);
  store.saveResult('cmd-1', { ok: true, seq: 3 });
  store.saveMeta('gmCode', 'XYZ');
  store.close();

  const reopened = new EventStore(path);
  const all = reopened.all();
  expect(all.map(e => e.seq)).toEqual([1, 2, 3]);
  expect(all.map(e => (e as unknown as { text: string }).text)).toEqual(['a', 'b', 'c']);
  expect(all[2]).toEqual({ type: 'Announced', at: 3, text: 'c', seq: 3 });
  expect(reopened.getResult('cmd-1')).toEqual({ ok: true, seq: 3 });
  expect(reopened.getResult('нет')).toBeUndefined();
  expect(reopened.getMeta('gmCode')).toBe('XYZ');
  expect(reopened.getMeta('нет')).toBeUndefined();
  reopened.close();
});

test('commit пишет события и результат в одной транзакции', () => {
  const store = new EventStore(':memory:');
  store.append([ev('a', 1)]);
  const stored = store.commit([ev('b', 2), ev('c', 3)], 'cmd-1', s => ({ ok: true, seq: s[s.length - 1].seq }));
  expect(stored.map(e => e.seq)).toEqual([2, 3]);
  expect(store.all()).toHaveLength(3);
  expect(store.getResult('cmd-1')).toEqual({ ok: true, seq: 3 });
  store.close();
});

test('ошибка внутри commit: ни событий, ни результата не остаётся', () => {
  const store = new EventStore(':memory:');
  store.append([ev('a', 1)]);
  expect(() => store.commit([ev('b', 2)], 'cmd-x', () => { throw new Error('сбой'); })).toThrow('сбой');
  expect(store.all().map(e => e.seq)).toEqual([1]);
  expect(store.getResult('cmd-x')).toBeUndefined();
  // Следующая запись получает seq 2, будто сбойной не было.
  expect(store.append([ev('c', 3)])[0].seq).toBe(2);
  store.close();
});
