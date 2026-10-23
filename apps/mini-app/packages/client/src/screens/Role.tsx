import type { PlayerView } from '@fair/shared';
import { Button } from '../components/Button';
import { ItemCard } from '../components/ItemCard';
import { Portrait } from '../components/Portrait';
import { roleEmoji } from '../labels';

/** Моя роль: кто я, цели, способность, контакты, тайна, слух и подсказки по отыгрышу. */
export function Role({ v }: { v: PlayerView }) {
  const r = v.me.role;
  const side = v.public.factions.find(f => f.id === r.side);
  return (
    <>
      <div class="m-card">
        <div class="hero-head">
          <Portrait roleKey={r.key} emoji={r.emoji} size="big" />
          <div>
            <b>{r.name}</b>
            <span>{r.title}</span>
            {side && <span class="m-tag" style={{ borderColor: side.color, color: side.color }}>{side.name}</span>}
          </div>
        </div>
        <p class="m-note">{r.intro}</p>
      </div>

      <div class="m-card">
        <h5>📖 Предыстория</h5>
        <p class="text">{r.backstory}</p>
        <h5>🔥 Мотивация</h5>
        <p class="text">{r.motivation}</p>
      </div>

      <div class="m-card">
        <h5>🎯 Цели</h5>
        {r.goals.map(g => (
          <div class="goal" key={g}><i>🔸</i><div>{g}<span class="m-note block">проверяется при закрытии</span></div></div>
        ))}
      </div>

      <div class="m-card">
        <h5>⚡ Способность · {r.skill}</h5>
        <p class="text">{r.effect}</p>
        <Button icon="⚡" disabled>В следующей версии</Button>
      </div>

      <div class="m-card">
        <h5>🧭 Контакты</h5>
        {v.contacts.map((c, i) => (
          <div class="item" key={i}>
            {c.role ? <Portrait roleKey={c.role} emoji={roleEmoji(c.role, v)} size="sm" /> : <i>🧭</i>}
            <div class="item-text">
              <b>{c.name ?? 'По функции'}{c.absent && <span class="m-tag warn">не на ярмарке</span>}</b>
              <span>{c.text}</span>
            </div>
          </div>
        ))}
      </div>

      <div class="secret"><b>🤫 Тайна · видите только вы</b>{r.secret}</div>
      <div class="secret"><b>👂 Слух</b>{r.rumor}</div>

      <div class="m-card">
        <h5>🎭 Как играть</h5>
        {r.acting.vibe && <p class="text"><b>Образ:</b> {r.acting.vibe}</p>}
        {r.acting.voice && <p class="text"><b>Голос:</b> {r.acting.voice}</p>}
        {r.acting.look && <p class="text"><b>Вид:</b> {r.acting.look}</p>}
        {r.acting.actions.length > 0 && <ul class="list">{r.acting.actions.map(a => <li key={a}>{a}</li>)}</ul>}
        {r.acting.lines.length > 0 && <ul class="list lines">{r.acting.lines.map(l => <li key={l}>«{l}»</li>)}</ul>}
        {r.joke && <p class="m-note">😄 {r.joke}</p>}
      </div>
    </>
  );
}
