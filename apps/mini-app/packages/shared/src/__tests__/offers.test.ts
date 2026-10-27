import { describe, expect, test } from 'vitest';
import { allBut, gm, makeGame, player, run, system } from './helpers';
import type { Actor, Command } from '../commands';
import type { Event } from '../events';
import type { Bundle, Counts, GameState } from '../types';
import { available } from '../engine/bundles';

const zero = (): Counts => ({ ash: 0, moon: 0, dew: 0 });
const bundle = (b: Partial<Bundle> = {}): Bundle => ({ gold: 0, ingredients: zero(), items: [], ...b });
const itemOf = (s: GameState, key: string, ref: string) =>
  Object.values(s.items).find(i => i.owner.type === 'player' && i.owner.key === key && i.ref === ref)!;

function must(s: GameState, cmd: Command, actor: Actor, now = 0) {
  const r = run(s, cmd, actor, now);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.error} ${r.detail ?? ''}`);
  return r;
}
/** Создаёт предложение и возвращает новое состояние и id. */
function create(s: GameState, from: string, to: string, give: Bundle, get: Bundle, now = 0, service?: boolean) {
  const r = must(s, { type: 'offer.create', to, give, get, service }, player(from), now);
  const e = r.events[0] as Extract<Event, { type: 'OfferCreated' }>;
  return { state: r.state, id: e.offer.id };
}
const errorOf = (s: GameState, cmd: Command, actor: Actor, now = 0) => {
  const r = run(s, cmd, actor, now);
  return r.ok ? 'ok' : r.error;
};

describe('сделки с резервом', () => {
  test('create: available.gold уменьшилось, gold не изменилось, expiresAt = now + 300000, у вещи reservedFor = id', () => {
    const s0 = makeGame(12);
    const shard = itemOf(s0, 'o1', 'I');
    const { state: s1, id } = create(s0, 'o1', 'o6', bundle({ gold: 2, items: [shard.id] }), bundle({ gold: 1 }), 1000);
    expect(s1.players.o1.gold).toBe(6);
    expect(s1.players.o1.reservedGold).toBe(2);
    expect(available(s1, 'o1').gold).toBe(4);
    expect(available(s1, 'o1').items).not.toContain(shard.id);
    expect(s1.items[shard.id].reservedFor).toBe(id);
    expect(s1.items[shard.id].owner).toEqual({ type: 'player', key: 'o1' });
    expect(s1.offers[id]).toMatchObject({
      from: 'o1', to: 'o6', status: 'pending', service: false, createdAt: 1000, expiresAt: 301000,
    });
  });

  test('create отклонён: нет вещи (not_owner), вещь уже в другом pending (reserved), вещь на алтаре (invalid), скрытый V в act1 (invalid), адресат не пришёл (not_found), адресат = автор (invalid), фаза setup (phase), пустые обе стороны (invalid)', () => {
    const s0 = makeGame(12);
    const shard = itemOf(s0, 'o1', 'I');
    const offer = (give: Bundle, to = 'o6', get = bundle({ gold: 1 })): Command => ({ type: 'offer.create', to, give, get });

    // Нет вещи: осколок I принадлежит Серафине, а предлагает его o6.
    expect(errorOf(s0, offer(bundle({ items: [shard.id] }), 'o1'), player('o6'))).toBe('not_owner');

    // Вещь уже в другом pending-предложении.
    const { state: s1 } = create(s0, 'o1', 'o6', bundle({ items: [shard.id] }), bundle({ gold: 1 }));
    expect(errorOf(s1, offer(bundle({ items: [shard.id] }), 'o14'), player('o1'))).toBe('reserved');
    // Золото сверх доступного тоже reserved.
    expect(errorOf(s0, offer(bundle({ gold: 7 })), player('o1'))).toBe('reserved');

    // Вещь на алтаре.
    const onAltar = must(s0, { type: 'altar.contribute', side: 'wake', itemId: shard.id }, player('o1')).state;
    expect(errorOf(onAltar, offer(bundle({ items: [shard.id] })), player('o1'))).toBe('invalid');

    // Скрытый осколок V у Лиры в act1.
    const v = itemOf(s0, 'o14', 'V');
    expect(v.hiddenUntilAct).toBe(3);
    expect(errorOf(s0, offer(bundle({ items: [v.id] })), player('o14'))).toBe('invalid');

    // Адресат не пришёл.
    const absent = makeGame(12, { present: allBut(12, ['o6']) });
    expect(errorOf(absent, offer(bundle({ gold: 1 })), player('o1'))).toBe('not_found');
    // Адресат вне состава.
    expect(errorOf(s0, offer(bundle({ gold: 1 }), 'o30'), player('o1'))).toBe('not_found');

    // Адресат = автор.
    expect(errorOf(s0, offer(bundle({ gold: 1 }), 'o1'), player('o1'))).toBe('invalid');

    // Фаза setup.
    const setupState: GameState = { ...s0, phase: 'setup' };
    expect(errorOf(setupState, offer(bundle({ gold: 1 })), player('o1'))).toBe('phase');

    // Пустые обе стороны.
    expect(errorOf(s0, offer(bundle(), 'o6', bundle()), player('o1'))).toBe('invalid');
    // Отрицательные числа.
    expect(errorOf(s0, offer(bundle({ gold: -1 })), player('o1'))).toBe('invalid');
    // Ведущий не создаёт предложения.
    expect(errorOf(s0, offer(bundle({ gold: 1 })), gm)).toBe('forbidden');
  });

  test('accept переносит обе стороны атомарно, снимает резерв, OfferAccepted с обеими сторонами и exchanged=true', () => {
    const s0 = makeGame(12);
    const shard = itemOf(s0, 'o1', 'I');
    const give = bundle({ gold: 2, items: [shard.id] });
    const get = bundle({ gold: 3, ingredients: { ash: 0, moon: 0, dew: 2 } });
    const { state: s1, id } = create(s0, 'o1', 'o6', give, get);
    const r = must(s1, { type: 'offer.accept', id }, player('o6'), 5000);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ type: 'OfferAccepted', id, from: 'o1', to: 'o6', give, get, service: false, exchanged: true });
    const s2 = r.state;
    expect(s2.offers[id].status).toBe('accepted');
    expect(s2.players.o1).toMatchObject({ gold: 6 - 2 + 3, reservedGold: 0 });
    expect(s2.players.o1.ingredients.dew).toBe(s0.players.o1.ingredients.dew + 2);
    expect(s2.players.o6.gold).toBe(6 + 2 - 3);
    expect(s2.players.o6.ingredients.dew).toBe(s0.players.o6.ingredients.dew - 2);
    expect(s2.items[shard.id].owner).toEqual({ type: 'player', key: 'o6' });
    expect(s2.items[shard.id].reservedFor).toBeUndefined();
    expect(available(s2, 'o1').gold).toBe(7);
    // Повторно принять закрытое нельзя.
    expect(errorOf(s2, { type: 'offer.accept', id }, player('o6'))).toBe('invalid');
  });

  test('accept, когда у адресата уже нет золота (после shop.buy): статус expired, reason "counterparty", у автора всё на месте', () => {
    // shop.buy появится в следующей задаче; золото адресата убирается через gm.correct.
    const s0 = makeGame(12);
    const shard = itemOf(s0, 'o1', 'I');
    const { state: s1, id } = create(s0, 'o1', 'o6', bundle({ gold: 1, items: [shard.id] }), bundle({ gold: 5 }));
    const s2 = must(s1, { type: 'gm.correct', playerKey: 'o6', reason: 'потратил', change: { field: 'gold', delta: -3 } }, gm).state;
    const r = must(s2, { type: 'offer.accept', id }, player('o6'));
    expect(r.events).toEqual([expect.objectContaining({ type: 'OfferClosed', id, status: 'expired', reason: 'counterparty' })]);
    const s3 = r.state;
    expect(s3.offers[id]).toMatchObject({ status: 'expired', reason: 'counterparty' });
    expect(s3.players.o1).toMatchObject({ gold: 6, reservedGold: 0 });
    expect(s3.items[shard.id].owner).toEqual({ type: 'player', key: 'o1' });
    expect(s3.items[shard.id].reservedFor).toBeUndefined();
    expect(s3.players.o6.gold).toBe(3);
  });

  test('accept, когда вещь автора ушла через gm.correct: статус expired, reason "author", резерв снят', () => {
    const s0 = makeGame(12);
    const shard = itemOf(s0, 'o1', 'I');
    const { state: s1, id } = create(s0, 'o1', 'o6', bundle({ gold: 2, items: [shard.id] }), bundle({ gold: 1 }));
    const s2 = must(s1, {
      type: 'gm.correct', playerKey: 'o1', reason: 'ошибка раздачи',
      change: { field: 'itemOwner', itemId: shard.id, owner: { type: 'player', key: 'o14' } },
    }, gm).state;
    const r = must(s2, { type: 'offer.accept', id }, player('o6'));
    expect(r.events).toEqual([expect.objectContaining({ type: 'OfferClosed', id, status: 'expired', reason: 'author' })]);
    const s3 = r.state;
    expect(s3.offers[id]).toMatchObject({ status: 'expired', reason: 'author' });
    expect(s3.players.o1.reservedGold).toBe(0);
    expect(s3.items[shard.id].reservedFor).toBeUndefined();
    expect(s3.items[shard.id].owner).toEqual({ type: 'player', key: 'o14' });
    expect(s3.players.o6.gold).toBe(6);
  });

  test('decline и cancel снимают резерв; accept чужого предложения → forbidden', () => {
    const s0 = makeGame(12);
    const shard = itemOf(s0, 'o1', 'I');
    const give = bundle({ gold: 3, items: [shard.id] });
    const { state: s1, id } = create(s0, 'o1', 'o6', give, bundle({ gold: 1 }));

    expect(errorOf(s1, { type: 'offer.accept', id }, player('o14'))).toBe('forbidden');
    expect(errorOf(s1, { type: 'offer.accept', id }, player('o1'))).toBe('forbidden');
    expect(errorOf(s1, { type: 'offer.decline', id }, player('o1'))).toBe('forbidden');
    expect(errorOf(s1, { type: 'offer.cancel', id }, player('o6'))).toBe('forbidden');
    expect(errorOf(s1, { type: 'offer.accept', id: 'нет' }, player('o6'))).toBe('not_found');

    const declined = must(s1, { type: 'offer.decline', id }, player('o6')).state;
    expect(declined.offers[id].status).toBe('declined');
    expect(declined.players.o1.reservedGold).toBe(0);
    expect(declined.items[shard.id].reservedFor).toBeUndefined();
    expect(available(declined, 'o1').gold).toBe(6);

    const cancelled = must(s1, { type: 'offer.cancel', id }, player('o1')).state;
    expect(cancelled.offers[id].status).toBe('cancelled');
    expect(cancelled.players.o1.reservedGold).toBe(0);
    expect(cancelled.items[shard.id].reservedFor).toBeUndefined();
    expect(errorOf(cancelled, { type: 'offer.decline', id }, player('o6'))).toBe('invalid');
  });

  test('expire только от system; после срока pending → expired; до срока → invalid', () => {
    const s0 = makeGame(12);
    const { state: s1, id } = create(s0, 'o1', 'o6', bundle({ gold: 2 }), bundle({ gold: 1 }), 1000);
    const cmd: Command = { type: 'offer.expire', id };
    expect(errorOf(s1, cmd, gm, 400000)).toBe('forbidden');
    expect(errorOf(s1, cmd, player('o1'), 400000)).toBe('forbidden');
    expect(errorOf(s1, cmd, system, 300999)).toBe('invalid');
    const r = must(s1, cmd, system, 301000);
    expect(r.events).toEqual([expect.objectContaining({ type: 'OfferClosed', id, status: 'expired', reason: 'timeout' })]);
    expect(r.state.offers[id]).toMatchObject({ status: 'expired', reason: 'timeout' });
    expect(r.state.players.o1.reservedGold).toBe(0);
    expect(errorOf(r.state, cmd, system, 400000)).toBe('invalid');
  });

  test('service сохраняется в OfferAccepted', () => {
    const s0 = makeGame(12);
    const { state: s1, id } = create(s0, 'o1', 'o6', bundle({ gold: 1 }), bundle({ rumor: 'спою песню' }), 0, true);
    expect(s1.offers[id].service).toBe(true);
    const r = must(s1, { type: 'offer.accept', id }, player('o6'));
    expect(r.events[0]).toMatchObject({ type: 'OfferAccepted', service: true, exchanged: true });
  });

  test('предложение из одних слухов: exchanged=false', () => {
    const s0 = makeGame(12);
    const { state: s1, id } = create(s0, 'o1', 'o6', bundle({ rumor: 'видела Лиру у колодца' }), bundle({ rumor: 'ответный слух' }));
    const r = must(s1, { type: 'offer.accept', id }, player('o6'));
    expect(r.events[0]).toMatchObject({ type: 'OfferAccepted', exchanged: false });
    expect(r.state.players.o1.gold).toBe(6);
    expect(r.state.players.o6.gold).toBe(6);
  });

  test('ингредиенты тоже резервируются: два предложения на один последний Пепел, второе → reserved', () => {
    const s0 = makeGame(12);
    const ash = s0.players.o1.ingredients.ash;
    expect(ash).toBeGreaterThan(0);
    const all = bundle({ ingredients: { ash, moon: 0, dew: 0 } });
    const { state: s1, id } = create(s0, 'o1', 'o6', all, bundle({ gold: 1 }));
    expect(available(s1, 'o1').ingredients.ash).toBe(0);
    expect(s1.players.o1.ingredients.ash).toBe(ash);
    const second: Command = { type: 'offer.create', to: 'o14', give: bundle({ ingredients: { ash: 1, moon: 0, dew: 0 } }), get: bundle({ gold: 1 }) };
    expect(errorOf(s1, second, player('o1'))).toBe('reserved');
    // После отмены первого Пепел снова доступен.
    const s2 = must(s1, { type: 'offer.cancel', id }, player('o1')).state;
    expect(available(s2, 'o1').ingredients.ash).toBe(ash);
    expect(errorOf(s2, second, player('o1'))).toBe('ok');
  });

  test('скрытый V можно предложить в act3', () => {
    const s3 = must(must(makeGame(12), { type: 'act.next' }, gm).state, { type: 'act.next' }, gm).state;
    const v = itemOf(s3, 'o14', 'V');
    expect(errorOf(s3, { type: 'offer.create', to: 'o1', give: bundle({ items: [v.id] }), get: bundle({ gold: 1 }) }, player('o14'))).toBe('ok');
  });
  test('create от роли вне ярмарки → forbidden, от не пришедшего игрока → phase, состояние не меняется', () => {
    const s0 = makeGame(12, { present: allBut(12, ['o14']) });
    const rumor: Command = { type: 'offer.create', to: 'o6', give: bundle({ rumor: 'слух' }), get: bundle({ gold: 1 }) };
    const before = JSON.stringify(s0);
    expect(errorOf(s0, rumor, player('r6'))).toBe('forbidden');
    expect(errorOf(s0, rumor, player('o14'))).toBe('phase');
    expect(JSON.stringify(s0)).toBe(before);
    expect(s0.players.r6).toBeUndefined();
  });

  test('accept после закрытия ярмарки → phase; decline и cancel тоже', () => {
    const s0 = makeGame(12);
    const { state: s1, id } = create(s0, 'o1', 'o6', bundle({ gold: 1 }), bundle({ gold: 1 }));
    const closed: GameState = { ...s1, phase: 'closed' };
    expect(errorOf(closed, { type: 'offer.accept', id }, player('o6'))).toBe('phase');
    expect(errorOf(closed, { type: 'offer.decline', id }, player('o6'))).toBe('phase');
    expect(errorOf(closed, { type: 'offer.cancel', id }, player('o1'))).toBe('phase');
  });

  test('accept, когда ингредиенты адресата сняты через gm.correct: expired, reason "counterparty", ничего не передано', () => {
    const s0 = makeGame(12);
    const dew = s0.players.o6.ingredients.dew;
    expect(dew).toBeGreaterThan(0);
    const { state: s1, id } = create(s0, 'o1', 'o6', bundle({ gold: 2 }), bundle({ ingredients: { ash: 0, moon: 0, dew } }));
    const s2 = must(s1, {
      type: 'gm.correct', playerKey: 'o6', reason: 'потерял',
      change: { field: 'ingredient', ingredient: 'dew', delta: -1 },
    }, gm).state;
    const r = must(s2, { type: 'offer.accept', id }, player('o6'));
    expect(r.events).toEqual([expect.objectContaining({ type: 'OfferClosed', id, status: 'expired', reason: 'counterparty' })]);
    expect(r.state.players.o1).toMatchObject({ gold: 6, reservedGold: 0, ingredients: s0.players.o1.ingredients });
    expect(r.state.players.o6).toMatchObject({ gold: 6, ingredients: { ...s0.players.o6.ingredients, dew: dew - 1 } });
  });

  test('expire во время паузы → phase; после resume срок сдвинут на длину паузы', () => {
    const s0 = makeGame(12);
    const { state: s1, id } = create(s0, 'o1', 'o6', bundle({ gold: 2 }), bundle({ gold: 1 }), 1000);
    const paused = must(s1, { type: 'clock.pause' }, gm, 2000).state;
    expect(errorOf(paused, { type: 'offer.expire', id }, system, 400000)).toBe('phase');
    const resumed = must(paused, { type: 'clock.resume' }, gm, 400000).state;
    expect(resumed.offers[id].expiresAt).toBe(301000 + 398000);
    expect(errorOf(resumed, { type: 'offer.expire', id }, system, 400000)).toBe('invalid');
  });

  test('accept после срока, пока tick ещё не закрыл предложение → phase', () => {
    const s0 = makeGame(12);
    const { state: s1, id } = create(s0, 'o1', 'o6', bundle({ gold: 2 }), bundle({ gold: 1 }), 1000);
    expect(errorOf(s1, { type: 'offer.accept', id }, player('o6'), 301000)).toBe('phase');
    expect(errorOf(s1, { type: 'offer.accept', id }, player('o6'), 300999)).toBe('ok');
    // Во время паузы срок не идёт: 298 000 мс паузы не съедают время на ответ (принять можно после resume).
    const paused = must(s1, { type: 'clock.pause' }, gm, 2000).state;
    const resumed = must(paused, { type: 'clock.resume' }, gm, 300000).state;
    expect(errorOf(resumed, { type: 'offer.accept', id }, player('o6'), 301000)).toBe('ok');
  });

  test('wants: просьба по названию; при принятии сервер находит вещь адресата и переносит её', () => {
    const s0 = makeGame(12);
    const shard = itemOf(s0, 'o1', 'I');
    // Грета просит у Серафины Осколок I за 3 золота, не зная id вещи.
    const give = bundle({ gold: 3 });
    const get = bundle({ wants: [{ kind: 'shard', ref: 'I' }] });
    const { state: s1, id } = create(s0, 'o6', 'o1', give, get);
    const r = must(s1, { type: 'offer.accept', id }, player('o1'), 5000);
    const e = r.events[0] as Extract<Event, { type: 'OfferAccepted' }>;
    expect(e.type).toBe('OfferAccepted');
    expect(e.get.items).toEqual([shard.id]);
    expect(e.exchanged).toBe(true);
    expect(r.state.items[shard.id].owner).toEqual({ type: 'player', key: 'o6' });
    expect(r.state.players.o1.gold).toBe(6 + 3);
  });

  test('wants: у адресата нет такой вещи → expired, reason counterparty; вещь в резерве другой сделки не берётся', () => {
    const s0 = makeGame(12);
    const get = bundle({ wants: [{ kind: 'relic', ref: 'Корона пепла' }] });
    const { state: s1, id } = create(s0, 'o6', 'o1', bundle({ gold: 1 }), get);
    const r = must(s1, { type: 'offer.accept', id }, player('o1'), 5000);
    expect(r.events[0]).toMatchObject({ type: 'OfferClosed', id, status: 'expired', reason: 'counterparty' });
    expect(r.state.players.o6).toMatchObject({ gold: 6, reservedGold: 0 });

    // Осколок I Серафина уже обещала в другой сделке: просьба по названию его не получит.
    const shard = itemOf(s0, 'o1', 'I');
    const { state: s2 } = create(s0, 'o1', 'o9', bundle({ items: [shard.id] }), bundle({ gold: 1 }));
    const { state: s3, id: id2 } = create(s2, 'o6', 'o1', bundle({ gold: 1 }), bundle({ wants: [{ kind: 'shard', ref: 'I' }] }));
    const r2 = must(s3, { type: 'offer.accept', id: id2 }, player('o1'), 5000);
    expect(r2.events[0]).toMatchObject({ type: 'OfferClosed', status: 'expired', reason: 'counterparty' });
  });

  test('wants: пустое предложение из одних wants считается непустым; дубли и чужие виды отклоняются (invalid)', () => {
    const s0 = makeGame(12);
    expect(errorOf(s0, { type: 'offer.create', to: 'o1', give: bundle(), get: bundle({ wants: [{ kind: 'shard', ref: 'II' }] }) }, player('o6'))).toBe('ok');
    expect(errorOf(s0, { type: 'offer.create', to: 'o1', give: bundle(), get: bundle({ wants: [{ kind: 'shard', ref: 'II' }, { kind: 'shard', ref: 'II' }] }) }, player('o6'))).toBe('invalid');
    expect(errorOf(s0, { type: 'offer.create', to: 'o1', give: bundle(), get: bundle({ wants: [{ kind: 'dragon' as never, ref: 'x' }] }) }, player('o6'))).toBe('invalid');
    // wants в give смысла не имеют: автор отдаёт только конкретные вещи.
    expect(errorOf(s0, { type: 'offer.create', to: 'o1', give: bundle({ wants: [{ kind: 'shard', ref: 'I' }] }), get: bundle({ gold: 1 }) }, player('o6'))).toBe('invalid');
  });
});

describe('сделки на паузе (этап 7, §7)', () => {
  const detailOf = (s: GameState, cmd: Command, actor: Actor, now = 0) => {
    const r = run(s, cmd, actor, now);
    return r.ok ? 'ok' : `${r.error} ${r.detail ?? ''}`;
  };

  test('на паузе create и accept → phase «часы на паузе»; decline и cancel проходят; после resume всё проходит', () => {
    const s0 = makeGame(12);
    const { state: s1, id: a } = create(s0, 'o1', 'o6', bundle({ gold: 1 }), bundle({ gold: 1 }), 1000);
    const { state: s2, id: b } = create(s1, 'o1', 'o6', bundle({ gold: 1 }), bundle(), 1000, true);
    const paused = must(s2, { type: 'clock.pause' }, gm, 2000).state;
    const newOffer: Command = { type: 'offer.create', to: 'o6', give: bundle({ gold: 1 }), get: bundle() };

    expect(detailOf(paused, newOffer, player('o1'), 3000)).toBe('phase часы на паузе');
    expect(detailOf(paused, { type: 'offer.accept', id: a }, player('o6'), 3000)).toBe('phase часы на паузе');
    expect(detailOf(paused, { type: 'offer.decline', id: a }, player('o6'), 3000)).toBe('ok');
    expect(detailOf(paused, { type: 'offer.cancel', id: b }, player('o1'), 3000)).toBe('ok');

    const resumed = must(paused, { type: 'clock.resume' }, gm, 4000).state;
    expect(detailOf(resumed, newOffer, player('o1'), 5000)).toBe('ok');
    expect(detailOf(resumed, { type: 'offer.accept', id: a }, player('o6'), 5000)).toBe('ok');
  });
});
