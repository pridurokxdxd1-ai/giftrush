/* GiftRush mini app — демо-версия: баланс и результаты считаются локально (виртуальные звёзды) */
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); try { tg.setHeaderColor('#17181c'); tg.setBackgroundColor('#17181c'); } catch (e) {} }

const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
const haptic = (t = 'light') => { try { tg?.HapticFeedback.impactOccurred(t); } catch (e) {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => Math.random() * (b - a) + a;

/* ---------- state ---------- */
const state = { balance: Number(localStorage.gr_bal ?? 1000), gifts: JSON.parse(localStorage.gr_gifts || '[]') };
const save = () => { localStorage.gr_bal = state.balance; localStorage.gr_gifts = JSON.stringify(state.gifts); $('#bal').textContent = Math.floor(state.balance); };
const toast = t => { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 1800); };
$('#topup').onclick = () => { state.balance += 500; save(); toast('+500 ⭐ (демо-пополнение)'); haptic('medium'); };

/* ---------- items ---------- */
const RAR = { common: '#8b8f9c', rare: '#3b82f6', epic: '#a855f7', legend: '#ffc83d' };
const ITEMS = [
  { e: '🧸', n: 'Bear', p: 15, r: 'common' }, { e: '🌹', n: 'Rose', p: 25, r: 'common' },
  { e: '🎂', n: 'Cake', p: 50, r: 'common' }, { e: '💐', n: 'Bouquet', p: 80, r: 'rare' },
  { e: '🚀', n: 'Rocket', p: 120, r: 'rare' }, { e: '🏆', n: 'Cup', p: 200, r: 'rare' },
  { e: '💍', n: 'Ring', p: 400, r: 'epic' }, { e: '💎', n: 'Diamond', p: 700, r: 'epic' },
  { e: '👑', n: 'Crown', p: 1500, r: 'legend' },
];
const TICK = ['🧸', '🎁', '🪄', '💎', '🧊', '🌙', '🍪', '🌈', '🧁', '🎃', '👑', '🚀', '🏆', '💍', '🎂'];
$('#tickerTrack').innerHTML = [...TICK, ...TICK].map(e => `<span>${e}</span>`).join('');

const CASES = [
  { id: 'mask', n: 'Mask', e: '🎭', price: 79, glow: '#6b7bff', tag: 'Новое', w: [50, 28, 12, 6, 3, 1, 0, 0, 0] },
  { id: 'hallo', n: 'Hallo…', e: '🎃', price: 299, glow: '#ff8a1f', w: [30, 25, 20, 12, 7, 4, 1.5, .5, 0] },
  { id: 'myth', n: 'Myth', e: '🗿', price: 489, glow: '#9ca3af', w: [20, 22, 22, 15, 10, 6, 3, 1.5, .5] },
  { id: 'bear', n: 'Bear', e: '🧸', price: 149, glow: '#f472b6', w: [40, 28, 15, 9, 5, 2, 1, 0, 0] },
  { id: 'player', n: 'Player', e: '🎮', price: 199, glow: '#2f6bff', w: [32, 26, 18, 12, 7, 3, 1.5, .5, 0] },
  { id: 'skull', n: 'Skull', e: '💀', price: 249, glow: '#35d07f', w: [28, 24, 20, 13, 8, 4, 2, 1, 0] },
  { id: 'gold', n: 'Gold', e: '🪙', price: 1500, glow: '#ffc83d', w: [10, 15, 20, 20, 15, 10, 6, 3, 1] },
];
function pickItem(w) {
  const sum = w.reduce((a, b) => a + b, 0); let x = Math.random() * sum;
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return ITEMS[i]; }
  return ITEMS[0];
}
const spend = n => { if (state.balance < n) { toast('Недостаточно ⭐'); haptic('heavy'); return false; } state.balance -= n; save(); return true; };

/* ---------- router ---------- */
const MODES = [
  { id: 'free', cls: 'm-free', ic: '🎁', t: 'Бесплатно', s: '2 кейса' },
  { id: 'plane', cls: 'm-plane', ic: '🚀', t: 'Plane', badge: 'Новое', go: 'crash' },
  { id: 'cases', cls: 'm-cases', ic: '⭐', t: 'Кейсы', s: `${CASES.length} кейсов` },
  { id: 'upgrade', cls: 'm-up', ic: '🐸', t: 'Апгрейд', s: 'Улучшите свои подарки' },
  { id: 'crash', cls: 'm-crash', ic: '🚀', t: 'Краш', badge: 'Онлайн', dark: 1 },
  { id: 'mines', cls: 'm-mines', ic: '💣', t: 'Мины', s: 'Угадайте верную ячейку' },
  { id: 'plinko', cls: 'm-plinko', ic: '🎱', t: 'Plinko', s: 'Попадите шариком в цель', soon: 1 },
  { id: 'contracts', cls: 'm-contract', ic: '📜', t: 'Контракты', s: 'Объедините подарки', soon: 1 },
];
const screens = { games: home, cases: casesList, upgrade, crash, mines };

function go(name, arg) { view.innerHTML = ''; stopCrash(); const d = document.createElement('div'); d.className = 'screen'; view.append(d); (screens[name] || soon)(d, arg); view.scrollTop = 0; haptic(); }
const bar = (el, title, back = 'games') => { el.insertAdjacentHTML('beforeend', `<div class="bar"><button class="back" data-b>‹ Назад</button><div class="ttl">${title}</div><div style="width:70px"></div></div>`); $('[data-b]', el).onclick = () => go(back); };
const soon = el => { el.innerHTML = '<div class="soon"><b>🛠</b>Скоро будет</div>'; bar(el, 'GiftRush'); };

function home(el) {
  const box = document.createElement('div'); box.className = 'modes'; el.append(box);
  MODES.forEach((m, i) => {
    const b = document.createElement('button'); b.className = 'mode ' + m.cls; b.style.animationDelay = i * 55 + 'ms';
    b.innerHTML = `<div class="ic">${m.ic}</div><div><h3>${m.t}</h3>${m.badge ? `<span class="badge ${m.dark ? 'dark' : ''}">${m.badge}</span>` : `<p>${m.s}</p>`}</div>`;
    b.onclick = () => m.soon || m.id === 'free' ? toast('Скоро будет') : go(m.go || m.id);
    box.append(b);
  });
}

/* ---------- cases ---------- */
function casesList(el) {
  bar(el, 'Кейсы');
  const g = document.createElement('div'); g.className = 'grid2'; el.append(g);
  CASES.forEach((c, i) => {
    const d = document.createElement('button'); d.className = 'case'; d.style.setProperty('--glow', c.glow + '66'); d.style.animationDelay = i * 50 + 'ms';
    d.innerHTML = `${c.tag ? `<span class="tag">${c.tag}</span>` : ''}<span class="em">${c.e}</span><div class="nm"><span>${c.n}</span><span class="pr">⭐ ${c.price}</span></div>`;
    d.onclick = () => openCase(c); g.append(d);
  });
}
function openCase(c) {
  const el = document.createElement('div'); el.className = 'screen'; view.innerHTML = ''; view.append(el);
  bar(el, c.n, 'cases');
  el.insertAdjacentHTML('beforeend', `<div class="reel-wrap"><div class="reel" id="reel"></div></div><div class="win" id="win">Цена: ⭐ ${c.price}</div><br><button class="btn" id="go">Открыть за ⭐ ${c.price}</button>`);
  const reel = $('#reel'); const mk = it => `<div class="it" style="--c:${RAR[it.r]}">${it.e}</div>`;
  reel.innerHTML = Array.from({ length: 12 }, () => mk(ITEMS[Math.floor(Math.random() * 9)])).join('');
  let busy = false;
  $('#go').onclick = async () => {
    if (busy || !spend(c.price)) return; busy = true; $('#go').disabled = true;
    const prize = pickItem(c.w), N = 50, stop = 42;
    const arr = Array.from({ length: N }, (_, i) => i === stop ? prize : ITEMS[Math.floor(Math.random() * 9)]);
    reel.style.transition = 'none'; reel.style.transform = 'translateX(0)'; reel.innerHTML = arr.map(mk).join(''); reel.offsetWidth;
    const w = reel.parentElement.offsetWidth, off = stop * 110 + 50 - w / 2 + rnd(-30, 30);
    reel.style.transition = 'transform 5s cubic-bezier(.12,.7,.1,1)'; reel.style.transform = `translateX(${-off}px)`;
    let t = 0; const iv = setInterval(() => { if (++t % 3 === 0) haptic('light'); }, 120);
    await sleep(5100); clearInterval(iv); haptic('heavy');
    state.balance += prize.p; state.gifts.push(prize); save();
    $('#win').innerHTML = `<div class="pop" style="color:${RAR[prize.r]}">${prize.e} ${prize.n} · +⭐ ${prize.p}</div>`;
    $('#go').disabled = false; busy = false;
  };
}

/* ---------- upgrade ---------- */
function upgrade(el) {
  bar(el, 'Апгрейд');
  let mine = null, want = null, chance = 0, busy = false;
  el.insertAdjacentHTML('beforeend', `<p class="sub">Преобразуйте свои подарки в более ценные!</p>
  <div class="slot"><h4>Ваши подарки</h4><div class="pick" id="mine"><small>＋ Добавить ещё</small></div></div>
  <div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="#2a2c33" stroke-width="9"/><circle id="arc" cx="50" cy="50" r="44" fill="none" stroke="#35d07f" stroke-width="9" stroke-linecap="round" stroke-dasharray="0 276" style="transition:stroke-dasharray .6s var(--ease);filter:drop-shadow(0 0 6px #35d07f)"/></svg><div class="arrow" id="arrow"></div><div class="num" id="pct">—</div></div>
  <div class="slot"><h4>Желаемый подарок</h4><div class="pick" id="want"><small>＋ Добавить ещё</small></div></div>
  <button class="btn" id="go">Выбрать свой подарок</button>`);
  const pickRow = (title, list, cb) => {
    const o = document.createElement('div'); o.className = 'screen'; view.innerHTML = ''; view.append(o); bar(o, title, 'upgrade');
    if (!list.length) o.insertAdjacentHTML('beforeend', '<div class="soon"><b>📭</b>Пусто. Откройте кейс или пополните баланс.</div>');
    const g = document.createElement('div'); g.className = 'grid2'; o.append(g);
    list.forEach(it => { const b = document.createElement('button'); b.className = 'case'; b.innerHTML = `<span class="em" style="font-size:52px">${it.e}</span><div class="nm"><span>${it.n}</span><span class="pr">⭐ ${it.p}</span></div>`; b.onclick = () => { cb(it); go('upgrade', { mine, want }); }; g.append(b); });
  };
  const sync = () => {
    $('#mine').innerHTML = mine ? `${mine.e}` : '<small>＋ Добавить ещё</small>'; $('#mine').classList.toggle('has', !!mine);
    $('#want').innerHTML = want ? `${want.e}` : '<small>＋ Добавить ещё</small>'; $('#want').classList.toggle('has', !!want);
    if (mine && want && want.p > mine.p) { chance = Math.min(75, Math.max(3, (mine.p / want.p) * 92)); $('#pct').textContent = chance.toFixed(1) + '%'; $('#arc').setAttribute('stroke-dasharray', `${chance / 100 * 276} 276`); $('#go').textContent = 'Апгрейд'; }
    else { $('#pct').textContent = '—'; $('#arc').setAttribute('stroke-dasharray', '0 276'); $('#go').textContent = 'Выбрать свой подарок'; }
  };
  const a = screens._arg; // восстановление выбора
  $('#mine').onclick = () => pickRow('Ваши подарки', state.gifts.filter(g => g), it => { mine = it; screens._arg = { mine, want }; });
  $('#want').onclick = () => pickRow('Желаемый подарок', ITEMS.filter(i => !mine || i.p > mine.p), it => { want = it; screens._arg = { mine, want }; });
  if (screens._arg) { mine = screens._arg.mine; want = screens._arg.want; sync(); }
  $('#go').onclick = async () => {
    if (busy) return;
    if (!mine) return $('#mine').click(); if (!want) return $('#want').click();
    if (want.p <= mine.p) return toast('Выберите более ценный подарок');
    const idx = state.gifts.findIndex(g => g.n === mine.n); if (idx < 0) return toast('Нет такого подарка');
    busy = true; state.gifts.splice(idx, 1); save();
    const win = Math.random() * 100 < chance, arrow = $('#arrow');
    const target = win ? rnd(8, chance / 100 * 360 - 8) : rnd(chance / 100 * 360 + 8, 352);
    arrow.style.transition = 'none'; arrow.style.transform = 'translate(-50%,0) rotate(180deg)'; arrow.offsetWidth;
    arrow.style.transition = 'transform 4s cubic-bezier(.1,.7,.1,1)'; arrow.style.transform = `translate(-50%,0) rotate(${180 + 360 * 4 + target}deg)`;
    await sleep(4200); haptic(win ? 'heavy' : 'rigid');
    if (win) { state.gifts.push(want); toast(`🎉 Успех! ${want.e} ${want.n}`); } else toast('💥 Неудача, подарок сгорел');
    save(); screens._arg = null; busy = false; setTimeout(() => go('upgrade'), 900);
  };
}

/* ---------- crash ---------- */
let crashRaf = 0, crashAlive = false;
function stopCrash() { crashAlive = false; cancelAnimationFrame(crashRaf); }
function crash(el) {
  bar(el, 'Gorilla Crash');
  el.insertAdjacentHTML('beforeend', `<div class="hist" id="hist"></div>
  <div class="crash-box"><canvas id="cv"></canvas><div class="mult" id="mult">1.00x</div></div>
  <div class="betrow"><input id="bet" type="number" value="50" min="1"><button data-m="0.5">½</button><button data-m="2">×2</button></div>
  <button class="btn" id="go">Сделать ставку</button>`);
  const cv = $('#cv'), ctx = cv.getContext('2d'), multEl = $('#mult'), goBtn = $('#go'), hist = $('#hist');
  const dpr = devicePixelRatio || 1; cv.width = cv.offsetWidth * dpr; cv.height = cv.offsetHeight * dpr; const W = cv.width, H = cv.height;
  document.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const i = $('#bet'); i.value = Math.max(1, Math.floor(i.value * b.dataset.m)); });
  const pts = []; let phase = 'wait', t0 = 0, crashAt = 2, bet = 0, cashed = false, wait = 0, tail = [];
  const addHist = (v, w) => { hist.insertAdjacentHTML('afterbegin', `<span class="${w ? 'h' : 'l'}">${v.toFixed(2)}x</span>`); if (hist.children.length > 9) hist.lastChild.remove(); };
  [1.24, 3.8, 1.05, 2.1, 1.77].forEach(v => addHist(v, v > 1.9));
  const newCrash = () => { const r = Math.random(); return Math.max(1.0, +(0.97 / (1 - r * .99)).toFixed(2)); };
  const stars = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.6 * dpr + .3, v: rnd(.1, .5) }));
  goBtn.onclick = () => {
    if (phase === 'wait' && !bet) { const v = Math.floor($('#bet').value); if (v > 0 && spend(v)) { bet = v; cashed = false; goBtn.textContent = 'Ждём раунд…'; goBtn.disabled = true; } }
    else if (phase === 'fly' && bet && !cashed) { cashed = true; const m = cur(); const win = Math.floor(bet * m); state.balance += win; save(); goBtn.textContent = `Забрано ⭐ ${win}`; goBtn.className = 'btn green'; goBtn.disabled = true; haptic('heavy'); toast(`+${win - bet} ⭐`); }
  };
  const cur = () => Math.pow(Math.E, 0.075 * (performance.now() - t0) / 1000 * 1.9);
  const reset = () => { phase = 'wait'; wait = performance.now() + 5000; bet = 0; cashed = false; tail = []; multEl.classList.remove('lose'); multEl.textContent = 'Старт…'; goBtn.className = 'btn'; goBtn.disabled = false; goBtn.textContent = 'Сделать ставку'; crashAt = newCrash(); };
  reset(); crashAlive = true;
  const draw = now => {
    if (!crashAlive) return; ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; stars.forEach(s => { s.y += s.v * (phase === 'fly' ? 4 : 1); if (s.y > H) s.y = 0; ctx.globalAlpha = .6; ctx.fillRect(s.x, s.y, s.s, s.s); }); ctx.globalAlpha = 1;
    if (phase === 'wait') { const left = Math.max(0, (wait - now) / 1000); multEl.textContent = left.toFixed(1) + 'с'; if (left <= 0) { phase = 'fly'; t0 = now; if (bet) { goBtn.disabled = false; goBtn.textContent = 'Забрать'; goBtn.className = 'btn green'; } else { goBtn.disabled = true; goBtn.textContent = 'Раунд идёт'; } } }
    if (phase === 'fly') {
      const m = cur(); multEl.textContent = m.toFixed(2) + 'x';
      const p = Math.min(1, (m - 1) / 4); const x = W * .12 + p * W * .7, y = H * .88 - Math.pow(p, .8) * H * .62 + Math.sin(now / 90) * 2;
      tail.push([x, y]); if (tail.length > 60) tail.shift();
      const g = ctx.createLinearGradient(0, H, W, 0); g.addColorStop(0, '#5b7cff00'); g.addColorStop(1, '#5b7cff'); ctx.strokeStyle = g; ctx.lineWidth = 4 * dpr; ctx.shadowColor = '#5b7cff'; ctx.shadowBlur = 18; ctx.beginPath(); tail.forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.font = `${34 * dpr}px serif`; ctx.save(); ctx.translate(x, y); ctx.rotate(-.6); ctx.fillText('🚀', -17 * dpr, 12 * dpr); ctx.restore();
      if (m >= crashAt) { phase = 'boom'; multEl.textContent = crashAt.toFixed(2) + 'x'; multEl.classList.add('lose'); addHist(crashAt, false); haptic('rigid'); if (bet && !cashed) { goBtn.textContent = 'Проигрыш'; goBtn.className = 'btn red'; goBtn.disabled = true; } wait = now + 2200; }
    }
    if (phase === 'boom' && now > wait) reset();
    crashRaf = requestAnimationFrame(draw);
  };
  crashRaf = requestAnimationFrame(draw);
}

/* ---------- mines ---------- */
function mines(el) {
  bar(el, 'Мины');
  let size = 5, mcount = 3, grid = [], opened = 0, bet = 50, live = false;
  el.insertAdjacentHTML('beforeend', `<div class="live"><span class="dot"></span>LIVE <span id="mx" style="margin-left:auto;color:var(--gold)">1.00x</span></div>
  <div class="mgrid" id="mg"></div>
  <div class="chips" id="sizes"></div><div class="chips" id="mc"></div>
  <div class="betrow"><input id="bet" type="number" value="50" min="1"></div>
  <button class="btn" id="go">Сделать ставку</button>`);
  const mg = $('#mg'), mx = $('#mx'), go_ = $('#go');
  const mult = () => { let m = 1; const T = size * size; for (let i = 0; i < opened; i++) m *= (T - i) / (T - mcount - i); return m * .97; };
  const draw = () => {
    mg.style.gridTemplateColumns = `repeat(${size},1fr)`; mg.innerHTML = '';
    for (let i = 0; i < size * size; i++) { const c = document.createElement('button'); c.className = 'cell'; c.textContent = '?'; c.dataset.i = i; c.onclick = () => click(i, c); mg.append(c); }
  };
  const chips = (id, arr, cur, cb) => { const e = $(id); e.innerHTML = ''; arr.forEach(v => { const b = document.createElement('button'); b.className = 'chip' + (v[0] === cur ? ' on' : ''); b.textContent = v[1]; b.onclick = () => { if (live) return toast('Игра идёт'); cb(v[0]); haptic(); }; e.append(b); }); };
  const ui = () => { chips('#sizes', [[3, '3x3'], [5, '5x5'], [7, '7x7']], size, v => { size = v; mcount = Math.min(mcount, v * v - 1); draw(); ui(); }); chips('#mc', [1, 3, 5, 8].filter(v => v < size * size).map(v => [v, '💣 ' + v]), mcount, v => { mcount = v; ui(); }); };
  const end = (won, hit) => { live = false; grid.forEach((b, i) => { const c = mg.children[i]; if (!c.classList.contains('safe')) { c.classList.add(b ? 'bomb' : 'dim'); c.textContent = b ? '💣' : '👑'; } }); go_.className = 'btn'; go_.textContent = 'Сделать ставку'; if (!won) { haptic('rigid'); toast('💥 Мина!'); } };
  const click = (i, c) => {
    if (!live || c.classList.contains('safe')) return;
    if (grid[i]) { c.classList.add('bomb'); c.textContent = '💣'; return end(false, i); }
    c.classList.add('safe'); c.textContent = '👑'; opened++; mx.textContent = mult().toFixed(2) + 'x'; haptic();
    go_.textContent = `Забрать ⭐ ${Math.floor(bet * mult())}`;
    if (opened === size * size - mcount) cash();
  };
  const cash = () => { const w = Math.floor(bet * mult()); state.balance += w; save(); toast(`+${w} ⭐`); haptic('heavy'); end(true); };
  go_.onclick = () => {
    if (live) { if (opened) cash(); else toast('Откройте хотя бы одну ячейку'); return; }
    bet = Math.floor($('#bet').value); if (!(bet > 0) || !spend(bet)) return;
    grid = Array(size * size).fill(0); let k = 0; while (k < mcount) { const r = Math.floor(Math.random() * grid.length); if (!grid[r]) { grid[r] = 1; k++; } }
    opened = 0; live = true; mx.textContent = '1.00x'; draw(); go_.className = 'btn green'; go_.textContent = 'Забрать';
  };
  draw(); ui();
}

/* ---------- tabs ---------- */
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#nav button').forEach(x => x.classList.remove('on')); b.classList.add('on');
  b.dataset.tab === 'games' ? go('games') : (stopCrash(), view.innerHTML = '<div class="screen soon"><b>🛠</b>Скоро будет</div>');
});
save(); go('games');
