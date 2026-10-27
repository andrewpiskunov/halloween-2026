import type { GmView, PlayerView } from '@fair/shared';
import { Confirm } from './components/Confirm';
import { GmTabs } from './components/GmTabs';
import { Button } from './components/Button';
import { Frozen, frozenReason } from './components/Frozen';
import { Tabs, effectiveTab } from './components/Tabs';
import { goldText, mmss, plural, roman } from './labels';
import { leftText, phaseLabel, playerLeft, rootScreen } from './rules';
import { Altars } from './screens/Altars';
import { Bag } from './screens/Bag';
import { Events } from './screens/Events';
import { Results } from './screens/Results';
import { Console } from './screens/gm/Console';
import { Results as GmResults } from './screens/gm/Results';
import { Roster } from './screens/gm/Roster';
import { Role } from './screens/Role';
import { Trades } from './screens/Trades';
import { Workshop } from './screens/Workshop';
import { useEffect } from 'preact/hooks';
import { backToGm, bagSeenMarks, content, gmTab, now, playingAs, retryLogin, retryNow, status, tab, toast, view, viewAt, type Tab } from './store';

/** Корень: экран статуса до первой проекции, дальше маршрут по view.kind. */
export function App() {
  const s = status.value;
  const v = view.value;
  const as = playingAs.value;
  // Ведущий играл за игрока, но роль пропала (перепривязка, смена состава): вернуться к пульту.
  if (as && s === 'no_role') { backToGm(); return <Notice icon="☿" text="Возвращение к пульту…" />; }
  // Экраны ведущего читают содержимое: до сообщения content ждём так же, как до первой проекции.
  switch (rootScreen(s, v, content.value)) {
    case 'no_auth': return <Notice icon="✉" text="Откройте приложение из Telegram" />;
    // Токен мог протухнуть: новый вход выдаст свежий.
    case 'unauthorized': return <Notice icon="✠" text="Вход не удался. Нажмите «Повторить» или откройте приложение из Telegram заново" retry />;
    case 'auth_failed': return <Notice icon="☾" text="Нет связи с ярмаркой" retry />;
    case 'no_role': return <Notice icon="☉" text="Роль не найдена, обратитесь к ведущему" />;
    case 'connecting': return <Notice icon="☽" text="Подключение к ярмарке…" />;
    case 'app': break;
  }
  if (!v) return null;
  return (
    <div class="app">
      {as && v.kind === 'player' && (
        <div class="as-bar" role="status">
          <span>Экраны игрока: <b>{as.name}</b></span>
          <button type="button" onClick={backToGm}>К пульту</button>
        </div>
      )}
      {v.kind === 'gm' ? <GmApp v={v} /> : <PlayerApp v={v} />}
      <Confirm />
      {toast.value && <div class="toast" role="alert" onClick={() => { toast.value = null; }}>{toast.value}</div>}
    </div>
  );
}

/** Экран статуса без проекции; retry — кнопка «Повторить», которая запускает вход заново (§4.1). */
function Notice({ icon, text, retry }: { icon: string; text: string; retry?: boolean }) {
  return (
    <div class="app notice">
      <div class="m-card">
        <div class="notice-icon" aria-hidden="true">{icon}{'\uFE0E'}</div><p>{text}</p>
        {retry && <Button onClick={() => { void retryLogin(); }}>Повторить</Button>}
      </div>
      {toast.value && <div class="toast" role="alert">{toast.value}</div>}
    </div>
  );
}

/** Полоса под HUD при обрыве, когда экраны уже показаны (§4.2): «Сейчас» переподключает без ожидания. */
function LinkBar() {
  const s = status.value;
  if (s !== 'closed' && s !== 'connecting') return null;
  return (
    <div class="as-bar live-bar" role="status">
      <span>Нет связи, переподключение…</span>
      {/* При connecting сокет уже открывается: торопить нечего. */}
      {s === 'closed' && <button type="button" onClick={retryNow}>Сейчас</button>}
    </div>
  );
}

const ACT_NUM = { act1: 1, act2: 2, act3: 3 } as const;

/** HUD: «Акт I · 21:08 · 6 золотых»; у ведущего — фаза и число гостей. */
function TopBar({ v, gold }: { v: PlayerView | GmView; gold?: number }) {
  const phase = v.kind === 'player' ? v.phase : v.state.phase;
  const act = phase === 'act1' || phase === 'act2' || phase === 'act3' ? ACT_NUM[phase] : null;
  const paused = v.kind === 'player' ? v.clock.paused : v.state.clock.pausedAt !== undefined;
  const actLabel = act ? `Акт ${roman(act)}` : phaseLabel(phase);
  let time: string | null = null;
  if (act && v.kind === 'player') {
    const elapsed = v.clock.elapsedMs + (v.clock.paused ? 0 : Math.max(0, now.value - viewAt.value));
    time = mmss(elapsed);
  }
  const s = status.value;
  const dot = <span class={`dot ${s === 'open' ? 'on' : 'off'}`} title={s === 'open' ? 'На связи' : 'Нет связи'} />;
  const pause = act && paused ? <small>пауза</small> : null;
  if (v.kind === 'gm') {
    const n = v.state.roster.length;
    return (
      <header class="hud"><div class="hud-in">
        <span class="hud-l">{dot}Ведущий</span>
        <span class="hud-t">{actLabel}{pause}</span>
        <span class="hud-r">{n} {plural(n, 'гость', 'гостя', 'гостей')}</span>
      </div></header>
    );
  }
  return (
    <header class="hud"><div class="hud-in">
      <span class="hud-l">{dot}{time ? actLabel : ''}</span>
      <span class="hud-t">{time ?? actLabel}{pause}</span>
      <span class="hud-r">{gold !== undefined ? goldText(gold) : ''}</span>
    </div></header>
  );
}

function PlayerApp({ v }: { v: PlayerView }) {
  const me = v.me.role.key;
  const incoming = v.offers.filter(o => o.to === me && o.status === 'pending').length
    + v.requests.filter(r => r.status === 'pending' && r.approvers.includes(me) && !r.approved.includes(me)).length;
  // Точка у «Сумки»: отметки изменились с последнего открытия вкладки.
  const p = v.me.player;
  const marks = p.protection || p.thorns || p.curse || p.discount
    ? [p.protection?.by ?? '', p.protection?.source ?? '', p.thorns, p.curse, p.discount].join('|') : '';
  useEffect(() => { if (tab.value === 'bag') bagSeenMarks.value = marks; }, [tab.value, marks]);
  const dots: Tab[] = [];
  if (v.me.ability.state === 'available') dots.push('role');
  if (marks && marks !== bagSeenMarks.value && tab.value !== 'bag') dots.push('bag');
  const revealed = v.phase === 'revealed';
  const screen = (() => {
    switch (effectiveTab(tab.value, revealed)) {
      case 'bag': return <Bag v={v} />;
      case 'trades': return <Trades v={v} />;
      case 'workshop': return <Workshop v={v} />;
      case 'altars': return <Altars v={v} />;
      case 'events': return <Events v={v} />;
      case 'results': return <Results v={v} />;
      default: return <Role v={v} />;
    }
  })();
  return (
    <>
      <TopBar v={v} gold={v.me.available.gold} />
      <LinkBar />
      {/* Ушедший видит экраны, но действовать не может: сервер всё равно откажет (§2.4). */}
      {playerLeft(v) && <div class="as-bar live-bar" role="status"><span>{leftText(v)}</span></div>}
      <main class="cnt"><Frozen.Provider value={frozenReason(v)}>{screen}</Frozen.Provider></main>
      <Tabs badges={{ trades: incoming }} dots={dots} revealed={revealed} />
    </>
  );
}

function GmApp({ v }: { v: GmView }) {
  return (
    <>
      <TopBar v={v} />
      <LinkBar />
      <main class="cnt">{gmTab.value === 'console' ? <Console v={v} /> : gmTab.value === 'results' ? <GmResults v={v} /> : <Roster v={v} />}</main>
      <GmTabs />
    </>
  );
}
