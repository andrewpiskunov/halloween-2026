import { readFileSync } from 'node:fs';
import { loadContent, defaultContentPath } from '../content';
import type { Actor, Command } from '../commands';
import type { GameState } from '../types';
import { execute, initialState } from '../engine';

export const content = loadContent(JSON.parse(readFileSync(defaultContentPath(), 'utf8')));

export const gm: Actor = { type: 'gm' };
export const system: Actor = { type: 'system' };
export const player = (key: string): Actor => ({ type: 'player', roleKey: key });

// Сквозной счётчик id: 'id1', 'id2', … — уникальны в пределах тестового файла.
let idCounter = 0;
const newId = () => `id${++idCounter}`;

/** Коды приглашений вида code-<roleKey> для всех ролей и code-gm для ведущего. */
export function testCodes(): Record<string, string> {
  const codes: Record<string, string> = { gm: 'code-gm' };
  for (const r of content.roles) codes[r.key] = `code-${r.key}`;
  return codes;
}

/** Свежая сессия в фазе setup, состав ещё не задан. */
export function newGame(): GameState {
  return initialState(content, testCodes());
}

export function run(state: GameState, cmd: Command, actor: Actor, now = 0) {
  return execute(state, content, cmd, { now, actor, newId, random: () => 0.5 });
}

function must(state: GameState, cmd: Command, actor: Actor): GameState {
  const r = run(state, cmd, actor);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.error} ${r.detail ?? ''}`);
  return r.state;
}

/** Состав N, привязка всех ролей (telegramId = 1000 + pos), явка (по умолчанию все), открытие. */
export function makeGame(n: number, opts: { present?: string[] } = {}): GameState {
  let s = must(newGame(), { type: 'session.setN', n }, gm);
  const present = new Set(opts.present ?? s.roster);
  for (const key of s.roster) {
    s = must(s, { type: 'player.bind', code: `code-${key}`, telegramId: 1000 + content.roleByKey[key].pos }, system);
    if (present.has(key)) s = must(s, { type: 'player.setPresent', roleKey: key, present: true }, gm);
  }
  return must(s, { type: 'session.open' }, gm);
}

/** Все роли состава N, кроме перечисленных. */
export function allBut(n: number, absent: string[]): string[] {
  return must(newGame(), { type: 'session.setN', n }, gm).roster.filter(k => !absent.includes(k));
}
