// GiftRush bot — Cloudflare Worker (бесплатно, работает 24/7, ПК не нужен).
// Переменные (Settings → Variables and Secrets):
//   BOT_TOKEN   — токен от BotFather        (тип Secret)
//   WEBAPP_URL  — https://ТВОЙ_НИК.github.io/giftrush   (без / на конце)
//   SECRET      — любая длинная строка из букв и цифр    (тип Secret)
// Привязка KV (Bindings → KV namespace): имя переменной  DB   (для переводов звёзд)
// Необязательно: ADMIN_ID — id админа (по умолчанию 5093384439)
const GREETING = '🎰 Привет, хочешь испытать удачу и вынести куш? Тебе к нам!';
const BUTTON = 'GiftsRush';
const VERSION = '12'; // увеличь, если нужно сбросить кэш приложения в Telegram

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
// таблица лидеров хранится одним ключом (топ-50), обновляется при каждом sync
async function lbUpdate(env, e) {
  try {
    const raw = (await env.DB.get('lb')) || '[]', lb = JSON.parse(raw), i = lb.findIndex(x => x.id === e.id);
    if (i >= 0) lb[i] = e; else if (e.bal > 0 && (lb.length < 50 || e.bal > lb[lb.length - 1].bal)) lb.push(e); else return;
    lb.sort((a, b) => b.bal - a.bal); lb.length = Math.min(lb.length, 50);
    const out = JSON.stringify(lb); if (out !== raw) await env.DB.put('lb', out);
  } catch (err) {}
}
async function api(path, request, env) {
  try { return await api0(path, request, env); }
  catch (e) { const m = String((e && e.message) || e); return J({ ok: false, err: /limit|429/i.test(m) ? 'quota' : 'srv', msg: m.slice(0, 160) }, 500); }   // ответ всегда JSON с CORS, чтобы приложение показало настоящую причину
}
async function api0(path, request, env) {
  if (!env.DB) return J({ ok: false, err: 'nokv' });
  let b; try { b = await request.json(); } catch (e) { return J({ ok: false, err: 'bad' }, 400); }
  const u = await verify(b.initData, env.BOT_TOKEN);
  if (!u) return J({ ok: false, err: 'auth' }, 401);
  const admin = String(env.ADMIN_ID || '5093384439');
  const id = String(u.id);
  const name = u.username ? '@' + u.username : [u.first_name, u.last_name].filter(Boolean).join(' ') || id;
  if (path === '/api/sync') {
    const bal = Number.isFinite(Number(b.bal)) ? Math.max(0, Math.floor(Number(b.bal))) : null;
    const old = JSON.parse((await env.DB.get('u:' + id)) || 'null') || {};
    const nb = bal === null ? (old.bal || 0) : bal;
    // записи в KV дорогие (бесплатный лимит ~1000 в сутки) — пишем только при изменениях или раз в 10 минут
    const photo = u.photo_url || old.photo || '', un = (u.username || '').toLowerCase();
    if (old.bal !== nb || old.name !== name || old.photo !== photo || old.un !== un || !(Date.now() - (old.at || 0) < 600000))
      await env.DB.put('u:' + id, JSON.stringify({ id, name, un, bal: nb, photo, at: Date.now() }));
    await lbUpdate(env, { id, name, bal: nb, photo: u.photo_url || old.photo || '' });
    // задания: объединяем с сервером (что выполнено — выполнено навсегда)
    let tasksOut = null;
    if (b.tasks && typeof b.tasks === 'object') {
      const rank = { claimed: 2, done: 1 }, tk = JSON.parse((await env.DB.get('tk:' + id)) || '{}') || {}, merged = { ...tk };
      for (const k of Object.keys(b.tasks).slice(0, 30)) { const v = String(b.tasks[k]); if ((rank[v] || 0) > (rank[merged[k]] || 0)) merged[k] = v; }
      if (JSON.stringify(merged) !== JSON.stringify(tk)) await env.DB.put('tk:' + id, JSON.stringify(merged));
      tasksOut = merged;
    }
    if (u.username && old.un !== un) await env.DB.put('un:' + un, id);
    const credit = Number(await env.DB.get('c:' + id)) || 0;
    if (credit > 0) await env.DB.delete('c:' + id);
    const debit = Number(await env.DB.get('d:' + id)) || 0;
    if (debit > 0) await env.DB.delete('d:' + id);
    return J({ ok: true, credit, debit, tasks: tasksOut });
  }
  if (path === '/api/top') {                        // лидерборд: топ-10 по балансу + место игрока
    const lb = JSON.parse((await env.DB.get('lb')) || '[]'), i = lb.findIndex(x => x.id === id);
    return J({ ok: true, top: lb.slice(0, 10), me: { id, name, rank: i >= 0 ? i + 1 : null, bal: i >= 0 ? lb[i].bal : null } });
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
    if (!rec) return J({ ok: false, err: 'nf' });
    const r = JSON.parse(rec);
    r.pending = (Number(await env.DB.get('c:' + tid)) || 0) - (Number(await env.DB.get('d:' + tid)) || 0);
    r.photo = await avatar(tid, env);
    return J({ ok: true, ...r });
  }
  if (path === '/api/give') {
    const amount = Math.floor(Number(b.amount)), to = String(b.to || '');
    if (!(amount >= 1 && amount <= 10000000)) return J({ ok: false, err: 'amount' }, 400);
    if (!/^\d{3,15}$/.test(to) || !(await env.DB.get('u:' + to))) return J({ ok: false, err: 'nf' });
    const cur = Number(await env.DB.get('c:' + to)) || 0;
    await env.DB.put('c:' + to, String(cur + amount));
    return J({ ok: true });
  }
  if (path === '/api/take') {                       // списать баланс (применится, когда игрок откроет игру)
    const amount = Math.floor(Number(b.amount)), to = String(b.to || '');
    if (!(amount >= 1 && amount <= 1e12)) return J({ ok: false, err: 'amount' }, 400);
    if (!/^\d{3,15}$/.test(to) || !(await env.DB.get('u:' + to))) return J({ ok: false, err: 'nf' });
    const cur = Number(await env.DB.get('d:' + to)) || 0;
    await env.DB.put('d:' + to, String(cur + amount));
    return J({ ok: true });
  }
  return J({ ok: false, err: 'route' }, 404);
}
// Аватарка пользователя как data-URL (нужно, чтобы игрок хотя бы раз писал боту)
async function avatar(uid, env) {
  try {
    const tgc = (m, body) => fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
    const p = await tgc('getUserProfilePhotos', { user_id: Number(uid), limit: 1 });
    const sizes = p && p.ok && p.result.photos && p.result.photos[0]; if (!sizes) return '';
    const pick = sizes.find(s => s.width >= 160) || sizes[sizes.length - 1];
    const f = await tgc('getFile', { file_id: pick.file_id }); if (!f.ok) return '';
    const buf = new Uint8Array(await (await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${f.result.file_path}`)).arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
    return 'data:image/jpeg;base64,' + btoa(bin);
  } catch (e) { return ''; }
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
