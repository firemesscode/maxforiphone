import { webhookCallback } from 'grammy';
import { config } from '../src/config.js';
import { bot } from '../src/bot/bot.js';

// Точка входа для Vercel (serverless). Сюда указывает вебхук Telegram-бота:
//   https://<твой-проект>.vercel.app/api/webhook
//
// Vercel сам инициализирует функцию на каждый запрос, поэтому bot.init()
// вызываем лениво один раз на «тёплый» инстанс.
let inited = false;

const handle = webhookCallback(bot, 'https', {
  secretToken: config.webhookSecret,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(200).send('MAX↔Telegram webhook is up');
    return;
  }
  try {
    if (!inited) {
      await bot.init();
      inited = true;
    }
    await handle(req, res);
  } catch (err) {
    console.error('[vercel webhook]', err);
    if (!res.headersSent) res.status(500).end();
  }
}
