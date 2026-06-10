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
  webhookSecret: process.env.WEBHOOK_SECRET || crypto.randomBytes(16).toString('hex'),
  maxWsUrl: process.env.MAX_WS_URL || 'wss://ws-api.oneme.ru/websocket',
  sessionsFile: process.env.SESSIONS_FILE || './data/sessions.json',
};

// Путь, по которому Telegram будет стучать в наш сервер.
// Секретный, чтобы посторонние не слали фейковые апдейты.
export const webhookPath = `/tg/${config.webhookSecret}`;
