import { config, webhookPath } from '../src/config.js';

// Прописывает (или меняет) вебхук бота на наш публичный URL.
// Запуск: npm run set-webhook
const url = `${config.webhookUrl}${webhookPath}`;

const res = await fetch(`https://api.telegram.org/bot${config.botToken}/setWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    url,
    secret_token: config.webhookSecret,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  }),
});

const data = await res.json();
if (data.ok) {
  console.log(`✅ Webhook установлен:\n   ${url}`);
} else {
  console.error('❌ Не удалось установить webhook:', data.description);
  process.exit(1);
}
