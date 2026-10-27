import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { COMMAND_TYPES, contentData, viewFor, type Actor, type Command, type GameState } from '@fair/shared';
import { verifyToken } from './auth';
import type { ServerDeps } from './http';

export const CLOSE_UNAUTHORIZED = 4401;
export const CLOSE_FORBIDDEN = 4403;
const PING_INTERVAL_MS = 30_000;
const MAX_ID = 64;
const MAX_KEY = 64;
const MAX_TEXT = 2000;
const MAX_DEPTH = 5;

/** Поля, которые движок использует как ключи: если есть, обязаны быть короткими строками. */
const KEY_FIELDS = ['roleKey', 'itemId', 'id', 'to', 'code', 'recipeId', 'contributionId', 'playerKey', 'ingredient', 'side', 'target'];
/** Свободный текст ведущего, описания, вопрос Весты и облик Камня: длиннее ключей. */
const TEXT_FIELDS = new Set(['text', 'reason', 'rumor', 'question', 'guise']);
/** Поля параметров способности (AbilityUse); прочие в use не принимаются. */
const USE_FIELDS = new Set(['kind', 'recipeId', 'from', 'to', 'ingredient', 'take', 'give', 'itemId', 'into', 'target', 'copy', 'question']);

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/**
 * Поля исправления ведущего, где null — значимое значение: цель «по журналу» (change.value),
 * снять облик (change.name), снять сторону (change.side). Только в gm.correct и только прямо в change;
 * в других командах и на других путях null не принимается.
 */
const NULLABLE_FIELDS = new Set(['value', 'name', 'side']);

/** Значения JSON допустимых видов: строки ограниченной длины, конечные числа, булевы, вложенность до MAX_DEPTH. */
function validValue(v: unknown, field: string, depth: number, nullable: (path: string[]) => boolean, path: string[] = []): boolean {
  if (depth > MAX_DEPTH) return false;
  if (v === null) return nullable(path);
  if (typeof v === 'string') return v.length <= (TEXT_FIELDS.has(field) ? MAX_TEXT : MAX_KEY);
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.length <= 100 && v.every((x, i) => validValue(x, field, depth + 1, nullable, [...path, String(i)]));
  if (isPlain(v)) return Object.entries(v).every(([k, x]) => validValue(x, k, depth + 1, nullable, [...path, k]));
  return false;
}

/** Где команда допускает null: только change.value, change.name, change.side у gm.correct. */
function nullableFor(type: string): (path: string[]) => boolean {
  if (type !== 'gm.correct') return () => false;
  return path => path.length === 2 && path[0] === 'change' && NULLABLE_FIELDS.has(path[1]);
}

/** Ключевые поля объекта, если есть, — строки. */
const keysAreStrings = (o: Record<string, unknown>) => KEY_FIELDS.every(key => !(key in o) || typeof o[key] === 'string');

/**
 * Параметры ability.use: непустой объект с видом-строкой, только поля AbilityUse, ключи строками;
 * у копии Астры то же для вложенного copy. Длины строк проверяет validValue.
 */
function validUse(use: unknown, depth = 0): boolean {
  if (!isPlain(use) || typeof use.kind !== 'string' || !keysAreStrings(use)) return false;
  if (!Object.keys(use).every(k => USE_FIELDS.has(k))) return false;
  if ('copy' in use) return depth === 0 && validUse(use.copy, depth + 1);
  return true;
}

/** Разбор входящего сообщения; без cmd — сообщение некорректно и в игру не попадает (id, если он корректен). */
export function parseCommandMessage(raw: string): { id: string; cmd: Command } | { id?: string } {
  let msg: unknown;
  try { msg = JSON.parse(raw); } catch { return {}; }
  if (!isPlain(msg)) return {};
  const id = typeof msg.id === 'string' && msg.id.length > 0 && msg.id.length <= MAX_ID ? msg.id : undefined;
  const { cmd } = msg;
  if (msg.kind !== 'cmd' || !id || !isPlain(cmd)) return { id };
  if (typeof cmd.type !== 'string' || !Object.hasOwn(COMMAND_TYPES, cmd.type)) return { id };
  if (!keysAreStrings(cmd)) return { id };
  if (cmd.type === 'ability.use' && !validUse(cmd.use)) return { id };
  if (!validValue(cmd, 'cmd', 0, nullableFor(cmd.type))) return { id };
  return { id, cmd: cmd as unknown as Command };
}

/** Соединение: аккаунт и, для ведущего за игрока, роль из токена (as). */
interface Conn { ws: WebSocket; telegramId: number; alive: boolean; as?: string }

/** Остановка WS-сервера, созданного attachWs; заполняется в attachWs. */
const closers = new WeakMap<WebSocketServer, () => Promise<void>>();

/**
 * Закрывает WS: завершает все соединения, отписывается от игры, останавливает пинг.
 * Нужно перед app.close(): с опцией server сам wss.close() клиентов не закрывает и не завершается, пока они есть.
 */
export function closeWs(wss: WebSocketServer): Promise<void> {
  return closers.get(wss)?.() ?? new Promise(resolve => wss.close(() => resolve()));
}

/** WebSocket /ws?token=…: проекции состояния и приём команд от имени владельца токена. */
export function attachWs(server: Server, deps: ServerDeps): WebSocketServer {
  const { game, content, config, now } = deps;
  // Проекция ведущего несёт состояние целиком, а его первое сообщение — содержимое: сжатие заметно уменьшает их.
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024, perMessageDeflate: true });
  const conns = new Set<Conn>();
  // Содержимое не меняется за время работы сервера: сообщение сериализуется один раз на все подключения ведущего.
  const contentMsg = JSON.stringify({ kind: 'content', version: content.version, data: contentData(content) });

  const send = (ws: WebSocket, msg: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };

  /** Отправляет проекцию; false — у аккаунта больше нет роли (соединение закрыто). */
  const pushView = (conn: Conn, state: GameState): boolean => {
    const actor = game.actorForToken(conn);
    if (!actor) { conn.ws.close(CLOSE_FORBIDDEN, 'no role'); return false; }
    try {
      send(conn.ws, { kind: 'view', seq: state.seq, view: viewFor(state, content, actor, now()) });
      return true;
    } catch {
      conn.ws.close(CLOSE_FORBIDDEN, 'no view');
      return false;
    }
  };

  const unsubscribe = game.subscribe(state => { for (const c of conns) pushView(c, state); });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const token = new URL(req.url ?? '/', 'http://localhost').searchParams.get('token') ?? '';
    const auth = verifyToken(token, config.sessionSecret, now());
    if (!auth) { ws.close(CLOSE_UNAUTHORIZED, 'unauthorized'); return; }
    const actor = game.actorForToken(auth);
    if (!actor) { ws.close(CLOSE_FORBIDDEN, 'no role'); return; }

    const conn: Conn = { ws, telegramId: auth.telegramId, alive: true, ...(auth.as !== undefined ? { as: auth.as } : {}) };
    // Содержимое несёт тайны (правда истории, секреты и цели ролей): только ведущему, не «Играть за».
    // Ведущий получает его первым, до первой проекции.
    if (actor.type === 'gm') ws.send(contentMsg);
    if (!pushView(conn, game.state())) return;
    conns.add(conn);

    ws.on('pong', () => { conn.alive = true; });
    ws.on('close', () => { conns.delete(conn); });
    ws.on('error', err => console.error('Ошибка WebSocket', err));
    ws.on('message', async data => {
      const parsed = parseCommandMessage(String(data));
      if (!('cmd' in parsed)) {
        send(ws, { kind: 'result', id: parsed.id ?? null, ok: false, error: 'invalid', detail: 'bad message' });
        return;
      }
      // Роль могла смениться (перепривязка ведущим), поэтому actor определяется на каждую команду.
      const actor: Actor | undefined = game.actorForToken(conn);
      if (!actor) { send(ws, { kind: 'result', id: parsed.id, ok: false, error: 'forbidden' }); ws.close(CLOSE_FORBIDDEN, 'no role'); return; }
      try {
        // id клиента живёт в пространстве своего аккаунта: не пересекается с системными
        // (expire:…, bind:…) и с id других игроков.
        const scope = conn.as === undefined ? `ws:${conn.telegramId}` : `ws:${conn.telegramId}:as:${conn.as}`;
        const result = await game.submit(`${scope}:${parsed.id}`, parsed.cmd, actor);
        // Новую проекцию присылает подписка игры; здесь только результат.
        send(ws, { kind: 'result', id: parsed.id, ...result });
      } catch (err) {
        console.error('Ошибка выполнения команды', err);
        send(ws, { kind: 'result', id: parsed.id, ok: false, error: 'internal' });
      }
    });
  });

  const ping = setInterval(() => {
    for (const c of conns) {
      if (!c.alive) { c.ws.terminate(); conns.delete(c); continue; }
      c.alive = false;
      c.ws.ping();
    }
  }, PING_INTERVAL_MS);
  ping.unref();

  let closing: Promise<void> | undefined;
  closers.set(wss, () => {
    closing ??= new Promise<void>(resolve => {
      clearInterval(ping);
      unsubscribe();
      conns.clear();
      // Все сокеты, включая ещё не прошедшие проверку токена.
      for (const ws of wss.clients) ws.terminate();
      wss.close(() => resolve());
    });
    return closing;
  });
  return wss;
}
