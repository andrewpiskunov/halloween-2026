// CLI прогона вечера (спецификация этапа 6, §2.1): pnpm sim -- --players 30 --seed 7 [--url адрес] [--out папка] [--keep].
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadContent, type GmView } from '@fair/shared';
import { defaultContentPath } from '@fair/shared/node';
import { EventStore } from '@fair/server/src/store';
import { Game } from '@fair/server/src/game';
import { startChildServer, type ChildServer } from './child-server';
import { fetchCodes, openBot } from './client';
import { GM_USER_ID, runEvening, type EveningOptions, type EveningResult } from './evening';
import { renderReport } from './report';

interface CliArgs { players: 12 | 30; seed: number; url?: string; out: string; keep: boolean }

/** Разбор параметров; ошибка — понятное сообщение. */
function parseCli(argv: string[]): CliArgs {
  const { values } = parseArgs({
    args: argv.filter(a => a !== '--'),
    options: {
      players: { type: 'string', default: '12' },
      seed: { type: 'string', default: '1' },
      url: { type: 'string' },
      out: { type: 'string', default: './sim-out' },
      keep: { type: 'boolean', default: false },
    },
    strict: true,
  });
  const players = Number(values.players);
  if (players !== 12 && players !== 30) throw new Error(`--players: 12 или 30, получено ${values.players}`);
  const seed = Number(values.seed);
  if (!Number.isInteger(seed)) throw new Error(`--seed: целое число, получено ${values.seed}`);
  return { players, seed, url: values.url?.replace(/\/+$/, ''), out: resolve(values.out!), keep: values.keep! };
}

/**
 * Режим --url: сервер отвечает, фаза setup, ведущий не привязан или привязан к userId ведущего симулятора.
 * Вход ведущего с кодом из /api/dev/codes: если ведущий привязан к другому аккаунту, роль не выдаётся.
 */
async function checkForeignServer(baseUrl: string): Promise<void> {
  const health = await fetch(`${baseUrl}/api/health`).catch((err: Error) => { throw new Error(`сервер ${baseUrl} не отвечает: ${err.message}`); });
  if (!health.ok) throw new Error(`GET /api/health: HTTP ${health.status}`);
  const codes = await fetchCodes(baseUrl);
  const gm = await openBot(baseUrl, GM_USER_ID, codes.gm).catch((err: Error) => {
    throw new Error(`ведущий привязан к другому аккаунту или dev-вход недоступен: ${err.message}`);
  });
  try {
    if (gm.actor.type !== 'gm') throw new Error('код ведущего не дал роль ведущего');
    const phase = (gm.view() as GmView).state.phase;
    if (phase !== 'setup') throw new Error(`фаза ${phase}, нужна setup: прогон идёт только на свежей сессии`);
  } finally {
    gm.close();
  }
}

/** Выжимка в stdout. */
function summary(result: EveningResult, durationMs: number, reportPath: string): string {
  const c = result.coverage;
  const missing = [...c.missingCommands, ...c.missingAbilities, ...c.missingItems];
  return [
    `Прогон: ${result.ok ? 'ок' : 'ошибка'}`,
    ...result.checks.filter(x => !x.ok).map(x => `  ${x.name}: ${x.details.join('; ')}`),
    `Длительность: ${(durationMs / 1000).toFixed(1)} с, команд ${result.commands.length}`,
    `Время ответа: p50 ${result.timing.p50} мс, p95 ${result.timing.p95} мс, максимум ${result.timing.max} мс`,
    `Проекции: игрок ${(result.sizes.player / 1024).toFixed(1)} КБ, ведущий ${(result.sizes.gm / 1024).toFixed(1)} КБ`,
    `Не покрыто: ${missing.length ? missing.join(', ') : 'нет'}`,
    `Предупреждения: ${result.warnings.length ? result.warnings.join('; ') : 'нет'}`,
    `Пропущено: ${result.skipped.length ? result.skipped.join('; ') : 'нет'}`,
    `Вопросы владельцу: ${result.questions.length ? result.questions.length : 'нет'}`,
    ...result.questions.map(q => `  - ${q}`),
    `Отчёт: ${reportPath}`,
  ].join('\n');
}

async function main(): Promise<number> {
  const args = parseCli(process.argv.slice(2));
  mkdirSync(args.out, { recursive: true });
  const name = `evening-${args.players}-${args.seed}`;
  const dbPath = resolve(args.out, `${name}.sqlite`);
  const reportPath = resolve(args.out, `${name}.md`);
  const content = loadContent(JSON.parse(readFileSync(defaultContentPath(), 'utf8')));

  let server: ChildServer | undefined;
  let baseUrl: string;
  const opts: Partial<EveningOptions> = {};
  if (args.url) {
    baseUrl = args.url;
    await checkForeignServer(baseUrl);
  } else {
    for (const suffix of ['', '-wal', '-shm']) rmSync(dbPath + suffix, { force: true });
    server = await startChildServer({ dbPath });
    baseUrl = server.baseUrl;
    const child = server;
    // Воспроизведение и журнал — после остановки сервера: база закрыта, журнал полон.
    const fromDb = async <T>(read: (store: EventStore) => T): Promise<T> => {
      await child.stop();
      const store = new EventStore(dbPath);
      try { return read(store); } finally { store.close(); }
    };
    // Те же часы, id и случайность, что у настоящего сервера (index.ts); это не решения ботов.
    opts.replay = () => fromDb(store => Game.open(store, content, { now: Date.now, newId: () => randomUUID(), random: Math.random }).state());
    opts.events = () => fromDb(store => store.all());
  }

  const started = performance.now();
  let result: EveningResult;
  try {
    result = await runEvening({ baseUrl, players: args.players, seed: args.seed, ...opts });
  } finally {
    await server?.stop();
  }
  const durationMs = Math.round(performance.now() - started);
  writeFileSync(reportPath, renderReport(result, { players: args.players, seed: args.seed, baseUrl, durationMs, replaySkipped: !!args.url }, content));
  if (!args.keep && !args.url) for (const suffix of ['', '-wal', '-shm']) if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix);
  console.log(summary(result, durationMs, reportPath));
  return result.ok ? 0 : 1;
}

main().then(code => process.exit(code), (err: Error) => {
  console.error(`Прогон прерван: ${err.message}`);
  process.exit(1);
});
