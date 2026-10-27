import { describe, expect, test } from 'vitest';
import { allBut, checkInvariants, gm, makeGame, player, run, system } from './helpers';
import type { AbilityUse, Actor, Command } from '../commands';
import type { ConsentRequest, GameState, Ingredient, Player } from '../types';

const TTL = 300000;
const withPlayer = (s: GameState, key: string, patch: Partial<Player>): GameState => ({
  ...s, players: { ...s.players, [key]: { ...s.players[key], ...patch } },
});

/** Успешная команда: инварианты держатся после шага. */
function step(s: GameState, cmd: Command, actor: Actor, now = 0) {
  const r = run(s, cmd, actor, now);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.error} ${r.detail ?? ''}`);
  checkInvariants(r.state);
  return r;
}

/** Отказ: код ошибки; состояние не меняется, поэтому достаточно проверить инварианты исходного. */
function refusal(s: GameState, cmd: Command, actor: Actor, now = 0): string {
  const r = run(s, cmd, actor, now);
  checkInvariants(s);
  return r.ok ? 'ok' : r.error;
}

const use = (u: AbilityUse): Command => ({ type: 'ability.use', use: u });
const accept = (id: string): Command => ({ type: 'consent.accept', id });
const decline = (id: string): Command => ({ type: 'consent.decline', id });
const cancel = (id: string): Command => ({ type: 'consent.cancel', id });
const expire = (id: string): Command => ({ type: 'consent.expire', id });

/** Создаёт запрос согласия способностью и возвращает состояние и запрос. */
function request(s: GameState, key: string, u: AbilityUse, now = 0): { state: GameState; req: ConsentRequest } {
  const r = step(s, use(u), player(key), now);
  expect(r.events).toHaveLength(1);
  const e = r.events[0];
  if (e.type !== 'ConsentRequested') throw new Error(`ожидался ConsentRequested, пришло ${e.type}`);
  return { state: r.state, req: e.request };
}

/** Состояние после того, как автор освободился: запрос закрыт, применение не потрачено. */
function released(s: GameState, key: string, id: string, status: string) {
  expect(s.requests[id].status).toBe(status);
  expect(s.players[key].abilityPending).toBeUndefined();
  expect(s.players[key].abilityUsedInAct).toBe(false);
}

describe('согласие: очищение Ады', () => {
  test('запрос, повтор → limit, согласие цели исполняет; чужое согласие → forbidden', () => {
    const s = makeGame(30);
    expect(s.players.o9.curse).toBe(true);
    const u: AbilityUse = { kind: 'cleanseOther', target: 'o9' };
    const { state: s1, req } = request(s, 'o10', u, 1000);
    expect(req).toEqual({
      id: req.id, author: 'o10', action: { type: 'ability', use: u }, approvers: ['o9'], approved: [],
      status: 'pending', createdAt: 1000, expiresAt: 1000 + TTL,
    });
    expect(s1.requests[req.id]).toEqual(req);
    expect(s1.players.o10.abilityPending).toBe(req.id);
    expect(s1.players.o10.abilityUsedInAct).toBe(false);
    expect(s1.players.o9.curse).toBe(true);

    expect(refusal(s1, use(u), player('o10'))).toBe('limit');
    expect(refusal(s1, accept(req.id), player('o11'))).toBe('forbidden');
    expect(refusal(s1, accept(req.id), gm)).toBe('forbidden');
    expect(refusal(s1, accept('нет'), player('o9'))).toBe('not_found');

    const r = step(s1, accept(req.id), player('o9'), 2000);
    expect(r.events).toEqual([
      { type: 'ConsentGiven', at: 2000, id: req.id, by: 'o9' },
      {
        type: 'AbilityUsed', at: 2000, author: 'o10', ability: 'cleanseOther', target: 'o9', outcome: 'done', hostile: false,
        effects: [{ type: 'curse', player: 'o9', value: false }], removed: { curse: true, thorns: false }, requestId: req.id,
      },
    ]);
    expect(r.state.players.o9.curse).toBe(false);
    expect(r.state.players.o10.abilityUsedInAct).toBe(true);
    expect(r.state.players.o10.abilityPending).toBeUndefined();
    expect(r.state.requests[req.id]).toMatchObject({ status: 'accepted', approved: ['o9'] });
    expect(r.state.actions.at(-1)).toMatchObject({ author: 'o10', target: 'o9', requestId: req.id, removed: { curse: true, thorns: false } });
    expect(refusal(r.state, accept(req.id), player('o9'))).toBe('invalid');
  });

  test('очищение без отметок разрешено, эффект пустой; шипы снимаются вместе с проклятием', () => {
    const s = withPlayer(makeGame(30), 'o2', { thorns: true, thornsBy: 'o12' });
    const { state: s1, req } = request(s, 'r6', { kind: 'cleanseOther', target: 'o2' });
    const r = step(s1, accept(req.id), player('o2'));
    expect(r.events[1]).toMatchObject({ effects: [{ type: 'thorns', player: 'o2', value: false }], removed: { curse: false, thorns: true } });
    expect(r.state.players.o2.thorns).toBe(false);

    const { state: s2, req: q2 } = request(makeGame(30), 'o10', { kind: 'cleanseOther', target: 'o2' });
    const r2 = step(s2, accept(q2.id), player('o2'));
    expect(r2.events[1]).toMatchObject({ effects: [], removed: { curse: false, thorns: false } });
  });

  test('цель — сам автор → invalid; цель вне ярмарки → not_found', () => {
    const s = makeGame(30);
    expect(refusal(s, use({ kind: 'cleanseOther', target: 'o10' }), player('o10'))).toBe('invalid');
    expect(refusal(s, use({ kind: 'cleanseOther', target: 'zz' }), player('o10'))).toBe('not_found');
  });
});

describe('согласие: отказ, отмена, истечение, пауза, смена акта', () => {
  const u: AbilityUse = { kind: 'cleanseOther', target: 'o9' };

  test('decline → declined, применение свободно; отказать может только одобряющий', () => {
    const { state: s1, req } = request(makeGame(30), 'o10', u);
    expect(refusal(s1, decline(req.id), player('o10'))).toBe('forbidden');
    const r = step(s1, decline(req.id), player('o9'), 500);
    expect(r.events).toEqual([{ type: 'ConsentClosed', at: 500, id: req.id, status: 'declined' }]);
    released(r.state, 'o10', req.id, 'declined');
    expect(r.state.players.o9.curse).toBe(true);
    // Способность можно применить снова.
    request(r.state, 'o10', u);
  });

  test('cancel автором и ведущим (reason gm); одобряющий отменить не может', () => {
    const { state: s1, req } = request(makeGame(30), 'o10', u);
    expect(refusal(s1, cancel(req.id), player('o9'))).toBe('forbidden');
    const byAuthor = step(s1, cancel(req.id), player('o10'));
    expect(byAuthor.events).toEqual([{ type: 'ConsentClosed', at: 0, id: req.id, status: 'cancelled' }]);
    released(byAuthor.state, 'o10', req.id, 'cancelled');

    const byGm = step(s1, cancel(req.id), gm);
    expect(byGm.events).toEqual([{ type: 'ConsentClosed', at: 0, id: req.id, status: 'cancelled', reason: 'gm' }]);
    expect(byGm.state.requests[req.id].reason).toBe('gm');
    released(byGm.state, 'o10', req.id, 'cancelled');
  });

  test('expire: только system и только после срока', () => {
    const { state: s1, req } = request(makeGame(30), 'o10', u, 1000);
    expect(refusal(s1, expire(req.id), system, req.expiresAt - 1)).toBe('invalid');
    expect(refusal(s1, expire(req.id), player('o10'), req.expiresAt)).toBe('forbidden');
    expect(refusal(s1, expire(req.id), gm, req.expiresAt)).toBe('forbidden');
    const r = step(s1, expire(req.id), system, req.expiresAt);
    expect(r.events).toEqual([{ type: 'ConsentClosed', at: req.expiresAt, id: req.id, status: 'expired', reason: 'timeout' }]);
    released(r.state, 'o10', req.id, 'expired');
    // Согласие после срока, пока system ещё не закрыл, не принимается.
    expect(refusal(s1, accept(req.id), player('o9'), req.expiresAt)).toBe('phase');
  });

  test('на паузе consent.* → phase; после resume срок сдвинут на паузу', () => {
    const { state: s1, req } = request(makeGame(30), 'o10', u, 1000);
    const paused = step(s1, { type: 'clock.pause' }, gm, 2000).state;
    expect(refusal(paused, accept(req.id), player('o9'), 3000)).toBe('phase');
    expect(refusal(paused, decline(req.id), player('o9'), 3000)).toBe('phase');
    expect(refusal(paused, cancel(req.id), player('o10'), 3000)).toBe('phase');
    expect(refusal(paused, expire(req.id), system, req.expiresAt + 1)).toBe('phase');
    // Ведущий отменяет просьбу и на паузе.
    const byGm = step(paused, cancel(req.id), gm, 3000);
    expect(byGm.events).toEqual([{ type: 'ConsentClosed', at: 3000, id: req.id, status: 'cancelled', reason: 'gm' }]);
    released(byGm.state, 'o10', req.id, 'cancelled');
    const resumed = step(paused, { type: 'clock.resume' }, gm, 62000).state;
    expect(resumed.requests[req.id].expiresAt).toBe(req.expiresAt + 60000);
    expect(refusal(resumed, expire(req.id), system, req.expiresAt + 1)).toBe('invalid');
  });

  test('вне акта consent.* → phase', () => {
    const { state: s1, req } = request(makeGame(30), 'o10', u);
    const closed = { ...s1, phase: 'closed' } as GameState;
    expect(refusal(closed, accept(req.id), player('o9'))).toBe('phase');
  });

  test('act.next закрывает pending как expired, reason act', () => {
    const { state: s1, req } = request(makeGame(30), 'o10', u);
    const r = step(s1, { type: 'act.next' }, gm);
    expect(r.state.requests[req.id]).toMatchObject({ status: 'expired', reason: 'act' });
    expect(r.state.players.o10.abilityPending).toBeUndefined();
    expect(refusal(r.state, accept(req.id), player('o9'))).toBe('invalid');
  });
});

describe('согласие: повторная проверка → failed', () => {
  test('скидка Лиры: у цели появилась скидка до ответа → failed, применение не потрачено', () => {
    const { state: s1, req } = request(makeGame(30), 'o14', { kind: 'discountOther', target: 'o6' });
    expect(req.approvers).toEqual(['o6']);
    // Прямая правка состояния: gm.correct скидку не ставит.
    const s2 = withPlayer(s1, 'o6', { discount: true, discountBy: 'r1' });
    const r = step(s2, accept(req.id), player('o6'), 700);
    expect(r.events).toEqual([
      { type: 'ConsentGiven', at: 700, id: req.id, by: 'o6' },
      { type: 'ConsentClosed', at: 700, id: req.id, status: 'failed', reason: 'у цели уже есть скидка' },
    ]);
    released(r.state, 'o14', req.id, 'failed');
    expect(r.state.players.o6.discountBy).toBe('r1');
  });

  test('перенос защиты Клёпы: получатель защищён до ответа → failed', () => {
    const s = withPlayer(makeGame(30), 'o9', { protection: { by: 'o9', source: 'ward' } });
    const { state: s1, req } = request(s, 'o16', { kind: 'transferProtection', from: 'o9', to: 'o1' });
    // Согласие спрашивается только у защищённого (§4.1, толкование 14).
    expect(req.approvers).toEqual(['o9']);
    const s2 = step(s1, use({ kind: 'protectOther', target: 'o1' }), player('t3')).state;
    const r = step(s2, accept(req.id), player('o9'));
    expect(r.events[1]).toMatchObject({ type: 'ConsentClosed', status: 'failed' });
    released(r.state, 'o16', req.id, 'failed');
    expect(r.state.players.o9.protection).toEqual({ by: 'o9', source: 'ward' });
    expect(r.state.players.o1.protection).toEqual({ by: 't3', source: 'ability' });
  });

  test('получатель ушёл с ярмарки до ответа → failed с русской причиной без ключа роли', () => {
    const s = withPlayer(makeGame(30), 'o9', { protection: { by: 'o9', source: 'ward' } });
    const { state: s1, req } = request(s, 'o16', { kind: 'transferProtection', from: 'o9', to: 'o1' });
    // Прямая правка состояния: в акте присутствие командой не меняется.
    const s2 = withPlayer(s1, 'o1', { present: false });
    const r = step(s2, accept(req.id), player('o9'));
    const closed = r.events[1];
    if (closed.type !== 'ConsentClosed') throw new Error(`ожидался ConsentClosed, пришло ${closed.type}`);
    expect(closed.status).toBe('failed');
    expect(closed.reason).not.toContain('o1');
    expect(closed.reason).toMatch(/^[а-яё ,.-]+$/i);
    released(r.state, 'o16', req.id, 'failed');
  });
});

describe('перенос защиты', () => {
  test('своя защита Клёпы переносится без запроса, by сохраняется', () => {
    const s1 = step(makeGame(30), use({ kind: 'protectOther', target: 'o16' }), player('o9')).state;
    const r = step(s1, use({ kind: 'transferProtection', from: 'o16', to: 'o1' }), player('o16'));
    expect(r.events).toEqual([{
      type: 'AbilityUsed', at: 0, author: 'o16', ability: 'transferProtection', from: 'o16', to: 'o1',
      outcome: 'done', hostile: false, effects: [{ type: 'protectionMoved', from: 'o16', to: 'o1' }],
    }]);
    expect(r.state.players.o1.protection).toEqual({ by: 'o9', source: 'ability' });
    expect(r.state.players.o16.protection).toBeUndefined();
    expect(r.state.players.o16.abilityUsedInAct).toBe(true);
    expect(r.state.actions.at(-1)).toMatchObject({ author: 'o16', from: 'o16', to: 'o1' });
  });

  test('чужая защита: запрос к защищённому, согласие переносит', () => {
    const s = withPlayer(makeGame(30), 'o9', { protection: { by: 'o9', source: 'ward' } });
    const { state: s1, req } = request(s, 'o16', { kind: 'transferProtection', from: 'o9', to: 'o16' });
    expect(refusal(s1, accept(req.id), player('o16'))).toBe('forbidden');
    const r = step(s1, accept(req.id), player('o9'));
    expect(r.events[1]).toMatchObject({ type: 'AbilityUsed', from: 'o9', to: 'o16', requestId: req.id });
    expect(r.state.players.o16.protection).toEqual({ by: 'o9', source: 'ward' });
    expect(r.state.players.o9.protection).toBeUndefined();
  });

  test('отказы: нет защиты, to === from, у получателя защита, получатель вне ярмарки', () => {
    const s = withPlayer(withPlayer(makeGame(30), 'o9', { protection: { by: 'o9', source: 'ward' } }), 'o2', { protection: { by: 'o4', source: 'gm' } });
    const k = player('o16');
    expect(refusal(s, use({ kind: 'transferProtection', from: 'o1', to: 'o4' }), k)).toBe('invalid');
    expect(refusal(s, use({ kind: 'transferProtection', from: 'o9', to: 'o9' }), k)).toBe('invalid');
    expect(refusal(s, use({ kind: 'transferProtection', from: 'o9', to: 'o2' }), k)).toBe('limit');
    expect(refusal(s, use({ kind: 'transferProtection', from: 'o9', to: 'zz' }), k)).toBe('not_found');
    expect(refusal(s, use({ kind: 'transferProtection', from: 'o9', to: 5 as unknown as string }), k)).toBe('invalid');
  });
});

describe('скидка Лиры', () => {
  test('на себя без запроса; на цель со скидкой → invalid; на другого через согласие', () => {
    const s = makeGame(30);
    const self = step(s, use({ kind: 'discountOther', target: 'o14' }), player('o14'));
    expect(self.events).toEqual([{
      type: 'AbilityUsed', at: 0, author: 'o14', ability: 'discountOther', target: 'o14', outcome: 'done', hostile: false,
      effects: [{ type: 'discount', player: 'o14', value: true, by: 'o14' }],
    }]);
    expect(self.state.players.o14).toMatchObject({ discount: true, discountBy: 'o14', abilityUsedInAct: true });

    expect(refusal(withPlayer(s, 'o6', { discount: true }), use({ kind: 'discountOther', target: 'o6' }), player('o14'))).toBe('invalid');

    const { state: s1, req } = request(s, 'r1', { kind: 'discountOther', target: 'o6' });
    const r = step(s1, accept(req.id), player('o6'));
    expect(r.state.players.o6).toMatchObject({ discount: true, discountBy: 'r1' });
  });
});

describe('копия Астры', () => {
  /** Ингредиент, который у игрока есть. */
  const own = (s: GameState, key: string): Ingredient =>
    (['ash', 'moon', 'dew'] as const).find(k => s.players[key].ingredients[k] > 0)!;

  test('копия «Роста»: запрос Браму; после согласия исполнено, применение Брама не тронуто', () => {
    const s = makeGame(30);
    const give = own(s, 'o17');
    const { state: s1, req } = request(s, 'o17', { kind: 'copyAbility', copy: { kind: 'grow', give } });
    expect(req.approvers).toEqual(['o2']);
    const r = step(s1, accept(req.id), player('o2'));
    expect(r.events[1]).toMatchObject({ type: 'AbilityUsed', author: 'o17', ability: 'copyAbility', copied: 'grow', requestId: req.id });
    expect(r.state.players.o17.abilityUsedInAct).toBe(true);
    expect(r.state.players.o2.abilityUsedInAct).toBe(false);
    expect(r.state.players.o17.ingredients.dew).toBe(s.players.o17.ingredients.dew + 2 - (give === 'dew' ? 1 : 0));
    expect(r.state.actions.at(-1)).toMatchObject({ source: { type: 'ability', ability: 'copyAbility', copied: 'grow' } });
  });

  test('Брама нет на ярмарке → копия исполняется сразу', () => {
    const s = makeGame(30, { present: allBut(30, ['o2']) });
    const r = step(s, use({ kind: 'copyAbility', copy: { kind: 'grow', give: own(s, 'o17') } }), player('o17'));
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ type: 'AbilityUsed', ability: 'copyAbility', copied: 'grow', outcome: 'done' });
    expect(r.state.players.o2.abilityUsedInAct).toBe(false);
    expect(r.state.requests).toEqual({});
  });

  test('копия скидки на Грету: два одобряющих, исполняет второе согласие; отказ одного закрывает', () => {
    const s = makeGame(30);
    const { state: s1, req } = request(s, 'o17', { kind: 'copyAbility', copy: { kind: 'discountOther', target: 'o6' } });
    expect(req.approvers).toEqual(['o14', 'o6']);
    const one = step(s1, accept(req.id), player('o14'));
    expect(one.events).toEqual([{ type: 'ConsentGiven', at: 0, id: req.id, by: 'o14' }]);
    expect(one.state.requests[req.id]).toMatchObject({ status: 'pending', approved: ['o14'] });
    expect(one.state.players.o6.discount).toBe(false);
    expect(refusal(one.state, accept(req.id), player('o14'))).toBe('invalid');

    const two = step(one.state, accept(req.id), player('o6'));
    expect(two.events[1]).toMatchObject({ type: 'AbilityUsed', author: 'o17', ability: 'copyAbility', copied: 'discountOther', target: 'o6', requestId: req.id });
    expect(two.state.players.o6).toMatchObject({ discount: true, discountBy: 'o17' });
    expect(two.state.players.o14.abilityUsedInAct).toBe(false);

    const no = step(one.state, decline(req.id), player('o6'));
    released(no.state, 'o17', req.id, 'declined');
  });

  test('копия скидки на себя: только владелец оригинала', () => {
    const { req } = request(makeGame(30), 'o17', { kind: 'copyAbility', copy: { kind: 'discountOther', target: 'o17' } });
    expect(req.approvers).toEqual(['o14']);
  });

  test('копия copyAbility или некопируемого вида → forbidden', () => {
    const s = makeGame(30);
    const bad = (copy: unknown) => refusal(s, use({ kind: 'copyAbility', copy } as AbilityUse), player('o17'));
    expect(bad({ kind: 'copyAbility', copy: { kind: 'grow', give: 'ash' } })).toBe('forbidden');
    expect(bad({ kind: 'stealGold', target: 'o2' })).toBe('forbidden');
    expect(bad({ kind: 'toString' })).toBe('forbidden');
    expect(bad(null)).toBe('forbidden');
    expect(bad({ kind: 'grow', give: 'gold' })).toBe('invalid');
  });
});
