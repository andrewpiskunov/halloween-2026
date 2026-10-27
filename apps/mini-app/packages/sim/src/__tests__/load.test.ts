// Нагрузочный прогон (спецификация этапа 7, §9): 5 ботов, 15 с, интервал 1 с против сервера в процессе.
import { beforeAll, expect, test } from 'vitest';
import type { BotConn } from '../client';
import { evaluateLoad, runLoad, type LoadResult } from '../load';
import { renderLoadReport } from '../load-report';
import { startServer } from './server-fixture';

const OPTS = { players: 5, seconds: 15, intervalMs: 1000, seed: 1 };

/** Прогон на свежем сервере; dropAtMs — тест сам закрывает сокет первого бота в середине прогона. */
async function run(dropAtMs?: number): Promise<{ result: LoadResult; baseUrl: string }> {
  const server = await startServer();
  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await runLoad({
      ...OPTS, baseUrl: server.base,
      onBots: (bots: BotConn[]) => {
        if (dropAtMs !== undefined) timer = setTimeout(() => bots[0].close(), dropAtMs);
      },
    });
    return { result, baseUrl: server.base };
  } finally {
    clearTimeout(timer);
    await server.close();
  }
}

let clean: { result: LoadResult; baseUrl: string };
let dropped: { result: LoadResult; baseUrl: string };

// Два прогона на двух серверах параллельно: 15 с вместо 30.
beforeAll(async () => { [clean, dropped] = await Promise.all([run(), run(7000)]); }, 40_000);

test('5 ботов за 15 с: одна минута, команды идут, переподключений нет, критерии выполнены', () => {
  const { result } = clean;
  expect(result.failures).toEqual([]);
  expect(result.ok).toBe(true);
  expect(result.reconnects).toBe(0);
  expect(result.minutes).toHaveLength(1);
  const [m] = result.minutes;
  expect(m.minute).toBe(1);
  expect(m.commands).toBeGreaterThan(20);
  expect(m.p50).toBeLessThanOrEqual(m.p95);
  expect(m.p95).toBeLessThanOrEqual(m.max);
  expect(m.player).toBeGreaterThan(0);
  expect(m.gm).toBeGreaterThan(m.player);
  // Сервер в процессе с dev-входом: health отдаёт память.
  expect(m.rss).toBeGreaterThan(0);
});

test('закрытый сокет одного бота: одно переподключение, прогон не прерван, критерий нарушен', () => {
  const { result } = dropped;
  expect(result.reconnects).toBe(1);
  expect(result.ok).toBe(false);
  expect(result.failures.some(f => f.includes('переподключение'))).toBe(true);
  // Остальные боты продолжили: команд всё равно много.
  expect(result.minutes[0].commands).toBeGreaterThan(20);
});

test('критерии §9: p95 за любую минуту, рост памяти от второй минуты к последней', () => {
  const row = (minute: number, p95: number, rss: number | null) => ({ minute, commands: 10, p50: 1, p95, max: p95, player: 1, gm: 2, rss });
  expect(evaluateLoad([row(1, 20, 100)], 0)).toEqual([]);
  // Меньше двух минут — память не сравнивается.
  expect(evaluateLoad([row(1, 20, 900)], 0)).toEqual([]);
  const slow = evaluateLoad([row(1, 20, 100), row(2, 301, 100), row(3, 20, 150)], 0);
  expect(slow).toHaveLength(1);
  expect(slow[0]).toMatch(/p95/);
  const leak = evaluateLoad([row(1, 20, 50), row(2, 20, 100), row(3, 20, 151)], 0);
  expect(leak).toHaveLength(1);
  expect(leak[0]).toMatch(/rss/);
  expect(evaluateLoad([row(1, 20, 50), row(2, 20, 100), row(3, 20, 150)], 0)).toEqual([]);
  // Без памяти (сервер без dev-входа) — проверка памяти пропускается.
  expect(evaluateLoad([row(1, 20, null), row(2, 20, null), row(3, 20, null)], 0)).toEqual([]);
  expect(evaluateLoad([row(1, 20, 100)], 2)[0]).toMatch(/переподключени/);
});

test('отчёт: таблица по минутам и итог', () => {
  const meta = { ...OPTS, baseUrl: clean.baseUrl };
  const md = renderLoadReport(clean.result, meta);
  expect(md).toContain('| Минута | Команд | p50, мс | p95, мс | max, мс | Игрок, КБ (макс.) | Ведущий, КБ (макс.) | rss, МБ |');
  expect(md).toMatch(/\n\| 1 \| \d+ \|/);
  expect(md).toContain('Итог: критерии выполнены.');
  const bad = renderLoadReport(dropped.result, { ...meta });
  expect(bad).toContain('Итог: критерии нарушены.');
  expect(bad).toMatch(/- .*переподключени/);
});
