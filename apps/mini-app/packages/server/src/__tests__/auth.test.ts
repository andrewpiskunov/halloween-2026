import { createHmac } from 'node:crypto';
import { expect, test } from 'vitest';
import { issueToken, verifyInitData, verifyToken } from '../auth';

const BOT_TOKEN = '123456:TEST-fake-token';
const NOW = 1_800_000_000_000;

/** Подписать initData по алгоритму Telegram. */
function sign(params: Record<string, string>, botToken = BOT_TOKEN): string {
  const check = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...params, hash }).toString();
}

const user = JSON.stringify({ id: 4242, first_name: 'Тестовая' });
const fresh = () => String(Math.floor(NOW / 1000) - 60);

test('верная подпись: user.id и startParam извлечены', () => {
  const initData = sign({ auth_date: fresh(), query_id: 'Q1', user, start_param: 'AbCdEf123456' });
  const r = verifyInitData(initData, BOT_TOKEN, NOW);
  expect(r).not.toBeNull();
  expect(r!.user.id).toBe(4242);
  expect(r!.user.first_name).toBe('Тестовая');
  expect(r!.startParam).toBe('AbCdEf123456');

  const noStart = verifyInitData(sign({ auth_date: fresh(), user }), BOT_TOKEN, NOW);
  expect(noStart?.user.id).toBe(4242);
  expect(noStart?.startParam).toBeUndefined();
});

test('подмена user → null; auth_date старше 24 ч → null', () => {
  const initData = sign({ auth_date: fresh(), user });
  const forged = new URLSearchParams(initData);
  forged.set('user', JSON.stringify({ id: 1, first_name: 'Злоумышленник' }));
  expect(verifyInitData(forged.toString(), BOT_TOKEN, NOW)).toBeNull();

  expect(verifyInitData(initData, 'другой:токен', NOW)).toBeNull();
  const noHash = new URLSearchParams(initData);
  noHash.delete('hash');
  expect(verifyInitData(noHash.toString(), BOT_TOKEN, NOW)).toBeNull();
  const shortHash = new URLSearchParams(initData);
  shortHash.set('hash', 'abc');
  expect(verifyInitData(shortHash.toString(), BOT_TOKEN, NOW)).toBeNull();

  const old = sign({ auth_date: String(Math.floor(NOW / 1000) - 86401), user });
  expect(verifyInitData(old, BOT_TOKEN, NOW)).toBeNull();
  const edge = sign({ auth_date: String(Math.floor(NOW / 1000) - 86400), user });
  expect(verifyInitData(edge, BOT_TOKEN, NOW)).not.toBeNull();
});

test('token выдан и проверен; с другим секретом null; через 13 ч null', () => {
  const secret = 'тестовый-секрет';
  const token = issueToken({ telegramId: 4242 }, secret, NOW);
  expect(verifyToken(token, secret, NOW)).toEqual({ telegramId: 4242 });
  expect(verifyToken(token, secret, NOW + 11 * 3600_000)).toEqual({ telegramId: 4242 });
  expect(verifyToken(token, 'другой', NOW)).toBeNull();
  expect(verifyToken(token, secret, NOW + 13 * 3600_000)).toBeNull();

  const [body, sig] = token.split('.');
  const tampered = Buffer.from(JSON.stringify({ telegramId: 1, exp: NOW + 1e9 })).toString('base64url');
  expect(verifyToken(`${tampered}.${sig}`, secret, NOW)).toBeNull();
  expect(verifyToken(body, secret, NOW)).toBeNull();
  expect(verifyToken('мусор', secret, NOW)).toBeNull();
});
