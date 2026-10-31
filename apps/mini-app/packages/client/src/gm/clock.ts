import type { GameState } from '@fair/shared';

/** Акт по расписанию: 25 минут. «+5 минут» на пульте сдвигает отсчёт, поэтому длина здесь постоянная. */
export const ACT_MS = 25 * 60000;
/** За сколько до конца акта пульт начинает подсказывать, что пора объявлять следующий. */
export const WARN_MS = 3 * 60000;
/** Минута вечера, на которой по расписанию заканчивается акт (0–10 вход, затем три акта по 25). */
const ENDS_AT: Record<'act1' | 'act2' | 'act3', number> = { act1: 35, act2: 60, act3: 85 };

export interface ActPlan {
  act: 1 | 2 | 3;
  /** Прошло с начала акта без пауз и с учётом продлений. */
  elapsedMs: number;
  /** Сколько осталось до конца акта; отрицательное, если акт перебран. */
  remainingMs: number;
  over: boolean;
  /** Пора объявлять следующий акт или закрывать ярмарку. */
  due: boolean;
  endsAtMinute: number;
  /** Что сделать на границе акта, по порядку. */
  todo: string[];
}

/** Расписание текущего акта для пульта; null вне актов. */
export function actPlan(state: GameState, nowMs: number): ActPlan | null {
  const phase = state.phase;
  if (phase !== 'act1' && phase !== 'act2' && phase !== 'act3') return null;
  const elapsedMs = (state.clock.pausedAt ?? nowMs) - state.clock.actStartedAt - state.clock.pausedTotal;
  const remainingMs = ACT_MS - elapsedMs;
  const act = phase === 'act1' ? 1 : phase === 'act2' ? 2 : 3;
  const todo = state.hidden17 ? (act === 1 ? ['Объявить акт II: пополнение мастерской, лот с осколком 4 и уликой A.'] : act === 2 ? ['Объявить акт III: завершайте заказы и подготовку к могиле. Личные намерения остаются скрытыми.'] : ['Позвать участников к могиле Сарна. Завершить начатые партии в кости.', 'Открыть «Ритуал»: сборка, пыль, формула, ответ и последний выбор.']) : act === 1
    ? ['Объявить акт II: склад пополнится, выйдет лот с осколком 4.']
    : act === 2
      ? ['Напомнить свободным: сторона выбирается до конца акта II.', 'Объявить акт III: склад пополнится, откроется осколок 5.']
      : ['Сказать «Ярмарка закрывается» и нажать кнопку: сделки отменятся, инвентари и алтари замрут.', 'Подойти к алтарям с чек-листом и прочитать исход.'];
  return { act, elapsedMs, remainingMs, over: remainingMs < 0, due: remainingMs <= WARN_MS, endsAtMinute: ENDS_AT[phase], todo };
}
