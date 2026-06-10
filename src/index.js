import { webhookCallback } from 'grammy';
import http from 'node:http';
import { config } from './config.js';
import { bot, startBridge, captchaSessionExists, completeCaptcha } from './bot/bot.js';
import { renderCaptchaPage } from './bot/captcha-page.js';

function readJson(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

// grammY превращает входящий апдейт Telegram в вызов наших обработчиков.
const handleUpdate = webhookCallback(bot, 'http', {
  secretToken: config.webhookSecret,
});

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200).end('MAX↔Telegram bridge is running');
    return;
  }
  const url = new URL(req.url || '/', 'http://localhost');
  const path = url.pathname;

  // Страница капчи: пользователь открывает ссылку из чата.
  if (req.method === 'GET' && path === '/captcha') {
    const sid = url.searchParams.get('sid') || '';
    if (!captchaSessionExists(sid)) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<h1>Ссылка устарела. Сделайте /login в боте заново.</h1>');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(renderCaptchaPage({ sid, sitekey: config.captchaSitekey }));
    return;
  }

  // Приём токена капчи со страницы.
  if (req.method === 'POST' && path === '/captcha/submit') {
    const { sid, token } = await readJson(req);
    const result = await completeCaptcha(sid, token);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // Единый путь вебхука и для Render (этот сервер), и для Vercel (api/webhook.js).
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
