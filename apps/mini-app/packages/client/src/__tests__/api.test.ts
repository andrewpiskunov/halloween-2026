import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { connect, exportUrlFor, openExternal, type Status } from '../api';

/** Поддельный WebSocket: тест сам открывает, роняет соединение и присылает сообщения. */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: any[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;

  constructor(public url: string) { FakeWebSocket.instances.push(this); }
  send(data: string) {
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error('сокет не открыт');
    this.sent.push(JSON.parse(data));
  }
  close() { this.drop(1000); }

  open() { this.readyState = FakeWebSocket.OPEN; this.onopen?.({}); }
  receive(msg: unknown) { this.onmessage?.({ data: JSON.stringify(msg) }); }
  drop(code = 1006) {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code });
  }
}

const last = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
const cmd = { type: 'shop.buy', ingredient: 'ash' } as const;

function setup() {
  const views: unknown[] = [];
  const statuses: Status[] = [];
  const conn = connect('tok en', v => views.push(v), s => statuses.push(s), {
    WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    base: 'ws://test',
  });
  return { conn, views, statuses };
}

beforeEach(() => { FakeWebSocket.instances = []; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('connect', () => {
  test('открывает /ws с токеном и передаёт проекции', () => {
    const { views, statuses } = setup();
    expect(last().url).toBe('ws://test/ws?token=tok%20en');
    last().open();
    last().receive({ kind: 'view', seq: 1, view: { kind: 'player' } });
    expect(views).toEqual([{ kind: 'player' }]);
    expect(statuses).toContain('open');
  });

  test('send возвращает результат с совпадающим id', async () => {
    const { conn } = setup();
    last().open();
    const p1 = conn.send(cmd);
    const p2 = conn.send({ type: 'offer.cancel', id: 'o1' });
    const [m1, m2] = last().sent;
    expect(m1).toMatchObject({ kind: 'cmd', cmd });
    expect(typeof m1.id).toBe('string');
    expect(m1.id).not.toBe(m2.id);
    last().receive({ kind: 'result', id: m2.id, ok: false, error: 'not_found' });
    last().receive({ kind: 'result', id: m1.id, ok: true, seq: 5 });
    await expect(p1).resolves.toEqual({ ok: true, seq: 5 });
    await expect(p2).resolves.toEqual({ ok: false, error: 'not_found' });
  });

  test('команда при закрытом сокете ждёт в очереди и уходит после переподключения с тем же id', async () => {
    const { conn } = setup();
    last().open();
    last().drop();
    const p = conn.send(cmd);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(last().sent).toEqual([]);
    last().open();
    expect(last().sent).toHaveLength(1);
    const { id } = last().sent[0];
    expect(last().sent[0]).toEqual({ kind: 'cmd', id, cmd });
    last().receive({ kind: 'result', id, ok: true, seq: 2 });
    await expect(p).resolves.toEqual({ ok: true, seq: 2 });
  });

  test('команда без результата до обрыва повторяется после переподключения с тем же id', async () => {
    const { conn } = setup();
    last().open();
    const p = conn.send(cmd);
    const first = last().sent[0];
    last().drop();
    vi.advanceTimersByTime(1000);
    last().open();
    expect(last().sent).toEqual([first]);
    last().receive({ kind: 'result', id: first.id, ok: true, seq: 3 });
    await expect(p).resolves.toEqual({ ok: true, seq: 3 });
    // после результата повторной отправки уже нет
    last().drop();
    vi.advanceTimersByTime(1000);
    last().open();
    expect(last().sent).toEqual([]);
  });

  test('паузы переподключения 1, 2, 4, 8, 16, 30, 30 с', () => {
    setup();
    const delays = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    for (const d of delays) {
      const before = FakeWebSocket.instances.length;
      last().drop();
      vi.advanceTimersByTime(d - 1);
      expect(FakeWebSocket.instances).toHaveLength(before);
      vi.advanceTimersByTime(1);
      expect(FakeWebSocket.instances).toHaveLength(before + 1);
    }
  });

  test('после успешного открытия пауза снова начинается с 1 с', () => {
    setup();
    last().drop();
    vi.advanceTimersByTime(1000);
    last().drop();
    vi.advanceTimersByTime(2000);
    last().open();
    last().drop();
    const before = FakeWebSocket.instances.length;
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(before + 1);
  });

  test('коды 4401 и 4403 останавливают переподключение', () => {
    const a = setup();
    last().drop(4401);
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(a.statuses.at(-1)).toBe('unauthorized');

    FakeWebSocket.instances = [];
    const b = setup();
    last().drop(4403);
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(b.statuses.at(-1)).toBe('no_role');
  });

  test('close() закрывает сокет и больше не переподключается', () => {
    const { conn } = setup();
    last().open();
    conn.close();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

describe('выгрузка журнала', () => {
  test('exportUrlFor: адрес маршрута под базовым путём с токеном в query', () => {
    expect(exportUrlFor('https://wta5.ru', '/fair/', 'a+b/c.d=')).toBe('https://wta5.ru/fair/api/gm/export?token=a%2Bb%2Fc.d%3D');
    expect(exportUrlFor('http://localhost:5173', '/', 'tok')).toBe('http://localhost:5173/api/gm/export?token=tok');
  });

  test('openExternal: через Telegram.WebApp.openLink, без него window.open', () => {
    const openLink = vi.fn();
    const open = vi.fn();
    vi.stubGlobal('window', { Telegram: { WebApp: { openLink } }, open });
    openExternal('https://x/a');
    expect(openLink).toHaveBeenCalledWith('https://x/a');
    expect(open).not.toHaveBeenCalled();
    vi.stubGlobal('window', { Telegram: { WebApp: { initData: '' } }, open });
    openExternal('https://x/b');
    expect(open).toHaveBeenCalledWith('https://x/b', '_blank');
    vi.unstubAllGlobals();
  });
});
