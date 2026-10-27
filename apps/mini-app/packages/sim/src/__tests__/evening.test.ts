import { beforeAll, expect, test } from 'vitest';
import type { Event } from '@fair/shared';
import type { EveningResult } from '../evening';
import { runTwelve } from './evening-run';

let result: EveningResult;
let events: Event[];

beforeAll(async () => { ({ result, events } = await runTwelve()); }, 60_000);

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
  // Пороги не превышены, проверки не пропущены, вопросов к правилам при полном составе ядра нет.
  expect(result.warnings).toEqual([]);
  expect(result.skipped).toEqual([]);
  expect(result.questions).toEqual([]);
  expect(result.checks.find(c => c.name === 'replay')?.details.join(' ')).not.toMatch(/пропущ/);
  expect(result.checks.find(c => c.name === 'gold')?.details.join(' ')).not.toMatch(/пропущ/);
});

test('вечер на 12: сбор алтаря даёт исход wake, три улики дают «Правду»', () => {
  const closing = result.finalState.closing!;
  expect(closing.outcome).toBe('wake');
  expect(closing.warnings).toEqual([]);
  const wake = closing.altars.find(a => a.side === 'wake')!;
  expect(wake.ready).toBe(true);
  expect(wake.shards).toBeGreaterThanOrEqual(3);
  expect(wake.focuses).toBeGreaterThanOrEqual(2);
  expect(wake.gold).toBeGreaterThanOrEqual(6);
  expect(wake.donors).toBeGreaterThanOrEqual(3);
  expect(closing.altars.filter(a => a.ready).map(a => a.side)).toEqual(['wake']);
  expect(closing.truthHolder).toBeDefined();
  expect(closing.players[closing.truthHolder!].truth).toBe(true);
  // Участники стороны wake получили исход, остальные нет.
  for (const [key, p] of Object.entries(closing.players)) expect(p.outcome, key).toBe(p.side === 'wake');
  expect(result.checks.find(c => c.name === 'closing')).toMatchObject({ ok: true });
  // Шаг идёт через исправления ведущего с причиной и вклады участников.
  const reasons = result.commands.filter(e => e.cmd.type === 'gm.correct' && e.outcome.ok).map(e => (e.cmd as { reason: string }).reason);
  expect(reasons).toContain('проверка готовности алтаря');
  expect(reasons).toContain('проверка «Правды»');
});

test('вечер на 12: Корвин опаздывает, Никс уходит и возвращается (спецификация этапа 7, §2.6)', () => {
  const presence = events.flatMap(e => {
    if (e.type === 'PlayerArrived') return [`пришёл ${e.roleKey} ${e.startSet ? 'с набором' : 'без набора'}`];
    if (e.type === 'PlayerLeft') return [`ушёл ${e.roleKey}`];
    return [];
  });
  expect(presence).toEqual(['пришёл o11 с набором', 'ушёл o8', 'пришёл o8 без набора']);
  // Корвин не отмечен при открытии: нулевой набор, после прихода стартовый.
  const setup = result.snapshots.find(s => s.label === 'setup')!.state;
  expect(setup.players.o11.present).toBe(false);
  expect(setup.players.o11.gold).toBe(0);
  expect(result.checks.find(c => c.name === 'start')).toMatchObject({ ok: true });
  expect(result.checks.find(c => c.name === 'start:o11')).toMatchObject({ ok: true });
  // Команды Никса после ухода получили phase с текстом «ведущий отметил».
  const left = result.commands.filter(e => e.actor === 'o8' && !e.outcome.ok && e.outcome.error === 'phase');
  expect(left.length).toBeGreaterThan(0);
  expect(left.every(e => e.outcome.detail?.includes('ведущий отметил'))).toBe(true);
  expect(result.finalState.players.o8.present).toBe(true);
  expect(result.finalState.players.o11.present).toBe(true);
});

test('вечер на 12: содержимое отдельным сообщением, проекция ведущего меньше 96 КБ', () => {
  expect(result.sizes.content).toBeGreaterThan(0);
  expect(result.sizes.gm).toBeLessThan(96 * 1024);
  expect(result.sizes.player).toBeGreaterThan(0);
});
