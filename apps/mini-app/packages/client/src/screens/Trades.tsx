import { useEffect, useState } from 'preact/hooks';
import type { Bundle, Ingredient, Offer, PlayerView } from '@fair/shared';
import { itemImageUrl, resourceImageUrl } from '../assets';
import { Button } from '../components/Button';
import { Portrait } from '../components/Portrait';
import { Select } from '../components/Select';
import { Stepper } from '../components/Stepper';
import { Thumb } from '../components/Thumb';
import { GOLD, INGREDIENTS, bundleText, bundleWords, emptyBundle, goldText, itemLabel, mmss, plural, roleEmoji, roleName } from '../labels';
import { canOffer, offerRemainingMs } from '../rules';
import { ask, now, run, tradeDraft } from '../store';

/** Срок ответа на предложение; копия OFFER_TTL_MS из engine/offers.ts (клиент берёт из shared только типы). */
const OFFER_TTL_MS = 300_000;

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

  const waiting = incoming.length
    ? `${incoming.length} ${plural(incoming.length, 'ждёт', 'ждут', 'ждут')} ответа`
    : outgoing.length ? `${outgoing.length} отправлено` : '';

  return (
    <>
      <h2 class="scr-h">Сделки {waiting && <small>{waiting}</small>}</h2>

      {incoming.map(o => (
        <div class="m-card hot" key={o.id}>
          <OfferHead v={v} o={o} roleKey={o.from} label="Входящее от" />
          <div class="ledger">
            <div><small>Вы отдаёте</small><BundleList b={o.get} v={v} /></div>
            <div><small>Вы получаете</small><BundleList b={o.give} v={v} /></div>
          </div>
          {o.service && <p class="m-note">Включает услугу: договоритесь о ней лично.</p>}
          <div class="m-btns two">
            <Button onClick={() => accept(o)}>Принять</Button>
            <Button kind="sec" onClick={() => decline(o)}>Отклонить</Button>
          </div>
        </div>
      ))}

      {outgoing.map(o => (
        <div class="m-card" key={o.id}>
          {/* Часы сервера и телефона могут расходиться: отсчёт приблизительный. */}
          <OfferHead v={v} o={o} roleKey={o.to} label="Исходящее для" />
          <div class="ledger">
            <div><small>Вы отдаёте</small><BundleList b={o.give} v={v} /></div>
            <div><small>Вы просите</small><BundleList b={o.get} v={v} /></div>
          </div>
          <div class="m-btns"><Button kind="sec" onClick={() => cancel(o)}>Отменить</Button></div>
        </div>
      ))}

      <OfferForm v={v} />

      <div class="m-card">
        <h5>История</h5>
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

/** Шапка сделки: цветной аватар, имя капителью и кольцо-таймер. */
function OfferHead({ v, o, roleKey, label }: { v: PlayerView; o: Offer; roleKey: string; label: string }) {
  const other = v.others.find(x => x.roleKey === roleKey);
  const left = offerRemainingMs(o, v.clock, now.value);
  const share = Math.min(1, Math.max(0, left / OFFER_TTL_MS));
  const p = `${(share * 100).toFixed(1)}%`;
  return (
    <div class="offer-head">
      <Portrait roleKey={roleKey} emoji={roleEmoji(roleKey, v)} />
      <div class="who">{label}<b>{roleName(roleKey, v)}</b>{other?.title}</div>
      <div class="ring" role="timer" aria-label={`Осталось ${mmss(left)}`}
        style={{ background: `conic-gradient(var(--cinnabar) 0 ${p}, rgba(42,33,24,.15) ${p} 100%)` }}>
        <b>{mmss(left)}{v.clock.paused && <small>пауза</small>}</b>
      </div>
    </div>
  );
}

/** Состав набора строками с цветными иконками. Чужие вещи не видны и показываются как «вещь». */
function BundleList({ b, v }: { b: Bundle; v: PlayerView }) {
  const rows: { key: string; img?: string; emoji: string; text: string }[] = [];
  if (b.gold) rows.push({ key: 'gold', img: resourceImageUrl('gold'), emoji: GOLD.emoji, text: goldText(b.gold) });
  for (const ing of INGREDIENTS) {
    const n = b.ingredients[ing.key];
    if (n) rows.push({ key: ing.key, img: resourceImageUrl(ing.key), emoji: ing.emoji, text: `${ing.name} ×${n}` });
  }
  for (const id of b.items) {
    const it = v.me.items.find(i => i.id === id);
    if (it) { const l = itemLabel(it, v); rows.push({ key: id, img: itemImageUrl(it), emoji: l.emoji, text: l.name }); }
    else rows.push({ key: id, emoji: '📦', text: 'вещь' });
  }
  return (
    <ul class="bl">
      {rows.map(r => <li key={r.key}><Thumb src={r.img} emoji={r.emoji} size="sm" /><span>{r.text}</span></li>)}
      {b.rumor && <li class="rumor">слух: «{b.rumor}»</li>}
      {rows.length === 0 && !b.rumor && <li class="none">ничего</li>}
    </ul>
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

  const giveWords = bundleWords(give, v);
  const getWords = bundleWords(get, v);

  return (
    <div class="m-card">
      <h5>Новое предложение</h5>
      <div class="line">
        <small>Кому</small>
        <Select label="Кому" value={to} onChange={setTo} placeholder="выберите участника"
          options={v.others.map(o => ({ value: o.roleKey, label: o.name, hint: o.title, icon: o.emoji, avatar: o.roleKey }))} />
      </div>

      <div class="line"><small>Отдаю</small><span class={`hand ${giveWords ? '' : 'none'}`}>{giveWords || 'ничего'}</span></div>
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
                <span><Thumb src={itemImageUrl(i)} emoji={l.emoji} size="sm" />{l.name}</span>
              </label>
            );
          })}
        </div>
      )}

      <div class="line"><small>Прошу</small><span class={`hand ${getWords ? '' : 'none'}`}>{getWords || 'ничего'}</span></div>
      <BundleEditor value={get} onChange={setGet} />
      <p class="m-note">Вещи собеседника приложение не показывает: попросите вещь словами в слухе или пусть он предложит её сам.</p>

      <p class="m-note">Отданное будет обещано до ответа. Отменить можно, пока не приняли.</p>
      <Button kind="red" disabled={!canSend} onClick={() => void submit()}>Запечатать и отправить</Button>
    </div>
  );
}

function BundleEditor({ value, onChange, maxGold = 99, maxIng }: {
  value: Bundle; onChange: (b: Bundle) => void; maxGold?: number; maxIng?: Record<Ingredient, number>;
}) {
  return (
    <div class="bundle">
      <div class="m-row">
        <span><Thumb src={resourceImageUrl('gold')} emoji={GOLD.emoji} size="sm" />{GOLD.name}</span>
        <Stepper value={value.gold} max={maxGold} onChange={gold => onChange({ ...value, gold })} label={GOLD.name} />
      </div>
      {INGREDIENTS.map(ing => (
        <div class="m-row" key={ing.key}>
          <span><Thumb src={resourceImageUrl(ing.key)} emoji={ing.emoji} size="sm" />{ing.name}</span>
          <Stepper value={value.ingredients[ing.key]} max={maxIng?.[ing.key] ?? 99} label={ing.name}
            onChange={n => onChange({ ...value, ingredients: { ...value.ingredients, [ing.key]: n } })} />
        </div>
      ))}
      <label class="field">
        <span>Слух</span>
        <input type="text" maxLength={500} placeholder="Что расскажете или хотите услышать" value={value.rumor ?? ''}
          onInput={e => onChange({ ...value, rumor: (e.currentTarget as HTMLInputElement).value })} />
      </label>
    </div>
  );
}
