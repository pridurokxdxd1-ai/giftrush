// GiftRush bot — Cloudflare Worker (бесплатно, работает 24/7, ПК не нужен).
// Переменные (Settings → Variables and Secrets):
//   BOT_TOKEN   — токен от BotFather        (тип Secret)
//   WEBAPP_URL  — https://ТВОЙ_НИК.github.io/giftrush   (без / на конце)
//   SECRET      — любая длинная строка из букв и цифр    (тип Secret)
// Привязка KV (Bindings → KV namespace): имя переменной  DB   (для переводов звёзд)
// Необязательно: ADMIN_ID — id админа (по умолчанию 5093384439)
const GREETING = '🎰 Привет, хочешь испытать удачу и вынести куш? Тебе к нам!';
const BUTTON = 'GiftsRush';
const VERSION = '9'; // увеличь, если нужно сбросить кэш приложения в Telegram

const CHANNELS = ['omutxwin', 'w1npros'];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', ...CORS } });
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? new TextEncoder().encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data));
}
// Проверка подписи Telegram initData → объект пользователя или null
async function verify(initData, token) {
  try {
    const p = new URLSearchParams(String(initData || '')); const hash = p.get('hash'); if (!hash) return null;
    p.delete('hash');
    const s = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secret = await hmac('WebAppData', token);
    if (hex(await hmac(secret, s)) !== hash) return null;
    if (Date.now() / 1000 - Number(p.get('auth_date') || 0) > 7 * 86400) return null;
    const u = JSON.parse(p.get('user') || 'null'); return u && u.id ? u : null;
  } catch (e) { return null; }
}
async function api(path, request, env) {
  if (!env.DB) return J({ ok: false, err: 'nokv' });
  let b; try { b = await request.json(); } catch (e) { return J({ ok: false, err: 'bad' }, 400); }
  const u = await verify(b.initData, env.BOT_TOKEN);
  if (!u) return J({ ok: false, err: 'auth' }, 401);
  const admin = String(env.ADMIN_ID || '5093384439');
  const id = String(u.id);
  const name = u.username ? '@' + u.username : [u.first_name, u.last_name].filter(Boolean).join(' ') || id;
  if (path === '/api/sync') {
    await env.DB.put('u:' + id, JSON.stringify({ id, name, un: (u.username || '').toLowerCase() }));
    if (u.username) await env.DB.put('un:' + u.username.toLowerCase(), id);
    const credit = Number(await env.DB.get('c:' + id)) || 0;
    if (credit > 0) await env.DB.delete('c:' + id);
    return J({ ok: true, credit });
  }
  if (path === '/api/check') {                      // проверка подписки на канал (бот должен быть админом канала)
    const ch = String(b.ch || '');
    if (!CHANNELS.includes(ch)) return J({ ok: false, err: 'bad' }, 400);
    let r; try { r = await (await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getChatMember`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: '@' + ch, user_id: u.id }) })).json(); } catch (e) { return J({ ok: false, err: 'net' }); }
    if (!r || !r.ok) return J({ ok: false, err: 'noadmin' });
    const st = r.result.status, sub = ['member', 'administrator', 'creator'].includes(st) || (st === 'restricted' && r.result.is_member === true);
    if (!sub) return J({ ok: true, sub: false });
    const key = `t:${id}:${ch}`, done = !!(await env.DB.get(key));
    if (!done) await env.DB.put(key, '1');
    return J({ ok: true, sub: true, done });
  }
  if (id !== admin) return J({ ok: false, err: 'forbidden' }, 403);
  if (path === '/api/lookup') {
    let q = String(b.q || '').trim().replace(/^@/, '').toLowerCase(), tid = /^\d{3,15}$/.test(q) ? q : await env.DB.get('un:' + q);
    const rec = tid && await env.DB.get('u:' + tid);
    return rec ? J({ ok: true, ...JSON.parse(rec) }) : J({ ok: false, err: 'nf' });
  }
  if (path === '/api/give') {
    const amount = Math.floor(Number(b.amount)), to = String(b.to || '');
    if (!(amount >= 1 && amount <= 10000000)) return J({ ok: false, err: 'amount' }, 400);
    if (!/^\d{3,15}$/.test(to) || !(await env.DB.get('u:' + to))) return J({ ok: false, err: 'nf' });
    const cur = Number(await env.DB.get('c:' + to)) || 0;
    await env.DB.put('c:' + to, String(cur + amount));
    return J({ ok: true });
  }
  return J({ ok: false, err: 'route' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/ping') return J({ ok: true, v: VERSION, kv: !!env.DB, token: !!env.BOT_TOKEN });
    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (request.method === 'POST') return api(url.pathname, request, env);
    }
    const base = String(env.WEBAPP_URL || '').trim().replace(/\/+$/, '');
    const appUrl = `${base}/?v=${VERSION}`;
    const tg = (method, body) => fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }).then(r => r.json());

    // 1) Разовая настройка: открой в браузере https://<твой-воркер>.workers.dev/setup
    if (request.method === 'GET' && url.pathname === '/setup') {
      if (!env.BOT_TOKEN || !base.startsWith('https://') || !env.SECRET) {
        return Response.json({ ok: false, error: 'Заполни BOT_TOKEN, WEBAPP_URL (https://...) и SECRET в Variables' }, { status: 400 });
      }
      const webhook = await tg('setWebhook', {
        url: `${url.origin}/`, secret_token: env.SECRET, allowed_updates: ['message'], drop_pending_updates: true,
      });
      const menu = await tg('setChatMenuButton', {
        menu_button: { type: 'web_app', text: BUTTON, web_app: { url: appUrl } },
      });
      return Response.json({ webhook, menu });
    }

    // 2) Сообщения от Telegram
    if (request.method === 'POST') {
      if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.SECRET) {
        return new Response('forbidden', { status: 403 });
      }
      try {
        const update = await request.json();
        const msg = update.message;
        if (msg && msg.chat && msg.chat.type === 'private' && typeof msg.text === 'string' && /^\/start(@\w+)?(\s|$)/.test(msg.text)) {
          await tg('sendMessage', {
            chat_id: msg.chat.id,
            text: GREETING,
            reply_markup: { inline_keyboard: [[{ text: BUTTON, web_app: { url: appUrl } }]] },
          });
        }
      } catch (e) { /* всегда отвечаем 200, чтобы Telegram не слал повторы */ }
      return new Response('ok');
    }

    return new Response('GiftRush bot OK');
  },
};
