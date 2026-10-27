import { expect, test } from 'vitest';
import { content, gm, makeGame, player, run } from './helpers';
import { reduce } from '../engine';
import type { Event } from '../events';

test('сброс: состояние начальное, коды новые для всех 30 ролей, ведущий остаётся, игроки отвязаны', () => {
  const s0 = makeGame(12);
  const bound = { ...s0, gmTelegramId: 7 };
  const r = run(bound, { type: 'session.reset' }, gm, 5000);
  if (!r.ok) throw new Error(r.error);
  const s = r.state;
  expect(s).toMatchObject({ phase: 'setup', roster: [], nPresent: 0, players: {}, items: {}, offers: {}, lots: {}, altars: {}, bindings: {}, announcements: [], gmTelegramId: 7 });
  expect(Object.keys(s.invites)).toHaveLength(content.roles.length);
  expect(s.gmCode).not.toBe(bound.gmCode);
  expect(s.invites.o1).not.toBe(bound.invites.o1);
  expect(new Set([s.gmCode, ...Object.values(s.invites)]).size).toBe(content.roles.length + 1);
  expect(r.events[0]).toMatchObject({ type: 'SessionReset', gmTelegramId: 7 });
  // Без привязанного ведущего поле не появляется.
  const r2 = run(s0, { type: 'session.reset' }, gm);
  expect(r2.ok && r2.state.gmTelegramId).toBeUndefined();
});

test('сброс только от ведущего; журнал с SessionReset проигрывается заново в то же состояние', () => {
  const s0 = makeGame(12);
  expect(run(s0, { type: 'session.reset' }, player('o1')).ok).toBe(false);
  const r = run(s0, { type: 'session.reset' }, gm);
  if (!r.ok) throw new Error(r.error);
  const replayed = (r.events as Event[]).reduce((st, e) => reduce(st, content, e), s0);
  expect(replayed).toEqual(r.state);
  // После сброса ведущий снова задаёт состав.
  expect(run(r.state, { type: 'session.setN', n: 12 }, gm).ok).toBe(true);
});
