import crypto from 'node:crypto';
import { Bot } from 'grammy';
import { config } from '../config.js';
import { store } from '../store.js';
import { MaxClient } from '../max/client.js';
import { MaxManager } from '../max/manager.js';

export const bot = new Bot(config.botToken);

// Временные MAX-клиенты на время ввода SMS-кода (ещё нет постоянного токена).
const pendingAuth = new Map(); // chatId -> { client, tempToken, phone }

// Сессии прохождения капчи: sid -> { chatId, phone }. Живут до завершения входа.
const captchaSessions = new Map();

// Менеджер постоянных соединений. Входящие из MAX -> в Telegram-чат.
const manager = new MaxManager({
  onMessage: async (chatId, msg) => {
    if (msg.chatId) store.update(chatId, { lastMaxChat: msg.chatId });
    const who = msg.from ? `*${escape(String(msg.from))}*\n` : '';
    await bot.api.sendMessage(
      chatId,
      `${who}${escape(msg.text || '[вложение]')}\n\n_чат MAX #${msg.chatId}_`,
      { parse_mode: 'MarkdownV2' },
    );
  },
  onAuthLost: async (chatId) => {
    await bot.api.sendMessage(chatId, 'Сессия MAX истекла. Введите /login, чтобы войти заново.');
  },
});

export async function startBridge() {
  await manager.restoreAll();
}

// Существует ли ещё сессия капчи с таким sid (для рендера страницы).
export function captchaSessionExists(sid) {
  return captchaSessions.has(sid);
}

/**
 * Вызывается HTTP-страницей после прохождения капчи.
 * Получает токен капчи, запрашивает у MAX код и переводит чат в ожидание кода.
 * Возвращает { ok } или { ok:false, error } — страница покажет результат.
 */
export async function completeCaptcha(sid, captchaToken) {
  const sess = captchaSessions.get(sid);
  if (!sess) return { ok: false, error: 'Сессия входа не найдена или устарела. Сделайте /login заново.' };
  const { chatId, phone } = sess;
  try {
    const client = new MaxClient();
    await client.connect();
    const tempToken = await client.requestCode(phone, captchaToken);
    pendingAuth.set(chatId, { client, tempToken, phone });
    captchaSessions.delete(sid);
    store.update(chatId, { state: 'awaiting_code' });
    await bot.api.sendMessage(chatId, 'Проверка пройдена ✅ MAX отправил код. Пришлите его сюда (только цифры).');
    return { ok: true };
  } catch (err) {
    await bot.api.sendMessage(chatId, `Не удалось запросить код: ${err.message}. Сделайте /login снова.`);
    return { ok: false, error: err.message };
  }
}

// ---------- команды ----------

bot.command('start', (ctx) =>
  ctx.reply(
    [
      '👋 Это мост *MAX → Telegram*.',
      '',
      'Мессенджер MAX убрали из российского App Store, и на iPhone им не пользоваться.',
      'Этот бот подключается к твоему аккаунту MAX и присылает все сообщения сюда,',
      'а ответы из этого чата отправляет обратно в MAX.',
      '',
      'Команды:',
      '/login — войти в аккаунт MAX (по номеру телефона)',
      '/logout — отключить аккаунт',
      '/status — статус подключения',
      '',
      'Начни с /login.',
    ].join('\n'),
    { parse_mode: 'Markdown' },
  ),
);

bot.command('status', (ctx) => {
  const s = store.get(ctx.chat.id);
  const online = manager.get(ctx.chat.id) ? 'подключено ✅' : 'не подключено ❌';
  ctx.reply(s?.maxToken ? `MAX: ${online}` : 'Не авторизован. Введите /login.');
});

bot.command('login', async (ctx) => {
  store.update(ctx.chat.id, { state: 'awaiting_phone' });
  await ctx.reply('Отправьте номер телефона аккаунта MAX в формате +79991234567');
});

bot.command('logout', async (ctx) => {
  manager.disconnect(ctx.chat.id);
  pendingAuth.delete(ctx.chat.id);
  store.delete(ctx.chat.id);
  await ctx.reply('Аккаунт MAX отключён. /login — чтобы войти снова.');
});

// ---------- свободный текст: шаги авторизации и пересылка ----------

bot.on('message:text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;

  const session = store.get(chatId) || {};

  // Шаг 1 — ввод телефона. Пытаемся сразу запросить код (рабочий протокол
  // капчу не требует). Только если MAX вернёт captcha.* — даём ссылку на капчу.
  if (session.state === 'awaiting_phone') {
    const phone = text.replace(/[^\d+]/g, '');
    if (!/^\+?\d{10,15}$/.test(phone)) {
      return ctx.reply('Похоже на некорректный номер. Пример: +79991234567');
    }
    await ctx.reply('Подключаюсь к MAX и запрашиваю код…');
    try {
      const client = new MaxClient();
      await client.connect();
      const tempToken = await client.requestCode(phone);
      pendingAuth.set(chatId, { client, tempToken, phone });
      store.update(chatId, { state: 'awaiting_code', phone });
      await ctx.reply('MAX отправил код (в приложение MAX или по SMS). Пришлите его сюда — только цифры.');
    } catch (err) {
      if (String(err.message).startsWith('captcha')) {
        // Фолбэк: MAX всё же требует капчу — даём страницу.
        const sid = crypto.randomBytes(12).toString('hex');
        captchaSessions.set(sid, { chatId, phone });
        store.update(chatId, { state: 'awaiting_captcha', phone });
        await ctx.reply(
          `Нужна проверка. Открой ссылку, пройди капчу, потом введи код здесь:\n${config.webhookUrl}/captcha?sid=${sid}`,
        );
      } else {
        store.update(chatId, { state: 'idle' });
        await ctx.reply(`Не удалось запросить код: ${err.message}. Попробуйте /login снова.`);
      }
    }
    return;
  }

  // Шаг 2 — ввод кода
  if (session.state === 'awaiting_code') {
    const code = text.replace(/\D/g, '');
    const auth = pendingAuth.get(chatId);
    if (!auth) {
      store.update(chatId, { state: 'idle' });
      return ctx.reply('Сессия входа потеряна. Введите /login заново.');
    }
    try {
      const token = await auth.client.confirmCode(auth.tempToken, code);
      auth.client.close();
      pendingAuth.delete(chatId);
      store.update(chatId, { state: 'active', maxToken: token, phone: auth.phone });
      await manager.connect(chatId, token);
      await ctx.reply('✅ Готово! Аккаунт MAX подключён. Сообщения будут приходить сюда.');
    } catch (err) {
      await ctx.reply(`Неверный код или ошибка: ${err.message}. Попробуйте ещё раз или /login.`);
    }
    return;
  }

  // Обычный текст -> отправка в MAX (нужен активный чат-получатель)
  const client = manager.get(chatId);
  if (!client) {
    return ctx.reply('Сначала авторизуйтесь: /login');
  }

  // Цель ответа: либо явно reply на пересланное сообщение (#id в подписи),
  // либо последний активный чат MAX.
  const target = extractMaxChatId(ctx) || session.lastMaxChat;
  if (!target) {
    return ctx.reply('Не понял, в какой чат MAX отправить. Ответьте (reply) на сообщение из нужного чата.');
  }
  try {
    await client.sendMessage(target, text);
    store.update(chatId, { lastMaxChat: target });
  } catch (err) {
    await ctx.reply(`Не отправилось: ${err.message}`);
  }
});

// Если пользователь делает reply на пересланное сообщение — достаём #id чата MAX.
function extractMaxChatId(ctx) {
  const replied = ctx.message.reply_to_message?.text;
  const m = replied?.match(/чат MAX #(\d+)/);
  return m ? Number(m[1]) : null;
}

function escape(s) {
  return String(s).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}
