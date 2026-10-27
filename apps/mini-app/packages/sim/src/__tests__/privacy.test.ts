import { describe, expect, test } from 'vitest';
import type { PlayerView } from '@fair/shared';
import { forbiddenStrings, privacyViolations } from '../privacy';
import { content, Game } from './fixture';

/** Проекция с подмешанным текстом в объявлениях. */
const withText = (view: PlayerView, text: string): PlayerView =>
  ({ ...view, announcements: [...view.announcements, { at: 0, title: 'проба', text }] });

const check = (view: PlayerView, forbidden: string[]) => privacyViolations(JSON.stringify(view), view, forbidden);

describe('privacy', () => {
  test('проекция o1 на 12 без нарушений', () => {
    const g = new Game(12);
    const view = g.view('o1');
    const forbidden = forbiddenStrings(content, g.s, 'o1');
    expect(forbidden.length).toBeGreaterThan(50);
    expect(check(view, forbidden)).toEqual([]);
  });

  test('проекции всех ролей на 30 без нарушений', () => {
    const g = new Game(30);
    for (const key of g.s.roster) expect(check(g.view(key), forbiddenStrings(content, g.s, key)), key).toEqual([]);
  });

  test('чужая цель o6 в проекции o1: одно нарушение', () => {
    const g = new Game(12);
    const goal = content.roleByKey.o6.goals[0];
    expect(content.roleByKey.o1.goals.some(x => x.includes(goal))).toBe(false);
    const v = check(withText(g.view('o1'), goal), forbiddenStrings(content, g.s, 'o1'));
    expect(v).toHaveLength(1);
    expect(v[0]).toContain(goal.slice(0, 20));
  });

  test('чужая реплика, секрет и код приглашения ловятся', () => {
    const g = new Game(12);
    const f = forbiddenStrings(content, g.s, 'o1');
    const o6 = content.roleByKey.o6;
    expect(check(withText(g.view('o1'), o6.acting.lines[0]), f)).toHaveLength(1);
    expect(check(withText(g.view('o1'), o6.secret), f)).toHaveLength(1);
    expect(check(withText(g.view('o1'), 'code-o6'), f)).toHaveLength(1);
    expect(check(withText(g.view('o1'), 'code-gm'), f)).toHaveLength(1);
  });

  test('текст цели, общий для o1 и другой роли, нарушением не считается', () => {
    const g = new Game(30);
    // цель Пима целиком входит в цель Серафины
    const shared = content.roleByKey.n18.goals[1];
    expect(content.roleByKey.o1.goals[1]).toContain(shared);
    expect(check(withText(g.view('o1'), shared), forbiddenStrings(content, g.s, 'o1'))).toEqual([]);
    // одинаковая цель у Тумана, Корвина и Торвина
    const same = content.roleByKey.o11.goals[0];
    expect(content.roleByKey.o4.goals).toContain(same);
    expect(forbiddenStrings(content, g.s, 'o4')).not.toContain(same);
  });

  test('ключ telegramId внутри me.player: нарушение по структуре', () => {
    const g = new Game(12);
    const view = g.view('o1');
    const bad: PlayerView = { ...view, me: { ...view.me, player: { ...view.me.player, telegramId: 1234567 } } };
    const v = check(bad, forbiddenStrings(content, g.s, 'o1'));
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('telegramId');
    // число само по себе не нарушение
    expect(check(withText(view, '1234567'), forbiddenStrings(content, g.s, 'o1'))).toEqual([]);
  });

  test('чужой объект Player в проекции: нарушение', () => {
    const g = new Game(12);
    const view = g.view('o1');
    const { telegramId: _t, ...other } = g.s.players.o2;
    const bad = { ...view, others: [...view.others, { ...view.others[0], leaked: other }] } as PlayerView;
    const v = check(bad, forbiddenStrings(content, g.s, 'o1'));
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('o2');
  });
});
