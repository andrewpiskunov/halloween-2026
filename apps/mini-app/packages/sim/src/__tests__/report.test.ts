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
  // Раздел 1 называет исход алтаря и держателя «Правды».
  const s1 = md.slice(md.indexOf('## 1.'), md.indexOf('## 2.'));
  const holder = result.finalState.closing!.truthHolder!;
  expect(s1).toContain(`- Исход: Пробудить (wake), «Правда»: ${content.roleByKey[holder].name} (${holder}).`);
});

test('отчёт без воспроизведения журнала говорит об этом', () => {
  const md = renderReport(result, meta(true), content);
  expect(md).toContain('Воспроизведение журнала: пропущено');
  // Без источников replay и gold помечены «пропущено», а не «ок».
  const skipped = renderReport({
    ...result,
    checks: [{ name: 'replay', ok: true, details: ['пропущено: воспроизведение журнала не передано'] }],
    skipped: ['replay: пропущено: воспроизведение журнала не передано'],
  }, meta(true), content);
  expect(skipped).toContain('- **replay**: пропущено');
});

test('предупреждения — в разделе 6, вопросы — только в разделе 7', () => {
  const md = renderReport({ ...result, warnings: ['p95 400 мс выше 300 мс'], questions: ['o16: нет защитника'] }, meta(false), content);
  const s6 = md.slice(md.indexOf('## 6.'), md.indexOf('## 7.'));
  const s7 = md.slice(md.indexOf('## 7.'));
  expect(s6).toContain('- Предупреждение: p95 400 мс выше 300 мс');
  expect(s7).not.toContain('p95');
  expect(s7).toContain('- o16: нет защитника');
});

test('лоты нумеруются, способность названа по-русски с ключом', () => {
  const md = renderReport(result, meta(false), content);
  expect(md).toMatch(/- Лот 1: /);
  expect(md).not.toMatch(/Лот акта/);
  expect(md).toContain(`${content.roleByKey.o1.skill} (payAshWithGold): `);
});

test('раздел 6 показывает три размера: игрок, ведущий, содержимое', () => {
  const md = renderReport(result, meta(false), content);
  const s6 = md.slice(md.indexOf('## 6.'), md.indexOf('## 7.'));
  expect(s6).toMatch(/Самая большая проекция игрока: \d+\.\d КБ/);
  expect(s6).toMatch(/Самая большая проекция ведущего: \d+\.\d КБ \(порог 96 КБ\)/);
  expect(s6).toMatch(/Содержимое \(сообщение content, только ведущему, при подключении\): \d+\.\d КБ/);
});
