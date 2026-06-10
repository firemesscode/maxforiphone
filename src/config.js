import 'dotenv/config';
import crypto from 'node:crypto';

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`\n[config] Не задана обязательная переменная окружения ${name}.`);
    console.error('Скопируй .env.example в .env и заполни BOT_TOKEN и WEBHOOK_URL.\n');
    process.exit(1);
  }
  return value;
}

export const config = {
  botToken: required('BOT_TOKEN'),
  webhookUrl: required('WEBHOOK_URL').replace(/\/+$/, ''),
  port: Number(process.env.PORT || 8080),
  // Должен быть одинаков и у работающей функции, и у скрипта set-webhook.
  // Если не задан явно — детерминированно выводим из токена бота, чтобы на
  // serverless (Vercel) он не менялся между холодными стартами.
  webhookSecret:
    process.env.WEBHOOK_SECRET ||
    crypto.createHash('sha256').update(required('BOT_TOKEN')).digest('hex').slice(0, 32),
  maxWsUrl: process.env.MAX_WS_URL || 'wss://ws-api.oneme.ru/websocket',
  // Ключ капчи (Yandex SmartCaptcha), который использует web.max.ru.
  // Берётся со страницы входа web.max.ru (DevTools → элемент капчи, data-sitekey).
  captchaSitekey: process.env.MAX_CAPTCHA_SITEKEY || '',
  sessionsFile: process.env.SESSIONS_FILE || './data/sessions.json',
};

// Путь, по которому Telegram будет стучать в наш сервер.
// Секретный, чтобы посторонние не слали фейковые апдейты.
export const webhookPath = `/tg/${config.webhookSecret}`;
