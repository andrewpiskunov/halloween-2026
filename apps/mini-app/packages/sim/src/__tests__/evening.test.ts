import { afterAll, beforeAll, expect, test } from 'vitest';
import { Game } from '@fair/server/src/game';
import { runEvening } from '../evening';
import { startServer, type TestServer } from './server-fixture';

let server: TestServer;

beforeAll(async () => { server = await startServer(); });
afterAll(async () => { await server.close(); });

test('вечер на 12: сценарий проходит, проверки зелёные, покрытие полное', async () => {
  const { store, content, opts } = server;
  const result = await runEvening({
    baseUrl: server.base, players: 12, seed: 1,
    replay: async () => Game.open(store, content, opts).state(),
    events: async () => store.all(),
  });

  const failed = result.checks.filter(c => !c.ok).map(c => `${c.name}: ${c.details.join('; ')}`);
  expect(failed).toEqual([]);
  expect(result.ok).toBe(true);
  expect(result.coverage.missingCommands).toEqual([]);
  expect(result.coverage.missingAbilities).toEqual([]);
  expect(result.coverage.missingItems).toEqual([]);
  expect(result.finalState.phase).toBe('revealed');

  // Review Focus 1: сверка проекций после каждого акта, после закрытия и показа.
  for (const label of ['act1', 'act2', 'act3', 'closed', 'revealed']) {
    const check = result.checks.find(c => c.name === `views:${label}`);
    expect(check, label).toBeDefined();
    expect(check!.ok, `${label}: ${check!.details.join('; ')}`).toBe(true);
  }
  // Review Focus 2: смена акта не закрыла ни одной просьбы.
  const byAct = Object.values(result.finalState.requests).filter(r => r.status === 'expired' && r.reason === 'act');
  expect(byAct).toEqual([]);

  // Проверки с внешними источниками не пропущены.
  expect(result.checks.find(c => c.name === 'replay')?.details.join(' ')).not.toMatch(/пропущ/);
  expect(result.checks.find(c => c.name === 'gold')?.details.join(' ')).not.toMatch(/пропущ/);
}, 60_000);
