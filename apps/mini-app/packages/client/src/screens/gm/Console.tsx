import { useState } from 'preact/hooks';
import type { GmView, Ingredient } from '@fair/shared';
import { Button } from '../../components/Button';
import { Select } from '../../components/Select';
import { Stepper } from '../../components/Stepper';
import { actNextPreview } from '../../gm/lots';
import { INGREDIENTS, mmss } from '../../labels';
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
  const elapsed = (state.clock.pausedAt ?? now.value) - state.clock.actStartedAt - state.clock.pausedTotal;
  const clock = state.phase === 'setup' ? 'Ярмарка не открыта'
    : running ? `Акт ${act} · ${mmss(elapsed)}${paused ? ' ⏸' : ''}` : 'Ярмарка закрыта';

  const [text, setText] = useState('');
  const announce = async () => {
    const r = await run({ type: 'gm.announce', text: text.trim() });
    if (r.ok) { setText(''); showToast('Объявлено'); }
  };

  return (
    <>
      <div class="m-card hot">
        <h5>⏱️ Часы</h5>
        <p class="gm-clock">{clock}</p>
        <div class="m-btns">
          {paused
            ? <Button icon="▶️" disabled={!running} onClick={() => { void run({ type: 'clock.resume' }); }}>Продолжить</Button>
            : <Button icon="⏸️" kind="sec" disabled={!running} onClick={() => { void run({ type: 'clock.pause' }); }}>Пауза</Button>}
          <Button icon="➕" kind="sec" disabled={!running} onClick={() => { void run({ type: 'clock.extend', minutes: 5 }); }}>+5 минут</Button>
        </div>
        <div class="m-btns">
          <Button icon="🌗" disabled={!nextAct} onClick={() => {
            if (!nextAct) return;
            ask({
              title: `Начать акт ${nextAct.act}?`, text: nextAct.lines.join(' '), okLabel: `Акт ${nextAct.act}`,
              onOk: () => { void run({ type: 'act.next' }); },
            });
          }}>{nextAct ? `Акт ${nextAct.act}` : 'Акт II'}</Button>
          <Button icon="🔒" kind="sec" disabled>Закрыть ярмарку</Button>
        </div>
        <p class="m-note">В следующей версии</p>
      </div>

      <div class="m-card">
        <h5>📣 Объявление</h5>
        <label class="field">
          <textarea rows={3} value={text} placeholder="Текст для всех игроков"
            onInput={e => setText((e.currentTarget as HTMLTextAreaElement).value)} />
        </label>
        <Button icon="📣" disabled={!text.trim()} onClick={() => { void announce(); }}>Объявить</Button>
        {state.announcements.slice(-5).reverse().map((a, i) => (
          <div class="m-row" key={i}><span><b>{a.title}</b> {a.text}</span></div>
        ))}
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
      <h5>🛠️ Исправление</h5>
      <div class="field"><span>Игрок</span>
        <Select label="Игрок" value={p} onChange={setPlayer} options={state.roster.map(k => ({ value: k, label: name(k), icon: content.roles.find(r => r.key === k)?.emoji }))} />
      </div>
      <div class="field"><span>Что исправить</span>
        <Select label="Что исправить" value={field} onChange={s => setField(s as Field)} options={[
          { value: 'gold', label: 'Золото', icon: '🪙' },
          { value: 'ingredient', label: 'Ингредиент', icon: '🔥' },
          { value: 'itemOwner', label: 'Владелец вещи', icon: '🎒' },
        ]} />
      </div>
      {field === 'ingredient' && (
        <div class="field"><span>Ингредиент</span>
          <Select label="Ингредиент" value={ingredient} onChange={s => setIngredient(s as Ingredient)} options={INGREDIENTS.map(i => ({ value: i.key, label: i.name, icon: i.emoji }))} />
        </div>
      )}
      {field !== 'itemOwner' ? (
        <div class="m-row"><span>Изменить на</span><Stepper value={delta} onChange={setDelta} min={-10} max={10} label="Изменение" /></div>
      ) : (
        <>
          <div class="field"><span>Вещь</span>
            <Select label="Вещь" value={curItem} onChange={setItemId} placeholder="Нет вещей у игроков" options={items.map(it => ({ value: it.id, label: itemName(it), hint: ownerLabel(it.owner), icon: itemIcon(it.kind) }))} />
          </div>
          <div class="field"><span>Новый владелец</span>
            <Select label="Новый владелец" value={curOwner} onChange={setNewOwner} options={state.roster.map(k => ({ value: k, label: name(k), icon: content.roles.find(r => r.key === k)?.emoji }))} />
          </div>
        </>
      )}
      <label class="field"><span>Причина</span>
        <input type="text" value={reason} placeholder="Например: ошибка при выдаче" onInput={e => setReason((e.currentTarget as HTMLInputElement).value)} />
      </label>
      <Button icon="🛠️" disabled={!ready} onClick={submit}>Исправить</Button>
    </div>
  );
}
