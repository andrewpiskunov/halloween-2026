import type { PlayerView } from '@fair/shared';
import { Button } from '../components/Button';
import { Portrait } from '../components/Portrait';
import { roleEmoji, roman } from '../labels';

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
      </div>
      {side && (
        <div class="side-line" style={{ '--side': side.color }}>
          <i aria-hidden="true" /><span>{side.name}. {side.motto}</span>
        </div>
      )}
      {r.intro && <p class="lead">{r.intro}</p>}

      <div class="m-card">
        <h5>Ваши цели</h5>
        <ul class="goals">{r.goals.map(g => <li key={g}>{g}</li>)}</ul>
        <p class="m-note">Цели проверяются при закрытии ярмарки.</p>
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

      <div class="m-card">
        <h5>Способность</h5>
        <h4>{r.skill}</h4>
        <p class="text">{r.effect}</p>
        <Button kind="sec" disabled>В следующей версии</Button>
      </div>

      <div class="m-card">
        <h5>Контакты</h5>
        {v.contacts.map((c, i) => (
          <div class="item" key={i}>
            {c.role ? <Portrait roleKey={c.role} emoji={roleEmoji(c.role, v)} size="sm" /> : <span class="portrait sm" aria-hidden="true">☉</span>}
            <div class="item-text">
              <b>{c.name ?? 'По функции'}{c.absent && <span class="m-tag warn">не на ярмарке</span>}</b>
              <span>{c.text}</span>
            </div>
          </div>
        ))}
      </div>

      <div class="secret rumor">
        <span class="seal" aria-hidden="true">☽</span>
        <b>Слух</b>
        <p>{r.rumor}</p>
      </div>

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
