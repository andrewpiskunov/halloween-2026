import { expect, it } from 'vitest';
import { contentData, viewFor, type Command } from '@fair/shared';
import { content, empty, gm, nextCmd, testOpts } from './fixtures';
import { attachHiddenScenario } from '../scenario';
import { applyCast } from '../cast';
import { Game } from '../game';
import { EventStore } from '../store';

const original = () => attachHiddenScenario(content);
const shortened = () => applyCast(original(), 'without-iva');
const ivaName = /(?<![а-яё])ив(?:а|ы|е|у|ой)(?![а-яё])/iu;

it('убирает роль и упоминания из всех личных проекций, сохраняя исходный сценарий', async () => {
  const base = original();
  const cast = applyCast(base, 'without-iva');
  expect(Object.keys(base.hidden17!.roles)).toHaveLength(17);
  expect(Object.keys(cast.hidden17!.roles)).toHaveLength(16);
  expect(JSON.stringify(contentData(cast))).not.toMatch(ivaName);
  const store = new EventStore(':memory:');
  const game = Game.open(store, cast, { ...testOpts(), hidden17: true });
  for (const roleKey of game.state().roster) {
    const view = viewFor(game.state(), cast, { type: 'player', roleKey }, 1_000_000);
    expect(JSON.stringify(view), roleKey).not.toMatch(ivaName);
  }
  expect(game.state().roster).not.toContain('o12');
  expect(game.state().roster).toHaveLength(16);
  expect(await game.submit(nextCmd(), { type: 'session.reset' }, gm)).toMatchObject({ ok: true });
  expect(game.state().roster).toHaveLength(16);
  store.close();
});

it('переносит вещи выбывшего в лоты, закрывает сделку и сохраняет остальных при повторном запуске', async () => {
  const store = new EventStore(':memory:');
  const opts = { ...testOpts(), hidden17: true };
  const game = Game.open(store, original(), opts);
  const send = async (cmd: Command) => expect(await game.submit(nextCmd(), cmd, gm)).toMatchObject({ ok: true });
  await game.bindByCode(game.state().invites.o12, 123456);
  for (const roleKey of game.state().roster) await send({ type: 'player.setPresent', roleKey, present: true });
  await send({ type: 'session.open' });
  const eye = Object.values(game.state().items).find(i => i.ref === 'Изумрудный глаз')!;
  expect(await game.submit(nextCmd(), { type: 'narrative.trade.create', to: 'o7', give: { ...empty(), items: [eye.id] }, wish: '' }, { type: 'player', roleKey: 'o12' })).toMatchObject({ ok: true });
  const before = structuredClone(game.state());
  const cast = shortened();
  const adapted = Game.open(store, cast, opts);
  const after = adapted.state();
  expect(after.roster).toEqual(before.roster.filter(k => k !== 'o12'));
  expect(after.players.o12.present).toBe(false);
  for (const key of after.roster) expect(after.players[key]).toEqual(before.players[key]);
  expect(after.clock).toEqual(before.clock);
  expect(after.phase).toBe(before.phase);
  expect(after.items[eye.id].owner.type).toBe('lot');
  expect(after.items[eye.id].reservedFor).toBeUndefined();
  expect(Object.values(after.hidden17!.narrative!.trades)[0].status).toBe('cancelled');
  expect(adapted.actorFor(123456)).toBeUndefined();
  expect(await adapted.bindByCode(before.invites.o12, 123456)).toBeUndefined();
  expect(Game.open(store, cast, opts).state()).toEqual(after);
  store.close();
});

it('при новой игре оставляет Изумрудный глаз в доступном лоте', async () => {
  const store = new EventStore(':memory:');
  const cast = shortened();
  const game = Game.open(store, cast, { ...testOpts(), hidden17: true });
  for (const roleKey of game.state().roster) await game.submit(nextCmd(), { type: 'player.setPresent', roleKey, present: true }, gm);
  expect(await game.submit(nextCmd(), { type: 'session.open' }, gm)).toMatchObject({ ok: true });
  const eye = Object.values(game.state().items).find(i => i.ref === 'Изумрудный глаз')!;
  expect(eye.owner.type).toBe('lot');
  expect(game.state().hidden17!.narrative!.documentAccess.o12).toBeUndefined();
  store.close();
});

it('не забирает уже переданную реликвию у другого героя', async () => {
  const store = new EventStore(':memory:');
  const opts = { ...testOpts(), hidden17: true };
  const game = Game.open(store, original(), opts);
  for (const roleKey of game.state().roster) await game.submit(nextCmd(), { type: 'player.setPresent', roleKey, present: true }, gm);
  await game.submit(nextCmd(), { type: 'session.open' }, gm);
  const eye = Object.values(game.state().items).find(i => i.ref === 'Изумрудный глаз')!;
  const iva = { type: 'player' as const, roleKey: 'o12' };
  expect(await game.submit(nextCmd(), { type: 'narrative.trade.create', to: 'o7', give: { ...empty(), items: [eye.id] }, wish: '' }, iva)).toMatchObject({ ok: true });
  const trade = Object.values(game.state().hidden17!.narrative!.trades)[0];
  expect(await game.submit(nextCmd(), { type: 'narrative.trade.reply', id: trade.id, give: empty() }, { type: 'player', roleKey: 'o7' })).toMatchObject({ ok: true });
  expect(await game.submit(nextCmd(), { type: 'narrative.trade.confirm', id: trade.id }, iva)).toMatchObject({ ok: true });
  expect(await game.submit(nextCmd(), { type: 'narrative.document.show', documentId: 'iva-memory', player: 'o7', allow: true }, iva)).toMatchObject({ ok: true });
  const before = structuredClone(game.state().items[eye.id]);
  const cast = shortened();
  const adapted = Game.open(store, cast, opts);
  expect(adapted.state().items[eye.id]).toEqual(before);
  expect(Object.values(adapted.state().items).filter(i => i.ref === eye.ref)).toHaveLength(1);
  const view = viewFor(adapted.state(), cast, { type: 'player', roleKey: 'o7' }, opts.now());
  expect(JSON.stringify(view)).not.toMatch(ivaName);
  expect(view.kind === 'player' && view.hidden17!.narrative!.documents.some(d => d.id === 'iva-memory')).toBe(true);
  store.close();
});

it('не пишет частичное изменение состава, если обряд уже начат', () => {
  const store = new EventStore(':memory:');
  const opts = { ...testOpts(), hidden17: true };
  const game = Game.open(store, original(), opts);
  const hidden17 = structuredClone(game.state().hidden17!);
  hidden17.ritual.step = 'assembly';
  store.append([{ type: 'Hidden17Changed', action: 'test.ritual', at: opts.now(), patch: { hidden17 } }]);
  const before = store.all();
  expect(() => Game.open(store, shortened(), opts)).toThrow('до начала обряда');
  expect(store.all()).toEqual(before);
  store.close();
});
