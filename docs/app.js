'use strict';
/* GiftRush — демо-версия: баланс и подарки виртуальные, хранятся на устройстве */
const tg = window.Telegram && window.Telegram.WebApp;
try {
  tg && tg.ready(); tg && tg.expand();
  tg && tg.disableVerticalSwipes && tg.disableVerticalSwipes();
  tg && tg.setHeaderColor && tg.setHeaderColor('#040922');
  tg && tg.setBackgroundColor && tg.setBackgroundColor('#040922');
} catch (e) {}

const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => Math.random() * (b - a) + a;
const fmt = n => Math.floor(n).toLocaleString('ru-RU');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const haptic = (t = 'light') => { try { tg.HapticFeedback.impactOccurred(t); } catch (e) {} };
const notify = t => { try { tg.HapticFeedback.notificationOccurred(t); } catch (e) {} };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- storage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

/* ---------- items ---------- */
const RAR = {
  common: '#8b8f9c', rare: '#3b82f6', epic: '#a855f7', legend: '#ffc83d', myth: '#ff4d5e',
};
function rar(p) { return p < 100 ? 'common' : p < 400 ? 'rare' : p < 1500 ? 'epic' : p < 5000 ? 'legend' : 'myth'; }
const ITEMS = [
  ['🍭', 'Lollipop', 10], ['🧸', 'Bear', 15], ['🍪', 'Cookie', 20], ['🌹', 'Rose', 25], ['🎈', 'Balloon', 35],
  ['🎂', 'Cake', 50], ['🧁', 'Cupcake', 65], ['💐', 'Bouquet', 80], ['🍀', 'Clover', 100], ['🎃', 'Pumpkin', 130],
  ['🚀', 'Rocket', 170], ['🏆', 'Trophy', 220], ['🎮', 'Joystick', 300], ['💍', 'Ring', 400], ['🔮', 'Orb', 550],
  ['⌚', 'Watch', 750], ['💎', 'Diamond', 1000], ['🗿', 'Moai', 1400], ['🐉', 'Dragon', 2000], ['🦄', 'Unicorn', 2750],
  ['🏰', 'Castle', 3500], ['🛸', 'UFO', 5000], ['👑', 'Crown', 7500], ['🌌', 'Galaxy', 10000],
].map(([e, n, p]) => ({ e, n, p, r: rar(p), c: RAR[rar(p)] }));
const BY = {}; ITEMS.forEach(i => { BY[i.n] = i; });
const ITEM = n => BY[n] || null;

/* ---------- state ---------- */
let balanceHook = null;
const state = {
  balance: Number(store.get('gr2_bal', 1000)) || 0,
  inv: store.get('gr2_inv', []),
};
if (!Array.isArray(state.inv)) state.inv = [];
state.inv = state.inv.filter(g => g && g.id && BY[g.n]);
function save() {
  store.set('gr2_bal', state.balance); store.set('gr2_inv', state.inv);
  $('#bal').textContent = fmt(state.balance);
  if (balanceHook) balanceHook();
}
function bump() { const b = $('.balance'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
function addGift(n) { const g = { id: uid(), n }; state.inv.push(g); save(); return g; }
function invGift(id) { return state.inv.find(g => g.id === id) || null; }
function sellGift(id) {
  const i = state.inv.findIndex(g => g.id === id); if (i < 0) return 0;
  const it = ITEM(state.inv[i].n); state.inv.splice(i, 1);
  state.balance += it.p; save(); bump(); return it.p;
}
function spend(n) {
  if (!(n > 0)) { toast('Введите ставку'); return false; }
  if (state.balance < n) { toast('Недостаточно ⭐'); notify('error'); return false; }
  state.balance -= n; save(); return true;
}
let toastT = 0;
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('show'), 1900); }
$('#topup').onclick = () => {
  const COOL = 3 * 3600e3, last = Number(store.get('gr2_topup', 0)) || 0, left = last + COOL - Date.now();
  if (left > 0) { const h = Math.floor(left / 3600e3), m = Math.ceil(left % 3600e3 / 60e3); return toast(`Бонус будет через ${h ? h + ' ч ' : ''}${m} мин`); }
  store.set('gr2_topup', Date.now()); state.balance += 500; save(); bump(); toast('+500 ⭐ бонус (раз в 3 часа)'); haptic('medium');
};

/* лёгкий режим для слабых телефонов и пауза анимаций в фоне */
try {
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 4) <= 3;
  if (weak) document.documentElement.classList.add('lite');
  document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden));
} catch (e) {}

/* ticker */
$('#tickerTrack').innerHTML = [...ITEMS, ...ITEMS].map(i => `<span>${i.e}</span>`).join('');

/* ---------- cases & odds ---------- */
/*ODDS_START*/
const CASES = [
  { n: 'Mask', e: '🎭', price: 79, glow: '#6b7bff' },
  { n: 'Bear', e: '🧸', price: 149, glow: '#f472b6' },
  { n: 'Player', e: '🎮', price: 199, glow: '#2f6bff' },
  { n: 'Skull', e: '💀', price: 249, glow: '#35d07f' },
  { n: 'Hallo', e: '🎃', price: 299, glow: '#ff8a1f' },
  { n: 'Myth', e: '🗿', price: 489, glow: '#9ca3af' },
  { n: 'Lucky', e: '🍀', price: 750, glow: '#22c55e' },
  { n: 'Diamond', e: '💎', price: 1000, glow: '#38bdf8' },
  { n: 'Gold', e: '🪙', price: 1500, glow: '#ffc83d' },
  { n: 'Phoenix', e: '🔥', price: 2000, glow: '#fb923c' },
  { n: 'Dragon', e: '🐉', price: 2750, glow: '#ef4444' },
  { n: 'Castle', e: '🏰', price: 3500, glow: '#a855f7' },
  { n: 'Cosmos', e: '🛸', price: 5000, glow: '#6366f1' },
  { n: 'Royal', e: '👑', price: 7500, glow: '#f59e0b', tag: 'Топ' },
  { n: 'Galaxy', e: '🌌', price: 10000, glow: '#d946ef', tag: 'Новое' },
].sort((a, b) => a.price - b.price);

function buildOdds(c) {
  const P = c.price, TARGET = 0.72;
  const items = ITEMS.filter(i => i.p / P >= 0.015 && i.p / P <= 25);
  const ev = k => { let s = 0, e = 0; items.forEach(i => { const w = Math.pow(i.p / P, -k); s += w; e += w * i.p; }); return e / s / P; };
  let lo = -3, hi = 6;
  for (let t = 0; t < 50; t++) { const m = (lo + hi) / 2; if (ev(m) > TARGET) lo = m; else hi = m; }
  let k = (lo + hi) / 2;
  // у дорогих кейсов шанс получить подарок не дешевле цены кейса не должен быть слишком высоким
  const hit = kk => { let s = 0, h = 0; items.forEach(i => { const w = Math.pow(i.p / P, -kk); s += w; if (i.p >= P) h += w; }); return h / s; };
  if (hit(k) > 0.28) { let l = k, h2 = 12; for (let t = 0; t < 50; t++) { const m = (l + h2) / 2; if (hit(m) > 0.28) l = m; else h2 = m; } k = (l + h2) / 2; }
  c.pool = items.map(i => ({ it: i, w: Math.pow(i.p / P, -k) }));
  c.sum = c.pool.reduce((a, o) => a + o.w, 0);
  c.rtp = ev(k);
}
function rollCase(c) {
  let x = Math.random() * c.sum;
  for (const o of c.pool) { x -= o.w; if (x <= 0) return o.it; }
  return c.pool[c.pool.length - 1].it;
}
CASES.forEach(buildOdds);
/*ODDS_END*/

/* ---------- router ---------- */
let cleanup = null, backFn = null;
try { tg && tg.BackButton && tg.BackButton.onClick(() => { backFn && backFn(); }); } catch (e) {}
function setBack(fn) { backFn = fn; try { fn ? tg.BackButton.show() : tg.BackButton.hide(); } catch (e) {} }
function closeModals() { document.querySelectorAll('.ovl').forEach(o => o.remove()); }

function go(name, arg) {
  if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
  closeModals(); setBack(null);
  view.innerHTML = '';
  const d = document.createElement('div'); d.className = 'screen'; view.append(d);
  (SCREENS[name] || soon)(d, arg);
  view.scrollTop = 0; haptic();
}
function bar(el, title, back) {
  el.insertAdjacentHTML('beforeend', `<div class="bar"><button class="back" data-b>‹ Назад</button><div class="ttl">${esc(title)}</div><div class="sp"></div></div>`);
  const fn = () => go(back || 'games');
  $('[data-b]', el).onclick = fn; setBack(fn);
}
function modal(html) {
  closeModals();
  const o = document.createElement('div'); o.className = 'ovl';
  o.innerHTML = `<div class="mcard">${html}</div>`; document.body.append(o);
  requestAnimationFrame(() => o.classList.add('show'));
  const close = () => { o.classList.remove('show'); setTimeout(() => o.remove(), 260); };
  o.addEventListener('click', e => { if (e.target === o) close(); });
  return { el: o.firstElementChild, close };
}
function soon(el) { el.innerHTML = '<div class="soon"><b>🛠</b>В разработке.</div>'; }

/* ---------- home ---------- */
function home(el) {
  const cells = ['💣', '', '👑', '', '👑', '💣', '👑', '', '💣'].map(c => `<i>${c}</i>`).join('');
  const art = {
    cases: '<div class="art a-cases"><span class="f f1">🧸</span><span class="f f2">💎</span><span class="f f3">🍀</span><span class="f f4">🏆</span><b class="box">🎁</b><i class="spark s1">✦</i><i class="spark s2">✦</i></div>',
    crash: '<div class="art a-crash"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M4 90 C 32 88, 54 68, 88 16" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".85"/></svg><span class="rkt">🚀</span><em>x2.45</em></div>',
    mines: `<div class="art a-mines">${cells}</div>`,
    upgrade: '<div class="art a-up"><span class="u u1">🧸</span><b>»»</b><span class="u u2">🍀</span><b>»»</b><span class="u u3">👑</span></div>',
    roulette: '<div class="art a-roul"><i class="wheel"></i><i class="ptr"></i></div>',
    plinko: '<div class="art a-plk"><i class="pegs"></i><i class="ball"></i><div class="buck"><i></i><i></i><i></i></div></div>',
  };
  const T = (id, cls, name, extra = '') => `<button class="tile ${cls}" data-id="${id}">${art[id]}<h3>${name}</h3>${extra}</button>`;
  el.innerHTML = `<div class="hub">
    ${T('cases', 'wide t-cases', 'CASES')}
    <div class="row2">${T('crash', 'sq t-crash', 'CRASH', '<span class="live">ONLINE</span>')}${T('mines', 'sq t-mines', 'MINES', '<span class="new">NEW</span>')}</div>
    ${T('upgrade', 'wide t-up', 'UPGRADER')}
    <div class="row2">${T('roulette', 'sq t-roul', 'ROULETTE', '<span class="live">ONLINE</span>')}${T('plinko', 'sq t-plk', 'PLINKO', '<span class="dev">В РАЗРАБОТКЕ</span>')}</div>
  </div>`;
  el.querySelectorAll('.tile').forEach((b, i) => {
    b.style.animationDelay = i * 70 + 'ms';
    b.onclick = () => b.dataset.id === 'plinko' ? (haptic('rigid'), toast('В разработке.')) : go(b.dataset.id);
  });
}

/* ---------- cases ---------- */
function casesList(el) {
  bar(el, 'CASES');
  const g = document.createElement('div'); g.className = 'grid2'; el.append(g);
  CASES.forEach((c, i) => {
    const d = document.createElement('button'); d.className = 'case';
    d.style.setProperty('--glow', c.glow + '88'); d.style.animationDelay = Math.min(i, 8) * 40 + 'ms';
    d.innerHTML = `${c.tag ? `<span class="tag">${c.tag}</span>` : ''}<span class="em" style="animation-delay:${-(i % 5) * .6}s">${c.e}</span><div class="nm"><span>${c.n}</span><span class="pr">⭐ ${fmt(c.price)}</span></div>`;
    d.onclick = () => go('case', c); g.append(d);
  });
}
function caseScreen(el, c) {
  bar(el, c.n, 'cases');
  const mk = it => `<div class="it" style="--c:${it.c}">${it.e}</div>`;
  const sorted = c.pool.map(o => o.it).sort((a, b) => a.p - b.p);
  el.insertAdjacentHTML('beforeend', `<div class="reel-wrap"><div class="reel" id="reel"></div></div>
    <div class="win" id="win">Цена: ⭐ ${fmt(c.price)}</div><div id="act"></div>
    <button class="btn" id="go">Открыть за ⭐ ${fmt(c.price)}</button>
    <h4 class="sec">Содержимое кейса</h4>
    <div class="contents">${sorted.map(i => `<div class="ci" style="--c:${i.c}"><b>${i.e}</b>⭐ ${fmt(i.p)}</div>`).join('')}</div>`);
  const reel = $('#reel'), win = $('#win'), act = $('#act'), btn = $('#go');
  const filler = () => rollCase(c);
  reel.innerHTML = Array.from({ length: 14 }, () => mk(filler())).join('');
  let busy = false;
  btn.onclick = async () => {
    if (busy) return;
    if (!spend(c.price)) return;
    busy = true; btn.disabled = true; act.innerHTML = ''; win.textContent = '';
    const prize = rollCase(c), gift = addGift(prize.n); // выдаём сразу — приз не потеряется
    const N = 52, stop = 44;
    const arr = Array.from({ length: N }, (_, i) => i === stop ? prize : filler());
    reel.style.transition = 'none'; reel.style.transform = 'translate3d(0,0,0)';
    reel.innerHTML = arr.map(mk).join(''); void reel.offsetWidth;
    const w = reel.parentElement.offsetWidth, off = stop * 110 + 50 - w / 2 + rnd(-32, 32);
    reel.style.transition = 'transform 5s cubic-bezier(.1,.75,.12,1)';
    reel.style.transform = `translate3d(${-off}px,0,0)`;
    const iv = setInterval(() => haptic('light'), 170);
    await sleep(5150); clearInterval(iv);
    if (!el.isConnected) return;
    notify('success');
    win.innerHTML = `<div class="pop" style="color:${prize.c}">${prize.e} ${prize.n} · ⭐ ${fmt(prize.p)}</div>`;
    act.innerHTML = `<button class="btn green sm" id="sell">Продать за ⭐ ${fmt(prize.p)}</button>`;
    $('#sell').onclick = () => {
      if (!invGift(gift.id)) return;
      const v = sellGift(gift.id); toast(`+${fmt(v)} ⭐ на баланс`); act.innerHTML = ''; haptic('medium');
    };
    btn.disabled = false; busy = false;
  };
}

/* ---------- upgrade ---------- */
const up = { mine: null, want: null };
const chanceOf = (m, w) => Math.min(75, Math.max(2, (m.p / w.p) * 92));
function upgradeScreen(el) {
  bar(el, 'UPGRADER');
  const mg = up.mine && invGift(up.mine); if (!mg) up.mine = null;
  const mi = mg ? ITEM(mg.n) : null;
  let wi = up.want ? ITEM(up.want) : null;
  if (wi && mi && wi.p <= mi.p) { wi = null; up.want = null; }
  const chance = mi && wi ? chanceOf(mi, wi) : 0;
  const slot = i => i ? `${i.e}<small>⭐ ${fmt(i.p)}</small>` : '<small>＋ Добавить</small>';
  el.insertAdjacentHTML('beforeend', `<p class="sub">Преобразуйте свои подарки в более ценные!</p>
    <div class="slot"><h4>Ваш подарок</h4><button class="pick ${mi ? 'has' : ''}" id="mine">${slot(mi)}</button></div>
    <div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="#2a2c33" stroke-width="9"/>
      <circle cx="50" cy="50" r="44" fill="none" stroke="#35d07f" stroke-width="9" stroke-linecap="round" stroke-dasharray="${chance / 100 * 276.46} 276.46" style="filter:drop-shadow(0 0 6px #35d07f);transition:stroke-dasharray .6s var(--ease)"/></svg>
      <div class="arrow" id="arrow"></div><div class="num">${chance ? chance.toFixed(1) + '%' : '—'}</div></div>
    <div class="slot"><h4>Желаемый подарок</h4><button class="pick ${wi ? 'has' : ''}" id="want">${slot(wi)}</button></div>
    <button class="btn" id="go">${mi && wi ? 'Апгрейд' : 'Выбрать свой подарок'}</button>`);
  $('#mine').onclick = () => go('pick', 'mine');
  $('#want').onclick = () => mi ? go('pick', 'want') : toast('Сначала выберите свой подарок');
  let busy = false;
  $('#go').onclick = async () => {
    if (busy) return;
    if (!mi) return go('pick', 'mine');
    if (!wi) return go('pick', 'want');
    if (!invGift(mg.id)) return toast('Подарок уже недоступен');
    busy = true; $('#go').disabled = true;
    const ok = Math.random() * 100 < chance;
    state.inv = state.inv.filter(g => g.id !== mg.id); if (ok) addGift(wi.n); save(); // результат сохраняем сразу
    const arrow = $('#arrow'); arrow.classList.add('on');
    const th = ok ? rnd(6, chance / 100 * 360 - 6) : rnd(chance / 100 * 360 + 6, 354);
    arrow.style.transition = 'none'; arrow.style.transform = 'translate(-50%,0) rotate(180deg)'; void arrow.offsetWidth;
    arrow.style.transition = 'transform 4s cubic-bezier(.1,.75,.12,1)'; arrow.style.transform = `translate(-50%,0) rotate(${180 + 1440 + th}deg)`;
    await sleep(4200);
    notify(ok ? 'success' : 'error');
    toast(ok ? `🎉 Успех! ${wi.e} ${wi.n}` : '💥 Неудача, подарок сгорел');
    up.mine = null; up.want = null;
    if (el.isConnected) { await sleep(900); if (el.isConnected) go('upgrade'); }
  };
}
function pickScreen(el, kind) {
  bar(el, kind === 'mine' ? 'Ваш подарок' : 'Желаемый подарок', 'upgrade');
  const mi = up.mine && invGift(up.mine) ? ITEM(invGift(up.mine).n) : null;
  const g = document.createElement('div'); g.className = 'grid2'; el.append(g);
  let list;
  if (kind === 'mine') list = state.inv.map(x => ({ id: x.id, it: ITEM(x.n) })).sort((a, b) => b.it.p - a.it.p);
  else list = ITEMS.filter(i => !mi || i.p > mi.p).map(i => ({ id: i.n, it: i }));
  if (!list.length) { g.innerHTML = '<div class="empty"><b>📭</b>Пока пусто. Откройте кейс.</div>'; return; }
  list.forEach((o, i) => {
    const b = document.createElement('button'); b.className = 'case'; b.style.animationDelay = Math.min(i, 8) * 35 + 'ms';
    b.innerHTML = `<span class="em" style="font-size:52px;animation:none">${o.it.e}</span><div class="nm"><span>${o.it.n}</span><span class="pr">⭐ ${fmt(o.it.p)}</span></div>`;
    b.onclick = () => { if (kind === 'mine') { up.mine = o.id; up.want = null; } else up.want = o.id; go('upgrade'); };
    g.append(b);
  });
}

/* ---------- crash (онлайн, общий сервер) ---------- */
const CRASH_K = 0.1425;
const crashMult = ms => Math.floor(Math.exp(CRASH_K * Math.max(0, ms) / 1000) * 100) / 100;
const apiBase = () => { try { return new URLSearchParams(location.search).get('api') || ''; } catch (e) { return ''; } };

/* офлайн-сервер: тот же протокол, но раунды крутятся прямо в телефоне */
function localServer(onMsg) {
  let phase = 'wait', round = 0, until = 0, t0 = 0, crashAt = 2, crashMs = 0, bet = null, closed = false;
  const timers = [], hist = [1.24, 3.8, 1.05, 2.1, 1.77];
  const T = (fn, ms) => timers.push(setTimeout(fn, ms));
  const emit = m => { if (!closed) onMsg(m); };
  const me = { uid: 'me', name: TGU ? (TGU.username ? '@' + TGU.username : TGU.first_name || 'Игрок') : 'Игрок', photo: (TGU && TGU.photo_url) || '' };
  const newRound = first => {
    round++; phase = 'wait'; bet = null;
    crashAt = Math.max(1, +(0.95 / (1 - Math.random() * 0.99)).toFixed(2)); crashMs = Math.log(crashAt) / CRASH_K * 1000; until = Date.now() + 6000;
    if (!first) emit({ t: 'round', round, until, now: Date.now() });
    T(() => {
      phase = 'fly'; t0 = Date.now(); emit({ t: 'fly', t0 });
      T(() => { phase = 'crash'; hist.push(crashAt); emit({ t: 'crash', at: crashAt }); T(() => newRound(false), 3500); }, crashMs);
    }, 6000);
  };
  newRound(true);
  T(() => emit({ t: 'welcome', now: Date.now(), you: 'me', online: 1, phase, round, until, t0, crash_at: null, history: hist.slice(-9), bets: [] }), 0);
  return {
    local: true,
    send(m) {
      if (m.t === 'bet') {
        if (phase !== 'wait' || bet || !(m.amount >= 1)) return emit({ t: 'err', code: 'bet', msg: 'Ставка не принята' });
        bet = { amount: m.amount, mult: null }; emit({ t: 'bet', uid: me.uid, name: me.name, photo: me.photo, amount: m.amount });
      } else if (m.t === 'cancel') {
        if (phase === 'wait' && bet) { const a = bet.amount; bet = null; emit({ t: 'refund', amount: a }); emit({ t: 'unbet', uid: me.uid }); }
      } else if (m.t === 'cash') {
        if (phase !== 'fly' || !bet || bet.mult != null) return;
        const el = Date.now() - t0; if (el >= crashMs) return emit({ t: 'err', code: 'late', msg: 'Слишком поздно' });
        const mu = crashMult(el); bet.mult = mu;
        emit({ t: 'cash_ok', mult: mu, payout: Math.floor(bet.amount * mu) }); emit({ t: 'cash', uid: me.uid, mult: mu });
      }
    },
    close() { closed = true; timers.forEach(clearTimeout); },
  };
}

/* подключение к общему серверу; null — если сервера нет или он недоступен */
function connectServer(onMsg, onClose, game, room) {
  return new Promise(res => {
    const api = apiBase(); if (!api) return res(null);
    let ws, done = false, opened = false, helloAt = 0;
    const fin = v => { if (!done) { done = true; res(v); } };
    const timer = setTimeout(() => { try { ws && ws.close(); } catch (e) {} fin(null); }, 5000);
    try { ws = new WebSocket(api.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws?game=' + game + '&room=' + room); } catch (e) { clearTimeout(timer); return fin(null); }
    ws.onopen = () => { helloAt = Date.now(); ws.send(JSON.stringify({ t: 'hello', init: (tg && tg.initData) || '' })); };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.t === 'welcome' && !opened) {
        opened = true; clearTimeout(timer); m.rtt = Date.now() - helloAt;
        fin({ send: o => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); }, close: () => { ws.onclose = null; try { ws.close(); } catch (x) {} } });
      }
      onMsg(m);
    };
    ws.onerror = () => {};
    ws.onclose = () => { clearTimeout(timer); if (!opened) fin(null); else onClose && onClose(); };
  });
}

function crashScreen(el) {
  bar(el, 'CRASH');
  el.insertAdjacentHTML('beforeend', `<div id="rooms"></div><div class="net" id="net"><i></i><span id="netTxt">Подключение…</span></div>
    <div class="hist" id="hist"></div>
    <div class="crash-box"><canvas id="cv"></canvas><div class="mult" id="mult">Старт…</div></div>
    <div class="betrow"><input id="bet" type="number" inputmode="numeric" value="50" min="1"><button data-m="0.5">½</button><button data-m="2">×2</button></div>
    <button class="btn" id="go" disabled>Подключение…</button>
    <div class="bhd"><h4 class="sec" style="margin:0">Ставки</h4><span id="bcount"></span></div>
    <div class="bets" id="bets"></div>`);
  const room = getRoom(); roomChips($('#rooms'), room, () => go('crash'));
  const cv = $('#cv'), ctx = cv.getContext('2d'), multEl = $('#mult'), goBtn = $('#go'), histEl = $('#hist'), betIn = $('#bet'), betsEl = $('#bets');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(10, cv.offsetWidth) * dpr; cv.height = Math.max(10, cv.offsetHeight) * dpr;
  const W = cv.width, H = cv.height;
  el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { if (!betIn.disabled) betIn.value = Math.max(1, Math.floor((Number(betIn.value) || 1) * b.dataset.m)); });

  const G = { phase: 'wait', until: 0, t0: 0, crashAt: 1, offset: 0, me: null };
  const bets = new Map();
  let myBet = 0, myCashed = false, myPayout = 0, pending = 0, cashSent = false, net = null, alive = true, raf = 0, tail = [], lastBtn = '';
  const srv = () => Date.now() + G.offset;
  const fl = v => (Math.floor(v * 100) / 100).toFixed(2);

  const addHist = v => { histEl.insertAdjacentHTML('afterbegin', `<span class="${v >= 2 ? 'h' : 'l'}">${fl(v)}x</span>`); while (histEl.children.length > 9) histEl.lastChild.remove(); };
  const setNet = (online, n) => {
    $('#net').className = 'net ' + (online ? 'on' : 'off');
    $('#netTxt').textContent = online ? `Сервер ${room} · онлайн: ${n || 1}` : 'Офлайн-режим · сервер не найден';
  };

  function renderBets() {
    const arr = [...bets.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 40);
    const sum = [...bets.values()].reduce((s, b) => s + b.amount, 0);
    $('#bcount').textContent = bets.size ? `${bets.size} · ⭐ ${fmt(sum)}` : '';
    betsEl.innerHTML = arr.length ? arr.map(([uid, b]) => {
      const st = b.mult != null ? 'win' : b.lost ? 'lose' : '';
      const right = b.mult != null ? `x${fl(b.mult)}<br>+⭐ ${fmt(b.amount * b.mult - b.amount)}` : b.lost ? `−⭐ ${fmt(b.amount)}` : '';
      const ini = esc((b.name.replace('@', '')[0] || '?').toUpperCase());
      return `<div class="brow ${st}"><span class="bav"><b>${ini}</b>${b.photo ? `<img src="${esc(b.photo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>
        <span class="bn">${esc(b.name)}${uid === G.me ? ' (вы)' : ''}<small>⭐ ${fmt(b.amount)}</small></span><span class="br">${right}</span></div>`;
    }).join('') : '<div class="empty" style="padding:16px 0">Ставок пока нет</div>';
  }

  function onMsg(m) {
    if (!alive) return;
    switch (m.t) {
      case 'welcome': {
        G.me = m.you; G.offset = m.now + (m.rtt || 0) / 2 - Date.now();
        G.phase = m.phase; G.until = m.until; G.t0 = m.t0; G.crashAt = m.crash_at || 1;
        bets.clear(); (m.bets || []).forEach(b => bets.set(b.uid, { name: b.name, photo: b.photo, amount: b.amount, mult: b.mult, lost: m.phase === 'crash' && b.mult == null }));
        histEl.innerHTML = ''; (m.history || []).forEach(addHist);
        const mine = bets.get(G.me); myBet = mine ? mine.amount : 0; myCashed = !!(mine && mine.mult != null); myPayout = myCashed ? Math.floor(mine.amount * mine.mult) : 0; pending = 0; cashSent = false;
        if (G.phase === 'crash') { multEl.textContent = fl(G.crashAt) + 'x'; multEl.classList.add('lose'); }
        setNet(!net || !net.local, m.online); renderBets(); break;
      }
      case 'round':
        G.phase = 'wait'; G.until = m.until; bets.clear(); myBet = 0; myCashed = false; myPayout = 0; cashSent = false; tail = [];
        multEl.classList.remove('lose'); renderBets(); break;
      case 'fly': G.phase = 'fly'; G.t0 = m.t0; break;
      case 'crash':
        G.phase = 'crash'; G.crashAt = m.at; bets.forEach(b => { if (b.mult == null) b.lost = true; });
        addHist(m.at); multEl.textContent = fl(m.at) + 'x'; multEl.classList.add('lose');
        if (myBet && !myCashed) notify('error'); renderBets(); break;
      case 'bet':
        bets.set(m.uid, { name: m.name, photo: m.photo, amount: m.amount, mult: null, lost: false });
        if (m.uid === G.me) { myBet = m.amount; pending = 0; }
        renderBets(); break;
      case 'unbet': bets.delete(m.uid); if (m.uid === G.me) myBet = 0; renderBets(); break;
      case 'refund': state.balance += m.amount; save(); break;
      case 'cash': { const b = bets.get(m.uid); if (b) b.mult = m.mult; renderBets(); break; }
      case 'cash_ok':
        state.balance += m.payout; save(); bump(); myCashed = true; myPayout = m.payout;
        notify('success'); toast(`+${fmt(m.payout - myBet)} ⭐`); break;
      case 'online': setNet(!net || !net.local, m.n); break;
      case 'err':
        if (m.code === 'bet' && pending) { state.balance += pending; save(); pending = 0; }
        toast(m.msg || 'Ошибка'); break;
    }
  }

  function renderBtn() {
    let txt, cls = 'btn', dis = false;
    if (!net) { txt = 'Подключение…'; dis = true; }
    else if (G.phase === 'wait') {
      if (myBet) { txt = `Отменить ставку ⭐ ${fmt(myBet)}`; cls = 'btn red'; }
      else if (pending) { txt = 'Отправка…'; dis = true; }
      else txt = 'Сделать ставку';
    } else if (G.phase === 'fly') {
      if (myBet && !myCashed) { txt = `Забрать ⭐ ${fmt(myBet * crashMult(srv() - G.t0))}`; cls = 'btn green'; dis = cashSent; }
      else if (myBet) { txt = `Забрано ⭐ ${fmt(myPayout)}`; cls = 'btn green'; dis = true; }
      else { txt = 'Раунд идёт'; dis = true; }
    } else {
      if (myBet && !myCashed) { txt = 'Проигрыш'; cls = 'btn red'; }
      else txt = myBet ? `Забрано ⭐ ${fmt(myPayout)}` : 'Ждём раунд';
      dis = true;
    }
    betIn.disabled = G.phase !== 'wait' || !!myBet || pending > 0;
    const key = txt + '|' + cls + '|' + dis; if (key === lastBtn) return; lastBtn = key;
    goBtn.textContent = txt; goBtn.className = cls; goBtn.disabled = dis;
  }

  goBtn.onclick = () => {
    if (!net) return;
    if (G.phase === 'wait') {
      if (!myBet && !pending) {
        const v = Math.floor(Number(betIn.value));
        if (!(v >= 1)) return toast('Введите ставку');
        if (!spend(v)) return;
        pending = v; net.send({ t: 'bet', amount: v }); haptic('medium');
      } else if (myBet && !pending) net.send({ t: 'cancel' });
    } else if (G.phase === 'fly' && myBet && !myCashed && !cashSent) { cashSent = true; net.send({ t: 'cash' }); haptic('medium'); }
  };

  cleanup = () => {
    alive = false; cancelAnimationFrame(raf);
    if (net) {
      if ((myBet && G.phase === 'wait' && !myCashed) || pending) { state.balance += (myBet || pending); save(); net.send({ t: 'cancel' }); }
      setTimeout(() => net && net.close(), 150);
    }
  };

  /* подключение: сначала общий сервер, если нет — офлайн */
  const startLocal = () => { net = localServer(onMsg); $('#rooms').style.display = 'none'; setNet(false); };
  (async () => {
    const n = await connectServer(onMsg, () => {
      if (!alive) return;
      toast('Связь с сервером потеряна — офлайн-режим');
      bets.clear(); myBet = 0; pending = 0; myCashed = false; startLocal();
    }, 'crash', room);
    if (!alive) { n && n.close(); return; }
    if (n) net = n; else startLocal();
  })();

  /* отрисовка */
  const stars = Array.from({ length: 34 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.6 * dpr + .4, v: rnd(.15, .5) * dpr }));
  const frame = () => {
    if (!alive) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    stars.forEach(s => { s.y += s.v * (G.phase === 'fly' ? 5 : 1); if (s.y > H) { s.y = 0; s.x = Math.random() * W; } ctx.globalAlpha = .55; ctx.fillRect(s.x, s.y, s.s, s.s); });
    ctx.globalAlpha = 1;
    if (G.phase === 'wait') multEl.textContent = Math.max(0, (G.until - srv()) / 1000).toFixed(1) + 'с';
    if (G.phase === 'fly') {
      const m = crashMult(srv() - G.t0); multEl.textContent = fl(m) + 'x';
      const p = Math.min(1, (m - 1) / 4), x = W * .12 + p * W * .7, y = H * .86 - Math.pow(p, .8) * H * .6 + Math.sin(Date.now() / 90) * 2;
      tail.push([x, y]); if (tail.length > 60) tail.shift();
    }
    if (tail.length && (G.phase === 'fly' || G.phase === 'crash')) {
      const g = ctx.createLinearGradient(0, H, W, 0); g.addColorStop(0, '#5b7cff00'); g.addColorStop(1, G.phase === 'crash' ? '#ff6b7a' : '#7b96ff');
      ctx.strokeStyle = g; ctx.lineWidth = 4 * dpr; ctx.lineCap = 'round'; ctx.shadowColor = G.phase === 'crash' ? '#ff4d5e' : '#5b7cff'; ctx.shadowBlur = 14;
      ctx.beginPath(); tail.forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.stroke(); ctx.shadowBlur = 0;
      const [x, y] = tail[tail.length - 1];
      ctx.font = `${34 * dpr}px serif`; ctx.save(); ctx.translate(x, y);
      if (G.phase === 'crash') ctx.fillText('💥', -17 * dpr, 12 * dpr); else { ctx.rotate(-.6); ctx.fillText('🚀', -17 * dpr, 12 * dpr); }
      ctx.restore();
    }
    renderBtn();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

/* ---------- серверы (комнаты) ---------- */
const ROOMS = ['1', '2', '3'];
const getRoom = () => { const r = String(store.get('gr2_room', '1')); return ROOMS.includes(r) ? r : '1'; };
function roomChips(host, cur, onPick) {
  host.className = 'rooms';
  host.innerHTML = ROOMS.map(r => `<button class="chip ${r === cur ? 'on' : ''}" data-r="${r}">Сервер ${r}</button>`).join('');
  host.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { if (b.dataset.r !== cur) { store.set('gr2_room', b.dataset.r); haptic(); onPick(b.dataset.r); } });
}

/* ---------- roulette (онлайн) ---------- */
const R_N = 37, R_SEG = 360 / 37, R_MIN = 20, R_WAIT = 12000, R_SPIN = 7000, R_SHOW = 4500, R_P_GREEN = 0.015;
const R_MULT = { red: 2, black: 2, green: 12 };
const R_NAME = { red: 'Красное', black: 'Чёрное', green: 'Зелёное' };
const R_COL = { red: '#e0203f', black: '#12162b', green: '#12a150' };
const rColor = n => n === 0 ? 'green' : n % 2 ? 'red' : 'black';
/* угол колеса (по часовой от стрелки), при котором число n окажется под стрелкой; 0 лежит напротив стрелки */
const rEnd = (n, off) => ((off * R_SEG - 180 - n * R_SEG) % 360 + 360) % 360;

function localRoulette(onMsg, name, photo) {
  let round = 0, phase = 'wait', until = 0, closed = false;
  const bets = {}, timers = [], T = (fn, ms) => timers.push(setTimeout(fn, ms));
  const emit = m => { if (!closed) onMsg(m); };
  const roll = () => { const r = Math.random(); if (r < R_P_GREEN) return [0, 'green']; if (r < R_P_GREEN + (1 - R_P_GREEN) / 2) return [1 + 2 * Math.floor(Math.random() * 18), 'red']; return [2 + 2 * Math.floor(Math.random() * 18), 'black']; };
  const loop = first => {
    round++; phase = 'wait'; Object.keys(bets).forEach(k => delete bets[k]); until = Date.now() + R_WAIT;
    if (!first) emit({ t: 'round', round, until, now: Date.now() });
    T(() => {
      const [n, c] = roll(), off = +(Math.random() * 0.76 - 0.38).toFixed(3), t0 = Date.now(); phase = 'spin';
      emit({ t: 'spin', n, c, t0, dur: R_SPIN, off, now: t0 });
      T(() => {
        phase = 'result'; const pay = bets[c] ? bets[c] * R_MULT[c] : 0;
        emit({ t: 'result', n, c, wins: pay ? [{ uid: 'me', color: c, payout: pay }] : [] });
        if (pay) emit({ t: 'win', color: c, payout: pay, mult: R_MULT[c] });
        T(() => loop(false), R_SHOW);
      }, R_SPIN);
    }, R_WAIT);
  };
  loop(true);
  T(() => emit({ t: 'welcome', now: Date.now(), you: 'me', online: 1, room: 'local', phase, round, until, t0: 0, dur: R_SPIN, result: null, off: 0, history: [], bets: [], owed: 0 }), 0);
  return {
    local: true,
    send(m) {
      if (phase !== 'wait' || !R_MULT[m.color]) return m.t === 'bet' && emit({ t: 'err', code: 'bet', msg: 'Ставки закрыты', color: m.color });
      if (m.t === 'bet') {
        if (bets[m.color] || !(m.amount >= R_MIN)) return emit({ t: 'err', code: 'bet', msg: 'Ставка не принята', color: m.color });
        bets[m.color] = m.amount; emit({ t: 'bet', uid: 'me', name, photo, amount: m.amount, color: m.color });
      } else if (m.t === 'cancel' && bets[m.color]) {
        const a = bets[m.color]; delete bets[m.color]; emit({ t: 'refund', amount: a, color: m.color }); emit({ t: 'unbet', uid: 'me', color: m.color });
      }
    },
    close() { closed = true; timers.forEach(clearTimeout); },
  };
}

function rouletteScreen(el) {
  bar(el, 'ROULETTE');
  const room = getRoom();
  el.insertAdjacentHTML('beforeend', `<div id="rooms"></div><div class="net" id="net"><i></i><span id="netTxt">Подключение…</span></div>
    <div class="rhist" id="rhist"></div>
    <div class="rwheel" id="rwheel"><div class="rptr"></div><canvas id="rcv"></canvas><div class="rcenter" id="rcen">…</div></div>
    <div class="betrow"><input id="ramt" type="number" inputmode="numeric" value="20" min="20"><button data-q="0.5">½</button><button data-q="2">×2</button></div>
    <div class="qamt"><button data-v="20">20</button><button data-v="100">100</button><button data-v="500">500</button><button data-v="1000">1K</button></div>
    <div class="rbtns" id="rbtns">
      <button class="rb red" data-c="red"><b>КРАСНОЕ</b><span>x2</span><small></small></button>
      <button class="rb green" data-c="green"><b>ЗЕРО</b><span>x12</span><small></small></button>
      <button class="rb black" data-c="black"><b>ЧЁРНОЕ</b><span>x2</span><small></small></button></div>
    <div class="odds">Шансы: красное 49.3% · чёрное 49.3% · зелёное 1.5% · мин. ставка 20 ⭐</div>
    <div class="bhd"><h4 class="sec" style="margin:0">Ставки</h4><span id="bcount"></span></div><div class="bets" id="bets"></div>`);
  roomChips($('#rooms'), room, () => go('roulette'));
  const wrap = $('#rwheel'), cv = $('#rcv'), ctx = cv.getContext('2d'), cen = $('#rcen'), amt = $('#ramt'), betsEl = $('#bets'), rbtns = [...el.querySelectorAll('.rb')];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const G = { phase: 'wait', until: 0, t0: 0, dur: R_SPIN, res: null, offset: 0, me: null, spin: null };
  const bets = new Map(), myBets = {}, pending = {};
  let net = null, alive = true, raf = 0, rot = 0, S = 0, wheelImg = null, dirty = true, lastK = -1, lastHap = 0, lastCen = '';
  const srv = () => Date.now() + G.offset;

  /* колесо рисуется один раз в буфер, дальше только поворачивается */
  function buildWheel() {
    S = Math.round(wrap.offsetWidth * dpr); if (!S) return;
    cv.width = cv.height = S;
    const img = document.createElement('canvas'); img.width = img.height = S; const x = img.getContext('2d'), R = S / 2;
    const rOut = R * .985, rIn = R * .5, rNum = R * .775;
    for (let i = 0; i < R_N; i++) {
      const a = (180 + i * R_SEG) * Math.PI / 180 - Math.PI / 2, h = R_SEG * Math.PI / 360;
      x.beginPath(); x.arc(R, R, rOut, a - h, a + h); x.arc(R, R, rIn, a + h, a - h, true); x.closePath();
      x.fillStyle = R_COL[rColor(i)]; x.fill(); x.lineWidth = Math.max(1, S / 300); x.strokeStyle = '#ffffff55'; x.stroke();
      x.save(); x.translate(R, R); x.rotate((180 + i * R_SEG) * Math.PI / 180); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = `800 ${Math.round(S * (i === 0 ? .06 : .05))}px Rubik, Arial, sans-serif`; x.translate(0, -rNum); x.rotate(0); x.fillText(String(i), 0, 0); x.restore();
    }
    const g = x.createRadialGradient(R, R, rIn * .2, R, R, rIn); g.addColorStop(0, '#16276f'); g.addColorStop(1, '#070e33');
    x.beginPath(); x.arc(R, R, rIn, 0, 7); x.fillStyle = g; x.fill(); x.lineWidth = S / 70; x.strokeStyle = '#ffd21f'; x.stroke();
    x.beginPath(); x.arc(R, R, rOut, 0, 7); x.lineWidth = S / 90; x.strokeStyle = '#ffffffcc'; x.stroke();
    wheelImg = img; dirty = true;
  }
  const drawWheel = () => {
    if (!wheelImg) return;
    ctx.clearRect(0, 0, S, S); ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(rot * Math.PI / 180); ctx.drawImage(wheelImg, -S / 2, -S / 2); ctx.restore();
  };
  function startSpin(n, off, t0, dur) {
    const r0 = ((rot % 360) + 360) % 360, d = (rEnd(n, off) - r0 + 360) % 360;
    G.spin = { r0, r1: r0 + 360 * 6 + d }; G.t0 = t0; G.dur = dur; rot = r0; G.res = { n, c: rColor(n) };
  }

  const setNet = (online, n) => {
    $('#net').className = 'net ' + (online ? 'on' : 'off');
    $('#netTxt').textContent = online ? `Сервер ${room} · онлайн: ${n || 1}` : 'Офлайн-режим · сервер не найден';
  };
  const addHist = r => { const h = $('#rhist'); h.insertAdjacentHTML('afterbegin', `<span class="${rColor(r.n)}">${r.n}</span>`); while (h.children.length > 12) h.lastChild.remove(); };

  function renderBets() {
    const arr = [...bets.values()].sort((a, b) => b.amount - a.amount).slice(0, 40);
    const pool = { red: 0, black: 0, green: 0 }; bets.forEach(b => { pool[b.color] += b.amount; });
    $('#bcount').textContent = bets.size ? `${bets.size} · ⭐ ${fmt(pool.red + pool.black + pool.green)}` : '';
    betsEl.innerHTML = arr.length ? arr.map(b => {
      const st = b.win != null ? 'win' : b.lost ? 'lose' : '';
      const right = b.win != null ? `+⭐ ${fmt(b.win - b.amount)}` : b.lost ? `−⭐ ${fmt(b.amount)}` : '';
      const ini = esc((b.name.replace('@', '')[0] || '?').toUpperCase());
      return `<div class="brow ${st}"><span class="bav"><b>${ini}</b>${b.photo ? `<img src="${esc(b.photo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>
        <span class="bn">${esc(b.name)}${b.uid === G.me ? ' (вы)' : ''}<small>⭐ ${fmt(b.amount)} · <u class="dot ${b.color}"></u>${R_NAME[b.color]}</small></span><span class="br">${right}</span></div>`;
    }).join('') : '<div class="empty" style="padding:16px 0">Ставок пока нет</div>';
    rbtns.forEach(b => {
      const c = b.dataset.c, mine = myBets[c], p = pending[c];
      b.querySelector('small').textContent = mine ? `Ваша: ⭐ ${fmt(mine)}${G.phase === 'wait' ? ' · отмена' : ''}` : p ? 'Отправка…' : pool[c] ? `Банк: ⭐ ${fmt(pool[c])}` : '';
      b.classList.toggle('mine', !!mine); b.disabled = !net || (G.phase !== 'wait' && !mine) || !!p;
    });
  }

  function onMsg(m) {
    if (!alive) return;
    switch (m.t) {
      case 'welcome':
        G.me = m.you; G.offset = m.now + (m.rtt || 0) / 2 - Date.now(); G.phase = m.phase; G.until = m.until;
        $('#rhist').innerHTML = ''; (m.history || []).forEach(addHist);
        bets.clear(); Object.keys(myBets).forEach(k => delete myBets[k]);
        (m.bets || []).forEach(b => { bets.set(b.uid + '|' + b.color, { uid: b.uid, name: b.name, photo: b.photo, amount: b.amount, color: b.color, win: b.win, lost: m.phase === 'result' && b.win == null }); if (b.uid === G.me) myBets[b.color] = b.amount; });
        if (m.owed) { state.balance += m.owed; save(); bump(); toast(`Выигрыш получен: +${fmt(m.owed)} ⭐`); }
        if (m.result && m.phase === 'spin') startSpin(m.result.n, m.off, m.t0, m.dur || R_SPIN);
        else if (m.result) { rot = rEnd(m.result.n, m.off); G.res = m.result; G.spin = null; }
        dirty = true; setNet(!net || !net.local, m.online); renderBets(); break;
      case 'round':
        G.phase = 'wait'; G.until = m.until; G.res = null; G.spin = null; bets.clear(); Object.keys(myBets).forEach(k => delete myBets[k]); dirty = true; renderBets(); break;
      case 'spin': G.phase = 'spin'; startSpin(m.n, m.off, m.t0, m.dur || R_SPIN); renderBets(); break;
      case 'result':
        G.phase = 'result'; if (G.spin) rot = G.spin.r1; G.res = { n: m.n, c: m.c }; dirty = true; addHist(G.res);
        bets.forEach(b => { if (b.color === m.c) b.win = b.amount * R_MULT[m.c]; else b.lost = true; });
        if (m.c === 'green') notify('success'); renderBets(); break;
      case 'win': state.balance += m.payout; save(); bump(); notify('success'); toast(`x${m.mult} · +${fmt(m.payout - (myBets[m.color] || 0))} ⭐`); break;
      case 'bet':
        bets.set(m.uid + '|' + m.color, { uid: m.uid, name: m.name, photo: m.photo, amount: m.amount, color: m.color, win: null, lost: false });
        if (m.uid === G.me) { myBets[m.color] = m.amount; pending[m.color] = 0; }
        renderBets(); break;
      case 'unbet': bets.delete(m.uid + '|' + m.color); if (m.uid === G.me) delete myBets[m.color]; renderBets(); break;
      case 'refund': state.balance += m.amount; save(); break;
      case 'online': setNet(!net || !net.local, m.n); break;
      case 'err': if (m.color && pending[m.color]) { state.balance += pending[m.color]; save(); pending[m.color] = 0; } toast(m.msg || 'Ошибка'); renderBets(); break;
    }
  }

  rbtns.forEach(b => b.onclick = () => {
    const c = b.dataset.c; if (!net) return;
    if (myBets[c]) { if (G.phase === 'wait') net.send({ t: 'cancel', color: c }); return; }
    if (G.phase !== 'wait') return toast('Ставки закрыты');
    if (pending[c]) return;
    const v = Math.floor(Number(amt.value));
    if (!(v >= R_MIN)) { notify('error'); return toast(`Минимальная ставка ${R_MIN} ⭐`); }
    if (!spend(v)) return;
    pending[c] = v; net.send({ t: 'bet', amount: v, color: c }); haptic('medium'); renderBets();
  });
  el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { amt.value = Math.max(R_MIN, Math.floor((Number(amt.value) || R_MIN) * b.dataset.q)); });
  el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { amt.value = b.dataset.v; haptic(); });

  cleanup = () => {
    alive = false; cancelAnimationFrame(raf);
    if (!net) return;
    if (G.phase === 'wait') Object.keys({ ...myBets, ...pending }).forEach(c => { const a = (myBets[c] || 0) + (pending[c] || 0); if (a) { state.balance += a; net.send({ t: 'cancel', color: c }); } });
    else if (net.local && G.res) Object.keys(myBets).forEach(c => { if (c === G.res.c) state.balance += myBets[c] * R_MULT[c]; });
    save(); setTimeout(() => net && net.close(), 150);
  };

  const startLocal = () => { net = localRoulette(onMsg, TGU ? (TGU.username ? '@' + TGU.username : TGU.first_name || 'Игрок') : 'Игрок', (TGU && TGU.photo_url) || ''); $('#rooms').style.display = 'none'; setNet(false); };
  (async () => {
    const n = await connectServer(onMsg, () => { if (!alive) return; toast('Связь с сервером потеряна — офлайн-режим'); bets.clear(); Object.keys(myBets).forEach(k => delete myBets[k]); Object.keys(pending).forEach(k => delete pending[k]); startLocal(); }, 'roulette', room);
    if (!alive) { n && n.close(); return; }
    if (n) net = n; else startLocal();
    renderBets();
  })();

  const frame = now => {
    if (!alive) return;
    const w = Math.round(wrap.offsetWidth * dpr); if (w && w !== S) buildWheel();
    if (G.phase === 'spin' && G.spin) {
      const p = Math.min(1, Math.max(0, (srv() - G.t0) / G.dur));
      rot = G.spin.r0 + (G.spin.r1 - G.spin.r0) * (1 - Math.pow(1 - p, 4)); dirty = true;
      const k = Math.floor(rot / R_SEG); if (k !== lastK) { lastK = k; if (now - lastHap > 80) { lastHap = now; haptic('light'); } }
    }
    if (dirty) { drawWheel(); dirty = false; }
    let txt, cls = 'rcenter';
    if (G.phase === 'wait') txt = net ? Math.max(0, Math.ceil((G.until - srv()) / 1000)) + '' : '…';
    else if (G.phase === 'spin') txt = '🎰';
    else { txt = G.res ? String(G.res.n) : '…'; if (G.res) cls += ' ' + G.res.c; }
    const key = txt + cls; if (key !== lastCen) { lastCen = key; cen.textContent = txt; cen.className = cls; }
    raf = requestAnimationFrame(frame);
  };
  buildWheel(); raf = requestAnimationFrame(frame);
  try { document.fonts && document.fonts.load('800 20px Rubik').then(() => { if (alive) buildWheel(); }); } catch (e) {}
}

/* ---------- mines ---------- */
const MINE_OPTS = { 3: [1, 2, 3], 5: [3, 5, 8, 12], 7: [5, 10, 15, 20] };
const MINE_EDGE = 0.88; // комиссия игры: множители ниже «честных»
function minesScreen(el) {
  bar(el, 'MINES');
  let size = 5, mcount = 5, grid = [], opened = 0, bet = 50, live = false, alive = true;
  el.insertAdjacentHTML('beforeend', `<div class="mlive"><span class="dot"></span>LIVE <span id="mx" style="margin-left:auto;color:var(--gold)">1.00x</span></div>
    <div class="mgrid" id="mg"></div>
    <div class="chips" id="sizes"></div><div class="chips" id="mc"></div>
    <div class="betrow"><input id="bet" type="number" inputmode="numeric" value="50" min="1"></div>
    <button class="btn" id="go">Сделать ставку</button>`);
  const mg = $('#mg'), mx = $('#mx'), goB = $('#go'), betIn = $('#bet');
  const mult = () => { let m = 1; const T = size * size; for (let i = 0; i < opened; i++) m *= (T - i) / (T - mcount - i); return m * MINE_EDGE; };
  const draw = () => {
    mg.style.gridTemplateColumns = `repeat(${size},1fr)`; mg.innerHTML = '';
    for (let i = 0; i < size * size; i++) { const c = document.createElement('button'); c.className = 'cell'; c.textContent = '?'; c.onclick = () => click(i, c); mg.append(c); }
  };
  const chips = (id, arr, cur, cb) => {
    const e = $(id); e.innerHTML = '';
    arr.forEach(v => { const b = document.createElement('button'); b.className = 'chip' + (v[0] === cur ? ' on' : ''); b.textContent = v[1]; b.onclick = () => { if (live) return toast('Игра идёт'); cb(v[0]); haptic(); }; e.append(b); });
  };
  const ui = () => {
    chips('#sizes', [[3, '3x3'], [5, '5x5'], [7, '7x7']], size, v => { size = v; mcount = MINE_OPTS[v][1]; draw(); ui(); });
    chips('#mc', MINE_OPTS[size].map(v => [v, '💣 ' + v]), mcount, v => { mcount = v; ui(); });
  };
  const end = (won, hit) => {
    live = false; betIn.disabled = false; goB.className = 'btn'; goB.textContent = 'Сделать ставку';
    if (!won) { mg.classList.remove('shake'); void mg.offsetWidth; mg.classList.add('shake'); notify('error'); toast('💥 Мина!'); }
    const cells = [...mg.children]; let k = 0;
    grid.forEach((b, i) => {
      const c = cells[i]; if (!c || c.classList.contains('safe') || i === hit) return;
      const d = b && !won ? 160 + Math.min(k++, 12) * 70 : 0; // цепная реакция
      setTimeout(() => { if (!alive) return; c.classList.add(b ? 'bomb' : 'dim'); c.textContent = b ? '💣' : '👑'; if (b && !won) c.classList.add('boom'); }, d);
    });
  };
  const cash = () => { const w = Math.floor(bet * mult()); state.balance += w; save(); bump(); toast(`${w >= bet ? '+' : ''}${fmt(w - bet)} ⭐`); notify('success'); end(true); };
  const click = (i, c) => {
    if (!live || c.classList.contains('safe')) return;
    if (grid[i]) {
      c.classList.add('boom'); c.textContent = '💥'; setTimeout(() => { if (alive) { c.classList.add('bomb'); c.textContent = '💣'; } }, 450);
      return end(false, i);
    }
    c.classList.add('safe'); c.textContent = '👑'; opened++; mx.textContent = mult().toFixed(2) + 'x'; haptic();
    goB.textContent = `Забрать ⭐ ${fmt(bet * mult())}`;
    if (opened === size * size - mcount) cash();
  };
  goB.onclick = () => {
    if (live) { opened ? cash() : toast('Откройте хотя бы одну ячейку'); return; }
    bet = Math.floor(Number(betIn.value)); if (!spend(bet)) return;
    grid = Array(size * size).fill(0); let k = 0;
    while (k < mcount) { const r = Math.floor(Math.random() * grid.length); if (!grid[r]) { grid[r] = 1; k++; } }
    opened = 0; live = true; betIn.disabled = true; mx.textContent = '1.00x'; draw(); goB.className = 'btn green'; goB.textContent = 'Забрать';
  };
  cleanup = () => { live = false; alive = false; };
  draw(); ui();
}

/* ---------- tournament ---------- */
function tourScreen(el) {
  const rows = [
    ['#4', '🐙', 'w1', 'radial-gradient(circle at 30% 25%,#5eead4,#0f766e 75%)'],
    ['#5', '🦇', 'омутх', 'radial-gradient(circle at 30% 25%,#c084fc,#581c87 75%)'],
    ['#6', '🙂', ':)', 'radial-gradient(circle at 30% 25%,#fde68a,#d97706 75%)'],
    ...[7, 8, 9, 10].map(() => ['#--', '?', 'NOBODY', null]),
  ];
  el.insertAdjacentHTML('beforeend', `<div class="tour"><h2>🏆 Турнир</h2><p class="sub" style="margin-top:6px">Лучшие игроки</p>
    <div class="podium">
      <div class="pl p2"><div class="av">🖤</div><div class="nk">PUPSYA</div><div class="step s2">2</div></div>
      <div class="pl p1"><div class="crown">👑</div><div class="av">🦁</div><div class="nk">WENZOR</div><div class="step s1">1</div></div>
      <div class="pl p3"><div class="av">🐺</div><div class="nk">ONYX</div><div class="step s3">3</div></div>
    </div>
    <div class="ranks">${rows.map((r, i) => `<div class="rk" style="animation-delay:${0.5 + i * 0.06}s"><span class="n">${r[0]}</span>
      <span class="a ${r[3] ? '' : 'q'}" ${r[3] ? `style="background:${r[3]}"` : ''}>${r[1]}</span><span class="t">${esc(r[2])}</span></div>`).join('')}</div></div>`);
}

/* ---------- tasks ---------- */
const TASK_GOAL = 25000;
const TASK_LINK = 'https://t.me/xdsold';
let tasks = store.get('gr2_tasks', {}); if (!tasks || typeof tasks !== 'object') tasks = {};
const saveTasks = () => store.set('gr2_tasks', tasks);
function grant(n) { state.balance += n; save(); bump(); notify('success'); toast(`+${fmt(n)} ⭐ на баланс`); }
function openTG(url) { try { if (tg && tg.openTelegramLink) return tg.openTelegramLink(url); } catch (e) {} window.open(url, '_blank'); }

function tasksScreen(el) {
  el.insertAdjacentHTML('beforeend', `<div class="tour"><h2>✅ Задания</h2><p class="sub" style="margin-top:6px">Выполняй и получай звёзды</p></div>
    <div class="task" id="t1"><div class="ti"><h3>Стать крутым типом</h3><span class="rew">+⭐ 5 000</span></div><div class="ta"><button class="pbtn" id="t1b"></button></div></div>
    <div class="task wide" id="t2"><div class="ti"><h3>Написать комплимент владельцу</h3><span class="rew">+⭐ 10 000</span></div><div class="ta two"><button class="pbtn ghost" id="t2a">Выполнить</button><button class="pbtn" id="t2b"></button></div></div>
    <div class="task" id="t3"><div class="ti"><h3>Апнуть 25 000 ⭐</h3><span class="rew">+⭐ 50 000</span>
      <div class="prog"><i id="t3p"></i></div><div class="pt" id="t3t"></div></div><div class="ta"><button class="pbtn" id="t3b">Забрать</button></div></div>`);
  const b1 = $('#t1b'), b2a = $('#t2a'), b2b = $('#t2b'), b3 = $('#t3b');
  const paint = () => {
    // 1
    b1.textContent = tasks.t1 ? 'Выполнено ✓' : 'Проверить'; b1.disabled = !!tasks.t1; b1.classList.toggle('done', !!tasks.t1);
    // 2
    b2a.disabled = tasks.t2 === 'claimed';
    b2b.textContent = tasks.t2 === 'claimed' ? 'Получено ✓' : tasks.t2 === 'done' ? 'Забрать' : 'Проверить';
    b2b.disabled = tasks.t2 === 'claimed'; b2b.classList.toggle('done', tasks.t2 === 'claimed');
    // 3
    const bal = Math.floor(state.balance), pct = Math.min(100, bal / TASK_GOAL * 100);
    $('#t3p').style.width = pct + '%'; $('#t3t').textContent = `Баланс: ⭐ ${fmt(bal)} / ${fmt(TASK_GOAL)}`;
    b3.textContent = tasks.t3 ? 'Получено ✓' : 'Забрать'; b3.disabled = !!tasks.t3 || bal < TASK_GOAL; b3.classList.toggle('done', !!tasks.t3);
  };
  b1.onclick = () => { if (tasks.t1) return; tasks.t1 = 'claimed'; saveTasks(); grant(5000); paint(); };
  b2a.onclick = () => { openTG(TASK_LINK); if (!tasks.t2) { tasks.t2 = 'done'; saveTasks(); toast('Задание выполнено — нажмите «Забрать»'); paint(); } };
  b2b.onclick = () => {
    if (!tasks.t2) return toast('Сначала нажмите «Выполнить»');
    if (tasks.t2 === 'claimed') return; tasks.t2 = 'claimed'; saveTasks(); grant(10000); paint();
  };
  b3.onclick = () => { if (tasks.t3 || state.balance < TASK_GOAL) return; tasks.t3 = 'claimed'; saveTasks(); grant(50000); paint(); };
  balanceHook = paint; cleanup = () => { balanceHook = null; };
  paint();
}

/* ---------- profile ---------- */
const TGU = tg && tg.initDataUnsafe && tg.initDataUnsafe.user || null;
function profileScreen(el) {
  const name = TGU ? (TGU.username ? '@' + TGU.username : [TGU.first_name, TGU.last_name].filter(Boolean).join(' ')) : 'Игрок';
  const ini = (name.replace('@', '')[0] || '?').toUpperCase();
  const list = state.inv.map(g => ({ g, it: ITEM(g.n) })).sort((a, b) => b.it.p - a.it.p);
  const total = list.reduce((s, o) => s + o.it.p, 0);
  el.insertAdjacentHTML('beforeend', `<div class="pf"><div class="pf-av" id="pfav"></div><div class="pf-nm">${esc(name)}</div>${TGU ? `<div class="pf-id">ID ${esc(TGU.id)}</div>` : ''}</div>
    <div class="invhd"><h3>Инвентарь</h3><span>${list.length} шт · ⭐ ${fmt(total)}</span></div><div class="inv" id="inv"></div>`);
  const av = $('#pfav');
  const fallback = () => { av.innerHTML = `<span>${esc(ini)}</span>`; };
  if (TGU && TGU.photo_url) {
    const img = new Image(); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.onerror = fallback; img.src = TGU.photo_url; av.append(img);
  } else fallback();
  const inv = $('#inv');
  if (!list.length) { inv.innerHTML = '<div class="empty"><b>🎁</b>Инвентарь пуст.<br>Откройте кейс, чтобы получить подарок.</div>'; return; }
  list.forEach((o, i) => {
    const b = document.createElement('button'); b.className = 'tile'; b.style.setProperty('--c', o.it.c); b.style.animationDelay = Math.min(i, 12) * 30 + 'ms';
    b.innerHTML = `<b>${o.it.e}</b><small>⭐ ${fmt(o.it.p)}</small>`; b.onclick = () => openGift(o.g); inv.append(b);
  });
}
function openGift(g) {
  const it = ITEM(g.n); if (!it) return;
  const m = modal(`<div class="g-em" style="--c:${it.c}"><span>${it.e}</span></div><div class="g-n">${it.n}</div><div class="g-p">⭐ ${fmt(it.p)}</div>
    <div class="g-act"><button class="btn red" id="wd">Вывести</button><button class="btn green" id="sl">Продать</button></div>
    <div class="wd-msg" id="wdm">ВЫВОД НЕДОСТУПЕН ДО 29.11.2026</div>`);
  const msg = $('#wdm', m.el);
  $('#wd', m.el).onclick = () => { msg.classList.remove('go'); void msg.offsetWidth; msg.classList.add('go'); notify('error'); };
  $('#sl', m.el).onclick = () => {
    if (!invGift(g.id)) return m.close();
    const v = sellGift(g.id); m.close(); toast(`+${fmt(v)} ⭐ на баланс`); notify('success');
    if ($('#inv')) go('profile');
  };
}

/* ---------- tabs ---------- */
const SCREENS = { games: home, cases: casesList, case: caseScreen, upgrade: upgradeScreen, pick: pickScreen, crash: crashScreen, roulette: rouletteScreen, mines: minesScreen, tour: tourScreen, tasks: tasksScreen, profile: profileScreen, soon };
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#nav button').forEach(x => x.classList.remove('on')); b.classList.add('on');
  const t = b.dataset.tab; go(['games', 'tour', 'tasks', 'profile'].includes(t) ? t : 'soon');
});
save(); go('games');
