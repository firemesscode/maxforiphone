// Ищет sitekey капчи web.max.ru, скачивая страницу и её JS-бандлы.
// Запускать ТАМ, где есть доступ к интернету MAX (например, Render Shell):
//   node scripts/find-sitekey.js
//
// Yandex SmartCaptcha sitekey имеет вид ysc1_xxxxxxxx...

const BASE = 'https://web.max.ru';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const headers = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9',
};

const SITEKEY_RE = /ysc1_[A-Za-z0-9]{20,}/g;
const GENERIC_RE = /sitekey["'`:\s=]+([A-Za-z0-9_-]{12,})/gi;

async function get(url) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

function findKeys(text) {
  const found = new Set();
  for (const m of text.matchAll(SITEKEY_RE)) found.add(m[0]);
  for (const m of text.matchAll(GENERIC_RE)) found.add(m[1]);
  return [...found];
}

async function main() {
  console.log(`Качаю ${BASE} …`);
  const html = await get(BASE);

  // 1) Иногда ключ прямо в HTML
  let keys = findKeys(html);
  if (keys.length) console.log('В HTML найдено:', keys);

  // 2) Собираем ссылки на JS-бандлы и ищем в них
  const scripts = [...html.matchAll(/src=["']([^"']+\.js[^"']*)["']/g)].map((m) => m[1]);
  const urls = scripts.map((s) => (s.startsWith('http') ? s : new URL(s, BASE).href));
  console.log(`Нашёл ${urls.length} JS-файлов, проверяю…`);

  for (const url of urls) {
    try {
      const js = await get(url);
      const k = findKeys(js);
      if (k.length) {
        console.log(`\n✅ В ${url}:`);
        console.log(k.join('\n'));
        keys = keys.concat(k);
      }
    } catch (e) {
      console.log(`  пропуск ${url}: ${e.message}`);
    }
  }

  const yandex = [...new Set(keys)].filter((k) => k.startsWith('ysc1_'));
  console.log('\n========================================');
  if (yandex.length) {
    console.log('НАЙДЕННЫЙ SITEKEY (добавь в MAX_CAPTCHA_SITEKEY):');
    yandex.forEach((k) => console.log('   ' + k));
  } else if (keys.length) {
    console.log('Возможные кандидаты (проверь, какой похож на ключ капчи):');
    [...new Set(keys)].forEach((k) => console.log('   ' + k));
  } else {
    console.log('Ничего не нашёл автоматически — ключ грузится иначе.');
  }
}

main().catch((e) => {
  console.error('Ошибка:', e.message);
  process.exit(1);
});
