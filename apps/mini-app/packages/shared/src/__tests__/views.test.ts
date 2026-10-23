import { expect, test } from 'vitest';
import { viewFor, type GmView, type PlayerView } from '../views';
import { allBut, content, gm, makeGame, player, run, system } from './helpers';

const pv = (v: unknown) => v as PlayerView;

test('игрок не видит чужих целей, тайн, сторон, инвентарей и чужих предложений', () => {
  let s = makeGame(12);
  // предложение между o2 и o4, о1 в нём не участвует
  const r = run(s, { type: 'offer.create', to: 'o4', give: { gold: 1, ingredients: { ash: 0, moon: 0, dew: 0 }, items: [] }, get: { gold: 0, ingredients: { ash: 0, moon: 0, dew: 0 }, items: [] } }, player('o2'));
  if (!r.ok) throw new Error(r.error);
  s = r.state;
  const v = pv(viewFor(s, content, player('o1'), 0));
  expect(v.kind).toBe('player');
  expect(v.me.role.key).toBe('o1');
  expect(v.offers).toEqual([]);
  expect(pv(viewFor(s, content, player('o4'), 0)).offers).toHaveLength(1);

  for (const viewer of ['o1', 'o5']) {
    const json = JSON.stringify(viewFor(s, content, player(viewer), 0));
    const otherItems = Object.values(s.items).filter(i => i.owner.type === 'player' && i.owner.key !== viewer);
    expect(otherItems.length).toBeGreaterThan(0);
    for (const key of s.roster.filter(k => k !== viewer)) {
      const other = content.roleByKey[key];
      expect(json).not.toContain(other.secret);
      for (const g of other.goals) expect(json).not.toContain(g);
      expect(json).not.toContain(other.intro);
      for (const it of Object.values(s.items).filter(i => i.owner.type === 'player' && i.owner.key === key)) {
        expect(json).not.toContain(`"${it.id}"`);
      }
    }
  }
  expect(v.others.map(o => o.roleKey)).toEqual(s.roster.filter(k => k !== 'o1'));
  for (const o of v.others) expect(Object.keys(o).sort()).toEqual(['emoji', 'name', 'roleKey', 'title']);
});

test('скрытый V у Лиры: в me.items с hiddenUntilAct; в public.shards статус unknown до act3; у других игроков вещи нет', () => {
  let s = makeGame(12);
  const lira = pv(viewFor(s, content, player('o14'), 0));
  const hidden = lira.me.items.find(i => i.kind === 'shard' && i.ref === 'V');
  expect(hidden?.hiddenUntilAct).toBe(3);
  expect(lira.public.shards.find(x => x.id === 'V')?.status).toBe('unknown');
  expect(lira.public.shards.find(x => x.id === 'I')?.status).toBe('player');

  const other = pv(viewFor(s, content, player('o1'), 0));
  expect(other.me.items.some(i => i.ref === 'V')).toBe(false);
  expect(JSON.stringify(other)).not.toContain(hidden!.id);

  for (let i = 0; i < 2; i++) {
    const r = run(s, { type: 'act.next' }, gm);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  expect(s.phase).toBe('act3');
  expect(pv(viewFor(s, content, player('o1'), 0)).public.shards.find(x => x.id === 'V')?.status).toBe('player');
});

test('контакт на отсутствующую роль: absent=true, name подставлено; контакт без роли: absent=false', () => {
  const s = makeGame(12, { present: allBut(12, ['o13']) });
  const v = pv(viewFor(s, content, player('o1'), 0));
  const grim = v.contacts.find(c => c.role === 'o13')!;
  expect(grim.absent).toBe(true);
  expect(grim.name).toBe(content.roleByKey.o13.name);
  const greta = v.contacts.find(c => c.role === 'o6')!;
  expect(greta.absent).toBe(false);
  expect(greta.name).toBe(content.roleByKey.o6.name);
  expect(v.others.some(o => o.roleKey === 'o13')).toBe(false);

  const full = makeGame(20);
  const withNull = content.roles.find(r => full.roster.includes(r.key) && r.contacts.some(c => c.role === null));
  expect(withNull).toBeDefined();
  const c = pv(viewFor(full, content, player(withNull!.key), 0)).contacts.find(x => x.role === null)!;
  expect(c.absent).toBe(false);
  expect(c.name).toBeUndefined();
});

test('ведущий видит state целиком и коды', () => {
  const s = makeGame(12, { present: allBut(12, ['o13']) });
  const v = viewFor(s, content, gm, 0) as GmView;
  expect(v.kind).toBe('gm');
  expect(v.state).toBe(s);
  // Индексы roleByKey и recipeById дублируют roles и recipes: в проекцию не попадают.
  const { roleByKey: _r, recipeById: _rc, ...plain } = content;
  expect(v.content).toEqual(plain);
  expect(v.content).not.toHaveProperty('roleByKey');
  expect(v.content).not.toHaveProperty('recipeById');
  expect(v.invites.map(i => i.roleKey)).toEqual(s.roster);
  expect(v.invites[0]).toEqual({ roleKey: 'o1', code: 'code-o1', bound: true, present: true });
  expect(v.invites.find(i => i.roleKey === 'o13')?.present).toBe(false);
  expect(() => viewFor(s, content, system, 0)).toThrow('system actor has no view');
  expect(() => viewFor(s, content, player('o3'), 0)).toThrow();
});

test('clock.elapsedMs учитывает pausedTotal и текущую паузу', () => {
  const s = makeGame(12);
  const setup = { ...s, phase: 'setup' as const };
  expect(pv(viewFor(setup, content, player('o1'), 5000))).toMatchObject({ act: 0, clock: { elapsedMs: 0, paused: false } });
  const act = { ...s, phase: 'act1' as const, clock: { actStartedAt: 1000, pausedTotal: 200 } };
  expect(pv(viewFor(act, content, player('o1'), 5000)).clock).toEqual({ elapsedMs: 3800, paused: false });
  const paused = { ...act, clock: { actStartedAt: 1000, pausedTotal: 200, pausedAt: 3000 } };
  expect(pv(viewFor(paused, content, player('o1'), 9000)).clock).toEqual({ elapsedMs: 1800, paused: true, pausedAt: 3000 });
  expect(pv(viewFor(act, content, player('o1'), 5000)).act).toBe(1);
});

test('чужие ставки не видны: в закрытых торгах игрок видит только свои', () => {
  const s0 = makeGame(12);
  const lotId = Object.keys(s0.lots)[0];
  const s = {
    ...s0,
    lots: { ...s0.lots, [lotId]: { ...s0.lots[lotId], status: 'sealedBidding' as const, bids: [
      { player: 'o1', amount: 5, at: 1 }, { player: 'o2', amount: 9, at: 2 },
    ] } },
  };
  expect(pv(viewFor(s, content, player('o1'), 0)).lots.find(l => l.id === lotId)?.bids).toEqual([{ player: 'o1', amount: 5, at: 1 }]);
  expect(pv(viewFor(s, content, player('o2'), 0)).lots.find(l => l.id === lotId)?.bids).toEqual([{ player: 'o2', amount: 9, at: 2 }]);
  expect(pv(viewFor(s, content, player('o4'), 0)).lots.find(l => l.id === lotId)?.bids).toEqual([]);
});
