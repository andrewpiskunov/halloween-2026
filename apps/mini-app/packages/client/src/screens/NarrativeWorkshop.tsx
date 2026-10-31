import { ItemText } from '../components/ItemText';
import { AbilityDescription, AbilityIdentity } from '../components/AbilityIdentity';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AbilityUse, HiddenProduction, Ingredient, PlayerView, Recipe } from '@fair/shared';
import { itemImageUrl, resourceImageUrl } from '../assets';
import { BASE } from '../base';
import { Button } from '../components/Button';
import { FrozenNote } from '../components/Frozen';
import { Select } from '../components/Select';
import { Stepper } from '../components/Stepper';
import { Thumb } from '../components/Thumb';
import { countsText, goldText, INGREDIENTS, ingredientName, roleName } from '../labels';
import { closePage, detailPage, openPage } from '../narrative-navigation';
import { abilityDraft, ask, run } from '../store';
import { AbilityForm, INLINE_WORKSHOP, sendAbility, sendCopy } from './AbilityForm';
import { people } from './HiddenCommon';
import { craftCost, craftPrice, type CraftMod } from './Workshop';
import '../narrative-commerce.css';

export function NarrativeWorkshop({v}:{v:PlayerView}) {
  const h=v.hidden17!; const page=detailPage.value; const detailed=page?.kind==='resource'||page?.kind==='recipe';
  const recipe=page?.kind==='recipe'?v.recipes.find(r=>r.id===page.id):undefined;
  const signature=page?.kind==='recipe'?h.signatureGoods.find(g=>g.id===page.id&&g.maker===v.me.role.key):undefined;
  const ingredient=page?.kind==='resource'?INGREDIENTS.find(i=>i.key===page.id):undefined;
  const block=useRef<HTMLDivElement>(null); const draft=abilityDraft.value;
  useEffect(()=>{if(!draft)return; block.current?.scrollIntoView({block:'start'}); abilityDraft.value=null;},[draft]);
  return <div class="narrative-commerce">
    <div hidden={detailed}>
      <div class="nc-place"><img src={`${BASE}assets/scenes/workshop.webp`} alt="Мастерская ярмарки" onError={e=>{e.currentTarget.hidden=true;}}/><div><span>У огня и верстака</span><h2>Мастерская</h2><p><ItemText>Материалы для ваших замыслов и работа умелых рук.</ItemText></p></div></div>
      <FrozenNote v={v}/><h3>Запас мастера</h3><p class="nc-intro"><ItemText>Покупка — 2 золотых. Мастер выкупает свободный материал за 1 золотой.</ItemText></p>
      <div class="nc-stock">{INGREDIENTS.map(i=><button class="nc-stock-card" type="button" key={i.key} onClick={()=>openPage({kind:'resource',id:i.key})}><Thumb src={resourceImageUrl(i.key)} emoji={i.emoji}/><span><b>{i.name}</b><strong>В запасе: {v.workshop[i.key]}</strong><small>Купить · 2 / продать · 1</small></span><span aria-hidden="true">→</span></button>)}</div>
      <div ref={block}><WorkshopAbility v={v}/></div>
      <h3>Изделия на заказ</h3><div class="nc-recipe-grid">{v.recipes.map(r=><div class="nc-recipe-card" key={r.id}><Thumb src={itemImageUrl({kind:'potion',ref:r.id})} emoji={r.emoji}/><h4>{r.name}</h4><button type="button" class="m-btn sec" onClick={()=>openPage({kind:'recipe',id:r.id})}>Заказать</button></div>)}</div>
      {h.signatureGoods.some(g=>g.maker===v.me.role.key)&&<><h3>Ваши авторские изделия</h3><div class="nc-recipe-grid">{h.signatureGoods.filter(g=>g.maker===v.me.role.key).map(g=><div class="nc-recipe-card" key={g.id}><Thumb src={itemImageUrl({kind:'special',ref:g.id})} emoji="✦"/><h4>{g.name}</h4><button type="button" class="m-btn sec" onClick={()=>openPage({kind:'recipe',id:g.id})}>Изготовить</button></div>)}</div></>}
      {!!h.production.length&&<section><h3>Заказы героям</h3>{[...h.production].reverse().map(p=><ProductionCard key={p.id} p={p} v={v}/>)}</section>}
      <details class="m-card"><summary>Правила мастерской</summary><ul class="list">{(h.narrative?.craftingRules??h.craftingRules).map(s=><li key={s}><ItemText>{s}</ItemText></li>)}</ul></details>
    </div>
    {detailed&&<button type="button" class="nc-back" onClick={closePage}>← Назад в мастерскую</button>}
    {/* Страницы остаются смонтированы: возврат к списку не стирает количество и условия заказа. */}
    {INGREDIENTS.map(i=><div key={i.key} hidden={ingredient?.key!==i.key}><ResourcePage ingredient={i.key} v={v}/></div>)}
    {v.recipes.map(r=><div key={r.id} hidden={recipe?.id!==r.id}><RecipePage r={r} v={v}/></div>)}
    {h.signatureGoods.filter(g=>g.maker===v.me.role.key).map(g=><div key={g.id} hidden={signature?.id!==g.id}><SignaturePage id={g.id} v={v}/></div>)}
    {detailed&&!ingredient&&!recipe&&!signature&&<div class="m-card"><h2>Заказ недоступен</h2><p class="text"><ItemText>Выберите доступное изделие или материал в мастерской.</ItemText></p></div>}
  </div>;
}
function WorkshopAbility({v}:{v:PlayerView}) {
  const a=v.me.ability; if(a.place!=='workshop')return null;
  return <section class="m-card nc-ability"><AbilityIdentity roleKey={v.me.role.key} name={a.name}/><AbilityDescription origin={v.hidden17?.narrative?.role.abilityOrigin} text={a.text}/>{a.state!=='available'?<p class="m-note"><ItemText>{a.state==='used'?'Дар уже использован в этом акте.':'Сейчас дар недоступен.'}</ItemText></p>:INLINE_WORKSHOP.includes(a.kind)?<p class="m-note"><ItemText>Выберите материал или изделие ниже: подходящий дар будет доступен на его странице.</ItemText></p>:<AbilityForm v={v}/>}</section>;
}
function ResourcePage({ingredient:key,v}:{ingredient:Ingredient;v:PlayerView}) {
  const ing=INGREDIENTS.find(i=>i.key===key)!;const [count,setCount]=useState(1);const a=v.me.available; const ab=v.me.ability;
  const buy=()=>ask({title:`Купить ${ing.name} ×${count}?`,text:`Плата мастеру: ${goldText(count*2)}.`,okLabel:'Купить',onOk:()=>void run({type:'shop.buy',ingredient:key,count})});
  const sell=()=>ask({title:`Продать ${ing.name} ×${count}?`,text:`Вы получите ${goldText(count)}. Материал пополнит запас мастерской.`,okLabel:'Продать',onOk:()=>void run({type:'narrative.sell',ingredient:key,count})});
  return <article class="m-card nc-detail"><Thumb src={resourceImageUrl(key)} emoji={ing.emoji}/><h2>{ing.name}</h2><p class="text"><ItemText>Базовый материал для изделий мастерской. Его можно обменять с другим героем или продать мастеру.</ItemText></p><div class="nc-stock-count">У мастера <b>{v.workshop[key]}</b><span>У вас свободно: {a.ingredients[key]}</span></div><FrozenNote v={v}/><div class="nc-resource-edit"><span>Количество</span><Stepper label="Количество материала" min={1} max={99} value={count} onChange={setCount}/></div><p class="text"><ItemText>Купить: <b>{goldText(count*2)}</b><br/>Продать: <b>{goldText(count)}</b></ItemText></p><div class="nc-actions"><Button disabled={v.workshop[key]<count||a.gold<count*2||v.clock.paused} onClick={buy}>Купить</Button><Button kind="sec" disabled={a.ingredients[key]<count||v.clock.paused} onClick={sell}>Продать мастеру</Button></div>{v.workshop[key]===0&&<p class="m-note"><ItemText>Запас закончился. Проданные героями материалы возвращаются сюда.</ItemText></p>}{ab.state==='available'&&(ab.kind==='buyCheap'||ab.kind==='buyFromBank')&&<section><AbilityIdentity roleKey={v.me.role.key} name={ab.name}/><AbilityDescription origin={v.hidden17?.narrative?.role.abilityOrigin} text={ab.text}/><Button disabled={v.clock.paused||a.gold<(ab.kind==='buyCheap'?1:2)||(ab.kind==='buyCheap'&&v.workshop[key]<1)} onClick={()=>sendAbility({kind:ab.kind as 'buyCheap'|'buyFromBank',ingredient:key},{title:`Купить одну порцию «${ing.name}» с помощью дара?`,text:`Цена: ${ab.kind==='buyCheap'?1:2} золотых. Дар расходуется на этот акт.`})}>{ab.kind==='buyCheap'?'Купить 1 за 1 золотой':'Купить 1 из банка за 2 золотых'}</Button></section>}</article>;
}
function RecipePage({r,v}:{r:Recipe;v:PlayerView}) {
  const canMake=v.hidden17!.productionRecipes.includes(r.id);const [maker,setMaker]=useState(canMake);const [customer,setCustomer]=useState(v.me.role.key);const [fee,setFee]=useState(0);const [gift,setGift]=useState(false);
  const [from,setFrom]=useState<Ingredient>(INGREDIENTS.find(i=>r.cost[i.key])?.key??'ash');const [to,setTo]=useState<Ingredient>(from==='moon'?'ash':'moon');
  const a=v.me.ability;const copy=a.kind==='copyAbility';const substitution=a.kind==='substituteIngredient'||(copy&&!!a.copy?.some(c=>c.kind==='substituteIngredient'));
  // Только собственные производственные дары поддерживаются заказом для клиента.
  const giftKind=maker?(a.kind==='focusFree'&&r.id==='focus'?'focusFree':a.kind==='substituteIngredient'?'substituteIngredient':null):(a.kind==='payAshWithGold'&&r.cost.ash?'payAshWithGold':a.kind==='focusFree'&&r.id==='focus'?'focusFree':substitution?'substituteIngredient':null);
  const usingGift=gift&&a.state==='available'&&!!giftKind;
  const mod:CraftMod=usingGift?(giftKind==='payAshWithGold'?{ashByGold:true}:giftKind==='focusFree'?{freeWork:true}:{substitute:{from,to}}):{};
  const cost=craftCost(r,mod);const price=craftPrice(r,v,mod);const own=!maker||customer===v.me.role.key;
  const enough=(!own||v.me.available.gold>=price&&INGREDIENTS.every(i=>v.me.available.ingredients[i.key]>=(cost[i.key]??0)))&&(!usingGift||giftKind!=='substituteIngredient'||from!==to);
  const label=maker?(own?'Изготовить':'Предложить клиенту'):usingGift?'Заказать с помощью дара':'Заказать у мастера';
  const submit=()=>{
    const title=`${label}: ${r.name}?`;const text=own?`Спишется: ${countsText({gold:price,ingredients:cost})}.`:`${roleName(customer,v)} подтвердит материалы, плату мастерской и ваш гонорар ${goldText(fee)}. Итоговая цена учитывает его скидку и шипы.`;
    if(maker){ask({title,text,okLabel:label,onOk:()=>void run({type:'hidden17.produce',recipeId:r.id,customer,fee:own?0:fee,...(usingGift?{ability:giftKind as 'focusFree'|'substituteIngredient',...(giftKind==='substituteIngredient'?{substitute:{from,to}}:{})}:{})})});return;}
    if(usingGift){const use:AbilityUse=giftKind==='payAshWithGold'?{kind:'payAshWithGold',recipeId:r.id}:giftKind==='focusFree'?{kind:'focusFree'}:{kind:'substituteIngredient',recipeId:r.id,from,to};if(copy&&use.kind==='substituteIngredient')sendCopy(v,use,{title,text});else sendAbility(use,{title,text});return;}
    ask({title,text,okLabel:'Заказать',onOk:()=>void run({type:'shop.craft',recipeId:r.id})});
  };
  return <article class="m-card nc-detail"><Thumb src={itemImageUrl({kind:'potion',ref:r.id})} emoji={r.emoji}/><h2>{r.name}</h2><p class="text"><ItemText>{r.text}</ItemText></p><FrozenNote v={v}/>
    {canMake&&<div class="nc-mode" role="group" aria-label="Кто изготовит"><button type="button" class={maker?'on':''} onClick={()=>{setMaker(true);setGift(false);}}>Моё ремесло</button><button type="button" class={!maker?'on':''} onClick={()=>{setMaker(false);setGift(false);}}>Заказ мастеру</button></div>}
    {maker&&<><ol class="nc-craft-steps"><li><Thumb src={resourceImageUrl('ash')} emoji="✦"/><span>Принесите материалы</span></li><li><Thumb src={resourceImageUrl('gold')} emoji="◉"/><span>Оплатите мастерскую</span></li><li><Thumb src={itemImageUrl({kind:'potion',ref:r.id})} emoji={r.emoji}/><span>Изготовьте товар</span></li></ol><label class="field"><span>Чьи материалы и кому товар</span><Select label="Клиент ремесленника" value={customer} onChange={setCustomer} options={people(v)}/></label>{!own&&<div class="nc-resource-edit"><span>Ваш гонорар</span><Stepper label="Гонорар ремесленника" value={fee} min={0} max={99} onChange={setFee}/></div>}</>}
    {a.state==='available'&&giftKind&&<section class="nc-gift"><AbilityIdentity roleKey={v.me.role.key} name={a.name}/><AbilityDescription origin={v.hidden17?.narrative?.role.abilityOrigin} text={<>{giftKind==='payAshWithGold'?'Одна порция пепла заменяется одним золотым.':giftKind==='focusFree'?'Плата за работу снижена на один золотой.':'Одна порция ингредиента заменяется другой.'} Дар — раз в акт.</>}/><label class="nc-item-choice"><input type="checkbox" checked={usingGift} onChange={e=>setGift(e.currentTarget.checked)}/><span>Помочь даром «{a.name}»</span></label>{usingGift&&giftKind==='substituteIngredient'&&<><label class="field"><span>Вместо</span><Select label="Заменяемый ингредиент" value={from} onChange={x=>{setFrom(x as Ingredient);if(x===to)setTo(INGREDIENTS.find(i=>i.key!==x)!.key);}} options={INGREDIENTS.filter(i=>r.cost[i.key]).map(i=>({value:i.key,label:i.name}))}/></label><label class="field"><span>Использовать</span><Select label="Ингредиент для замены" value={to} onChange={x=>setTo(x as Ingredient)} options={INGREDIENTS.filter(i=>i.key!==from).map(i=>({value:i.key,label:i.name}))}/></label></>}</section>}
    <h3>Материалы</h3><div class="nc-materials">{INGREDIENTS.filter(i=>cost[i.key]).map(i=><div key={i.key}><Thumb src={resourceImageUrl(i.key)} emoji={i.emoji}/><b>{i.name}</b><span>Нужно {cost[i.key]}{own?` / у вас ${v.me.available.ingredients[i.key]}`:' · материалы клиента'}</span></div>)}</div>
    <section class="nc-total"><h3>{maker?'Использование мастерской':'Работа мастера'}</h3>{own?<p class="text"><ItemText><b>{goldText(price)}</b> · у вас {goldText(v.me.available.gold)}</ItemText></p>:<p class="text"><ItemText>Базовая плата: {goldText(r.gold-(usingGift&&giftKind==='focusFree'?1:0))}. Гонорар: {goldText(fee)}. Скидку и шипы клиента сервер учтёт до его согласия.</ItemText></p>}{!enough&&<p class="m-note warn"><ItemText>Не хватает свободных материалов или золота.</ItemText></p>}{!own&&<p class="m-note"><ItemText>Клиент отдельно подтвердит весь расход. Готовая вещь будет передана сразу после согласия.</ItemText></p>}<Button disabled={!enough||!customer||v.clock.paused} onClick={submit}>{label}</Button>{v.clock.paused&&<p class="m-note"><ItemText>На паузе новые заказы подождут.</ItemText></p>}</section>
  </article>;
}
function SignaturePage({id,v}:{id:string;v:PlayerView}) {
  const g=v.hidden17!.signatureGoods.find(x=>x.id===id)!; const enough=v.me.available.gold>=g.gold&&INGREDIENTS.every(i=>v.me.available.ingredients[i.key]>=(g.cost[i.key]??0));
  return <article class="m-card nc-detail"><Thumb src={itemImageUrl({kind:'special',ref:g.id})} emoji="✦"/><h2>{g.name}</h2><p class="text"><ItemText>{g.effect}</ItemText></p><p class="text"><ItemText>{g.limits}</ItemText></p><h3>Материалы и мастерская</h3><div class="nc-materials">{INGREDIENTS.filter(i=>g.cost[i.key]).map(i=><div key={i.key}><Thumb src={resourceImageUrl(i.key)} emoji={i.emoji}/><b>{i.name}</b><span>Нужно {g.cost[i.key]} / у вас {v.me.available.ingredients[i.key]}</span></div>)}</div><p class="text"><ItemText>Использование мастерской: {goldText(g.gold)}.</ItemText></p><p class="m-note"><ItemText>Авторское изделие — раз в акт. Цена фиксирована; скидка, шипы и обычный дар не используются.</ItemText></p><Button disabled={!enough||v.clock.paused} onClick={()=>ask({title:`Изготовить «${g.name}»?`,text:`Спишется: ${countsText({gold:g.gold,ingredients:g.cost})}.`,okLabel:'Изготовить',onOk:()=>void run({type:'hidden17.signature.craft',recipeId:g.id})})}>Изготовить авторский товар</Button></article>;
}
function ProductionCard({p,v}:{p:HiddenProduction;v:PlayerView}) {
  const r=v.recipes.find(r=>r.id===p.recipeId);
  return <article class="m-card"><h4>{r?.name??p.recipeId}</h4><p class="text"><ItemText>{roleName(p.maker,v)} → {roleName(p.customer,v)}</ItemText></p><p class="nc-status"><ItemText>{p.status==='pending'?'Ждёт согласия клиента':p.status==='completed'?'Изготовлено и передано':'Отменено'}</ItemText></p><p class="text"><ItemText>Материалы: {countsText({ingredients:p.materials})}. Мастерская: {p.bankGold}, гонорар: {p.fee}, всего {goldText(p.bankGold+p.fee)}.</ItemText></p>{p.substitute&&<p class="m-note"><ItemText>Замена: {ingredientName(p.substitute.from)} → {ingredientName(p.substitute.to)}.</ItemText></p>}{p.status==='pending'&&p.maker===v.me.role.key&&<Button kind="sec" onClick={()=>void run({type:'hidden17.production.respond',id:p.id,accept:false})}>Отозвать предложение</Button>}{p.status==='pending'&&p.customer===v.me.role.key&&<div class="nc-actions"><Button disabled={v.clock.paused} onClick={()=>ask({title:'Принять изготовление?',text:`Спишется: ${countsText({ingredients:p.materials,gold:p.bankGold+p.fee})}. Готовая вещь сразу появится в вашей сумке.`,okLabel:'Принять и оплатить',onOk:()=>void run({type:'hidden17.production.respond',id:p.id,accept:true})})}>Принять и оплатить</Button><Button kind="sec" onClick={()=>void run({type:'hidden17.production.respond',id:p.id,accept:false})}>Отказаться</Button></div>}</article>;
}
