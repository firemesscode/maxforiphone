import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// Простое файловое хранилище сессий.
// Ключ — Telegram chat id, значение — данные сессии MAX и состояние диалога.
// Для продакшена легко заменить на Redis/Postgres, не меняя интерфейс.

const file = path.resolve(config.sessionsFile);

function load() {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function persist(data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let cache = load();

export const store = {
  get(chatId) {
    return cache[String(chatId)] || null;
  },
  set(chatId, session) {
    cache[String(chatId)] = { ...this.get(chatId), ...session };
    persist(cache);
    return cache[String(chatId)];
  },
  update(chatId, patch) {
    return this.set(chatId, patch);
  },
  delete(chatId) {
    delete cache[String(chatId)];
    persist(cache);
  },
  all() {
    return Object.entries(cache).map(([chatId, session]) => ({ chatId, session }));
  },
};
