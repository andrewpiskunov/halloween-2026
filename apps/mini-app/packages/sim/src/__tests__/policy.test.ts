import { describe, expect, test } from 'vitest';
import { type Command, type PlayerView } from '@fair/shared';
import { answerIncoming, bidFor, playerAction, recipeFor, type TurnMemory } from '../policy';
import { Rng } from '../rng';
import { Game } from './fixture';

const freshMemory = (): TurnMemory => ({
  abilityUsedAct: null, boughtPending: null, serviceDone: false, cancelDone: false, withdrawDone: false, bids: {},
});

const zero = { ash: 0, moon: 0, dew: 0 };

/** Проекция с подменённым свободным золотом и одним лотом в закрытых ставках. */
function withLot(view: PlayerView, gold: number): PlayerView {
  const lot: PlayerView['lots'][number] = { id: 'lot-a', act: 2, status: 'sealedBidding', bids: [], items: [], bidders: 0 };
  return { ...view, me: { ...view.me, available: { ...view.me.available, gold } }, lots: [lot] };
}

describe('bidFor', () => {
  test('ставка строго выше прежней и не больше золота (Review Focus 3)', () => {
    const view = new Game(30).view('o1');
    const mem = { ...freshMemory(), bids: { 'lot-a': 2 } };
    expect(bidFor(withLot(view, 3), 'lot-a', mem, new Rng(1))).toBe(3);
    expect(bidFor(withLot(view, 2), 'lot-a', { ...freshMemory(), bids: { 'lot-a': 2 } }, new Rng(1))).toBeNull();
  });

  test('прежняя ставка берётся и из lots[].bids проекции', () => {
    const view = withLot(new Game(30).view('o1'), 3);
    view.lots[0].bids = [{ player: 'o1', amount: 3, at: 1 }];
    expect(bidFor(view, 'lot-a', freshMemory(), new Rng(1))).toBeNull();
  });

  test('нет лота: null', () => {
    expect(bidFor(new Game(30).view('o1'), 'нет', freshMemory(), new Rng(1))).toBeNull();
  });
});

describe('playerAction', () => {
  test('Никс (stealGold): в акте I без способности, в акте II со способностью', () => {
    const g = new Game(30);
    const view = g.view('o8');
    for (let seed = 1; seed <= 20; seed++) {
      const cmd = playerAction(view, 1, freshMemory(), new Rng(seed), g.s.roster);
      expect(cmd?.type).not.toBe('ability.use');
    }
    const mem = freshMemory();
    const cmd = playerAction(view, 2, mem, new Rng(1), g.s.roster);
    expect(cmd).toEqual({ type: 'ability.use', use: expect.objectContaining({ kind: 'stealGold' }) });
    expect(mem.abilityUsedAct).toBe(2);
  });

  test('способность в акте один раз: второй ход идёт дальше по политике', () => {
    const g = new Game(30);
    const mem = freshMemory();
    expect(playerAction(g.view('o4'), 1, mem, new Rng(1), g.s.roster)?.type).toBe('ability.use');
    expect(playerAction(g.view('o4'), 1, mem, new Rng(1), g.s.roster)?.type).not.toBe('ability.use');
  });

  test('купить, затем изготовить отложенный рецепт', () => {
    const g = new Game(30);
    const mem = { ...freshMemory(), abilityUsedAct: 1 as const };
    const rng = new Rng(3);
    const seen: Command['type'][] = [];
    for (let i = 0; i < 4; i++) {
      const cmd = playerAction(g.view('o16'), 1, mem, rng, g.s.roster);
      if (!cmd) break;
      seen.push(cmd.type);
      g.run(cmd, 'o16');
    }
    expect(seen).toContain('shop.craft');
    expect(g.s.crafts.some(c => c.player === 'o16')).toBe(true);
  });

  test('акт III: изготовленное зелье применяется', () => {
    const g = new Game(30);
    const mem = { ...freshMemory(), abilityUsedAct: 3 as const };
    const rng = new Rng(4);
    const used: Command[] = [];
    for (let i = 0; i < 12; i++) {
      const cmd = playerAction(g.view('o2'), 3, mem, rng, g.s.roster);
      if (!cmd) break;
      if (cmd.type === 'item.use') used.push(cmd);
      g.run(cmd, 'o2');
    }
    expect(used.length).toBeGreaterThan(0);
  });

  test('одно зерно даёт одну и ту же команду', () => {
    const g = new Game(30);
    for (const key of g.s.roster) {
      const a = playerAction(g.view(key), 1, freshMemory(), new Rng(5), g.s.roster);
      const b = playerAction(g.view(key), 1, freshMemory(), new Rng(5), g.s.roster);
      expect(a).toEqual(b);
    }
  });
});

describe('answerIncoming', () => {
  test('принимает предложение, после которого золото не ниже 1, иначе отклоняет', () => {
    const g = new Game(30);
    const gold = g.view('o1').me.available.gold;
    g.must({ type: 'offer.create', to: 'o1', give: { gold: 0, ingredients: zero, items: [] }, get: { gold, ingredients: zero, items: [] } }, 'o2');
    g.must({ type: 'offer.create', to: 'o1', give: { gold: 0, ingredients: zero, items: [] }, get: { gold: gold - 1, ingredients: zero, items: [] } }, 'o5');
    g.must({ type: 'offer.create', to: 'o1', give: { gold: 2, ingredients: zero, items: [] }, get: { gold: gold + 1, ingredients: zero, items: [] } }, 'o9');
    const offers = Object.values(g.s.offers);
    const byFrom = (k: string) => offers.find(o => o.from === k)!.id;
    const cmds = answerIncoming(g.view('o1'), new Rng(1));
    expect(cmds).toContainEqual({ type: 'offer.decline', id: byFrom('o2') });
    expect(cmds).toContainEqual({ type: 'offer.accept', id: byFrom('o5') });
    expect(cmds).toContainEqual({ type: 'offer.accept', id: byFrom('o9') });
    expect(cmds).toHaveLength(3);
  });

  test('просьбу о способности принимает всегда, свои и одобренные не трогает', () => {
    const g = new Game(30);
    g.must({ type: 'ability.use', use: { kind: 'cleanseOther', target: 'o1' } }, 'o10');
    const id = Object.keys(g.s.requests)[0];
    expect(answerIncoming(g.view('o1'), new Rng(1))).toEqual([{ type: 'consent.accept', id }]);
    expect(answerIncoming(g.view('o10'), new Rng(1))).toEqual([]);
  });

  test('просьбу о вещи принимает примерно в 3 случаях из 4', () => {
    const g = new Game(30);
    g.must({ type: 'shop.buy', ingredient: 'ash' }, 'o2');
    g.must({ type: 'shop.craft', recipeId: 'cleanse' }, 'o2');
    const potion = Object.values(g.s.items).find(i => i.kind === 'potion')!;
    g.must({ type: 'item.use', itemId: potion.id, target: 'o1' }, 'o2');
    const view = g.view('o1');
    const rng = new Rng(7);
    let accepted = 0;
    for (let i = 0; i < 400; i++) {
      const [cmd] = answerIncoming(view, rng);
      if (cmd.type === 'consent.accept') accepted++;
      else expect(cmd.type).toBe('consent.decline');
    }
    expect(accepted).toBeGreaterThan(260);
    expect(accepted).toBeLessThan(340);
  });
});

describe('recipeFor', () => {
  test('по целям: Грета любые виды, Хельга талисман, Серафина фокус, Клёпа фокус или талисман', () => {
    const rng = new Rng(1);
    const greta = new Set(Array.from({ length: 40 }, () => recipeFor('o6', rng)));
    expect([...greta].sort()).toEqual(['cleanse', 'focus', 'shape', 'ward']);
    expect(recipeFor('o1', rng)).toBe('focus');
    expect(['focus', 'ward']).toContain(recipeFor('o16', rng));
    expect(recipeFor('n20', rng)).toBe('ward');
    expect(['cleanse', 'focus', 'shape', 'ward']).toContain(recipeFor('o8', rng));
  });
});
