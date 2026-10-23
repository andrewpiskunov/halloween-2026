import { readFileSync } from 'node:fs';
import { loadContent, type Actor, type Bundle } from '@fair/shared';
import { defaultContentPath } from '@fair/shared/node';
import { EventStore } from '../store';
import { Game, type GameOpts } from '../game';

export const content = loadContent(JSON.parse(readFileSync(defaultContentPath(), 'utf8')));
export const gm: Actor = { type: 'gm' };

/** Управляемые часы и детерминированные id для тестов. */
export function testOpts(start = 1_000_000): GameOpts & { clock: { now: number } } {
  const clock = { now: start };
  let id = 0;
  return { clock, now: () => clock.now, newId: () => `id${++id}`, random: () => 0.5 };
}

export const empty = (): Bundle => ({ gold: 0, ingredients: { ash: 0, moon: 0, dew: 0 }, items: [] });

let cmdCounter = 0;
/** Уникальный cmdId для вспомогательных команд. */
export const nextCmd = () => `setup-${++cmdCounter}`;

/** Открыть ярмарку на 12 игроков через Game: состав, явка всех, открытие. */
export async function openFair(game: Game): Promise<void> {
  const must = async (cmd: Parameters<Game['submit']>[1]) => {
    const r = await game.submit(nextCmd(), cmd, gm);
    if (!r.ok) throw new Error(`${cmd.type}: ${r.error} ${r.detail ?? ''}`);
  };
  await must({ type: 'session.setN', n: 12 });
  for (const roleKey of game.state().roster) await must({ type: 'player.setPresent', roleKey, present: true });
  await must({ type: 'session.open' });
}

export function memoryGame(opts = testOpts()) {
  const store = new EventStore(':memory:');
  const game = Game.open(store, content, opts);
  return { store, game, opts };
}
