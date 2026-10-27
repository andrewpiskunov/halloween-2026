// CLI нагрузочного прогона (спецификация этапа 7, §9):
// pnpm sim:load -- --players 30 --minutes 10 --seed 1 [--url адрес] [--out папка] [--interval 10] [--keep].
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { startChildServer, type ChildServer } from './child-server';
import { runLoad, type LoadResult } from './load';
import { loadVerdict, renderLoadReport, type LoadMeta } from './load-report';

interface LoadArgs { players: number; minutes: number; seed: number; intervalS: number; url?: string; out: string; keep: boolean }

function parseCli(argv: string[]): LoadArgs {
  const { values } = parseArgs({
    args: argv.filter(a => a !== '--'),
    options: {
      players: { type: 'string', default: '30' },
      minutes: { type: 'string', default: '10' },
      seed: { type: 'string', default: '1' },
      interval: { type: 'string', default: '10' },
      url: { type: 'string' },
      out: { type: 'string', default: './sim-out' },
      keep: { type: 'boolean', default: false },
    },
    strict: true,
  });
  const players = Number(values.players);
  if (!Number.isInteger(players) || players < 1 || players > 30) throw new Error(`--players: от 1 до 30, получено ${values.players}`);
  const minutes = Number(values.minutes);
  if (!(minutes > 0)) throw new Error(`--minutes: больше нуля, получено ${values.minutes}`);
  const seed = Number(values.seed);
  if (!Number.isInteger(seed)) throw new Error(`--seed: целое число, получено ${values.seed}`);
  const intervalS = Number(values.interval);
  if (!(intervalS > 0)) throw new Error(`--interval: секунды больше нуля, получено ${values.interval}`);
  return { players, minutes, seed, intervalS, url: values.url?.replace(/\/+$/, ''), out: resolve(values.out!), keep: values.keep! };
}

/** Выжимка в stdout: итог, таблица по минутам в строках, нарушенные критерии. */
function summary(result: LoadResult, meta: LoadMeta, reportPath: string): string {
  const kb = (b: number) => (b / 1024).toFixed(1);
  const mb = (b: number | null) => (b === null ? '—' : (b / 1024 / 1024).toFixed(1));
  return [
    `Нагрузка: ${loadVerdict(result)} (${meta.players} ботов, ${meta.seconds} с, интервал ${meta.intervalMs} мс, зерно ${meta.seed})`,
    ...result.minutes.map(m =>
      `  минута ${m.minute}: команд ${m.commands}, p50 ${m.p50} мс, p95 ${m.p95} мс, max ${m.max} мс, игрок ${kb(m.player)} КБ, ведущий ${kb(m.gm)} КБ, rss ${mb(m.rss)} МБ`),
    `Переподключений: ${result.reconnects}`,
    ...result.failures.map(f => `  нарушено: ${f}`),
    `Отчёт: ${reportPath}`,
  ].join('\n');
}

async function main(): Promise<number> {
  const args = parseCli(process.argv.slice(2));
  mkdirSync(args.out, { recursive: true });
  const name = `load-${args.players}-${args.minutes}`;
  const reportPath = resolve(args.out, `${name}.md`);
  const dbPath = resolve(args.out, `${name}.sqlite`);

  let server: ChildServer | undefined;
  let baseUrl: string;
  if (args.url) {
    baseUrl = args.url;
  } else {
    for (const suffix of ['', '-wal', '-shm']) rmSync(dbPath + suffix, { force: true });
    server = await startChildServer({ dbPath });
    baseUrl = server.baseUrl;
  }
  const meta: LoadMeta = { players: args.players, seconds: Math.round(args.minutes * 60), intervalMs: Math.round(args.intervalS * 1000), seed: args.seed, baseUrl };
  let result: LoadResult;
  try {
    result = await runLoad({ ...meta });
  } finally {
    await server?.stop();
    // Без --keep база и папка выгрузок дочернего сервера (exports рядом с базой) удаляются, как в pnpm sim.
    if (server && !args.keep) {
      for (const suffix of ['', '-wal', '-shm']) rmSync(dbPath + suffix, { force: true });
      rmSync(resolve(args.out, 'exports'), { recursive: true, force: true });
    }
  }
  writeFileSync(reportPath, renderLoadReport(result, meta));
  console.log(summary(result, meta, reportPath));
  return result.ok ? 0 : 1;
}

main().then(code => process.exit(code), (err: Error) => {
  console.error(`Нагрузочный прогон прерван: ${err.message}`);
  process.exit(1);
});
