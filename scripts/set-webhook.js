import { config } from '../src/config.js';

// Прописывает (или меняет) вебхук бота на адрес деплоя.
// Локально:  npm run set-webhook
// На Vercel: запускается один раз после деплоя (или вручную тем же скриптом),
//            путь фиксированный — /api/webhook.
const url = `${config.webhookUrl}/api/webhook`;

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
