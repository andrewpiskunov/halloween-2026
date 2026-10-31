import { expect, test } from 'vitest';
import { Fair, content, gm, makeGame, player, run } from './helpers';
import { reduce } from '../engine';
import { viewFor, type PlayerView } from '../views';
import type { Command } from '../commands';

const card = { kind: 'ability', owner: 'o1', title: 'Живая тень', text: 'Одна услуга тени. Результат подтверждает ведущий.', price: 'Отдать монету ведущему', visibility: 'private', readers: [], uses: 1, duration: 'game', replacesAbility: false, active: true, completed: false } as const;
const save = (over = {}) => ({ type: 'story.card.save', card: { ...card, ...over } }) as unknown as Command;
const story = (f: Fair) => f.s.story!;
const own = (f: Fair, key = 'o1') => (viewFor(f.s, content, player(key), 0) as PlayerView).story!;

test('заявка и ответ доступны только автору и ведущему; сообщение выбранным участникам', () => {
  const f = new Fair(makeGame(12));
  f.as('o1', { type: 'story.request', title: 'Оживить тень', text: 'Найду голос и принесу монету', stake: 'Камень облика' });
  const q = Object.values(story(f).requests)[0];
  f.run({ type: 'story.respond', id: q.id, revision: q.revision, status: 'conditions', reply: 'Нужны два свидетеля' }, gm);
  expect(own(f).requests[0].reply).toBe('Нужны два свидетеля');
  expect(own(f, 'o2').requests).toEqual([]);
  f.run({ type: 'story.message', title: 'Шёпот', text: 'Сарн слышит вас', recipients: ['o1', 'o2'] }, gm);
  expect(own(f, 'o2').messages).toHaveLength(1);
  expect(JSON.stringify(own(f, 'o4'))).not.toContain('Сарн слышит');
});

test('игрок не выдаёт карточки и не отвечает за ведущего; пустые/битые поля отклоняются', () => {
  const f = new Fair(makeGame(12));
  expect(run(f.s, save(), player('o1')).ok).toBe(false);
  for (const over of [{ title: ' ' }, { owner: 'missing' }, { uses: -1 }, { uses: 1.5 }, { readers: ['missing'] }, { kind: 'shard' }, { visibility: 'secret' }]) {
    expect(run(f.s, save(over), gm).ok).toBe(false);
  }
  expect(run(f.s, { type: 'story.request', title: '', text: '', stake: '' }, player('o1')).ok).toBe(false);
});

test('применение требует подтверждения; отказ сохраняет заряд; двойное подтверждение невозможно', () => {
  const f = new Fair(makeGame(12));
  f.run(save(), gm);
  const c = Object.values(story(f).cards)[0];
  f.as('o1', { type: 'story.request', title: 'Тень', text: 'Добыть ответ', stake: '', cardId: c.id });
  let q = Object.values(story(f).requests)[0];
  expect(story(f).cards[c.id].uses).toBe(1);
  expect(run(f.s, { type: 'story.request', title: 'Ещё раз', text: 'Повтор', stake: '', cardId: c.id }, player('o1')).ok).toBe(false);
  f.run({ type: 'story.respond', id: q.id, revision: q.revision, status: 'rejected', reply: 'Не выполнены условия' }, gm);
  expect(story(f).cards[c.id].uses).toBe(1);
  f.as('o1', { type: 'story.request', title: 'Тень', text: 'Условия выполнены', stake: '', cardId: c.id });
  q = Object.values(story(f).requests).at(-1)!;
  f.run({ type: 'story.respond', id: q.id, revision: q.revision, status: 'done', reply: 'Ответ получен' }, gm);
  expect(story(f).cards[c.id].uses).toBe(0);
  expect(run(f.s, { type: 'story.respond', id: q.id, revision: q.revision, status: 'done', reply: 'Повтор' }, gm).ok).toBe(false);
  expect(run(f.s, { type: 'story.request', title: 'Тень', text: 'Повтор', stake: '', cardId: c.id }, player('o1')).ok).toBe(false);
});

test('видимость, изменение владельца, срок акта, замена базовой способности', () => {
  const f = new Fair(makeGame(12));
  f.run(save({ duration: 'act', replacesAbility: true, readers: ['o2'] }), gm);
  const c = Object.values(story(f).cards)[0];
  expect(own(f, 'o2').cards).toHaveLength(1);
  expect(own(f, 'o4').cards).toEqual([]);
  expect(run(f.s, { type: 'ability.use', use: { kind: 'payAshWithGold', recipeId: 'cleanse' } }, player('o1')).ok).toBe(false);
  expect((viewFor(f.s, content, player('o1'), 0) as PlayerView).me.ability.state).toBe('closed');
  f.run({ type: 'act.next' }, gm);
  expect(run(f.s, { type: 'story.request', title: 'Тень', text: 'Поздно', stake: '', cardId: c.id }, player('o1')).ok).toBe(false);
  expect((viewFor(f.s, content, player('o1'), 0) as PlayerView).me.ability.state).toBe('available');
});

test('отмена карточки и применения с защитой от устаревшего редактирования, воспроизведение событий', () => {
  const f = new Fair(makeGame(12));
  const start = f.s;
  const events = f.run(save(), gm);
  const c = Object.values(story(f).cards)[0];
  const first = story(f).history[0];
  const update = { type: 'story.card.save', id: c.id, revision: c.revision, card: { ...card, title: 'Новая тень' } } as unknown as Command;
  events.push(...f.run(update, gm));
  expect(run(f.s, update, gm).ok).toBe(false);
  expect(run(f.s, { type: 'story.undo', id: first.id }, gm).ok).toBe(false);
  events.push(...f.run({ type: 'story.undo', id: story(f).history.at(-1)!.id }, gm));
  expect(story(f).cards[c.id].title).toBe('Живая тень');
  expect(events.reduce((s, e) => reduce(s, content, e), start)).toEqual(f.s);
  f.run({ type: 'session.reset' }, gm);
  expect(f.s.story?.cards ?? {}).toEqual({});
});

test('ведущий меняет сторону несвободной роли; проекция и наблюдение видят новый выбор', () => {
  const f = new Fair(makeGame(12));
  f.run({ type: 'story.side', player: 'o1', side: 'break', reason: 'Договор с разрушителями' }, gm);
  expect((viewFor(f.s, content, player('o1'), 0) as PlayerView).me.role.side).toBe('break');
  expect(run(f.s, { type: 'story.side', player: 'o1', side: 'ship', reason: 'Нет алтаря' }, gm).ok).toBe(false);
});

test('отмена применения возвращает заряд и запрос; повторное применение требует нового подтверждения', () => {
  const f = new Fair(makeGame(12));
  f.run(save(), gm);
  const c = Object.values(story(f).cards)[0];
  f.as('o1', { type: 'story.request', title: 'Тень', text: 'Спросить имя', stake: '', cardId: c.id });
  const q = Object.values(story(f).requests)[0];
  f.run({ type: 'story.respond', id: q.id, revision: q.revision, status: 'done', reply: 'Искра' }, gm);
  const h = story(f).history.at(-1)!;
  f.run({ type: 'story.undo', id: h.id }, gm);
  expect(story(f).cards[c.id].uses).toBe(1);
  expect(story(f).requests[q.id].status).toBe('pending');
  expect(run(f.s, { type: 'story.undo', id: h.id }, gm).ok).toBe(false);
  const restored = story(f).requests[q.id];
  f.run({ type: 'story.respond', id: q.id, revision: restored.revision, status: 'done', reply: 'Подтверждено повторно' }, gm);
  expect(story(f).cards[c.id].uses).toBe(0);
});

test('передача владельца снимает доступ у прежнего; личные данные не попадают к посторонним', () => {
  const f = new Fair(makeGame(12));
  f.run(save({ kind: 'item' }), gm);
  const c = Object.values(story(f).cards)[0];
  f.run({ type: 'story.card.save', id: c.id, revision: c.revision, card: { ...c, owner: 'o2' } }, gm);
  expect(own(f).cards).toHaveLength(0);
  expect(own(f, 'o2').cards[0].title).toBe('Живая тень');
  expect(run(f.s, { type: 'story.request', title: 'Тень', text: 'Использую', stake: '', cardId: c.id }, player('o1')).ok).toBe(false);
  expect(own(f, 'o4')).not.toHaveProperty('history');
});

test('публичные карточки и сообщения видны всем; отменённое сообщение исчезает', () => {
  const f = new Fair(makeGame(12));
  f.run(save({ visibility: 'public' }), gm);
  expect(own(f, 'o4').cards).toHaveLength(1);
  f.run({ type: 'story.message', title: 'Ночь', text: 'Брод открылся', recipients: [] }, gm);
  expect(own(f, 'o4').messages).toHaveLength(1);
  f.run({ type: 'story.undo', id: story(f).history.at(-1)!.id }, gm);
  expect(own(f, 'o4').messages).toHaveLength(0);
});

test('пять открытых заявок, отзыв только автором; после закрытия изменения запрещены', () => {
  const f = new Fair(makeGame(12));
  for (let i = 0; i < 5; i++) f.as('o1', { type: 'story.request', title: `Обряд ${i}`, text: 'Предложение', stake: '' });
  expect(run(f.s, { type: 'story.request', title: 'Шестая', text: 'Предложение', stake: '' }, player('o1')).ok).toBe(false);
  const q = Object.values(story(f).requests)[0];
  expect(run(f.s, { type: 'story.cancel', id: q.id, revision: q.revision }, player('o2')).ok).toBe(false);
  expect(run(f.s, { type: 'story.respond', id: q.id, revision: q.revision, status: 'done', reply: 'Сам разрешаю' }, player('o1')).ok).toBe(false);
  f.as('o1', { type: 'story.cancel', id: q.id, revision: q.revision });
  f.as('o1', { type: 'story.request', title: 'Новая', text: 'Предложение', stake: '' });
  f.run({ type: 'act.next' }, gm); f.run({ type: 'act.next' }, gm); f.run({ type: 'session.close' }, gm);
  expect(run(f.s, save(), gm).ok).toBe(false);
});

test('смена стороны учитывается в итогах и наблюдении, отмена возвращает первоначальную', async () => {
  const { sideOf, computeClosing } = await import('../engine/closing');
  const { buildIntel } = await import('../engine/intel');
  const f = new Fair(makeGame(12));
  f.run({ type: 'story.side', player: 'o1', side: 'break', reason: 'Договор' }, gm);
  expect(sideOf(f.s, content, 'o1')).toBe('break');
  expect(computeClosing(f.s, content, 1).players.o1.side).toBe('break');
  expect(buildIntel(f.s, content, { kind: 'askSide', target: 'o1' }, 'o2')).toMatchObject({ side: 'break' });
  f.run({ type: 'story.undo', id: story(f).history.at(-1)!.id }, gm);
  expect(sideOf(f.s, content, 'o1')).toBe('wake');
});


test('отмена отказа не открывает второй запрос той же карточки', () => {
  const f = new Fair(makeGame(12));
  f.run(save(), gm);
  const c = Object.values(story(f).cards)[0];
  f.as('o1', { type: 'story.request', title: 'Первый', text: 'Применить', stake: '', cardId: c.id });
  const q = Object.values(story(f).requests)[0];
  f.run({ type: 'story.respond', id: q.id, revision: q.revision, status: 'rejected', reply: 'Позже' }, gm);
  const h = story(f).history.at(-1)!;
  f.as('o1', { type: 'story.request', title: 'Второй', text: 'Применить', stake: '', cardId: c.id });
  expect(run(f.s, { type: 'story.undo', id: h.id }, gm).ok).toBe(false);
});

test('отмена не восстанавливает замену при ожидающей основной способности', () => {
  const f = new Fair(makeGame(30));
  f.run(save({ owner: 'o14', replacesAbility: true }), gm);
  const c = Object.values(story(f).cards)[0];
  f.run({ type: 'story.card.save', id: c.id, revision: c.revision, card: { ...c, active: false } }, gm);
  const h = story(f).history.at(-1)!;
  f.as('o14', { type: 'ability.use', use: { kind: 'discountOther', target: 'o1' } });
  expect(run(f.s, { type: 'story.undo', id: h.id }, gm).ok).toBe(false);
});

test('отмена ответа соблюдает лимит открытых заявок', () => {
  const f = new Fair(makeGame(12));
  f.as('o1', { type: 'story.request', title: 'Первый', text: 'Просьба', stake: '' });
  const q = Object.values(story(f).requests)[0];
  f.run({ type: 'story.respond', id: q.id, revision: q.revision, status: 'done', reply: 'Да' }, gm);
  const h = story(f).history.at(-1)!;
  for (let i = 0; i < 5; i++) f.as('o1', { type: 'story.request', title: `Ещё ${i}`, text: 'Просьба', stake: '' });
  expect(run(f.s, { type: 'story.undo', id: h.id }, gm).ok).toBe(false);
});
