import { Bot, InlineKeyboard } from 'grammy';
import type { Config } from './config';

/** Бот с кнопкой открытия Mini App; запускается только при BOT_POLLING=1 и заданном токене. */
export function startBot(config: Config): Bot | undefined {
  if (!config.botPolling || !config.botToken) return undefined;
  const bot = new Bot(config.botToken);
  bot.command('start', ctx => ctx.reply('Добро пожаловать на ярмарку! Нажмите кнопку, чтобы войти.', {
    reply_markup: new InlineKeyboard().webApp('Открыть ярмарку', config.clientUrl),
  }));
  bot.catch(err => console.error('Ошибка бота', err.error));
  bot.start().catch(err => console.error('Не удалось запустить бота', err));
  return bot;
}
