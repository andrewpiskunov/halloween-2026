// Закрытие ярмарки на пульте (спецификация этапа 5, §6.5): чек-лист алтарей, условия закрытия, сводка по игрокам.
import type { AltarResult, AltarSide, Closing, ContentData, GameState } from '@fair/shared';

/** Порог готовности алтаря: копия из engine/closing.ts. */
const READY = { shards: 3, focuses: 2, gold: 6, donors: 3 };
const ALTAR_ORDER: AltarSide[] = ['wake', 'bind', 'break', 'ship'];

/** Заголовки исходов: копия из closing-texts.ts (клиент берёт из shared только типы). */
export const OUTCOME_TITLES: Record<AltarSide | 'sleep', string> = {
  wake: 'Пробудить',
  bind: 'Подчинить',
  break: 'Разрушить',
  ship: 'Вывезти',
  sleep: 'Сердце спит',
};

/** Тексты исходов для чтения вслух: копия из closing-texts.ts. */
export const OUTCOME_TEXTS: Record<AltarSide | 'sleep', string> = {
  wake: 'Осколки сходятся, Фокусы вспыхивают, и в большой комнате становится жарко. Сердце бьётся один раз, второй, и у окна появляется тень крыла. Дракон жив. Ярмарка закрыта: он забрал, что ему принадлежало.',
  bind: 'Осколки сходятся в кольцо из Фокусов, и сердце стучит ровно, как часы. Оно будет стучать так ровно столько, сколько прикажет орден. Магия снова в чьих-то руках, и этих рук немного.',
  break: 'Молот, пепел и шесть монет на алтаре. Сердце трескается без звука. Ни дракона, ни силы, ни торга. Через сто лет здесь соберутся снова, но продавать будет нечего.',
  ship: 'Ящик заколочен, фонарь погашен, подвода скрылась за воротами. Покупатель с того берега заплатил вперёд. Что он сделает с сердцем, на этой ярмарке не узнает никто.',
  sleep: 'Ни один алтарь не собран. Осколки разошлись по карманам, и сердце дракона осталось тем, чем было: дорогим, опасным и ничьим. Ярмарка вернётся через сто лет.',
};

/** Название алтаря по стороне: «Алтарь пробуждения», «Ящик для перевозки». */
export const altarName = (side: AltarSide, content: Pick<ContentData, 'factions'>) =>
  content.factions.find(f => f.id === side)?.altar ?? side;

/** Где лежит вещь на алтаре, для подписи в форме исправления. */
export const ALTAR_PLACE: Record<AltarSide, string> = {
  wake: 'на алтаре пробуждения', bind: 'на алтаре подчинения', break: 'на алтаре разрушения', ship: 'в ящике для перевозки',
};

/** Четыре строки счёта алтаря: «осколков 2 из 3» и т. п. */
export const altarRows = (r: AltarResult): string[] => [
  `осколков ${r.shards} из ${READY.shards}`,
  `фокусов ${r.focuses} из ${READY.focuses}`,
  `золота ${r.gold} из ${READY.gold}`,
  `дарителей золота ${r.donors} из ${READY.donors}`,
];

/** Подсчёт алтаря как в altarResults из engine/closing.ts: разные осколки, Фокусы, золото, разные дарители. */
function countAltar(state: GameState, side: AltarSide): AltarResult {
  const contributions = state.altars[side]?.contributions ?? [];
  const items = contributions.flatMap(c => (c.item !== undefined && state.items[c.item] ? [state.items[c.item]] : []));
  const golds = contributions.filter(c => (c.gold ?? 0) > 0);
  const shards = new Set(items.filter(i => i.kind === 'shard').map(i => i.ref)).size;
  const focuses = items.filter(i => i.kind === 'focus').length;
  const gold = golds.reduce((n, c) => n + (c.gold ?? 0), 0);
  const donors = new Set(golds.map(c => c.player)).size;
  const ready = shards >= READY.shards && focuses >= READY.focuses && gold >= READY.gold && donors >= READY.donors;
  return { side, shards, focuses, gold, donors, ready };
}

/** Предпросмотр алтарей до закрытия: по алтарю название, готовность и четыре строки счёта. */
export function altarChecklist(state: GameState, content: Pick<ContentData, 'factions'>): { side: AltarSide; name: string; ready: boolean; rows: string[] }[] {
  return ALTAR_ORDER.filter(side => state.altars[side]).map(side => {
    const r = countAltar(state, side);
    return { side, name: altarName(side, content), ready: r.ready, rows: altarRows(r) };
  });
}

/** Почему нельзя закрыть ярмарку сейчас; null — можно. Повторяет проверки session.close. */
export function closeBlock(state: GameState): string | null {
  if (state.phase !== 'act3') return 'Закрыть можно только в акте III';
  if (Object.values(state.lots).some(l => l.status === 'openBidding' || l.status === 'sealedBidding')) return 'Сначала закройте торг';
  return null;
}

/** Сводка достижений по присутствующим в порядке состава: «Грим: цели 1/2, исход, Правда, отмечено ведущим». */
export function playerSummary(closing: Closing, state: GameState, content: Pick<ContentData, 'roles'>): string[] {
  return state.roster.flatMap(key => {
    const r = closing.players[key];
    if (!r) return [];
    const name = content.roles.find(x => x.key === key)?.name ?? key;
    const parts = [`цели ${r.goals.filter(Boolean).length}/2`];
    if (r.outcome) parts.push('исход');
    if (r.truth) parts.push('Правда');
    if (state.players[key]?.goalOverrides?.some(o => o !== null)) parts.push('отмечено ведущим');
    return [`${name}: ${parts.join(', ')}`];
  });
}
