import { navigateTab } from '../narrative-navigation';
import { StoryCards, StoryInvite } from './Story';
import { useState } from 'preact/hooks';
import type { ActionRecord, AltarSide, Intel, PlayerView } from '@fair/shared';
import { itemImageUrl, resourceImageUrl } from '../assets';
import { Button } from '../components/Button';
import { Portrait } from '../components/Portrait';
import { Thumb } from '../components/Thumb';
import { GOLD, INGREDIENTS, goldText, ingredientName, itemLabel, mmss, ownActionText, roleEmoji, roleName, roman, waitingFor } from '../labels';
import { canChooseSide, gameFrozen, remainingMs } from '../rules';
import { abilityDraft, ask, now, run, tab } from '../store';
import { AbilityForm } from './AbilityForm';

/** Моя роль: карта-таро, сторона, цели, тайна, предыстория, способность, контакты, слух и подсказки по отыгрышу. */
export function Role({ v }: { v: PlayerView }) {
  const r = v.me.role;
  const side = v.public.factions.find(f => f.id === r.side);
  return (
    <>
      <div class="tarot paper">
        <div class="num" aria-label={`Карта ${r.pos}`}>{roman(r.pos)}</div>
        {/* Единственный портрет с фильтром на экране */}
        <Portrait roleKey={r.key} emoji={r.emoji} size="card" tint />
        <h3>{r.name}</h3>
        <p>{r.title}</p>
        {v.me.player.guise && <p class="guise">Ваш облик: {v.me.player.guise.name}</p>}
      </div>
      {side && (
        <div class="side-line" style={{ '--side': side.color }}>
          <i aria-hidden="true" /><span>{side.name}. {side.motto}</span>
        </div>
      )}
      {!v.hidden17 && <SideChoice v={v} />}
      {v.hidden17 && <div class="m-card hidden-intro"><h5>Только ваша история</h5><p class="text">{v.hidden17.briefing.publicFace}</p><p class="m-note">Ваши цели и знания видите только вы. Раскрывайте их в разговорах по своему выбору.</p></div>}
      {v.hidden17 && <details class="m-card"><summary>Общие правила ярмарки</summary><ul class="list">{v.hidden17.publicRules.map(t => <li key={t}>{t}</li>)}</ul></details>}
      <StoryInvite />
      <StoryCards v={v} />
      {!v.hidden17 && r.intro && <p class="lead">{r.intro}</p>}

      <div class="m-card">
        <h5>Ваши цели</h5>
        <ul class="goals">
          {v.me.goals.map((g, i) => (
            <li key={i} class={g.done ? 'done' : ''}>
              <span>
                {g.text}
                <small class="goal-state">{g.done ? '✓ выполнено' : gameFrozen(v) ? 'не выполнено' : 'пока нет'}{g.byGm && ' · отмечено ведущим'}</small>
              </span>
            </li>
          ))}
        </ul>
        {!gameFrozen(v) && <p class="m-note">Считается при закрытии ярмарки</p>}
      </div>

      <div class="secret">
        <span class="seal" aria-hidden="true">✠</span>
        <b>Тайна, видите только вы</b>
        <p>{r.secret}</p>
      </div>

      <div class="m-card">
        <h5>Предыстория</h5>
        <p class="text">{r.backstory}</p>
        <h5>Мотивация</h5>
        <p class="text">{r.motivation}</p>
      </div>

      {v.hidden17 && <>
        <div class="m-card"><h5>Что вы знаете</h5><ul class="list">{v.hidden17.briefing.knowledge.map(t => <li key={t}>{t}</li>)}</ul></div>
        <div class="m-card"><h5>С чего начать</h5><ol class="list">{v.hidden17.briefing.firstSteps.map(t => <li key={t}>{t}</li>)}</ol></div>
        <section class="m-card finale-guide" aria-labelledby="finale-guide-title">
          <h5 id="finale-guide-title">Что вы можете сделать в финале</h5>
          <p class="m-note">Ваша личная памятка к обряду у могилы Сарна. Вы сами решаете, как поступить.</p>
          <dl>
            <dt>Подготовка</dt><dd>{v.hidden17.briefing.finale.prepare}</dd>
            <dt>Действия у могилы</dt><dd>{v.hidden17.briefing.finale.action}</dd>
            <dt>Личный выбор</dt><dd>{v.hidden17.briefing.finale.choice}</dd>
            <dt>Возможные последствия</dt><dd>{v.hidden17.briefing.finale.impact}</dd>
          </dl>
          <p class="m-note">Кнопки обряда находятся во вкладке «Ритуал». Для просьбы к Сарну или другой сюжетной сцены обратитесь к ведущему.</p>
        </section>
      </>}
      {gameFrozen(v) ? <ClosedCard v={v} /> : <AbilityCard v={v} />}
      <IntelCard v={v} />
      <UsesCard v={v} />

      {v.contacts.length > 0 && <div class="m-card">
        <h5>Контакты</h5>
        {v.contacts.map((c, i) => (
          <div class="item" key={i}>
            {c.role ? <Portrait roleKey={c.role} emoji={roleEmoji(c.role, v)} size="sm" /> : <span class="portrait sm" aria-hidden="true">☉</span>}
            <div class="item-text">
              {c.name && <b>{c.name}{c.absent && <span class="m-tag warn">не на ярмарке</span>}</b>}
              <span>{c.text}</span>
            </div>
          </div>
        ))}
      </div>}

      {r.rumor.trim() && <div class="secret rumor">
        <span class="seal" aria-hidden="true">☽</span>
        <b>Слух</b>
        <p>{r.rumor}</p>
      </div>}

      <div class="m-card">
        <h5>Как играть</h5>
        {r.acting.vibe && <p class="text"><b>Образ.</b> {r.acting.vibe}</p>}
        {r.acting.voice && <p class="text"><b>Голос.</b> {r.acting.voice}</p>}
        {r.acting.look && <p class="text"><b>Вид.</b> {r.acting.look}</p>}
        {r.acting.actions.length > 0 && <ul class="list">{r.acting.actions.map(a => <li key={a}>{a}</li>)}</ul>}
        {r.acting.lines.length > 0 && <ul class="list lines">{r.acting.lines.map(l => <li key={l}>«{l}»</li>)}</ul>}
        {r.joke && <p class="m-note">{r.joke}</p>}
      </div>
    </>
  );
}

/**
 * Сторона свободной роли (§6.4): кнопка «Выбрать сторону» до третьего акта, выбор с подтверждением;
 * после выбора — «Вы выбрали: …», видно только самому игроку.
 */
function SideChoice({ v }: { v: PlayerView }) {
  const [open, setOpen] = useState(false);
  if (v.me.role.side !== 'free') return null;
  const chosen = v.me.player.side && v.public.factions.find(f => f.id === v.me.player.side);
  if (chosen) {
    return (
      <div class="side-line" style={{ '--side': chosen.color }}>
        <i aria-hidden="true" /><span>Вы выбрали: {chosen.name}</span>
      </div>
    );
  }
  if (!canChooseSide(v)) return null;
  // только стороны с алтарём в этой игре: без «Корабля», если его нет
  const present = new Set(v.altars.map(a => a.side));
  const options = v.public.factions.filter(f => f.id !== 'free' && present.has(f.id as AltarSide));
  const choose = (side: AltarSide, name: string) => ask({
    title: `Выбрать сторону: ${name}?`, text: 'Выбор нельзя изменить', okLabel: 'Выбрать', danger: true,
    onOk: async () => { const res = await run({ type: 'player.chooseSide', side }); if (res.ok) setOpen(false); },
  });
  return (
    <div class="m-card side-choice">
      <h5>Сторона</h5>
      <p class="m-note">Вы пока ни на чьей стороне. Выбрать можно один раз, до третьего акта.</p>
      <div class="m-btns"><Button kind={open ? 'sec' : 'main'} onClick={() => setOpen(!open)}>{open ? 'Свернуть' : 'Выбрать сторону'}</Button></div>
      {open && options.map(f => (
        <div class="side-opt" key={f.id} style={{ '--side': f.color }}>
          <div class="side-opt-text"><b><i aria-hidden="true" />{f.name}</b><span>{f.motto}</span></div>
          <Button small onClick={() => choose(f.id as AltarSide, f.name)}>Выбрать</Button>
        </div>
      ))}
    </div>
  );
}

/** Вместо способности после закрытия ярмарки (§6.2). */
function ClosedCard({ v }: { v: PlayerView }) {
  return (
    <div class="m-card">
      <h5>Способность</h5>
      <p class="ab-state">{v.phase === 'revealed' ? 'Итоги показаны во вкладке „Итоги“' : 'Ведущий подводит итоги'}</p>
    </div>
  );
}

/** Строка состояния способности (§7.1). */
function stateLine(v: PlayerView): string {
  const ab = v.me.ability;
  if (v.hidden17 && v.hidden17.ritual.step !== 'preparation') return 'Обычные способности завершены. Действия финала — во вкладке «Ритуал».';
  switch (ab.state) {
    case 'available': return 'Доступна в этом акте';
    case 'used': return `Применена в акте ${roman(v.act)}`;
    case 'pending': {
      const req = v.requests.find(q => q.id === ab.pendingRequest);
      if (!req) return 'Ждёт ответа';
      const who = waitingFor(req).map(k => roleName(k, v)).join(', ');
      return `Ждёт ответа: ${who}, ${mmss(remainingMs(req.expiresAt, v.clock, now.value))}`;
    }
    default: return v.phase === 'setup' ? 'Откроется с началом акта' : ['act1', 'act2', 'act3'].includes(v.phase) ? 'Заменена сюжетной способностью ведущего' : 'Ярмарка закрыта';
  }
}

/** Карточка способности: состояние, метки, кнопка и форма применения. */
export function AbilityCard({ v }: { v: PlayerView }) {
  const ab = v.me.ability;
  const [open, setOpen] = useState(false);
  const toWorkshop = () => { abilityDraft.value = { kind: ab.kind }; navigateTab('workshop'); };
  const cancel = () => ask({
    title: 'Отменить просьбу?', text: 'Способность останется неприменённой в этом акте.', okLabel: 'Отменить просьбу', danger: true,
    onOk: () => { if (ab.pendingRequest) void run({ type: 'consent.cancel', id: ab.pendingRequest }); },
  });
  return (
    <div class="m-card">
      <h5>Способность</h5>
      <h4>
        {ab.name}
        {ab.hostile && <span class="m-tag warn">враждебная</span>}
        {ab.verbal && <span class="m-tag">словесная</span>}
      </h4>
      <p class="text">{ab.text}</p>
      <p class={`ab-state ${ab.state}`}>{stateLine(v)}</p>
      {v.hidden17?.board.filter(p => p.author === v.me.role.key && p.serviceAbility && ['open', 'accepted'].includes(p.status)).map(p => <p class="m-note" key={p.id}>Применение обещано по заказу «{p.title}». {p.worker ? `Получатель: ${roleName(p.worker, v)}. Примените способность к нему с согласия.` : 'Сначала дождитесь исполнителя.'}</p>)}
      {ab.state === 'pending' && <div class="m-btns"><Button kind="sec" onClick={cancel}>Отменить просьбу</Button></div>}
      {ab.state !== 'pending' && (ab.place === 'workshop'
        ? <div class="m-btns"><Button disabled={ab.state !== 'available'} onClick={toWorkshop}>В мастерскую</Button></div>
        : <div class="m-btns"><Button kind={open ? 'sec' : 'main'} disabled={ab.state !== 'available'} onClick={() => setOpen(!open)}>
          {open ? 'Свернуть' : 'Применить'}
        </Button></div>)}
      {open && ab.state === 'available' && ab.place === 'role' && (
        <div class="ab-form"><AbilityForm v={v} onDone={() => setOpen(false)} /></div>
      )}
    </div>
  );
}

const isIntel = (a: ActionRecord): a is ActionRecord & { intel: Intel } => a.intel !== undefined;

/** «Что вы узнали»: итоги наблюдений за всю игру, новые сверху. */
export function IntelCard({ v }: { v: PlayerView }) {
  const me = v.me.role.key;
  const list = v.actions.filter(a => a.author === me).filter(isIntel).sort((a, b) => b.at - a.at);
  if (list.length === 0) return null;
  return (
    <div class="m-card">
      <h5>Что вы узнали</h5>
      {list.map(a => <IntelRow key={a.id} v={v} act={a.act} intel={a.intel} />)}
    </div>
  );
}

function IntelRow({ v, act, intel }: { v: PlayerView; act: number; intel: Intel }) {
  const head = `Акт ${roman(act)}. `;
  switch (intel.kind) {
    case 'gold': return <div class="m-row intel-result"><span>{head}Золото {roleName(intel.target, v)}</span><b>{goldText(intel.gold)}</b></div>;
    case 'side': {
      const f = v.public.factions.find(x => x.id === intel.side);
      return <div class="m-row intel-result"><span>{head}Сторона {roleName(intel.target, v)}</span><b>{f?.name ?? 'свободный, без стороны'}</b></div>;
    }
    case 'sniff': return (
      <div class="m-row intel-result"><span>{head}{ingredientName(intel.ingredient)} есть у</span>
        <b>{intel.holders.length ? intel.holders.map(k => roleName(k, v)).join(', ') : 'ни у кого'}</b></div>
    );
    case 'question': return (
      <div class="m-row intel-result"><span>{head}Вопрос {roleName(intel.target, v)}{intel.question ? `: «${intel.question}»` : ''}</span><b>голосом</b></div>
    );
    case 'inventory': return (
      <div class="intel-bag">
        <p class="text"><b>{head}Сумка {roleName(intel.target, v)}</b></p>
        <ul class="bl">
          <li><Thumb src={resourceImageUrl('gold')} emoji={GOLD.emoji} size="sm" /><span>{goldText(intel.gold)}{intel.reservedGold ? `, ещё ${intel.reservedGold} обещано` : ''}</span></li>
          {INGREDIENTS.filter(i => intel.ingredients[i.key]).map(i => (
            <li key={i.key}><Thumb src={resourceImageUrl(i.key)} emoji={i.emoji} size="sm" /><span>{i.name} ×{intel.ingredients[i.key]}</span></li>
          ))}
          {intel.items.map((it, n) => {
            const l = itemLabel(it, v);
            return <li key={n}><Thumb src={itemImageUrl(it)} emoji={l.emoji} size="sm" /><span>{l.name}</span></li>;
          })}
        </ul>
        <p class="m-note">Снимок на момент применения; дальше могло измениться.</p>
      </div>
    );
  }
}

/** «Ваши применения»: свои записи способности с исходом, для целей «успешно применить». */
export function UsesCard({ v }: { v: PlayerView }) {
  const me = v.me.role.key;
  const list = v.actions.filter(a => a.author === me && a.source.type === 'ability').sort((a, b) => b.at - a.at);
  if (list.length === 0) return null;
  return (
    <div class="m-card">
      <h5>Ваши применения</h5>
      <ul class="list">{list.map(a => <li key={a.id}>{ownActionText(a, v)}</li>)}</ul>
    </div>
  );
}
