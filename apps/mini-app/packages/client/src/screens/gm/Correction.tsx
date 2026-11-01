import { useEffect, useRef, useState } from 'preact/hooks';
import type { AltarSide, Correction as CorrectionChange, GmView, Ingredient } from '@fair/shared';
import { Button } from '../../components/Button';
import { ItemText } from '../../components/ItemText';
import { Select } from '../../components/Select';
import { Stepper } from '../../components/Stepper';
import type { FixPreset, MarkField } from './Abilities';
import { ALTAR_PLACE } from '../../gm/closing';
import { itemImageUrl, resourceImageUrl } from '../../assets';
import { INGREDIENTS } from '../../labels';
import { correctableItems } from '../../rules';
import { ask, loadedContent, run } from '../../store';

type Field = 'gold' | 'ingredient' | 'itemOwner' | 'side' | 'goal' | MarkField;
/** Ручная отметка цели: выполнено, не выполнено или снять отметку (считать по журналу). */
type GoalMark = 'done' | 'failed' | 'clear';
const GOAL_MARK: Record<GoalMark, string> = { done: 'выполнено', failed: 'не выполнено', clear: 'снять отметку' };

/** Подписи отметок для формы исправления и подтверждения. */
const MARK_LABEL: Record<MarkField, string> = {
  protection: 'Защита', thorns: 'Шипы', curse: 'Проклятие', discount: 'Скидка',
  abilityUsed: 'Применение в акте', hostileAttempt: 'Попытка по игроку', guise: 'Облик',
};
const MARK_ICON: Record<MarkField, string> = {
  protection: '🛡', thorns: '🌵', curse: '☠', discount: '🏷', abilityUsed: '✋', hostileAttempt: '⚔', guise: '🎭',
};
const isMark = (f: Field): f is MarkField => f in MARK_LABEL;

export function Correction({ v, preset, initialPlayer }: { v: GmView; preset?: FixPreset | null; initialPlayer?: string }) {
  const { state } = v;
  const content = loadedContent();
  const name = (k: string) => content.roles.find(r => r.key === k)?.name ?? k;
  const [player, setPlayer] = useState(initialPlayer ?? state.roster[0] ?? '');
  const [field, setField] = useState<Field>('gold');
  const [delta, setDelta] = useState(0);
  const [ingredient, setIngredient] = useState<Ingredient>('ash');
  const items = correctableItems(state);
  const [itemId, setItemId] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [reason, setReason] = useState('');
  const [on, setOn] = useState(true);
  const [guise, setGuise] = useState('');
  const [side, setSide] = useState('');
  const [goalIndex, setGoalIndex] = useState<0 | 1>(0);
  const [goalMark, setGoalMark] = useState<GoalMark>('done');
  const card = useRef<HTMLDivElement>(null);

  // «Снять» из таблицы отметок: игрок и поле уже выбраны, остаётся причина.
  useEffect(() => {
    if (!preset) return;
    setPlayer(preset.player); setField(preset.field); setOn(preset.on);
    card.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [preset]);

  const ownerLabel = (o: (typeof items)[number]['owner']) =>
    o.type === 'player' ? name(o.key) : o.type === 'altar' ? ALTAR_PLACE[o.side] : 'лот';
  const itemIcon = (kind: string) => kind === 'shard' ? '💠' : kind === 'clue' ? '🔍' : kind === 'relic' ? '🏺' : '⚗️';
  const roleOption = (k: string) => ({ value: k, label: name(k), icon: content.roles.find(r => r.key === k)?.emoji, avatar: k });
  const itemName = (it: (typeof items)[number]) => it.kind === 'shard' ? `Осколок ${it.ref}` : it.kind === 'clue' ? `Улика ${it.ref}` : it.ref;
  const itemLabel = (it: (typeof items)[number]) => it.owner.type === 'altar' ? `${itemName(it)} (${ALTAR_PLACE[it.owner.side]})` : itemName(it);

  const curItem = items.some(i => i.id === itemId) ? itemId : items[0]?.id ?? '';
  const curOwner = newOwner || initialPlayer || state.roster[0] || '';
  const p = player || state.roster[0] || '';
  const role = content.roles.find(r => r.key === p);
  // сторону ведущий правит только у свободных ролей; варианты — алтари этой игры
  const free = !state.hidden17 && role?.side === 'free';
  const sides = (Object.keys(state.altars) as AltarSide[]).filter(s => state.altars[s]);
  const sideName = (s: string) => content.factions.find(f => f.id === s)?.name ?? s;
  const chosen = state.players[p]?.side;
  // 'none' — снять выбор; по умолчанию первый алтарь игры
  const curSide = side === 'none' || sides.includes(side as AltarSide) ? side : sides[0] ?? 'none';
  const fromAltar = items.find(i => i.id === curItem)?.owner.type === 'altar';
  const ready = reason.trim() !== '' && p !== '' && (
    field === 'itemOwner' ? curItem !== '' && curOwner !== ''
      : field === 'side' ? free && (curSide !== 'none' || chosen !== undefined)
      : field === 'goal' ? true
      : field === 'guise' ? !on || guise.trim() !== ''
        : isMark(field) ? true : delta !== 0);

  const submit = () => {
    const change: CorrectionChange = field === 'gold' ? { field: 'gold', delta }
      : field === 'ingredient' ? { field: 'ingredient', ingredient, delta }
        : field === 'itemOwner' ? { field: 'itemOwner', itemId: curItem, owner: { type: 'player', key: curOwner } }
          : field === 'side' ? { field: 'side', side: curSide === 'none' ? null : curSide as AltarSide }
          : field === 'goal' ? { field: 'goal', index: goalIndex, value: goalMark === 'clear' ? null : goalMark === 'done' }
          : field === 'guise' ? { field: 'guise', name: on ? guise.trim() : null }
            : { field, value: on };
    const what = field === 'gold' ? `золото ${delta > 0 ? '+' : ''}${delta}`
      : field === 'ingredient' ? `${INGREDIENTS.find(i => i.key === ingredient)?.short} ${delta > 0 ? '+' : ''}${delta}`
        : field === 'itemOwner' ? `${fromAltar ? 'вещь с алтаря' : 'вещь'} отдать: ${name(curOwner)}`
          : field === 'side' ? (curSide === 'none' ? 'сторона: снять выбор' : `сторона: ${sideName(curSide)}`)
          : field === 'goal' ? `цель ${goalIndex + 1}: ${GOAL_MARK[goalMark]}`
          : field === 'guise' && on ? `облик «${guise.trim()}»`
            : `${(v.state.hidden17?.fair&&field==='abilityUsed'?'Применение дара':MARK_LABEL[field])}: ${on ? 'поставить' : 'снять'}`;
    ask({
      title: 'Исправить?', text: `${name(p)}: ${what}. Причина: ${reason.trim()}`, okLabel: 'Исправить', danger: true,
      onOk: () => { void run({ type: 'gm.correct', playerKey: p, change, reason: reason.trim() }).then(r => { if (r.ok) { setReason(''); setDelta(0); setGuise(''); } }); },
    });
  };


  return (
    <div class="m-card" ref={card}>
      <h5>Исправление</h5>
      <div class="field"><span>Игрок</span>
        <Select label="Игрок" value={p} onChange={setPlayer} options={state.roster.map(roleOption)} />
      </div>
      <div class="field"><span>Что исправить</span>
        <Select label="Что исправить" value={field} onChange={s => setField(s as Field)} options={[
          { value: 'gold', label: 'Золото', icon: '🪙', image: resourceImageUrl('gold') },
          { value: 'ingredient', label: 'Ингредиент', icon: '🔥', image: resourceImageUrl('ash') },
          { value: 'itemOwner', label: 'Владелец вещи', icon: '🎒' },
          ...(free ? [{ value: 'side', label: 'Сторона', icon: '⚑' }] : []),
          ...(!state.hidden17?.narrative ? [{ value: 'goal', label: 'Личная цель', icon: '✓' }] : []),
          ...(Object.keys(MARK_LABEL) as MarkField[]).map(f => ({ value: f, label: v.state.hidden17?.fair&&f==='abilityUsed'?'Применение дара':MARK_LABEL[f], icon: MARK_ICON[f] })),
        ]} />
      </div>
      {field === 'ingredient' && (
        <div class="field"><span>Ингредиент</span>
          <Select label="Ингредиент" value={ingredient} onChange={s => setIngredient(s as Ingredient)} options={INGREDIENTS.map(i => ({ value: i.key, label: i.name, icon: i.emoji, image: resourceImageUrl(i.key) }))} />
        </div>
      )}
      {field === 'side' ? (
        free ? (
          <>
            <div class="field"><span>Сторона</span>
              <Select label="Сторона" value={curSide} onChange={setSide} options={[
                ...sides.map(s => ({ value: s, label: sideName(s), icon: '⚑' })),
                { value: 'none', label: 'Снять выбор', icon: '✗' },
              ]} />
            </div>
            <p class="m-note"><ItemText>Сейчас: {chosen && chosen !== 'free' ? sideName(chosen) : 'не выбрана'}. После закрытия итоги пересчитаются.</ItemText></p>
          </>
        ) : <p class="m-note"><ItemText>Сторону выбирают только свободные роли.</ItemText></p>
      ) : field === 'goal' ? (
        <>
          <div class="field"><span>Цель</span>
            <Select label="Цель" value={String(goalIndex)} onChange={s => setGoalIndex(s === '1' ? 1 : 0)} options={[0, 1].map(i => ({
              value: String(i), label: `Цель ${i + 1}`, hint: state.hidden17 ? content.hidden17?.roles[p]?.goals[i] : role?.goals[i],
            }))} />
          </div>
          <div class="m-btns" role="group" aria-label="Отметка цели">
            {(Object.keys(GOAL_MARK) as GoalMark[]).map(m => (
              <Button key={m} kind={goalMark === m ? 'main' : 'sec'} small onClick={() => setGoalMark(m)}>{GOAL_MARK[m]}</Button>
            ))}
          </div>
          <p class="m-note"><ItemText>Отметка ведущего важнее расчёта; «снять отметку» вернёт расчёт по журналу. На «Итогах» такая цель помечена «отмечено ведущим».</ItemText></p>
        </>
      ) : isMark(field) ? (
        <>
          <div class="m-btns two" role="group" aria-label="Поставить или снять">
            <Button kind={on ? 'main' : 'sec'} small onClick={() => setOn(true)}>Поставить</Button>
            <Button kind={on ? 'sec' : 'main'} small onClick={() => setOn(false)}>Снять</Button>
          </div>
          {field === 'guise' && on && (
            <label class="field"><span>Облик</span>
              <input type="text" value={guise} maxLength={40} placeholder="Например: Странник в сером" onInput={e => setGuise((e.currentTarget as HTMLInputElement).value)} />
            </label>
          )}
          <p class="m-note"><ItemText>Отметки правятся только у игрока на ярмарке. {field === 'abilityUsed' ? (v.state.hidden17?.fair ? 'Снять — вернуть применение дара; если просьба ждёт ответа, сначала отмените её.' : 'Снять — вернуть применение в этом акте; если просьба ждёт ответа, сначала отмените её.') : field === 'protection' ? 'Защита одна: поставить можно только тому, у кого её нет.' : ''}</ItemText></p>
        </>
      ) : field !== 'itemOwner' ? (
        <div class="m-row"><span>Изменить на</span><Stepper value={delta} onChange={setDelta} min={-10} max={10} label="Изменение" /></div>
      ) : (
        <>
          <div class="field"><span>Вещь</span>
            <Select label="Вещь" value={curItem} onChange={setItemId} placeholder="Нет вещей у игроков и на алтарях" options={items.map(it => ({ value: it.id, label: itemLabel(it), hint: ownerLabel(it.owner), icon: itemIcon(it.kind), image: itemImageUrl(it) }))} />
          </div>
          <div class="field"><span>Новый владелец</span>
            <Select label="Новый владелец" value={curOwner} onChange={setNewOwner} options={state.roster.map(roleOption)} />
          </div>
        </>
      )}
      <label class="field"><span>Причина</span>
        <input type="text" value={reason} placeholder="Например: ошибка при выдаче" onInput={e => setReason((e.currentTarget as HTMLInputElement).value)} />
      </label>
      <Button kind="red" disabled={!ready} onClick={submit}>Исправить</Button>
    </div>
  );
}
