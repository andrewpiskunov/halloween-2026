import { useEffect, useRef, useState } from 'preact/hooks';
import type { AltarSide, Correction as CorrectionChange, GmView, Ingredient } from '@fair/shared';
import { Button } from '../../components/Button';
import { Select } from '../../components/Select';
import { Stepper } from '../../components/Stepper';
import { Abilities, type FixPreset, type MarkField } from './Abilities';
import { actPlan } from '../../gm/clock';
import { ALTAR_PLACE } from '../../gm/closing';
import { actNextPreview } from '../../gm/lots';
import { itemImageUrl, resourceImageUrl } from '../../assets';
import { INGREDIENTS, goldText, mmss, plural, roman } from '../../labels';
import { correctableItems, remainingMs } from '../../rules';
import { ask, gmTab, now, run, showToast } from '../../store';

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

/** Пульт: часы, акты, объявления и исправление ошибок. */
export function Console({ v }: { v: GmView }) {
  const { state } = v;
  const running = state.phase === 'act1' || state.phase === 'act2' || state.phase === 'act3';
  const paused = state.clock.pausedAt !== undefined;
  const nextAct = actNextPreview(v);
  const act = state.phase === 'act1' ? 1 : state.phase === 'act2' ? 2 : 3;
  const plan = actPlan(state, now.value);
  const setup = state.phase === 'setup';
  const head = setup ? 'Подготовка' : running ? `Акт ${roman(act)}` : 'Финал';
  // Часы показывают остаток акта по расписанию (25 минут); перебор идёт со знаком минус.
  const remaining = plan ? Math.abs(plan.remainingMs) : 0;
  const note = setup ? 'Ярмарка не открыта'
    : !plan ? 'Ярмарка закрыта'
      : `${plan.over ? 'акт перебран на' : 'до конца акта'}${paused ? '; пауза, отсчёт стоит' : ''}. По расписанию акт ${roman(act)} до ${plan.endsAtMinute}-й минуты вечера`;
  // Шкала актов: текущая отметка — красная точка после активного деления.
  const marks: { key: string; label: string }[] = [
    { key: 'act1', label: 'I' }, { key: 'act2', label: 'II' }, { key: 'act3', label: 'III' }, { key: 'final', label: 'финал' },
  ];
  const current = running ? state.phase : setup ? null : 'final';

  const [text, setText] = useState('');
  const [fix, setFix] = useState<FixPreset | null>(null);
  const announce = async () => {
    const r = await run({ type: 'gm.announce', text: text.trim() });
    if (r.ok) { setText(''); showToast('Объявлено'); }
  };

  return (
    <>
      <div class="m-card clock">
        <div class="act">{head}</div>
        <div class={`big ${running ? '' : 'idle'} ${plan?.over ? 'over' : ''}`} role="timer">{plan ? `${plan.over ? '−' : ''}${mmss(remaining)}` : '00:00'}</div>
        <p>{note}</p>
        <div class="acts" aria-hidden="true">
          {setup && [<span key="pin0" class="pin" />, <i key="seg0" class="seg" />]}
          {marks.map((m, idx) => [
            <span key={m.key} class={current === m.key ? 'on' : ''}>{m.label}</span>,
            current === m.key && m.key !== 'final' ? [<i key={`${m.key}-s`} class="seg" />, <span key={`${m.key}-pin`} class="pin" />] : null,
            idx < marks.length - 1 ? <i key={`${m.key}-seg`} class="seg" /> : null,
          ])}
        </div>
      </div>

      {plan?.due && (
        <div class="m-card hot act-due">
          <h5>{plan.act === 3 ? 'Пора закрывать ярмарку' : `Пора объявлять акт ${roman(plan.act + 1)}`}</h5>
          <ol>{plan.todo.map(t => <li key={t}>{t}</li>)}</ol>
          <p class="m-note">Если игра идёт хорошо, «+5 минут» сдвинет срок; все акты сдвинутся вместе с ним.</p>
        </div>
      )}

      <div class="ctl">
        {paused
          ? <Button disabled={!running} onClick={() => { void run({ type: 'clock.resume' }); }}>Продолжить</Button>
          : <Button kind="sec" disabled={!running} onClick={() => { void run({ type: 'clock.pause' }); }}>Пауза</Button>}
        <Button kind="sec" disabled={!running} onClick={() => { void run({ type: 'clock.extend', minutes: 5 }); }}>+5 минут</Button>
        <span class="wide">
          <Button disabled={!nextAct} onClick={() => {
            if (!nextAct) return;
            ask({
              title: `Начать акт ${nextAct.act}?`, text: nextAct.lines.join(' '), okLabel: `Акт ${nextAct.act}`,
              onOk: () => { void run({ type: 'act.next' }); },
            });
          }}>{nextAct ? `Начать акт ${nextAct.act}` : 'Начать акт II'}</Button>
        </span>
        <span class="wide">
          {/* одна кнопка закрытия: ведёт на «Итоги», где чек-лист и подтверждение (§6.5) */}
          {state.closing
            ? <Button kind="sec" onClick={() => { gmTab.value = 'results'; }}>К итогам</Button>
            : <Button kind="sec" disabled={state.phase !== 'act3'} onClick={() => { gmTab.value = 'results'; }}>Закрыть ярмарку</Button>}
        </span>
      </div>

      <Lots v={v} />

      <Abilities v={v} onFix={setFix} />

      <div class="m-card danger-zone">
        <h5>Сброс игры</h5>
        <p class="m-note">Удалит состав, явку, привязки игроков, вещи, сделки, алтари и журнал. Коды приглашений выдадутся заново, вы останетесь ведущим.</p>
        <Button kind="sec" onClick={() => ask({
          title: 'Сбросить игру полностью?', danger: true, okLabel: 'Сбросить',
          text: 'Всё состояние вернётся к началу: состав пустой, игроки отвязаны, ссылки старые перестанут работать. Отменить нельзя.',
          onOk: () => { void run({ type: 'session.reset' }).then(r => { if (r.ok) showToast('Игра сброшена'); }); },
        })}>Сбросить игру</Button>
      </div>

      <div class="m-card">
        <h5>Объявление всем</h5>
        <label class="field">
          <textarea rows={3} value={text} placeholder="Текст для всех игроков"
            onInput={e => setText((e.currentTarget as HTMLTextAreaElement).value)} />
        </label>
        <Button disabled={!text.trim()} onClick={() => { void announce(); }}>Объявить</Button>
        {state.announcements.length > 0 && (
          <div class="ann-log">
            {state.announcements.slice(-5).reverse().map((a, i) => (
              <div class="m-row" key={i}><b>{a.title}</b><p class="hand" style={{ margin: 0 }}>{a.text}</p></div>
            ))}
          </div>
        )}
      </div>

      <Correction v={v} preset={fix} />
    </>
  );
}

/** Название вещи по содержимому для пульта: улики и изделия по имени, осколки и реликвии по ref. */
function gmItemName(it: { kind: string; ref: string }, content: GmView['content']): string {
  if (it.kind === 'shard') return `Осколок ${it.ref}`;
  if (it.kind === 'clue') return content.clues.find(c => c.id === it.ref)?.name ?? `Улика ${it.ref}`;
  if (it.kind === 'relic') return it.ref;
  return content.recipes.find(r => r.id === it.ref)?.name ?? it.ref;
}

/** Лоты текущей ярмарки: открыть торг, открыть ставки, завершить; счёт ставок и итог. */
function Lots({ v }: { v: GmView }) {
  const { state, content } = v;
  const name = (k: string) => content.roles.find(r => r.key === k)?.name ?? k;
  const clock = { paused: state.clock.pausedAt !== undefined, pausedAt: state.clock.pausedAt };
  const lots = Object.values(state.lots).filter(l => l.status !== 'queued');
  if (lots.length === 0) return null;
  const busy = lots.some(l => l.status === 'openBidding' || l.status === 'sealedBidding');
  const title = (l: (typeof lots)[number]) => l.items.map(id => state.items[id]).filter(Boolean).map(it => gmItemName(it, content)).join(' + ');
  const cmd = (type: 'lot.openBidding' | 'lot.sealedBids' | 'lot.close', id: string) => void run({ type, id });
  return (
    <div class="m-card">
      <h5>Лоты</h5>
      {lots.map(l => {
        const until = l.status === 'openBidding' ? l.openUntil : l.status === 'sealedBidding' ? l.sealedUntil : undefined;
        const left = until === undefined ? 0 : Math.max(0, remainingMs(until, clock, now.value));
        return (
          <div class="lot gm-lot" key={l.id}>
            <div class="lot-title"><b>{title(l)}</b><small>акт {roman(l.act)}</small></div>
            <div class="m-row"><span>Состояние</span><b>{LOT_STATUS[l.status]}{until !== undefined && ` · ${mmss(left)}`}</b></div>
            {l.status === 'announced' && (
              <div class="m-btns two">
                <Button kind="sec" disabled={busy} onClick={() => cmd('lot.openBidding', l.id)}>Открытый торг</Button>
                <Button disabled={busy} onClick={() => cmd('lot.sealedBids', l.id)}>Закрытые ставки</Button>
              </div>
            )}
            {l.status === 'openBidding' && (
              <>
                <p class="m-note">Две минуты торга голосом. Когда зал готов, откройте закрытые ставки.</p>
                <div class="m-btns"><Button onClick={() => cmd('lot.sealedBids', l.id)}>Закрытые ставки</Button></div>
              </>
            )}
            {l.status === 'sealedBidding' && (
              <>
                <p class="m-note">{l.bids.length ? `${l.bids.length} ${plural(l.bids.length, 'ставка', 'ставки', 'ставок')}` : 'ставок пока нет'}. Окно закроется само; можно завершить раньше.</p>
                <div class="m-btns">
                  <Button kind="sec" onClick={() => ask({
                    title: 'Завершить торг сейчас?', okLabel: 'Завершить',
                    text: l.bids.length ? 'Победит наибольшая ставка, при равенстве жребий.' : 'Ставок нет: лот уйдёт в выкуп за 4 золота.',
                    onOk: () => cmd('lot.close', l.id),
                  })}>Завершить торг</Button>
                </div>
              </>
            )}
            {l.status === 'fixedPrice' && <p class="m-note">Ставок не было: выкуп за {goldText(l.fixedPrice ?? 4)}, кто первый нажмёт.</p>}
            {l.status === 'sold' && l.winner !== undefined && (
              <div class="m-row"><span>Ушёл</span><b>{name(l.winner)} за {goldText(l.price ?? 0)}</b></div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const LOT_STATUS: Record<string, string> = {
  announced: 'ждёт торга', openBidding: 'открытый торг', sealedBidding: 'закрытые ставки',
  fixedPrice: 'выкуп', sold: 'продан', unsold: 'не продан',
};

function Correction({ v, preset }: { v: GmView; preset: FixPreset | null }) {
  const { state, content } = v;
  const name = (k: string) => content.roles.find(r => r.key === k)?.name ?? k;
  const [player, setPlayer] = useState(state.roster[0] ?? '');
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
  const curOwner = newOwner || state.roster[0] || '';
  const p = player || state.roster[0] || '';
  const role = content.roles.find(r => r.key === p);
  // сторону ведущий правит только у свободных ролей; варианты — алтари этой игры
  const free = role?.side === 'free';
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
            : `${MARK_LABEL[field]}: ${on ? 'поставить' : 'снять'}`;
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
          { value: 'goal', label: 'Личная цель', icon: '✓' },
          ...(Object.keys(MARK_LABEL) as MarkField[]).map(f => ({ value: f, label: MARK_LABEL[f], icon: MARK_ICON[f] })),
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
            <p class="m-note">Сейчас: {chosen && chosen !== 'free' ? sideName(chosen) : 'не выбрана'}. После закрытия итоги пересчитаются.</p>
          </>
        ) : <p class="m-note">Сторону выбирают только свободные роли.</p>
      ) : field === 'goal' ? (
        <>
          <div class="field"><span>Цель</span>
            <Select label="Цель" value={String(goalIndex)} onChange={s => setGoalIndex(s === '1' ? 1 : 0)} options={[0, 1].map(i => ({
              value: String(i), label: `Цель ${i + 1}`, hint: role?.goals[i],
            }))} />
          </div>
          <div class="m-btns" role="group" aria-label="Отметка цели">
            {(Object.keys(GOAL_MARK) as GoalMark[]).map(m => (
              <Button key={m} kind={goalMark === m ? 'main' : 'sec'} small onClick={() => setGoalMark(m)}>{GOAL_MARK[m]}</Button>
            ))}
          </div>
          <p class="m-note">Отметка ведущего важнее расчёта; «снять отметку» вернёт расчёт по журналу. На «Итогах» такая цель помечена «отмечено ведущим».</p>
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
          <p class="m-note">Отметки правятся только у игрока на ярмарке. {field === 'abilityUsed' ? 'Снять — вернуть применение в этом акте; если просьба ждёт ответа, сначала отмените её.' : field === 'protection' ? 'Защита одна: поставить можно только тому, у кого её нет.' : ''}</p>
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
