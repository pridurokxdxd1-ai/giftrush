// GiftRush bot — Cloudflare Worker (бесплатно, работает 24/7, ПК не нужен).
// Переменные (Settings → Variables and Secrets):
//   BOT_TOKEN   — токен от BotFather        (тип Secret)
//   WEBAPP_URL  — https://ТВОЙ_НИК.github.io/giftrush   (без / на конце)
//   SECRET      — любая длинная строка из букв и цифр    (тип Secret)
const GREETING = '🎰 Привет, хочешь испытать удачу и вынести куш? Тебе к нам!';
const BUTTON = 'GiftsRush';
const VERSION = '6'; // увеличь, если нужно сбросить кэш приложения в Telegram

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
