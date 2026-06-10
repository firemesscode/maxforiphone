import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { config } from '../config.js';

/**
 * MaxClient — тонкий адаптер над WebSocket-шлюзом мессенджера MAX.
 *
 * MAX (как и большинство современных мессенджеров) использует постоянное
 * WebSocket-соединение, по которому ходят запросы вида {ver, cmd, seq, opcode, payload}
 * и в ответ приходят сообщения с тем же seq, а также push-события (новые сообщения).
 *
 * Реальные числовые opcode'ы — это единственное, что зависит от текущей версии
 * протокола MAX. Они вынесены в один объект OPCODES ниже: если MAX обновит
 * протокол, правится только он, остальной код трогать не нужно.
 *
 * Класс наследует EventEmitter и эмитит:
 *   'ready'                 — соединение установлено
 *   'message'  ({ chatId, from, text, ts }) — входящее сообщение из MAX
 *   'authNeeded'            — токен протух, нужна повторная авторизация
 *   'close' / 'error'
 */

const OPCODES = {
  HANDSHAKE: 6,
  REQUEST_CODE: 17, // запросить SMS-код по номеру телефона
  CONFIRM_CODE: 18, // подтвердить код -> получить токен сессии
  AUTH_TOKEN: 19, // авторизоваться существующим токеном
  SEND_MESSAGE: 64,
  NEW_MESSAGE: 128, // push: новое входящее сообщение
};

export class MaxClient extends EventEmitter {
  constructor({ token = null } = {}) {
    super();
    this.token = token;
    this.ws = null;
    this.seq = 0;
    this.pending = new Map(); // seq -> { resolve, reject }
    this.connected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(config.maxWsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 MAX-Web',
          Origin: 'https://web.max.ru',
        },
      });

      this.ws.on('open', async () => {
        this.connected = true;
        try {
          await this._handshake();
          if (this.token) await this._authByToken(this.token);
          this.emit('ready');
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      this.ws.on('message', (raw) => this._onMessage(raw));
      this.ws.on('close', () => {
        this.connected = false;
        this.emit('close');
      });
      this.ws.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });
    });
  }

  // ---- публичный API авторизации ----

  /** Запросить SMS-код. Возвращает токен-черновик (temp_token) для подтверждения. */
  async requestCode(phone) {
    const res = await this._request(OPCODES.REQUEST_CODE, {
      phone,
      type: 'START_AUTH',
      language: 'ru',
    });
    return res.token; // временный токен, нужен на шаге confirmCode
  }

  /** Подтвердить SMS-код. Возвращает постоянный токен сессии. */
  async confirmCode(tempToken, code) {
    const res = await this._request(OPCODES.CONFIRM_CODE, {
      token: tempToken,
      code,
    });
    this.token = res.tokenAttrs?.LOGIN?.token || res.token;
    return this.token;
  }

  /** Отправить текстовое сообщение в чат MAX. */
  async sendMessage(chatId, text) {
    return this._request(OPCODES.SEND_MESSAGE, {
      chatId: Number(chatId),
      message: { text, cid: Date.now(), elements: [] },
      notify: true,
    });
  }

  close() {
    this.ws?.close();
  }

  // ---- внутреннее ----

  _handshake() {
    return this._request(OPCODES.HANDSHAKE, {
      userAgent: {
        deviceType: 'WEB',
        appVersion: '25.6.0',
        locale: 'ru',
      },
      deviceId: 'max-tg-bridge',
    });
  }

  _authByToken(token) {
    return this._request(OPCODES.AUTH_TOKEN, { token, interactive: true });
  }

  _request(opcode, payload) {
    return new Promise((resolve, reject) => {
      if (!this.connected) return reject(new Error('MAX socket not connected'));
      const seq = ++this.seq;
      const frame = { ver: 11, cmd: 0, seq, opcode, payload };
      this.pending.set(seq, { resolve, reject });
      if (process.env.MAX_DEBUG) console.log('[max →]', JSON.stringify(frame));
      this.ws.send(JSON.stringify(frame));

      setTimeout(() => {
        if (this.pending.has(seq)) {
          this.pending.delete(seq);
          reject(new Error(`MAX request ${opcode} timed out`));
        }
      }, 20000);
    });
  }

  _onMessage(raw) {
    if (process.env.MAX_DEBUG) console.log('[max ←]', raw.toString());
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Ответ на наш запрос
    if (frame.seq && this.pending.has(frame.seq)) {
      const { resolve, reject } = this.pending.get(frame.seq);
      this.pending.delete(frame.seq);
      if (frame.payload?.error) {
        if (frame.payload.error === 'login.token.invalid') this.emit('authNeeded');
        const detail = frame.payload.message || frame.payload.localizedMessage || '';
        reject(new Error(`${frame.payload.error}${detail ? ': ' + detail : ''}`));
      } else {
        resolve(frame.payload || {});
      }
      return;
    }

    // Push-событие: новое входящее сообщение
    if (frame.opcode === OPCODES.NEW_MESSAGE) {
      const m = frame.payload?.message;
      if (m) {
        this.emit('message', {
          chatId: frame.payload.chatId,
          from: m.sender || m.from,
          text: m.text || '',
          ts: m.time || Date.now(),
        });
      }
    }
  }
}
