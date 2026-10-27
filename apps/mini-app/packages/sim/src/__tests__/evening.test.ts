import { beforeAll, expect, test } from 'vitest';
import type { EveningResult } from '../evening';
import { runTwelve } from './evening-run';

let result: EveningResult;

beforeAll(async () => { ({ result } = await runTwelve()); }, 60_000);

test('вечер на 12: сценарий проходит, проверки зелёные, покрытие полное', () => {
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
});
