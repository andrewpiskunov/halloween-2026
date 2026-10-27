// Проверка приватности проекции игрока (спецификация этапа 6, §3.3).
import type { Content, GameState, PlayerView } from '@fair/shared';

/** Слишком короткие строки дали бы ложные совпадения с ключами и словами JSON. */
const MIN_TEXT = 4;
/** Поле, по которому объект узнаётся как Player из состояния. */
const PLAYER_MARK = 'hostileAttemptsAgainstInAct';

/** Все строки внутри значения, рекурсивно. */
function stringsOf(x: unknown, out: string[] = []): string[] {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) for (const v of x) stringsOf(v, out);
  else if (typeof x === 'object' && x !== null) for (const v of Object.values(x)) stringsOf(v, out);
  return out;
}

/**
 * Строки, которых не должно быть в проекции игрока myRole: чужие цели, секреты, предыстории, мотивации,
 * строки отыгрыша (кроме portrait: это ключ картинки, а не текст), коды приглашений и код ведущего.
 * Исключаются строки, входящие в мою роль или в общие данные (фракции, ресурсы, улики, реликвии,
 * рецепты, публичная история): тексты целей у ролей повторяются.
 */
export function forbiddenStrings(content: Content, state: GameState, myRole: string): string[] {
  const allowed = stringsOf([
    content.roleByKey[myRole], content.factions, content.resources, content.clues,
    content.relics.map(r => ({ name: r.name, emoji: r.emoji, lore: r.lore })), content.recipes, content.story.public,
  ]);
  const isAllowed = (s: string) => allowed.some(a => a.includes(s));
  const texts = new Set<string>();
  for (const r of content.roles) {
    if (r.key === myRole) continue;
    const { portrait: _p, ...acting } = r.acting;
    for (const s of stringsOf([r.goals, r.secret, r.backstory, r.motivation, acting])) {
      const t = s.trim();
      if (t.length >= MIN_TEXT && !isAllowed(t)) texts.add(t);
    }
  }
  // Коды не текст: проверяются всегда, свой код в проекции тоже не нужен.
  for (const code of [...Object.values(state.invites), state.gmCode]) if (code) texts.add(code);
  return [...texts];
}

/** Обход проекции: ключ telegramId и чужие объекты Player, с путём до места. */
function walk(x: unknown, path: string, me: string, out: string[]): void {
  if (Array.isArray(x)) { x.forEach((v, i) => walk(v, `${path}[${i}]`, me, out)); return; }
  if (typeof x !== 'object' || x === null) return;
  const o = x as Record<string, unknown>;
  if (Object.hasOwn(o, PLAYER_MARK) && typeof o.roleKey === 'string' && o.roleKey !== me) {
    out.push(`чужой объект Player (${o.roleKey}) в ${path}`);
  }
  for (const [k, v] of Object.entries(o)) {
    if (k === 'telegramId') out.push(`ключ telegramId в ${path}.${k}`);
    walk(v, `${path}.${k}`, me, out);
  }
}

const short = (s: string) => (s.length > 60 ? `${s.slice(0, 60)}…` : s);

/**
 * Нарушения приватности в проекции: запрещённые строки в её JSON (сравнение с экранированием JSON),
 * ключ telegramId по структуре (не по подстроке: число совпало бы с метками времени), чужие Player.
 */
export function privacyViolations(viewJson: string, view: PlayerView, forbidden: string[]): string[] {
  const out: string[] = [];
  for (const s of forbidden) {
    if (viewJson.includes(JSON.stringify(s).slice(1, -1))) out.push(`чужой текст в проекции: «${short(s)}»`);
  }
  walk(view, 'view', view.me.player.roleKey, out);
  return out;
}
