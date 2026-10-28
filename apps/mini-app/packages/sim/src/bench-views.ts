// Замер сборки проекций (спецификация этапа 8, §4): без сервера, только движок и проекции.
// Печатает таблицу в stdout, файлов не пишет. Часы и id детерминированы.
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { decide, initialState, loadContent, reduce, viewFor, type Actor, type Command, type Event, type GameState } from '@fair/shared';
import { defaultContentPath } from '@fair/shared/node';

const content = loadContent(JSON.parse(readFileSync(defaultContentPath(), 'utf8')));
const PLAYERS = 30;
const SIZES = [0, 2000, 8000];
const REPEATS = 20;

type Variant = 'отклонены' | 'приняты';

/** Ярмарка на движке: часы и id считаются по порядку, чтобы прогоны совпадали. */
class Bench {
  s: GameState;
  now = 1000;
  private ids = 0;

  constructor() {
    const codes: Record<string, string> = { gm: 'code-gm' };
    for (const r of content.roles) codes[r.key] = `code-${r.key}`;
    this.s = initialState(content, codes);
    this.run({ type: 'session.setN', n: PLAYERS }, { type: 'gm' });
    for (const key of this.s.roster) this.run({ type: 'player.setPresent', roleKey: key, present: true }, { type: 'gm' });
    this.run({ type: 'session.open' }, { type: 'gm' });
  }

  run(cmd: Command, actor: Actor): Event[] {
    this.now += 1000;
    const r = decide(this.s, content, cmd, { now: this.now, actor, newId: () => `id${++this.ids}`, random: () => 0.5 });
    if (!r.ok) throw new Error(`${cmd.type}: ${r.error} ${r.detail ?? ''}`);
    for (const e of r.events) this.s = reduce(this.s, content, e);
    return r.events;
  }

  /** Предложение from → to на 1 золотой, затем отказ или принятие адресатом. */
  cycle(from: string, to: string, variant: Variant): void {
    const none = { gold: 0, ingredients: { ash: 0, moon: 0, dew: 0 }, items: [] };
    const created = this.run({ type: 'offer.create', to, give: { ...none, gold: 1 }, get: none }, { type: 'player', roleKey: from })
      .find(e => e.type === 'OfferCreated');
    if (created?.type !== 'OfferCreated') throw new Error('нет OfferCreated');
    this.run({ type: variant === 'приняты' ? 'offer.accept' : 'offer.decline', id: created.offer.id }, { type: 'player', roleKey: to });
  }
}

/** Среднее время полного круга проекций: все игроки и ведущий. */
function measure(b: Bench): number {
  const actors: Actor[] = [...b.s.roster.map(roleKey => ({ type: 'player' as const, roleKey })), { type: 'gm' }];
  for (const a of actors) viewFor(b.s, content, a, b.now);   // прогрев
  const t0 = performance.now();
  for (let i = 0; i < REPEATS; i++) for (const a of actors) viewFor(b.s, content, a, b.now);
  return (performance.now() - t0) / REPEATS;
}

const rows: string[][] = [['вариант', 'N', 'закрытых в состоянии', 'обменов', 'записей действий', 'мс на круг проекций']];
for (const variant of ['отклонены', 'приняты'] as Variant[]) {
  for (const n of SIZES) {
    const b = new Bench();
    const [a, c] = b.s.roster;
    // Направление чередуется, чтобы у обоих хватало золота на принятые сделки.
    for (let i = 0; i < n; i++) i % 2 === 0 ? b.cycle(a, c, variant) : b.cycle(c, a, variant);
    const closed = Object.values(b.s.offers).filter(o => o.status !== 'pending').length;
    rows.push([variant, String(n), String(closed), String(b.s.trades.length), String(b.s.actions.length), measure(b).toFixed(2)]);
  }
}

const widths = rows[0].map((_, i) => Math.max(...rows.map(r => r[i].length)));
console.log(`Проекции для ${PLAYERS} игроков и ведущего, среднее из ${REPEATS} повторов`);
for (const r of rows) console.log(r.map((x, i) => (i < 1 ? x.padEnd(widths[i]) : x.padStart(widths[i]))).join('  '));
