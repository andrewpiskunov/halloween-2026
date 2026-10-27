// Дочерний сервер ярмарки для прогона (спецификация этапа 6, §2.1): свободный порт, бинарник tsx без обёртки pnpm.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const TSX = fileURLToPath(new URL('../node_modules/.bin/tsx', import.meta.url));
const SERVER_DIR = fileURLToPath(new URL('../../server/', import.meta.url));
const SERVER_ENTRY = fileURLToPath(new URL('../../server/src/index.ts', import.meta.url));
const HEALTH_TIMEOUT_MS = 20_000;
const KILL_AFTER_MS = 5_000;

export interface ChildServer { baseUrl: string; stop(): Promise<void> }

/** Свободный порт: слушаем 0 и сразу закрываем. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Запускает сервер на базе dbPath. Окружение задаётся явно: сервер читает apps/mini-app/.env, и без пустого
 * BOT_TOKEN и BOT_POLLING=0 дочерний сервер мог бы начать опрашивать настоящего бота.
 * Вывод сервера копится в памяти и печатается только при ошибке запуска.
 */
export async function startChildServer(opts: { dbPath: string; port?: number }): Promise<ChildServer> {
  const port = opts.port ?? await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(TSX, [SERVER_ENTRY], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      DB_PATH: opts.dbPath, ALLOW_DEV_AUTH: '1', SESSION_SECRET: 'sim', BOT_POLLING: '0', BOT_TOKEN: '', PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', d => { output += String(d); });
  child.stderr.on('data', d => { output += String(d); });
  const exited = new Promise<number | null>(resolve => child.once('exit', code => resolve(code)));
  let alive = true;
  void exited.then(() => { alive = false; });

  const stop = async () => {
    if (!alive) return;
    child.kill('SIGTERM');
    const timer = setTimeout(() => { if (alive) child.kill('SIGKILL'); }, KILL_AFTER_MS);
    await exited;
    clearTimeout(timer);
  };

  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!alive) throw new Error(`сервер завершился при запуске:\n${output}`);
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return { baseUrl, stop };
    } catch { /* ещё не слушает */ }
    await new Promise(r => setTimeout(r, 200));
  }
  await stop();
  throw new Error(`сервер не ответил на /api/health за ${HEALTH_TIMEOUT_MS / 1000} с:\n${output}`);
}
