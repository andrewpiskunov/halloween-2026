import { expect, test } from 'vitest';
import type { ActionRecord, ConsentRequestView, Offer, PlayerView } from '@fair/shared';
import { actionText, clueText, countsText, goldText, isFemaleName, nameCase, setFemaleNames, verb, offerClosedText, offerItem, ownActionText, plural, recordItemText, requestOutcomeText, roleName, roman } from '../labels';

test('римские номера карт', () => {
  expect([1, 4, 9, 14, 19, 24, 28, 30].map(roman)).toEqual(['I', 'IV', 'IX', 'XIV', 'XIX', 'XXIV', 'XXVIII', 'XXX']);
});

test('золото по-русски', () => {
  expect(goldText(1)).toBe('1 золотой');
  expect(goldText(2)).toBe('2 золотых');
  expect(goldText(6)).toBe('6 золотых');
  expect(goldText(21)).toBe('21 золотой');
  expect(plural(12, 'гость', 'гостя', 'гостей')).toBe('гостей');
  expect(plural(22, 'гость', 'гостя', 'гостей')).toBe('гостя');
});

test('вещь из предложения берётся из offerItems, неизвестная — undefined', () => {
  const v = { me: { items: [{ id: 'm1', kind: 'relic', ref: 'Семя леса', owner: { type: 'player', key: 'o1' } }] }, offerItems: { x9: { kind: 'focus', ref: 'focus' } } } as unknown as PlayerView;
  expect(offerItem('m1', v)?.ref).toBe('Семя леса');
  expect(offerItem('x9', v)).toEqual({ kind: 'focus', ref: 'focus' });
  expect(offerItem('zz', v)).toBeUndefined();
});

test('ресурсы словами для подтверждений', () => {
  expect(countsText({ gold: 2, ingredients: { ash: 1, moon: 1, dew: 1 } })).toBe('2 золотых, 1 пепел, 1 пыль, 1 роса');
  expect(countsText({ gold: 1, ingredients: { moon: 0 } })).toBe('1 золотой');
  expect(countsText({})).toBe('');
});

/** Проекция Брама (o2): вокруг Никс, Ива, Эльмар, Ада, Веста и Сив в облике. */
const pv = {
  me: { role: { key: 'o2', name: 'Брам' }, player: {} },
  others: [
    { roleKey: 'o8', name: 'Никс' }, { roleKey: 'o12', name: 'Ива' }, { roleKey: 'o9', name: 'Эльмар' },
    { roleKey: 'o10', name: 'Ада' }, { roleKey: 'r5', name: 'Веста' },
    { roleKey: 'o15', name: 'Сив', guise: 'Человек по имени Сивер' },
  ],
  contacts: [],
  public: { factions: [] },
  recipes: [],
} as unknown as PlayerView;

const rec = (over: Partial<ActionRecord>): ActionRecord => ({
  id: '1', at: 0, act: 1, author: 'o8', source: { type: 'ability', ability: 'stealGold' },
  outcome: 'done', hostile: false, effects: [], ...over,
});

test('имя с обликом: «облик (имя)»', () => {
  expect(roleName('o15', pv)).toBe('Человек по имени Сивер (Сив)');
  expect(roleName('o8', pv)).toBe('Никс');
});

test('падежи имён для подтверждений и уведомлений', () => {
  expect(nameCase('Брам', 'gen')).toBe('Брама');
  expect(nameCase('Ива', 'gen')).toBe('Ивы');
  expect(nameCase('Хельга', 'gen')).toBe('Хельги');
  expect(nameCase('Серафина', 'dat')).toBe('Серафине');
  expect(nameCase('Корвин', 'dat')).toBe('Корвину');
  expect(nameCase('Грета', 'acc')).toBe('Грету');
  expect(nameCase('Эльмар', 'acc')).toBe('Эльмара');
  expect(nameCase('Бубен', 'gen')).toBe('Бубна');
  expect(nameCase('Магда Вейн', 'dat')).toBe('Магде Вейн');
});

test('уведомления цели о чужих действиях (§7.5)', () => {
  expect(actionText(rec({ target: 'o2', hostile: true, effects: [{ type: 'goldMove', from: 'o2', to: 'o8', amount: 1 }] }), pv))
    .toBe('Никс забрал у вас 1 золото');
  expect(actionText(rec({ author: 'o12', target: 'o2', hostile: true, outcome: 'blocked', source: { type: 'ability', ability: 'thorns' } }), pv))
    .toBe('Ваша защита отразила попытку Ивы');
  expect(actionText(rec({ author: 'o9', target: 'o2', source: { type: 'ability', ability: 'protectOther' } }), pv))
    .toBe('Эльмар дал вам защиту до конца акта');
  expect(actionText(rec({ author: 'o10', target: 'o2', source: { type: 'ability', ability: 'cleanseOther' }, removed: { curse: true, thorns: false } }), pv))
    .toBe('Ада сняла с вас проклятие');
  expect(actionText(rec({ author: 'r5', target: 'o2', source: { type: 'ability', ability: 'askYesNo' } }), pv))
    .toBe('Веста задаёт вопрос о ваших целях. Ответьте честно, голосом');
});

test('итог просьбы автору: смена акта, отказ нескольких, отмена', () => {
  const r = (over: Partial<ConsentRequestView>): ConsentRequestView => ({
    id: 'q1', author: 'o2', approvers: ['o9'], approved: [], status: 'pending', createdAt: 0, expiresAt: 300_000,
    action: { type: 'ability', ability: 'cleanseOther', target: 'o9' }, ...over,
  });
  expect(requestOutcomeText(r({ status: 'expired', reason: 'act' }), pv)).toBe('Просьба закрыта: акт закончился');
  expect(requestOutcomeText(r({ status: 'expired', reason: 'timeout' }), pv)).toBe('Просьба к Эльмару истекла');
  expect(requestOutcomeText(r({ status: 'declined', approvers: ['o9', 'o10'] }), pv)).toBe('Просьба отклонена');
  expect(requestOutcomeText(r({ status: 'declined' }), pv)).toBe('Эльмар отказался');
  expect(requestOutcomeText(r({ status: 'cancelled', reason: 'gm' }), pv)).toBe('Ведущий отменил вашу просьбу');
  expect(requestOutcomeText(r({ status: 'cancelled' }), pv)).toBeNull();
  expect(requestOutcomeText(r({ status: 'failed', reason: 'участника нет на ярмарке' }), pv)).toBe('Не выполнено: участника нет на ярмарке');
});

test('участник ушёл: подпись закрытой сделки и просьбы', () => {
  expect(offerClosedText({ status: 'cancelled', reason: 'left' } as Offer)).toBe('Сделка отменена: участник ушёл');
  expect(offerClosedText({ status: 'cancelled', reason: 'author' } as Offer)).toBeNull();
  const r = { id: 'q', author: 'o2', approvers: ['o8'], approved: [], status: 'cancelled', reason: 'left' } as unknown as ConsentRequestView;
  expect(requestOutcomeText(r, pv)).toBe('Просьба закрыта: участник ушёл');
});

test('запись журнала с вещью: «способность: вещь»', () => {
  const v = { ...pv, recipes: [{ id: 'ward', name: 'Защитный талисман', emoji: '🧿' }], public: { factions: [], clues: [] } } as unknown as PlayerView;
  const a = rec({ author: 'o2', source: { type: 'ability', ability: 'reforge' }, item: { kind: 'ward', ref: 'ward' } });
  expect(recordItemText(a, v)).toBe('Перековка: Защитный талисман');
  expect(recordItemText(rec({}), v)).toBeNull();
  expect(ownActionText(a, v)).toBe('Акт I. Перековка: Защитный талисман, исполнено');
});

test('улика в сумке показывает свой текст, но не место, где лежала', () => {
  const v = { public: { clues: [{ id: 'c1', name: 'Письмо', text: 'Встреча у колодца в полночь', where: 'под прилавком' }] } } as unknown as PlayerView;
  expect(clueText({ kind: 'clue', ref: 'c1' }, v)).toBe('Встреча у колодца в полночь');
  expect(clueText({ kind: 'relic', ref: 'c1' }, v)).toBeUndefined();
});

test('женская роль с именем не на -а/-я: по полю female не склоняется и в женском роде', () => {
  expect(nameCase('Сив', 'dat')).toBe('Сиву');
  expect(isFemaleName('Сив')).toBe(false);
  setFemaleNames(['Сив']);
  try {
    expect(nameCase('Сив', 'dat')).toBe('Сив');
    expect(nameCase('Сив', 'gen')).toBe('Сив');
    expect(isFemaleName('Сив')).toBe(true);
    expect(verb('Сив', 'пришёл', 'пришла')).toBe('пришла');
    expect(nameCase('Корвин', 'dat')).toBe('Корвину');
    expect(isFemaleName('Ада')).toBe(true);
  } finally {
    setFemaleNames([]);
  }
  expect(nameCase('Сив', 'dat')).toBe('Сиву');
});
