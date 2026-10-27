// Минимальная игра на движке для тестов симулятора: без сервера, только команды и проекции.
import { readFileSync } from 'node:fs';
import { execute, initialState, loadContent, viewFor, type Actor, type Command, type GameState, type PlayerView } from '@fair/shared';
import { defaultContentPath } from '@fair/shared/node';

export const content = loadContent(JSON.parse(readFileSync(defaultContentPath(), 'utf8')));

/** Вымышленные коды приглашений: code-<roleKey> и code-gm. */
export function testCodes(): Record<string, string> {
  const codes: Record<string, string> = { gm: 'code-gm' };
  for (const r of content.roles) codes[r.key] = `code-${r.key}`;
  return codes;
}

const actorOf = (who: string): Actor => (who === 'gm' ? { type: 'gm' } : { type: 'player', roleKey: who });

/** Ярмарка, ведомая командами через движок: состав n, все присутствуют, сессия открыта. */
export class Game {
  s: GameState;
  now = 1000;
  private ids = 0;

  constructor(n: number, absent: string[] = []) {
    this.s = initialState(content, testCodes());
    this.must({ type: 'session.setN', n }, 'gm');
    for (const key of this.s.roster.filter(k => !absent.includes(k))) this.must({ type: 'player.setPresent', roleKey: key, present: true }, 'gm');
    this.must({ type: 'session.open' }, 'gm');
  }

  /** Команда от ведущего ('gm') или игрока (roleKey); при успехе состояние обновляется. */
  run(cmd: Command, who: string) {
    this.now += 1000;
    const r = execute(this.s, content, cmd, { now: this.now, actor: actorOf(who), newId: () => `id${++this.ids}`, random: () => 0.5 });
    if (r.ok) this.s = r.state;
    return r;
  }

  must(cmd: Command, who: string): void {
    const r = this.run(cmd, who);
    if (!r.ok) throw new Error(`${cmd.type} от ${who}: ${r.error} ${r.detail ?? ''}`);
  }

  view(key: string): PlayerView {
    return viewFor(this.s, content, actorOf(key), this.now) as PlayerView;
  }
}
