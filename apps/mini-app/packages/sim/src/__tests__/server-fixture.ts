// Сервер ярмарки в процессе для тестов симулятора: HTTP и WebSocket на свободном порту, журнал в памяти.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { WebSocketServer } from 'ws';
import { loadContent, type Content } from '@fair/shared';
import { defaultContentPath } from '@fair/shared/node';
import type { Config } from '@fair/server/src/config';
import { EventStore } from '@fair/server/src/store';
import { Game, type GameOpts } from '@fair/server/src/game';
import { buildApp } from '@fair/server/src/http';
import { attachWs, closeWs } from '@fair/server/src/ws';

export interface TestServer {
  base: string;
  store: EventStore;
  game: Game;
  content: Content;
  opts: GameOpts;
  wss: WebSocketServer;
  close(): Promise<void>;
}

const config: Config = {
  botToken: '', botName: 'test_bot', sessionSecret: 'test', clientUrl: 'http://localhost',
  dbPath: ':memory:', contentPath: '', contentPatchPath: '', port: 0, allowDevAuth: true, botPolling: false,
};

/** Как в index.ts: часы Date.now, id из randomUUID, раз в секунду tick; случайность фиксирована. */
export async function startServer(): Promise<TestServer> {
  const content = loadContent(JSON.parse(readFileSync(defaultContentPath(), 'utf8')));
  const opts: GameOpts = { now: Date.now, newId: () => randomUUID(), random: () => 0.5 };
  const store = new EventStore(':memory:');
  const game = Game.open(store, content, opts);
  const ticker = setInterval(() => game.tick(), 1000);
  const deps = { game, store, content, config, now: Date.now };
  const app = buildApp(deps);
  const wss = attachWs(app.server, deps);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  return {
    base, store, game, content, opts, wss,
    async close() {
      clearInterval(ticker);
      await closeWs(wss);
      await app.close();
      store.close();
    },
  };
}
