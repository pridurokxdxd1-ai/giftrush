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
let VIB = true; try { VIB = localStorage.getItem('gr4_vib') !== '0'; } catch (e) {}
const haptic = (t = 'light') => { if (!VIB) return; try { tg.HapticFeedback.impactOccurred(t); } catch (e) {} };
const notify = t => { if (!VIB) return; try { tg.HapticFeedback.notificationOccurred(t); } catch (e) {} };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- storage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

/* ---------- items ---------- */
const RAR = {
  common: '#8b8f9c', rare: '#3b82f6', epic: '#a855f7', legend: '#ffc83d', myth: '#ff4d5e', divine: '#ff6bf0',
};
function rar(p) { return p < 100 ? 'common' : p < 400 ? 'rare' : p < 1500 ? 'epic' : p < 5000 ? 'legend' : p < 30000 ? 'myth' : 'divine'; }
const OLD = { Lollipop: 10, Bear: 15, Cookie: 20, Rose: 25, Balloon: 35, Cake: 50, Cupcake: 65, Bouquet: 80, Clover: 100, Pumpkin: 130, Rocket: 170, Trophy: 220, Joystick: 300, Ring: 400, Orb: 550, Watch: 750, Diamond: 1000, Moai: 1400, Dragon: 2000, Unicorn: 2750, Castle: 3500, UFO: 5000, Crown: 7500, Galaxy: 10000, Volcano: 12000, Crystal: 15000, Trident: 20000, Island: 30000, Satellite: 40000, Meteor: 50000, Saturn: 75000, Comet: 100000, Earth: 150000, Sun: 250000, Nova: 500000, 'Big Bang': 1000000 };
/* настоящие NFT-подарки (картинки с вырезанным фоном) */
const ITEMS = [
  ['Champagne', 50, 'g_champagne.webp', '#3fbf7f'], ['Cup', 100, 'g_cup.webp', '#f2c14e'],
  ['Candy Cane', 450, 'g_candy.webp', '#ff5d8f'], ['Swag Bag', 490, 'g_swag.webp', '#8be04e'],
  ['Snake Box', 450, 'g_snake.webp', '#2fd6a0'], ['Big Year', 490, 'g_year.webp', '#ff6a6a'], ['Chill Flame', 500, 'g_flame.webp', '#f2c14e'],
  ['Spy Agaric', 570, 'g_agaric.webp', '#9be04e'], ['Love Potion', 1400, 'g_potion.webp', '#7af0a0'], ['Sharp Tongue', 3800, 'g_tongue.webp', '#c6ff3a'],
].map(([n, p, img, c]) => ({ n, p, img, c, r: rar(p), nc: false }));
const BY = {}; ITEMS.forEach(i => { BY[i.n] = i; });
const ITEM = n => BY[n] || null;
/* монеты Rushcoin, выпадающие из кейса (сразу идут на баланс) */
const COINS = [[1, '#9aa3b8'], [2, '#5b8def'], [3, '#5b8def'], [5, '#a06bf0'], [10, '#f2c14e'], [100, '#7aa8ff'], [210, '#a06bf0'], [250, '#c06bf0'], [350, '#f2c14e']].map(([p, c]) => ({ n: p + ' Rushcoin', p, c, coin: true }));
const COIN = p => COINS.find(x => x.p === p);
const rcI = '<i class="rc"></i>';
/* иконка предмета: картинка для подарка, монета с числом для Rushcoin */
const ico = (it, big) => it.coin ? `<span class="cn">${rcI}<b>${it.p}</b></span>` : `<img class="gi" src="${it.img}?v=14" alt="" draggable="false" decoding="async">`;

/* страховка: необработанная ошибка не должна «вешать» интерфейс */
window.addEventListener('error', () => {}); window.addEventListener('unhandledrejection', e => { e.preventDefault(); });
/* ---------- иконка Rushcoin (вместо ⭐) ---------- */
function iconify(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.nodeValue.indexOf('⭐') >= 0 ? 1 : 3 }), list = [];
  while (w.nextNode()) list.push(w.currentNode);
  list.forEach(n => {
    const f = document.createDocumentFragment();
    n.nodeValue.split('⭐').forEach((p, i) => { if (i) { const s = document.createElement('i'); s.className = 'rc'; f.append(s); } if (p) f.append(document.createTextNode(p)); });
    n.replaceWith(f);
  });
}
{ let sched = 0;
  new MutationObserver(() => { if (!sched) { sched = 1; requestAnimationFrame(() => { sched = 0; iconify(document.body); }); } }).observe(document.body, { childList: true, subtree: true, characterData: true }); }

/* ---------- state ---------- */
let balanceHook = null;
const state = {
  balance: Number(store.get('gr2_bal', 0)) || 0,
  inv: store.get('gr2_inv', []),
};
if (!Array.isArray(state.inv)) state.inv = [];
{ let refund = 0; state.inv.forEach(g => { if (g && !BY[g.n] && OLD[g.n]) refund += OLD[g.n]; });
  state.inv = state.inv.filter(g => g && g.id && BY[g.n]);
  if (refund) { state.balance += refund; store.set('gr2_bal', state.balance); store.set('gr2_inv', state.inv); } }
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
function toast(t) { const e = $('#toast'); e.textContent = t; iconify(e); e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('show'), 1900); }
/* лёгкий режим для слабых телефонов и пауза анимаций в фоне */
try {
  const weak = (navigator.hardwareConcurrency || 8) <= 6 || (navigator.deviceMemory || 8) <= 4;
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) document.documentElement.classList.add('ios');
  if (weak && !ios) document.documentElement.classList.add('lite');
  document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden));
} catch (e) {}


/* ---------- cases & odds ---------- */
/*ODDS_START*/
const CASES = [{
  n: 'Daily', img: 'case.webp', price: 0, daily: true, cd: 24 * 3600 * 1000,   // бесплатный, раз в сутки
  drops: [[ITEM('Champagne'), 2.3529], [ITEM('Cup'), 0.5882], [ITEM('Swag Bag'), 0.0005], [ITEM('Candy Cane'), 0.005],
    [COIN(10), 8.5905], [COIN(5), 17.0121], [COIN(3), 20.4145], [COIN(2), 8.506], [COIN(1), 42.5303]],   // сумма = 100%
  // что мелькает на ленте при прокрутке (не влияет на реальные шансы)
  bait: [[ITEM('Swag Bag'), 14], [ITEM('Candy Cane'), 14], [ITEM('Cup'), 16], [ITEM('Champagne'), 16], [COIN(10), 8], [COIN(5), 9], [COIN(3), 9], [COIN(2), 8], [COIN(1), 8]],
}, {
  n: 'Toxic', img: 'case_toxic.webp', price: 375,
  drops: [[COIN(100), 48.4999], [COIN(210), 33], [COIN(250), 0.8], [COIN(350), 0.7], [ITEM('Snake Box'), 10], [ITEM('Big Year'), 5],
    [ITEM('Swag Bag'), 2], [ITEM('Spy Agaric'), 0.0001], [ITEM('Love Potion'), 0], [ITEM('Sharp Tongue'), 0]],   // сумма = 100%; 0% — только мелькают на ленте
  // на ленте дорогие NFT и просто NFT мелькают чаще (на реальные шансы не влияет)
  bait: [[ITEM('Sharp Tongue'), 12], [ITEM('Love Potion'), 12], [ITEM('Spy Agaric'), 12], [ITEM('Swag Bag'), 12], [ITEM('Big Year'), 12], [ITEM('Snake Box'), 12],
    [COIN(350), 6], [COIN(250), 6], [COIN(210), 7], [COIN(100), 9]],
}];
CASES.forEach(c => { c.pool = c.drops.map(([it, w]) => ({ it, w })); c.sum = c.pool.reduce((t, o) => t + o.w, 0); });
function rollCase(c) {
  let x = Math.random() * c.sum;
  for (const o of c.pool) { if (o.w <= 0) continue; x -= o.w; if (x <= 0) return o.it; }
  return c.pool.filter(o => o.w > 0).pop().it;
}
/*ODDS_END*/

/* ---------- router ---------- */
let cleanup = null, backFn = null;
try { tg && tg.BackButton && tg.BackButton.onClick(() => { backFn && backFn(); }); } catch (e) {}
function setBack(fn) { backFn = fn; try { fn ? tg.BackButton.show() : tg.BackButton.hide(); } catch (e) {} }
function closeModals() { document.querySelectorAll('.ovl').forEach(o => o.remove()); }

function go(name, arg) {
  if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
  closeModals(); setBack(null);
  document.body.classList.toggle('home', name === 'games');
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
    cases: '<div class="art a-cs"><img class="chest" src="case.webp?v=29" alt=""><img class="gf g1" src="case_toxic.webp?v=29" alt=""><i class="dot d1"></i><i class="dot d2"></i><i class="dot d3"></i></div>',
    crash: '<div class="art a-crash"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M4 90 C 32 88, 54 68, 88 16" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".85"/></svg><span class="rkt" id="hrkt"></span><em>x2.45</em></div>',
    mines: `<div class="art a-mines">${cells}</div>`,
    upgrade: '<div class="art a-up"><span class="u u1"><img src="g_champagne.webp?v=14" alt=""></span><b>→</b><span class="u u2"><img src="g_cup.webp?v=29" alt=""></span><b>→</b><span class="u u3"><img src="g_swag.webp?v=29" alt=""></span></div>',
    roulette: '<div class="art a-roul"><i class="wheel"></i><i class="ptr"></i></div>',
    plinko: '<div class="art a-plk"><i class="pegs"></i><i class="ball"></i><div class="buck"><i></i><i></i><i></i></div></div>',
  };
  const T = (id, cls, name, extra = '') => `<button class="tile ${cls}" data-id="${id}">${art[id]}<h3>${name}</h3>${extra}</button>`;
  const strip = ITEMS.map(i => `<img src="${i.img}?v=29" alt="" draggable="false">`).join('');
  el.innerHTML = `<div class="mq home"><div class="mq-t">${strip}${strip}</div></div><h2 class="hd">Игры</h2><div class="hub">
    ${T('cases', 'wide t-cases', 'CASES')}
    <div class="row2">${T('crash', 'sq t-crash', 'CRASH', LIVE_BADGE)}${T('mines', 'sq t-mines', 'MINES', '<span class="new">NEW</span>')}</div>
    ${T('upgrade', 'wide t-up', 'UPGRADER')}
    <div class="row2">${T('roulette', 'sq t-roul', 'ROULETTE', LIVE_BADGE)}${T('plinko', 'sq t-plk', 'PLINKO', '<span class="new">NEW</span>')}</div>
  </div>`;
  const rk = $('#hrkt'); loadRocket();
  if (rk) { let f = 0; const tm = setInterval(() => { if (document.hidden) return; f = (f + 1) % 90; rk.style.backgroundPosition = `${-(f % 10) * 84}px ${-Math.floor(f / 10) * 84}px`; }, 33); cleanup = () => clearInterval(tm); }
  el.querySelectorAll('.tile').forEach((b, i) => {
    b.style.animationDelay = i * 70 + 'ms';
    b.onclick = () => go(b.dataset.id);
  });
}

/* ---------- cases ---------- */
function casesList(el) {
  bar(el, 'CASES');
  const g = document.createElement('div'); g.className = 'grid2'; el.append(g);
  CASES.forEach((c, i) => {
    const d = document.createElement('button'); d.className = 'case'; d.style.animationDelay = Math.min(i, 8) * 40 + 'ms';
    d.innerHTML = `${c.daily ? '<span class="tag">Бесплатно</span>' : ''}<span class="em"><img class="gi" src="${c.img}?v=29" alt="" draggable="false"></span><div class="nm"><span>${esc(c.n)}</span><span class="pr">${c.price ? '⭐ ' + fmt(c.price) : '24 ч'}</span></div>`;
    d.onclick = () => go('case', c); g.append(d);
  });
}
const TURBO_BTN = '<button class="turbo" id="turbo" aria-label="Быстрый режим"><svg viewBox="0 0 24 24"><path d="M13.5 1.5 4 13.5h6.2l-1.4 9 9.7-12.3h-6.3z" fill="currentColor"/></svg></button>';
const isTurbo = () => !!store.get('gr2_turbo', false);
function bindTurbo(el) {
  const b = $('#turbo', el); if (!b) return;
  const set = () => b.classList.toggle('on', isTurbo());
  set(); b.onclick = () => { store.set('gr2_turbo', !isTurbo()); set(); haptic('medium'); };
}
function caseScreen(el, c) {
  bar(el, c.n, 'cases');
  const mk = it => `<div class="it" style="--c:${it.c}">${ico(it)}</div>`;
  let cnt = c.daily ? 1 : Math.min(3, Math.max(1, Number(store.get('gr2_cnt', 1)) || 1));
  el.insertAdjacentHTML('beforeend', `<img class="case-hero" src="${c.img}?v=29" alt=""><div class="reels" id="reels"></div>
    <div class="win" id="win">${c.daily ? 'Бесплатный ежедневный кейс' : 'Цена: ⭐ ' + fmt(c.price)}</div><div id="act"></div>
    ${c.daily ? '' : `<div class="chips" id="cnt">${[1, 2, 3].map(n => `<button class="chip" data-n="${n}">x${n}</button>`).join('')}</div>`}
    <div class="openrow"><button class="btn" id="go"></button>${TURBO_BTN}</div>
    <h4 class="sec">Содержимое кейса</h4>
    <div class="drops">${c.pool.map(o => o.it).sort((x, y) => y.p - x.p).map(i => `<div class="dr"><div class="ic">${ico(i)}</div><span>${i.coin ? i.p + ' Rushcoin' : esc(i.n)}<small>⭐ ${fmt(i.p)}</small></span></div>`).join('')}</div>`);
  const reels = $('#reels'), win = $('#win'), act = $('#act'), btn = $('#go'); bindTurbo(el);
  const bw = c.bait || c.pool.map(o => [o.it, o.w]);
  const bsum = bw.reduce((t, o) => t + o[1], 0);
  const filler = () => { let x = Math.random() * bsum; for (const o of bw) { x -= o[1]; if (x <= 0) return o[0]; } return bw[0][0]; };   // «байт»: на ленте дорогие подарки мелькают чаще, чем выпадают
  let busy = false, tm = 0;
  const left = () => c.daily ? Math.max(0, Number(store.get('gr2_daily', 0)) + c.cd - Date.now()) : 0;
  const hms = ms => { const t = Math.ceil(ms / 1000), p = x => String(x).padStart(2, '0'); return `${p(Math.floor(t / 3600))}:${p(Math.floor(t % 3600 / 60))}:${p(t % 60)}`; };
  function tick() {
    if (busy) return;
    const l = left();
    btn.disabled = l > 0;
    btn.textContent = c.daily ? (l > 0 ? `Доступен через ${hms(l)}` : 'Открыть бесплатно') : `Открыть${cnt > 1 ? ' ×' + cnt : ''} за ⭐ ${fmt(c.price * cnt)}`;
    if (l > 0 && !tm) tm = setInterval(tick, 1000); else if (l <= 0 && tm) { clearInterval(tm); tm = 0; }
    iconify(btn);
  }
  cleanup = () => { clearInterval(tm); tm = 0; };
  const paint = () => {
    reels.className = 'reels' + (cnt > 1 ? ' multi' : '');
    reels.innerHTML = Array.from({ length: cnt }, () => `<div class="reel-wrap"><div class="reel">${Array.from({ length: 14 }, () => mk(filler())).join('')}</div></div>`).join('');
    tick();
    el.querySelectorAll('#cnt .chip').forEach(b => b.classList.toggle('on', Number(b.dataset.n) === cnt));
    iconify(btn);
  };
  el.querySelectorAll('#cnt .chip').forEach(b => b.onclick = () => { if (busy) return; cnt = Number(b.dataset.n); store.set('gr2_cnt', cnt); act.innerHTML = ''; win.textContent = `Цена: ⭐ ${fmt(c.price)}`; paint(); haptic(); });
  paint();
  btn.onclick = async () => {
    if (busy) return;
    const n = cnt;
    if (c.daily) { if (left() > 0) return tick(); store.set('gr2_daily', Date.now()); }
    else if (!spend(c.price * n)) return;
    busy = true; btn.disabled = true; act.innerHTML = ''; win.textContent = '';
    const prizes = Array.from({ length: n }, () => rollCase(c));
    const gifts = prizes.filter(p => !p.coin).map(p => addGift(p.n));   // подарки — в инвентарь, монеты — сразу на баланс
    const coinSum = prizes.reduce((t, p) => t + (p.coin ? p.p : 0), 0);
    if (coinSum) { state.balance += coinSum; save(); }
    const fast = isTurbo(), N = 52, stop = 44, strips = [...reels.querySelectorAll('.reel')];
    strips.forEach((reel, k) => {
      reel.style.transition = 'none'; reel.style.transform = 'translate3d(0,0,0)';
      reel.innerHTML = Array.from({ length: N }, (_, i) => i === stop ? prizes[k] : filler()).map(mk).join('');
    });
    void reels.offsetWidth;
    strips.forEach((reel, k) => {
      const w = reel.parentElement.offsetWidth, tgt = reel.children[stop];   // реальная позиция призового предмета
      const off = tgt.offsetLeft + tgt.offsetWidth / 2 - w / 2 + rnd(-tgt.offsetWidth * .3, tgt.offsetWidth * .3);
      reel.style.transition = fast ? `transform ${.85 + k * .12}s cubic-bezier(.2,.7,.15,1)` : `transform ${4.6 + k * .45}s cubic-bezier(.1,.75,.12,1)`;
      reel.style.transform = `translate3d(${-off}px,0,0)`;
    });
    const iv = fast ? 0 : setInterval(() => haptic('light'), 170);
    await sleep(fast ? 1100 + n * 120 : 4800 + n * 450); clearInterval(iv);
    if (!el.isConnected) return;
    notify('success');
    const sum = prizes.reduce((s, p) => s + p.p, 0), gsum = prizes.reduce((s, p) => s + (p.coin ? 0 : p.p), 0);
    if (coinSum) bump();
    win.innerHTML = n === 1 ? `<div class="pop" style="color:${prizes[0].c}">${prizes[0].coin ? '+' + prizes[0].p + ' ⭐' : esc(prizes[0].n) + ' · ⭐ ' + fmt(prizes[0].p)}</div>`
      : `<div class="pop">${prizes.map(p => `<span style="color:${p.c}">${p.coin ? '+' + p.p : esc(p.n)}</span>`).join(' · ')} · ⭐ ${fmt(sum)}</div>`;
    act.innerHTML = gifts.length ? `<button class="btn green sm" id="sell">${gifts.length > 1 ? 'Продать всё' : 'Продать'} за ⭐ ${fmt(gsum)}</button>` : '';
    if (gifts.length) $('#sell').onclick = () => {
      let v = 0; gifts.forEach(g => { if (invGift(g.id)) v += sellGift(g.id); });
      if (!v) return; toast(`+${fmt(v)} ⭐ на баланс`); act.innerHTML = ''; haptic('medium');
    };
    busy = false; tick();
  };
}

/* ---------- upgrade ---------- */
const up = { items: [], want: null, bal: 0 };
const UP_MAX = 80;
const stakeOf = () => {
  up.items = up.items.filter(id => invGift(id));
  const gs = up.items.map(id => invGift(id)), its = gs.map(g => ITEM(g.n));
  return { gs, its, S: its.reduce((t, i) => t + i.p, 0) + (up.bal || 0) };
};
const chanceOf = (S, w) => Math.min(UP_MAX, Math.max(0.01, (S / w.p) * 90));
function upgradeScreen(el) {
  bar(el, 'UPGRADER');
  up.bal = Math.min(Math.max(0, Math.floor(up.bal || 0)), Math.floor(state.balance));
  let { gs: mgs, its: mis, S } = stakeOf();
  let wi = up.want ? ITEM(up.want) : null;
  if (wi && wi.p <= S) { wi = null; up.want = null; }
  const slot = i => i ? `${ico(i)}<small>⭐ ${fmt(i.p)}</small>` : '<small>＋ Добавить</small>';
  const mslot = its => its.length ? `<span class="mi">${its.slice(0, 4).map(i => ico(i)).join('')}</span><small>${its.length} шт · ⭐ ${fmt(its.reduce((t, i) => t + i.p, 0))}</small>` : '<small>＋ Добавить подарки</small>';
  el.insertAdjacentHTML('beforeend', `<p class="sub">Ставьте подарок и/или Rushcoin. Чем больше ставка, тем выше шанс (максимум ${UP_MAX}%)</p>
    <div class="slot"><h4>Ваши подарки (можно несколько)</h4><button class="pick ${mis.length ? 'has' : ''}" id="mine">${mslot(mis)}</button></div>
    <div class="slot"><h4>Добавить Rushcoin</h4><div class="betrow" style="margin:0"><input id="ubal" type="number" inputmode="numeric" min="20" placeholder="0" value="${up.bal || ''}"><button data-q="0.5">½</button><button data-q="2">×2</button><button id="umax">MAX</button></div></div>
    <div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="#2a2c33" stroke-width="9"/>
      <defs><linearGradient id="ug" gradientUnits="userSpaceOnUse" x1="94" y1="0" x2="6" y2="0"><stop offset="0" stop-color="#c6ff4a"/><stop offset=".5" stop-color="#6fe66a"/><stop offset="1" stop-color="#0fae52"/></linearGradient></defs><circle id="rarc" cx="50" cy="50" r="44" fill="none" stroke="url(#ug)" stroke-width="9" stroke-dasharray="0 276.46" style="transition:stroke-dasharray .4s var(--ease)"/></svg>
      <div class="hand" id="hand"><i class="head"></i></div><div class="num"><b id="rnum">—</b><small id="rx"></small></div></div>
    <div class="slot"><h4>Желаемый подарок</h4><button class="pick" id="want"></button></div>
    <div class="openrow"><button class="btn" id="go"></button>${TURBO_BTN}</div>`);
  bindTurbo(el);
  const ubal = $('#ubal'), rnum = $('#rnum'), rx = $('#rx'), goB = $('#go'), wantB = $('#want');
  let chance = 0;
  const paint = () => {
    ({ gs: mgs, its: mis, S } = stakeOf());
    if (wi && wi.p <= S) { wi = null; up.want = null; }
    $('#mine').className = 'pick ' + (mis.length ? 'has' : ''); $('#mine').innerHTML = mslot(mis);
    wantB.className = 'pick ' + (wi ? 'has' : ''); wantB.innerHTML = slot(wi);
    chance = S ? (wi ? chanceOf(S, wi) : 0) : 0;
    $('#rarc').style.strokeDasharray = `${chance / 100 * 276.46} 276.46`;
    rnum.textContent = chance ? (chance < 1 ? chance.toFixed(2) : chance.toFixed(1)) + '%' : '—'; rx.textContent = chance ? `x${wi.p / S >= 1000 ? fmt(Math.round(wi.p / S)) : (wi.p / S).toFixed(2)}` : (S ? `ставка ⭐ ${fmt(S)}` : '');
    goB.textContent = !S ? 'Добавьте подарок или Rushcoin' : !wi ? 'Выбрать желаемый подарок' : 'Апгрейд';
  };
  const setBal = v => { up.bal = Math.min(Math.max(0, Math.floor(Number(v) || 0)), Math.floor(state.balance)); paint(); };
  ubal.addEventListener('input', () => setBal(ubal.value));
  el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { setBal(Math.max(20, (up.bal || 20) * b.dataset.q)); ubal.value = up.bal || ''; });
  $('#umax').onclick = () => { setBal(state.balance); ubal.value = up.bal || ''; haptic(); };
  $('#mine').onclick = () => go('pick', 'mine');
  wantB.onclick = () => S ? go('pick', 'want') : toast('Сначала добавьте подарок или Rushcoin');
  paint();
  let busy = false;
  goB.onclick = async () => {
    if (busy) return;
    if (!S) return toast('Добавьте подарок или Rushcoin');
    if (up.bal > 0 && up.bal < 20) return toast('Минимум 20 ⭐ Rushcoin');
    if (!wi) return go('pick', 'want');
    if (mgs.some(g => !invGift(g.id))) return toast('Подарок уже недоступен');
    if (up.bal > state.balance) return toast('Недостаточно ⭐');
    if (up.bal > 0 && !spend(up.bal)) return;
    busy = true; goB.disabled = true; ubal.disabled = true;
    const ok = Math.random() * 100 < chance;
    if (mgs.length) { const ids = new Set(mgs.map(g => g.id)); state.inv = state.inv.filter(x => !ids.has(x.id)); }
    if (ok) addGift(wi.n); save(); // результат сохраняем сразу
    const hand = $('#hand'), ring = $('.ring'); hand.classList.add('on');
    const arc = chance / 100 * 360;
    // при проигрыше чаще останавливаемся совсем рядом с зелёной зоной — «чуть-чуть не хватило»
    const mg6 = Math.min(6, arc / 3);                       // отступ от краёв, чтобы кончик стрелки не «касался» границы
    const th = ok ? rnd(mg6, arc - mg6) : rnd(arc + 6, 354);
    hand.style.transition = 'none'; hand.style.transform = 'rotate(0deg)'; void hand.offsetWidth;
    const fast = isTurbo();
    hand.style.willChange = 'transform'; hand.style.transition = fast ? 'transform 1.3s cubic-bezier(.25,.55,.35,1)' : 'transform 4.6s cubic-bezier(.25,.55,.35,1)'; hand.style.transform = `rotate(${360 * (fast ? 3 : 5) + th}deg)`;
    ring.classList.add('spin'); try { tg.HapticFeedback.impactOccurred('medium'); } catch (e) {}
    await sleep(fast ? 1450 : 4800);
    hand.style.willChange = ''; ring.classList.remove('spin'); ring.classList.add(ok ? 'win' : 'lose'); if (ok) burst(ring);
    notify(ok ? 'success' : 'error');
    toast(ok ? `🎉 Успех! ${wi.n}` : '💥 Неудача, ставка сгорела');
    up.items = [];                                    // подарки-ставка использованы; желаемый предмет и сумма остаются
    up.bal = Math.min(up.bal || 0, Math.floor(state.balance)); ubal.value = up.bal || '';
    await sleep(1300);
    if (!el.isConnected) return;
    ring.classList.remove('win', 'lose'); hand.classList.remove('on'); hand.style.transition = 'none'; hand.style.transform = 'rotate(0deg)';
    ubal.disabled = false; goB.disabled = false; busy = false; paint();
  };
}
function burst(host) {
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('span'); s.className = 'spark';
    const ang = Math.random() * 6.283, d = 80 + Math.random() * 70;
    s.style.setProperty('--x', Math.cos(ang) * d + 'px'); s.style.setProperty('--y', Math.sin(ang) * d + 'px');
    s.style.background = ['#ffc83d', '#35d07f', '#fff', '#7aa8ff'][i % 4]; host.append(s); setTimeout(() => s.remove(), 1000);
  }
}
function pickScreen(el, kind) {
  bar(el, kind === 'mine' ? 'Ваши подарки' : 'Желаемый подарок', 'upgrade');
  const { S } = stakeOf();
  const g = document.createElement('div'); g.className = 'grid2'; el.append(g);
  let list;
  if (kind === 'mine') list = state.inv.map(x => ({ id: x.id, it: ITEM(x.n) })).sort((a, b) => a.it.p - b.it.p);
  else list = ITEMS.filter(i => i.p > S).sort((a, b) => a.p - b.p).map(i => ({ id: i.n, it: i }));
  if (!list.length) { g.innerHTML = kind === 'mine' ? '<div class="empty"><b>📭</b>Пока пусто. Откройте кейс.</div>' : '<div class="empty"><b>📭</b>Нет подарков дороже вашей ставки.</div>'; return; }
  let done, info;
  if (kind === 'mine') {
    const row = document.createElement('div'); row.className = 'pk-bar';
    row.innerHTML = '<button class="btn sm" id="pkok"></button><button class="pk-clr" id="pkclr">Сбросить</button>'; el.insertBefore(row, g);
    done = $('#pkok', row); info = () => { const n = up.items.length, sum = up.items.reduce((t, id) => t + ITEM(invGift(id).n).p, 0); done.textContent = n ? `Готово · ${n} шт · ⭐ ${fmt(sum)}` : 'Готово'; };
    done.onclick = () => go('upgrade');
    $('#pkclr', row).onclick = () => { up.items = []; g.querySelectorAll('.case.sel').forEach(x => x.classList.remove('sel')); info(); haptic(); };
    info();
  }
  list.forEach((o, i) => {
    const b = document.createElement('button'); b.className = 'case' + (kind === 'mine' && up.items.includes(o.id) ? ' sel' : ''); b.style.animationDelay = Math.min(i, 8) * 35 + 'ms';
    const ch = kind === 'want' ? chanceOf(S, o.it) : 0;
    b.innerHTML = `<span class="em" style="height:64px;animation:none">${ico(o.it)}</span><div class="nm"><span>${o.it.n}</span><span class="pr">⭐ ${fmt(o.it.p)}</span></div>${kind === 'want' ? `<div class="pk-ch">x${(o.it.p / S).toFixed(2)} · ${ch < 1 ? ch.toFixed(2) : ch.toFixed(1)}%</div>` : '<i class="pk-ok">✓</i>'}`;
    b.onclick = () => {
      if (kind === 'mine') { const k = up.items.indexOf(o.id); if (k >= 0) up.items.splice(k, 1); else up.items.push(o.id); up.want = null; b.classList.toggle('sel', k < 0); info(); haptic(); }
      else { up.want = o.id; go('upgrade'); }
    };
    g.append(b);
  });
}

/* ---------- ракета (спрайт из видео) ---------- */
const RK = { img: null, ok: false, FR: 360, COLS: 10, N: 90, FPS: 30 };
function loadRocket() {
  if (RK.img) return; RK.img = new Image(); RK.img.onload = () => { RK.ok = true; }; RK.img.onerror = () => {}; RK.img.src = 'rocket.webp?v=29';
}
function drawRocket(ctx, x, y, size, t, alpha, rot) {
  if (!RK.ok) { ctx.save(); ctx.globalAlpha = alpha; ctx.font = `${size * .55}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🚀', x, y); ctx.restore(); return; }
  const ff = t / 1000 * RK.FPS, f = Math.floor(ff) % RK.N, g = (f + 1) % RK.N, fr = ff - Math.floor(ff);   // плавное перетекание кадров (без дёрганья)
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = alpha; ctx.drawImage(RK.img, (f % RK.COLS) * RK.FR, Math.floor(f / RK.COLS) * RK.FR, RK.FR, RK.FR, -size / 2, -size / 2, size, size);
  ctx.globalAlpha = alpha * fr; ctx.drawImage(RK.img, (g % RK.COLS) * RK.FR, Math.floor(g / RK.COLS) * RK.FR, RK.FR, RK.FR, -size / 2, -size / 2, size, size); ctx.restore();
}

/* ---------- crash (онлайн, общий сервер) ---------- */
/* рост иксa ускоряется: x = exp(K1·t + K2·t²), максимум x100 */
const CRASH_K1 = 0.12, CRASH_K2 = 0.004, CRASH_MAX = 100;
const crashMult = ms => { const t = Math.max(0, ms) / 1000; return Math.min(CRASH_MAX, Math.floor(Math.exp(CRASH_K1 * t + CRASH_K2 * t * t) * 100) / 100); };
const crashTime = x => { const L = Math.log(x); return (-CRASH_K1 + Math.sqrt(CRASH_K1 * CRASH_K1 + 4 * CRASH_K2 * L)) / (2 * CRASH_K2) * 1000; };
/* Онлайн-режим (общие раунды на сервере) временно выключен. Чтобы вернуть: ONLINE = true */
const ONLINE = false;
const OFFLINE_TXT = ONLINE ? 'Офлайн-режим · сервер не найден' : 'Офлайн-режим';
const LIVE_BADGE = ONLINE ? '<span class="live">ONLINE</span>' : '';
const apiBase = () => { try { return new URLSearchParams(location.search).get('api') || ''; } catch (e) { return ''; } };

/* огромные иксы редкие; история живёт, пока открыт бот (новый запуск — новая история) */
const genCrash = () => { let x = 0.95 / (1 - Math.random() * 0.9993); if (x > 8) x = 8 + (x - 8) * 0.3; return Math.min(CRASH_MAX, Math.max(1, +x.toFixed(2))); };
const CRASH_HIST = Array.from({ length: 9 }, genCrash);

/* офлайн-сервер: тот же протокол, но раунды крутятся прямо в телефоне */
function localServer(onMsg) {
  let phase = 'wait', round = 0, until = 0, t0 = 0, crashAt = 2, crashMs = 0, bet = null, closed = false;
  const timers = [], hist = CRASH_HIST;
  const T = (fn, ms) => timers.push(setTimeout(fn, ms));
  const emit = m => { if (!closed) onMsg(m); };
  const me = { uid: 'me', name: TGU ? (TGU.username ? '@' + TGU.username : TGU.first_name || 'Игрок') : 'Игрок', photo: (TGU && TGU.photo_url) || '' };
  const newRound = first => {
    round++; phase = 'wait'; bet = null;
    crashAt = genCrash(); crashMs = crashTime(crashAt); until = Date.now() + 6000;
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
        if (phase !== 'wait' || bet || !(m.amount >= 20)) return emit({ t: 'err', code: 'bet', msg: 'Ставка не принята' });
        bet = { amount: m.amount, mult: null }; emit({ t: 'bet', uid: me.uid, name: me.name, photo: me.photo, amount: m.amount });
      } else if (m.t === 'cancel') {
        if (phase === 'wait' && bet) { const a = bet.amount; bet = null; emit({ t: 'refund', amount: a }); emit({ t: 'unbet', uid: me.uid }); }
      } else if (m.t === 'cash') {
        if (phase !== 'fly' || !bet || bet.mult != null) return;
        const el = Date.now() - t0; if (el >= crashMs) return emit({ t: 'err', code: 'late', msg: 'Слишком поздно' });
        let mu = crashMult(el); if (m.auto >= 1.01) mu = Math.min(mu, +m.auto); bet.mult = mu;
        emit({ t: 'cash_ok', mult: mu, payout: Math.floor(bet.amount * mu) }); emit({ t: 'cash', uid: me.uid, mult: mu });
      }
    },
    close() { closed = true; timers.forEach(clearTimeout); },
  };
}

/* подключение к общему серверу; null — если сервера нет или он недоступен */
function connectServer(onMsg, onClose, game, room) {
  return new Promise(res => {
    const api = ONLINE ? apiBase() : ''; if (!api) return res(null);
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
    <div class="betrow"><input id="bet" type="number" inputmode="numeric" value="50" min="20"><button data-m="0.5">½</button><button data-m="2">×2</button><button data-max>MAX</button></div>
    <div class="auto"><span>Авто-вывод</span><label class="ax"><input id="auto" type="number" inputmode="decimal" step="0.01" min="1.01" max="100"><b>x</b></label><button class="sw" id="autoSw" aria-label="Авто-вывод"><i></i></button></div>
    <button class="btn" id="go" disabled>Подключение…</button>
    <div class="bhd"><h4 class="sec" style="margin:0">Ставки</h4><span id="bcount"></span></div>
    <div class="bets" id="bets"></div>`);
  const room = getRoom(); if (ONLINE) roomChips($('#rooms'), room, () => go('crash'));
  const cv = $('#cv'), ctx = cv.getContext('2d'), multEl = $('#mult'), goBtn = $('#go'), histEl = $('#hist'), betIn = $('#bet'), betsEl = $('#bets');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(10, cv.offsetWidth) * dpr; cv.height = Math.max(10, cv.offsetHeight) * dpr;
  const W = cv.width, H = cv.height;
  el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { if (!betIn.disabled) betIn.value = Math.max(20, Math.floor((Number(betIn.value) || 20) * b.dataset.m)); });
  el.querySelectorAll('[data-max]').forEach(b => b.onclick = () => { if (!betIn.disabled) { betIn.value = Math.max(0, Math.floor(state.balance)); haptic(); } });

  const autoIn = $('#auto'), autoSw = $('#autoSw');
  let AU = store.get('gr2_auto', { on: false, v: 2 }); if (!AU || typeof AU !== 'object') AU = { on: false, v: 2 };
  autoIn.value = (Number(AU.v) >= 1.01 ? Number(AU.v) : 2).toFixed(2); autoSw.classList.toggle('on', !!AU.on);
  const autoVal = () => Math.min(100, Math.max(1.01, Number(autoIn.value) || 2));
  const autoSave = () => { AU = { on: AU.on, v: autoVal() }; store.set('gr2_auto', AU); };
  autoIn.onchange = () => { autoIn.value = autoVal().toFixed(2); autoSave(); };
  autoSw.onclick = () => { AU.on = !AU.on; autoSw.classList.toggle('on', AU.on); autoSave(); haptic(); toast(AU.on ? `Авто-вывод на x${autoVal().toFixed(2)}` : 'Авто-вывод выключен'); };
  loadRocket();
  const G = { phase: 'wait', until: 0, t0: 0, crashAt: 1, offset: 0, me: null, crashTs: 0 };
  const bets = new Map();
  let rkx = 0, rky = 0, myBet = 0, myCashed = false, myPayout = 0, pending = 0, cashSent = false, net = null, alive = true, raf = 0, tail = [], lastBtn = '';
  const srv = () => Date.now() + G.offset;
  const fl = v => (Math.floor(v * 100) / 100).toFixed(2);

  const addHist = v => { histEl.insertAdjacentHTML('afterbegin', `<span class="${v >= 10 ? 'y' : v >= 2 ? 'h' : 'l'}">${fl(v)}x</span>`); while (histEl.children.length > 9) histEl.lastChild.remove(); };
  const setNet = (online, n) => {
    $('#net').className = 'net ' + (online ? 'on' : 'off');
    $('#netTxt').textContent = online ? `Сервер ${room} · онлайн: ${n || 1}` : OFFLINE_TXT;
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
        G.phase = 'wait'; G.crashTs = 0; G.until = m.until; bets.clear(); myBet = 0; myCashed = false; myPayout = 0; cashSent = false; tail = [];
        multEl.classList.remove('lose'); renderBets(); break;
      case 'fly': G.phase = 'fly'; G.t0 = m.t0; break;
      case 'crash':
        G.phase = 'crash'; G.crashTs = Date.now(); G.crashAt = m.at; bets.forEach(b => { if (b.mult == null) b.lost = true; });
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
      if (myBet) { txt = `Ставка принята ⭐ ${fmt(myBet)}`; cls = 'btn green'; dis = true; }
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
        if (!(v >= 20)) { notify('error'); return toast('Минимальная ставка 20 ⭐'); }
        if (!spend(v)) return;
        pending = v; net.send({ t: 'bet', amount: v }); haptic('medium');
      } else if (myBet) toast('Ставку отменить нельзя');
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
  const light = document.documentElement.classList.contains('ios') || document.documentElement.classList.contains('lite');
  const stars = Array.from({ length: light ? 14 : 22 }, (_, i) => { const l = i % 3; return { x: Math.random() * W, y: Math.random() * H * .66, l, s: (.5 + l * .55) * dpr, v: (.08 + l * .12) * dpr, a: .25 + l * .2 }; });
  let spd = .4, gridP = 0, animT = 0, lastT = Date.now(), shoot = null, nextShoot = Date.now() + 2500;
  const HY = H * .64;   // линия горизонта
  const RS = Math.min(W * .38, 132 * dpr);               // размер ракеты
  const X0 = W * .17, Y0 = H * .8, X1 = W * .5, Y1 = H * .6; // старт слева-снизу → центр (дальше она не уходит)
  let burst = null;
  const crashing0 = () => G.phase === 'crash';
  const frame = () => {
    if (!alive) return;
    const now = Date.now();
    const dt = Math.min(64, now - lastT) / 1000; lastT = now;
    const curM = G.phase === 'fly' ? crashMult(srv() - G.t0) : 1;
    /* чем выше икс — тем быстрее летит мир и крутится ракета */
    const tgt = G.phase === 'fly' ? 1.2 + Math.log2(curM) * 1.1 : crashing0() ? .15 : .45;
    spd += (tgt - spd) * Math.min(1, dt * 3);
    animT += dt * 1000 * (G.phase === 'fly' ? 1 + Math.min(2.2, Math.log2(curM) * .35) : 1);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (G.phase === 'fly' && curM >= 5) { const q = Math.min(2.2, Math.log10(curM)) * dpr; ctx.translate((Math.random() - .5) * q, (Math.random() - .5) * q); }   // лёгкая тряска на больших иксах
    /* звёзды в 3 слоя (параллакс) */
    ctx.fillStyle = '#fff';
    stars.forEach(s => { s.y += s.v * spd * 1.6; if (s.y > HY) { s.y = 0; s.x = Math.random() * W; } ctx.globalAlpha = s.a; ctx.fillRect(s.x, s.y, s.s, s.s * (1 + Math.min(2.5, spd * .3) * s.l)); });
    /* падающие звёзды */
    if (now > nextShoot && !shoot) { shoot = { x: W * rnd(.3, 1), y: H * rnd(.05, .3), t: 0 }; nextShoot = now + rnd(2200, 5200); }
    if (shoot) { shoot.t += dt; const k = shoot.t / .7, x = shoot.x - k * W * .35, y = shoot.y + k * H * .16;
      const sg = ctx.createLinearGradient(x, y, x + W * .1, y - H * .035); sg.addColorStop(0, '#fff'); sg.addColorStop(1, '#ffffff00');
      ctx.globalAlpha = Math.max(0, 1 - k); ctx.strokeStyle = sg; ctx.lineWidth = 1.6 * dpr; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + W * .1, y - H * .035); ctx.stroke(); if (k >= 1) shoot = null; }
    /* бегущая сетка-пол */
    gridP = (gridP + dt * spd * .55) % 1;
    ctx.lineWidth = 1 * dpr; ctx.strokeStyle = '#9a6bff';
    const nv = light ? 7 : 11;
    for (let i = -nv; i <= nv; i++) { ctx.globalAlpha = .22; ctx.beginPath(); ctx.moveTo(W / 2 + i * W * .028, HY); ctx.lineTo(W / 2 + i * W * .2, H); ctx.stroke(); }
    for (let j = 0; j < 9; j++) { const z = (j + gridP) / 9, y = HY + (H - HY) * z * z; ctx.globalAlpha = .08 + z * .3; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const hg = ctx.createLinearGradient(0, HY - 14 * dpr, 0, HY + 10 * dpr); hg.addColorStop(0, '#8d5bff00'); hg.addColorStop(.6, '#8d5bff55'); hg.addColorStop(1, '#8d5bff00');
    ctx.globalAlpha = 1; ctx.fillStyle = hg; ctx.fillRect(0, HY - 14 * dpr, W, 24 * dpr);
    ctx.globalAlpha = 1;
    /* авто-вывод */
    if (G.phase === 'fly' && AU.on && myBet && !myCashed && !cashSent && curM >= autoVal()) { cashSent = true; net.send({ t: 'cash', auto: autoVal() }); haptic('medium'); }
    if (G.phase === 'wait') { multEl.textContent = Math.max(0, (G.until - srv()) / 1000).toFixed(1) + 'с'; rkx = X0; rky = Y0 + Math.sin(now / 420) * 4 * dpr; }
    if (G.phase === 'fly') {
      const m = crashMult(srv() - G.t0); multEl.textContent = fl(m) + 'x';
      const p = Math.min(1, (m - 1) / 2.4), e = 1 - Math.pow(1 - p, 2.2);
      rkx = X0 + (X1 - X0) * e; rky = Y0 + (Y1 - Y0) * e + (p >= 1 ? Math.sin(now / 260) * 5 * dpr : Math.sin(now / 90) * 1.5 * dpr);
      if (p >= 1) tail.forEach(t => { t[0] -= 3.2 * dpr; t[1] += 2.2 * dpr; });   // у центра ракета «стоит», а мир уезжает назад
      tail.push([rkx, rky + RS * .12]); if (tail.length > 46) tail.shift();
    }
    const crashing = G.phase === 'crash';
    if (tail.length > 1 && (G.phase === 'fly' || crashing)) {
      const g = ctx.createLinearGradient(tail[0][0], tail[0][1], rkx, rky); g.addColorStop(0, '#5b7cff00'); g.addColorStop(1, crashing ? '#ff6b7a' : '#7b96ff');
      ctx.strokeStyle = g; ctx.lineWidth = 4 * dpr; ctx.lineCap = 'round';
      ctx.beginPath(); tail.forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.stroke();
    }
    if (crashing && G.crashTs) {
      const ct = now - G.crashTs, k = Math.min(1, ct / 900);
      if (!burst) burst = Array.from({ length: 14 }, () => ({ a: Math.random() * 6.283, v: rnd(2, 6) * dpr }));
      if (k < 1) {
        drawRocket(ctx, rkx + ct * .05 * dpr, rky + ct * ct * .0004 * dpr, RS, animT, 1 - k, ct * .004);
        ctx.fillStyle = `rgba(255,120,60,${(1 - k) * .55})`; ctx.beginPath(); ctx.arc(rkx, rky, RS * (.25 + k * .5), 0, 7); ctx.fill();
        burst.forEach(b => { ctx.fillStyle = `rgba(255,200,80,${1 - k})`; ctx.beginPath(); ctx.arc(rkx + Math.cos(b.a) * b.v * ct * .06, rky + Math.sin(b.a) * b.v * ct * .06, 3 * dpr, 0, 7); ctx.fill(); });
      }
    } else {
      burst = null;
      if (G.phase === 'fly') { const k = Math.min(1, (now - (G.t0 - G.offset)) / 350); drawRocket(ctx, rkx, rky, RS * (.55 + .45 * (1 - Math.pow(1 - k, 3))), animT, k, 0); }  // ракета появляется, когда начинается полёт
    }
    ctx.restore();
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
const R_MULT = { red: 2, black: 2, green: 12, odd: 2, even: 2 };
const R_NAME = { red: 'Красное', black: 'Чёрное', green: 'Зелёное', odd: 'Нечётное', even: 'Чётное' };
const rWin = (k, n) => k === 'green' ? n === 0 : k === 'red' ? n > 0 && n % 2 === 1 : k === 'black' ? n > 0 && n % 2 === 0 : k === 'odd' ? n > 0 && n % 2 === 1 : k === 'even' ? n > 0 && n % 2 === 0 : false;
const rGroup = k => (k === 'odd' || k === 'even') ? 'p' : 'c';
let rHist = store.get('gr2_rhist', []); if (!Array.isArray(rHist)) rHist = []; rHist = rHist.filter(n => Number.isInteger(n) && n >= 0 && n <= 36).slice(-12);
const rHistPush = n => { rHist.push(n); rHist = rHist.slice(-12); store.set('gr2_rhist', rHist); };
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
        phase = 'result'; rHistPush(n);
        const wins = []; Object.keys(bets).forEach(k => { if (rWin(k, n)) wins.push({ uid: 'me', color: k, payout: bets[k] * R_MULT[k] }); });
        emit({ t: 'result', n, c, wins });
        wins.forEach(w => emit({ t: 'win', color: w.color, payout: w.payout, mult: R_MULT[w.color] }));
        T(() => loop(false), R_SHOW);
      }, R_SPIN);
    }, R_WAIT);
  };
  loop(true);
  T(() => emit({ t: 'welcome', now: Date.now(), you: 'me', online: 1, room: 'local', phase, round, until, t0: 0, dur: R_SPIN, result: null, off: 0, history: rHist.map(n => ({ n })), bets: [], owed: 0 }), 0);
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
    <div class="qamt"><button data-v="20">20</button><button data-v="100">100</button><button data-v="500">500</button><button data-v="max">MAX</button></div>
    <div class="rbtns" id="rbtns">
      <button class="rb red" data-c="red"><b>КРАСНОЕ</b><span>x2</span><small></small></button>
      <button class="rb green" data-c="green"><b>ЗЕРО</b><span>x12</span><small></small></button>
      <button class="rb black" data-c="black"><b>ЧЁРНОЕ</b><span>x2</span><small></small></button></div>
    <div class="rbtns rp" id="rbtns2">
      <button class="rb odd" data-c="odd"><b>НЕЧЁТ</b><span>x2</span><small></small></button>
      <button class="rb even" data-c="even"><b>ЧЁТ</b><span>x2</span><small></small></button></div>
    <div class="odds">Красное/чёрное/чёт/нечет x2 · зелёное x12 · цвет и чёт/нечет вместе ставить нельзя · мин. ставка 20 ⭐</div>
    <div class="bhd"><h4 class="sec" style="margin:0">Ставки</h4><span id="bcount"></span></div><div class="bets" id="bets"></div>`);
  if (ONLINE) roomChips($('#rooms'), room, () => go('roulette'));
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
    $('#netTxt').textContent = online ? `Сервер ${room} · онлайн: ${n || 1}` : OFFLINE_TXT;
  };
  const addHist = r => { const h = $('#rhist'); h.insertAdjacentHTML('afterbegin', `<span class="${rColor(r.n)}">${r.n}</span>`); while (h.children.length > 12) h.lastChild.remove(); };

  function renderBets() {
    const arr = [...bets.values()].sort((a, b) => b.amount - a.amount).slice(0, 40);
    const pool = { red: 0, black: 0, green: 0, odd: 0, even: 0 }; bets.forEach(b => { pool[b.color] += b.amount; });
    $('#bcount').textContent = bets.size ? `${bets.size} · ⭐ ${fmt(pool.red + pool.black + pool.green + pool.odd + pool.even)}` : '';
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
        bets.forEach(b => { if (rWin(b.color, m.n)) b.win = b.amount * R_MULT[b.color]; else b.lost = true; });
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
    if (myBets[c]) { toast('Ставку отменить нельзя'); return; }
    if (G.phase !== 'wait') return toast('Ставки закрыты');
    if (pending[c]) return;
    if (Object.keys({ ...myBets, ...pending }).some(k => (myBets[k] || pending[k]) && rGroup(k) !== rGroup(c))) { notify('error'); return toast('Нельзя ставить и цвет, и чёт/нечет'); }
    const v = Math.floor(Number(amt.value));
    if (!(v >= R_MIN)) { notify('error'); return toast(`Минимальная ставка ${R_MIN} ⭐`); }
    if (!spend(v)) return;
    pending[c] = v; net.send({ t: 'bet', amount: v, color: c }); haptic('medium'); renderBets();
  });
  el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { amt.value = Math.max(R_MIN, Math.floor((Number(amt.value) || R_MIN) * b.dataset.q)); });
  el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { amt.value = b.dataset.v === 'max' ? Math.max(0, Math.floor(state.balance)) : b.dataset.v; haptic(); });

  cleanup = () => {
    alive = false; cancelAnimationFrame(raf);
    if (!net) return;
    if (G.phase === 'wait') Object.keys({ ...myBets, ...pending }).forEach(c => { const a = (myBets[c] || 0) + (pending[c] || 0); if (a) { state.balance += a; net.send({ t: 'cancel', color: c }); } });
    else if (net.local && G.res) Object.keys(myBets).forEach(c => { if (rWin(c, G.res.n)) state.balance += myBets[c] * R_MULT[c]; });
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

/* ---------- plinko ---------- */
const PL_ROWS = 10, PL_MULT = [11, 5.5, 2.5, 1, 0.4, 0.2, 0.4, 1, 2.5, 5.5, 11];
const plCol = m => m >= 5 ? '#ff4d5e' : m >= 2 ? '#ff9a3d' : m >= 1 ? '#3ee48f' : '#ffd23f';
function plinkoScreen(el) {
  bar(el, 'PLINKO');
  el.insertAdjacentHTML('beforeend', `<div class="pl-box"><canvas id="pcv"></canvas></div>
    <div class="betrow"><input id="bet" type="number" inputmode="numeric" value="50" min="20"><button data-m="0.5">½</button><button data-m="2">×2</button><button data-max>MAX</button></div>
    <button class="btn" id="drop">Бросить шар</button>
    <div class="odds">Шар отскакивает от шипов и падает в одну из ячеек · мин. ставка 20 ⭐ · можно бросать несколько шаров подряд</div>`);
  const cv = $('#pcv'), ctx = cv.getContext('2d'), betIn = $('#bet');
  const dpr = Math.min(window.devicePixelRatio || 1, (document.documentElement.classList.contains('lite') || document.documentElement.classList.contains('ios')) ? 1.5 : 2);
  const W = Math.max(10, Math.round(cv.offsetWidth * dpr)), H = Math.max(10, Math.round(cv.offsetHeight * dpr));
  cv.width = W; cv.height = H;
  let alive = true, raf = 0, lastHap = 0, dirty = true;
  el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { betIn.value = Math.max(20, Math.floor((Number(betIn.value) || 20) * b.dataset.m)); });
  el.querySelectorAll('[data-max]').forEach(b => b.onclick = () => { betIn.value = Math.max(0, Math.floor(state.balance)); haptic(); });

  /* геометрия */
  const COLS = PL_ROWS + 2, dx = W / (COLS + 1), PR = dx * .13, BR = dx * .2;
  const y0 = H * .2, y1 = H * .76, dy = (y1 - y0) / (PL_ROWS - 1), slotTop = H * .87, slotH = H * .1;
  const pegX = (i, j) => W / 2 + (j - (i + 2) / 2) * dx, pegY = i => y0 + i * dy;
  const pegs = []; for (let i = 0; i < PL_ROWS; i++) { pegs[i] = []; for (let j = 0; j < i + 3; j++) pegs[i][j] = { x: pegX(i, j), y: pegY(i), hit: 0 }; }
  const slotX = k => W / 2 + (k - 5) * dx;

  /* статичный слой: шипы + труба */
  const layer = document.createElement('canvas'); layer.width = W; layer.height = H; const lx = layer.getContext('2d');
  const peg = document.createElement('canvas'); const ps = Math.ceil(PR * 7); peg.width = peg.height = ps; { const g = peg.getContext('2d'), c = ps / 2;
    const gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, '#5cc8ff1c'); gr.addColorStop(1, '#5cc8ff00'); g.fillStyle = gr; g.fillRect(0, 0, ps, ps);
    const pg = g.createRadialGradient(c - PR * .3, c - PR * .35, PR * .1, c, c, PR); pg.addColorStop(0, '#d8f4ff'); pg.addColorStop(.45, '#46b9ff'); pg.addColorStop(1, '#1f6dff');
    g.fillStyle = pg; g.beginPath(); g.arc(c, c, PR, 0, 7); g.fill(); }
  pegs.forEach(r => r.forEach(p => lx.drawImage(peg, p.x - ps / 2, p.y - ps / 2)));
  { const tw = W * .17, tx = W / 2 - tw / 2, th = H * .09, g = lx.createLinearGradient(tx, 0, tx + tw, 0);
    g.addColorStop(0, '#1d4ed8'); g.addColorStop(.35, '#5aa2ff'); g.addColorStop(1, '#1b3fb5');
    lx.fillStyle = g; lx.fillRect(tx, -4, tw, th + 4);
    const cw = tw * 1.45, cx = W / 2 - cw / 2; lx.fillStyle = '#2a5fe0'; lx.beginPath();
    if (lx.roundRect) lx.roundRect(cx, th - 2, cw, H * .028, H * .014); else lx.rect(cx, th - 2, cw, H * .028); lx.fill();
    lx.fillStyle = '#0d2a80'; lx.fillRect(cx + cw * .08, th + H * .008, cw * .84, H * .008); }

  /* шарики и эффекты */
  const balls = [], rings = [], sparks = [], floats = [], flash = Array(PL_MULT.length).fill(0);
  const T_IN = 260, T_OUT = 380;
  function launch(bet) {
    const d = Array.from({ length: PL_ROWS }, () => Math.random() < .5 ? -1 : 1);
    const s = d.reduce((x, y) => x + y, 0), k = s / 2 + 5, mult = PL_MULT[k], win = Math.floor(bet * mult);
    const durs = d.map(() => 450 * (.93 + Math.random() * .14)); const t = [T_IN]; durs.forEach(x => t.push(t[t.length - 1] + x));
    balls.push({ t0: performance.now(), d, k, mult, win, bet, durs, t, seg: -1, done: false, paid: false, trail: [] });
  }
  const payBall = b => { if (b.paid) return; b.paid = true; state.balance += b.win; save(); };
  const ballPos = (b, el_) => {
    const hop = dy * .42, cy = i => pegY(i) - PR - BR * .9;
    let xi = 0; const X = i => { let x = 0; for (let n = 0; n < i; n++) x += b.d[n] * .5; return W / 2 + x * dx; };
    if (el_ < T_IN) { const u = el_ / T_IN; return [W / 2, H * .115 + (cy(0) - H * .115) * u * u, 0]; }
    const i = b.t.findIndex((v, n) => n > 0 && el_ < v) - 1;                    // сегмент между шипами
    if (i < 0 || i >= PL_ROWS) {
      const u = Math.min(1, (el_ - b.t[PL_ROWS]) / T_OUT);                     // падение в ячейку
      return [X(PL_ROWS), (slotTop - BR) + (slotH * .45 + BR) * u * u, 1];
    }
    const u = (el_ - b.t[i]) / b.durs[i], xa = X(i), xb = X(i + 1);
    const ya = cy(i), yb = i + 1 < PL_ROWS ? cy(i + 1) : slotTop - BR;
    return [xa + (xb - xa) * (u < .5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)), ya + (yb - ya) * u * u - hop * 4 * u * (1 - u), 0];
  };
  const bsp = document.createElement('canvas'); const bs = Math.ceil(BR * 5); bsp.width = bsp.height = bs; { const g = bsp.getContext('2d'), c = bs / 2;
    const gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, '#ffffff66'); gr.addColorStop(.45, '#9fd8ff18'); gr.addColorStop(1, '#9fd8ff00'); g.fillStyle = gr; g.fillRect(0, 0, bs, bs);
    const bg = g.createRadialGradient(c - BR * .3, c - BR * .3, BR * .1, c, c, BR); bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#cfe6ff'); g.fillStyle = bg; g.beginPath(); g.arc(c, c, BR, 0, 7); g.fill(); }

  const slotColors = PL_MULT.map(plCol);
  const fmtM = m => String(m);
  function drawSlots(now) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `800 ${Math.round(dx * .32)}px Rubik, Arial, sans-serif`;
    for (let k = 0; k < PL_MULT.length; k++) {
      const x = slotX(k) - dx / 2 + dx * .05, w = dx * .9, f = Math.max(0, 1 - (now - flash[k]) / 700), lift = f * H * .012;
      ctx.globalAlpha = .28 + f * .6; ctx.fillStyle = slotColors[k]; ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, slotTop - lift, w, slotH, dx * .16); else ctx.rect(x, slotTop - lift, w, slotH); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = f > 0 ? '#fff' : slotColors[k]; ctx.fillText(fmtM(PL_MULT[k]), x + w / 2, slotTop - lift + slotH / 2 + 1);
    }
  }
  function finish(b, now) {
    b.done = true; flash[b.k] = now; payBall(b); bump(); haptic('medium');
    floats.push({ x: slotX(b.k), y: slotTop - H * .02, t: now, txt: b.win >= b.bet ? `+${fmt(b.win - b.bet)}` : `−${fmt(b.bet - b.win)}`, c: b.win >= b.bet ? '#3ee48f' : '#ff8a96' });
    if (b.win >= b.bet * 2) notify('success');
    for (let n = 0; n < 8; n++) sparks.push({ x: slotX(b.k), y: slotTop, vx: rnd(-1, 1) * dx * .04, vy: -rnd(.4, 1.2) * dx * .08, t: now, c: slotColors[b.k] });
  }
  function frame(now) {
    if (!alive) return;
    const act = balls.length || rings.length || sparks.length || floats.length || flash.some(f => now - f < 700);
    if (act || dirty) {
      dirty = false;
      ctx.clearRect(0, 0, W, H); ctx.drawImage(layer, 0, 0);
      // отклик шипов
      for (let i = 0; i < PL_ROWS; i++) for (const p of pegs[i]) { const f = 1 - (now - p.hit) / 420; if (f > 0) {
        ctx.globalAlpha = f; const sc = 1 + f * .45; ctx.globalAlpha = f * .6; ctx.drawImage(peg, p.x - ps * sc / 2, p.y - ps * sc / 2, ps * sc, ps * sc);
        ctx.globalAlpha = f * .85; ctx.fillStyle = '#e6f6ff'; ctx.beginPath(); ctx.arc(p.x, p.y, PR * (1 + f * .2), 0, 7); ctx.fill(); ctx.globalAlpha = 1; } }
      for (let n = rings.length - 1; n >= 0; n--) { const r = rings[n], f = (now - r.t) / 520; if (f >= 1) { rings.splice(n, 1); continue; }
        ctx.strokeStyle = `rgba(140,215,255,${1 - f})`; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.arc(r.x, r.y, PR * (1.2 + f * 3.2), 0, 7); ctx.stroke(); }
      drawSlots(now);
      for (let n = balls.length - 1; n >= 0; n--) {
        const b = balls[n], el_ = now - b.t0;
        // момент касания шипа: сегмент i начинается ударом о шип ряда i
        let cur = -1; for (let i = 0; i < PL_ROWS; i++) if (el_ >= b.t[i] - 0) cur = i;
        if (cur > b.seg) { for (let i = b.seg + 1; i <= cur; i++) { let xo = 0; for (let q = 0; q < i; q++) xo += b.d[q] * .5; const j = Math.round(xo + (i + 2) / 2), p = pegs[i][j];
            if (p) { p.hit = now; rings.push({ x: p.x, y: p.y, t: now }); for (let q = 0; q < 3; q++) sparks.push({ x: p.x, y: p.y - PR, vx: rnd(-1, 1) * dx * .03, vy: -rnd(.3, 1) * dx * .05, t: now, c: '#bfe8ff' }); }
            if (now - lastHap > 70) { lastHap = now; haptic('light'); } } b.seg = cur; }
        const [x, y, fin] = ballPos(b, el_);
        b.trail.push([x, y]); if (b.trail.length > 7) b.trail.shift();
        b.trail.forEach(([tx, ty], q) => { ctx.globalAlpha = (q / b.trail.length) * .22; ctx.drawImage(bsp, tx - bs / 2, ty - bs / 2, bs, bs); });
        ctx.globalAlpha = 1;
        ctx.drawImage(bsp, x - bs / 2, y - bs / 2, bs, bs);
        if (!b.done && el_ >= b.t[PL_ROWS] + T_OUT) { finish(b, now); }
        if (b.done) balls.splice(n, 1);
      }
      for (let n = sparks.length - 1; n >= 0; n--) { const s = sparks[n], f = (now - s.t) / 600; if (f >= 1) { sparks.splice(n, 1); continue; }
        s.x += s.vx; s.y += s.vy; s.vy += dx * .004; ctx.globalAlpha = 1 - f; ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(s.x, s.y, 2 * dpr, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.textAlign = 'center'; ctx.font = `900 ${Math.round(dx * .34)}px Rubik, Arial, sans-serif`;
      for (let n = floats.length - 1; n >= 0; n--) { const f0 = floats[n], f = (now - f0.t) / 1100; if (f >= 1) { floats.splice(n, 1); continue; }
        ctx.globalAlpha = 1 - f; ctx.fillStyle = f0.c; ctx.fillText(f0.txt, f0.x, f0.y - f * H * .09); ctx.globalAlpha = 1; }
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  try { document.fonts && document.fonts.load('800 20px Rubik').then(() => { dirty = true; }); } catch (e) {}

  $('#drop').onclick = () => {
    if (balls.length >= 8) return toast('Слишком много шаров в игре');
    const v = Math.floor(Number(betIn.value));
    if (!(v >= 20)) { notify('error'); return toast('Минимальная ставка 20 ⭐'); }
    if (!spend(v)) return;
    launch(v); haptic('medium');
  };
  cleanup = () => { alive = false; cancelAnimationFrame(raf); balls.forEach(b => payBall(b)); };
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
    <div class="betrow"><input id="bet" type="number" inputmode="numeric" value="50" min="20"><button data-max>MAX</button></div>
    <button class="btn" id="go">Сделать ставку</button>`);
  const mg = $('#mg'), mx = $('#mx'), goB = $('#go'), betIn = $('#bet');
  el.querySelectorAll('[data-max]').forEach(b => b.onclick = () => { if (!betIn.disabled) { betIn.value = Math.max(0, Math.floor(state.balance)); haptic(); } });
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
    bet = Math.floor(Number(betIn.value)); if (!(bet >= 20)) { notify('error'); return toast('Минимальная ставка 20 ⭐'); } if (!spend(bet)) return;
    grid = Array(size * size).fill(0); let k = 0;
    while (k < mcount) { const r = Math.floor(Math.random() * grid.length); if (!grid[r]) { grid[r] = 1; k++; } }
    opened = 0; live = true; betIn.disabled = true; mx.textContent = '1.00x'; draw(); goB.className = 'btn green'; goB.textContent = 'Забрать';
  };
  cleanup = () => { live = false; alive = false; };
  draw(); ui();
}

/* ---------- лидерборд (онлайн, по балансу) ---------- */
function tourScreen(el) {
  el.insertAdjacentHTML('beforeend', `<div class="tour"><h2>Лидерборд</h2><p class="sub" style="margin-top:6px">Топ-10 игроков по балансу</p><div id="lbBody"><div class="empty lb-ld">Загрузка…</div></div></div>`);
  const body = $('#lbBody'); let dead = false; cleanup = () => { dead = true; };
  const myId = TGU ? String(TGU.id) : '';
  const avHtml = (p, nm) => `<span class="lb-i">${esc((String(nm || '?').replace('@', '')[0] || '?').toUpperCase())}</span>${p ? `<img src="${esc(p)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}`;
  const balHtml = v => `<i class="rc"></i>${fmt(v)}`;
  const render = (top, me) => {
    const pod = i => {
      const u = top[i], cls = ['p1', 'p2', 'p3'][i], st = ['s1', 's2', 's3'][i];
      return `<div class="pl ${cls}">${i === 0 ? '<div class="crown"><svg viewBox="0 0 24 24" width="30" height="30"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="#ffd23f" stroke="#b57a0c" stroke-width="1.2" stroke-linejoin="round"/></svg></div>' : ''}
        <div class="av lbav">${u ? avHtml(u.photo, u.name) : '<span class="lb-i">?</span>'}</div>
        <div class="nk">${u ? esc(u.name) : 'NOBODY'}</div>${u ? `<div class="pbal">${balHtml(u.bal)}</div>` : ''}<div class="step ${st}">${i + 1}</div></div>`;
    };
    const rows = [];
    for (let i = 3; i < 10; i++) {
      const u = top[i];
      rows.push(u ? `<div class="rk${u.id === myId ? ' me' : ''}" style="animation-delay:${.3 + (i - 3) * .05}s"><span class="n">#${i + 1}</span><span class="a lbav">${avHtml(u.photo, u.name)}</span><span class="t">${esc(u.name)}</span><span class="b">${balHtml(u.bal)}</span></div>`
        : `<div class="rk" style="animation-delay:${.3 + (i - 3) * .05}s"><span class="n">#${i + 1}</span><span class="a q">?</span><span class="t">NOBODY</span></div>`);
    }
    const inTop = top.some(u => u.id === myId);
    const mine = !inTop && me && TGU ? `<div class="rk me"><span class="n">${me.rank ? '#' + me.rank : '—'}</span><span class="a lbav">${avHtml(TGU.photo_url, me.name)}</span><span class="t">${esc(me.name)} (вы)</span><span class="b">${balHtml(Math.floor(state.balance))}</span></div>` : '';
    body.innerHTML = `<div class="podium">${pod(1)}${pod(0)}${pod(2)}</div><div class="ranks">${rows.join('')}${mine ? '<div class="rk-sep"></div>' + mine : ''}</div>`;
  };
  render([], null);
  if (!TGU || !(tg && tg.initData)) { body.insertAdjacentHTML('beforeend', '<div class="empty" style="margin-top:14px">Откройте игру через бота, чтобы увидеть онлайн-топ</div>'); return; }
  (async () => {
    try {
      await syncAccount();
      const d = await api('/api/top', {});
      if (dead) return;
      if (d && d.ok) render(d.top || [], d.me); else body.insertAdjacentHTML('beforeend', `<div class="empty" style="margin-top:14px">${esc(apiErr(d))}</div>`);
    } catch (e) { if (!dead) body.insertAdjacentHTML('beforeend', `<div class="empty" style="margin-top:14px">${esc(apiErr(null, e))}</div>`); }
  })();
}

/* ---------- tasks ---------- */
const TASK_GOAL = 1000, TASK_REW = 100;
const TASK_LINK = 'https://t.me/xdsold';
const SUBS = [
  { id: 't6', title: 'Подписаться на Gift Rush News', link: 'https://t.me/Gifts_Rush_News', rew: 5 },
  { id: 't7', title: 'Забустить Gift Rush News', link: 'https://t.me/boost/Gifts_Rush_News', rew: 5 },
  { id: 't4', title: 'Подпишись на омутх', link: 'https://t.me/omutxwin', rew: 5 },
  { id: 't5', title: 'Подпишись на w1npros', link: 'https://t.me/w1npros', rew: 5 },
];
const subTask = s => `<div class="task wide" id="${s.id}"><div class="ti"><h3>${s.title}</h3><span class="rew">+⭐ ${fmt(s.rew)}</span></div><div class="ta two"><button class="pbtn ghost" id="${s.id}a">Выполнить</button><button class="pbtn" id="${s.id}b"></button></div></div>`;
let tasks = store.get('gr3_tasks', {}); if (!tasks || typeof tasks !== 'object') tasks = {};
const saveTasks = () => store.set('gr3_tasks', tasks);
function grant(n) { state.balance += n; save(); bump(); notify('success'); toast(`+${fmt(n)} ⭐ на баланс`); }
function openTG(url) { try { if (tg && tg.openTelegramLink) return tg.openTelegramLink(url); } catch (e) {} window.open(url, '_blank'); }

function tasksScreen(el) {
  el.insertAdjacentHTML('beforeend', `<div class="tour"><h2>✅ Задания</h2><p class="sub" style="margin-top:6px">Выполняй и получай Rushcoin</p></div>
    ${subTask(SUBS[0])}${subTask(SUBS[1])}
    <div class="task" id="t1"><div class="ti"><h3>Зайти в Gift Rush</h3><span class="rew">+⭐ 1</span></div><div class="ta"><button class="pbtn" id="t1b"></button></div></div>
    <div class="task wide" id="t2"><div class="ti"><h3>Написать комплимент владельцу</h3><span class="rew">+⭐ 5</span></div><div class="ta two"><button class="pbtn ghost" id="t2a">Выполнить</button><button class="pbtn" id="t2b"></button></div></div>
    ${subTask(SUBS[2])}${subTask(SUBS[3])}
    <div class="task" id="t3"><div class="ti"><h3>Апнуть 1 000 ⭐</h3><span class="rew">+⭐ 100</span>
      <div class="prog"><i id="t3p"></i></div><div class="pt" id="t3t"></div></div><div class="ta"><button class="pbtn" id="t3b">Забрать</button></div></div>`);
  const b1 = $('#t1b'), b2a = $('#t2a'), b2b = $('#t2b'), b3 = $('#t3b');
  const paint = () => {
    // 1
    b1.textContent = tasks.t1 ? 'Выполнено ✓' : 'Проверить'; b1.disabled = !!tasks.t1; b1.classList.toggle('done', !!tasks.t1);
    // 2
    b2a.disabled = tasks.t2 === 'claimed';
    b2b.textContent = tasks.t2 === 'claimed' ? 'Получено ✓' : tasks.t2 === 'done' ? 'Забрать' : 'Проверить';
    b2b.disabled = tasks.t2 === 'claimed'; b2b.classList.toggle('done', tasks.t2 === 'claimed');
    // 4, 5
    SUBS.forEach(s => { const d = tasks[s.id] === 'claimed', bb = $('#' + s.id + 'b'); bb.textContent = d ? 'Получено ✓' : 'Проверить'; bb.disabled = d; bb.classList.toggle('done', d); $('#' + s.id + 'a').disabled = d; });
    // 3
    const bal = Math.floor(state.balance), pct = Math.min(100, bal / TASK_GOAL * 100);
    $('#t3p').style.width = pct + '%'; $('#t3t').textContent = `Баланс: ⭐ ${fmt(bal)} / ${fmt(TASK_GOAL)}`;
    b3.textContent = tasks.t3 ? 'Получено ✓' : 'Забрать'; b3.disabled = !!tasks.t3 || bal < TASK_GOAL; b3.classList.toggle('done', !!tasks.t3);
  };
  b1.onclick = () => { if (tasks.t1) return; tasks.t1 = 'claimed'; saveTasks(); grant(1); paint(); };
  b2a.onclick = () => { openTG(TASK_LINK); if (!tasks.t2) { tasks.t2 = 'done'; saveTasks(); toast('Задание выполнено — нажмите «Забрать»'); paint(); } };
  b2b.onclick = () => {
    if (!tasks.t2) return toast('Сначала нажмите «Выполнить»');
    if (tasks.t2 === 'claimed') return; tasks.t2 = 'claimed'; saveTasks(); grant(5); paint();
  };
  b3.onclick = () => { if (tasks.t3 || state.balance < TASK_GOAL) return; tasks.t3 = 'claimed'; saveTasks(); grant(TASK_REW); paint(); };
  SUBS.forEach(s => {
    $('#' + s.id + 'a').onclick = () => { openTG(s.link); if (!tasks[s.id]) { tasks[s.id] = 'done'; saveTasks(); toast('Задание выполнено — нажмите «Проверить»'); } };
    $('#' + s.id + 'b').onclick = () => {
      if (tasks[s.id] === 'claimed') return;
      if (!tasks[s.id]) return toast('Сначала нажмите «Выполнить»');
      tasks[s.id] = 'claimed'; saveTasks(); grant(s.rew); paint();
    };
  });
  balanceHook = paint; taskPaint = paint; cleanup = () => { balanceHook = null; taskPaint = null; };
  paint(); syncAccount();
}

/* ---------- аккаунт: связь с Worker (переводы от админа) ---------- */
const API = 'https://giftrush-bot.thekerv666.workers.dev';
const ADMIN_ID = 5093384439;
const TGU = tg && tg.initDataUnsafe && tg.initDataUnsafe.user || null;
async function api(path, body) {
  // text/plain — «простой» запрос без предварительного CORS-запроса (работает надёжнее в Telegram)
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
    keepalive: true, body: JSON.stringify(Object.assign({ initData: (tg && tg.initData) || '' }, body || {})) });
  let d; try { d = await r.json(); } catch (e) { throw new Error('http ' + r.status); }
  return d;
}
const apiErr = (d, e) => e ? 'Сервер недоступен. Вставь новый worker.js в Cloudflare и нажми Deploy' :
  d && d.err === 'nokv' ? 'К воркеру не привязан KV (имя DB)' : d && d.err === 'auth' ? 'Открой игру через бота в Telegram' : d && d.err === 'forbidden' ? 'Нет прав' : 'Ошибка, попробуйте ещё раз';
let syncing = false, lastPushed = -1, taskPaint = null;
async function syncAccount() {
  if (syncing || !TGU || !(tg && tg.initData)) return;
  syncing = true;
  try {
    let bal = Math.floor(state.balance);
    const d = await api('/api/sync', { bal, tasks });
    if (d && d.ok) {
      let ch = false;
      if (d.tasks && typeof d.tasks === 'object') {   // задания выполняются раз и навсегда: берём лучшее из устройства и сервера
        const rk = { claimed: 2, done: 1 }; let tch = false;
        Object.keys(d.tasks).forEach(k => { if ((rk[d.tasks[k]] || 0) > (rk[tasks[k]] || 0)) { tasks[k] = d.tasks[k]; tch = true; } });
        if (tch) { saveTasks(); if (taskPaint) taskPaint(); }
      }
      if (d.credit > 0) { state.balance += d.credit; ch = true; toast(`🎁 Вам пришло ${fmt(d.credit)} ⭐`); }
      if (d.debit > 0) { const t = Math.min(d.debit, Math.floor(state.balance)); state.balance -= t; ch = true; if (t) toast(`С баланса списано ${fmt(t)} ⭐`); }
      if (ch) { save(); bump(); notify('success'); bal = Math.floor(state.balance); api('/api/sync', { bal }).catch(() => {}); }
      lastPushed = bal;
    }
  } catch (e) {} finally { syncing = false; }
}
function autoIncome() {}   // автоначислений больше нет
document.addEventListener('visibilitychange', () => { if (!document.hidden) { autoIncome(); syncAccount(); } else if (Math.floor(state.balance) !== lastPushed) syncAccount(); });
setInterval(() => { if (!document.hidden) syncAccount(); }, 20000);   // раз в 20 с: баланс уходит на сервер, переводы/списания приходят

/* ---------- profile ---------- */
function adminBox(el) {
  el.insertAdjacentHTML('beforeend', `<div class="adm"><h4>Игроки: перевод и списание Rushcoin</h4><div class="row">
    <input id="xfq" placeholder="ID или @username" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="ok" id="xfok">ОК</button></div></div>`);
  const ok = $('#xfok');
  const run = async () => {
    const q = $('#xfq').value.trim(); if (!q) return toast('Введите ID или юзернейм');
    ok.disabled = true;
    try {
      const d = await api('/api/lookup', { q });
      if (!d || !d.ok) return toast(d && d.err === 'nf' ? 'Игрок не найден — пусть откроет игру хотя бы раз' : apiErr(d));
      const amounts = [10, 100, 500, 1000, 5000, 10000];
      const at = d.at ? new Date(d.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
      const m = modal(`<div class="lk"><div class="lk-av" id="lkav"><span>${esc((String(d.name).replace('@', '')[0] || '?').toUpperCase())}</span></div>
        <div class="lk-nm">${esc(d.name)}</div><div class="lk-id">ID ${esc(d.id)}</div>
        <div class="lk-bal"><i class="rc"></i> ${fmt(d.bal || 0)}</div>
        <div class="lk-sub">Баланс на ${at}${d.pending ? ` · в очереди: ${d.pending > 0 ? '+' : ''}${fmt(d.pending)}` : ''}</div></div>
        <div class="xf-amt">${amounts.map(x => `<button data-a="${x}">${fmt(x)}</button>`).join('')}</div>
        <input class="xf-in" id="xfa" type="number" inputmode="numeric" min="1" placeholder="Сумма">
        <div class="g-act"><button class="btn red" id="xftake">Списать</button><button class="btn green" id="xfgo">Начислить</button></div>`);
      if (d.photo) { const im = new Image(); im.alt = ''; im.onload = () => { const a = $('#lkav', m.el); if (a) { a.innerHTML = ''; a.append(im); } }; im.src = d.photo; }
      m.el.querySelectorAll('.xf-amt button').forEach(b => b.onclick = () => {
        m.el.querySelectorAll('.xf-amt button').forEach(x => x.classList.toggle('on', x === b)); $('#xfa', m.el).value = b.dataset.a;
      });
      const act = (path, label, btn) => async () => {
        const amt = Math.floor(Number($('#xfa', m.el).value));
        if (!(amt >= 1)) return toast('Введите сумму');
        btn.disabled = true;
        try {
          const r = await api(path, { to: d.id, amount: amt });
          if (r && r.ok) { m.close(); toast(`✅ ${label} ${fmt(amt)} ⭐: ${d.name}`); notify('success'); $('#xfq').value = ''; }
          else { toast(apiErr(r)); btn.disabled = false; }
        } catch (e) { toast(apiErr(null, e)); btn.disabled = false; }
      };
      const g = $('#xfgo', m.el), t = $('#xftake', m.el);
      g.onclick = act('/api/give', 'Начислено', g); t.onclick = act('/api/take', 'Списано', t);
    } catch (e) { toast(apiErr(null, e)); } finally { ok.disabled = false; }
  };
  ok.onclick = run; $('#xfq').addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
}
/* ---------- настройки: цвет приложения и вибрация ---------- */
const THEMES = [
  { n: 'Синий', a: '#5d90e6', b: '#3a6fd8' },
  { n: 'Фиолетовый', a: '#a37bff', b: '#6d3fe0', t1: '#2f2652', t2: '#211a3c', bg: '#140f26', gl: '#8b5cf6' },
  { n: 'Зелёный', a: '#3ee48f', b: '#13a85b', t1: '#1f3d33', t2: '#16291f', bg: '#0b1a14', gl: '#22c55e' },
  { n: 'Красный', a: '#ff6b7e', b: '#d11f3f', t1: '#43262c', t2: '#2d1a1e', bg: '#1b0e11', gl: '#ef4458' },
  { n: 'Оранжевый', a: '#ffb23f', b: '#f07a12', t1: '#423423', t2: '#2d2418', bg: '#1b140b', gl: '#f59e0b' },
  { n: 'Розовый', a: '#ff7ac8', b: '#d6339c', t1: '#412a3a', t2: '#2c1c27', bg: '#1b0f17', gl: '#ec4899' },
];
function applyTheme(i) {
  const r = document.documentElement, t = THEMES[i] || THEMES[0];
  ['--ta', '--tb', '--t1', '--t2', '--tbg', '--tgl'].forEach(k => r.style.removeProperty(k));
  if (!i || !THEMES[i]) { r.removeAttribute('data-theme'); } else {
    r.setAttribute('data-theme', i); r.style.setProperty('--ta', t.a); r.style.setProperty('--tb', t.b); r.style.setProperty('--t1', t.t1); r.style.setProperty('--t2', t.t2); r.style.setProperty('--tbg', t.bg); r.style.setProperty('--tgl', t.gl);
  }
  try { tg && tg.setHeaderColor && tg.setHeaderColor(i ? t.bg : '#040922'); tg && tg.setBackgroundColor && tg.setBackgroundColor(i ? t.bg : '#0d1015'); } catch (e) {}
}
let themeIdx = Number(store.get('gr4_theme', 0)) || 0; if (!THEMES[themeIdx]) themeIdx = 0; applyTheme(themeIdx);
function openSettings() {
  const m = modal(`<div class="st"><h3>Настройки</h3>
    <h4>Цвет приложения</h4><div class="sw-row" id="thRow">${THEMES.map((t, i) => `<button class="th${i === themeIdx ? ' on' : ''}" data-i="${i}" aria-label="${t.n}" style="background:linear-gradient(135deg,${t.a},${t.b})"></button>`).join('')}</div>
    <div class="st-row"><span>Вибрация</span><button class="sw${VIB ? ' on' : ''}" id="vibSw" aria-label="Вибрация"><i></i></button></div></div>`);
  m.el.querySelectorAll('.th').forEach(b => b.onclick = () => {
    themeIdx = Number(b.dataset.i); store.set('gr4_theme', themeIdx); applyTheme(themeIdx);
    m.el.querySelectorAll('.th').forEach(x => x.classList.toggle('on', x === b)); haptic();
  });
  $('#vibSw', m.el).onclick = e => {
    VIB = !VIB; try { localStorage.setItem('gr4_vib', VIB ? '1' : '0'); } catch (x) {}
    e.currentTarget.classList.toggle('on', VIB); if (VIB) haptic('medium');
  };
}
function profileScreen(el) {
  const name = TGU ? (TGU.username ? '@' + TGU.username : [TGU.first_name, TGU.last_name].filter(Boolean).join(' ')) : 'Игрок';
  const ini = (name.replace('@', '')[0] || '?').toUpperCase();
  const list = state.inv.map(g => ({ g, it: ITEM(g.n) })).sort((a, b) => b.it.p - a.it.p);
  const total = list.reduce((s, o) => s + o.it.p, 0);
  el.insertAdjacentHTML('beforeend', `<div class="pf"><button class="gear" id="gear" aria-label="Настройки"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button><div class="pf-av" id="pfav"></div><div class="pf-nm">${esc(name)}</div>${TGU ? `<div class="pf-id">ID ${esc(TGU.id)}</div>` : ''}</div>
    <div id="admslot"></div><div class="invhd"><h3>Инвентарь</h3><span>${list.length} шт · ⭐ ${fmt(total)}</span></div><div class="inv" id="inv"></div>`);
  if (TGU && TGU.id === ADMIN_ID) adminBox($('#admslot'));
  $('#gear').onclick = () => { haptic(); openSettings(); };
  const av = $('#pfav');
  const fallback = () => { av.innerHTML = `<span>${esc(ini)}</span>`; };
  if (TGU && TGU.photo_url) {
    const img = new Image(); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.onerror = fallback; img.src = TGU.photo_url; av.append(img);
  } else fallback();
  const inv = $('#inv');
  if (!list.length) { inv.innerHTML = '<div class="empty"><b>🎁</b>Инвентарь пуст.<br>Откройте кейс, чтобы получить подарок.</div>'; return; }
  list.forEach((o, i) => {
    const b = document.createElement('button'); b.className = 'tile'; b.style.setProperty('--c', o.it.c); b.style.animationDelay = Math.min(i, 12) * 30 + 'ms';
    b.innerHTML = `<b>${ico(o.it)}</b><small>⭐ ${fmt(o.it.p)}</small>`; b.onclick = () => openGift(o.g); inv.append(b);
  });
}
function wdDate() {   // ровно через месяц от сегодняшней даты
  const n = new Date(), y = n.getFullYear(), m = n.getMonth() + 1, last = new Date(y, m + 1, 0).getDate(), d = new Date(y, m, Math.min(n.getDate(), last));
  const p = x => String(x).padStart(2, '0'); return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function openGift(g) {
  const it = ITEM(g.n); if (!it) return;
  const m = modal(`<div class="g-em" style="--c:${it.c}"><span>${ico(it)}</span></div><div class="g-n">${it.n}</div><div class="g-p">⭐ ${fmt(it.p)}</div>
    <div class="g-act"><button class="btn red" id="wd">Вывести</button><button class="btn green" id="sl">Продать</button></div>
    <div class="wd-msg" id="wdm">ВЫВОД НЕДОСТУПЕН ДО ${wdDate()}</div>`);
  const msg = $('#wdm', m.el);
  $('#wd', m.el).onclick = () => { msg.textContent = 'ВЫВОД НЕДОСТУПЕН ДО ' + wdDate(); msg.classList.remove('go'); void msg.offsetWidth; msg.classList.add('go'); notify('error'); };
  $('#sl', m.el).onclick = () => {
    if (!invGift(g.id)) return m.close();
    const v = sellGift(g.id); m.close(); toast(`+${fmt(v)} ⭐ на баланс`); notify('success');
    if ($('#inv')) go('profile');
  };
}

/* ---------- contests ---------- */
function contestsScreen(el) {
  el.innerHTML = '<div class="tour"><h2>🏆 Конкурсы</h2></div><div class="soon"><b>🎁</b>Сейчас нет активных конкурсов, попробуйте позже</div>';
}

/* ---------- tabs ---------- */
const SCREENS = { games: home, cases: casesList, case: caseScreen, upgrade: upgradeScreen, pick: pickScreen, crash: crashScreen, plinko: plinkoScreen, roulette: rouletteScreen, mines: minesScreen, tour: tourScreen, tasks: tasksScreen, contests: contestsScreen, profile: profileScreen, soon };
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#nav button').forEach(x => x.classList.remove('on')); b.classList.add('on');
  const t = b.dataset.tab; go(['games', 'tour', 'tasks', 'profile', 'contests'].includes(t) ? t : 'soon');
});
save(); go('games'); autoIncome(); syncAccount();
