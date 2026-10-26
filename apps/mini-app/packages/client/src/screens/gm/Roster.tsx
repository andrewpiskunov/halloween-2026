import { useState } from 'preact/hooks';
import type { GmView } from '@fair/shared';
import { Button } from '../../components/Button';
import { Portrait } from '../../components/Portrait';
import { lotsPreview } from '../../gm/lots';
import { ask, botName, run, showToast } from '../../store';

const inviteLink = (code: string) => `https://t.me/${botName.value}?startapp=${code}`;

/** Состав: сколько игроков, кто в составе, кто пришёл, ссылки-приглашения и открытие ярмарки. */
export function Roster({ v }: { v: GmView }) {
  const { state, content, invites } = v;
  const setup = state.phase === 'setup';
  const [n, setN] = useState(String(Math.min(30, Math.max(12, state.roster.length || 12))));
  const [shownLink, setShownLink] = useState<string | null>(null);
  const roles = [...content.roles].sort((a, b) => a.pos - b.pos);
  const inv = new Map(invites.map(i => [i.roleKey, i]));
  const nValue = Number(n);
  const nValid = Number.isInteger(nValue) && nValue >= 12 && nValue <= 30;
  const presentCount = state.roster.filter(k => state.players[k]?.present).length;

  const copy = async (code: string) => {
    const link = inviteLink(code);
    try {
      await navigator.clipboard.writeText(link);
      setShownLink(null);
      showToast('Ссылка скопирована');
    } catch {
      setShownLink(link);
    }
  };

  const open = () => {
    const lots = lotsPreview(v);
    ask({
      title: 'Открыть ярмарку?',
      text: `Пришли: ${presentCount} из ${state.roster.length}. ` +
        (lots.length ? `В лоты уйдут: ${lots.join(', ')}.` : 'В лоты ничего не уйдёт.') +
        ' После открытия состав менять нельзя.',
      okLabel: 'Открыть',
      onOk: () => { void run({ type: 'session.open' }); },
    });
  };

  return (
    <>
      <div class="m-card">
        <h5>Состав</h5>
        <p class="m-note">В составе {state.roster.length} · пришли {presentCount}</p>
        {setup && (
          <>
            <label class="field">
              <span>Число игроков (12–30)</span>
              <input type="number" inputMode="numeric" min={12} max={30} value={n}
                onInput={e => setN((e.currentTarget as HTMLInputElement).value)} />
            </label>
            <Button kind="sec" disabled={!nValid} onClick={() => { void run({ type: 'session.setN', n: nValue }); }}>
              Состав по умолчанию
            </Button>
          </>
        )}
        <Button kind="red" disabled={!setup || state.roster.length === 0} onClick={open}>Открыть ярмарку</Button>
        {!setup && <p class="m-note">Ярмарка открыта, состав зафиксирован.</p>}
      </div>

      {shownLink && (
        <div class="m-card hot link-box"><h5>Ссылка</h5><code>{shownLink}</code></div>
      )}

      <h2 class="scr-h">Роли <small>{roles.length} карт</small></h2>
      <div class="roster">
        {roles.map(r => {
          const inRoster = state.roster.includes(r.key);
          const i = inv.get(r.key);
          return (
            <div class={`gm-role ${inRoster ? '' : 'off'}`} key={r.key}>
              <div class="item">
                <Portrait roleKey={r.key} emoji={r.emoji} />
                <div class="item-text">
                  <b>{r.name}</b>
                  <span>{r.title}</span>
                  <span>
                    <span class="m-tag">{content.factions.find(f => f.id === r.side)?.name ?? r.side}</span>
                    {i?.bound && <span class="m-tag">привязан</span>}
                    {!setup && inRoster && <span class={`m-tag ${i?.present ? '' : 'warn'}`}>{i?.present ? 'пришёл' : 'не пришёл'}</span>}
                  </span>
                </div>
              </div>
              <div class="gm-toggles">
                <label class={`check ${inRoster ? 'on' : ''}`}>
                  <input type="checkbox" checked={inRoster} disabled={!setup}
                    onChange={() => { void run({ type: 'session.toggleRole', roleKey: r.key }); }} />
                  в составе
                </label>
                {inRoster && (
                  <label class={`check ${i?.present ? 'on' : ''}`}>
                    <input type="checkbox" checked={!!i?.present} disabled={!setup}
                      onChange={e => { void run({ type: 'player.setPresent', roleKey: r.key, present: (e.currentTarget as HTMLInputElement).checked }); }} />
                    пришёл
                  </label>
                )}
              </div>
              {i && (
                <div class="m-btns">
                  <Button small kind="sec" onClick={() => { void copy(i.code); }}>Скопировать ссылку</Button>
                  <Button small kind="sec" onClick={() => ask({
                    title: `Перевыдать код: ${r.name}?`,
                    text: 'Старая ссылка перестанет работать, игрока нужно будет пригласить заново.',
                    okLabel: 'Перевыдать', danger: true,
                    onOk: () => { void run({ type: 'gm.rebind', roleKey: r.key }); },
                  })}>Перевыдать код</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
