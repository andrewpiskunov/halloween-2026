// Каталог способностей ролей: вид механики живёт в коде, JSON содержимого остаётся снимком прототипа.

export type AbilityKind =
  | 'payAshWithGold' | 'focusFree' | 'substituteIngredient'
  | 'buyCheap' | 'buyBulk' | 'buyFromBank'
  | 'grow' | 'swapIngredient'
  | 'disassemble' | 'reforge' | 'sellToBank'
  | 'protectSelf' | 'protectOther' | 'transferProtection'
  | 'cleanseOther' | 'discountOther' | 'copyAbility'
  | 'stealGold' | 'stealIngredient' | 'thorns'
  | 'inspectInventory' | 'sniffIngredient' | 'knowGold' | 'askSide' | 'askYesNo';

/** Виды, которые может скопировать Астра. */
export type CopyableKind = 'grow' | 'substituteIngredient' | 'discountOther';

/** Как способность выбирает цель: для формы на клиенте и для проверок. */
export type TargetMode = 'none' | 'self' | 'other' | 'any' | 'protectedAndOther';

export interface AbilitySpec {
  kind: AbilityKind;
  hostile: boolean;
  target: TargetMode;
  /** Нужен запрос согласия, если цель не автор. Для copyAbility решается по вложенному виду. */
  consent: boolean;
  /** Где на клиенте живёт кнопка: на экране «Роль» или внутри Мастерской. */
  place: 'role' | 'workshop';
  /** Словесная: приложение только отмечает применение. */
  verbal: boolean;
}

/** roleKey → вид. Тест: покрыты все 30 ролей содержимого, лишних ключей нет. */
export const ABILITY_BY_ROLE: Record<string, AbilityKind> = {
  o1: 'payAshWithGold', o2: 'grow', o4: 'protectSelf', o5: 'focusFree', o6: 'substituteIngredient',
  o8: 'stealGold', o9: 'protectOther', o10: 'cleanseOther', o11: 'inspectInventory', o13: 'disassemble',
  o14: 'discountOther', o16: 'transferProtection', o7: 'buyBulk', o12: 'thorns', o3: 'buyCheap',
  o17: 'copyAbility', o15: 'sniffIngredient', n18: 'swapIngredient', n19: 'buyFromBank', n20: 'reforge',
  r1: 'discountOther', r2: 'askSide', r3: 'buyCheap', t1: 'sellToBank', t2: 'knowGold',
  t3: 'protectOther', t4: 'stealIngredient', r4: 'stealGold', r5: 'askYesNo', r6: 'cleanseOther',
};

type Flags = Partial<Pick<AbilitySpec, 'hostile' | 'consent' | 'verbal'>>;
const spec = (kind: AbilityKind, place: AbilitySpec['place'], target: TargetMode, flags: Flags = {}): AbilitySpec =>
  ({ kind, hostile: false, consent: false, verbal: false, place, target, ...flags });

// Цель «себя», «своё изделие» и «без цели» — none: форма не спрашивает игрока.
export const ABILITY_SPECS: Record<AbilityKind, AbilitySpec> = {
  payAshWithGold: spec('payAshWithGold', 'workshop', 'none'),
  focusFree: spec('focusFree', 'workshop', 'none'),
  substituteIngredient: spec('substituteIngredient', 'workshop', 'none'),
  buyCheap: spec('buyCheap', 'workshop', 'none'),
  buyBulk: spec('buyBulk', 'workshop', 'none'),
  buyFromBank: spec('buyFromBank', 'workshop', 'none'),
  grow: spec('grow', 'workshop', 'none'),
  swapIngredient: spec('swapIngredient', 'workshop', 'none'),
  disassemble: spec('disassemble', 'workshop', 'none'),
  reforge: spec('reforge', 'workshop', 'none'),
  sellToBank: spec('sellToBank', 'workshop', 'none'),
  protectSelf: spec('protectSelf', 'role', 'none'),
  protectOther: spec('protectOther', 'role', 'other'),
  transferProtection: spec('transferProtection', 'role', 'protectedAndOther', { consent: true }),
  cleanseOther: spec('cleanseOther', 'role', 'other', { consent: true }),
  discountOther: spec('discountOther', 'role', 'any', { consent: true }),
  // Цель и место берутся у копируемого вида.
  copyAbility: spec('copyAbility', 'role', 'none', { consent: true }),
  stealGold: spec('stealGold', 'role', 'other', { hostile: true }),
  stealIngredient: spec('stealIngredient', 'role', 'other', { hostile: true }),
  thorns: spec('thorns', 'role', 'other', { hostile: true }),
  inspectInventory: spec('inspectInventory', 'role', 'other'),
  sniffIngredient: spec('sniffIngredient', 'role', 'none'),
  knowGold: spec('knowGold', 'role', 'other'),
  askSide: spec('askSide', 'role', 'other'),
  askYesNo: spec('askYesNo', 'role', 'other', { verbal: true }),
};

/** Владелец оригинала для копии Астры: grow → o2, substituteIngredient → o6, discountOther → o14. */
export const COPY_SOURCES: Record<CopyableKind, string> = { grow: 'o2', substituteIngredient: 'o6', discountOther: 'o14' };
