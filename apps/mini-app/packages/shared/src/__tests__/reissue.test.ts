import { expect, test } from 'vitest';
import { content, gm, makeGame, player, run, system } from './helpers';
import { COMMAND_TYPES } from '../commands';
import { execute, reduce } from '../engine';
import type { Event } from '../events';

/** Ярмарка, где ведущий уже вошёл аккаунтом 7. */
function boundGm() {
  const r = run(makeGame(12), { type: 'player.bind', code: 'code-gm', telegramId: 7 }, system);
  if (!r.ok) throw new Error(r.error);
  expect(r.state.gmTelegramId).toBe(7);
  return r.state;
}

test('gm.reissue в списке команд; от ведущего и от игрока → forbidden', () => {
  expect(COMMAND_TYPES['gm.reissue']).toBe(true);
  const s = boundGm();
  for (const actor of [gm, player('o1')]) {
    const r = run(s, { type: 'gm.reissue' }, actor);
    expect(r.ok ? 'ok' : r.error).toBe('forbidden');
  }
});

test('от system: новый код ведущего, аккаунт отвязан, коды игроков прежние; журнал проигрывается', () => {
  const s = boundGm();
  const r = run(s, { type: 'gm.reissue' }, system, 9000);
  if (!r.ok) throw new Error(r.error);
  expect(r.events).toHaveLength(1);
  const e = r.events[0];
  if (e.type !== 'GmReissued') throw new Error(e.type);
  expect(e.at).toBe(9000);
  expect(e.code).toMatch(/^[0-9a-z]{1,12}$/i);
  expect(e.code).not.toBe('code-gm');
  expect(Object.values(s.invites)).not.toContain(e.code);
  expect(r.state.gmCode).toBe(e.code);
  expect(r.state).not.toHaveProperty('gmTelegramId');
  expect(r.state.invites).toEqual(s.invites);
  expect(r.state.bindings).toEqual(s.bindings);
  expect(r.state.players).toEqual(s.players);
  expect((r.events as Event[]).reduce((st, ev) => reduce(st, content, ev), s)).toEqual(r.state);
});

test('новый код ведущего привязывает новый аккаунт; старый код больше не подходит', () => {
  const r = run(boundGm(), { type: 'gm.reissue' }, system);
  if (!r.ok) throw new Error(r.error);
  const old = run(r.state, { type: 'player.bind', code: 'code-gm', telegramId: 8 }, system);
  expect(old.ok ? 'ok' : old.error).toBe('not_found');
  const bound = run(r.state, { type: 'player.bind', code: r.state.gmCode, telegramId: 8 }, system);
  if (!bound.ok) throw new Error(bound.error);
  expect(bound.events[0]).toMatchObject({ type: 'PlayerBound', roleKey: 'gm', telegramId: 8 });
  expect(bound.state.gmTelegramId).toBe(8);
});

test('код не совпадает с кодами игроков и старым кодом ведущего, даже если newId их повторяет', () => {
  const base = boundGm();
  const s = { ...base, gmCode: 'oldgm', invites: { ...base.invites, o1: 'taken' } };
  const ids = ['taken', 'old-gm', 'fresh-code'];
  const r = execute(s, content, { type: 'gm.reissue' }, { now: 0, actor: system, newId: () => ids.shift()!, random: () => 0.5 });
  if (!r.ok) throw new Error(r.error);
  expect(r.state.gmCode).toBe('freshcode');
});
