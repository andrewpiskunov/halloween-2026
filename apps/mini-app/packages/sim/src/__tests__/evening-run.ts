// Прогон вечера на 12 игроках (зерно 1) против сервера в процессе: общий для тестов вечера и отчёта.
import { Game } from '@fair/server/src/game';
import type { Content } from '@fair/shared';
import { runEvening, type EveningResult } from '../evening';
import { startServer } from './server-fixture';

/** Поднимает сервер, гоняет вечер с воспроизведением журнала и проверкой золота, останавливает сервер. */
export async function runTwelve(): Promise<{ result: EveningResult; content: Content; baseUrl: string }> {
  const server = await startServer();
  try {
    const { store, content, opts } = server;
    const result = await runEvening({
      baseUrl: server.base, players: 12, seed: 1,
      replay: async () => Game.open(store, content, opts).state(),
      events: async () => store.all(),
    });
    return { result, content, baseUrl: server.base };
  } finally {
    await server.close();
  }
}
