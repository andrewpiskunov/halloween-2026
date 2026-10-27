// Отчёт прогона вечера (спецификация этапа 6, §4): семь разделов на русском в Markdown.
import { ABILITY_BY_ROLE, OUTCOME_TITLES, type AltarSide, type Content, type GameState, type Phase } from '@fair/shared';
import { abilityWorked } from './checks';
import type { CommandLog, EveningResult } from './evening';
import { HOSTILE } from './uses';

export interface ReportMeta {
  players: 12 | 30;
  seed: number;
  baseUrl: string;
  durationMs: number;
  /** Воспроизведение журнала не делалось (режим --url). */
  replaySkipped: boolean;
}

/** Заголовки разделов §4: по ним тест проверяет полноту отчёта. */
export const REPORT_SECTIONS = [
  '## 1. Параметры',
  '## 2. Ход вечера по актам',
  '## 3. Итоги',
  '## 4. Игроки',
  '## 5. Проверки',
  '## 6. Время и размер',
  '## 7. Вопросы владельцу',
] as const;

const ACT_PHASES: { title: string; phases: Phase[]; act?: 1 | 2 | 3 }[] = [
  { title: 'Акт I', phases: ['act1'], act: 1 },
  { title: 'Акт II', phases: ['act2'], act: 2 },
  { title: 'Акт III', phases: ['act3'], act: 3 },
  { title: 'После закрытия', phases: ['closed', 'revealed'] },
];

const ACT_ROMAN: Record<string, string> = { act1: 'I', act2: 'II', act3: 'III' };
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} КБ`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} с`;
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const row = (cells: (string | number)[]) => `| ${cells.map(c => cell(String(c))).join(' | ')} |`;
const table = (head: string[], rows: (string | number)[][]) =>
  [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n');

/** Имя роли для отчёта: «Имя (o1)». */
function roleName(content: Content, key: string): string {
  const r = content.roleByKey[key];
  return r ? `${r.name} (${key})` : key;
}

const sideTitle = (side: AltarSide | 'sleep') => `${OUTCOME_TITLES[side]} (${side})`;

const okCount = (log: CommandLog[], phases: Phase[], type: string) =>
  log.filter(e => e.cmd.type === type && e.outcome.ok && e.expectedRefusal === undefined && e.phase && phases.includes(e.phase)).length;

const ownedCount = (state: GameState, role: string) =>
  Object.values(state.items).filter(i => i.owner.type === 'player' && i.owner.key === role).length;

/** Раздел 2: по актам — сделки, изготовления, применения, вклады, лоты, объявления, исправления. */
function actsSection(result: EveningResult, content: Content): string[] {
  const { commands: log, finalState: s } = result;
  const rows = ACT_PHASES.map(({ title, phases, act }) => {
    const actions = act ? s.actions.filter(a => a.act === act) : [];
    const ability = actions.filter(a => a.source.type === 'ability');
    const items = actions.filter(a => a.source.type === 'item');
    const blocked = ability.filter(a => a.outcome === 'blocked').length;
    return [
      title,
      `${okCount(log, phases, 'offer.accept')} / ${okCount(log, phases, 'offer.decline')} / ${okCount(log, phases, 'offer.cancel')}`,
      okCount(log, phases, 'shop.craft'),
      `${ability.length}${blocked ? ` (отражено ${blocked})` : ''}`,
      items.length,
      `${okCount(log, phases, 'altar.contribute')} / ${okCount(log, phases, 'altar.withdraw')}`,
      okCount(log, phases, 'gm.announce'),
      okCount(log, phases, 'gm.correct'),
    ];
  });
  // Лоты по порядку; акт торга — фаза первой ставки или выкупа в журнале (поле act содержимого не показывается).
  const lots = Object.values(s.lots).map((l, i) => {
    const touched = log.find(e => (e.cmd.type === 'lot.bid' || e.cmd.type === 'lot.buyout') && e.outcome.ok && (e.cmd as { id: string }).id === l.id);
    const when = touched?.phase && /^act[123]$/.test(touched.phase) ? `, акт ${ACT_ROMAN[touched.phase]}` : '';
    if (l.status === 'sold' && l.winner) {
      const how = log.some(e => e.cmd.type === 'lot.buyout' && e.outcome.ok && (e.cmd as { id: string }).id === l.id) ? 'выкуп' : 'ставка';
      return `- Лот ${i + 1}: продан, ${roleName(content, l.winner)} за ${l.price ?? '?'} золота (${how}${when}).`;
    }
    return `- Лот ${i + 1}: ${l.status === 'unsold' ? 'не продан' : `статус ${l.status}`}${when ? ` (ставки${when})` : ''}.`;
  });
  return [
    REPORT_SECTIONS[1],
    '',
    'Сделки: принято / отклонено / отменено. Вклады: внесено / изъято. Столбца «истекло» нет: в минутном прогоне сроки не истекают.',
    '',
    table(['Акт', 'Сделки', 'Изготовления', 'Способности', 'Вещи', 'Вклады', 'Объявления', 'Исправления'], rows),
    '',
    ...(lots.length ? lots : ['- Лотов нет.']),
  ];
}

/** Исход и «Правда» одной строкой: для раздела 1 отчёта и выжимки в stdout. */
export function outcomeLine(result: EveningResult, content: Content): string {
  const c = result.finalState.closing;
  if (!c) return 'итогов нет';
  return `${sideTitle(c.outcome)}, «Правда»: ${c.truthHolder ? roleName(content, c.truthHolder) : 'никто'}`;
}

/** Раздел 3: алтари, исход, «Правда», предупреждения закрытия. */
function closingSection(state: GameState, content: Content): string[] {
  const c = state.closing;
  if (!c) return [REPORT_SECTIONS[2], '', 'Итогов нет: ярмарка не закрыта.'];
  return [
    REPORT_SECTIONS[2],
    '',
    table(['Алтарь', 'Осколки', 'Фокусы', 'Золото', 'Вкладчики', 'Готов'],
      c.altars.map(a => [sideTitle(a.side), a.shards, a.focuses, a.gold, a.donors, a.ready ? 'да' : 'нет'])),
    '',
    `Исход: ${sideTitle(c.outcome)}.`,
    `«Правда»: ${c.truthHolder ? roleName(content, c.truthHolder) : 'никто'}.`,
    `Предупреждения закрытия: ${c.warnings.length ? c.warnings.join('; ') : 'нет'}.`,
  ];
}

/** Исход способности роли за вечер: сработала, отражена защитой или причина отказа. */
function abilityOutcome(result: EveningResult, role: string): string {
  const s = result.finalState;
  const kind = ABILITY_BY_ROLE[role];
  const done = s.actions.some(a => a.author === role && a.source.type === 'ability' && a.source.ability === kind && a.outcome === 'done')
    || Object.values(s.requests).some(r => r.author === role && r.action.type === 'ability' && r.status === 'accepted');
  if (done) return 'сработала';
  if (HOSTILE.has(kind) && abilityWorked(s, role, kind)) return 'отражена защитой';
  const failed = Object.values(s.requests).filter(r => r.author === role && r.action.type === 'ability' && r.status !== 'pending').at(-1);
  if (failed) return `не сработала: просьба ${failed.status}${failed.reason ? ` (${failed.reason})` : ''}`;
  const refused = result.commands.filter(e => e.actor === role && e.cmd.type === 'ability.use' && !e.outcome.ok).at(-1);
  if (refused) return `не сработала: ${refused.outcome.error}${refused.outcome.detail ? ` (${refused.outcome.detail})` : ''}`;
  if (kind === 'transferProtection' && !s.roster.some(k => s.players[k]?.present && ABILITY_BY_ROLE[k] === 'protectOther')) {
    return 'не сработала: нет защитника';
  }
  return 'не сработала: не применялась';
}

/** Раздел 4: таблица игроков в порядке состава. */
function playersSection(result: EveningResult, content: Content): string[] {
  const s = result.finalState;
  const setup = result.snapshots.find(x => x.label === 'setup')?.state;
  const present = s.roster.filter(k => s.players[k]?.present);
  const rows = present.map(k => {
    const mine = s.closing?.players[k];
    return [
      roleName(content, k),
      setup?.players[k]?.gold ?? '?',
      s.players[k].gold,
      ownedCount(s, k),
      `${content.roleByKey[k]?.skill ?? ABILITY_BY_ROLE[k]} (${ABILITY_BY_ROLE[k]}): ${abilityOutcome(result, k)}`,
      mine ? `${mine.goals.filter(Boolean).length} из 2` : '—',
      mine ? (mine.outcome ? 'да' : 'нет') : '—',
      mine?.truth ? 'да' : '—',
    ];
  });
  return [
    REPORT_SECTIONS[3],
    '',
    table(['Роль', 'Золото в начале', 'Золото в конце', 'Вещи', 'Способность', 'Цели', 'Исход', 'Правда'], rows),
  ];
}

/** Раздел 5: проверки §3 с результатом и подробностями. */
function checksSection(result: EveningResult, meta: ReportMeta): string[] {
  const lines = [REPORT_SECTIONS[4], ''];
  if (meta.replaySkipped) lines.push('Воспроизведение журнала: пропущено (прогон против внешнего сервера, база недоступна).', '');
  for (const c of result.checks) {
    const skipped = c.ok && result.skipped.some(x => x.startsWith(`${c.name}: `));
    lines.push(`- **${c.name}**: ${skipped ? 'пропущено' : c.ok ? 'ок' : 'ошибка'}`);
    for (const d of c.details) lines.push(`  - ${d}`);
  }
  lines.push('', `Итог: ${result.ok ? 'все проверки пройдены' : 'есть ошибки'}.`);
  return lines;
}

/** Раздел 6: время ответов и размеры проекций; предупреждения по порогам §3.5. */
function timingSection(result: EveningResult): string[] {
  const t = result.timing;
  const { warnings } = result;
  return [
    REPORT_SECTIONS[5],
    '',
    `- Команд в журнале прогона: ${result.commands.length}.`,
    `- Время ответа: p50 ${t.p50} мс, p95 ${t.p95} мс, максимум ${t.max} мс (порог p95 — 300 мс).`,
    `- Весь вечер: ${seconds(t.totalMs)}.`,
    `- Самая большая проекция игрока: ${kb(result.sizes.player)} (порог 256 КБ).`,
    `- Самая большая проекция ведущего: ${kb(result.sizes.gm)} (порог 96 КБ).`,
    `- Содержимое (сообщение content, только ведущему, при подключении): ${kb(result.sizes.content)}.`,
    ...(warnings.length ? ['', ...warnings.map(w => `- Предупреждение: ${w}`)] : ['- Пороги не превышены.']),
  ];
}

/** Отчёт прогона: семь разделов §4. */
export function renderReport(result: EveningResult, meta: ReportMeta, content: Content): string {
  const { questions } = result;
  return [
    `# Прогон вечера: ${meta.players} игроков, зерно ${meta.seed}`,
    '',
    `Результат: ${result.ok ? 'ок' : 'ошибка'}.`,
    '',
    REPORT_SECTIONS[0],
    '',
    `- Состав: ${meta.players} (${meta.players === 12 ? 'ядро' : 'все роли'}), присутствуют ${result.finalState.roster.filter(k => result.finalState.players[k]?.present).length}.`,
    `- Зерно: ${meta.seed}.`,
    `- Сервер: ${meta.baseUrl}.`,
    `- Длительность: ${seconds(meta.durationMs)}.`,
    `- Исход: ${outcomeLine(result, content)}.`,
    '',
    ...actsSection(result, content),
    '',
    ...closingSection(result.finalState, content),
    '',
    ...playersSection(result, content),
    '',
    ...checksSection(result, meta),
    '',
    ...timingSection(result),
    '',
    REPORT_SECTIONS[6],
    '',
    ...(questions.length ? questions.map(q => `- ${q}`) : ['Вопросов нет.']),
    '',
  ].join('\n');
}
