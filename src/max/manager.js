import { MaxClient } from './client.js';
import { store } from '../store.js';

/**
 * Держит по одному живому MAX-соединению на каждый авторизованный Telegram-чат
 * и пробрасывает входящие сообщения MAX обратно в Telegram через колбэк onMessage.
 */
export class MaxManager {
  constructor({ onMessage, onAuthLost }) {
    this.onMessage = onMessage;
    this.onAuthLost = onAuthLost;
    this.clients = new Map(); // chatId -> MaxClient
  }

  /** Поднять соединения для всех, у кого уже есть сохранённый токен (после рестарта). */
  async restoreAll() {
    for (const { chatId, session } of store.all()) {
      if (session?.maxToken) {
        try {
          await this.connect(chatId, session.maxToken);
        } catch (err) {
          console.error(`[max] restore ${chatId} failed:`, err.message);
        }
      }
    }
  }

  async connect(chatId, token) {
    this.disconnect(chatId);
    const client = new MaxClient({ token });

    client.on('message', (msg) => this.onMessage(chatId, msg));
    client.on('authNeeded', () => {
      store.update(chatId, { maxToken: null, state: 'idle' });
      this.disconnect(chatId);
      this.onAuthLost(chatId);
    });
    client.on('error', (err) => console.error(`[max ${chatId}]`, err.message));

    await client.connect();
    this.clients.set(chatId, client);
    return client;
  }

  get(chatId) {
    return this.clients.get(chatId) || null;
  }

  disconnect(chatId) {
    const c = this.clients.get(chatId);
    if (c) {
      c.removeAllListeners();
      c.close();
      this.clients.delete(chatId);
    }
  }
}
