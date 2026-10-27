import { describe, expect, test } from 'vitest';
import { GOALS, type GoalCondition } from '../goals';
import { content } from './helpers';

/** Грубое соответствие текста цели виду условия: защита от перепутанных строк (спецификация §4.3). */
const KEYWORDS: Record<GoalCondition['type'], RegExp> = {
  holdItem: /сохранить|держать|получить/i, goldAtLeast: /золот/i, contributedFocus: /фокус/i, contributedGold: /золот/i,
  contributedShard: /осколок/i, shapeSelf: /камень облика/i, cleansed: /очищени/i, cleanseOthers: /очистить|снять/i,
  exchanges: /обмен/i, servicePaid: /плат|золот/i, soldCrafted: /продать/i, craftedKinds: /изготовить/i,
  holdCraftedKinds: /вид/i, holdRelics: /реликви/i, holdKind: /сохранить/i, holdClues: /улик/i,
  abilityUsed: /применить|наложить|досмотреть|узнать/i, potionOnOther: /зелье/i, gaveKind: /передать/i, protectedOthers: /защиту/i,
};
const ALTAR_SIDES = ['wake', 'bind', 'break', 'ship'];

describe('каталог целей', () => {
  test('у каждой из 30 ролей ровно две цели, лишних ключей нет', () => {
    expect(Object.keys(GOALS).sort()).toEqual(content.roles.map(r => r.key).sort());
    expect(Object.keys(GOALS)).toHaveLength(30);
    for (const pair of Object.values(GOALS)) expect(pair).toHaveLength(2);
  });

  test('holdItem ссылается на реликвию содержимого, contributed* на сторону с алтарём, holdClues на три улики', () => {
    const relics = new Set(content.relics.map(r => r.name));
    for (const c of Object.values(GOALS).flat()) {
      if (c.type === 'holdItem') expect(relics, c.ref).toContain(c.ref);
      if (c.type === 'contributedFocus' || c.type === 'contributedGold' || c.type === 'contributedShard') expect(ALTAR_SIDES).toContain(c.side);
      if (c.type === 'holdClues') expect(c.count).toBe(3);
    }
  });

  test('текст цели роли содержит ключевое слово своего условия', () => {
    for (const role of content.roles) {
      GOALS[role.key].forEach((c, i) => {
        expect(role.goals[i], `${role.key} цель ${i + 1}: ${c.type}`).toMatch(KEYWORDS[c.type]);
      });
    }
  });
});
