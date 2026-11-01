import { useState } from 'preact/hooks';
import type { GmView } from '@fair/shared';
import { Button } from '../../components/Button';
import { Select } from '../../components/Select';
import { openExternal } from '../../api';
import { openGmTab } from '../../gm/navigation';
import { ask, exportUrl, hasOwnToken, loadedContent, run, showToast } from '../../store';

export function Administration({ v }: { v: GmView }) {
  const [player, setPlayer] = useState('');
  const name = loadedContent().roles.find(r => r.key === player)?.name ?? '';
  const invite = v.invites.find(i => i.roleKey === player);
  return <>
    <h2 class="scr-h">Администрирование</h2>
    <section class="m-card gm-admin-card"><h3>Приглашение героя</h3>
      <p class="text">Перевыдайте код, если ссылка попала не тому человеку или игрок сменил аккаунт.</p>
      <Select label="Герой для перевыдачи кода" value={player} onChange={setPlayer} options={v.state.roster.map(key => ({ value: key, label: loadedContent().roles.find(r => r.key === key)?.name ?? key, avatar: key }))} />
      <Button kind="sec" disabled={!invite} onClick={() => ask({
        title: `Перевыдать код: ${name}?`, text: 'Старая ссылка перестанет работать. Новую можно скопировать в составе.', okLabel: 'Перевыдать', danger: true,
        onOk: async () => { const r = await run({ type: 'gm.rebind', roleKey: player }); if (r.ok) showToast(`Новый код для ${name} готов`); },
      })}>Перевыдать код</Button>
    </section>
    <section class="m-card gm-admin-card"><h3>Журнал партии</h3><p class="text">Сохраните записи о событиях и решениях. При закрытии ярмарки копия также остаётся на сервере.</p>
      <Button kind="sec" disabled={!hasOwnToken()} onClick={() => openExternal(exportUrl())}>Скачать журнал</Button>
    </section>
    <section class="m-card danger-zone"><h3>Новая партия</h3>
      <p class="text">Полный сброс уберёт явку, привязки игроков, вещи, сделки и ритуал. Приглашения будут выданы заново. Вы останетесь ведущим.</p>
      <Button kind="red" onClick={() => ask({
        title: 'Сбросить игру полностью?', danger: true, okLabel: 'Сбросить',
        text: 'Игра вернётся к подготовке новой партии. Старые приглашения перестанут работать. Отменить сброс нельзя.',
        onOk: async () => { const r = await run({ type: 'session.reset' }); if (r.ok) { openGmTab('roster'); showToast('Новая партия готова. Отметьте пришедших.'); } },
      })}>Сбросить игру</Button>
    </section>
  </>;
}
