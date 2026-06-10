import { webhookCallback } from 'grammy';
import http from 'node:http';
import { config } from './config.js';
import { bot, startBridge } from './bot/bot.js';

// grammY превращает входящий апдейт Telegram в вызов наших обработчиков.
const handleUpdate = webhookCallback(bot, 'http', {
  secretToken: config.webhookSecret,
});

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200).end('MAX↔Telegram bridge is running');
    return;
  }
  // Единый путь вебхука и для Render (этот сервер), и для Vercel (api/webhook.js).
  const path = (req.url || '').split('?')[0];
  if (req.method === 'POST' && path === '/api/webhook') {
    try {
      await handleUpdate(req, res);
    } catch (err) {
      console.error('[webhook]', err);
      if (!res.headersSent) res.writeHead(500).end();
    }
    return;
  }
  res.writeHead(404).end();
});

async function main() {
  await bot.init();
  await startBridge(); // поднять сохранённые MAX-сессии после рестарта

  server.listen(config.port, () => {
    console.log(`[server] слушаю порт ${config.port}`);
    console.log('[server] webhook path: /api/webhook');
    console.log(`[bot] @${bot.botInfo.username} готов`);
    console.log('\nЗапусти `npm run set-webhook`, чтобы прописать вебхук в Telegram.');
  });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
