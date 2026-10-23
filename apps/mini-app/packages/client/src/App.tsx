import type { GmView, PlayerView } from '@fair/shared';
import { Confirm } from './components/Confirm';
import { Tabs } from './components/Tabs';
import { mmss, GOLD } from './labels';
import { Altars } from './screens/Altars';
import { Bag } from './screens/Bag';
import { Events } from './screens/Events';
import { Role } from './screens/Role';
import { Trades } from './screens/Trades';
import { Workshop } from './screens/Workshop';
import { now, status, tab, toast, view, viewAt } from './store';

/** Корень: экран статуса до первой проекции, дальше маршрут по view.kind. */
export function App() {
  const s = status.value;
  const v = view.value;
  if (s === 'no_auth') return <Notice icon="📱" text="Откройте приложение из Telegram" />;
  if (s === 'unauthorized') return <Notice icon="🔒" text="Вход не удался. Откройте приложение из Telegram заново" />;
  if (s === 'no_role') return <Notice icon="🎭" text="Роль не найдена, обратитесь к ведущему" />;
  if (!v) return <Notice icon="🔮" text="Подключение к ярмарке…" />;
  return (
    <div class="app rpg">
      {v.kind === 'gm' ? <GmPlaceholder v={v} /> : <PlayerApp v={v} />}
      <Confirm />
      {toast.value && <div class="toast" role="alert" onClick={() => { toast.value = null; }}>{toast.value}</div>}
    </div>
  );
}

function Notice({ icon, text }: { icon: string; text: string }) {
  return (
    <div class="app rpg notice">
      <div class="m-card"><div class="notice-icon">{icon}</div><p>{text}</p></div>
      {toast.value && <div class="toast" role="alert">{toast.value}</div>}
    </div>
  );
}

const PHASE_TEXT: Record<string, string> = { setup: 'Подготовка', closed: 'Ярмарка закрыта', revealed: 'Ярмарка закрыта' };

function TopBar({ v, gold }: { v: PlayerView | GmView; gold?: number }) {
  const phase = v.kind === 'player' ? v.phase : v.state.phase;
  let label = PHASE_TEXT[phase];
  if (!label && v.kind === 'player') {
    const elapsed = v.clock.elapsedMs + (v.clock.paused ? 0 : Math.max(0, now.value - viewAt.value));
    label = `Акт ${v.act} · ${mmss(elapsed)}${v.clock.paused ? ' ⏸' : ''}`;
  }
  const s = status.value;
  return (
    <header class="topbar">
      <span class={`dot ${s === 'open' ? 'on' : 'off'}`} title={s === 'open' ? 'На связи' : 'Нет связи'} />
      <b>{label ?? phase}</b>
      {gold !== undefined && <b class="gold">{GOLD.emoji} {gold}</b>}
    </header>
  );
}

function PlayerApp({ v }: { v: PlayerView }) {
  const me = v.me.role.key;
  const incoming = v.offers.filter(o => o.to === me && o.status === 'pending').length;
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
      <Tabs badges={{ trades: incoming }} />
    </>
  );
}

/** Заглушка для ведущего: настоящий пульт строит следующая задача. */
function GmPlaceholder({ v }: { v: GmView }) {
  return (
    <>
      <TopBar v={v} />
      <main class="cnt">
        <div class="m-card"><p>Пульт ведущего появится в следующей задаче</p></div>
        <div class="m-card">
          <h5>Приглашения</h5>
          {v.invites.length === 0 && <p class="m-note">Состав ещё не задан.</p>}
          {v.invites.map(i => (
            <div class="m-row" key={i.roleKey}>
              <span>{i.roleKey} · <code>{i.code}</code></span>
              <b>{i.bound ? 'привязан' : '—'} · {i.present ? 'пришёл' : 'нет'}</b>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
