import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_INIT_DATA_AGE_S = 86400;
const TOKEN_TTL_MS = 12 * 3600_000;

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Проверка initData Telegram Mini App по алгоритму Telegram; null при любой ошибке. */
export function verifyInitData(initData: string, botToken: string, now: number):
  { user: { id: number; first_name: string }; startParam?: string } | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  const pairs: [string, string][] = [];
  params.forEach((value, key) => { if (key !== 'hash') pairs.push([key, value]); });
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const checkString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(checkString).digest();
  if (!/^[0-9a-f]+$/i.test(hash) || !safeEqual(Buffer.from(hash, 'hex'), expected)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || now / 1000 - authDate > MAX_INIT_DATA_AGE_S) return null;

  const rawUser = params.get('user');
  if (!rawUser) return null;
  try {
    const user = JSON.parse(rawUser) as { id: number; first_name: string };
    if (typeof user?.id !== 'number') return null;
    const startParam = params.get('start_param') ?? undefined;
    return startParam === undefined ? { user } : { user, startParam };
  } catch {
    return null;
  }
}

const sign = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('base64url');

/** Токен сессии: base64url(JSON) + '.' + подпись HMAC-SHA256, срок 12 ч. */
export function issueToken(payload: { telegramId: number }, secret: string, now: number): string {
  const body = Buffer.from(JSON.stringify({ telegramId: payload.telegramId, exp: now + TOKEN_TTL_MS })).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function verifyToken(token: string, secret: string, now: number): { telegramId: number } | null {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  if (!safeEqual(Buffer.from(sig), Buffer.from(sign(body, secret)))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { telegramId: unknown; exp: unknown };
    if (typeof data.telegramId !== 'number' || typeof data.exp !== 'number' || data.exp <= now) return null;
    return { telegramId: data.telegramId };
  } catch {
    return null;
  }
}
