import { useState } from 'preact/hooks';
import type { HiddenProduction, Ingredient, PlayerView } from '@fair/shared';
import { itemImageUrl } from '../assets';
import { Button } from '../components/Button';
import { ItemCard } from '../components/ItemCard';
import { Select } from '../components/Select';
import { Stepper } from '../components/Stepper';
import { countsText, INGREDIENTS, roleName } from '../labels';
import { ask, run } from '../store';
import { people } from './HiddenCommon';
import { Workshop } from './Workshop';

export function HiddenWorkshop({ v }: { v: PlayerView }) {
  const [panel, setPanel] = useState<'master' | 'maker'>('master');
  const h = v.hidden17!;
  return <>
    <div class="hidden-switch" role="group" aria-label="Работа в мастерской"><button class={panel === 'master' ? 'on' : ''} onClick={() => setPanel('master')}>Заказать мастеру</button><button class={panel === 'maker' ? 'on' : ''} onClick={() => setPanel('maker')}>Моё ремесло</button></div>
    {panel === 'master' ? <><div class="m-card"><h5>Работа мастера</h5><p class="text">Принесите ингредиенты и деньги по рецепту. Мастер изготовит товар, он появится в вашей сумке. Знать ремесло не нужно.</p><p class="m-note">Заказ мастеру не считается вашим собственным изготовлением. Для заказа у другого героя договоритесь с ним: он отправит вам предложение с гонораром.</p></div><Workshop v={v} /></> : <>
      <div class="m-card"><h5>Ваше ремесло</h5><p class="text">Изготовьте товар для себя, на продажу или из материалов клиента. Базовая плата уходит в банк, дополнительный гонорар — вам. Готовую вещь продают обычной сделкой без повторной оплаты рецепта.</p></div>
      {h.productionRecipes.length ? <ProductionForm v={v} /> : <div class="m-card"><p class="text">Вы не владеете ремеслом обычных изделий. Закажите нужный товар мастеру или другому герою.</p></div>}
      {h.signatureGoods.filter(g => g.maker === v.me.role.key).map(g => <div class="m-card" key={g.id}><h5>Уникальный товар · раз в акт</h5><h4>{g.name}</h4><p class="text">{g.effect}</p><p class="m-note">{g.limits}</p><p class="text">Цена: {countsText({ gold: g.gold, ingredients: g.cost })}</p><Button onClick={() => ask({ title: `Изготовить: ${g.name}?`, text: 'Фиксированный расход. Скидка, шипы и обычная способность не используются.', okLabel: 'Изготовить', onOk: () => void run({ type: 'hidden17.signature.craft', recipeId: g.id }) })}>Изготовить уникальный товар</Button></div>)}
      <details class="m-card"><summary>Правила ремесла</summary><ul class="list">{h.craftingRules.map(s => <li key={s}>{s}</li>)}</ul></details>
    </>}
    {h.production.length > 0 && <h2 class="scr-h">Заказы героям</h2>}
    {[...h.production].reverse().map(p => <ProductionCard key={p.id} p={p} v={v} />)}
  </>;
}
function ProductionForm({ v }: { v: PlayerView }) {
  const recipes = v.recipes.filter(r => v.hidden17!.productionRecipes.includes(r.id));
  const [recipeId, setRecipe] = useState(recipes[0]?.id ?? '');
  const [customer, setCustomer] = useState(v.me.role.key); const [fee, setFee] = useState(0);
  const [ability, setAbility] = useState<'' | 'focusFree' | 'substituteIngredient'>('');
  const [from, setFrom] = useState<Ingredient>('ash'); const [to, setTo] = useState<Ingredient>('moon');
  const r = recipes.find(x => x.id === recipeId)!;
  const own = customer === v.me.role.key;
  const submit = () => void run({ type: 'hidden17.produce', recipeId, customer, fee: own ? 0 : fee,
    ...(ability ? { ability, ...(ability === 'substituteIngredient' ? { substitute: { from, to } } : {}) } : {}) });
  return <div class="m-card"><h5>Изготовление героем</h5>
    <div class="field"><span>Товар</span><Select label="Изготовляемый товар" value={recipeId} onChange={id => { setRecipe(id); setAbility(''); }} options={recipes.map(r => ({ value: r.id, label: r.name, image: itemImageUrl({ kind: 'potion', ref: r.id }) }))} /></div>
    {r && <p class="text">Рецепт: {countsText({ gold: r.gold, ingredients: r.cost })}. {r.text}</p>}
    <div class="field"><span>Чьи материалы и кому товар</span><Select label="Клиент ремесленника" value={customer} onChange={setCustomer} options={people(v)} /></div>
    {!own && <div class="m-row"><span>Ваш гонорар, золото</span><Stepper label="Гонорар ремесленника" value={fee} min={0} max={99} onChange={setFee} /></div>}
    {v.me.ability.state === 'available' && (v.me.role.key === 'o6' || (v.me.role.key === 'o5' && recipeId === 'focus')) && <label class="check"><input type="checkbox" checked={!!ability} onChange={e => setAbility(e.currentTarget.checked ? v.me.role.key === 'o5' ? 'focusFree' : 'substituteIngredient' : '')} />Использовать «{v.me.ability.name}» (раз в акт)</label>}
    {ability === 'substituteIngredient' && <><div class="field"><span>Вместо</span><Select label="Заменить ингредиент" value={from} onChange={s => setFrom(s as Ingredient)} options={INGREDIENTS.filter(i => r.cost[i.key]).map(i => ({ value: i.key, label: i.name }))} /></div><div class="field"><span>Использовать</span><Select label="Новый ингредиент" value={to} onChange={s => setTo(s as Ingredient)} options={INGREDIENTS.filter(i => i.key !== from).map(i => ({ value: i.key, label: i.name }))} /></div></>}
    <p class="m-note">{own ? 'Материалы и плата банку списываются с вас.' : 'Клиент подтвердит материалы, плату банку и ваш гонорар. Изготовление и передача произойдут вместе.'} Скидка и шипы считаются у получателя товара.</p>
    <Button disabled={!r || !customer || (ability === 'substituteIngredient' && from === to)} onClick={() => ask({ title: own ? `Изготовить «${r.name}»?` : `Предложить заказ: ${r.name}?`, text: own ? 'Будут потрачены материалы рецепта и плата за работу в мастерской.' : `Клиент: ${roleName(customer, v)}. Гонорар: ${fee}.`, okLabel: own ? 'Изготовить самому' : 'Предложить клиенту', onOk: submit })}>{own ? 'Изготовить самому' : 'Предложить клиенту'}</Button>
  </div>;
}
function ProductionCard({ p, v }: { p: HiddenProduction; v: PlayerView }) {
  const r = v.recipes.find(r => r.id === p.recipeId);
  return <div class="m-card"><ItemCard title={r?.name ?? p.recipeId} emoji="⚗" img={itemImageUrl({ kind: 'potion', ref: p.recipeId })} sub={`${roleName(p.maker, v)} → ${roleName(p.customer, v)}`} />
    <p class="text">{p.status === 'pending' ? 'Ждёт согласия клиента' : p.status === 'completed' ? 'Изготовлено и передано' : 'Отменено'} · гонорар {p.fee}</p>
    {r && <p class="m-note">Материалы: {countsText({ ingredients: p.materials })}; в банк {p.bankGold}, мастеру {p.fee}, всего {p.bankGold + p.fee} золотых. Скидка и шипы уже учтены. {p.substitute && `Замена: ${INGREDIENTS.find(i => i.key === p.substitute?.from)?.name} → ${INGREDIENTS.find(i => i.key === p.substitute?.to)?.name}.`}</p>}
    {p.status === 'pending' && p.maker === v.me.role.key && <Button small kind="sec" onClick={() => void run({ type: 'hidden17.production.respond', id: p.id, accept: false })}>Отозвать предложение</Button>}
    {p.status === 'pending' && p.customer === v.me.role.key && <div class="m-btns"><Button small onClick={() => ask({ title: 'Принять изготовление?', text: 'С вас спишутся согласованные материалы, плата банку и гонорар. Готовая вещь сразу появится в сумке.', okLabel: 'Принять и оплатить', onOk: () => void run({ type: 'hidden17.production.respond', id: p.id, accept: true }) })}>Принять и оплатить</Button><Button small kind="sec" onClick={() => void run({ type: 'hidden17.production.respond', id: p.id, accept: false })}>Отказаться</Button></div>}
  </div>;
}
