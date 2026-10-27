import type { GmView, PlayerView } from '@fair/shared';
import { Confirm } from './components/Confirm';
import { GmTabs } from './components/GmTabs';
import { Tabs } from './components/Tabs';
import { goldText, mmss, plural, roman } from './labels';
import { phaseLabel } from './rules';
import { Altars } from './screens/Altars';
import { Bag } from './screens/Bag';
import { Events } from './screens/Events';
import { Console } from './screens/gm/Console';
import { Roster } from './screens/gm/Roster';
import { Role } from './screens/Role';
import { Trades } from './screens/Trades';
import { Workshop } from './screens/Workshop';
import { useEffect } from 'preact/hooks';
import { backToGm, bagSeenMarks, gmTab, now, playingAs, status, tab, toast, view, viewAt, type Tab } from './store';

/** Корень: экран статуса до первой проекции, дальше маршрут по view.kind. */
export function App() {
  const s = status.value;
  const v = view.value;
  const as = playingAs.value;
  // Ведущий играл за игрока, но роль пропала (перепривязка, смена состава): вернуться к пульту.
  if (as && s === 'no_role') { backToGm(); return <Notice icon="☿" text="Возвращение к пульту…" />; }
  if (s === 'no_auth') return <Notice icon="✉" text="Откройте приложение из Telegram" />;
  if (s === 'unauthorized') return <Notice icon="✠" text="Вход не удался. Откройте приложение из Telegram заново" />;
  if (s === 'no_role') return <Notice icon="☉" text="Роль не найдена, обратитесь к ведущему" />;
  if (!v) return <Notice icon="☽" text="Подключение к ярмарке…" />;
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

function Notice({ icon, text }: { icon: string; text: string }) {
  return (
    <div class="app notice">
      <div class="m-card"><div class="notice-icon" aria-hidden="true">{icon}{'\uFE0E'}</div><p>{text}</p></div>
      {toast.value && <div class="toast" role="alert">{toast.value}</div>}
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
  const screen = (() => {
    switch (tab.value) {
      case 'bag': return <Bag v={v} />;
      case 'trades': return <Trades v={v} />;
      case 'workshop': return <Workshop v={v} />;
      case 'altars': return <Altars v={v} />;
      case 'events': return <Events v={v} />;
      default: return <Role v={v} />;
    }
  })();
  return (
    <>
      <TopBar v={v} gold={v.me.available.gold} />
      <main class="cnt">{screen}</main>
      <Tabs badges={{ trades: incoming }} dots={dots} />
    </>
  );
}

function GmApp({ v }: { v: GmView }) {
  return (
    <>
      <TopBar v={v} />
      <main class="cnt">{gmTab.value === 'console' ? <Console v={v} /> : <Roster v={v} />}</main>
      <GmTabs />
    </>
  );
}
