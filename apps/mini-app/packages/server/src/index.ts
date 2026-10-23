import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadContent } from '@fair/shared';
import { loadConfig } from './config';
import { EventStore } from './store';
import { Game } from './game';
import { buildApp } from './http';
import { attachWs, closeWs } from './ws';
import { startBot } from './bot';

const config = loadConfig();
if (config.dbPath !== ':memory:') mkdirSync(dirname(config.dbPath), { recursive: true });
const content = loadContent(JSON.parse(readFileSync(config.contentPath, 'utf8')));
const store = new EventStore(config.dbPath);
const game = Game.open(store, content, { now: Date.now, newId: () => randomUUID(), random: Math.random });
const ticker = setInterval(() => game.tick(), 1000);

const deps = { game, content, config, now: Date.now };
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
