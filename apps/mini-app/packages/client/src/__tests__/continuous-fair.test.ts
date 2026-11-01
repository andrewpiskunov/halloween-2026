import { expect, test } from 'vitest';
import type { Item, PlayerView } from '@fair/shared';
import { specialLabel } from '../screens/HiddenCommon';
import { marksText, ownActionText } from '../labels';
const view = (fair = true) => ({
 me: {role:{key:'o1', name:'Серафина'},player:{protection:{source:'ward'}},items:[],available:{items:[]}}, others:[], public:{roles:[],relics:[]}, recipes:[],
 hidden17:{...(fair?{fair:{version:1}}:{}),prepared:{blood:{method:'sign',controller:'o1'}},knownItems:{}},
}) as unknown as PlayerView;
test('бутылёк сохраняет имя донора, неизвестный бутылёк не раскрывает его',()=>{
 const v=view();
 expect(specialLabel({id:'blood',kind:'special',ref:'blood-vial'} as Item,v)).toBe('Бутылёк крови · Отметка: Серафина');
 expect(specialLabel({kind:'special',ref:'blood-vial'},v)).toBe('Бутылёк крови');
 expect(specialLabel({kind:'special',ref:'inscribed-focus'},view(false))).toBe('Фокус с начертанными линиями');
});
test('на показанном бутыле видно имя донора, а не нынешнего владельца',()=>{
 const v=view();
 v.hidden17!.prepared={};
 v.others=[{roleKey:'o5',name:'Вельда',guise:'Странница'}] as PlayerView['others'];
 v.hidden17!.knownItems.blood={kind:'special',ref:'blood-vial',owner:'o1',bloodDonor:'o5'};
 expect(specialLabel({id:'blood',kind:'special',ref:'blood-vial'},v)).toBe('Бутылёк крови · Отметка: Вельда');
});
test('в новой редакции защита и журнал описывают обновление сил, прежняя партия сохраняет акты',()=>{
 expect(marksText(view())[0].value).toBe('от талисмана, до обновления сил');
 expect(marksText(view(false))[0].value).toBe('от талисмана, до конца акта');
 const action={id:'test',at:0,hostile:false,effects:[],act:1,source:{type:'ability',ability:'protectSelf'},author:'o1',target:'o1',outcome:'done'} as Parameters<typeof ownActionText>[0];
 expect(ownActionText(action,view())).toBe('Защита себе: исполнено');
});

import * as rules from '../rules';
test('наблюдатель закрытого обряда не получает ни одного управления, прежняя партия сохраняет действия',()=>{
 const controls=rules.ritualControls;
 const observer=view();observer.hidden17!.fair!.canParticipate=false;
 expect(controls(observer)).toBe(false);
 observer.hidden17!.fair!.canParticipate=true;
 expect(controls(observer)).toBe(true);
 expect(controls(view(false))).toBe(true);
});

test('к началу обряда подходят только присутствующие с наступившим действующим личным допуском',()=>{
 const v={state:{players:{a:{present:true},b:{present:true},c:{present:true},d:{present:false},e:{present:true}},story:{requests:{qa:{author:'a',status:'done'},qb:{author:'b',status:'cancelled'},qc:{author:'other',status:'pending'},qd:{author:'d',status:'pending'},qe:{author:'e',status:'pending'}}},hidden17:{fair:{admissions:{a:{requestId:'qa',at:100},b:{requestId:'qb',at:100},c:{requestId:'qc',at:100},d:{requestId:'qd',at:100},e:{requestId:'qe',at:201},missing:{requestId:'missing',at:100}}}}}} as unknown as import('@fair/shared').GmView;
 const ready=rules.readyAdmissions;
 expect(ready(v,200)).toEqual(['a']);
});
