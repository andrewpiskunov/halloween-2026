import Fastify, { type FastifyInstance } from 'fastify';
import type { Content } from '@fair/shared';
import type { Config } from './config';
import type { Game } from './game';
import { issueToken, verifyInitData, verifyToken } from './auth';

export interface ServerDeps { game: Game; content: Content; config: Config; now: () => number }

interface AuthBody { initData?: unknown; dev?: { userId?: unknown; startParam?: unknown } }

const MAX_START_PARAM = 64;

/** Кто входит: проверенный Telegram-пользователь или dev-вход; null — отказ. */
function identify(body: AuthBody, deps: ServerDeps): { userId: number; startParam?: string } | null {
  const { config, now } = deps;
  if (typeof body.initData === 'string' && body.initData) {
    const data = verifyInitData(body.initData, config.botToken, now());
    if (!data) return null;
    return { userId: data.user.id, startParam: data.startParam };
  }
  if (body.dev && typeof body.dev === 'object' && config.allowDevAuth) {
    const { userId, startParam } = body.dev;
    if (typeof userId !== 'number' || !Number.isSafeInteger(userId)) return null;
    if (startParam !== undefined && typeof startParam !== 'string') return null;
    return { userId, startParam };
  }
  return null;
}

/** HTTP API: здоровье, вход и (только в разработке) коды приглашений. */
export function buildApp(deps: ServerDeps): FastifyInstance {
  const { game, config, now } = deps;
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });

  app.get('/api/health', async () => ({ ok: true, seq: game.state().seq }));

  app.post('/api/auth', async (req, reply) => {
    const body = (req.body ?? {}) as AuthBody;
    const who = typeof body === 'object' ? identify(body, deps) : null;
    if (!who) return reply.code(401).send({ error: 'unauthorized' });
    const { userId, startParam } = who;
    if (startParam && startParam.length <= MAX_START_PARAM) await game.bindByCode(startParam, userId);
    const actor = game.actorFor(userId) ?? null;
    // Токен выдаётся и гостю без роли: клиент может повторить вход позже, а WS откажет без роли.
    return { token: issueToken({ telegramId: userId }, config.sessionSecret, now()), actor, botName: config.botName };
  });

  // Ведущий получает токен «за игрока»: с ним соединение видит и делает всё как этот игрок.
  app.post('/api/gm/as', async (req, reply) => {
    const body = (req.body ?? {}) as { token?: unknown; roleKey?: unknown };
    const auth = typeof body.token === 'string' ? verifyToken(body.token, config.sessionSecret, now()) : null;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    if (typeof body.roleKey !== 'string') return reply.code(400).send({ error: 'invalid' });
    const actor = game.actorForToken({ telegramId: auth.telegramId, as: body.roleKey });
    if (!actor) return reply.code(403).send({ error: 'forbidden' });
    console.log(`Ведущий ${auth.telegramId} открыл экраны игрока ${body.roleKey}`);
    return { token: issueToken({ telegramId: auth.telegramId, as: body.roleKey }, config.sessionSecret, now()), actor, botName: config.botName };
  });

  app.get('/api/dev/codes', async (_req, reply) => {
    if (!config.allowDevAuth) return reply.code(404).send({ error: 'not_found' });
    // state.invites как есть: все коды, которые хранит состояние (до setN состав пуст).
    return { gm: game.gmCode(), roles: game.state().invites };
  });

  return app;
}
