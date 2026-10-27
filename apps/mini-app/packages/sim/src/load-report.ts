// Отчёт нагрузочного прогона (спецификация этапа 7, §9): таблица по минутам, итог, замечания.
import { LOAD_P95_LIMIT_MS, LOAD_RSS_GROWTH, type LoadResult } from './load';

export interface LoadMeta { players: number; seconds: number; intervalMs: number; seed: number; baseUrl: string }

const kb = (b: number) => (b / 1024).toFixed(1);
const mb = (b: number | null) => (b === null ? '—' : (b / 1024 / 1024).toFixed(1));
const row = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`;

/** Итог одной строкой: для отчёта и выжимки в stdout. */
export function loadVerdict(result: LoadResult): string {
  return result.ok ? 'критерии выполнены' : 'критерии нарушены';
}

/** Markdown-отчёт: параметры, таблица по минутам, итог с нарушенными критериями, отказы по кодам. */
export function renderLoadReport(result: LoadResult, meta: LoadMeta): string {
  const all = result.minutes;
  const commands = all.reduce((n, m) => n + m.commands, 0);
  const refusals = Object.entries(result.refusals).sort(([a], [b]) => a.localeCompare(b));
  return [
    `# Нагрузочный прогон: ${meta.players} ботов, ${(meta.seconds / 60).toFixed(meta.seconds % 60 ? 1 : 0)} мин`,
    '',
    '## Параметры',
    '',
    `- Ботов: ${meta.players}, ярмарка стоит в акте I.`,
    `- Длительность: ${meta.seconds} с, интервал хода бота ${meta.intervalMs} мс ± 20 %.`,
    `- Зерно: ${meta.seed}.`,
    `- Сервер: ${meta.baseUrl}.`,
    '',
    '## По минутам',
    '',
    'Задержка — от отправки команды до ответа сервера. Размеры проекций — максимум с начала прогона до конца минуты (по всем ботам для игрока). rss — память процесса сервера из `/api/health` в конце минуты.',
    '',
    row(['Минута', 'Команд', 'p50, мс', 'p95, мс', 'max, мс', 'Игрок, КБ (макс.)', 'Ведущий, КБ (макс.)', 'rss, МБ']),
    row(Array(8).fill('---')),
    ...all.map(m => row([m.minute, m.commands, m.p50, m.p95, m.max, kb(m.player), kb(m.gm), mb(m.rss)])),
    '',
    '## Итог',
    '',
    `Итог: ${loadVerdict(result)}.`,
    '',
    `- Команд всего: ${commands}.`,
    `- Переподключений: ${result.reconnects}.`,
    `- Критерии: p95 за любую минуту не больше ${LOAD_P95_LIMIT_MS} мс; rss в последнюю минуту не больше чем в ${LOAD_RSS_GROWTH} раза rss второй минуты (при двух минутах и больше); переподключений 0.`,
    ...result.failures.map(f => `- ${f}`),
    '',
    '## Замечания',
    '',
    `- Отказы сервера по кодам: ${refusals.length ? refusals.map(([k, n]) => `${k} ${n}`).join(', ') : 'нет'}. Это обычные отказы игры (не хватает ресурсов, вещь ушла), не критерий.`,
    ...(all.some(m => m.rss === null) ? ['- Память не измерена: сервер запущен без `ALLOW_DEV_AUTH`, `/api/health` не отдаёт `memory`.'] : []),
    '',
  ].join('\n');
}
