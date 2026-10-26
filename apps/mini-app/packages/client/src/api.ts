import type { Actor, Command, GmView, PlayerView } from '@fair/shared';
import { BASE } from './base';

/** Коды ошибок команд, которые присылает сервер. */
export type ErrorCode =
  | 'phase' | 'forbidden' | 'not_found' | 'not_owner' | 'insufficient' | 'reserved' | 'limit' | 'invalid' | 'internal';

/** Результат команды по протоколу WebSocket. */
export type CmdResult = { ok: true; seq: number } | { ok: false; error: ErrorCode; detail?: string };

export type View = PlayerView | GmView;

/** Состояние соединения: последние три — окончательные, переподключения нет. */
export type Status = 'connecting' | 'open' | 'closed' | 'unauthorized' | 'no_role' | 'no_auth';

export interface AuthResult { token: string; actor: Exclude<Actor, { type: 'system' }> | null; botName: string }

export interface Connection {
  send(cmd: Command): Promise<CmdResult>;
  close(): void;
}

export interface ConnectOptions {
  WebSocketImpl?: typeof WebSocket;
  /** Паузы переподключения в мс; последняя повторяется. */
  delays?: number[];
  /** Начало адреса WebSocket, например `wss://example.org`; по умолчанию из `location`. */
  base?: string;
}

interface TelegramWebApp { initData?: string; ready(): void; expand(): void }
declare global {
  interface Window { Telegram?: { WebApp?: TelegramWebApp } }
}

export const CLOSE_UNAUTHORIZED = 4401;
export const CLOSE_NO_ROLE = 4403;
const DEFAULT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const OPEN = 1;

/** Вход: через initData Telegram, а без него dev-входом по `?dev=<userId>&code=<код>`. */
export async function auth(): Promise<AuthResult> {
  const initData = window.Telegram?.WebApp?.initData ?? '';
  let body: unknown;
  if (initData) {
    body = { initData };
  } else {
    const params = new URLSearchParams(location.search);
    const dev = params.get('dev');
    if (!dev) throw new Error('no_auth');
    const code = params.get('code') ?? undefined;
    body = { dev: { userId: Number(dev), ...(code ? { startParam: code } : {}) } };
  }
  const res = await fetch(`${BASE}api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`auth_failed_${res.status}`);
  return res.json() as Promise<AuthResult>;
}

/** Ведущий получает токен «за игрока»: соединение с ним видит и делает всё как этот игрок. */
export async function authAs(token: string, roleKey: string): Promise<AuthResult> {
  const res = await fetch(`${BASE}api/gm/as`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, roleKey }),
  });
  if (!res.ok) throw new Error(`as_failed_${res.status}`);
  return res.json() as Promise<AuthResult>;
}

function defaultBase(): string {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
}

/**
 * Соединение с сервером: проекции в onView, команды через send.
 * Неподтверждённые команды хранятся до результата и после переподключения
 * уходят повторно с тем же id (сервер не выполнит одну команду дважды).
 */
export function connect(
  token: string,
  onView: (view: View) => void,
  onStatus: (status: Status) => void,
  { WebSocketImpl = WebSocket, delays = DEFAULT_DELAYS, base = defaultBase() }: ConnectOptions = {},
): Connection {
  const pending = new Map<string, { resolve: (r: CmdResult) => void; cmd: Command }>();
  const url = `${base}${BASE}ws?token=${encodeURIComponent(token)}`;
  let ws: WebSocket | undefined;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const transmit = (id: string, cmd: Command) => {
    if (ws?.readyState === OPEN) ws.send(JSON.stringify({ kind: 'cmd', id, cmd }));
  };

  /** Окончательный отказ: ожидающие команды завершаются ошибкой, чтобы интерфейс не завис. */
  const stop = (status: Status) => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    for (const { resolve } of pending.values()) resolve({ ok: false, error: 'forbidden' });
    pending.clear();
    onStatus(status);
  };

  const open = () => {
    onStatus('connecting');
    const socket = new WebSocketImpl(url);
    ws = socket;
    socket.onopen = () => {
      attempt = 0;
      onStatus('open');
      for (const [id, { cmd }] of pending) transmit(id, cmd);
    };
    socket.onmessage = ev => {
      let msg: any;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg?.kind === 'view') onView(msg.view as View);
      else if (msg?.kind === 'result' && typeof msg.id === 'string') {
        const entry = pending.get(msg.id);
        if (!entry) return;
        pending.delete(msg.id);
        const { kind: _kind, id: _id, ...result } = msg;
        entry.resolve(result as CmdResult);
      }
    };
    socket.onclose = ev => {
      if (ws !== socket || stopped) return;
      ws = undefined;
      if (ev.code === CLOSE_UNAUTHORIZED) return stop('unauthorized');
      if (ev.code === CLOSE_NO_ROLE) return stop('no_role');
      onStatus('closed');
      const delay = delays[Math.min(attempt, delays.length - 1)];
      attempt += 1;
      timer = setTimeout(() => { timer = undefined; if (!stopped) open(); }, delay);
    };
  };

  open();

  return {
    send(cmd) {
      const id = crypto.randomUUID();
      if (stopped) return Promise.resolve({ ok: false, error: 'forbidden' });
      return new Promise<CmdResult>(resolve => {
        pending.set(id, { resolve, cmd });
        transmit(id, cmd);
      });
    },
    close() {
      if (stopped) return;
      stop('closed');
      const socket = ws;
      ws = undefined;
      socket?.close();
    },
  };
}
