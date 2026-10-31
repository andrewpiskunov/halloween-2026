import { ItemText } from '../components/ItemText';
import { AbilityArt } from '../components/AbilityIdentity';
import { navigateTab } from '../narrative-navigation';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { AbilityKind, AbilityUse, CopyableKind, Ingredient, Item, PlayerView, TargetMode } from '@fair/shared';
import { itemImageUrl, resourceImageUrl } from '../assets';
import { Button } from '../components/Button';
import { Select, type SelectOption } from '../components/Select';
import {
  INGREDIENTS, goldText, ingredientAcc, ingredientName, isFemaleName, itemLabel, nameCase, plainName, roleEmoji,
} from '../labels';
import { abilityTargets, canOffer } from '../rules';
import { abilityDraft, ask, run, tab } from '../store';

/** Подтверждение перед отправкой: заголовок-вопрос и пояснение. */
interface Conf { title: string; text?: string; danger?: boolean }
/** Отправка вложенного вида: форма не знает, копия это или своя способность. */
type Send = (use: AbilityUse, c: Conf) => void;

const HOSTILE_TEXT = 'Это враждебное действие. Если у цели защита, попытка сгорит.';
/** Изделия мастерской: копия CRAFTED и REFORGEABLE из engine/abilities.ts. */
const CRAFTED: Item['kind'][] = ['potion', 'ward', 'focus', 'shape'];
const REFORGEABLE: Item['kind'][] = ['potion', 'ward', 'focus'];
/** Во что перековать: рецепт → вид вещи (копия REFORGE_INTO и KIND_BY_RECIPE). */
const REFORGE_INTO: { id: 'cleanse' | 'ward' | 'focus'; kind: Item['kind'] }[] = [
  { id: 'cleanse', kind: 'potion' }, { id: 'ward', kind: 'ward' }, { id: 'focus', kind: 'focus' },
];
/** Цель копируемых видов: копия ABILITY_SPECS[...].target из abilities.ts. */
const COPY_TARGET: Record<CopyableKind, TargetMode> = { grow: 'none', substituteIngredient: 'none', discountOther: 'any' };
/** Только иллюстрации оригиналов: локальное соответствие не тянет серверный shared в браузер. */
const COPY_ART_ROLES: Record<CopyableKind, string> = { grow: 'o2', substituteIngredient: 'o6', discountOther: 'o14' };

/** Виды мастерской, у которых кнопка прямо в карточке рецепта или запаса, а не отдельная форма. */
export const INLINE_WORKSHOP: AbilityKind[] = ['payAshWithGold', 'focusFree', 'substituteIngredient', 'buyCheap', 'buyFromBank'];

/** Подтвердить и отправить ability.use; onDone — закрыть форму после успеха. */
export function sendAbility(use: AbilityUse, c: Conf, onDone?: () => void): void {
  ask({
    ...c, okLabel: c.danger ? 'Рискнуть' : 'Применить',
    onOk: async () => { const r = await run({ type: 'ability.use', use }); if (r.ok) onDone?.(); },
  });
}

const name = (k: string, v: PlayerView) => plainName(k, v);

/**
 * Форма применения по виду способности роли (§7.1). Для Астры — выбор копии и форма копируемого вида.
 * Виды с кнопками в рецептах и запасе мастерской формы не имеют: их показывает Workshop.
 */
export function AbilityForm({ v, onDone }: { v: PlayerView; onDone?: () => void }) {
  const ab = v.me.ability;
  const send: Send = (use, c) => sendAbility(use, c, onDone);
  if (ab.kind === 'copyAbility') return <CopyForm v={v} onDone={onDone} />;
  return <KindForm v={v} kind={ab.kind} mode={ab.target} send={send} />;
}

/** Поля и кнопка одного вида; send получает уже собранный AbilityUse этого вида. */
function KindForm({ v, kind, mode, send }: { v: PlayerView; kind: AbilityKind; mode: TargetMode; send: Send }) {
  switch (kind) {
    case 'protectSelf':
      return <Apply onClick={() => send({ kind }, { title: 'Наложить на себя защиту до конца акта?' })} />;
    case 'protectOther': case 'cleanseOther': case 'discountOther':
    case 'inspectInventory': case 'knowGold': case 'askSide': case 'stealGold': case 'thorns':
      return <TargetForm v={v} mode={mode} onApply={t => send({ kind, target: t }, targetConf(kind, t, v))} />;
    case 'askYesNo': return <AskForm v={v} send={send} />;
    case 'stealIngredient': return <StealIngredientForm v={v} send={send} />;
    case 'transferProtection': return <TransferForm v={v} send={send} />;
    case 'sniffIngredient': return <SniffForm send={send} />;
    case 'grow': return <GrowForm v={v} send={send} />;
    case 'swapIngredient': return <SwapForm v={v} send={send} />;
    case 'buyBulk': return <BulkForm v={v} send={send} />;
    case 'disassemble': case 'reforge': case 'sellToBank': return <ItemForm v={v} kind={kind} send={send} />;
    default:
      return <p class="m-note"><ItemText>Кнопки способности — в карточках Мастерской.</ItemText></p>;
  }
}

/** Подтверждения для видов «выбрать игрока» (таблица §7.1). */
function targetConf(kind: AbilityKind, t: string, v: PlayerView): Conf {
  const n = name(t, v);
  const self = t === v.me.role.key;
  switch (kind) {
    case 'protectOther': return { title: `Дать защиту ${nameCase(n, 'dat')} до конца акта?` };
    case 'cleanseOther': return { title: `Попросить ${nameCase(n, 'acc')} согласиться на очищение?`, text: 'Снимет проклятие и шипы. Сначала договоритесь голосом.' };
    case 'discountOther': return self
      ? { title: 'Дать скидку себе?', text: 'Следующее изготовление на 1 золото дешевле.' }
      : { title: `Попросить ${nameCase(n, 'acc')} принять скидку?`, text: 'Его следующее изготовление на 1 золото дешевле. Нужно согласие.' };
    case 'inspectInventory': return { title: `Осмотреть сумку ${nameCase(n, 'gen')}?`, text: 'Цель узнает, что её осмотрели.' };
    case 'knowGold': return { title: `Узнать золото ${nameCase(n, 'gen')}?` };
    case 'askSide': return { title: `Узнать сторону ${nameCase(n, 'gen')}?` };
    case 'stealGold': return { title: `Взять 1 золото у ${nameCase(n, 'gen')}?`, text: HOSTILE_TEXT, danger: true };
    case 'thorns': return { title: `Наложить шипы на ${nameCase(n, 'acc')}?`, text: HOSTILE_TEXT, danger: true };
    default: return { title: 'Применить способность?' };
  }
}

function Apply({ onClick, disabled, label = 'Применить' }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return <div class="m-btns"><Button kind="red" disabled={disabled} onClick={onClick}>{label}</Button></div>;
}

const targetOptions = (v: PlayerView, mode: TargetMode): SelectOption[] =>
  abilityTargets(v, mode).map(t => ({ value: t.roleKey, label: t.label, avatar: t.roleKey, icon: roleEmoji(t.roleKey, v) }));

const ingredientOptions = (hint?: (i: Ingredient) => string): SelectOption[] =>
  INGREDIENTS.map(i => ({ value: i.key, label: i.name, icon: i.emoji, image: resourceImageUrl(i.key), ...(hint ? { hint: hint(i.key) } : {}) }));

function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return <div class="line"><small>{label}</small>{children}</div>;
}

function TargetPick({ v, mode, value, onChange, label = 'Кого' }: { v: PlayerView; mode: TargetMode; value: string; onChange: (k: string) => void; label?: string }) {
  return (
    <Field label={label}>
      <Select label={label} value={value} onChange={onChange} placeholder="выберите участника" options={targetOptions(v, mode)} />
    </Field>
  );
}

function TargetForm({ v, mode, onApply }: { v: PlayerView; mode: TargetMode; onApply: (t: string) => void }) {
  const [t, setT] = useState('');
  return (
    <>
      <TargetPick v={v} mode={mode} value={t} onChange={setT} />
      <Apply disabled={!t} onClick={() => onApply(t)} />
    </>
  );
}

/** Веста: вопрос задаётся голосом; текст необязателен и виден только ей и ведущему. */
function AskForm({ v, send }: { v: PlayerView; send: Send }) {
  const [t, setT] = useState('');
  const [q, setQ] = useState('');
  const apply = () => {
    const question = q.trim();
    send({ kind: 'askYesNo', target: t, ...(question ? { question } : {}) },
      { title: `Задать вопрос ${nameCase(name(t, v), 'dat')}?`, text: 'Вопрос и ответ голосом.' });
  };
  return (
    <>
      <TargetPick v={v} mode="other" value={t} onChange={setT} />
      <label class="field">
        <span>Ваш вопрос (необязательно, видите только вы и ведущий)</span>
        <textarea maxLength={200} rows={2} value={q} onInput={e => setQ((e.currentTarget as HTMLTextAreaElement).value)} />
      </label>
      <Apply disabled={!t} onClick={apply} />
    </>
  );
}

function StealIngredientForm({ v, send }: { v: PlayerView; send: Send }) {
  const [t, setT] = useState('');
  const [ing, setIng] = useState('');
  const apply = () => send({ kind: 'stealIngredient', target: t, ingredient: ing as Ingredient },
    { title: `Взять ${ingredientAcc(ing as Ingredient)} у ${nameCase(name(t, v), 'gen')}?`, text: HOSTILE_TEXT, danger: true });
  return (
    <>
      <TargetPick v={v} mode="other" value={t} onChange={setT} />
      <Field label="Что"><Select label="Ингредиент" value={ing} onChange={setIng} placeholder="выберите ингредиент" options={ingredientOptions()} /></Field>
      <Apply disabled={!t || !ing} onClick={apply} />
    </>
  );
}

/** Клёпа: «чью защиту» (своя или чужая) и «кому»; согласие спрашивается у владельца защиты. */
function TransferForm({ v, send }: { v: PlayerView; send: Send }) {
  const me = v.me.role.key;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const fromOptions: SelectOption[] = [
    { value: me, label: 'Свою', avatar: me, icon: v.me.role.emoji },
    ...targetOptions(v, 'other'),
  ];
  const toOptions: SelectOption[] = [
    ...(from && from !== me ? [{ value: me, label: 'Себе', avatar: me, icon: v.me.role.emoji }] : []),
    ...targetOptions(v, 'other').filter(o => o.value !== from),
  ];
  const apply = () => {
    const toName = nameCase(name(to, v), 'dat');
    const fromName = name(from, v);
    const c: Conf = from === me
      ? { title: `Отдать свою защиту ${toName}?` }
      : { title: `Попросить ${nameCase(fromName, 'acc')} отдать ${isFemaleName(fromName) ? 'её' : 'его'} защиту ${to === me ? 'вам' : toName}?`, text: 'Нужно согласие владельца защиты.' };
    send({ kind: 'transferProtection', from, to }, c);
  };
  return (
    <>
      <Field label="Чью защиту"><Select label="Чью защиту" value={from} onChange={k => { setFrom(k); if (k === to) setTo(''); }} placeholder="выберите" options={fromOptions} /></Field>
      <Field label="Кому"><Select label="Кому" value={to} onChange={setTo} placeholder="выберите участника" options={toOptions} /></Field>
      <Apply disabled={!from || !to || from === to} onClick={apply} />
    </>
  );
}

function SniffForm({ send }: { send: Send }) {
  const [ing, setIng] = useState('');
  return (
    <>
      <Field label="Что"><Select label="Ингредиент" value={ing} onChange={setIng} placeholder="выберите ингредиент" options={ingredientOptions()} /></Field>
      <Apply disabled={!ing} onClick={() => send({ kind: 'sniffIngredient', ingredient: ing as Ingredient },
        { title: `Узнать, у кого есть ${ingredientName(ing as Ingredient)}?` })} />
    </>
  );
}

const shortOf = (i: Ingredient) => INGREDIENTS.find(x => x.key === i)?.short ?? i;

/** Брам: отдать 1 Пепел или Лунную пыль в запас, взять 2 Росы. */
function GrowForm({ v, send }: { v: PlayerView; send: Send }) {
  const a = v.me.available.ingredients;
  const [give, setGive] = useState('');
  return (
    <>
      <Field label="Отдать"><Select label="Что отдать" value={give} onChange={setGive} placeholder="выберите ингредиент"
        options={ingredientOptions(i => `у вас ${a[i]}`).filter(o => o.value !== 'dew' && a[o.value as Ingredient] > 0)} /></Field>
      <p class="m-note"><ItemText>Отдайте 1 Пепел феникса или 1 Лунную пыль — получите 2 Росы.{a.ash < 1 && a.moon < 1 && ' Сейчас у вас нет подходящего ингредиента.'}</ItemText></p>
      <p class="m-note"><ItemText>В запасе Росы: {v.workshop.dew}. Нужно не меньше двух.</ItemText></p>
      <Apply disabled={!give || give === 'dew' || a[give as Ingredient] < 1 || v.workshop.dew < 2} onClick={() => send({ kind: 'grow', give: give as Ingredient },
        { title: `Отдать 1 ${shortOf(give as Ingredient)}, получить 2 Росы?` })} />
    </>
  );
}

/** Пим: отдать 1 ингредиент, взять другой из запаса. */
function SwapForm({ v, send }: { v: PlayerView; send: Send }) {
  const a = v.me.available.ingredients;
  const [give, setGive] = useState('');
  const [take, setTake] = useState('');
  return (
    <>
      <Field label="Отдать"><Select label="Что отдать" value={give} onChange={setGive} placeholder="выберите ингредиент"
        options={ingredientOptions(i => `у вас ${a[i]}`).filter(o => a[o.value as Ingredient] > 0)} /></Field>
      <Field label="Взять"><Select label="Что взять" value={take} onChange={setTake} placeholder="выберите ингредиент"
        options={ingredientOptions(i => `в запасе ${v.workshop[i]}`).filter(o => o.value !== give && v.workshop[o.value as Ingredient] > 0)} /></Field>
      <Apply disabled={!give || !take || give === take || a[give as Ingredient] < 1 || v.workshop[take as Ingredient] < 1} onClick={() => send({ kind: 'swapIngredient', give: give as Ingredient, take: take as Ingredient },
        { title: `Отдать 1 ${shortOf(give as Ingredient)}, получить 1 ${shortOf(take as Ingredient)}?` })} />
    </>
  );
}

/** Руф: два ингредиента из запаса за 3 золота (можно одинаковые). */
function BulkForm({ v, send }: { v: PlayerView; send: Send }) {
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const stock = (i: Ingredient) => `в запасе ${v.workshop[i]}`;
  const enough = x && y && (x === y ? v.workshop[x as Ingredient] >= 2 : v.workshop[x as Ingredient] >= 1 && v.workshop[y as Ingredient] >= 1);
  return (
    <>
      <Field label="Первый"><Select label="Первый ингредиент" value={x} onChange={setX} placeholder="выберите" options={ingredientOptions(stock)} /></Field>
      <Field label="Второй"><Select label="Второй ингредиент" value={y} onChange={setY} placeholder="выберите" options={ingredientOptions(stock)} /></Field>
      <Apply label="Оптом: 2 за 3" disabled={!enough || v.me.available.gold < 3}
        onClick={() => send({ kind: 'buyBulk', take: [x as Ingredient, y as Ingredient] },
          { title: `Купить ${shortOf(x as Ingredient)} и ${shortOf(y as Ingredient)} за ${goldText(3)}?` })} />
    </>
  );
}

/** Грим, Хельга, Магда Вейн: своя свободная вещь-изделие; для разбора — два ингредиента, для перековки — во что. */
function ItemForm({ v, kind, send }: { v: PlayerView; kind: 'disassemble' | 'reforge' | 'sellToBank'; send: Send }) {
  const kinds = kind === 'reforge' ? REFORGEABLE : CRAFTED;
  const items = v.me.items.filter(i => kinds.includes(i.kind) && canOffer(i, v));
  const [id, setId] = useState('');
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [into, setInto] = useState('');
  const item = items.find(i => i.id === id);
  if (items.length === 0) return <p class="m-note"><ItemText>В сумке нет подходящих изделий.</ItemText></p>;
  const label = item ? itemLabel(item, v).name : '';
  const stock = (i: Ingredient) => `в запасе ${v.workshop[i]}`;
  const recipeName = (rid: string) => v.recipes.find(r => r.id === rid)?.name ?? rid;
  const apply = () => {
    if (kind === 'disassemble') {
      send({ kind, itemId: id, take: [x as Ingredient, y as Ingredient] },
        { title: `Разобрать ${label} на ${ingredientAcc(x as Ingredient)} и ${ingredientAcc(y as Ingredient)}?`, text: 'Вещь исчезнет.' });
    } else if (kind === 'reforge') {
      send({ kind, itemId: id, into: into as 'cleanse' | 'ward' | 'focus' },
        { title: `Перековать ${label} в ${recipeName(into)}?`, text: `Вещь исчезнет, спишется ${goldText(1)}.` });
    } else {
      send({ kind, itemId: id }, { title: `Продать ${label} банку за ${goldText(2)}?`, text: 'Вещь исчезнет.' });
    }
  };
  const enoughStock = !!x && !!y && (x === y
    ? v.workshop[x as Ingredient] >= 2
    : v.workshop[x as Ingredient] >= 1 && v.workshop[y as Ingredient] >= 1);
  const validInto = REFORGE_INTO.some(r => r.id === into && r.kind !== item?.kind);
  const ready = !!item && (kind === 'disassemble' ? enoughStock
    : kind === 'reforge' ? validInto && v.me.available.gold >= 1 : true);
  return (
    <>
      <Field label="Вещь">
        <Select label="Вещь" value={id} onChange={k => { setId(k); setInto(''); }} placeholder="выберите изделие"
          options={items.map(i => { const l = itemLabel(i, v); return { value: i.id, label: l.name, icon: l.emoji, image: itemImageUrl(i) }; })} />
      </Field>
      {kind === 'disassemble' && (
        <>
          <Field label="Взять"><Select label="Первый ингредиент" value={x} onChange={setX} placeholder="выберите" options={ingredientOptions(stock)} /></Field>
          <Field label="и"><Select label="Второй ингредиент" value={y} onChange={setY} placeholder="выберите" options={ingredientOptions(stock)} /></Field>
        </>
      )}
      {kind === 'reforge' && (
        <Field label="Во что">
          <Select label="Во что" value={into} onChange={setInto} placeholder="выберите"
            options={REFORGE_INTO.filter(r => r.kind !== item?.kind).map(r => ({ value: r.id, label: recipeName(r.id), image: itemImageUrl({ kind: r.kind, ref: r.id }) }))} />
        </Field>
      )}
      {kind === 'disassemble' && x && y && !enoughStock && <p class="m-note"><ItemText>В запасе не хватает выбранных ингредиентов.</ItemText></p>}
      {kind === 'reforge' && v.me.available.gold < 1 && <p class="m-note"><ItemText>Для перековки нужно 1 доступное золото.</ItemText></p>}
      <Apply disabled={!ready} onClick={apply} />
    </>
  );
}

/** Астра: три эффекта на выбор; если владелец оригинала на ярмарке, нужно его согласие. */
function CopyForm({ v, onDone }: { v: PlayerView; onDone?: () => void }) {
  const copies = v.me.ability.copy ?? [];
  const [pick, setPick] = useState<CopyableKind | null>(null);
  const send: Send = (use, c) => sendCopy(v, use as CopyUse, c, onDone);
  return (
    <>
      <div class="choice">
        <span class="m-note"><ItemText>Какой эффект взять?</ItemText></span>
        {copies.map(c => (
          <Button key={c.kind} small kind={pick === c.kind ? 'main' : 'sec'} onClick={() => setPick(c.kind)}>
            <span class="ability-inline"><AbilityArt roleKey={COPY_ART_ROLES[c.kind]} small/><span>{c.name} · {c.owner ? name(c.owner, v) : 'владелец не на ярмарке, согласие не нужно'}</span></span>
          </Button>
        ))}
      </div>
      {pick === 'substituteIngredient' && (
        <>
          <p class="m-note"><ItemText>Замена делается в карточке рецепта.</ItemText></p>
          <Apply label="В мастерскую" onClick={() => { abilityDraft.value = { kind: 'substituteIngredient' }; navigateTab('workshop'); }} />
        </>
      )}
      {pick && pick !== 'substituteIngredient' && <KindForm v={v} kind={pick} mode={COPY_TARGET[pick]} send={send} />}
    </>
  );
}

type CopyUse = Extract<AbilityUse, { kind: CopyableKind }>;

/** Копия Астры (из формы или из Мастерской): при владельце на ярмарке сначала просьба к нему. */
export function sendCopy(v: PlayerView, use: CopyUse, c: Conf, onDone?: () => void): void {
  const chosen = v.me.ability.copy?.find(x => x.kind === use.kind);
  const owner = chosen?.owner ?? null;
  const conf: Conf = owner
    ? { title: `Попросить ${nameCase(name(owner, v), 'acc')} разрешить «${chosen?.name}»?`, text: `Затем: ${c.title}${c.text ? ` ${c.text}` : ''}` }
    : c;
  sendAbility({ kind: 'copyAbility', copy: use }, conf, onDone);
}
