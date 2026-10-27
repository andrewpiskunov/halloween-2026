import { useState } from 'preact/hooks';
import type { GmView, Ingredient } from '@fair/shared';
import { Button } from '../../components/Button';
import { Select } from '../../components/Select';
import { Stepper } from '../../components/Stepper';
import { actPlan } from '../../gm/clock';
import { actNextPreview } from '../../gm/lots';
import { itemImageUrl, resourceImageUrl } from '../../assets';
import { INGREDIENTS, mmss, roman } from '../../labels';
import { correctableItems } from '../../rules';
import { ask, now, run, showToast } from '../../store';

type Field = 'gold' | 'ingredient' | 'itemOwner';

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
          <Button kind="sec" disabled>Закрыть ярмарку</Button>
          <p class="m-note" style={{ textAlign: 'center' }}>Закрытие — в следующей версии</p>
        </span>
      </div>

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

      <Correction v={v} />
    </>
  );
}

function Correction({ v }: { v: GmView }) {
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

  const ownerLabel = (o: (typeof items)[number]['owner']) =>
    o.type === 'player' ? name(o.key) : o.type === 'altar' ? `алтарь ${o.side}` : 'лот';
  const itemIcon = (kind: string) => kind === 'shard' ? '💠' : kind === 'clue' ? '🔍' : kind === 'relic' ? '🏺' : '⚗️';
  const roleOption = (k: string) => ({ value: k, label: name(k), icon: content.roles.find(r => r.key === k)?.emoji, avatar: k });
  const itemName = (it: (typeof items)[number]) => it.kind === 'shard' ? `Осколок ${it.ref}` : it.kind === 'clue' ? `Улика ${it.ref}` : it.ref;

  const curItem = items.some(i => i.id === itemId) ? itemId : items[0]?.id ?? '';
  const curOwner = newOwner || state.roster[0] || '';
  const p = player || state.roster[0] || '';
  const ready = reason.trim() !== '' && p !== '' && (field === 'itemOwner' ? curItem !== '' && curOwner !== '' : delta !== 0);

  const submit = () => {
    const change = field === 'gold' ? { field: 'gold' as const, delta }
      : field === 'ingredient' ? { field: 'ingredient' as const, ingredient, delta }
        : { field: 'itemOwner' as const, itemId: curItem, owner: { type: 'player' as const, key: curOwner } };
    const what = field === 'gold' ? `золото ${delta > 0 ? '+' : ''}${delta}`
      : field === 'ingredient' ? `${INGREDIENTS.find(i => i.key === ingredient)?.short} ${delta > 0 ? '+' : ''}${delta}`
        : `вещь отдать: ${name(curOwner)}`;
    ask({
      title: 'Исправить?', text: `${name(p)}: ${what}. Причина: ${reason.trim()}`, okLabel: 'Исправить', danger: true,
      onOk: () => { void run({ type: 'gm.correct', playerKey: p, change, reason: reason.trim() }).then(r => { if (r.ok) { setReason(''); setDelta(0); } }); },
    });
  };


  return (
    <div class="m-card">
      <h5>Исправление</h5>
      <div class="field"><span>Игрок</span>
        <Select label="Игрок" value={p} onChange={setPlayer} options={state.roster.map(roleOption)} />
      </div>
      <div class="field"><span>Что исправить</span>
        <Select label="Что исправить" value={field} onChange={s => setField(s as Field)} options={[
          { value: 'gold', label: 'Золото', icon: '🪙', image: resourceImageUrl('gold') },
          { value: 'ingredient', label: 'Ингредиент', icon: '🔥', image: resourceImageUrl('ash') },
          { value: 'itemOwner', label: 'Владелец вещи', icon: '🎒' },
        ]} />
      </div>
      {field === 'ingredient' && (
        <div class="field"><span>Ингредиент</span>
          <Select label="Ингредиент" value={ingredient} onChange={s => setIngredient(s as Ingredient)} options={INGREDIENTS.map(i => ({ value: i.key, label: i.name, icon: i.emoji, image: resourceImageUrl(i.key) }))} />
        </div>
      )}
      {field !== 'itemOwner' ? (
        <div class="m-row"><span>Изменить на</span><Stepper value={delta} onChange={setDelta} min={-10} max={10} label="Изменение" /></div>
      ) : (
        <>
          <div class="field"><span>Вещь</span>
            <Select label="Вещь" value={curItem} onChange={setItemId} placeholder="Нет вещей у игроков" options={items.map(it => ({ value: it.id, label: itemName(it), hint: ownerLabel(it.owner), icon: itemIcon(it.kind), image: itemImageUrl(it) }))} />
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
