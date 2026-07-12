// Fauzet App — state, actions, persistence, render orchestration (ported from Fauzet App.dc.html logic)
"use strict";

var S = {
  lang: 'en',
  view: 'auth', authTab: 'login',
  obStep: 0,
  screen: 'dashboard',
  isMobile: false,
  // economy (MOCK DATA — demo prototype, not authoritative)
  balances: { available: 2180, pending: 640, locked: 600, eligible: 1450, promo: 100 },
  energy: 64,
  faucet: { status: 'ready', secs: 0, streak: 6, claimsToday: 3, captchaOk: false, lastAmount: 0, history: [
    { time: 'Today 10:12', status: 'CONFIRMED', statusColor: '#2EE6A6', amount: 18 },
    { time: 'Today 08:44', status: 'CONFIRMED', statusColor: '#2EE6A6', amount: 9 },
    { time: 'Today 07:03', status: 'CONFIRMED', statusColor: '#2EE6A6', amount: 14 },
    { time: 'Yesterday 22:10', status: 'REJECTED', statusColor: '#f87171', amount: 0 },
    { time: 'Yesterday 20:31', status: 'CONFIRMED', statusColor: '#2EE6A6', amount: 22 }
  ]},
  txs: [
    { icon: '💧', label: 'Faucet claim', time: '10:12', status: 'Confirmed', statusColor: '#2EE6A6', amount: '+18', amtColor: '#2EE6A6' },
    { icon: '🎮', label: 'Tap Miner reward', time: '09:58', status: 'Confirmed', statusColor: '#2EE6A6', amount: '+24', amtColor: '#2EE6A6' },
    { icon: '⛏️', label: 'Mining pool payout', time: '00:00', status: 'Confirmed', statusColor: '#2EE6A6', amount: '+181', amtColor: '#2EE6A6' },
    { icon: '👥', label: 'Crew reward · L1', time: 'Yesterday', status: 'Pending', statusColor: '#22D3EE', amount: '+12', amtColor: '#9CA3AF' },
    { icon: '🚀', label: 'Boost purchase', time: 'Yesterday', status: 'Confirmed', statusColor: '#2EE6A6', amount: '-150', amtColor: '#f87171' }
  ],
  notifOpen: false,
  toast: null,
  gameCat: 'all',
  game: null,
  missionTab: 'all',
  claimedMissions: [],
  miners: [
    { id: 1, name: 'Drip Node', icon: '🖥️', tier: 'BASIC', tierColor: '#22D3EE', level: 2, hash: 24, energyUse: 2, eff: 96, durability: 82, upgradeCost: 220, repairCost: 60 },
    { id: 2, name: 'Core Rig', icon: '⚙️', tier: 'STANDARD', tierColor: '#2EE6A6', level: 3, hash: 46, energyUse: 4, eff: 88, durability: 34, upgradeCost: 480, repairCost: 120 },
    { id: 3, name: 'Nova Rig', icon: '🔮', tier: 'PREMIUM', tierColor: '#7C3AED', level: 1, hash: 58, energyUse: 6, eff: 92, durability: 91, upgradeCost: 900, repairCost: 200 }
  ],
  buy: null,
  txFilter: 'all',
  vault: { amount: 500, period: 1, position: { amount: 600, periodName: '30d', mult: '1.15×', end: 'Aug 02, 2026' } },
  vaultConfirm: false,
  pair: 0, timeframe: 1, tradeSide: 'buy', tradeAmount: 500,
  tradeHist: [
    { side: 'BUY', sideColor: '#2EE6A6', amt: '1,000 ZYXE', price: '0.00000112', time: 'Jul 09' },
    { side: 'SELL', sideColor: '#f87171', amt: '400 ZYXE', price: '0.00000118', time: 'Jul 06' },
    { side: 'BUY', sideColor: '#2EE6A6', amt: '250 ZYXE', price: '0.00000105', time: 'Jul 02' }
  ],
  convertAmount: 1000, convertAsset: 0, cvDone: false,
  wdStep: 1, wdAmount: 1500, wdAsset: 0,
  twoFaOn: true, pinOn: false, notifEmailOn: true
};

var _gameT = null, _toastT = null;

// ---------- helpers used by views ----------
function fzCd(secs) { return Math.floor(secs / 60) + ':' + padz(secs % 60); }
function fzTotalHash(st) { return st.miners.reduce(function(a, m){ return a + m.hash; }, 0); }
function fzCvQuote(st) {
  var spread = Math.round(st.convertAmount * 0.01);
  var net = Math.max(0, st.convertAmount * 0.99 * FZ_CV_RATES[st.convertAsset] - FZ_CV_NETFEES[st.convertAsset]);
  var receive = net.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') + ' ' + FZ_CV_UNITS[st.convertAsset];
  var valid = st.convertAmount >= 500 && st.convertAmount <= st.balances.eligible;
  return { spread: fmt(spread), receive: receive, valid: valid };
}
function fzWdQuote(st) {
  var fee = fmt(Math.round(st.wdAmount * 0.01));
  var receive = (st.wdAmount * 0.99 * 0.0000482 - 0.0001).toFixed(6);
  var valid = st.wdAmount >= 1000 && st.wdAmount <= st.balances.eligible;
  return { fee: fee, receive: receive, valid: valid };
}
function dict() { return S.lang === 'es' ? FZ_DICT.es : FZ_DICT.en; }

// ---------- persistence ----------
var PERSIST_KEYS = ['lang', 'view', 'screen', 'balances', 'energy', 'claimedMissions', 'miners', 'vault', 'twoFaOn', 'pinOn', 'notifEmailOn', 'tradeHist', 'txs'];
function saveState() {
  try {
    var out = {};
    PERSIST_KEYS.forEach(function(k){ out[k] = S[k]; });
    out.faucet = { status: S.faucet.status === 'claiming' || S.faucet.status === 'claimed' ? 'cooling' : S.faucet.status, secs: S.faucet.secs, streak: S.faucet.streak, claimsToday: S.faucet.claimsToday, captchaOk: S.faucet.captchaOk, lastAmount: S.faucet.lastAmount, history: S.faucet.history };
    localStorage.setItem('fz_app', JSON.stringify(out));
  } catch (e) {}
}
function loadState() {
  try {
    var raw = localStorage.getItem('fz_app');
    if (!raw) return;
    var saved = JSON.parse(raw);
    PERSIST_KEYS.forEach(function(k){ if (saved[k] !== undefined) S[k] = saved[k]; });
    if (saved.faucet) S.faucet = Object.assign({}, S.faucet, saved.faucet);
    if (S.view === 'onboarding') S.view = 'auth';
    // never restore into a transient screen state
    S.game = null; S.buy = null; S.vaultConfirm = false; S.notifOpen = false; S.toast = null;
  } catch (e) {}
}

// ---------- rendering ----------
function render() {
  var t = dict();
  document.documentElement.lang = S.lang;
  var root = document.getElementById('app');
  if (S.view === 'auth') root.innerHTML = vAuth(S, t);
  else if (S.view === 'onboarding') root.innerHTML = vOnboarding(S, t);
  else root.innerHTML = vShell(S, t);
  renderOverlays();
}
function renderScreen() {
  var el = document.getElementById('screenRoot');
  if (el) el.innerHTML = vScreen(S, dict());
  else render();
  syncTopbar();
}
function renderOverlays() {
  document.getElementById('overlayRoot').innerHTML = S.view === 'app' ? vOverlays(S, dict()) : '';
  document.getElementById('toastRoot').innerHTML = vToast(S);
}
function syncTopbar() {
  var b = document.getElementById('tb-balance');
  if (b) b.textContent = fmt(S.balances.available);
  var e = document.getElementById('tb-energy');
  if (e) e.textContent = S.energy + '/100';
}
function toast(msg) {
  S.toast = msg;
  renderOverlays();
  clearTimeout(_toastT);
  _toastT = setTimeout(function(){ S.toast = null; renderOverlays(); }, 2400);
}
function nav(screen) {
  S.screen = screen; S.notifOpen = false;
  if (screen === 'convert') S.cvDone = false;
  render();
  window.scrollTo(0, 0);
  saveState();
}

// ---------- games ----------
function openGame(id) {
  S.game = { id: id, phase: 'intro', score: 0, timeLeft: 0, cards: null, flipped: [], pairs: 0, spinPhase: 'idle', reward: 0 };
  renderOverlays();
}
function closeGame() { clearInterval(_gameT); S.game = null; renderOverlays(); }
function startGame() {
  var g = S.game; if (!g) return;
  clearInterval(_gameT);
  g.phase = 'playing'; g.score = 0; g.reward = 0;
  if (g.id === 'tap') {
    g.timeLeft = 10;
    _gameT = setInterval(function(){
      var gg = S.game; if (!gg) return;
      if (gg.timeLeft <= 1) { clearInterval(_gameT); finishGame(Math.min(25, 5 + Math.floor(gg.score / 4))); }
      else { gg.timeLeft--; var el = document.getElementById('g-time'); if (el) el.textContent = gg.timeLeft; }
    }, 1000);
  } else if (g.id === 'memory') {
    var syms = ['💧', '⛏️', '💠', '🚀', '🔋', '🏆'];
    g.cards = syms.concat(syms).map(function(sym){ return { sym: sym, matched: false }; }).sort(function(){ return Math.random() - .5; });
    g.timeLeft = 45; g.flipped = []; g.pairs = 0;
    _gameT = setInterval(function(){
      var gg = S.game; if (!gg) return;
      if (gg.timeLeft <= 1) { clearInterval(_gameT); finishGame(5 + gg.pairs * 3); }
      else { gg.timeLeft--; var el = document.getElementById('g-time'); if (el) el.textContent = gg.timeLeft; }
    }, 1000);
  } else if (g.id === 'spin') {
    g.spinPhase = 'idle';
  }
  renderOverlays();
}
function flipCard(idx) {
  var g = S.game; if (!g || g.phase !== 'playing') return;
  if (g.flipped.length === 2 || g.flipped.indexOf(idx) !== -1 || g.cards[idx].matched) return;
  g.flipped.push(idx);
  if (g.flipped.length === 2) {
    var a = g.flipped[0], b = g.flipped[1];
    if (g.cards[a].sym === g.cards[b].sym) {
      g.cards[a].matched = true; g.cards[b].matched = true;
      g.flipped = [];
      g.pairs++;
      g.score = g.pairs * 10 + g.timeLeft;
      if (g.pairs === 6) { clearInterval(_gameT); setTimeout(function(){ finishGame(15 + Math.floor(g.timeLeft / 2)); }, 500); }
    } else {
      setTimeout(function(){ var gg = S.game; if (gg) { gg.flipped = []; renderOverlays(); } }, 700);
    }
  }
  renderOverlays();
}
function doSpin() {
  var g = S.game; if (!g) return;
  g.spinPhase = 'spinning';
  renderOverlays();
  setTimeout(function(){
    var r = Math.random();
    var reward = r < .5 ? 5 : r < .8 ? 10 : r < .95 ? 25 : 50;
    clearInterval(_gameT);
    finishGame(reward);
  }, 1300);
}
function finishGame(reward) {
  var g = S.game; if (!g) return;
  g.phase = 'done'; g.reward = reward;
  S.energy = Math.max(0, S.energy - 5);
  S.balances.pending += reward;
  S.txs.unshift({ icon: '🎮', label: (g.id === 'tap' ? 'Tap Miner' : g.id === 'memory' ? 'Memory Drops' : 'Daily Spin') + ' reward', time: 'now', status: 'Pending', statusColor: '#22D3EE', amount: '+' + reward, amtColor: '#9CA3AF' });
  S.txs = S.txs.slice(0, 6);
  renderOverlays();
  syncTopbar();
  saveState();
}

// ---------- actions ----------
var ACTIONS = {
  // auth
  goLogin: function(){ S.authTab = 'login'; render(); },
  goSignup: function(){ S.authTab = 'signup'; render(); },
  goForgot: function(){ S.authTab = 'forgot'; render(); },
  doLogin: function(){ S.authTab = '2fa'; render(); },
  doSignup: function(){ S.authTab = 'verify'; render(); },
  doVerify: function(){ S.view = 'onboarding'; S.obStep = 0; render(); },
  do2fa: function(){ S.view = 'app'; S.screen = 'dashboard'; render(); saveState(); },
  doLogout: function(){ S.view = 'auth'; S.authTab = 'login'; render(); saveState(); },
  // onboarding
  obNext: function(){
    if (S.obStep >= 4) {
      S.view = 'app'; S.screen = 'dashboard';
      render();
      toast(S.lang === 'es' ? '+100 ZYXE promocionales acreditados' : '+100 promotional ZYXE credited');
      saveState();
    } else { S.obStep++; render(); }
  },
  obSkip: function(){ S.obStep = Math.min(4, S.obStep + 1); render(); },
  // shell
  nav: function(i){ nav(i); },
  toggleLang: function(){ S.lang = S.lang === 'es' ? 'en' : 'es'; render(); saveState(); },
  toggleNotif: function(){ S.notifOpen = !S.notifOpen; renderOverlays(); },
  // faucet
  solveCaptcha: function(){ S.faucet.captchaOk = true; renderScreen(); },
  doClaim: function(){
    S.faucet.status = 'claiming';
    renderScreen();
    setTimeout(function(){
      var amount = 5 + Math.floor(Math.random() * 21);
      S.faucet.status = 'claimed';
      S.faucet.lastAmount = amount;
      S.faucet.claimsToday++;
      S.faucet.secs = 15 * 60;
      S.faucet.history.unshift({ time: S.lang === 'es' ? 'Ahora' : 'Just now', status: 'CONFIRMED', statusColor: '#2EE6A6', amount: amount });
      S.faucet.history = S.faucet.history.slice(0, 6);
      S.balances.available += amount;
      S.txs.unshift({ icon: '💧', label: 'Faucet claim', time: S.lang === 'es' ? 'ahora' : 'now', status: 'Confirmed', statusColor: '#2EE6A6', amount: '+' + amount, amtColor: '#2EE6A6' });
      S.txs = S.txs.slice(0, 6);
      renderScreen();
      saveState();
      setTimeout(function(){ S.faucet.status = 'cooling'; renderScreen(); saveState(); }, 4000);
    }, 1400);
  },
  // games
  gameCat: function(i){ S.gameCat = i; renderScreen(); },
  openGame: function(i){ openGame(i); },
  closeGame: function(){ closeGame(); },
  startGame: function(){ startGame(); },
  tapMine: function(){
    var g = S.game; if (!g || g.phase !== 'playing') return;
    g.score++;
    var el = document.getElementById('g-score');
    if (el) el.textContent = g.score;
  },
  flipCard: function(i){ flipCard(parseInt(i, 10)); },
  doSpin: function(){ doSpin(); },
  // missions
  missionTab: function(i){ S.missionTab = i; renderScreen(); },
  claimMission: function(i){
    var es = S.lang === 'es';
    var m = fzMissionDefs(es).filter(function(x){ return x.id === i; })[0];
    if (!m || S.claimedMissions.indexOf(i) !== -1) return;
    S.claimedMissions.push(i);
    S.balances.available += m.reward;
    renderScreen();
    toast(es ? '+' + m.reward + ' ZYXE de misión acreditados' : '+' + m.reward + ' mission ZYXE credited');
    saveState();
  },
  // mining
  upgradeMiner: function(i){
    var es = S.lang === 'es';
    var m = S.miners.filter(function(x){ return x.id === parseInt(i, 10); })[0];
    if (!m) return;
    if (S.balances.available < m.upgradeCost) { toast(es ? 'Saldo insuficiente' : 'Insufficient balance'); return; }
    S.balances.available -= m.upgradeCost;
    m.level++; m.hash = Math.round(m.hash * 1.25); m.upgradeCost = Math.round(m.upgradeCost * 1.6);
    renderScreen();
    toast(es ? m.name + ' mejorado a Lv ' + m.level : m.name + ' upgraded to Lv ' + m.level);
    saveState();
  },
  repairMiner: function(i){
    var es = S.lang === 'es';
    var m = S.miners.filter(function(x){ return x.id === parseInt(i, 10); })[0];
    if (!m) return;
    if (S.balances.available < m.repairCost) { toast(es ? 'Saldo insuficiente' : 'Insufficient balance'); return; }
    S.balances.available -= m.repairCost;
    m.durability = 100;
    renderScreen();
    toast(es ? m.name + ' reparado' : m.name + ' repaired');
    saveState();
  },
  restoreEnergy: function(){
    var es = S.lang === 'es';
    if (S.balances.available < 80) { toast(es ? 'Saldo insuficiente' : 'Insufficient balance'); return; }
    S.energy = 100; S.balances.available -= 80;
    renderScreen();
    toast(es ? 'Energía restaurada al 100%' : 'Energy restored to 100%');
    saveState();
  },
  // store
  buyItem: function(i){
    var es = S.lang === 'es';
    var it = fzStoreDefs(es).filter(function(x){ return x.id === i; })[0];
    if (!it) return;
    if (S.balances.available < it.price) { toast(es ? 'Saldo insuficiente' : 'Insufficient balance'); return; }
    S.buy = it;
    renderOverlays();
  },
  cancelBuy: function(){ S.buy = null; renderOverlays(); },
  confirmBuy: function(){
    var it = S.buy; if (!it) return;
    var es = S.lang === 'es';
    S.buy = null;
    S.balances.available -= it.price;
    if (it.id === 'b1') S.energy = 100;
    S.txs.unshift({ icon: '🚀', label: it.name, time: 'now', status: 'Confirmed', statusColor: '#2EE6A6', amount: '-' + it.price, amtColor: '#f87171' });
    S.txs = S.txs.slice(0, 6);
    renderScreen();
    renderOverlays();
    toast(es ? 'Compra completada' : 'Purchase completed');
    saveState();
  },
  // wallet
  txFilter: function(i){ S.txFilter = i; renderScreen(); },
  // vault
  vaultPeriod: function(i){ S.vault.period = parseInt(i, 10); renderScreen(); },
  openVaultConfirm: function(){
    var es = S.lang === 'es';
    if (S.vault.amount <= 0 || S.vault.amount > S.balances.available) { toast(es ? 'Monto inválido' : 'Invalid amount'); return; }
    S.vaultConfirm = true;
    renderOverlays();
  },
  cancelVault: function(){ S.vaultConfirm = false; renderOverlays(); },
  confirmVault: function(){
    var es = S.lang === 'es';
    var amt = S.vault.amount;
    var meta = FZ_VAULT_PERIODS_META;
    S.vaultConfirm = false;
    S.balances.available -= amt;
    S.balances.locked += amt;
    S.vault.position = {
      amount: (S.vault.position ? S.vault.position.amount : 0) + amt,
      periodName: meta.shortNames[S.vault.period],
      mult: meta.multLabels[S.vault.period],
      end: meta.unlocks[S.vault.period]
    };
    renderScreen();
    renderOverlays();
    toast(es ? 'Bloqueo creado — registrado en el ledger' : 'Lock created — recorded in the ledger');
    saveState();
  },
  // crew
  copyRef: function(){
    try { navigator.clipboard.writeText('https://fauzet.io/r/FZ-MATEO7'); } catch (e) {}
    toast(S.lang === 'es' ? 'Enlace copiado' : 'Link copied');
  },
  // trading
  pickPair: function(i){ S.pair = parseInt(i, 10); renderScreen(); },
  pickTf: function(i){ S.timeframe = parseInt(i, 10); renderScreen(); },
  setBuySide: function(){ S.tradeSide = 'buy'; renderScreen(); },
  setSellSide: function(){ S.tradeSide = 'sell'; renderScreen(); },
  placeOrder: function(){
    var es = S.lang === 'es';
    S.tradeHist.unshift({ side: S.tradeSide.toUpperCase(), sideColor: S.tradeSide === 'buy' ? '#2EE6A6' : '#f87171', amt: fmt(S.tradeAmount) + ' ZYXE', price: FZ_PAIR_PRICES[S.pair], time: es ? 'ahora' : 'now' });
    S.tradeHist = S.tradeHist.slice(0, 5);
    renderScreen();
    toast(es ? 'Orden simulada ejecutada' : 'Simulated order filled');
    saveState();
  },
  // convert
  cvAsset: function(i){ S.convertAsset = parseInt(i, 10); S.cvDone = false; renderScreen(); },
  doConvert: function(){
    var es = S.lang === 'es';
    if (S.convertAmount < 500 || S.convertAmount > S.balances.eligible) { toast(es ? 'Monto fuera de límites' : 'Amount outside limits'); return; }
    S.cvDone = true;
    S.balances.eligible -= S.convertAmount;
    S.balances.available -= Math.min(S.convertAmount, S.balances.available);
    renderScreen();
    saveState();
  },
  // withdraw
  wdAsset: function(i){ S.wdAsset = parseInt(i, 10); renderScreen(); },
  copyAddr: function(){
    try { navigator.clipboard.writeText('ltc1q8x...k2f4'); } catch (e) {}
    toast(S.lang === 'es' ? 'Dirección copiada' : 'Address copied');
  },
  addWalletToast: function(){ toast(S.lang === 'es' ? 'Las wallets nuevas requieren confirmación por email y espera de 24h' : 'New wallets require email confirmation and a 24h wait'); },
  wdNext: function(){
    var es = S.lang === 'es';
    if (S.wdAmount < 1000 || S.wdAmount > S.balances.eligible) { toast(es ? 'Monto fuera de límites' : 'Amount outside limits'); return; }
    S.wdStep = 2;
    renderScreen();
  },
  wdBack: function(){ S.wdStep = 1; renderScreen(); },
  wdSubmit: function(){
    var es = S.lang === 'es';
    S.wdStep = 3;
    S.balances.eligible -= S.wdAmount;
    renderScreen();
    toast(es ? 'Solicitud de retiro creada' : 'Withdrawal request created');
    saveState();
  },
  wdReset: function(){ S.wdStep = 1; nav('dashboard'); },
  // profile
  toggleSetting: function(key){ S[key] = !S[key]; renderScreen(); saveState(); },
  revokeSession: function(){ toast(S.lang === 'es' ? 'Sesión cerrada' : 'Session revoked'); },
  // support
  supportToast: function(i){ toast(i); }
};

// ---------- input handling (targeted updates, no full re-render) ----------
function onInput(e) {
  var el = e.target.closest('[data-input]');
  if (!el) return;
  var key = el.getAttribute('data-input');
  var val = Math.max(0, parseInt(el.value || '0', 10) || 0);
  var es = S.lang === 'es';
  if (key === 'vaultAmount') {
    S.vault.amount = val;
    var meta = FZ_VAULT_PERIODS_META;
    var q = (val * 0.011 * meta.mults[S.vault.period]).toFixed(1);
    var r = document.getElementById('vq-reward');
    if (r) r.textContent = '~' + q + ' ZYXE';
  } else if (key === 'tradeAmount') {
    S.tradeAmount = val;
    var fee = document.getElementById('tr-fee');
    if (fee) fee.textContent = fmt(Math.round(val * 0.005)) + ' ZYXE';
    var net = val * 0.995 * FZ_PAIR_RATES[S.pair];
    var rec = document.getElementById('tr-receive');
    if (rec) rec.textContent = net.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') + ' ' + FZ_PAIR_UNITS[S.pair];
  } else if (key === 'convertAmount') {
    S.convertAmount = val; S.cvDone = false;
    var q2 = fzCvQuote(S);
    var sp = document.getElementById('cv-spread');
    if (sp) sp.textContent = q2.spread + ' ZYXE';
    var rc = document.getElementById('cv-receive');
    if (rc) rc.textContent = q2.receive;
    var btn = document.getElementById('cv-btn');
    if (btn) { btn.style.background = q2.valid ? '#2EE6A6' : 'rgba(229,231,235,.08)'; btn.style.color = q2.valid ? '#04140A' : '#6B7280'; }
  } else if (key === 'wdAmount') {
    S.wdAmount = val;
    var q3 = fzWdQuote(S);
    var f2 = document.getElementById('wd-fee');
    if (f2) f2.textContent = q3.fee + ' ZYXE';
    var r2 = document.getElementById('wd-receive');
    if (r2) r2.textContent = q3.receive + ' LTC';
    var btn2 = document.getElementById('wd-btn');
    if (btn2) { btn2.style.background = q3.valid ? '#2EE6A6' : 'rgba(229,231,235,.08)'; btn2.style.color = q3.valid ? '#04140A' : '#6B7280'; }
  }
}

// ---------- boot ----------
function boot() {
  loadState();
  var mq = window.matchMedia('(max-width: 760px)');
  S.isMobile = mq.matches;
  var mqHandler = function(){ S.isMobile = mq.matches; render(); };
  if (mq.addEventListener) mq.addEventListener('change', mqHandler);
  else mq.addListener(mqHandler);

  document.addEventListener('click', function(e){
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var fn = ACTIONS[act];
    if (fn) fn(el.getAttribute('data-i'));
  });
  document.addEventListener('input', onInput);

  // faucet cooldown tick
  setInterval(function(){
    var f = S.faucet;
    if ((f.status === 'cooling' || f.status === 'claimed') && f.secs > 0) {
      f.secs--;
      if (f.secs === 0) {
        f.status = 'ready'; f.captchaOk = false;
        if (S.view === 'app' && (S.screen === 'faucet' || S.screen === 'dashboard')) renderScreen();
        saveState();
      } else {
        var els = document.querySelectorAll('.js-cd');
        for (var i = 0; i < els.length; i++) els[i].textContent = fzCd(f.secs);
      }
    }
  }, 1000);

  render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
