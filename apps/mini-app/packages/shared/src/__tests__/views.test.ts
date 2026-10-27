import { expect, test } from 'vitest';
import { viewFor, type GmView, type PlayerView } from '../views';
import type { AbilityUse, Actor, Command } from '../commands';
import type { GameState } from '../types';
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

test('offerItems: адресат видит вид и ref предложенной вещи, посторонний не видит ничего', () => {
  let s = makeGame(12);
  const item = Object.values(s.items).find(i => i.owner.type === 'player' && i.owner.key === 'o2' && !i.hiddenUntilAct)!;
  expect(item).toBeDefined();
  const none = { gold: 0, ingredients: { ash: 0, moon: 0, dew: 0 }, items: [] };
  const r = run(s, { type: 'offer.create', to: 'o4', give: { ...none, items: [item.id] }, get: { ...none, gold: 2 } }, player('o2'));
  if (!r.ok) throw new Error(r.error);
  s = r.state;

  const to = pv(viewFor(s, content, player('o4'), 0));
  expect(to.offerItems).toEqual({ [item.id]: { kind: item.kind, ref: item.ref } });
  expect(pv(viewFor(s, content, player('o2'), 0)).offerItems[item.id]).toEqual({ kind: item.kind, ref: item.ref });

  const third = pv(viewFor(s, content, player('o1'), 0));
  expect(third.offerItems).toEqual({});
  expect(JSON.stringify(third)).not.toContain(`"${item.id}"`);
});

// --- Этап 3: способности, запросы согласия, журнал применений ---

/** Успешная команда: новое состояние. */
function must(s: GameState, cmd: Command, actor: Actor): GameState {
  const r = run(s, cmd, actor);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.error} ${r.detail ?? ''}`);
  return r.state;
}
const use = (u: AbilityUse): Command => ({ type: 'ability.use', use: u });

test('me.ability: available в акте, closed в setup, pending с id запроса, used после применения', () => {
  const s = makeGame(30);
  const v = pv(viewFor(s, content, player('o8'), 0)).me.ability;
  expect(v).toEqual({
    name: content.roleByKey.o8.skill, text: content.roleByKey.o8.effect,
    kind: 'stealGold', hostile: true, verbal: false, target: 'other', place: 'role', state: 'available',
  });
  expect(pv(viewFor({ ...s, phase: 'setup' }, content, player('o8'), 0)).me.ability.state).toBe('closed');
  expect(pv(viewFor({ ...s, phase: 'closed' }, content, player('o8'), 0)).me.ability.state).toBe('closed');
  expect(pv(viewFor(s, content, player('r5'), 0)).me.ability).toMatchObject({ kind: 'askYesNo', verbal: true });

  const pending = must(s, use({ kind: 'cleanseOther', target: 'o9' }), player('o10'));
  const id = pending.players.o10.abilityPending!;
  expect(pv(viewFor(pending, content, player('o10'), 0)).me.ability).toMatchObject({ state: 'pending', pendingRequest: id });

  const used = must(s, use({ kind: 'stealGold', target: 'o2' }), player('o8'));
  const after = pv(viewFor(used, content, player('o8'), 0)).me.ability;
  expect(after.state).toBe('used');
  expect(after).not.toHaveProperty('pendingRequest');
});

test('Астра видит три копируемых вида; владелец вне ярмарки — owner null', () => {
  const s = makeGame(30, { present: allBut(30, ['o6']) });
  const v = pv(viewFor(s, content, player('o17'), 0)).me.ability;
  expect(v.kind).toBe('copyAbility');
  expect(v.copy).toEqual([
    { kind: 'grow', owner: 'o2', name: content.roleByKey.o2.skill },
    { kind: 'substituteIngredient', owner: null, name: content.roleByKey.o6.skill },
    { kind: 'discountOther', owner: 'o14', name: content.roleByKey.o14.skill },
  ]);
  expect(pv(viewFor(s, content, player('o8'), 0)).me.ability).not.toHaveProperty('copy');
});

test('actions: автор и цель видят запись, intel только у автора, третий не видит ничего', () => {
  let s = makeGame(30);
  s = must(s, use({ kind: 'stealGold', target: 'o2' }), player('o8'));
  s = must(s, use({ kind: 'inspectInventory', target: 'o5' }), player('o11'));
  s = must(s, use({ kind: 'askYesNo', target: 'o10', question: 'Ты ищешь корону?' }), player('r5'));

  const victim = pv(viewFor(s, content, player('o2'), 0)).actions;
  expect(victim).toHaveLength(1);
  expect(victim[0]).toMatchObject({ author: 'o8', target: 'o2', outcome: 'done', hostile: true });
  expect(victim[0]).not.toHaveProperty('intel');

  const corvin = pv(viewFor(s, content, player('o11'), 0)).actions;
  expect(corvin).toHaveLength(1);
  expect(corvin[0].intel).toMatchObject({ kind: 'inventory', target: 'o5' });
  const inspected = pv(viewFor(s, content, player('o5'), 0)).actions;
  expect(inspected).toHaveLength(1);
  expect(inspected[0]).not.toHaveProperty('intel');

  // Вопрос Весты видит только она.
  expect(pv(viewFor(s, content, player('r5'), 0)).actions[0].intel).toEqual({ kind: 'question', target: 'o10', question: 'Ты ищешь корону?' });
  const asked = pv(viewFor(s, content, player('o10'), 0));
  expect(asked.actions).toHaveLength(1);
  expect(JSON.stringify(asked.actions)).not.toContain('корону');

  expect(pv(viewFor(s, content, player('o1'), 0)).actions).toEqual([]);
});

test('actions: перенос защиты видят автор, from и to', () => {
  let s = makeGame(30);
  s = must(s, use({ kind: 'protectOther', target: 'o11' }), player('t3'));
  s = must(s, use({ kind: 'transferProtection', from: 'o11', to: 't2' }), player('o16'));
  const id = s.players.o16.abilityPending!;
  s = must(s, { type: 'consent.accept', id }, player('o11'));
  for (const k of ['o16', 'o11', 't2']) {
    expect(pv(viewFor(s, content, player(k), 0)).actions.some(a => a.source.type === 'ability' && a.source.ability === 'transferProtection')).toBe(true);
  }
  expect(pv(viewFor(s, content, player('o1'), 0)).actions).toEqual([]);
});

test('requests: видят автор и одобряющий, третий нет; у вещи нет itemId', () => {
  let s = makeGame(30);
  s = must(s, use({ kind: 'cleanseOther', target: 'o9' }), player('o10'));
  const id = s.players.o10.abilityPending!;
  const expected = {
    id, author: 'o10', approvers: ['o9'], approved: [], status: 'pending', createdAt: 0, expiresAt: 300000,
    action: { type: 'ability', ability: 'cleanseOther', target: 'o9' },
  };
  expect(pv(viewFor(s, content, player('o10'), 0)).requests).toEqual([expected]);
  expect(pv(viewFor(s, content, player('o9'), 0)).requests).toEqual([expected]);
  expect(pv(viewFor(s, content, player('o1'), 0)).requests).toEqual([]);

  // Копия Астры: вид оригинала в copied, цель вложенного применения.
  s = must(s, use({ kind: 'copyAbility', copy: { kind: 'discountOther', target: 'r2' } }), player('o17'));
  const copyReq = pv(viewFor(s, content, player('r2'), 0)).requests;
  expect(copyReq).toHaveLength(1);
  expect(copyReq[0].approvers).toEqual(['o14', 'r2']);
  expect(copyReq[0].action).toEqual({ type: 'ability', ability: 'copyAbility', copied: 'discountOther', target: 'r2' });

  // Камень облика на другого: вид и облик видны, id вещи нет.
  s = must(s, { type: 'shop.craft', recipeId: 'shape' }, player('r5'));
  const stone = Object.values(s.items).find(i => i.kind === 'shape' && i.owner.type === 'player' && i.owner.key === 'r5')!;
  s = must(s, { type: 'item.use', itemId: stone.id, target: 'o1', guise: 'Странник' }, player('r5'));
  const seen = pv(viewFor(s, content, player('o1'), 0)).requests;
  expect(seen).toHaveLength(1);
  expect(seen[0].action).toEqual({ type: 'item', kind: 'shape', target: 'o1', guise: 'Странник' });
  expect(JSON.stringify(seen)).not.toContain(stone.id);
});

test('requests: закрытая сменой акта просьба видна весь следующий акт, потом пропадает', () => {
  const at = (st: GameState, cmd: Command, actor: Actor, now: number) => {
    const r = run(st, cmd, actor, now);
    if (!r.ok) throw new Error(`${cmd.type}: ${r.error} ${r.detail ?? ''}`);
    return r.state;
  };
  let s = at(makeGame(30), use({ kind: 'cleanseOther', target: 'o9' }), player('o10'), 1000);
  const id = s.players.o10.abilityPending!;
  s = at(s, { type: 'act.next' }, gm, 5000);
  for (const k of ['o10', 'o9']) {
    expect(pv(viewFor(s, content, player(k), 6000)).requests).toEqual([
      expect.objectContaining({ id, status: 'expired', reason: 'act', createdAt: 1000 }),
    ]);
  }
  s = at(s, { type: 'act.next' }, gm, 9000);
  expect(pv(viewFor(s, content, player('o10'), 10000)).requests).toEqual([]);
});

test('others[].guise: облик после Камня виден всем', () => {
  let s = makeGame(30);
  s = must(s, { type: 'shop.craft', recipeId: 'shape' }, player('r5'));
  const stone = Object.values(s.items).find(i => i.kind === 'shape' && i.owner.type === 'player' && i.owner.key === 'r5')!;
  s = must(s, { type: 'item.use', itemId: stone.id, guise: 'Странник' }, player('r5'));
  for (const k of ['o1', 'o8', 't4']) {
    const other = pv(viewFor(s, content, player(k), 0)).others.find(o => o.roleKey === 'r5');
    expect(other?.guise).toBe('Странник');
  }
  expect(pv(viewFor(s, content, player('o1'), 0)).others.find(o => o.roleKey === 'o8')).not.toHaveProperty('guise');
});

test('GmView.abilities: все роли содержимого с видом, враждебностью и названием', () => {
  const s = makeGame(12);
  const v = viewFor(s, content, gm, 0) as GmView;
  expect(Object.keys(v.abilities).sort()).toEqual(content.roles.map(r => r.key).sort());
  expect(v.abilities.o8).toEqual({ kind: 'stealGold', hostile: true, verbal: false, name: content.roleByKey.o8.skill });
  expect(v.abilities.r5).toMatchObject({ kind: 'askYesNo', verbal: true, hostile: false });
});
