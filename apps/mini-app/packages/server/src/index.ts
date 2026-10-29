import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadContent } from '@fair/shared';
import { loadConfig } from './config';
import { EventStore } from './store';
import { Game } from './game';
import { buildApp } from './http';
import { attachWs, closeWs } from './ws';
import { startBot } from './bot';
import { writeExportOnClose } from './export';

const config = loadConfig();
if (config.dbPath !== ':memory:') mkdirSync(dirname(config.dbPath), { recursive: true });
// Поправки содержимого на вечер (имена и тексты ролей): файл по CONTENT_PATCH_PATH, см. README.
const patch = config.contentPatchPath ? JSON.parse(readFileSync(config.contentPatchPath, 'utf8')) : undefined;
const content = loadContent(JSON.parse(readFileSync(config.contentPath, 'utf8')), patch);
if (patch) console.log(`Поправки содержимого: ${config.contentPatchPath}`);
const store = new EventStore(config.dbPath);
const game = Game.open(store, content, { now: Date.now, newId: () => randomUUID(), random: Math.random });
const ticker = setInterval(() => game.tick(), 1000);

// Автозапись выгрузки рядом с базой; при базе в памяти не пишется.
const exportsDir = config.dbPath === ':memory:' ? null : join(dirname(config.dbPath), 'exports');
const stopExports = writeExportOnClose(game, store, content, exportsDir, console.warn);

const deps = { game, store, content, config, now: Date.now };
const app = buildApp(deps);
const wss = attachWs(app.server, deps);
await app.listen({ port: config.port, host: '0.0.0.0' });
console.log(`Сервер ярмарки слушает порт ${config.port}`);
if (config.allowDevAuth) console.warn('Включён dev-вход (ALLOW_DEV_AUTH): не использовать на настоящей игре');
if (game.state().gmTelegramId === undefined) console.log(`Код ведущего: ${game.gmCode()}`);
const bot = startBot(config);

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`Получен ${signal}, сервер останавливается`);
  clearInterval(ticker);
  stopExports();
  try {
    await bot?.stop();
    await closeWs(wss);
    await app.close();
  } finally {
    store.close();
    process.exit(0);
  }
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
