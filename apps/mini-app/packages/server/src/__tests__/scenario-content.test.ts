import { afterEach, expect, test } from 'vitest';
import { attachHiddenScenario } from '../scenario';
import { EventStore } from '../store';
import { Game } from '../game';
import { content, gm, testOpts } from './fixtures';
import { viewFor } from '@fair/shared';
const stores: EventStore[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });

test('актуальные доказательства и дар Ады выдаются через настоящую проекцию без чужих улик', async () => {
  const current = attachHiddenScenario(content);
  const store = new EventStore(':memory:'); stores.push(store);
  const opts = { ...testOpts(), hidden17: true };
  const game = Game.open(store, current, opts);
  for (const roleKey of ['o10', 'o16', 'o1', 'o6', 'o9']) {
    expect((await game.submit('present:' + roleKey, { type: 'player.setPresent', roleKey, present: true }, gm)).ok).toBe(true);
  }
  await game.submit('open', { type: 'session.open' }, gm);
  for (const [key, own] of [['o10', 'B'], ['o16', 'C'], ['o1', ''], ['o6', ''], ['o9', '']] as const) {
    const view = viewFor(game.state(), current, { type: 'player', roleKey: key }, opts.clock.now);
    expect(view.kind).toBe('player'); if (view.kind !== 'player') continue;
    const contacts = current.hidden17!.narrative!.roles[key].acquaintances!.map(({ role, text }) => ({ role, text }));
    expect(current.roleByKey[key].contacts).toEqual(contacts);
    expect(view.hidden17!.narrative!.role.acquaintances!.map(({ role, text }) => ({ role, text }))).toEqual(contacts);
    if (key === 'o6') {
      expect(current.roleByKey[key].rumor).not.toMatch(/Ада|Эльмар/);
      expect(view.me.role.rumor).toBe('');
    }
    if (key === 'o9') expect(JSON.stringify(view.contacts)).not.toContain('Ада');
    for (const id of ['A', 'B', 'C']) {
      const expected = current.hidden17!.narrative!.items['clue:' + id].description;
      if (id === own) {
        expect(view.public.clues.find(clue => clue.id === id)?.text).toBe(expected);
      } else {
        expect(JSON.stringify(view)).not.toContain(expected);
      }
    }
    if (key === 'o10') {
      expect(view.me.role.effect).not.toMatch(/Эльмар|Ильматор/);
      expect(view.me.ability.text).not.toMatch(/Эльмар|Ильматор/);
    }
  }
  expect(current.clues.find(clue => clue.id === 'A')?.text).toMatch(/Орвик.*Грим/);
  expect(content.clues.find(clue => clue.id === 'A')?.text).not.toBe(current.clues.find(clue => clue.id === 'A')?.text);
  expect(current.roles.find(role => role.key === 'o10')).toBe(current.roleByKey.o10);
  expect((await game.submit('release', { type: 'fair.auction' }, gm)).ok).toBe(true);
  const clueA = Object.values(game.state().items).find(item => item.kind === 'clue' && item.ref === 'A')!;
  const lot = Object.values(game.state().lots).find(lot => lot.items.includes(clueA.id))!;
  expect((await game.submit('bidding', { type: 'lot.sealedBids', id: lot.id }, gm)).ok).toBe(true);
  expect((await game.submit('bid', { type: 'lot.bid', id: lot.id, amount: 2 }, { type: 'player', roleKey: 'o1' })).ok).toBe(true);
  expect((await game.submit('award-A', { type: 'lot.close', id: lot.id }, gm)).ok).toBe(true);
  const owner = viewFor(game.state(), current, { type: 'player', roleKey: 'o1' }, opts.clock.now);
  expect(owner.kind === 'player' && owner.public.clues.find(clue => clue.id === 'A')?.text).toBe(current.hidden17!.narrative!.items['clue:A'].description);
  const other = viewFor(game.state(), current, { type: 'player', roleKey: 'o16' }, opts.clock.now);
  expect(JSON.stringify(other)).not.toContain(current.hidden17!.narrative!.items['clue:A'].description);
});
