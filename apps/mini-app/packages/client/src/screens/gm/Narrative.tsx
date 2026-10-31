import { ItemText } from '../../components/ItemText';
import { useState } from 'preact/hooks';
import type { GmView, GoalEvaluation, GoalStatus, RitualKnowledge } from '@fair/shared';
import { Button } from '../../components/Button';
import { Select } from '../../components/Select';
import { ask, loadedContent, run } from '../../store';

const STATUS: Record<GoalStatus | 'unassessed', string> = {
  unassessed: 'Ещё не оценена', achieved: 'Достигнута', partial: 'Частичный результат', 'not-achieved': 'Не достигнута',
};
const KNOWLEDGE: {value: RitualKnowledge; label: string; text: string}[] = [
  {value:'place',label:'Узнал, где похоронен Сарн',text:'Герой узнает в руинах могилу Сарна. Это не открывает ему способ возвращения дракона.'},
  {value:'joining',label:'Узнал, как соединить сердце',text:'Герой сможет прочитать способ соединения частей сердца. Тайные способы вмешаться в обряд этим не раскрываются.'},
];
const who = (key: string) => loadedContent().roles.find(r=>r.key===key)?.name??key;
const roleOptions = (v: GmView) => v.state.roster.map(key=>({value:key,label:who(key),avatar:key}));

/** Явный переход старой партии; остаётся в управлении составом. */
export function GmNarrativeMigration({v}:{v:GmView}) {
  const h=v.state.hidden17;const data=loadedContent().hidden17?.narrative;
  if(!h||!data)return null;
  if(!h.narrative){
    const offers=Object.values(v.state.offers).filter(o=>o.status==='pending').length;
    const board=Object.values(h.board).filter(o=>o.status==='open'||o.status==='accepted').length;
    const production=Object.values(h.production).filter(o=>o.status==='pending').length;
    const dice=Object.values(h.dice).filter(o=>o.status==='pending'||o.status==='accepted').length;
    const started=Object.values(h.dice).filter(o=>o.status==='started');
    const finale=h.ritual.step!=='preparation'||v.state.phase==='closed'||v.state.phase==='revealed';
    return <section class="m-card"><h3>Переход к сюжетной редакции</h3><p class="text"><ItemText>Личные истории и документы, согласованные обмены и оценки стремлений ведущим. Инвентарь, золото и привязки сохраняются. Новые стремления не наследуют прежние механические оценки.</ItemText></p>
      <p class="text"><ItemText>Незавершённые сделки: <b>{offers}</b>. Объявления с резервом: <b>{board}</b>. Заказы героям: <b>{production}</b>. Приглашения в кости: <b>{dice}</b>. Начатые броски: <b>{started.length}</b>.</ItemText></p>
      <p class="m-note"><ItemText>При переходе обычные предложения отменятся, резервы вернутся одновременно. Способ обряда получат только герои с соответствующими личными источниками. Узнанное в живых сценах можно открыть отдельно в «Сюжете». Исходы прежней редакции не пересчитываются.</ItemText></p>
      {started.length>0&&<p class="m-note warn"><ItemText>Сначала завершите или урегулируйте начатые броски: {started.map(d=>`${who(d.from)} — ${who(d.to)}`).join('; ')}.</ItemText></p>}
      {finale&&<p class="m-note warn"><ItemText>Финал уже начат или итоги зафиксированы. Завершите эту партию в прежней редакции; сюжетная редакция доступна для следующей.</ItemText></p>}
      <Button disabled={finale||started.length>0} onClick={()=>ask({title:'Перевести эту партию в сюжетную редакцию?',text:`Будут отменены сделки (${offers}), объявления с резервом (${board}), заказы (${production}) и приглашения в кости (${dice}). Их резервы вернутся. Новые стремления потребуют оценки ведущим.`,okLabel:'Перевести партию',onOk:()=>void run({type:'narrative.enable'})})}>Включить сюжетную редакцию</Button>
    </section>;
  }
  return null;
}

/** Адресная передача сведений после живой сцены. */
export function GmNarrativePanel({v}:{v:GmView}) {
  const h=v.state.hidden17;const data=loadedContent().hidden17?.narrative;
  const [player,setPlayer]=useState('');const [knowledge,setKnowledge]=useState<RitualKnowledge>('place');const [documentId,setDocumentId]=useState('');
  if(!h?.narrative||!data)return null;
  const n=h.narrative; const known=player?n.knowledge[player]??[]:[];const chosen=KNOWLEDGE.find(k=>k.value===knowledge)!;
  const doc=data.documents.find(d=>d.id===documentId);const holder=!!doc&&doc.holders.includes(player);const shared=!!doc&&(n.documentAccess[player]??[]).includes(doc.id);
  const docsOpen=['act1','act2','act3'].includes(v.state.phase)&&h.ritual.step==='preparation'&&v.state.clock.pausedAt===undefined;
  return <details class="m-card"><summary>Передать герою сведения</summary><p class="m-note"><ItemText>После разговора или находки откройте герою то, что он узнал. Если игрок показал ему документ через приложение, сведения откроются автоматически.</ItemText></p>
    <details class="gm-inspection-guide"><summary>Как провести осмотр заставы</summary><ol class="list"><li>Уточните, что герой осматривает и каким способом. Нескольким героям можно провести одну общую сцену.</li><li>При осмотре плиты дайте наблюдение: старое сооружение, следы погребения. Если герой установил, что это могила Сарна, подтвердите «Узнал, где похоронен Сарн».</li><li>Сам осмотр не открывает рецепт возвращения. Способ узнают из личных документов Вельды или Астры либо из отдельной сцены находки, подготовленной ведущим.</li><li>Выберите участника сцены и подтвердите только полученные сведения. Повторите для остальных. Ответ на заявку запишите в её карточке.</li></ol><p class="m-note">Если носителей способа нет, в отдельной сцене можно дать найденную копию расчёта Орвика. Перед показом проверьте весь текст: некоторые личные документы раскрывают дополнительные тайны.</p></details>
    <div class="field"><span>Герой</span><Select label="Герой для сюжетных знаний" value={player} onChange={value=>{setPlayer(value);setDocumentId('');setKnowledge('place');}} placeholder="Выберите героя" options={roleOptions(v)}/></div>
    {player&&<><p class="text"><ItemText>Известно: {KNOWLEDGE.filter(k=>known.includes(k.value)).map(k=>k.label).join('; ')||'эти сведения ещё не открыты'}.</ItemText></p>
    <div class="field"><span>Знание</span><Select label="Сюжетное знание" value={knowledge} onChange={x=>setKnowledge(x as RitualKnowledge)} options={KNOWLEDGE.map(k=>({value:k.value,label:k.label}))}/></div><p class="text"><ItemText>{chosen.text}</ItemText></p>
    <Button disabled={!player||known.includes(knowledge)} onClick={()=>ask({title:`Подтвердить знание: ${who(player)}?`,text:chosen.text+' Запись останется в журнале.',okLabel:'Подтвердить знание',onOk:()=>void run({type:'narrative.knowledge',player,knowledge})})}>{known.includes(knowledge)?'Знание уже подтверждено':'Подтвердить знание'}</Button>
    <h4>Показать источник</h4><div class="field"><span>Документ</span><Select label="Сюжетный документ" value={documentId} onChange={setDocumentId} placeholder="Выберите источник" options={data.documents.map(d=>({value:d.id,label:d.title,hint:d.source}))}/></div>
    {doc&&<><p class="m-note"><ItemText>{doc.source}</ItemText></p><details><summary>Текст, который увидит герой</summary><p class="text" style={{whiteSpace:'pre-wrap'}}><ItemText>{doc.text}</ItemText></p></details><p class="m-note"><ItemText>Показ не передаёт документ во владение. Герой узнает описанные в нём способы. Отзыв убирает доступ к тексту, но не стирает уже полученное знание.</ItemText></p>{holder?<p class="text"><ItemText>Это личный источник героя. Его исходный доступ сохраняется.</ItemText></p>:<Button disabled={!player||!docsOpen} kind={shared?'sec':'main'} onClick={()=>ask({title:shared?`Прекратить показ для ${who(player)}?`:`Показать «${doc.title}» герою ${who(player)}?`,text:shared?'Герой потеряет доступ к тексту. Уже подтверждённое знание сохранится.':`Герой увидит полный текст выбранного документа. Источник: ${doc.source}.`,okLabel:shared?'Прекратить показ':'Показать документ',onOk:()=>void run({type:'narrative.document.show',documentId:doc.id,player,allow:!shared})})}>{shared?'Прекратить показ документа':'Показать документ'}</Button>}</>}
    {!docsOpen&&<p class="m-note"><ItemText>Показ документов доступен во время активного акта до начала финала.</ItemText></p>}
    </>}
  </details>;
}

/** Четыре состояния оценки сохраняются без преобразования к прежним boolean-целям. */
export function GmNarrativeGoals({v}:{v:GmView}) {
  const n=v.state.hidden17?.narrative;const data=loadedContent().hidden17?.narrative;const [player,setPlayer]=useState(v.state.roster[0]??'');
  if(!n||!data)return null;
  const role=data.roles[player];const evaluations=n.evaluations[player]??{};
  const assessed=v.state.roster.reduce((count,k)=>count+Object.keys(n.evaluations[k]??{}).length,0);
  return <section class="m-card"><h3>Стремления героев</h3><p class="text"><ItemText>Оценено {assessed} из {v.state.roster.length*2}. Отсутствие оценки означает «ещё не оценена». Учитывайте поступки, договорённости и личный эпилог.</ItemText></p><p class="m-note"><ItemText>После раскрытия итогов игрок видит только свои оценки и пояснения. Исправления сохраняются в журнале.</ItemText></p>
    <div class="field"><span>Чьи стремления оценить</span><Select label="Герой для оценки стремлений" value={player} onChange={setPlayer} options={roleOptions(v)}/></div>
    {role?([0,1] as const).map(goal=><GoalEditor key={`${player}:${goal}:${evaluations[goal]?.status??''}:${evaluations[goal]?.note??''}`} player={player} goal={goal} text={role.goals[goal]} criteria={role.gmGoals[goal]} evaluation={evaluations[goal]}/>):<p class="m-note"><ItemText>Для этого героя нет сюжетной вводной.</ItemText></p>}
  </section>;
}
function GoalEditor({player,goal,text,criteria,evaluation}:{player:string;goal:0|1;text:string;criteria:string;evaluation?:GoalEvaluation}) {
  const [status,setStatus]=useState<GoalStatus|'unassessed'>(evaluation?.status??'unassessed');const [note,setNote]=useState(evaluation?.note??'');const [saving,setSaving]=useState(false);
  const unchanged=status===(evaluation?.status??'unassessed')&&(status==='unassessed'||note.trim()===(evaluation?.note??''));
  const save=async()=>{setSaving(true);await run({type:'narrative.goal',player,goal,evaluation:status==='unassessed'?null:{status,note:note.trim()}});setSaving(false);};
  return <article style={{borderTop:'1px solid rgba(128,112,91,.4)',marginTop:'24px',paddingTop:'16px'}}><h4>Стремление {goal+1}</h4><p class="text"><ItemText>{text}</ItemText></p><details><summary>Ориентиры ведущему</summary><p class="text"><ItemText>{criteria}</ItemText></p></details><p class="m-note"><ItemText>Сохранённая оценка: {STATUS[evaluation?.status??'unassessed']}.</ItemText></p>
    <div class="field"><span>Результат</span><Select label={`Результат стремления ${goal+1}`} value={status} onChange={x=>setStatus(x as GoalStatus|'unassessed')} options={(Object.keys(STATUS) as (GoalStatus|'unassessed')[]).map(key=>({value:key,label:STATUS[key]}))}/></div>
    {status!=='unassessed'&&<label class="field"><span>Пояснение игроку</span><textarea aria-label={`Пояснение стремления ${goal+1}`} rows={4} maxLength={1200} value={note} onInput={e=>setNote(e.currentTarget.value)} style={{width:'100%',boxSizing:'border-box',font:'inherit',padding:'12px',resize:'vertical'}}/></label>}
    <Button disabled={saving||unchanged||(status!=='unassessed'&&!note.trim())} onClick={()=>ask({title:`Сохранить оценку для ${who(player)}?`,text:`Стремление ${goal+1}: ${STATUS[status]}.${status==='unassessed'?' Прежняя оценка будет снята.':` ${note.trim()}`}`,okLabel:'Сохранить оценку',onOk:()=>void save()})}>{status==='unassessed'?'Снять оценку':'Сохранить оценку'}</Button>
  </article>;
}
