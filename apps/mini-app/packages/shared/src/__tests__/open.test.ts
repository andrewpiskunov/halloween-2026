import { describe, expect, test } from 'vitest';
import { allBut, content, gm, makeGame, newGame, run } from './helpers';
import type { GameState, Item, ItemKind, Lot } from '../types';

function item(s: GameState, kind: ItemKind, ref: string): Item | undefined {
  return Object.values(s.items).find(i => i.kind === kind && i.ref === ref);
}
function lotOf(s: GameState, it: Item | undefined): Lot | undefined {
  return it && it.owner.type === 'lot' ? s.lots[it.owner.id] : undefined;
}
function lotRefs(s: GameState, status: Lot['status']): string[] {
  return Object.values(s.lots).filter(l => l.status === status).flatMap(l => l.items.map(id => s.items[id].ref));
}

describe('сценарий А: N=17, не пришли Грим o13 и Лира o14', () => {
  const s = makeGame(17, { present: allBut(17, ['o13', 'o14']) });
  const p = (k: string) => s.players[k];

  test('А: стартовые наборы: 6 золота и bundle роли', () => {
    expect(p('o6').gold).toBe(6);
    expect(p('o6').ingredients).toEqual(content.roleByKey.o6.bundle);
    expect(p('o6').present).toBe(true);
    expect(s.phase).toBe('act1');
  });
  test('А: отсутствующие не получают наборов и вещей', () => {
    expect(p('o13').gold).toBe(0);
    expect(p('o13').ingredients).toEqual({ ash: 0, moon: 0, dew: 0 });
    expect(p('o13').present).toBe(false);
    const owned = Object.values(s.items).filter(i => i.owner.type === 'player' && ['o13', 'o14'].includes(i.owner.key));
    expect(owned).toEqual([]);
  });
  test('А: nPresent 15, запас мастерской ceil(15/3)=5 каждого', () => {
    expect(s.nPresent).toBe(15);
    expect(s.workshop).toEqual({ ash: 5, moon: 5, dew: 5 });
  });
  test('А: осколки I–III у владельцев, IV и V не созданы', () => {
    expect(item(s, 'shard', 'I')?.owner).toEqual({ type: 'player', key: 'o1' });
    expect(item(s, 'shard', 'II')?.owner).toEqual({ type: 'player', key: 'o5' });
    expect(item(s, 'shard', 'III')?.owner).toEqual({ type: 'player', key: 'o9' });
    expect(item(s, 'shard', 'IV')).toBeUndefined();
    expect(item(s, 'shard', 'V')).toBeUndefined();
  });
  test('А: Корона пепла Грима в лоте первого акта (претендент Серафина в составе)', () => {
    const lot = lotOf(s, item(s, 'relic', 'Корона пепла'));
    expect(lot).toMatchObject({ act: 1, status: 'announced', bids: [] });
  });
  test('А: улика B у Ады, улика C у Клёпы', () => {
    expect(item(s, 'clue', 'B')?.owner).toEqual({ type: 'player', key: 'o10' });
    expect(item(s, 'clue', 'C')?.owner).toEqual({ type: 'player', key: 'o16' });
    expect(item(s, 'clue', 'A')).toBeUndefined();
  });
  test('А: алтари wake, bind, break есть, ship нет', () => {
    expect(Object.keys(s.altars).sort()).toEqual(['bind', 'break', 'wake']);
    expect(s.altars.wake).toEqual({ side: 'wake', contributions: [] });
  });
});

describe('сценарии Б–Г: N=12', () => {
  test('Б: все 12 пришли → ровно один лот: Медный жезл (владелец Астра o17 вне состава, претендент Вельда o5 в составе); Изумрудный глаз (претенденты o7 и r2 вне состава) не создан', () => {
    const s = makeGame(12);
    expect(Object.keys(s.lots)).toHaveLength(1);
    expect(lotRefs(s, 'announced')).toEqual(['Медный жезл']);
    expect(item(s, 'relic', 'Изумрудный глаз')).toBeUndefined();
    expect(item(s, 'shard', 'V')).toMatchObject({ owner: { type: 'player', key: 'o14' }, hiddenUntilAct: 3 });
    expect(Object.values(s.items).filter(i => i.kind === 'relic' && i.owner.type === 'player')).toHaveLength(6);
    expect(s.workshop).toEqual({ ash: 4, moon: 4, dew: 4 });
  });

  test('В: N=12, Клёпа o16 не пришла → улика C и Лунный рог в лотах первого акта', () => {
    const s = makeGame(12, { present: allBut(12, ['o16']) });
    expect(lotOf(s, item(s, 'clue', 'C'))).toMatchObject({ act: 1, status: 'announced' });
    expect(lotOf(s, item(s, 'relic', 'Лунный рог'))).toMatchObject({ act: 1, status: 'announced' });
  });

  test('Г: N=12, не пришли o1, o5, o9, o13, o16 → пул из 7 вещей (осколки I–III, улика C, Корона, Лунный рог, Медный жезл): ровно 4 лота announced, 3 queued с act 2; осколки и улика в announced раньше реликвий', () => {
    const s = makeGame(12, { present: allBut(12, ['o1', 'o5', 'o9', 'o13', 'o16']) });
    const lots = Object.values(s.lots);
    expect(lots).toHaveLength(7);
    expect(lots.every(l => l.items.length === 1)).toBe(true);
    expect(lotRefs(s, 'announced')).toEqual(['I', 'II', 'III', 'C']);
    expect(lotRefs(s, 'queued').sort()).toEqual(['Корона пепла', 'Лунный рог', 'Медный жезл'].sort());
    expect(lots.filter(l => l.status === 'announced').every(l => l.act === 1)).toBe(true);
    expect(lots.filter(l => l.status === 'queued').every(l => l.act === 2)).toBe(true);
    for (const l of lots) expect(s.items[l.items[0]].owner).toEqual({ type: 'lot', id: l.id });
  });

  test('N=24: алтарь ship создаётся при торговом доме в составе', () => {
    expect(Object.keys(makeGame(24).altars).sort()).toEqual(['bind', 'break', 'ship', 'wake']);
  });

  test('open не изменяет входное состояние', () => {
    let s = newGame();
    for (const cmd of [{ type: 'session.setN', n: 12 }, { type: 'player.setPresent', roleKey: 'o1', present: true }] as const) {
      const r = run(s, cmd, gm);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    const before = JSON.stringify(s);
    const r = run(s, { type: 'session.open' }, gm);
    expect(r.ok).toBe(true);
    expect(JSON.stringify(s)).toBe(before);
    expect(s.phase).toBe('setup');
  });

  test('open дважды → phase; toggleRole и setN после open → phase (setPresent после open — presence.test.ts)', () => {
    const s = makeGame(12);
    expect(run(s, { type: 'session.open' }, gm)).toMatchObject({ ok: false, error: 'phase' });
    expect(run(s, { type: 'session.toggleRole', roleKey: 'o1' }, gm)).toMatchObject({ ok: false, error: 'phase' });
    expect(run(s, { type: 'session.setN', n: 13 }, gm)).toMatchObject({ ok: false, error: 'phase' });
  });

  test('open, когда никто не отмечен как пришедший → invalid, фаза setup', () => {
    const r0 = run(newGame(), { type: 'session.setN', n: 12 }, gm);
    if (!r0.ok) throw new Error(r0.error);
    expect(run(r0.state, { type: 'session.open' }, gm))
      .toMatchObject({ ok: false, error: 'invalid', detail: 'никто не отмечен как пришедший' });
  });

  test('open публикует объявление «Ярмарка открыта» из content.events', () => {
    const s = makeGame(12);
    const ev = content.events.find(e => e.when === 'Открытие')!;
    expect(s.announcements).toEqual([{ at: 0, title: 'Ярмарка открыта', text: ev.text }]);
  });
});
