import { useEffect, useState } from 'preact/hooks';
import type { Bundle, Ingredient, Offer, PlayerView } from '@fair/shared';
import { Button } from '../components/Button';
import { ItemCard } from '../components/ItemCard';
import { Portrait } from '../components/Portrait';
import { Select } from '../components/Select';
import { Stepper } from '../components/Stepper';
import { GOLD, INGREDIENTS, bundleText, emptyBundle, itemLabel, mmss, roleEmoji, roleName } from '../labels';
import { canOffer, offerRemainingMs } from '../rules';
import { ask, now, run, tradeDraft } from '../store';

const STATUS_TEXT: Record<Offer['status'], string> = {
  pending: 'ждёт ответа', accepted: 'принято', declined: 'отклонено', cancelled: 'отменено', expired: 'истекло',
};

/** Сделки: входящие, исходящие, новое предложение, история. */
export function Trades({ v }: { v: PlayerView }) {
  const me = v.me.role.key;
  const incoming = v.offers.filter(o => o.to === me && o.status === 'pending');
  const outgoing = v.offers.filter(o => o.from === me && o.status === 'pending');
  const history = v.offers.filter(o => o.status !== 'pending').sort((a, b) => b.createdAt - a.createdAt);

  const accept = (o: Offer) => ask({
    title: `Принять сделку от ${roleName(o.from, v)}?`,
    text: `Вы отдаёте: ${bundleText(o.get, v)}. Вы получаете: ${bundleText(o.give, v)}.`,
    okLabel: 'Принять',
    onOk: () => void run({ type: 'offer.accept', id: o.id }),
  });
  const decline = (o: Offer) => ask({
    title: `Отклонить сделку от ${roleName(o.from, v)}?`, okLabel: 'Отклонить', danger: true,
    onOk: () => void run({ type: 'offer.decline', id: o.id }),
  });
  const cancel = (o: Offer) => ask({
    title: `Отменить предложение для ${roleName(o.to, v)}?`, okLabel: 'Отменить', danger: true,
    onOk: () => void run({ type: 'offer.cancel', id: o.id }),
  });

  return (
    <>
      {incoming.map(o => (
        <div class="m-card hot" key={o.id}>
          <h5>📩 Входящее · ждёт {mmss(offerRemainingMs(o, v.clock, now.value))}{v.clock.paused ? ' ⏸' : ''}</h5>
          <Who v={v} roleKey={o.from} />
          <ItemCard emoji="📤" title="Вы отдаёте" sub={bundleText(o.get, v)} />
          <ItemCard emoji="📥" title="Вы получаете" sub={bundleText(o.give, v)} />
          {o.service && <p class="m-note">Включает услугу: договоритесь о ней лично.</p>}
          <div class="m-btns">
            <Button icon="✅" onClick={() => accept(o)}>Принять</Button>
            <Button kind="sec" icon="✖️" onClick={() => decline(o)}>Отклонить</Button>
          </div>
        </div>
      ))}

      {outgoing.map(o => (
        <div class="m-card" key={o.id}>
          {/* Часы сервера и телефона могут расходиться: отсчёт приблизительный. */}
          <h5>📨 Исходящее · осталось {mmss(offerRemainingMs(o, v.clock, now.value))}{v.clock.paused ? ' ⏸' : ''}</h5>
          <Who v={v} roleKey={o.to} />
          <ItemCard emoji="📤" title="Вы отдаёте" sub={bundleText(o.give, v)} />
          <ItemCard emoji="📥" title="Вы просите" sub={bundleText(o.get, v)} />
          <div class="m-btns"><Button kind="sec" icon="↩️" onClick={() => cancel(o)}>Отменить</Button></div>
        </div>
      ))}

      <OfferForm v={v} />

      <div class="m-card">
        <h5>📜 История</h5>
        {history.length === 0 && <p class="m-note">Закрытых сделок пока нет.</p>}
        {history.map(o => (
          <div class="m-row" key={o.id}>
            <span>
              {o.from === me ? `Вы → ${roleName(o.to, v)}` : `${roleName(o.from, v)} → вы`}: {bundleText(o.give, v)} за {bundleText(o.get, v)}
            </span>
            <b class={o.status === 'accepted' ? 'm-ok' : 'm-no'}>{STATUS_TEXT[o.status]}</b>
          </div>
        ))}
      </div>
    </>
  );
}

function Who({ v, roleKey }: { v: PlayerView; roleKey: string }) {
  const other = v.others.find(o => o.roleKey === roleKey);
  return (
    <div class="hero-head small">
      <Portrait roleKey={roleKey} emoji={roleEmoji(roleKey, v)} size="sm" />
      <div><b>{roleName(roleKey, v)}</b>{other && <span>{other.title}</span>}</div>
    </div>
  );
}

/**
 * Новое предложение. «Прошу» — только золото, ингредиенты и слух:
 * вещей собеседника в моей проекции нет, и выбрать их нельзя.
 */
function OfferForm({ v }: { v: PlayerView }) {
  const [to, setTo] = useState('');
  const [give, setGive] = useState<Bundle>(emptyBundle);
  const [get, setGet] = useState<Bundle>(emptyBundle);
  const [sending, setSending] = useState(false);
  const draft = tradeDraft.value;

  // Кнопка «Предложить» в сумке: вещь сразу попадает в «отдаю».
  useEffect(() => {
    if (!draft) return;
    setGive(g => (g.items.includes(draft.itemId) ? g : { ...g, items: [...g.items, draft.itemId] }));
    tradeDraft.value = null;
  }, [draft]);

  const a = v.me.available;
  const freeItems = v.me.items.filter(i => canOffer(i, v));
  const empty = (b: Bundle) => !b.gold && !b.items.length && !b.rumor?.trim() && INGREDIENTS.every(i => !b.ingredients[i.key]);
  const canSend = !!to && v.others.some(o => o.roleKey === to) && !(empty(give) && empty(get)) && !sending;

  const submit = async () => {
    const clean = (b: Bundle): Bundle => {
      const rumor = b.rumor?.trim();
      return { gold: b.gold, ingredients: { ...b.ingredients }, items: [...b.items], ...(rumor ? { rumor } : {}) };
    };
    setSending(true);
    const r = await run({ type: 'offer.create', to, give: clean(give), get: clean(get) });
    setSending(false);
    if (r.ok) { setGive(emptyBundle()); setGet(emptyBundle()); setTo(''); }
  };

  return (
    <div class="m-card">
      <h5>✍️ Новое предложение</h5>
      <div class="field">
        <span>Кому</span>
        <Select label="Кому" value={to} onChange={setTo} placeholder="Выберите участника"
          options={v.others.map(o => ({ value: o.roleKey, label: o.name, hint: o.title, icon: o.emoji }))} />
      </div>

      <h6>📤 Отдаю</h6>
      <BundleEditor value={give} onChange={setGive} maxGold={a.gold} maxIng={a.ingredients} />
      {freeItems.length > 0 && (
        <div class="checks">
          {freeItems.map(i => {
            const l = itemLabel(i, v);
            const on = give.items.includes(i.id);
            return (
              <label key={i.id} class={`check ${on ? 'on' : ''}`}>
                <input type="checkbox" checked={on}
                  onChange={() => setGive({ ...give, items: on ? give.items.filter(x => x !== i.id) : [...give.items, i.id] })} />
                <span>{l.emoji} {l.name}</span>
              </label>
            );
          })}
        </div>
      )}

      <h6>📥 Прошу</h6>
      <BundleEditor value={get} onChange={setGet} />
      <p class="m-note">Вещи собеседника приложение не показывает: попросите вещь словами в слухе или пусть он предложит её сам.</p>

      <p class="m-note">Отданное будет обещано до ответа. Отменить можно, пока не приняли.</p>
      <Button icon="📨" disabled={!canSend} onClick={() => void submit()}>Отправить</Button>
    </div>
  );
}

function BundleEditor({ value, onChange, maxGold = 99, maxIng }: {
  value: Bundle; onChange: (b: Bundle) => void; maxGold?: number; maxIng?: Record<Ingredient, number>;
}) {
  return (
    <div class="bundle">
      <div class="m-row">
        <span>{GOLD.emoji} {GOLD.name}</span>
        <Stepper value={value.gold} max={maxGold} onChange={gold => onChange({ ...value, gold })} label={GOLD.name} />
      </div>
      {INGREDIENTS.map(ing => (
        <div class="m-row" key={ing.key}>
          <span>{ing.emoji} {ing.name}</span>
          <Stepper value={value.ingredients[ing.key]} max={maxIng?.[ing.key] ?? 99} label={ing.name}
            onChange={n => onChange({ ...value, ingredients: { ...value.ingredients, [ing.key]: n } })} />
        </div>
      ))}
      <label class="field">
        <span>👂 Слух</span>
        <input type="text" maxLength={500} placeholder="Что расскажете или хотите услышать" value={value.rumor ?? ''}
          onInput={e => onChange({ ...value, rumor: (e.currentTarget as HTMLInputElement).value })} />
      </label>
    </div>
  );
}
