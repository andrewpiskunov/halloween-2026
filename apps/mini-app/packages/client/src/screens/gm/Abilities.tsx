import { useState } from 'preact/hooks';
import type { GmView, Player } from '@fair/shared';
import { Button } from '../../components/Button';
import { Select } from '../../components/Select';
import { actionLine, filterActions, requestLine } from '../../gm/actions';
import { mmss, nameCase } from '../../labels';
import { remainingMs } from '../../rules';
import { ask, loadedContent, now, run, showToast } from '../../store';

/** Отметка, которую можно снять исправлением: поле `gm.correct` из §6.7. */
export type MarkField = 'protection' | 'thorns' | 'curse' | 'discount' | 'abilityUsed' | 'hostileAttempt' | 'guise';
/** Заготовка формы исправления: игрок, поле и «поставить / снять». */
export interface FixPreset { player: string; field: MarkField; on: boolean }

/** Сколько записей журнала показывать сразу. */
const JOURNAL_LIMIT = 30;

/** Блок пульта «Способности и вещи» (§7.6): журнал применений, открытые просьбы, отметки игроков. */
export function Abilities({ v, onFix }: { v: GmView; onFix: (p: FixPreset) => void }) {
  const { state } = v;
  const content = loadedContent();
  const name = (k: string) => (k === 'gm' ? 'ведущий' : content.roles.find(r => r.key === k)?.name ?? k);
  const [player, setPlayer] = useState('');
  const [hostileOnly, setHostileOnly] = useState(false);
  const [all, setAll] = useState(false);
  const clock = { paused: state.clock.pausedAt !== undefined, pausedAt: state.clock.pausedAt };

  const journal = filterActions(state.actions, { hostileOnly, ...(player ? { player } : {}) });
  const shown = all ? journal : journal.slice(0, JOURNAL_LIMIT);
  const requests = Object.values(state.requests).filter(r => r.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  const present = state.roster.filter(k => state.players[k]?.present);

  const cancel = (id: string, text: string) => ask({
    title: 'Отменить просьбу?', text: `${text}. Автор получит «Ведущий отменил вашу просьбу», вещь или применение вернутся.`,
    okLabel: 'Отменить просьбу', danger: true,
    onOk: () => { void run({ type: 'consent.cancel', id }).then(r => { if (r.ok) showToast('Просьба отменена'); }); },
  });

  /** Отметки игрока: подпись и поле исправления; без поля — только показ (ожидание ответа). */
  const marks = (p: Player): { label: string; field?: MarkField }[] => {
    const out: { label: string; field?: MarkField }[] = [];
    if (p.abilityUsedInAct) out.push({ label: 'применено в акте', field: 'abilityUsed' });
    if (p.abilityPending) out.push({ label: 'ждёт ответа на просьбу' });
    if (p.protection) {
      const src = p.protection.source === 'ward' ? 'талисман' : p.protection.source === 'gm' ? 'от ведущего' : `от ${nameCase(name(p.protection.by), 'gen')}`;
      out.push({ label: `защита (${src})`, field: 'protection' });
    }
    if (p.thorns) out.push({ label: p.thornsBy ? `шипы (от ${nameCase(name(p.thornsBy), 'gen')})` : 'шипы', field: 'thorns' });
    if (p.curse) out.push({ label: 'проклятие', field: 'curse' });
    if (p.discount) out.push({ label: p.discountBy ? `скидка (от ${nameCase(name(p.discountBy), 'gen')})` : 'скидка', field: 'discount' });
    if (p.hostileAttemptsAgainstInAct > 0) out.push({ label: 'попытка по нему', field: 'hostileAttempt' });
    if (p.guise) out.push({ label: `облик «${p.guise.name}»`, field: 'guise' });
    return out;
  };

  return (
    <div class="m-card gm-abilities">
      <h5>Способности и вещи</h5>

      <h6>Журнал применений</h6>
      <div class="field"><span>Игрок</span>
        <Select label="Игрок" value={player} onChange={setPlayer}
          options={[{ value: '', label: 'Все игроки' }, ...state.roster.map(k => ({ value: k, label: name(k), icon: content.roles.find(r => r.key === k)?.emoji, avatar: k }))]} />
      </div>
      <label class={`check ${hostileOnly ? 'on' : ''}`}>
        <input type="checkbox" checked={hostileOnly} onChange={() => setHostileOnly(!hostileOnly)} />
        <span>только враждебные</span>
      </label>
      {journal.length === 0
        ? <p class="m-note">Применений пока нет.</p>
        : (
          <div class="gm-journal">
            {shown.map(a => (
              <div key={a.id} class={`gm-act ${a.outcome === 'blocked' ? 'blocked' : ''} ${a.hostile ? 'hostile' : ''}`}>{actionLine(a, v, content)}</div>
            ))}
          </div>
        )}
      {journal.length > JOURNAL_LIMIT && (
        <Button kind="sec" small onClick={() => setAll(!all)}>{all ? 'Только последние' : `Показать все (${journal.length})`}</Button>
      )}

      <h6>Открытые просьбы</h6>
      {requests.length === 0 ? <p class="m-note">Открытых просьб нет.</p> : requests.map(r => {
        const text = requestLine(r, v, content);
        const waiting = r.approvers.filter(k => !r.approved.includes(k));
        return (
          <div class="gm-req" key={r.id}>
            <div class="m-row"><span>{text}</span><b>{mmss(Math.max(0, remainingMs(r.expiresAt, clock, now.value)))}</b></div>
            <p class="m-note">
              Ждём: {waiting.map(name).join(', ') || 'никого'}
              {r.approved.length > 0 && `; согласились: ${r.approved.map(name).join(', ')}`}
            </p>
            <Button kind="sec" small onClick={() => cancel(r.id, text)}>Отменить</Button>
          </div>
        );
      })}

      <h6>Отметки игроков</h6>
      {present.length === 0 ? <p class="m-note">На ярмарке пока никого.</p> : (
        <div class="gm-marks">
          {present.map(k => {
            const list = marks(state.players[k]);
            return (
              <div class="gm-mark-row" key={k}>
                <b>{name(k)}</b>
                <span>
                  {list.length === 0 ? <i class="m-note">нет отметок</i> : list.map(m => m.field
                    ? <button type="button" key={m.label} class="m-tag gm-mark" title="Снять через исправление"
                      onClick={() => onFix({ player: k, field: m.field!, on: false })}>{m.label} ×</button>
                    : <span key={m.label} class="m-tag warn">{m.label}</span>)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p class="m-note">Нажмите отметку, чтобы снять её: откроется исправление с причиной.</p>
    </div>
  );
}
