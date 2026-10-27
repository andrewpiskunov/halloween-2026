import { useState } from 'preact/hooks';
import type { PlayerView } from '@fair/shared';
import { itemImageUrl, resourceImageUrl } from '../assets';
import { Button } from '../components/Button';
import { FrozenNote } from '../components/Frozen';
import { ItemCard } from '../components/ItemCard';
import { Stepper } from '../components/Stepper';
import { GOLD, goldText, itemLabel, refKind, refLabel } from '../labels';
import { canPutOnAltar } from '../rules';
import { ask, run } from '../store';

type Altar = PlayerView['altars'][number];

/** Алтари: бумажные карты с вкладами по именам, «Вложить» вещь или золото, «Забрать своё». */
export function Altars({ v }: { v: PlayerView }) {
  const [open, setOpen] = useState<string | null>(null);
  if (v.altars.length === 0) return <div class="m-card"><p class="m-note">Алтари появятся, когда ярмарка откроется.</p></div>;
  const unknown = v.public.shards.filter(s => s.status === 'unknown');
  return (
    <>
      <h2 class="scr-h">Алтари</h2>
      <FrozenNote v={v} />
      <p class="m-note altar-rule">Ритуал готов, когда на алтаре три разных осколка, два Фокуса силы и не меньше шести золота от трёх разных игроков. Готов может быть только один алтарь.</p>
      {v.altars.map(a => (
        <AltarCard key={a.side} v={v} a={a} open={open === a.side} toggle={() => setOpen(open === a.side ? null : a.side)} />
      ))}
      {unknown.length > 0 && (
        <div class="item-block">
          <h5>Осколки, которых никто не видел</h5>
          {unknown.map(s => (
            <ItemCard key={s.id} emoji="💠" img={itemImageUrl({ kind: 'shard', ref: s.id })} title={`Осколок ${s.id}`} sub="Где он, пока неизвестно." />
          ))}
        </div>
      )}
    </>
  );
}

function AltarCard({ v, a, open, toggle }: { v: PlayerView; a: Altar; open: boolean; toggle: () => void }) {
  const me = v.me.role.key;
  const color = v.public.factions.find(f => f.id === a.side)?.color ?? 'var(--ochre)';
  const [gold, setGold] = useState(1);
  const avail = v.me.available;
  const altarItems = v.me.items.filter(i => canPutOnAltar(i, v));
  const totalGold = a.contributions.reduce((s, c) => s + (c.gold ?? 0), 0);
  const need = altarProgress(a, v);

  const contribute = (what: { itemId: string; name: string } | { gold: number }) => ask({
    title: 'itemId' in what ? `Вложить «${what.name}» в ${a.name}?` : `Вложить ${goldText(what.gold)} в ${a.name}?`,
    text: 'Своё можно забрать, пока ярмарка не закрыта.',
    okLabel: 'Вложить',
    onOk: async () => {
      const r = await run('itemId' in what
        ? { type: 'altar.contribute', side: a.side, itemId: what.itemId }
        : { type: 'altar.contribute', side: a.side, gold: what.gold });
      if (r.ok) toggle();
    },
  });

  return (
    <div class="m-card alt" style={{ '--accent': color }}>
      <div class="altar-h"><i aria-hidden="true" /><h4>{a.name}</h4></div>
      <ul class="altar-need" aria-label="Чего не хватает">
        {need.map(n => <li key={n.label} class={n.done ? 'ok' : ''}>{n.label} {n.have}/{n.goal}</li>)}
      </ul>
      <h5>Вклады</h5>
      {a.contributions.length === 0 && <p class="m-note">Пока пусто.</p>}
      {a.contributions.map(c => {
        const label = c.gold !== undefined ? { emoji: GOLD.emoji, name: goldText(c.gold) }
          : c.itemRef ? refLabel(c.itemRef, v) : { emoji: '📦', name: 'вещь' };
        const img = c.gold !== undefined ? resourceImageUrl('gold')
          : c.itemRef ? itemImageUrl({ kind: refKind(c.itemRef, v), ref: c.itemRef }) : undefined;
        return (
          <ItemCard key={c.id} emoji={label.emoji} img={img} title={label.name} sub={c.player === me ? 'ваш вклад' : c.name}>
            {c.player === me && (
              <Button small kind="sec" onClick={() => void run({ type: 'altar.withdraw', contributionId: c.id })}>Забрать своё</Button>
            )}
          </ItemCard>
        );
      })}
      {totalGold > 0 && <div class="m-row"><span>Золота всего</span><b>{goldText(totalGold)}</b></div>}
      <div class="m-btns"><Button kind={open ? 'sec' : 'main'} onClick={toggle}>{open ? 'Скрыть' : 'Вложить'}</Button></div>
      {open && (
        <div class="choice">
          {altarItems.length === 0 && <p class="m-note">Свободных осколков и Фокусов нет.</p>}
          {altarItems.map(i => {
            const l = itemLabel(i, v);
            return (
              <ItemCard key={i.id} emoji={l.emoji} img={itemImageUrl(i)} title={l.name}>
                <Button small onClick={() => contribute({ itemId: i.id, name: l.name })}>Вложить</Button>
              </ItemCard>
            );
          })}
          <ItemCard emoji={GOLD.emoji} img={resourceImageUrl('gold')} title="Золото" sub={`доступно ${avail.gold}`} />
          <div class="m-row">
            <Stepper value={Math.min(gold, Math.max(1, avail.gold))} min={1} max={Math.max(1, avail.gold)} onChange={setGold} label="Сколько золота" />
            <Button small disabled={avail.gold < 1} onClick={() => contribute({ gold: Math.min(gold, avail.gold) })}>Вложить</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Счёт ритуала по формуле: разные осколки, Фокусы, золото и число вкладчиков золота. */
export function altarProgress(a: Altar, v: PlayerView): { label: string; have: number; goal: number; done: boolean }[] {
  const shards = new Set(a.contributions.filter(c => c.itemRef && refKind(c.itemRef, v) === 'shard').map(c => c.itemRef));
  const focuses = a.contributions.filter(c => c.itemRef === 'focus').length;
  const gold = a.contributions.reduce((s, c) => s + (c.gold ?? 0), 0);
  const donors = new Set(a.contributions.filter(c => (c.gold ?? 0) > 0).map(c => c.player)).size;
  const row = (label: string, have: number, goal: number) => ({ label, have, goal, done: have >= goal });
  return [row('осколки', shards.size, 3), row('Фокусы', focuses, 2), row('золото', gold, 6), row('вкладчики золота', donors, 3)];
}
