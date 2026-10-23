import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultContentPath } from '@fair/shared/node';

export interface Config {
  botToken: string; botName: string; sessionSecret: string; clientUrl: string;
  dbPath: string; contentPath: string; port: number; allowDevAuth: boolean; botPolling: boolean;
}

/** apps/mini-app/.env относительно этого файла. */
export const DEFAULT_ENV_FILE = fileURLToPath(new URL('../../../.env', import.meta.url));
const DEV_SECRET = 'dev-only-session-secret';

/** Простой разбор .env: строки KEY=VALUE, комментарии #, необязательные кавычки. */
export function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0])) value = value.slice(1, -1);
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

const flag = (v: string | undefined) => v === '1' || v?.toLowerCase() === 'true';

/** Конфигурация сервера: переменные окружения важнее значений из .env. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, envFile = DEFAULT_ENV_FILE): Config {
  const file = parseEnvFile(envFile);
  const get = (key: string) => {
    const v = env[key];
    return v !== undefined && v !== '' ? v : (file[key] ?? '');
  };
  const allowDevAuth = flag(get('ALLOW_DEV_AUTH'));
  let sessionSecret = get('SESSION_SECRET');
  if (!sessionSecret) {
    if (!allowDevAuth) throw new Error('SESSION_SECRET не задан');
    console.warn('SESSION_SECRET не задан: используется фиксированный секрет для разработки');
    sessionSecret = DEV_SECRET;
  }
  // Без токена бота подпись initData не проверить: войти смог бы только dev-вход.
  if (!get('BOT_TOKEN') && !allowDevAuth) throw new Error('BOT_TOKEN не задан');
  const port = Number(get('PORT') || 8080);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Некорректный PORT: ${get('PORT')}`);
  return {
    botToken: get('BOT_TOKEN'),
    botName: get('BOT_NAME'),
    sessionSecret,
    clientUrl: get('CLIENT_URL'),
    dbPath: get('DB_PATH') || './data/session.sqlite',
    contentPath: get('CONTENT_PATH') || defaultContentPath(),
    port,
    allowDevAuth,
    botPolling: flag(get('BOT_POLLING')),
  };
}
