import WebSocket from 'ws';
import type { Actor, Command, GmView, PlayerView } from '@fair/shared';

/** Ответ сервера на команду и время от отправки до ответа. */
export interface CmdOutcome { ok: boolean; seq?: number; error?: string; detail?: string; ms: number }

/** Соединение бота: последняя проекция, её seq и результаты команд по id. */
export interface BotConn {
  readonly actor: Actor;
  view(): PlayerView | GmView;
  seq(): number;
  send(cmd: Command): Promise<CmdOutcome>;
  waitSeq(seq: number, timeoutMs?: number): Promise<void>;
  maxViewBytes(): number;
  close(): void;
}

type ServerMsg =
  | { kind: 'view'; seq: number; view: PlayerView | GmView }
  | { kind: 'result'; id: string | null; ok: boolean; seq?: number; error?: string; detail?: string };

/** Коды приглашений из dev-эндпоинта: ведущего и ролей состава. */
export async function fetchCodes(baseUrl: string): Promise<{ gm: string; roles: Record<string, string> }> {
  const res = await fetch(`${baseUrl}/api/dev/codes`);
  if (!res.ok) throw new Error(`GET /api/dev/codes: ${res.status} (сервер запущен без ALLOW_DEV_AUTH?)`);
  return res.json() as Promise<{ gm: string; roles: Record<string, string> }>;
}

/**
 * Dev-вход POST /api/auth с кодом приглашения, затем WebSocket /ws?token=.
 * Возвращается, когда пришла первая проекция.
 */
export async function openBot(baseUrl: string, userId: number, code: string): Promise<BotConn> {
  const res = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dev: { userId, startParam: code } }),
  });
  if (!res.ok) throw new Error(`вход ${userId}: HTTP ${res.status}`);
  const auth = await res.json() as { token: string; actor: Actor | null };
  if (!auth.actor) throw new Error(`вход ${userId}: роль не получена по коду ${code}`);
  const actor = auth.actor;

  const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(auth.token)}`;
  const ws = new WebSocket(wsUrl);

  let lastView: PlayerView | GmView | undefined;
  let lastSeq = -1;
  let maxBytes = 0;
  let nextId = 0;
  let closed: Error | undefined;
  const pending = new Map<string, { started: number; resolve: (o: CmdOutcome) => void; reject: (e: Error) => void }>();
  let seqWaiters: { seq: number; resolve: () => void; reject: (e: Error) => void }[] = [];
  let first: { resolve: () => void; reject: (e: Error) => void } | undefined;
  const firstView = new Promise<void>((resolve, reject) => { first = { resolve, reject }; });

  const fail = (err: Error) => {
    closed ??= err;
    first?.reject(err);
    for (const p of pending.values()) p.reject(err);
    pending.clear();
    for (const w of seqWaiters) w.reject(err);
    seqWaiters = [];
  };

  ws.on('message', data => {
    const text = String(data);
    const msg = JSON.parse(text) as ServerMsg;
    if (msg.kind === 'view') {
      maxBytes = Math.max(maxBytes, Buffer.byteLength(text));
      lastView = msg.view;
      lastSeq = msg.seq;
      first?.resolve();
      const ready = seqWaiters.filter(w => w.seq <= msg.seq);
      seqWaiters = seqWaiters.filter(w => w.seq > msg.seq);
      for (const w of ready) w.resolve();
      return;
    }
    if (msg.kind === 'result' && msg.id !== null) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      const { kind: _kind, id: _id, ...rest } = msg;
      p.resolve({ ...rest, ms: performance.now() - p.started });
    }
  });
  ws.on('close', (code, reason) => fail(new Error(`соединение ${userId} закрыто: ${code} ${String(reason)}`)));
  ws.on('error', err => fail(err));

  await firstView;
  first = undefined;

  return {
    actor,
    view: () => lastView!,
    seq: () => lastSeq,
    send(cmd: Command): Promise<CmdOutcome> {
      if (closed) return Promise.reject(closed);
      const id = String(++nextId);
      return new Promise((resolve, reject) => {
        pending.set(id, { started: performance.now(), resolve, reject });
        ws.send(JSON.stringify({ kind: 'cmd', id, cmd }));
      });
    },
    waitSeq(seq: number, timeoutMs = 5000): Promise<void> {
      if (lastSeq >= seq) return Promise.resolve();
      if (closed) return Promise.reject(closed);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          seqWaiters = seqWaiters.filter(w => w !== waiter);
          reject(new Error(`бот ${userId}: нет проекции с seq ≥ ${seq} за ${timeoutMs} мс (последний seq ${lastSeq})`));
        }, timeoutMs);
        const waiter = {
          seq,
          resolve: () => { clearTimeout(timer); resolve(); },
          reject: (e: Error) => { clearTimeout(timer); reject(e); },
        };
        seqWaiters.push(waiter);
      });
    },
    maxViewBytes: () => maxBytes,
    close: () => { ws.close(); },
  };
}
