// HTML-страница с капчей Yandex SmartCaptcha.
// После прохождения капчи токен отправляется на /captcha/submit,
// сервер передаёт его в запрос кода к MAX.

export function renderCaptchaPage({ sid, sitekey }) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Проверка MAX</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background:#0f1115; color:#e8e8e8;
         display:flex; flex-direction:column; align-items:center; justify-content:center;
         min-height:100vh; margin:0; padding:24px; text-align:center; }
  .card { background:#1a1d24; border-radius:16px; padding:28px; max-width:360px; width:100%; }
  h1 { font-size:18px; margin:0 0 8px; }
  p { font-size:14px; color:#9aa0aa; margin:0 0 20px; }
  #status { margin-top:18px; font-size:14px; min-height:20px; }
  .ok { color:#4caf50; } .err { color:#ef5350; }
</style>
<script src="https://smartcaptcha.yandexcloud.net/captcha.js" defer></script>
</head>
<body>
  <div class="card">
    <h1>Проверка для входа в MAX</h1>
    <p>Пройди проверку — после неё код придёт, и его нужно будет ввести в чате с ботом.</p>
    <div id="captcha-container"></div>
    <div id="status"></div>
  </div>
<script>
  const sid = ${JSON.stringify(sid)};
  const sitekey = ${JSON.stringify(sitekey)};
  const statusEl = document.getElementById('status');

  function setStatus(text, cls) { statusEl.textContent = text; statusEl.className = cls || ''; }

  async function onToken(token) {
    setStatus('Отправляю проверку…');
    try {
      const r = await fetch('/captcha/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sid, token }),
      });
      const data = await r.json();
      if (data.ok) setStatus('Готово! Вернись в чат с ботом и введи код из MAX.', 'ok');
      else setStatus(data.error || 'Не получилось. Сделай /login заново.', 'err');
    } catch (e) {
      setStatus('Ошибка сети, попробуй ещё раз.', 'err');
    }
  }

  function init() {
    if (!sitekey) { setStatus('Не задан MAX_CAPTCHA_SITEKEY на сервере.', 'err'); return; }
    if (!window.smartCaptcha) { setTimeout(init, 200); return; }
    window.smartCaptcha.render('captcha-container', {
      sitekey,
      callback: onToken,
    });
  }
  window.addEventListener('load', init);
</script>
</body>
</html>`;
}
