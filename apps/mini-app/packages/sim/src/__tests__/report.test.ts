import { beforeAll, expect, test } from 'vitest';
import type { Content } from '@fair/shared';
import type { EveningResult } from '../evening';
import { REPORT_SECTIONS, renderReport } from '../report';
import { runTwelve } from './evening-run';

let result: EveningResult;
let content: Content;
let baseUrl: string;

beforeAll(async () => { ({ result, content, baseUrl } = await runTwelve()); }, 60_000);

const meta = (replaySkipped: boolean) => ({ players: 12 as const, seed: 1, baseUrl, durationMs: 4200, replaySkipped });

test('отчёт: семь разделов по порядку, строка игрока o1, вопросы', () => {
  const md = renderReport(result, meta(false), content);
  const at = REPORT_SECTIONS.map(h => md.indexOf(`\n${h}\n`));
  expect(at.every(i => i > 0), md).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
  const o1 = md.split('\n').find(l => l.startsWith(`| ${content.roleByKey.o1.name} (o1) |`));
  expect(o1).toBeDefined();
  // Золото в начале 6 из снимка setup; цели «N из 2».
  expect(o1).toMatch(/^\| [^|]+ \| 6 \| \d+ \| \d+ \| [^|]+ \| [012] из 2 \| (да|нет) \| (да|—) \|$/);
  expect(md).toContain('- **coverage**: ок');
  expect(md).not.toContain('Воспроизведение журнала: пропущено');
});

test('отчёт без воспроизведения журнала говорит об этом', () => {
  const md = renderReport(result, meta(true), content);
  expect(md).toContain('Воспроизведение журнала: пропущено');
  // Без источников replay и gold помечены «пропущено», а не «ок».
  const skipped = renderReport({ ...result, checks: [{ name: 'replay', ok: true, details: ['пропущено: воспроизведение журнала не передано'] }] }, meta(true), content);
  expect(skipped).toContain('- **replay**: пропущено');
});
