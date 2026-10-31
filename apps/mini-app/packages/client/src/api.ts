import type { Actor, Command, ContentData, GmView, PlayerView } from '@fair/shared';
import { BASE } from './base';

/** Коды ошибок команд, которые присылает сервер. */
export type ErrorCode =
  | 'phase' | 'forbidden' | 'not_found' | 'not_owner' | 'insufficient' | 'reserved' | 'limit' | 'invalid' | 'internal';

/** Результат команды по протоколу WebSocket. */
export type CmdResult = { ok: true; seq: number } | { ok: false; error: ErrorCode; detail?: string };

export type View = PlayerView | GmView;

/**
 * Состояние соединения. unauthorized, no_role и no_auth окончательные, сами не переподключаются.
 * auth_failed: вход не прошёл из-за сети или ответа сервера; экран предлагает «Повторить».
 */
export type Status = 'connecting' | 'open' | 'closed' | 'unauthorized' | 'no_role' | 'no_auth' | 'auth_failed';

export interface AuthResult { token: string; actor: Exclude<Actor, { type: 'system' }> | null; botName: string }

export interface Connection {
  send(cmd: Command): Promise<CmdResult>;
  close(): void;
  /** Переподключиться сейчас, не дожидаясь паузы. Если сокет открыт, открывается или соединение остановлено, ничего не делает. */
  retryNow(): void;
}

export interface ConnectOptions {
  WebSocketImpl?: typeof WebSocket;
  /** Паузы переподключения в мс; последняя повторяется. */
  delays?: number[];
  /** Начало адреса WebSocket, например `wss://example.org`; по умолчанию из `location`. */
  base?: string;
  /** Содержимое игры: сервер присылает его первым сообщением, только подключению ведущего. */
  onContent?: (data: ContentData) => void;
}

interface TelegramWebApp { initData?: string; ready(): void; expand(): void; openLink?(url: string): void; BackButton?: { show(): void; hide(): void; onClick(fn: () => void): void; offClick(fn: () => void): void } }
declare global {
  interface Window { Telegram?: { WebApp?: TelegramWebApp } }
}

export const CLOSE_UNAUTHORIZED = 4401;
export const CLOSE_NO_ROLE = 4403;
const DEFAULT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const OPEN = 1;

let idCounter = 0;
/**
 * Id команды. Старые WebView (и страницы не по https) не знают crypto.randomUUID,
 * поэтому запасной вариант: время, счётчик и случайный хвост (решение этапа 7, §4.3).
 * Сервер требует от id только уникальности.
 */
function commandId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

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

/** Адрес выгрузки журнала: токен в query, потому что внешний браузер не передаст заголовок. */
export function exportUrlFor(origin: string, base: string, token: string): string {
  return `${origin}${base}api/gm/export?token=${encodeURIComponent(token)}`;
}

/** Открывает ссылку вне Mini App: в Telegram через openLink, без него в новой вкладке. */
export function openExternal(url: string): void {
  const openLink = window.Telegram?.WebApp?.openLink;
  if (openLink) openLink.call(window.Telegram!.WebApp, url);
  else window.open(url, '_blank');
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
  { WebSocketImpl = WebSocket, delays = DEFAULT_DELAYS, base = defaultBase(), onContent }: ConnectOptions = {},
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
      else if (msg?.kind === 'content') onContent?.(msg.data as ContentData);
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
      const id = commandId();
      if (stopped) return Promise.resolve({ ok: false, error: 'forbidden' });
      return new Promise<CmdResult>(resolve => {
        pending.set(id, { resolve, cmd });
        transmit(id, cmd);
      });
    },
    retryNow() {
      if (stopped || ws !== undefined) return;
      if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
      open();
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
