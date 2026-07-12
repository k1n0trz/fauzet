// Fauzet App — view builders (ported from Fauzet App.dc.html template)
"use strict";

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmt(n) { return Number(n).toLocaleString('en-US'); }
function padz(n) { return String(n).padStart(2, '0'); }

var MONO = "font-family:'JetBrains Mono',monospace";
var GROT = "font-family:'Space Grotesk',sans-serif";
var CARD = 'background:#111827;border:1px solid rgba(229,231,235,.08)';
var INPUT = 'width:100%;box-sizing:border-box;background:#0A0E17;border:1px solid rgba(229,231,235,.12);border-radius:10px;padding:12px 14px;color:#E5E7EB;font-size:14.5px';

// ============ AUTH ============
function vAuth(S, t) {
  var tab = S.authTab;
  var inner = '';
  if (tab === 'login') {
    inner = `
      <div style="${GROT};font-size:22px;font-weight:700;margin-bottom:4px">${t.welcomeBack}</div>
      <div style="font-size:13.5px;color:#9CA3AF;margin-bottom:22px">${t.loginSub}</div>
      <label style="display:block;font-size:12.5px;font-weight:700;color:#9CA3AF;margin-bottom:6px" for="li-email">Email</label>
      <input id="li-email" type="email" placeholder="you@example.com" class="inp" style="${INPUT};margin-bottom:14px">
      <label style="display:block;font-size:12.5px;font-weight:700;color:#9CA3AF;margin-bottom:6px" for="li-pass">${t.password}</label>
      <input id="li-pass" type="password" placeholder="••••••••" class="inp" style="${INPUT};margin-bottom:8px">
      <div style="text-align:right;margin-bottom:18px"><button data-act="goForgot" style="background:none;border:none;color:#22D3EE;font-size:12.5px;cursor:pointer;padding:0">${t.forgot}</button></div>
      <button data-act="doLogin" class="hl hl-g" style="width:100%;background:#2EE6A6;color:#04140A;border:none;font-size:15px;font-weight:800;padding:13px;border-radius:11px;cursor:pointer">${t.login}</button>
      <div style="display:flex;align-items:center;gap:12px;margin:16px 0">
        <span style="flex:1;height:1px;background:rgba(229,231,235,.1)"></span>
        <span style="font-size:11px;color:#6B7280;font-weight:700">${t.orLabel}</span>
        <span style="flex:1;height:1px;background:rgba(229,231,235,.1)"></span>
      </div>
      <button data-act="doLogin" class="hl" style="width:100%;background:#fff;color:#1f2937;border:none;font-size:14px;font-weight:700;padding:12px;border-radius:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z"></path><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"></path><path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.8-6.1z"></path><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.4-5.5l-7.5-5.8c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.7-3.9-13.6-9.3l-7.8 6.1C6.5 42.6 14.6 48 24 48z"></path></svg>${t.googleCta}</button>
      <div style="text-align:center;margin-top:18px;font-size:13.5px;color:#9CA3AF">${t.noAccount} <button data-act="goSignup" style="background:none;border:none;color:#2EE6A6;font-weight:700;cursor:pointer;font-size:13.5px;padding:0">${t.signup}</button></div>`;
  } else if (tab === 'signup') {
    inner = `
      <div style="${GROT};font-size:22px;font-weight:700;margin-bottom:4px">${t.createAccount}</div>
      <div style="font-size:13.5px;color:#9CA3AF;margin-bottom:22px">${t.signupSub}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div><label style="display:block;font-size:12.5px;font-weight:700;color:#9CA3AF;margin-bottom:6px" for="su-user">${t.username}</label>
        <input id="su-user" type="text" placeholder="satsdripper" class="inp" style="${INPUT}"></div>
        <div><label style="display:block;font-size:12.5px;font-weight:700;color:#9CA3AF;margin-bottom:6px" for="su-country">${t.country}</label>
        <select id="su-country" style="${INPUT};padding:12px 10px;font-size:14px;outline:none"><option>Colombia</option><option>México</option><option>España</option><option>United States</option><option>Argentina</option><option>Other</option></select></div>
      </div>
      <label style="display:block;font-size:12.5px;font-weight:700;color:#9CA3AF;margin-bottom:6px" for="su-email">Email</label>
      <input id="su-email" type="email" placeholder="you@example.com" class="inp" style="${INPUT};margin-bottom:14px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div><label style="display:block;font-size:12.5px;font-weight:700;color:#9CA3AF;margin-bottom:6px" for="su-pass">${t.password}</label>
        <input id="su-pass" type="password" placeholder="••••••••" class="inp" style="${INPUT}"></div>
        <div><label style="display:block;font-size:12.5px;font-weight:700;color:#9CA3AF;margin-bottom:6px" for="su-pass2">${t.confirmPassword}</label>
        <input id="su-pass2" type="password" placeholder="••••••••" class="inp" style="${INPUT}"></div>
      </div>
      <label style="display:block;font-size:12.5px;font-weight:700;color:#9CA3AF;margin-bottom:6px" for="su-ref">${t.referralCode} <span style="color:#4B5563;font-weight:500">(${t.optional})</span></label>
      <input id="su-ref" type="text" placeholder="FZ-XXXXXX" class="inp-p" style="${INPUT};border-color:rgba(124,58,237,.25);${MONO};margin-bottom:16px">
      <label style="display:flex;gap:10px;align-items:flex-start;font-size:12.5px;color:#9CA3AF;margin-bottom:10px;cursor:pointer"><input type="checkbox" style="margin-top:2px;accent-color:#2EE6A6"> <span>${t.acceptTerms}</span></label>
      <label style="display:flex;gap:10px;align-items:flex-start;font-size:12.5px;color:#9CA3AF;margin-bottom:20px;cursor:pointer"><input type="checkbox" style="margin-top:2px;accent-color:#2EE6A6"> <span>${t.acceptAge}</span></label>
      <button data-act="doSignup" class="hl hl-g" style="width:100%;background:#2EE6A6;color:#04140A;border:none;font-size:15px;font-weight:800;padding:13px;border-radius:11px;cursor:pointer">${t.createAccount}</button>
      <div style="text-align:center;margin-top:18px;font-size:13.5px;color:#9CA3AF">${t.haveAccount} <button data-act="goLogin" style="background:none;border:none;color:#2EE6A6;font-weight:700;cursor:pointer;font-size:13.5px;padding:0">${t.login}</button></div>`;
  } else if (tab === 'forgot') {
    inner = `
      <div style="${GROT};font-size:22px;font-weight:700;margin-bottom:4px">${t.resetPassword}</div>
      <div style="font-size:13.5px;color:#9CA3AF;margin-bottom:22px">${t.resetSub}</div>
      <input type="email" placeholder="you@example.com" class="inp" style="${INPUT};margin-bottom:16px">
      <button data-act="goLogin" style="width:100%;background:#22D3EE;color:#04252b;border:none;font-size:15px;font-weight:800;padding:13px;border-radius:11px;cursor:pointer">${t.sendResetLink}</button>
      <div style="text-align:center;margin-top:18px"><button data-act="goLogin" style="background:none;border:none;color:#9CA3AF;font-size:13px;cursor:pointer;padding:0">← ${t.backToLogin}</button></div>`;
  } else if (tab === 'verify') {
    var digits = ['4','8','2','9','1','7'].map(function(d){ return `<div style="width:44px;height:52px;background:#0A0E17;border:1px solid rgba(57,255,136,.3);border-radius:10px;display:grid;place-items:center;${MONO};font-size:22px;color:#2EE6A6">${d}</div>`; }).join('');
    inner = `
      <div style="text-align:center">
        <div style="width:64px;height:64px;border-radius:50%;background:rgba(34,211,238,.12);display:grid;place-items:center;font-size:28px;margin:0 auto 18px">✉️</div>
        <div style="${GROT};font-size:21px;font-weight:700;margin-bottom:8px">${t.verifyEmail}</div>
        <div style="font-size:13.5px;color:#9CA3AF;margin-bottom:22px;line-height:1.6">${t.verifySub}</div>
        <div style="display:flex;gap:10px;justify-content:center;margin-bottom:22px">${digits}</div>
        <button data-act="doVerify" style="width:100%;background:#2EE6A6;color:#04140A;border:none;font-size:15px;font-weight:800;padding:13px;border-radius:11px;cursor:pointer">${t.confirmCode}</button>
        <div style="margin-top:14px;font-size:12.5px;color:#6B7280">${t.resendHint}</div>
      </div>`;
  } else if (tab === '2fa') {
    inner = `
      <div style="text-align:center">
        <div style="width:64px;height:64px;border-radius:50%;background:rgba(124,58,237,.14);display:grid;place-items:center;font-size:28px;margin:0 auto 18px">🔐</div>
        <div style="${GROT};font-size:21px;font-weight:700;margin-bottom:8px">${t.twoFactor}</div>
        <div style="font-size:13.5px;color:#9CA3AF;margin-bottom:22px;line-height:1.6">${t.twoFactorSub}</div>
        <input type="text" inputmode="numeric" maxlength="6" placeholder="000000" class="inp-p" style="width:200px;box-sizing:border-box;background:#0A0E17;border:1px solid rgba(124,58,237,.4);border-radius:10px;padding:14px;color:#E5E7EB;font-size:22px;${MONO};text-align:center;letter-spacing:.3em;margin-bottom:18px">
        <button data-act="do2fa" style="width:100%;background:#7C3AED;color:#fff;border:none;font-size:15px;font-weight:800;padding:13px;border-radius:11px;cursor:pointer">${t.verify}</button>
        <div style="margin-top:14px;font-size:12.5px;color:#6B7280">${t.recoveryHint}</div>
      </div>`;
  }
  return `
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px;background:radial-gradient(ellipse 60% 45% at 50% 0%,rgba(34,211,238,.06),transparent),#080B12">
    <div style="width:100%;max-width:420px;animation:fadeUp .4s ease both">
      <div style="text-align:center;margin-bottom:28px"><a href="index.html"><img src="assets/logo-white.png" alt="Fauzet" style="height:52px"></a></div>
      <div style="${CARD};border-radius:18px;padding:30px 28px;box-shadow:0 24px 70px rgba(0,0,0,.5)">${inner}</div>
      <p style="text-align:center;font-size:11.5px;color:#4B5563;margin-top:18px;line-height:1.6">${t.authFooter}</p>
    </div>
  </div>`;
}

// ============ ONBOARDING ============
function vOnboarding(S, t) {
  var es = S.lang === 'es';
  var steps = fzObSteps(es);
  var ob = steps[S.obStep] || steps[0];
  var dots = [0,1,2,3,4].map(function(i){ return `<div style="flex:1;height:4px;border-radius:2px;background:${i <= S.obStep ? '#2EE6A6' : 'rgba(229,231,235,.1)'};transition:background .3s ease"></div>`; }).join('');
  var earnGrid = '';
  if (S.obStep === 2) {
    var opts = [
      { icon: '💧', label: 'Faucet', bg: 'rgba(34,211,238,.08)', border: 'rgba(34,211,238,.3)' },
      { icon: '🎮', label: es ? 'Juegos' : 'Games', bg: 'rgba(57,255,136,.08)', border: 'rgba(57,255,136,.3)' },
      { icon: '⛏️', label: es ? 'Minería' : 'Mining', bg: 'rgba(57,255,136,.08)', border: 'rgba(57,255,136,.3)' },
      { icon: '🎯', label: es ? 'Misiones' : 'Missions', bg: 'rgba(124,58,237,.1)', border: 'rgba(124,58,237,.35)' }
    ];
    earnGrid = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:26px">' + opts.map(function(o){
      return `<button style="background:${o.bg};border:1px solid ${o.border};border-radius:12px;padding:14px;color:#E5E7EB;font-size:13.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:10px"><span style="font-size:18px">${o.icon}</span> ${o.label}</button>`;
    }).join('') + '</div>';
  }
  var welcome = S.obStep === 4 ? `
    <div style="background:rgba(57,255,136,.08);border:1px solid rgba(57,255,136,.3);border-radius:14px;padding:20px;margin-bottom:26px">
      <div style="${MONO};font-size:30px;color:#2EE6A6;font-weight:600">+100 ZYXE</div>
      <div style="font-size:12px;color:#6B7280;margin-top:6px">${t.promoTag}</div>
    </div>` : '';
  var skipBtn = S.obStep < 4 ? `<button data-act="obSkip" style="background:none;border:1px solid rgba(229,231,235,.14);color:#9CA3AF;font-size:14px;font-weight:700;padding:12px 24px;border-radius:11px;cursor:pointer">${t.skip}</button>` : '';
  return `
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px">
    <div style="width:100%;max-width:520px;animation:popIn .3s ease both">
      <div style="display:flex;gap:8px;margin-bottom:28px" aria-label="Progress">${dots}</div>
      <div style="${CARD};border-radius:18px;padding:38px 34px;text-align:center;min-height:340px;display:flex;flex-direction:column;justify-content:center">
        <div style="font-size:52px;margin-bottom:18px">${ob.icon}</div>
        <div style="${GROT};font-size:24px;font-weight:700;margin-bottom:12px">${ob.title}</div>
        <div style="font-size:14.5px;color:#9CA3AF;line-height:1.65;margin-bottom:26px;max-width:400px;margin-left:auto;margin-right:auto">${ob.desc}</div>
        ${earnGrid}${welcome}
        <div style="display:flex;gap:12px;justify-content:center">
          ${skipBtn}
          <button data-act="obNext" class="hl" style="background:#2EE6A6;color:#04140A;border:none;font-size:14px;font-weight:800;padding:12px 32px;border-radius:11px;cursor:pointer">${S.obStep >= 4 ? t.finish : t.next}</button>
        </div>
      </div>
      <div style="text-align:center;margin-top:16px;font-size:12px;color:#4B5563">${(S.lang === 'es' ? 'Paso ' : 'Step ') + (S.obStep + 1)} / 5</div>
    </div>
  </div>`;
}

// ============ SHELL ============
function vShell(S, t) {
  var es = S.lang === 'es';
  var sidebar = '';
  if (!S.isMobile) {
    var items = fzNavDefs(es, S.faucet.status === 'ready').map(function(n){
      var active = S.screen === n.id;
      var badge = n.badge ? `<span style="margin-left:auto;background:rgba(57,255,136,.15);color:#2EE6A6;font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:6px">${n.badge}</span>` : '';
      return `<button data-act="nav" data-i="${n.id}" class="hnav" style="display:flex;align-items:center;gap:12px;background:${active ? 'rgba(57,255,136,.1)' : 'transparent'};border:none;border-radius:10px;padding:10px 12px;color:${active ? '#2EE6A6' : '#9CA3AF'};font-size:13.5px;font-weight:700;cursor:pointer;text-align:left;width:100%"><span style="font-size:16px;width:20px;text-align:center">${n.icon}</span> ${n.label}${badge}</button>`;
    }).join('');
    sidebar = `
    <aside style="width:232px;flex:none;background:#0A0E17;border-right:1px solid rgba(229,231,235,.06);display:flex;flex-direction:column;position:sticky;top:0;height:100vh;overflow-y:auto">
      <div style="padding:20px 20px 14px"><a href="index.html"><img src="assets/logo-white.png" alt="Fauzet" style="height:34px"></a></div>
      <nav style="flex:1;padding:6px 12px;display:flex;flex-direction:column;gap:2px" aria-label="Main">${items}</nav>
      <div style="padding:14px 12px;border-top:1px solid rgba(229,231,235,.06)">
        <div style="background:#111827;border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px">
          <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#22D3EE,#7C3AED);display:grid;place-items:center;font-weight:800;font-size:14px;color:#fff">M</div>
          <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:800">Mateo</div><div style="font-size:11px;color:#2EE6A6">${t.verified} · Lv 3</div></div>
          <button data-act="doLogout" title="Log out" class="hdim" style="background:none;border:none;color:#6B7280;cursor:pointer;font-size:15px;padding:4px">⏻</button>
        </div>
        <a href="admin.html" style="display:block;text-align:center;margin-top:10px;font-size:11px;color:#4B5563;font-weight:700">Admin console (demo) →</a>
      </div>
    </aside>`;
  }
  var bottomNav = '';
  if (S.isMobile) {
    var mItems = [
      { id: 'dashboard', icon: '⬒', label: es ? 'Panel' : 'Home' },
      { id: 'faucet', icon: '💧', label: 'Faucet' },
      { id: 'games', icon: '🎮', label: es ? 'Juegos' : 'Games' },
      { id: 'mining', icon: '⛏️', label: es ? 'Minería' : 'Mining' },
      { id: 'wallet', icon: '💠', label: 'Wallet' }
    ].map(function(n){
      return `<button data-act="nav" data-i="${n.id}" style="background:none;border:none;color:${S.screen === n.id ? '#2EE6A6' : '#6B7280'};cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 10px;min-width:44px;min-height:44px"><span style="font-size:19px">${n.icon}</span><span style="font-size:10px;font-weight:800">${n.label}</span></button>`;
    }).join('');
    bottomNav = `<nav style="position:sticky;bottom:0;z-index:40;background:rgba(10,14,23,.96);backdrop-filter:blur(12px);border-top:1px solid rgba(229,231,235,.08);display:flex;justify-content:space-around;padding:8px 4px calc(8px + env(safe-area-inset-bottom))" aria-label="Mobile">${mItems}</nav>`;
  }
  var mainPad = S.isMobile ? '18px 14px 90px' : '28px 28px 48px';
  return `
  <div style="display:flex;min-height:100vh">
    ${sidebar}
    <div style="flex:1;min-width:0;display:flex;flex-direction:column">
      <header style="position:sticky;top:0;z-index:40;background:rgba(8,11,18,.9);backdrop-filter:blur(12px);border-bottom:1px solid rgba(229,231,235,.06);padding:0 20px;height:60px;display:flex;align-items:center;gap:14px">
        ${S.isMobile ? '<img src="assets/logo-white.png" alt="Fauzet" style="height:28px">' : ''}
        <div style="flex:1"></div>
        <div style="display:flex;align-items:center;gap:8px;background:#111827;border:1px solid rgba(229,231,235,.08);border-radius:999px;padding:6px 14px">
          <img src="assets/coin-zyxe.png" alt="ZYXE" style="width:16px;height:16px;border-radius:50%;display:block">
          <span id="tb-balance" style="${MONO};font-size:13px;font-weight:600">${fmt(S.balances.available)}</span>
          <span style="font-size:11px;color:#2EE6A6;font-weight:800">ZYXE</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;background:#111827;border:1px solid rgba(229,231,235,.08);border-radius:999px;padding:6px 12px" title="Energy">
          <span style="font-size:12px">⚡</span>
          <span id="tb-energy" style="${MONO};font-size:12.5px;color:#22D3EE">${S.energy}/100</span>
        </div>
        <button data-act="toggleLang" class="hbc" style="background:none;border:1px solid rgba(229,231,235,.12);color:#9CA3AF;border-radius:8px;padding:6px 10px;${MONO};font-size:11.5px;cursor:pointer">${es ? 'ES · EN' : 'EN · ES'}</button>
        <button data-act="toggleNotif" aria-label="Notifications" class="hbc" style="position:relative;background:none;border:1px solid rgba(229,231,235,.12);color:#E5E7EB;border-radius:8px;width:34px;height:34px;cursor:pointer;font-size:15px">🔔<span style="position:absolute;top:-4px;right:-4px;background:#7C3AED;color:#fff;font-size:9.5px;font-weight:800;border-radius:8px;padding:1px 5px">3</span></button>
      </header>
      <main id="screenRoot" style="flex:1;padding:${mainPad};max-width:1160px;width:100%;margin:0 auto;box-sizing:border-box">${vScreen(S, t)}</main>
      ${bottomNav}
    </div>
  </div>`;
}

function vScreen(S, t) {
  switch (S.screen) {
    case 'dashboard': return vDashboard(S, t);
    case 'faucet': return vFaucet(S, t);
    case 'games': return vGames(S, t);
    case 'missions': return vMissions(S, t);
    case 'mining': return vMining(S, t);
    case 'store': return vStore(S, t);
    case 'wallet': return vWallet(S, t);
    case 'vault': return vVault(S, t);
    case 'crew': return vCrew(S, t);
    case 'trading': return vTrading(S, t);
    case 'convert': return vConvert(S, t);
    case 'withdraw': return vWithdraw(S, t);
    case 'profile': return vProfile(S, t);
    case 'support': return vSupport(S, t);
    default: return `<div style="text-align:center;padding:80px 20px;color:#6B7280"><div style="font-size:40px;margin-bottom:14px">🛠️</div><div style="font-size:15px">${t.comingSoon}</div></div>`;
  }
}

// ============ DASHBOARD ============
function vDashboard(S, t) {
  var es = S.lang === 'es';
  var f = S.faucet;
  var total = S.balances.available + S.balances.pending + S.balances.locked + S.balances.promo;
  var two = S.isMobile ? '1fr' : '1fr 1fr';
  var buckets = [
    { label: t.available, value: fmt(S.balances.available), dot: '#2EE6A6' },
    { label: t.pending, value: fmt(S.balances.pending), dot: '#22D3EE' },
    { label: t.locked, value: fmt(S.balances.locked), dot: '#7C3AED' },
    { label: t.eligibleConv, value: fmt(S.balances.eligible), dot: '#E5E7EB' }
  ].map(function(b){
    return `<div style="background:#0A0E17;border-radius:10px;padding:10px 14px"><div style="font-size:11px;color:#6B7280;display:flex;align-items:center;gap:6px"><span style="width:6px;height:6px;border-radius:50%;background:${b.dot}"></span>${b.label}</div><div style="${MONO};font-size:15px;margin-top:3px">${b.value}</div></div>`;
  }).join('');
  var faucetInner = f.status === 'ready'
    ? `<div style="font-size:15px;font-weight:700;color:#2EE6A6">${t.faucetReady}</div>`
    : `<div style="${MONO};font-size:24px">${t.nextClaim} <span class="js-cd">${fzCd(f.secs)}</span></div>`;
  var qa = [
    { icon: '💧', label: 'Claim', go: 'faucet' },
    { icon: '🎮', label: es ? 'Jugar' : 'Play', go: 'games' },
    { icon: '⛏️', label: es ? 'Minar' : 'Mine', go: 'mining' },
    { icon: '🎯', label: es ? 'Misiones' : 'Missions', go: 'missions' },
    { icon: '🚀', label: 'Boosts', go: 'store' },
    { icon: '🏦', label: 'Vault', go: 'vault' },
    { icon: '🔄', label: es ? 'Convertir' : 'Convert', go: 'convert' },
    { icon: '📤', label: es ? 'Retirar' : 'Withdraw', go: 'withdraw' }
  ].map(function(q){
    return `<button data-act="nav" data-i="${q.go}" class="hcard" style="${CARD};border-radius:12px;padding:14px 8px;color:#E5E7EB;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:7px"><span style="font-size:20px">${q.icon}</span><span style="font-size:12px;font-weight:700">${q.label}</span></button>`;
  }).join('');
  var dp = [
    { label: es ? 'Claims completados' : 'Claims completed', value: f.claimsToday + '/8', pct: (f.claimsToday / 8 * 100) + '%', color: '#22D3EE' },
    { label: es ? 'Juegos jugados' : 'Games played', value: '2/5', pct: '40%', color: '#2EE6A6' },
    { label: es ? 'Misiones completadas' : 'Missions completed', value: '3/6', pct: '50%', color: '#7C3AED' },
    { label: es ? 'ZYXEs ganados hoy' : 'ZYXEs earned today', value: '+223', pct: '62%', color: '#2EE6A6' }
  ].map(function(d){
    return `<div><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px"><span style="color:#9CA3AF">${d.label}</span><span style="${MONO}">${d.value}</span></div><div style="height:5px;background:rgba(229,231,235,.07);border-radius:3px;overflow:hidden"><div style="width:${d.pct};height:100%;background:${d.color};border-radius:3px"></div></div></div>`;
  }).join('');
  var dm = [
    { icon: '💧', title: es ? 'Reclama 5 veces hoy' : 'Claim 5 times today', pct: '60%', reward: 30 },
    { icon: '🎮', title: es ? 'Gana 50 ZYXE en juegos' : 'Earn 50 ZYXE from games', pct: '48%', reward: 40 },
    { icon: '⛏️', title: es ? 'Mantén 100+ GH/s por 24h' : 'Keep 100+ GH/s for 24h', pct: '85%', reward: 60 }
  ].map(function(m){
    return `<div style="display:flex;align-items:center;gap:12px;background:#0A0E17;border-radius:10px;padding:10px 14px"><span style="font-size:17px">${m.icon}</span><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.title}</div><div style="height:4px;background:rgba(229,231,235,.07);border-radius:2px;margin-top:5px;overflow:hidden"><div style="width:${m.pct};height:100%;background:#22D3EE;border-radius:2px"></div></div></div><span style="${MONO};font-size:12px;color:#2EE6A6;flex:none">+${m.reward}</span></div>`;
  }).join('');
  var txRows = S.txs.slice(0, 5).map(function(tx){
    return `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid rgba(229,231,235,.05)"><span style="width:30px;height:30px;flex:none;border-radius:8px;display:grid;place-items:center;font-size:14px;background:rgba(34,211,238,.08)">${tx.icon}</span><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700">${tx.label}</div><div style="font-size:11px;color:#6B7280">${tx.time} · <span style="color:${tx.statusColor}">${tx.status}</span></div></div><span style="${MONO};font-size:13px;color:${tx.amtColor}">${tx.amount}</span></div>`;
  }).join('');
  return `
  <div style="animation:fadeUp .3s ease both">
    <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:20px">
      <h1 style="${GROT};font-size:24px;margin:0;letter-spacing:-.01em">${t.hiMateo}</h1>
      <span style="font-size:12.5px;color:#6B7280">${t.demoNote}</span>
    </div>
    <div style="${CARD};border-radius:16px;padding:22px 24px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px">
        <div>
          <div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280;margin-bottom:6px">${t.totalBalance}</div>
          <div style="${MONO};font-size:34px;font-weight:600">${fmt(total)} <span style="font-size:15px;color:#2EE6A6">ZYXE</span></div>
          <div style="font-size:12px;color:#6B7280;margin-top:4px">${t.estRef}: ≈ $3.52 USD <span style="color:#4B5563">· ${t.notGuaranteed}</span></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(130px,1fr));gap:8px">${buckets}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:${two};gap:16px;margin-bottom:16px">
      <div style="background:#111827;border:1px solid rgba(57,255,136,.2);border-radius:16px;padding:20px 22px;display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280">💧 FAUCET</span><span style="font-size:11.5px;color:#22D3EE;${MONO}">${t.streak} ${f.streak}🔥</span></div>
        ${faucetInner}
        <button data-act="nav" data-i="faucet" class="hl" style="background:${f.status === 'ready' ? '#2EE6A6' : 'rgba(229,231,235,.08)'};color:${f.status === 'ready' ? '#04140A' : '#9CA3AF'};border:none;font-size:14px;font-weight:800;padding:12px;border-radius:10px;cursor:pointer">${f.status === 'ready' ? t.claimZyxes : (S.lang === 'es' ? 'Ver faucet' : 'View faucet')}</button>
        <div style="font-size:11.5px;color:#6B7280">${t.rewardRange}: 5–25 ZYXE · ${f.claimsToday}/8 ${t.claimsToday}</div>
      </div>
      <div style="${CARD};border-radius:16px;padding:20px 22px;display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280">⛏️ ${t.mining}</span><span style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:#2EE6A6;font-weight:700"><span style="width:6px;height:6px;border-radius:50%;background:#2EE6A6;animation:pulseDot 2s ease infinite"></span>${t.active}</span></div>
        <div style="display:flex;gap:20px;flex-wrap:wrap">
          <div><div style="font-size:11px;color:#6B7280">${t.hashpower}</div><div style="${MONO};font-size:19px">${fzTotalHash(S)} GH/s</div></div>
          <div><div style="font-size:11px;color:#6B7280">${t.estDaily}</div><div style="${MONO};font-size:19px;color:#2EE6A6">~184 ZYXE</div></div>
          <div><div style="font-size:11px;color:#6B7280">${t.poolShare}</div><div style="${MONO};font-size:19px">0.074%</div></div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#6B7280;margin-bottom:5px"><span>${t.energy}</span><span>${S.energy}/100</span></div>
          <div style="height:6px;background:rgba(229,231,235,.08);border-radius:3px;overflow:hidden"><div style="width:${S.energy}%;height:100%;background:linear-gradient(90deg,#22D3EE,#2EE6A6);border-radius:3px"></div></div>
        </div>
        <button data-act="nav" data-i="mining" class="hgreen-soft" style="background:rgba(57,255,136,.1);border:1px solid rgba(57,255,136,.3);color:#2EE6A6;font-size:13px;font-weight:800;padding:10px;border-radius:10px;cursor:pointer">${t.openMining}</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:16px">${qa}</div>
    <div style="display:grid;grid-template-columns:${two};gap:16px;margin-bottom:16px">
      <div style="${CARD};border-radius:16px;padding:20px 22px"><div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280;margin-bottom:14px">${t.dailyProgress}</div><div style="display:flex;flex-direction:column;gap:12px">${dp}</div></div>
      <div style="${CARD};border-radius:16px;padding:20px 22px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><span style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280">${t.activeMissions}</span><button data-act="nav" data-i="missions" style="background:none;border:none;color:#22D3EE;font-size:12px;font-weight:700;cursor:pointer;padding:0">${t.viewAll} →</button></div>
        <div style="display:flex;flex-direction:column;gap:10px">${dm}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:${S.isMobile ? '1fr' : '1.4fr 1fr'};gap:16px">
      <div style="${CARD};border-radius:16px;padding:20px 22px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><span style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280">${t.recentActivity}</span><button data-act="nav" data-i="wallet" style="background:none;border:none;color:#22D3EE;font-size:12px;font-weight:700;cursor:pointer;padding:0">${t.viewAll} →</button></div>
        <div style="display:flex;flex-direction:column">${txRows}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="background:#111827;border:1px solid rgba(124,58,237,.22);border-radius:16px;padding:20px 22px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><span style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280">👥 MINING CREW</span><button data-act="nav" data-i="crew" style="background:none;border:none;color:#7C3AED;font-size:12px;font-weight:700;cursor:pointer;padding:0">${t.viewAll} →</button></div>
          <div style="display:flex;gap:18px">
            <div><div style="${MONO};font-size:20px">12</div><div style="font-size:11px;color:#6B7280">${t.totalCrew}</div></div>
            <div><div style="${MONO};font-size:20px;color:#2EE6A6">7</div><div style="font-size:11px;color:#6B7280">${t.activeCrew}</div></div>
            <div><div style="${MONO};font-size:20px;color:#7C3AED">+86</div><div style="font-size:11px;color:#6B7280">${t.thisWeek}</div></div>
          </div>
        </div>
        <div style="background:linear-gradient(135deg,rgba(124,58,237,.14),rgba(34,211,238,.06));border:1px solid rgba(124,58,237,.3);border-radius:16px;padding:20px 22px">
          <div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#c4a5f5;margin-bottom:6px">⚡ ${t.seasonEvent}</div>
          <div style="font-size:14.5px;font-weight:800;margin-bottom:4px">Hash Season 02</div>
          <div style="font-size:12px;color:#9CA3AF;margin-bottom:12px">${t.seasonDesc}</div>
          <button data-act="nav" data-i="missions" class="hpurple" style="background:#7C3AED;color:#fff;border:none;font-size:12.5px;font-weight:800;padding:9px 18px;border-radius:9px;cursor:pointer">${t.joinEvent}</button>
        </div>
      </div>
    </div>
  </div>`;
}

// ============ FAUCET ============
function vFaucet(S, t) {
  var es = S.lang === 'es';
  var f = S.faucet;
  var two = S.isMobile ? '1fr' : '1fr 1fr';
  var main = '';
  if (f.status === 'ready') {
    var needsCaptcha = !f.captchaOk && f.claimsToday >= 3;
    main = `
      <div style="font-size:15px;font-weight:800;color:#2EE6A6;margin-bottom:6px">${t.faucetReadyLong}</div>
      <div style="${MONO};font-size:44px;font-weight:600;margin-bottom:8px">5–25 <span style="font-size:18px;color:#2EE6A6">ZYXE</span></div>
      <div style="font-size:12.5px;color:#6B7280;margin-bottom:22px">${t.rewardRange} · ${t.bonusMult}: <span style="color:#22D3EE">×1.2</span> (${t.streak} ${f.streak})</div>
      ${needsCaptcha ? `<div data-act="solveCaptcha" style="max-width:340px;margin:0 auto 18px;background:#0A0E17;border:1px solid rgba(229,231,235,.12);border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px;cursor:pointer"><span style="width:22px;height:22px;border:2px solid #22D3EE;border-radius:5px;display:inline-block"></span><span style="font-size:13.5px;color:#9CA3AF">${t.captchaLabel}</span></div>`
        : `<button data-act="doClaim" class="hl2" style="background:#2EE6A6;color:#04140A;border:none;font-size:17px;font-weight:800;padding:16px 52px;border-radius:13px;cursor:pointer">${t.claimZyxes}</button>`}`;
  } else if (f.status === 'claiming') {
    main = `<div style="width:56px;height:56px;margin:0 auto 16px;border:3px solid rgba(57,255,136,.2);border-top-color:#2EE6A6;border-radius:50%;animation:spin 1s linear infinite"></div><div style="font-size:14px;color:#9CA3AF">${t.claimValidating}</div>`;
  } else if (f.status === 'claimed') {
    main = `
      <div style="position:relative;overflow:visible">
        <div style="font-size:42px;margin-bottom:8px">💧</div>
        <div style="${MONO};font-size:40px;font-weight:600;color:#2EE6A6;margin-bottom:6px">+${f.lastAmount} ZYXE</div>
        <div style="font-size:13px;color:#9CA3AF;margin-bottom:6px">${t.claimApproved}</div>
        <div style="font-size:12px;color:#6B7280;margin-bottom:20px">${t.nextClaim} <span class="js-cd" style="${MONO};color:#22D3EE">${fzCd(f.secs)}</span></div>
        <button data-act="nav" data-i="dashboard" style="background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);color:#22D3EE;font-size:13.5px;font-weight:800;padding:11px 26px;border-radius:11px;cursor:pointer">${t.backToDashboard}</button>
      </div>`;
  } else {
    main = `
      <div style="font-size:13px;font-weight:800;color:#6B7280;letter-spacing:.08em;margin-bottom:10px">${t.faucetCooling}</div>
      <div class="js-cd" style="${MONO};font-size:52px;font-weight:600;color:#22D3EE;margin-bottom:14px">${fzCd(f.secs)}</div>
      <div style="font-size:12.5px;color:#6B7280">${t.nextClaimHint}</div>`;
  }
  var slots = [];
  for (var i = 0; i < 8; i++) slots.push(`<div style="flex:1;height:8px;border-radius:4px;background:${i < f.claimsToday ? '#2EE6A6' : 'rgba(229,231,235,.08)'}"></div>`);
  var hist = f.history.map(function(ch){
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(229,231,235,.05);font-size:13px"><span style="color:#9CA3AF">${ch.time}</span><span style="font-size:11.5px;font-weight:700;color:${ch.statusColor}">${ch.status}</span><span style="${MONO};color:#2EE6A6">+${ch.amount} ZYXE</span></div>`;
  }).join('');
  return `
  <div style="animation:fadeUp .3s ease both;max-width:760px;margin:0 auto">
    <h1 style="${GROT};font-size:24px;margin:0 0 20px;letter-spacing:-.01em">💧 Faucet</h1>
    <div style="background:#111827;border:1px solid rgba(57,255,136,.22);border-radius:18px;padding:34px;text-align:center;margin-bottom:16px">${main}</div>
    <div style="display:grid;grid-template-columns:${two};gap:16px;margin-bottom:16px">
      <div style="${CARD};border-radius:14px;padding:18px 20px">
        <div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280;margin-bottom:12px">${t.dailyClaims}</div>
        <div style="display:flex;gap:6px;margin-bottom:8px">${slots.join('')}</div>
        <div style="font-size:12.5px;color:#9CA3AF">${f.claimsToday}/8 ${t.claimsToday} · ${t.limitResets}</div>
      </div>
      <div style="${CARD};border-radius:14px;padding:18px 20px">
        <div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280;margin-bottom:12px">${t.streakBonus}</div>
        <div style="display:flex;align-items:center;gap:14px"><span style="font-size:30px">🔥</span><div><div style="${MONO};font-size:20px">${f.streak} ${t.days}</div><div style="font-size:12px;color:#6B7280">${t.streakHint}</div></div></div>
      </div>
    </div>
    <div style="${CARD};border-radius:14px;padding:18px 20px">
      <div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280;margin-bottom:12px">${t.claimHistory}</div>
      <div style="display:flex;flex-direction:column">${hist}</div>
    </div>
  </div>`;
}

// ============ GAMES ============
function vGames(S, t) {
  var es = S.lang === 'es';
  var cats = [
    { id: 'all', label: es ? 'Todos' : 'All' },
    { id: 'quick', label: es ? 'Rápidos' : 'Quick' },
    { id: 'skill', label: es ? 'Habilidad' : 'Skill' },
    { id: 'daily', label: es ? 'Desafío diario' : 'Daily challenge' },
    { id: 'premium', label: 'Premium' }
  ].map(function(c){
    var on = S.gameCat === c.id;
    return `<button data-act="gameCat" data-i="${c.id}" style="background:${on ? 'rgba(57,255,136,.12)' : '#111827'};border:1px solid ${on ? 'rgba(57,255,136,.4)' : 'rgba(229,231,235,.1)'};color:${on ? '#2EE6A6' : '#9CA3AF'};font-size:12.5px;font-weight:700;padding:8px 16px;border-radius:999px;cursor:pointer">${c.label}</button>`;
  }).join('');
  var cards = fzGameDefs(es).filter(function(g){ return S.gameCat === 'all' || g.cat === S.gameCat; }).map(function(g){
    var cta = g.playable
      ? `<button data-act="openGame" data-i="${g.id}" class="hl" style="background:#2EE6A6;color:#04140A;border:none;font-size:13px;font-weight:800;padding:10px;border-radius:9px;cursor:pointer">${g.cta || (es ? 'Jugar' : 'Play')}</button>`
      : `<div style="background:rgba(229,231,235,.05);border:1px solid rgba(229,231,235,.1);color:#6B7280;font-size:12px;font-weight:700;padding:10px;border-radius:9px;text-align:center">${g.blockedCta}</div>`;
    return `
    <div class="hgame" style="${CARD};border-radius:16px;overflow:hidden;display:flex;flex-direction:column">
      <div style="height:96px;display:grid;place-items:center;font-size:38px;background:${g.bg}">${g.icon}</div>
      <div style="padding:16px 18px;flex:1;display:flex;flex-direction:column">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px"><span style="font-weight:800;font-size:15px">${g.name}</span><span style="font-size:10px;font-weight:800;letter-spacing:.05em;color:${g.diffColor};border:1px solid ${g.diffColor};border-radius:6px;padding:2px 7px">${g.diff}</span></div>
        <div style="color:#9CA3AF;font-size:12.5px;line-height:1.5;margin-bottom:10px;flex:1">${g.desc}</div>
        <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#6B7280;margin-bottom:6px"><span>⚡ ${g.energy}</span><span>⏱ ${g.duration}</span><span style="${MONO};color:#2EE6A6">${g.reward}</span></div>
        <div style="font-size:11px;color:#4B5563;margin-bottom:12px">${es ? 'Tu mejor' : 'Your best'}: <span style="${MONO};color:#9CA3AF">${g.best}</span></div>
        ${cta}
      </div>
    </div>`;
  }).join('');
  return `
  <div style="animation:fadeUp .3s ease both">
    <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:18px">
      <h1 style="${GROT};font-size:24px;margin:0;letter-spacing:-.01em">🎮 ${es ? 'Centro de juegos' : 'Games hub'}</h1>
      <span style="font-size:12.5px;color:#6B7280">⚡ ${S.energy}/100 · ${es ? 'cada juego cuesta energía' : 'each game costs energy'}</span>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">${cats}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px">${cards}</div>
  </div>`;
}

// ============ MISSIONS ============
function vMissions(S, t) {
  var es = S.lang === 'es';
  var streakDots = ['M','T','W','T','F','S','S'].map(function(d, i){
    return `<div style="width:22px;height:22px;border-radius:6px;display:grid;place-items:center;font-size:10px;background:${i < 6 ? 'rgba(57,255,136,.16)' : 'rgba(229,231,235,.06)'};color:${i < 6 ? '#2EE6A6' : '#4B5563'};font-weight:800">${d}</div>`;
  }).join('');
  var tabs = [
    { id: 'all', label: es ? 'Todas' : 'All' },
    { id: 'daily', label: es ? 'Diarias' : 'Daily' },
    { id: 'weekly', label: es ? 'Semanales' : 'Weekly' },
    { id: 'mining', label: es ? 'Minería' : 'Mining' },
    { id: 'referral', label: 'Crew' },
    { id: 'premium', label: 'Premium' }
  ].map(function(c){
    var on = S.missionTab === c.id;
    return `<button data-act="missionTab" data-i="${c.id}" style="background:${on ? 'rgba(124,58,237,.14)' : '#111827'};border:1px solid ${on ? 'rgba(124,58,237,.45)' : 'rgba(229,231,235,.1)'};color:${on ? '#c4a5f5' : '#9CA3AF'};font-size:12.5px;font-weight:700;padding:8px 16px;border-radius:999px;cursor:pointer">${c.label}</button>`;
  }).join('');
  var list = fzMissionDefs(es).filter(function(m){ return S.missionTab === 'all' || m.cat === S.missionTab; }).map(function(m){
    var done = m.cur >= m.goal, claimed = S.claimedMissions.indexOf(m.id) !== -1;
    var right = (done && !claimed)
      ? `<button data-act="claimMission" data-i="${m.id}" class="hl" style="background:#2EE6A6;color:#04140A;border:none;font-size:12px;font-weight:800;padding:8px 18px;border-radius:8px;cursor:pointer">${es ? 'Reclamar' : 'Claim'}</button>`
      : `<span style="font-size:11.5px;color:#6B7280;font-weight:700">${claimed ? (es ? 'Completada' : 'Completed') : (es ? 'En progreso' : 'In progress')}</span>`;
    return `
    <div style="background:#111827;border:1px solid ${done && !claimed ? 'rgba(57,255,136,.35)' : 'rgba(229,231,235,.08)'};border-radius:14px;padding:16px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <span style="width:42px;height:42px;flex:none;border-radius:11px;display:grid;place-items:center;font-size:19px;background:${m.premium ? 'rgba(124,58,237,.16)' : 'rgba(34,211,238,.1)'}">${m.icon}</span>
      <div style="flex:1;min-width:200px">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:3px"><span style="font-size:14px;font-weight:800">${m.title}</span><span style="font-size:9.5px;font-weight:800;letter-spacing:.06em;color:${m.premium ? '#c4a5f5' : '#22D3EE'};background:${m.premium ? 'rgba(124,58,237,.15)' : 'rgba(34,211,238,.1)'};padding:2px 7px;border-radius:5px">${claimed ? (es ? 'COMPLETADA' : 'COMPLETED') : m.cat.toUpperCase()}</span></div>
        <div style="font-size:12px;color:#6B7280;margin-bottom:7px">${m.req} · ${m.expires}</div>
        <div style="display:flex;align-items:center;gap:10px"><div style="flex:1;max-width:260px;height:5px;background:rgba(229,231,235,.07);border-radius:3px;overflow:hidden"><div style="width:${Math.min(100, m.cur / m.goal * 100)}%;height:100%;background:${done ? '#2EE6A6' : '#22D3EE'};border-radius:3px"></div></div><span style="${MONO};font-size:11.5px;color:#9CA3AF">${m.cur}/${m.goal}</span></div>
      </div>
      <div style="text-align:right;flex:none"><div style="${MONO};font-size:15px;color:#2EE6A6;margin-bottom:8px">+${m.reward} ZYXE</div>${right}</div>
    </div>`;
  }).join('');
  return `
  <div style="animation:fadeUp .3s ease both">
    <h1 style="${GROT};font-size:24px;margin:0 0 18px;letter-spacing:-.01em">🎯 ${es ? 'Centro de misiones' : 'Mission center'}</h1>
    <div style="display:grid;grid-template-columns:${S.isMobile ? '1fr' : '1fr 1fr'};gap:16px;margin-bottom:18px">
      <div style="${CARD};border-radius:14px;padding:18px 20px;display:flex;align-items:center;gap:16px">
        <span style="font-size:30px">🔥</span>
        <div style="flex:1"><div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280">${es ? 'RACHA DIARIA' : 'DAILY STREAK'}</div><div style="${MONO};font-size:20px">6 ${es ? 'días' : 'days'}</div></div>
        <div style="display:flex;gap:5px">${streakDots}</div>
      </div>
      <div style="background:#111827;border:1px solid rgba(124,58,237,.25);border-radius:14px;padding:18px 20px;display:flex;align-items:center;gap:16px">
        <span style="font-size:30px">🏅</span>
        <div style="flex:1"><div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280">${es ? 'LOGROS' : 'ACHIEVEMENTS'}</div><div style="font-size:14px;font-weight:700">First Claim · Crew Starter · Miner I</div></div>
        <span style="${MONO};color:#7C3AED;font-size:18px">3/24</span>
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">${tabs}</div>
    <div style="display:flex;flex-direction:column;gap:12px">${list}</div>
  </div>`;
}

// ============ MINING ============
function vMining(S, t) {
  var es = S.lang === 'es';
  var stats = [
    { label: 'HASHPOWER', value: fzTotalHash(S) + ' GH/s', color: '#E5E7EB' },
    { label: es ? 'MINEROS ACTIVOS' : 'ACTIVE MINERS', value: S.miners.length + '/4', color: '#E5E7EB' },
    { label: es ? 'EFICIENCIA' : 'EFFICIENCY', value: '92%', color: '#22D3EE' },
    { label: es ? 'POOL DIARIO' : 'DAILY POOL', value: '250K ZYXE', color: '#E5E7EB' },
    { label: es ? 'EST. HOY' : 'EST. TODAY', value: '~184 ZYXE', color: '#2EE6A6' }
  ].map(function(st){
    return `<div style="${CARD};border-radius:13px;padding:16px 18px"><div style="font-size:11px;color:#6B7280;font-weight:700;margin-bottom:5px">${st.label}</div><div style="${MONO};font-size:19px;color:${st.color}">${st.value}</div></div>`;
  }).join('');
  var miners = S.miners.map(function(m){
    var needsRepair = m.durability < 40;
    var repairBtn = needsRepair ? `<button data-act="repairMiner" data-i="${m.id}" style="flex:1;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35);color:#f59e0b;font-size:11.5px;font-weight:800;padding:9px;border-radius:8px;cursor:pointer">🔧 ${es ? 'Reparar' : 'Repair'} · ${m.repairCost}</button>` : '';
    return `
    <div style="background:#111827;border:1px solid ${needsRepair ? 'rgba(245,158,11,.35)' : 'rgba(229,231,235,.08)'};border-radius:15px;padding:18px 20px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <span style="width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-size:22px;background:#0A0E17">${m.icon}</span>
        <div style="flex:1"><div style="font-weight:800;font-size:14.5px">${m.name} <span style="font-size:10px;color:${m.tierColor};font-weight:800;margin-left:4px">${m.tier}</span></div><div style="font-size:11.5px;color:#6B7280">Lv ${m.level} · ${m.hash} GH/s · ${m.energyUse}⚡/h</div></div>
        <span style="font-size:10px;font-weight:800;letter-spacing:.05em;color:${needsRepair ? '#f59e0b' : '#2EE6A6'};background:${needsRepair ? 'rgba(245,158,11,.12)' : 'rgba(57,255,136,.1)'};padding:3px 8px;border-radius:6px">${needsRepair ? (es ? 'MANTENIMIENTO' : 'MAINTENANCE') : (es ? 'ACTIVO' : 'ACTIVE')}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:14px">
        <div><div style="display:flex;justify-content:space-between;font-size:10.5px;color:#6B7280;margin-bottom:3px"><span>${es ? 'Durabilidad' : 'Durability'}</span><span>${m.durability}%</span></div><div style="height:4px;background:rgba(229,231,235,.07);border-radius:2px;overflow:hidden"><div style="width:${m.durability}%;height:100%;background:${needsRepair ? '#f59e0b' : '#2EE6A6'};border-radius:2px"></div></div></div>
        <div><div style="display:flex;justify-content:space-between;font-size:10.5px;color:#6B7280;margin-bottom:3px"><span>${es ? 'Eficiencia' : 'Efficiency'}</span><span>${m.eff}%</span></div><div style="height:4px;background:rgba(229,231,235,.07);border-radius:2px;overflow:hidden"><div style="width:${m.eff}%;height:100%;background:#22D3EE;border-radius:2px"></div></div></div>
      </div>
      <div style="display:flex;gap:8px">
        <button data-act="upgradeMiner" data-i="${m.id}" class="hgreen-soft" style="flex:1;background:rgba(57,255,136,.1);border:1px solid rgba(57,255,136,.3);color:#2EE6A6;font-size:11.5px;font-weight:800;padding:9px;border-radius:8px;cursor:pointer">⬆ ${es ? 'Mejorar' : 'Upgrade'} · ${m.upgradeCost}</button>
        ${repairBtn}
      </div>
    </div>`;
  }).join('');
  var ranking = [
    { pos: '#1', posColor: '#2EE6A6', name: 'hashqueen', weight: 700, hash: '2,410' },
    { pos: '#2', posColor: '#22D3EE', name: 'drip_lord', weight: 700, hash: '1,982' },
    { pos: '#3', posColor: '#7C3AED', name: 'zyxe_max', weight: 700, hash: '1,760' },
    { pos: '#214', posColor: '#9CA3AF', name: 'Mateo (' + (es ? 'tú' : 'you') + ')', weight: 800, hash: String(fzTotalHash(S)) }
  ].map(function(rk){
    return `<div style="display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid rgba(229,231,235,.05);font-size:13px"><span style="${MONO};color:${rk.posColor};width:28px">${rk.pos}</span><span style="flex:1;font-weight:${rk.weight}">${rk.name}</span><span style="${MONO};color:#9CA3AF">${rk.hash} GH/s</span></div>`;
  }).join('');
  return `
  <div style="animation:fadeUp .3s ease both">
    <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:18px">
      <h1 style="${GROT};font-size:24px;margin:0;letter-spacing:-.01em">⛏️ ${es ? 'Sala de minería' : 'Mining room'}</h1>
      <span style="display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:#2EE6A6;font-weight:700"><span style="width:7px;height:7px;border-radius:50%;background:#2EE6A6;animation:pulseDot 2s ease infinite"></span>${es ? 'Minería activa' : 'Mining is active'}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px">${stats}</div>
    <div style="background:rgba(34,211,238,.05);border:1px solid rgba(34,211,238,.18);border-radius:13px;padding:14px 18px;margin-bottom:20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <span style="font-size:16px">ℹ️</span>
      <span style="${MONO};font-size:12.5px;color:#9CA3AF">${es ? 'recompensa = (tu hashpower válido ÷ hashpower total de la red) × pool diario — estimado, no garantizado' : 'reward = (your valid hashpower ÷ total network hashpower) × daily pool — estimated, not guaranteed'}</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h2 style="${GROT};font-size:17px;margin:0">${es ? 'Tus mineros' : 'Your miners'}</h2>
      <button data-act="nav" data-i="store" class="hpurple-soft" style="background:rgba(124,58,237,.12);border:1px solid rgba(124,58,237,.35);color:#c4a5f5;font-size:12.5px;font-weight:800;padding:8px 16px;border-radius:9px;cursor:pointer">+ ${es ? 'Comprar minero' : 'Buy miner'}</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-bottom:20px">${miners}</div>
    <div style="display:grid;grid-template-columns:${S.isMobile ? '1fr' : '1fr 1fr'};gap:16px">
      <div style="${CARD};border-radius:14px;padding:18px 20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><span style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280">⚡ ${es ? 'GESTIÓN DE ENERGÍA' : 'ENERGY MANAGEMENT'}</span><span style="${MONO};font-size:13px;color:#22D3EE">${S.energy}/100</span></div>
        <div style="height:8px;background:rgba(229,231,235,.07);border-radius:4px;overflow:hidden;margin-bottom:14px"><div style="width:${S.energy}%;height:100%;background:linear-gradient(90deg,#22D3EE,#2EE6A6);border-radius:4px"></div></div>
        <div style="font-size:12px;color:#6B7280;margin-bottom:14px">${es ? 'Tus mineros consumen 12⚡/h. Con la energía actual: ~5h de operación.' : 'Your miners consume 12⚡/h. At current energy: ~5h of operation.'}</div>
        <button data-act="restoreEnergy" class="hcyan-soft" style="width:100%;background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);color:#22D3EE;font-size:13px;font-weight:800;padding:11px;border-radius:10px;cursor:pointer">${es ? 'Restaurar energía' : 'Restore energy'} · 80 ZYXE</button>
      </div>
      <div style="${CARD};border-radius:14px;padding:18px 20px">
        <div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280;margin-bottom:14px">🏆 ${es ? 'RANKING DE MINERÍA' : 'MINING RANKING'}</div>
        <div style="display:flex;flex-direction:column">${ranking}</div>
      </div>
    </div>
  </div>`;
}

// ============ STORE ============
function vStore(S, t) {
  var es = S.lang === 'es';
  var items = fzStoreDefs(es).map(function(it){
    var afford = S.balances.available >= it.price;
    return `
    <div class="hcard3" style="background:#111827;border:1px solid ${it.border};border-radius:15px;padding:20px;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <span style="width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-size:21px;background:${it.iconBg}">${it.icon}</span>
        <span style="font-size:9.5px;font-weight:800;letter-spacing:.06em;color:${it.tagColor};border:1px solid ${it.tagColor};padding:2px 8px;border-radius:6px">${it.tag}</span>
      </div>
      <div style="font-weight:800;font-size:15px;margin-bottom:4px">${it.name}</div>
      <div style="font-size:12.5px;color:#9CA3AF;line-height:1.5;margin-bottom:10px;flex:1">${it.desc}</div>
      <div style="font-size:11px;color:#6B7280;margin-bottom:12px">${it.meta}</div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="${MONO};font-size:16px;color:#E5E7EB">${it.price} <span style="font-size:11px;color:#2EE6A6">ZYXE</span></span>
        <button data-act="buyItem" data-i="${it.id}" class="hl" style="background:${afford ? '#2EE6A6' : 'rgba(229,231,235,.08)'};color:${afford ? '#04140A' : '#6B7280'};border:none;font-size:12px;font-weight:800;padding:9px 20px;border-radius:8px;cursor:pointer">${es ? 'Comprar' : 'Buy'}</button>
      </div>
    </div>`;
  }).join('');
  return `
  <div style="animation:fadeUp .3s ease both">
    <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:18px">
      <h1 style="${GROT};font-size:24px;margin:0;letter-spacing:-.01em">🚀 ${es ? 'Tienda de boosts' : 'Boost store'}</h1>
      <span style="font-size:12.5px;color:#6B7280">${es ? 'Disponible' : 'Available'}: <span style="${MONO};color:#2EE6A6">${fmt(S.balances.available)} ZYXE</span></span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px">${items}</div>
    <p style="font-size:11.5px;color:#4B5563;margin-top:20px;line-height:1.6">${es ? 'Las compras son finales y no reembolsables salvo error de la plataforma. Los efectos, límites y duraciones se muestran antes de confirmar. Del importe gastado: 40% se quema, 40% vuelve a pools de recompensas y 20% pasa a tesorería.' : 'Purchases are final and non-refundable except for platform errors. Effects, limits and durations are shown before you confirm. Of each spend: 40% is burned, 40% returns to reward pools, 20% goes to treasury.'}</p>
  </div>`;
}

// ============ WALLET ============
function vWallet(S, t) {
  var es = S.lang === 'es';
  var buckets = [
    { label: es ? 'DISPONIBLE' : 'AVAILABLE', value: fmt(S.balances.available), accent: '#2EE6A6', note: es ? 'utilizable ahora' : 'usable now' },
    { label: es ? 'PENDIENTE' : 'PENDING', value: fmt(S.balances.pending), accent: '#22D3EE', note: es ? 'en validación' : 'being validated' },
    { label: es ? 'BLOQUEADO' : 'LOCKED', value: fmt(S.balances.locked), accent: '#7C3AED', note: 'Vault' },
    { label: es ? 'ELEGIBLE' : 'ELIGIBLE', value: fmt(S.balances.eligible), accent: '#E5E7EB', note: es ? 'para conversión' : 'for conversion' },
    { label: es ? 'PROMOCIONAL' : 'PROMOTIONAL', value: fmt(S.balances.promo), accent: '#f59e0b', note: es ? 'no retirable' : 'not withdrawable' },
    { label: es ? 'VALOR REF.' : 'REF. VALUE', value: '≈ $3.52', accent: '#4B5563', note: es ? 'no garantizado' : 'not guaranteed' }
  ].map(function(wb){
    return `<div style="${CARD};border-top:2px solid ${wb.accent};border-radius:13px;padding:16px 18px"><div style="font-size:11px;color:#6B7280;font-weight:700;margin-bottom:5px">${wb.label}</div><div style="${MONO};font-size:18px">${wb.value}</div><div style="font-size:10.5px;color:#4B5563;margin-top:3px">${wb.note}</div></div>`;
  }).join('');
  var filters = [
    { id: 'all', label: es ? 'Todo' : 'All' }, { id: 'faucet', label: 'Faucet' }, { id: 'games', label: es ? 'Juegos' : 'Games' },
    { id: 'mining', label: es ? 'Minería' : 'Mining' }, { id: 'crew', label: 'Crew' }, { id: 'purchases', label: es ? 'Compras' : 'Purchases' }
  ].map(function(fl){
    var on = S.txFilter === fl.id;
    return `<button data-act="txFilter" data-i="${fl.id}" style="background:${on ? 'rgba(34,211,238,.12)' : 'transparent'};border:1px solid ${on ? 'rgba(34,211,238,.4)' : 'rgba(229,231,235,.1)'};color:${on ? '#22D3EE' : '#6B7280'};font-size:11px;font-weight:700;padding:5px 12px;border-radius:999px;cursor:pointer">${fl.label}</button>`;
  }).join('');
  var rows = fzWalletTxDefs().filter(function(tx){ return S.txFilter === 'all' || tx.cat === S.txFilter; }).map(function(tx){
    var stColor = tx.status === 'CONFIRMED' ? '#2EE6A6' : tx.status === 'PENDING' ? '#22D3EE' : tx.status === 'REJECTED' ? '#f87171' : '#f59e0b';
    var stBg = tx.status === 'CONFIRMED' ? 'rgba(57,255,136,.1)' : tx.status === 'PENDING' ? 'rgba(34,211,238,.1)' : tx.status === 'REJECTED' ? 'rgba(248,113,113,.1)' : 'rgba(245,158,11,.1)';
    var amtColor = tx.amount.charAt(0) === '-' ? '#f87171' : tx.status === 'CONFIRMED' ? '#2EE6A6' : '#9CA3AF';
    return `
    <div style="display:flex;align-items:center;gap:14px;padding:11px 0;border-bottom:1px solid rgba(229,231,235,.05);flex-wrap:wrap">
      <span style="width:34px;height:34px;flex:none;border-radius:9px;display:grid;place-items:center;font-size:15px;background:rgba(34,211,238,.08)">${tx.icon}</span>
      <div style="flex:1;min-width:150px"><div style="font-size:13.5px;font-weight:700">${tx.label}</div><div style="font-size:11px;color:#6B7280;${MONO}">${tx.ref} · ${tx.date}</div></div>
      <span style="font-size:10.5px;font-weight:800;letter-spacing:.04em;color:${stColor};background:${stBg};padding:3px 9px;border-radius:6px;flex:none">${tx.status}</span>
      <div style="text-align:right;flex:none;min-width:100px"><div style="${MONO};font-size:14px;color:${amtColor}">${tx.amount}</div><div style="font-size:10.5px;color:#4B5563">${es ? 'saldo' : 'balance'}: ${tx.after}</div></div>
    </div>`;
  }).join('');
  return `
  <div style="animation:fadeUp .3s ease both">
    <h1 style="${GROT};font-size:24px;margin:0 0 18px;letter-spacing:-.01em">💠 ${es ? 'Wallet ZYXE' : 'ZYXE Wallet'}</h1>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:18px">${buckets}</div>
    <div style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap">
      <button data-act="nav" data-i="convert" class="hl" style="background:#2EE6A6;color:#04140A;border:none;font-size:13px;font-weight:800;padding:11px 22px;border-radius:10px;cursor:pointer">🔄 ${es ? 'Convertir' : 'Convert'}</button>
      <button data-act="nav" data-i="withdraw" class="hcyan-soft" style="background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);color:#22D3EE;font-size:13px;font-weight:800;padding:11px 22px;border-radius:10px;cursor:pointer">📤 ${es ? 'Retirar' : 'Withdraw'}</button>
      <button data-act="nav" data-i="vault" class="hpurple-soft" style="background:rgba(124,58,237,.12);border:1px solid rgba(124,58,237,.35);color:#c4a5f5;font-size:13px;font-weight:800;padding:11px 22px;border-radius:10px;cursor:pointer">🏦 ${es ? 'Abrir Vault' : 'Open Vault'}</button>
    </div>
    <div style="${CARD};border-radius:16px;padding:20px 22px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        <span style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280">${es ? 'HISTORIAL DE TRANSACCIONES' : 'TRANSACTION HISTORY'}</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${filters}</div>
      </div>
      <div style="display:flex;flex-direction:column">${rows}</div>
    </div>
  </div>`;
}

// ============ VAULT ============
function vVault(S, t) {
  var es = S.lang === 'es';
  var v = S.vault;
  var meta = FZ_VAULT_PERIODS_META;
  var pos = '';
  if (v.position) {
    pos = `
    <div style="background:linear-gradient(135deg,rgba(124,58,237,.14),#111827);border:1px solid rgba(124,58,237,.4);border-radius:16px;padding:22px 24px;margin-bottom:18px">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:14px;align-items:center">
        <div>
          <div style="font-size:11px;font-weight:800;letter-spacing:.1em;color:#c4a5f5;margin-bottom:5px">${es ? 'BLOQUEO ACTIVO' : 'ACTIVE LOCK'}</div>
          <div style="${MONO};font-size:26px">${fmt(v.position.amount)} ZYXE</div>
          <div style="font-size:12px;color:#9CA3AF;margin-top:4px">${v.position.periodName} · ${v.position.mult} · ${es ? 'desbloqueo' : 'unlocks'} ${v.position.end}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:#6B7280">${es ? 'Recompensa estimada' : 'Est. reward'}</div>
          <div style="${MONO};font-size:20px;color:#2EE6A6">~9.4 ZYXE</div>
          <div style="font-size:10.5px;color:#6B7280">${es ? 'no garantizado' : 'not guaranteed'}</div>
        </div>
      </div>
    </div>`;
  }
  var periodNames = ['Flexible', es ? '7 días' : '7 days', es ? '30 días' : '30 days', es ? '90 días' : '90 days'];
  var periods = periodNames.map(function(name, i){
    var on = v.period === i;
    return `<button data-act="vaultPeriod" data-i="${i}" style="background:${on ? 'rgba(124,58,237,.16)' : '#0A0E17'};border:1px solid ${on ? 'rgba(124,58,237,.55)' : 'rgba(229,231,235,.1)'};border-radius:10px;padding:12px;cursor:pointer;text-align:center"><div style="font-size:13px;font-weight:800;color:${on ? '#E5E7EB' : '#9CA3AF'}">${name}</div><div style="${MONO};font-size:15px;color:#c4a5f5;margin-top:2px">${meta.multLabels[i]}</div></button>`;
  }).join('');
  var quote = (v.amount * 0.011 * meta.mults[v.period]).toFixed(1);
  return `
  <div style="animation:fadeUp .3s ease both;max-width:860px;margin:0 auto">
    <h1 style="${GROT};font-size:24px;margin:0 0 6px;letter-spacing:-.01em">🏦 ZYXE Vault</h1>
    <p style="font-size:13px;color:#6B7280;margin:0 0 20px">${es ? 'Bloquea ZYXEs y participa en un pool de recompensas variable. Sin rendimiento garantizado.' : 'Lock ZYXEs and share a variable reward pool. No guaranteed yield.'}</p>
    ${pos}
    <div style="display:grid;grid-template-columns:${S.isMobile ? '1fr' : '1fr 1fr'};gap:16px;margin-bottom:18px">
      <div style="${CARD};border-radius:16px;padding:22px">
        <div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280;margin-bottom:14px">${es ? 'NUEVO BLOQUEO' : 'NEW LOCK'}</div>
        <label style="display:block;font-size:12px;color:#9CA3AF;margin-bottom:6px" for="vault-amt">${es ? 'Monto' : 'Amount'} <span style="color:#4B5563">· ${es ? 'disponible' : 'available'}: ${fmt(S.balances.available)}</span></label>
        <input id="vault-amt" data-input="vaultAmount" type="number" value="${v.amount}" class="inp-p" style="${INPUT};border-color:rgba(124,58,237,.3);font-size:16px;${MONO};margin-bottom:14px">
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:16px">${periods}</div>
        <div style="background:#0A0E17;border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;flex-direction:column;gap:6px;font-size:12.5px">
          <div style="display:flex;justify-content:space-between"><span style="color:#6B7280">${es ? 'Recompensa estimada' : 'Est. reward'}</span><span id="vq-reward" style="${MONO};color:#2EE6A6">~${quote} ZYXE</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:#6B7280">${es ? 'Peso en el pool' : 'Pool weight'}</span><span style="${MONO}">${meta.multLabels[v.period]}</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:#6B7280">${es ? 'Fecha de desbloqueo' : 'Unlock date'}</span><span style="${MONO}">${meta.unlocks[v.period]}</span></div>
        </div>
        <button data-act="openVaultConfirm" class="hl hpurple" style="width:100%;background:#7C3AED;color:#fff;border:none;font-size:14px;font-weight:800;padding:13px;border-radius:11px;cursor:pointer">${es ? 'Bloquear ZYXEs' : 'Lock ZYXEs'}</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="${CARD};border-radius:16px;padding:22px">
          <div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280;margin-bottom:14px">${es ? 'ESTADÍSTICAS DEL POOL' : 'POOL STATISTICS'}</div>
          <div style="display:flex;flex-direction:column;gap:10px;font-size:13px">
            <div style="display:flex;justify-content:space-between"><span style="color:#6B7280">${es ? 'Pool del periodo' : 'Period pool'}</span><span style="${MONO}">120,000 ZYXE</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:#6B7280">${es ? 'Total bloqueado (red)' : 'Total locked (network)'}</span><span style="${MONO}">8.4M ZYXE</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:#6B7280">${es ? 'Tu participación' : 'Your share'}</span><span style="${MONO};color:#c4a5f5">0.008%</span></div>
          </div>
        </div>
        <div style="background:rgba(124,58,237,.06);border:1px solid rgba(124,58,237,.22);border-radius:16px;padding:18px 20px">
          <div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#c4a5f5;margin-bottom:8px">⚠ ${es ? 'Reglas y riesgos' : 'Rules & risks'}</div>
          <ul style="margin:0;padding-left:18px;font-size:12px;color:#9CA3AF;line-height:1.7">
            <li>${es ? 'Las recompensas son variables y dependen del pool del periodo — nunca garantizadas.' : 'Rewards are variable and depend on the period pool — never guaranteed.'}</li>
            <li>${es ? 'El desbloqueo anticipado elimina el multiplicador y puede aplicar una penalización de hasta 5%.' : 'Early unlock removes the multiplier and may apply a penalty of up to 5%.'}</li>
            <li>${es ? 'Los parámetros (pools, multiplicadores, plazos) son configurables y pueden cambiar entre periodos.' : 'Parameters (pools, multipliers, terms) are configurable and may change between periods.'}</li>
          </ul>
        </div>
      </div>
    </div>
  </div>`;
}

// ============ CREW ============
function vCrew(S, t) {
  var es = S.lang === 'es';
  var levels = fzCrewLevels().map(function(cl){
    return `
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <span style="width:34px;height:34px;flex:none;border-radius:9px;display:grid;place-items:center;background:rgba(124,58,237,${cl.alpha});color:#c4a5f5;${MONO};font-size:12.5px;font-weight:600">L${cl.level}</span>
      <div style="flex:1;min-width:120px"><div style="height:22px;background:rgba(229,231,235,.05);border-radius:6px;overflow:hidden;position:relative"><div style="width:${cl.barPct};height:100%;background:linear-gradient(90deg,rgba(124,58,237,.7),rgba(124,58,237,.35));border-radius:6px"></div><span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:700">${cl.members} ${es ? 'miembros' : 'members'}</span></div></div>
      <span style="${MONO};font-size:13px;color:#c4a5f5;width:44px;text-align:right">${cl.pct}</span>
      <span style="${MONO};font-size:13px;color:#2EE6A6;width:80px;text-align:right">+${cl.earned} ZYXE</span>
    </div>`;
  }).join('');
  var act = fzCrewActivity(es).map(function(ca){
    return `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid rgba(229,231,235,.05);font-size:13px;flex-wrap:wrap"><span style="width:30px;height:30px;flex:none;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#22D3EE);display:grid;place-items:center;font-size:11px;font-weight:800;color:#fff">${ca.initial}</span><span style="font-weight:700">${ca.name}</span><span style="font-size:10.5px;color:#c4a5f5;background:rgba(124,58,237,.12);padding:2px 8px;border-radius:5px">L${ca.level}</span><span style="flex:1;color:#9CA3AF;min-width:140px">${ca.action}</span><span style="font-size:10.5px;font-weight:800;color:${ca.stColor}">${ca.status}</span><span style="${MONO};color:#2EE6A6">+${ca.amount}</span></div>`;
  }).join('');
  return `
  <div style="animation:fadeUp .3s ease both">
    <h1 style="${GROT};font-size:24px;margin:0 0 6px;letter-spacing:-.01em">👥 Mining Crew</h1>
    <p style="font-size:13px;color:#6B7280;margin:0 0 20px">${es ? 'Cuatro niveles de recompensas por la actividad válida de tu red. Nada se paga por solo registrarse.' : 'Four levels of rewards from your network’s valid activity. Nothing is paid for registrations alone.'}</p>
    <div style="display:grid;grid-template-columns:${S.isMobile ? '1fr' : '1fr 1fr'};gap:16px;margin-bottom:18px">
      <div style="background:#111827;border:1px solid rgba(124,58,237,.25);border-radius:16px;padding:22px">
        <div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280;margin-bottom:12px">${es ? 'TU ENLACE DE INVITACIÓN' : 'YOUR INVITE LINK'}</div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <div style="flex:1;background:#0A0E17;border:1px solid rgba(124,58,237,.3);border-radius:10px;padding:12px 14px;${MONO};font-size:13.5px;color:#c4a5f5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">fauzet.io/r/FZ-MATEO7</div>
          <button data-act="copyRef" class="hpurple" style="background:#7C3AED;color:#fff;border:none;font-size:12.5px;font-weight:800;padding:0 18px;border-radius:10px;cursor:pointer">${es ? 'Copiar' : 'Copy'}</button>
        </div>
        <div style="display:flex;gap:8px">
          <button data-act="copyRef" style="flex:1;background:rgba(229,231,235,.05);border:1px solid rgba(229,231,235,.1);color:#9CA3AF;font-size:12px;font-weight:700;padding:9px;border-radius:9px;cursor:pointer">✈ Telegram</button>
          <button data-act="copyRef" style="flex:1;background:rgba(229,231,235,.05);border:1px solid rgba(229,231,235,.1);color:#9CA3AF;font-size:12px;font-weight:700;padding:9px;border-radius:9px;cursor:pointer">𝕏 Post</button>
          <button data-act="copyRef" style="flex:1;background:rgba(229,231,235,.05);border:1px solid rgba(229,231,235,.1);color:#9CA3AF;font-size:12px;font-weight:700;padding:9px;border-radius:9px;cursor:pointer">▦ QR</button>
        </div>
      </div>
      <div style="${CARD};border-radius:16px;padding:22px;display:grid;grid-template-columns:repeat(2,1fr);gap:14px">
        <div><div style="font-size:11px;color:#6B7280">${t.totalCrew}</div><div style="${MONO};font-size:24px">12</div></div>
        <div><div style="font-size:11px;color:#6B7280">${t.activeCrew}</div><div style="${MONO};font-size:24px;color:#2EE6A6">7</div></div>
        <div><div style="font-size:11px;color:#6B7280">${es ? 'Inactivos' : 'Inactive'}</div><div style="${MONO};font-size:24px;color:#6B7280">5</div></div>
        <div><div style="font-size:11px;color:#6B7280">${es ? 'ZYXE ganados' : 'ZYXE earned'}</div><div style="${MONO};font-size:24px;color:#7C3AED">438</div></div>
      </div>
    </div>
    <div style="${CARD};border-radius:16px;padding:22px;margin-bottom:18px">
      <div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280;margin-bottom:16px">${es ? 'GANANCIAS POR NIVEL' : 'EARNINGS BY LEVEL'}</div>
      <div style="display:flex;flex-direction:column;gap:8px">${levels}</div>
      <div style="font-size:11px;color:#4B5563;margin-top:14px">${es ? 'Las recompensas de crew se basan en actividad válida de la plataforma y pueden estar sujetas a verificación, límites y controles antifraude. No se calculan comisiones sobre comisiones.' : 'Crew rewards are based on valid platform activity and may be subject to verification, limits and anti-fraud controls. Commissions are never calculated on other commissions.'}</div>
    </div>
    <div style="${CARD};border-radius:16px;padding:22px">
      <div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280;margin-bottom:14px">${es ? 'ACTIVIDAD RECIENTE DEL CREW' : 'RECENT CREW ACTIVITY'}</div>
      <div style="display:flex;flex-direction:column">${act}</div>
    </div>
  </div>`;
}

// ============ TRADING ============
function fzChartPoints(S, area) {
  var seed = S.pair * 7 + S.timeframe * 13 + 5;
  var v = 110, x = 0, pts = [];
  for (var i = 0; i <= 60; i++) {
    var r = Math.sin(seed + i * 1.7) * 14 + Math.sin(seed * 2 + i * 0.6) * 9;
    v = Math.max(30, Math.min(190, 110 + r));
    x = i * 10;
    pts.push(x + ',' + Math.round(220 - v));
  }
  if (area) return '0,220 ' + pts.join(' ') + ' 600,220';
  return pts.join(' ');
}

function vTrading(S, t) {
  var es = S.lang === 'es';
  var pairs = FZ_PAIRS.map(function(label, i){
    var on = S.pair === i;
    return `<button data-act="pickPair" data-i="${i}" style="background:${on ? 'rgba(34,211,238,.12)' : '#111827'};border:1px solid ${on ? 'rgba(34,211,238,.45)' : 'rgba(229,231,235,.1)'};color:${on ? '#22D3EE' : '#9CA3AF'};${MONO};font-size:12px;font-weight:600;padding:8px 14px;border-radius:9px;cursor:pointer">${label}</button>`;
  }).join('');
  var tfs = ['1H','1D','1W','1M'].map(function(label, i){
    var on = S.timeframe === i;
    return `<button data-act="pickTf" data-i="${i}" style="background:${on ? 'rgba(34,211,238,.14)' : 'transparent'};border:none;color:${on ? '#22D3EE' : '#6B7280'};${MONO};font-size:11px;padding:5px 10px;border-radius:6px;cursor:pointer">${label}</button>`;
  }).join('');
  var change = FZ_PAIR_CHANGES[S.pair];
  var fee = Math.round(S.tradeAmount * 0.005);
  var net = S.tradeAmount * 0.995 * FZ_PAIR_RATES[S.pair];
  var receive = net.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') + ' ' + FZ_PAIR_UNITS[S.pair];
  var hist = S.tradeHist.map(function(th){
    return `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(229,231,235,.05);font-size:12px"><span style="color:${th.sideColor};font-weight:800">${th.side}</span><span style="${MONO};color:#9CA3AF">${th.amt}</span><span style="${MONO};color:#6B7280">${th.price}</span><span style="color:#4B5563">${th.time}</span></div>`;
  }).join('');
  var buyOn = S.tradeSide === 'buy';
  return `
  <div style="animation:fadeUp .3s ease both">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <h1 style="${GROT};font-size:24px;margin:0;letter-spacing:-.01em">📈 Microtrading</h1>
      <span style="font-size:10.5px;font-weight:800;letter-spacing:.06em;color:#f59e0b;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);padding:5px 12px;border-radius:7px">${es ? 'SIMULADO · CONTROLADO POR TESORERÍA · NO ES UN EXCHANGE PÚBLICO' : 'SIMULATED · TREASURY-CONTROLLED · NOT A PUBLIC EXCHANGE'}</span>
    </div>
    <div style="background:rgba(245,158,11,.05);border:1px solid rgba(245,158,11,.18);border-radius:11px;padding:11px 16px;margin-bottom:16px;font-size:12px;color:#9CA3AF;line-height:1.5">${es ? 'Este módulo es una interfaz de microtrading simulada/controlada por tesorería. Sin apalancamiento, sin derivados, sin garantía de ganancias. Los precios son de referencia interna y pueden pausarse.' : 'This module is a simulated / treasury-controlled microtrading interface. No leverage, no derivatives, no profit guarantees. Prices are internal reference values and may be paused.'}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">${pairs}</div>
    <div style="display:grid;grid-template-columns:${S.isMobile ? '1fr' : '1.6fr 1fr'};gap:16px">
      <div style="${CARD};border-radius:16px;padding:20px 22px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:6px">
          <div><span style="${MONO};font-size:24px;font-weight:600">${FZ_PAIR_PRICES[S.pair]}</span><span style="${MONO};font-size:13px;color:${change.charAt(0) === '+' ? '#2EE6A6' : '#f87171'};margin-left:10px">${change}</span></div>
          <div style="display:flex;gap:5px">${tfs}</div>
        </div>
        <div style="font-size:11px;color:#6B7280;margin-bottom:14px">Vol 24h: <span style="${MONO}">${FZ_PAIR_VOLS[S.pair]} ZYXE</span> · Spread: <span style="${MONO}">0.8%</span></div>
        <svg viewBox="0 0 600 220" style="width:100%;height:auto;display:block" aria-label="Price chart">
          <polyline points="${fzChartPoints(S, true)}" fill="rgba(34,211,238,.08)" stroke="none"></polyline>
          <polyline points="${fzChartPoints(S, false)}" fill="none" stroke="#22D3EE" stroke-width="2"></polyline>
        </svg>
        <div style="display:flex;justify-content:space-between;${MONO};font-size:10px;color:#4B5563;margin-top:6px"><span>${['09:00', 'Jul 10', 'Jul 04', 'Jun 11'][S.timeframe]}</span><span>${es ? 'ahora' : 'now'}</span></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="${CARD};border-radius:16px;padding:20px">
          <div style="display:flex;gap:8px;margin-bottom:14px">
            <button data-act="setBuySide" style="flex:1;background:${buyOn ? 'rgba(57,255,136,.14)' : 'transparent'};border:1px solid ${buyOn ? 'rgba(57,255,136,.45)' : 'rgba(229,231,235,.1)'};color:${buyOn ? '#2EE6A6' : '#6B7280'};font-size:13px;font-weight:800;padding:10px;border-radius:9px;cursor:pointer">${es ? 'Comprar' : 'Buy'}</button>
            <button data-act="setSellSide" style="flex:1;background:${!buyOn ? 'rgba(248,113,113,.12)' : 'transparent'};border:1px solid ${!buyOn ? 'rgba(248,113,113,.4)' : 'rgba(229,231,235,.1)'};color:${!buyOn ? '#f87171' : '#6B7280'};font-size:13px;font-weight:800;padding:10px;border-radius:9px;cursor:pointer">${es ? 'Vender' : 'Sell'}</button>
          </div>
          <label style="display:block;font-size:12px;color:#9CA3AF;margin-bottom:6px" for="trade-amt">${es ? 'Monto' : 'Amount'} (ZYXE)</label>
          <input id="trade-amt" data-input="tradeAmount" type="number" value="${S.tradeAmount}" class="inp" style="${INPUT};padding:11px 14px;font-size:15px;${MONO};margin-bottom:12px">
          <div style="background:#0A0E17;border-radius:10px;padding:11px 14px;margin-bottom:14px;display:flex;flex-direction:column;gap:5px;font-size:12px">
            <div style="display:flex;justify-content:space-between"><span style="color:#6B7280">${es ? 'Tasa de referencia' : 'Reference rate'}</span><span style="${MONO}">${FZ_PAIR_PRICES[S.pair]}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:#6B7280">${es ? 'Comisión' : 'Fee'} (0.5%)</span><span id="tr-fee" style="${MONO}">${fmt(fee)} ZYXE</span></div>
            <div style="display:flex;justify-content:space-between;font-weight:700"><span style="color:#9CA3AF">${es ? 'Recibes' : 'You receive'}</span><span id="tr-receive" style="${MONO};color:#2EE6A6">${receive}</span></div>
          </div>
          <button data-act="placeOrder" class="hl" style="width:100%;background:${buyOn ? '#2EE6A6' : '#f87171'};color:#04140A;border:none;font-size:13.5px;font-weight:800;padding:12px;border-radius:10px;cursor:pointer">${(buyOn ? (es ? 'Comprar' : 'Buy') : (es ? 'Vender' : 'Sell')) + ' · ' + (es ? 'orden simulada' : 'simulated order')}</button>
        </div>
        <div style="${CARD};border-radius:16px;padding:18px 20px">
          <div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280;margin-bottom:12px">${es ? 'HISTORIAL DE ÓRDENES' : 'ORDER HISTORY'}</div>
          <div style="display:flex;flex-direction:column">${hist}</div>
        </div>
      </div>
    </div>
  </div>`;
}

// ============ CONVERT ============
function vConvert(S, t) {
  var es = S.lang === 'es';
  var assets = FZ_CV_ASSETS.map(function(a, i){
    var on = S.convertAsset === i;
    return `<button data-act="cvAsset" data-i="${i}" style="background:${on ? 'rgba(34,211,238,.1)' : '#0A0E17'};border:1px solid ${on ? 'rgba(34,211,238,.45)' : 'rgba(229,231,235,.1)'};border-radius:11px;padding:12px 8px;cursor:pointer;text-align:center"><img src="${a.img}" alt="" style="width:26px;height:26px;border-radius:50%;display:block;margin:0 auto 5px"><div style="${MONO};font-size:12px;font-weight:700;color:${a.color}">${a.sym}</div><div style="font-size:10.5px;color:#6B7280;margin-top:2px">${a.name}</div></button>`;
  }).join('');
  var q = fzCvQuote(S);
  var success = S.cvDone ? `
    <div style="background:rgba(57,255,136,.06);border:1px solid rgba(57,255,136,.3);border-radius:14px;padding:18px 20px;display:flex;gap:14px;align-items:center;animation:popIn .3s ease both">
      <span style="font-size:24px">✓</span>
      <div><div style="font-size:13.5px;font-weight:800;color:#2EE6A6">${es ? 'Conversión creada' : 'Conversion created'}</div><div style="font-size:12px;color:#9CA3AF;margin-top:3px">${es ? 'Transacción pendiente en el ledger. Verás el crédito en tu balance cripto interno tras la validación de reservas.' : 'Pending ledger transaction created. You’ll see the credit in your internal crypto balance after reserve validation.'}</div></div>
    </div>` : '';
  return `
  <div style="animation:fadeUp .3s ease both;max-width:640px;margin:0 auto">
    <h1 style="${GROT};font-size:24px;margin:0 0 6px;letter-spacing:-.01em">🔄 ${es ? 'Convertir ZYXEs' : 'Convert ZYXEs'}</h1>
    <p style="font-size:13px;color:#6B7280;margin:0 0 20px">${es ? 'Convierte ZYXEs elegibles en criptomonedas soportadas. Revisa las comisiones antes de confirmar.' : 'Convert eligible ZYXEs into supported cryptocurrencies. Review fees before confirming.'}</p>
    <div style="${CARD};border-radius:16px;padding:24px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:16px">
        <span style="color:#6B7280">${es ? 'Elegible' : 'Eligible'}: <span style="${MONO};color:#2EE6A6">${fmt(S.balances.eligible)} ZYXE</span></span>
        <span style="color:#6B7280">${es ? 'No elegible' : 'Not eligible'}: <span style="${MONO};color:#4B5563">${fmt(S.balances.pending + S.balances.promo)}</span></span>
      </div>
      <label style="display:block;font-size:12px;color:#9CA3AF;margin-bottom:6px" for="cv-amt">${es ? 'Monto' : 'Amount'} (ZYXE)</label>
      <input id="cv-amt" data-input="convertAmount" type="number" value="${S.convertAmount}" class="inp" style="${INPUT};padding:13px 14px;font-size:17px;${MONO};margin-bottom:16px">
      <div style="font-size:12px;color:#9CA3AF;margin-bottom:8px">${es ? 'Selecciona el activo' : 'Select asset'}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;margin-bottom:18px">${assets}</div>
      <div style="background:#0A0E17;border-radius:12px;padding:14px 18px;margin-bottom:16px;display:flex;flex-direction:column;gap:7px;font-size:12.5px">
        <div style="display:flex;justify-content:space-between"><span style="color:#6B7280">${es ? 'Tasa de referencia' : 'Reference rate'}</span><span style="${MONO}">1 ZYXE = ${FZ_CV_RATES[S.convertAsset]} ${FZ_CV_UNITS[S.convertAsset]}</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:#6B7280">Spread (1%)</span><span id="cv-spread" style="${MONO}">${q.spread} ZYXE</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:#6B7280">${es ? 'Comisión de red' : 'Network fee'}</span><span style="${MONO}">${FZ_CV_NETFEE_LABELS[S.convertAsset]}</span></div>
        <div style="display:flex;justify-content:space-between;border-top:1px solid rgba(229,231,235,.07);padding-top:7px;font-weight:700"><span style="color:#9CA3AF">${es ? 'Recibes' : 'You receive'}</span><span id="cv-receive" style="${MONO};color:#2EE6A6">${q.receive}</span></div>
      </div>
      <div style="font-size:11.5px;color:#6B7280;margin-bottom:16px">${es ? 'Mínimo 500 · máximo 25,000 ZYXE por día · tiempo estimado: minutos tras validación de elegibilidad y reservas.' : 'Minimum 500 · maximum 25,000 ZYXE per day · estimated time: minutes after eligibility and reserve validation.'}</div>
      <button id="cv-btn" data-act="doConvert" class="hl" style="width:100%;background:${q.valid ? '#2EE6A6' : 'rgba(229,231,235,.08)'};color:${q.valid ? '#04140A' : '#6B7280'};border:none;font-size:14.5px;font-weight:800;padding:14px;border-radius:11px;cursor:pointer">${es ? 'Confirmar conversión' : 'Confirm conversion'}</button>
    </div>
    ${success}
  </div>`;
}

// ============ WITHDRAW ============
function vWithdraw(S, t) {
  var es = S.lang === 'es';
  var step = '';
  if (S.wdStep === 1) {
    var assets = FZ_CV_ASSETS.map(function(a, i){
      var on = S.wdAsset === i;
      return `<button data-act="wdAsset" data-i="${i}" style="background:${on ? 'rgba(34,211,238,.1)' : '#0A0E17'};border:1px solid ${on ? 'rgba(34,211,238,.45)' : 'rgba(229,231,235,.1)'};border-radius:11px;padding:12px 8px;cursor:pointer;text-align:center"><img src="${a.img}" alt="" style="width:26px;height:26px;border-radius:50%;display:block;margin:0 auto 5px"><div style="${MONO};font-size:12px;font-weight:700;color:${a.color}">${a.sym}</div><div style="font-size:10.5px;color:#6B7280;margin-top:2px">${FZ_WD_BALS[i]}</div></button>`;
    }).join('');
    var wq = fzWdQuote(S);
    step = `
    <div style="${CARD};border-radius:16px;padding:24px;margin-bottom:16px">
      <div style="font-size:12px;color:#9CA3AF;margin-bottom:8px">${es ? 'Selecciona el activo' : 'Select asset'}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;margin-bottom:18px">${assets}</div>
      <div style="font-size:12px;color:#9CA3AF;margin-bottom:8px">${es ? 'Wallet de destino' : 'Destination wallet'} <span style="font-size:10.5px;color:#2EE6A6">· ${es ? 'en lista blanca' : 'whitelisted'}</span></div>
      <div style="background:#0A0E17;border:1px solid rgba(57,255,136,.2);border-radius:10px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:10px">
        <span style="color:#2EE6A6;font-size:14px">✓</span>
        <span style="${MONO};font-size:12px;color:#9CA3AF;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">ltc1q8x…k2f4 (Main LTC)</span>
        <button data-act="copyAddr" style="background:none;border:none;color:#22D3EE;font-size:12px;cursor:pointer;font-weight:700">⧉</button>
      </div>
      <button data-act="addWalletToast" class="hdash" style="background:none;border:1px dashed rgba(229,231,235,.2);color:#6B7280;font-size:12px;font-weight:700;padding:10px;border-radius:10px;cursor:pointer;width:100%;margin-bottom:18px">+ ${es ? 'Agregar wallet (espera de seguridad 24h)' : 'Add wallet (24h security wait)'}</button>
      <label style="display:block;font-size:12px;color:#9CA3AF;margin-bottom:6px" for="wd-amt">${es ? 'Monto' : 'Amount'} (ZYXE) <span style="color:#4B5563">· min 1,000 · max 50,000/${es ? 'día' : 'day'}</span></label>
      <input id="wd-amt" data-input="wdAmount" type="number" value="${S.wdAmount}" class="inp" style="${INPUT};padding:13px 14px;font-size:17px;${MONO};margin-bottom:16px">
      <div style="background:#0A0E17;border-radius:12px;padding:14px 18px;margin-bottom:16px;display:flex;flex-direction:column;gap:7px;font-size:12.5px">
        <div style="display:flex;justify-content:space-between"><span style="color:#6B7280">${es ? 'Comisión de red' : 'Network fee'}</span><span style="${MONO}">0.0001 LTC</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:#6B7280">${es ? 'Comisión de servicio' : 'Processing fee'} (1%)</span><span id="wd-fee" style="${MONO}">${wq.fee} ZYXE</span></div>
        <div style="display:flex;justify-content:space-between;border-top:1px solid rgba(229,231,235,.07);padding-top:7px;font-weight:700"><span style="color:#9CA3AF">${es ? 'Recibes' : 'You receive'}</span><span id="wd-receive" style="${MONO};color:#2EE6A6">${wq.receive} LTC</span></div>
      </div>
      <button id="wd-btn" data-act="wdNext" class="hl" style="width:100%;background:${wq.valid ? '#2EE6A6' : 'rgba(229,231,235,.08)'};color:${wq.valid ? '#04140A' : '#6B7280'};border:none;font-size:14.5px;font-weight:800;padding:14px;border-radius:11px;cursor:pointer">${es ? 'Continuar' : 'Continue'}</button>
    </div>`;
  } else if (S.wdStep === 2) {
    step = `
    <div style="background:#111827;border:1px solid rgba(124,58,237,.3);border-radius:16px;padding:24px;margin-bottom:16px;animation:popIn .25s ease both">
      <div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#c4a5f5;margin-bottom:16px">🔐 ${es ? 'CONFIRMACIÓN DE SEGURIDAD' : 'SECURITY CONFIRMATION'}</div>
      <label style="display:block;font-size:12px;color:#9CA3AF;margin-bottom:6px">${t.password}</label>
      <input type="password" placeholder="••••••••" class="inp-p" style="${INPUT};font-size:14px;margin-bottom:14px">
      <label style="display:block;font-size:12px;color:#9CA3AF;margin-bottom:6px">${es ? 'Confirma con tu código 2FA' : 'Confirm with your 2FA code'}</label>
      <input type="text" inputmode="numeric" maxlength="6" placeholder="000000" class="inp-p" style="${INPUT};border-color:rgba(124,58,237,.35);padding:12px;font-size:17px;${MONO};text-align:center;letter-spacing:.25em;margin-bottom:18px">
      <div style="display:flex;gap:10px">
        <button data-act="wdBack" style="flex:1;background:none;border:1px solid rgba(229,231,235,.14);color:#9CA3AF;font-size:13px;font-weight:700;padding:13px;border-radius:10px;cursor:pointer">${es ? 'Atrás' : 'Back'}</button>
        <button data-act="wdSubmit" style="flex:1;background:#2EE6A6;color:#04140A;border:none;font-size:13px;font-weight:800;padding:13px;border-radius:10px;cursor:pointer">${es ? 'Confirmar retiro' : 'Confirm withdrawal'}</button>
      </div>
    </div>`;
  } else {
    var timeline = [
      { title: es ? 'Solicitud creada' : 'Request created', note: es ? 'ledger TX-88500 · hace 1 min' : 'ledger TX-88500 · 1 min ago', state: 'done' },
      { title: es ? 'Revisión antifraude' : 'Anti-fraud review', note: es ? 'automática · en curso' : 'automated · in progress', state: 'active' },
      { title: es ? 'Verificación de liquidez' : 'Treasury liquidity check', note: es ? 'pendiente' : 'pending', state: 'todo' },
      { title: es ? 'Firma y transmisión' : 'Sign & broadcast', note: es ? 'pendiente' : 'pending', state: 'todo' },
      { title: es ? 'Confirmación blockchain' : 'Blockchain confirmation', note: es ? 'verás el txid y el enlace al explorador' : 'you’ll see the txid and explorer link', state: 'todo' }
    ].map(function(step2, i, arr){
      var mark = step2.state === 'done' ? '✓' : step2.state === 'active' ? '●' : (i + 1);
      var dotBg = step2.state === 'done' ? 'rgba(57,255,136,.15)' : step2.state === 'active' ? 'rgba(34,211,238,.15)' : 'transparent';
      var dotFg = step2.state === 'done' ? '#2EE6A6' : step2.state === 'active' ? '#22D3EE' : '#4B5563';
      var dotBorder = step2.state === 'done' ? 'rgba(57,255,136,.4)' : step2.state === 'active' ? 'rgba(34,211,238,.4)' : 'rgba(229,231,235,.12)';
      var line = i < arr.length - 1 ? '<span style="width:2px;height:26px;background:rgba(229,231,235,.08)"></span>' : '';
      return `<div style="display:flex;gap:14px;align-items:flex-start"><div style="display:flex;flex-direction:column;align-items:center"><span style="width:22px;height:22px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:11px;background:${dotBg};color:${dotFg};border:1px solid ${dotBorder}">${mark}</span>${line}</div><div style="padding-bottom:14px"><div style="font-size:13px;font-weight:700;color:${step2.state === 'todo' ? '#6B7280' : '#E5E7EB'}">${step2.title}</div><div style="font-size:11px;color:#6B7280">${step2.note}</div></div></div>`;
    }).join('');
    step = `
    <div style="${CARD};border-radius:16px;padding:28px;margin-bottom:16px;animation:popIn .25s ease both">
      <div style="text-align:center;margin-bottom:22px">
        <div style="width:58px;height:58px;border-radius:50%;background:rgba(34,211,238,.1);display:grid;place-items:center;font-size:26px;margin:0 auto 12px">🕐</div>
        <div style="${GROT};font-size:18px;font-weight:700">${es ? 'Tu retiro está en revisión' : 'Your withdrawal is under review'}</div>
        <div style="font-size:12.5px;color:#9CA3AF;margin-top:5px">${es ? 'Te avisaremos por email y en la app en cada paso.' : 'We’ll notify you by email and in-app at every step.'}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:0">${timeline}</div>
      <button data-act="wdReset" style="width:100%;background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);color:#22D3EE;font-size:13px;font-weight:800;padding:12px;border-radius:10px;cursor:pointer;margin-top:8px">${t.backToDashboard}</button>
    </div>`;
  }
  var hist = [
    { date: 'Jun 28', asset: 'LTC', tx: '3f8a09…c2d1', status: es ? 'COMPLETADO' : 'COMPLETED', stColor: '#2EE6A6', amount: '0.041 LTC' },
    { date: 'Jun 12', asset: 'DOGE', tx: 'a1b2c3…9f0e', status: es ? 'COMPLETADO' : 'COMPLETED', stColor: '#2EE6A6', amount: '210 DOGE' },
    { date: 'May 30', asset: 'LTC', tx: '—', status: es ? 'RECHAZADO' : 'REJECTED', stColor: '#f87171', amount: '0.02 LTC' }
  ].map(function(wh){
    return `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid rgba(229,231,235,.05);font-size:12.5px;flex-wrap:wrap"><span style="${MONO};color:#9CA3AF">${wh.date}</span><span style="font-weight:700">${wh.asset}</span><span style="flex:1;${MONO};color:#6B7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:90px">${wh.tx}</span><span style="font-size:10.5px;font-weight:800;color:${wh.stColor}">${wh.status}</span><span style="${MONO}">${wh.amount}</span></div>`;
  }).join('');
  return `
  <div style="animation:fadeUp .3s ease both;max-width:640px;margin:0 auto">
    <h1 style="${GROT};font-size:24px;margin:0 0 6px;letter-spacing:-.01em">📤 ${es ? 'Retirar' : 'Withdraw'}</h1>
    <p style="font-size:13px;color:#6B7280;margin:0 0 20px">${es ? 'Envía cripto a tu wallet externa. Cada retiro pasa revisión de seguridad.' : 'Send crypto to your external wallet. Every withdrawal passes security review.'}</p>
    ${step}
    <div style="${CARD};border-radius:14px;padding:18px 20px">
      <div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280;margin-bottom:12px">${es ? 'HISTORIAL DE RETIROS' : 'WITHDRAWAL HISTORY'}</div>
      <div style="display:flex;flex-direction:column">${hist}</div>
    </div>
  </div>`;
}

// ============ PROFILE ============
function vProfile(S, t) {
  var es = S.lang === 'es';
  var rows = [
    { icon: '🔐', title: es ? 'Autenticación de dos factores' : 'Two-factor authentication', desc: es ? 'Requerida para retiros y cambios de wallet' : 'Required for withdrawals and wallet changes', isToggle: true, on: S.twoFaOn, key: 'twoFaOn' },
    { icon: '🔢', title: es ? 'PIN de retiro' : 'Withdrawal PIN', desc: es ? 'Capa extra para confirmar retiros' : 'Extra layer to confirm withdrawals', isToggle: true, on: S.pinOn, key: 'pinOn' },
    { icon: '📧', title: es ? 'Notificaciones por email' : 'Email notifications', desc: es ? 'Retiros, seguridad y recompensas' : 'Withdrawals, security and rewards', isToggle: true, on: S.notifEmailOn, key: 'notifEmailOn' },
    { icon: '📋', title: es ? 'Lista blanca de wallets' : 'Wallet whitelist', desc: es ? '1 wallet confirmada · espera de 24h para nuevas' : '1 confirmed wallet · 24h wait for new ones', status: es ? 'ACTIVA' : 'ACTIVE', stColor: '#2EE6A6' },
    { icon: '🌐', title: es ? 'Idioma' : 'Language', desc: 'English / Español', status: es ? 'ESPAÑOL' : 'ENGLISH', stColor: '#22D3EE' },
    { icon: '🏅', title: es ? 'Logros' : 'Achievements', desc: es ? '3 de 24 insignias' : '3 of 24 badges', status: '3/24', stColor: '#c4a5f5' },
    { icon: '🛡️', title: es ? 'Estado de verificación' : 'Verification status', desc: es ? 'Email y actividad verificados' : 'Email and activity verified', status: es ? 'VERIFICADO' : 'VERIFIED', stColor: '#2EE6A6' },
    { icon: '🗑️', title: es ? 'Cerrar cuenta' : 'Close account', desc: es ? 'Requiere retirar saldos elegibles primero' : 'Requires withdrawing eligible balances first', status: '→', stColor: '#6B7280' }
  ].map(function(pr){
    var right = pr.isToggle
      ? `<button data-act="toggleSetting" data-i="${pr.key}" role="switch" aria-checked="${pr.on}" style="width:44px;height:24px;border-radius:12px;border:none;cursor:pointer;position:relative;background:${pr.on ? '#2EE6A6' : 'rgba(229,231,235,.15)'};transition:background .2s ease"><span style="position:absolute;top:3px;left:${pr.on ? '23px' : '3px'};width:18px;height:18px;border-radius:50%;background:#fff;transition:left .2s ease"></span></button>`
      : `<span style="font-size:11.5px;font-weight:800;color:${pr.stColor}">${pr.status}</span>`;
    return `<div class="hcard" style="background:#111827;border:1px solid rgba(229,231,235,.07);border-radius:13px;padding:16px 20px;display:flex;align-items:center;gap:14px"><span style="font-size:18px;width:26px;text-align:center">${pr.icon}</span><div style="flex:1"><div style="font-size:14px;font-weight:700">${pr.title}</div><div style="font-size:12px;color:#6B7280">${pr.desc}</div></div>${right}</div>`;
  }).join('');
  var sessions = [
    { icon: '💻', device: 'Chrome · macOS', meta: 'Bogotá, CO · 181.49.x.x · ' + (es ? 'ahora' : 'now'), current: true },
    { icon: '📱', device: 'Fauzet App · Android', meta: 'Bogotá, CO · 181.49.x.x · ' + (es ? 'hace 3h' : '3h ago'), current: false },
    { icon: '💻', device: 'Firefox · Windows', meta: 'Medellín, CO · 190.27.x.x · Jul 08', current: false }
  ].map(function(ds, i){
    var tag = ds.current ? `<span style="font-size:10px;color:#2EE6A6;margin-left:6px">${es ? 'actual' : 'current'}</span>` : '';
    var revoke = !ds.current ? `<button data-act="revokeSession" data-i="${i}" style="background:none;border:1px solid rgba(248,113,113,.3);color:#f87171;font-size:11px;font-weight:700;padding:6px 14px;border-radius:8px;cursor:pointer">${es ? 'Cerrar' : 'Revoke'}</button>` : '';
    return `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid rgba(229,231,235,.05);font-size:13px;flex-wrap:wrap"><span style="font-size:15px">${ds.icon}</span><div style="flex:1;min-width:140px"><div style="font-weight:700">${ds.device} ${tag}</div><div style="font-size:11px;color:#6B7280;${MONO}">${ds.meta}</div></div>${revoke}</div>`;
  }).join('');
  return `
  <div style="animation:fadeUp .3s ease both;max-width:760px;margin:0 auto">
    <h1 style="${GROT};font-size:24px;margin:0 0 20px;letter-spacing:-.01em">⚙️ ${es ? 'Cuenta y seguridad' : 'Account & security'}</h1>
    <div style="${CARD};border-radius:16px;padding:22px;margin-bottom:16px;display:flex;align-items:center;gap:18px;flex-wrap:wrap">
      <div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#22D3EE,#7C3AED);display:grid;place-items:center;font-weight:800;font-size:24px;color:#fff">M</div>
      <div style="flex:1;min-width:160px">
        <div style="font-size:17px;font-weight:800">Mateo <span style="font-size:10.5px;color:#2EE6A6;background:rgba(57,255,136,.1);padding:3px 9px;border-radius:6px;margin-left:6px">${t.verified}</span></div>
        <div style="font-size:12.5px;color:#6B7280;margin-top:3px">mateo@example.com · Colombia · UTC-5</div>
      </div>
      <div style="text-align:right"><div style="font-size:11px;color:#6B7280">${es ? 'Nivel de cuenta' : 'Account level'}</div><div style="${MONO};font-size:18px;color:#c4a5f5">Lv 3</div></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">${rows}</div>
    <div style="margin-top:18px;${CARD};border-radius:14px;padding:18px 20px">
      <div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280;margin-bottom:12px">${es ? 'SESIONES DE DISPOSITIVOS' : 'DEVICE SESSIONS'}</div>
      <div style="display:flex;flex-direction:column">${sessions}</div>
    </div>
  </div>`;
}

// ============ SUPPORT ============
function vSupport(S, t) {
  var es = S.lang === 'es';
  var actions = [
    { icon: '❓', label: 'FAQ', msg: 'FAQ' },
    { icon: '🎫', label: es ? 'Crear ticket' : 'Create ticket', msg: es ? 'Formulario de ticket' : 'Ticket form' },
    { icon: '📤', label: es ? 'Problema de retiro' : 'Withdrawal issue', msg: es ? 'Formulario de retiro' : 'Withdrawal form' },
    { icon: '🚨', label: es ? 'Reportar actividad sospechosa' : 'Report suspicious activity', msg: es ? 'Formulario de reporte' : 'Report form' }
  ].map(function(sa){
    return `<button data-act="supportToast" data-i="${esc(sa.msg)}" class="hcard" style="${CARD};border-radius:14px;padding:20px 14px;color:#E5E7EB;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:9px"><span style="font-size:24px">${sa.icon}</span><span style="font-size:12.5px;font-weight:800">${sa.label}</span></button>`;
  }).join('');
  var statuses = [
    { name: 'Faucet', color: '#2EE6A6' }, { name: es ? 'Juegos' : 'Games', color: '#2EE6A6' },
    { name: es ? 'Minería' : 'Mining', color: '#2EE6A6' }, { name: es ? 'Conversiones' : 'Conversions', color: '#2EE6A6' },
    { name: es ? 'Retiros' : 'Withdrawals', color: '#f59e0b' }, { name: 'API', color: '#2EE6A6' }
  ].map(function(si){
    return `<div style="display:flex;justify-content:space-between;background:#0A0E17;border-radius:8px;padding:9px 12px;font-size:12px"><span style="color:#9CA3AF">${si.name}</span><span style="color:${si.color}">●</span></div>`;
  }).join('');
  var tickets = [
    { id: '#4821', subject: es ? 'Retiro LTC demorado' : 'Delayed LTC withdrawal', status: es ? 'EN CURSO' : 'IN PROGRESS', stColor: '#22D3EE', stBg: 'rgba(34,211,238,.1)', date: 'Jul 09' },
    { id: '#4640', subject: es ? 'Pregunta sobre el Vault' : 'Question about the Vault', status: es ? 'RESUELTO' : 'RESOLVED', stColor: '#2EE6A6', stBg: 'rgba(57,255,136,.1)', date: 'Jun 22' }
  ].map(function(tk){
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(229,231,235,.05);font-size:13px;flex-wrap:wrap"><span style="${MONO};color:#6B7280">${tk.id}</span><span style="flex:1;font-weight:700;min-width:150px">${tk.subject}</span><span style="font-size:10.5px;font-weight:800;color:${tk.stColor};background:${tk.stBg};padding:3px 9px;border-radius:6px">${tk.status}</span><span style="font-size:11px;color:#4B5563">${tk.date}</span></div>`;
  }).join('');
  return `
  <div style="animation:fadeUp .3s ease both;max-width:760px;margin:0 auto">
    <h1 style="${GROT};font-size:24px;margin:0 0 20px;letter-spacing:-.01em">🛟 ${es ? 'Centro de ayuda' : 'Help center'}</h1>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px">${actions}</div>
    <div style="${CARD};border-radius:14px;padding:18px 20px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280">${es ? 'ESTADO DEL SISTEMA' : 'SYSTEM STATUS'}</span>
        <span style="display:inline-flex;align-items:center;gap:7px;font-size:12px;color:#2EE6A6;font-weight:700"><span style="width:7px;height:7px;border-radius:50%;background:#2EE6A6"></span>${es ? 'Todo operativo' : 'All operational'}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">${statuses}</div>
    </div>
    <div style="${CARD};border-radius:14px;padding:18px 20px">
      <div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#6B7280;margin-bottom:12px">${es ? 'MIS TICKETS' : 'MY TICKETS'}</div>
      <div style="display:flex;flex-direction:column">${tickets}</div>
    </div>
  </div>`;
}

// ============ OVERLAYS (modals + notif drawer) ============
function vOverlays(S, t) {
  var es = S.lang === 'es';
  var html = '';

  // notifications drawer
  if (S.notifOpen) {
    var items = fzNotifList(es).map(function(nf){
      return `<div style="background:#111827;border:1px solid rgba(229,231,235,.07);border-left:3px solid ${nf.accent};border-radius:10px;padding:12px 14px"><div style="font-size:13px;font-weight:700;margin-bottom:3px">${nf.title}</div><div style="font-size:12px;color:#9CA3AF;line-height:1.5">${nf.body}</div><div style="font-size:10.5px;color:#4B5563;margin-top:6px">${nf.time}</div></div>`;
    }).join('');
    html += `
    <div data-act="toggleNotif" style="position:fixed;inset:0;background:rgba(4,6,10,.6);z-index:60;animation:fadeUp .2s ease both"></div>
    <div style="position:fixed;top:0;right:0;bottom:0;width:min(360px,92vw);background:#0D1220;border-left:1px solid rgba(229,231,235,.08);z-index:61;padding:22px;overflow-y:auto;animation:popIn .25s ease both">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <span style="${GROT};font-size:17px;font-weight:700">${t.notifications}</span>
        <button data-act="toggleNotif" style="background:none;border:none;color:#9CA3AF;font-size:18px;cursor:pointer">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">${items}</div>
    </div>`;
  }

  // vault confirm modal
  if (S.vaultConfirm) {
    var meta = FZ_VAULT_PERIODS_META;
    var pn = ['Flexible', es ? '7 días' : '7 days', es ? '30 días' : '30 days', es ? '90 días' : '90 days'][S.vault.period];
    var quote = (S.vault.amount * 0.011 * meta.mults[S.vault.period]).toFixed(1);
    html += `
    <div data-act="cancelVault" style="position:fixed;inset:0;background:rgba(4,6,10,.75);z-index:70;animation:fadeUp .2s ease both"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:71;width:min(400px,94vw);background:#0D1220;border:1px solid rgba(124,58,237,.3);border-radius:18px;padding:26px;animation:popIn .25s ease both">
      <div style="${GROT};font-size:17px;font-weight:700;margin-bottom:14px">${es ? 'Confirmar bloqueo' : 'Confirm lock'}</div>
      <div style="background:#111827;border-radius:12px;padding:14px 16px;margin-bottom:14px;display:flex;flex-direction:column;gap:8px;font-size:13px">
        <div style="display:flex;justify-content:space-between"><span style="color:#6B7280">${es ? 'Monto' : 'Amount'}</span><span style="${MONO}">${S.vault.amount} ZYXE</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:#6B7280">${es ? 'Periodo' : 'Period'}</span><span>${pn}</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:#6B7280">${es ? 'Multiplicador' : 'Multiplier'}</span><span style="${MONO};color:#c4a5f5">${meta.multLabels[S.vault.period]}</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:#6B7280">${es ? 'Recompensa estimada' : 'Est. reward'}</span><span style="${MONO};color:#2EE6A6">~${quote} ZYXE · ${es ? 'no garantizado' : 'not guaranteed'}</span></div>
      </div>
      <label style="display:block;font-size:12px;color:#9CA3AF;margin-bottom:6px">${es ? 'Confirma con tu código 2FA' : 'Confirm with your 2FA code'}</label>
      <input type="text" inputmode="numeric" maxlength="6" placeholder="000000" class="inp-p" style="${INPUT};border-color:rgba(124,58,237,.35);padding:12px;font-size:17px;${MONO};text-align:center;letter-spacing:.25em;margin-bottom:16px">
      <div style="display:flex;gap:10px">
        <button data-act="cancelVault" style="flex:1;background:none;border:1px solid rgba(229,231,235,.14);color:#9CA3AF;font-size:13px;font-weight:700;padding:12px;border-radius:10px;cursor:pointer">${es ? 'Cancelar' : 'Cancel'}</button>
        <button data-act="confirmVault" class="hpurple" style="flex:1;background:#7C3AED;color:#fff;border:none;font-size:13px;font-weight:800;padding:12px;border-radius:10px;cursor:pointer">${es ? 'Bloquear ZYXEs' : 'Lock ZYXEs'}</button>
      </div>
    </div>`;
  }

  // game modal
  if (S.game) {
    html += vGameModal(S, t);
  }

  // buy modal
  if (S.buy) {
    html += `
    <div data-act="cancelBuy" style="position:fixed;inset:0;background:rgba(4,6,10,.75);z-index:70;animation:fadeUp .2s ease both"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:71;width:min(380px,94vw);background:#0D1220;border:1px solid rgba(229,231,235,.1);border-radius:18px;padding:26px;animation:popIn .25s ease both">
      <div style="${GROT};font-size:17px;font-weight:700;margin-bottom:14px">${es ? 'Confirmar compra' : 'Confirm purchase'}</div>
      <div style="background:#111827;border-radius:12px;padding:14px 16px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px"><span style="color:#6B7280">${es ? 'Artículo' : 'Item'}</span><span style="font-weight:700">${S.buy.name}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px"><span style="color:#6B7280">${es ? 'Efecto' : 'Effect'}</span><span>${S.buy.effect}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:#6B7280">${es ? 'Precio' : 'Price'}</span><span style="${MONO};color:#2EE6A6">${S.buy.price} ZYXE</span></div>
      </div>
      <div style="font-size:11.5px;color:#6B7280;margin-bottom:18px;line-height:1.5">${es ? 'Esta compra no es reembolsable. El importe se divide entre quema (40%), pools de recompensas (40%) y tesorería (20%).' : 'This purchase is non-refundable. The amount is split between burn (40%), reward pools (40%) and treasury (20%).'}</div>
      <div style="display:flex;gap:10px">
        <button data-act="cancelBuy" style="flex:1;background:none;border:1px solid rgba(229,231,235,.14);color:#9CA3AF;font-size:13px;font-weight:700;padding:12px;border-radius:10px;cursor:pointer">${es ? 'Cancelar' : 'Cancel'}</button>
        <button data-act="confirmBuy" style="flex:1;background:#2EE6A6;color:#04140A;border:none;font-size:13px;font-weight:800;padding:12px;border-radius:10px;cursor:pointer">${es ? 'Confirmar' : 'Confirm'}</button>
      </div>
    </div>`;
  }

  return html;
}

function vGameModal(S, t) {
  var es = S.lang === 'es';
  var g = S.game;
  var title = g.id === 'tap' ? 'Tap Miner' : g.id === 'memory' ? 'Memory Drops' : 'Daily Spin';
  var icon = g.id === 'tap' ? '⛏️' : g.id === 'memory' ? '🃏' : '🎡';
  var body = '';
  if (g.phase === 'intro') {
    var tut = g.id === 'tap'
      ? (es ? 'Toca el botón tantas veces como puedas en 10 segundos. Tu recompensa depende de tu puntuación y se valida en el servidor.' : 'Tap the button as many times as you can in 10 seconds. Your reward depends on your score and is validated server-side.')
      : g.id === 'memory'
      ? (es ? 'Voltea cartas y encuentra los 6 pares. Bonus por tiempo restante y precisión.' : 'Flip cards and match all 6 pairs. Bonus for remaining time and accuracy.')
      : (es ? 'Un giro gratis al día. Las probabilidades están publicadas abajo. Los premios son ZYXEs de utilidad interna — esto no es una apuesta.' : 'One free spin per day. The odds are published below. Prizes are internal utility ZYXEs — this is not wagering.');
    var energyCost = g.id === 'spin' ? (es ? 'Gratis' : 'Free') : (g.id === 'memory' ? '8' : '5') + (es ? ' energía' : ' energy');
    var range = g.id === 'memory' ? '10–40 ZYXE' : g.id === 'spin' ? '5–50 ZYXE' : '5–25 ZYXE';
    body = `
    <div style="text-align:center;padding:10px 0">
      <div style="font-size:46px;margin-bottom:14px">${icon}</div>
      <div style="font-size:13.5px;color:#9CA3AF;line-height:1.65;margin-bottom:20px">${tut}</div>
      <div style="display:flex;justify-content:center;gap:18px;font-size:12px;color:#6B7280;margin-bottom:22px"><span>⚡ ${energyCost}</span><span style="${MONO};color:#2EE6A6">${range}</span></div>
      <button data-act="startGame" class="hl" style="background:#2EE6A6;color:#04140A;border:none;font-size:15px;font-weight:800;padding:13px 40px;border-radius:11px;cursor:pointer">${es ? 'Comenzar' : 'Start'}</button>
    </div>`;
  } else if (g.phase === 'playing' && g.id === 'tap') {
    body = `
    <div style="text-align:center">
      <div style="display:flex;justify-content:space-between;${MONO};font-size:14px;margin-bottom:18px">
        <span style="color:#22D3EE">⏱ <span id="g-time">${g.timeLeft}</span>s</span>
        <span style="color:#2EE6A6">${es ? 'Puntos' : 'Score'}: <span id="g-score">${g.score}</span></span>
      </div>
      <button data-act="tapMine" class="tapbtn" style="width:160px;height:160px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#3ef79a,#1fb763);border:4px solid rgba(57,255,136,.35);color:#04140A;font-size:44px;cursor:pointer;box-shadow:0 10px 40px rgba(57,255,136,.25)">⛏️</button>
      <div style="font-size:12px;color:#6B7280;margin-top:16px">${es ? '¡Toca el pico tan rápido como puedas!' : 'Tap the pickaxe as fast as you can!'}</div>
    </div>`;
  } else if (g.phase === 'playing' && g.id === 'memory') {
    var cards = (g.cards || []).map(function(c, i){
      var up = c.matched || g.flipped.indexOf(i) !== -1;
      return `<button data-act="flipCard" data-i="${i}" style="aspect-ratio:1;background:${c.matched ? 'rgba(57,255,136,.12)' : up ? 'rgba(34,211,238,.12)' : '#111827'};border:1px solid ${c.matched ? 'rgba(57,255,136,.4)' : 'rgba(229,231,235,.1)'};border-radius:10px;font-size:24px;cursor:pointer;display:grid;place-items:center;color:#E5E7EB">${up ? c.sym : '?'}</button>`;
    }).join('');
    body = `
    <div style="display:flex;justify-content:space-between;${MONO};font-size:13px;margin-bottom:14px">
      <span style="color:#22D3EE">⏱ <span id="g-time">${g.timeLeft}</span>s</span>
      <span style="color:#2EE6A6">${es ? 'Pares' : 'Pairs'}: ${g.pairs}/6</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${cards}</div>`;
  } else if (g.phase === 'playing' && g.id === 'spin') {
    var odds = [
      { prize: '5 ZYXE', odds: '50%' }, { prize: '10 ZYXE', odds: '30%' },
      { prize: '25 ZYXE', odds: '15%' }, { prize: '50 ZYXE', odds: '5%' }
    ].map(function(so){
      return `<div style="display:flex;justify-content:space-between;background:#111827;border-radius:8px;padding:8px 14px;font-size:12.5px"><span>${so.prize}</span><span style="${MONO};color:#22D3EE">${so.odds}</span></div>`;
    }).join('');
    var spinner = g.spinPhase === 'spinning'
      ? '<div style="width:56px;height:56px;margin:0 auto;border:3px solid rgba(124,58,237,.25);border-top-color:#7C3AED;border-radius:50%;animation:spin .7s linear infinite"></div>'
      : `<button data-act="doSpin" class="hpurple" style="background:#7C3AED;color:#fff;border:none;font-size:15px;font-weight:800;padding:13px 40px;border-radius:11px;cursor:pointer">${es ? 'Girar' : 'Spin'}</button><div style="font-size:11px;color:#6B7280;margin-top:12px">${es ? 'Giro gratis diario · recompensas de utilidad, no efectivo' : 'Free daily spin · utility rewards, not cash'}</div>`;
    body = `
    <div style="text-align:center">
      <div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#6B7280;margin-bottom:12px">${es ? 'PROBABILIDADES PUBLICADAS' : 'PUBLISHED ODDS'}</div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:18px">${odds}</div>
      ${spinner}
    </div>`;
  } else if (g.phase === 'done') {
    var confetti = '';
    if (g.reward >= 25) {
      for (var i = 0; i < 14; i++) {
        confetti += `<span style="position:absolute;top:0;left:${5 + i * 6.8}%;width:7px;height:7px;background:${['#2EE6A6','#22D3EE','#7C3AED'][i % 3]};border-radius:2px;animation:confettiFall ${0.9 + (i % 4) * .18}s ease-out ${(i % 5) * .07}s both"></span>`;
      }
    }
    body = `
    <div style="text-align:center;position:relative;overflow:hidden;padding:6px 0">
      ${confetti}
      <div style="font-size:44px;margin-bottom:10px">🏁</div>
      <div style="${GROT};font-size:19px;font-weight:700;margin-bottom:4px">${es ? '¡Ronda completada!' : 'Round complete!'}</div>
      <div style="font-size:13px;color:#9CA3AF;margin-bottom:14px">${es ? 'Puntos' : 'Score'}: <span style="${MONO};color:#E5E7EB">${g.score}</span></div>
      <div style="${MONO};font-size:32px;color:#2EE6A6;font-weight:600;margin-bottom:6px">+${g.reward} ZYXE</div>
      <div style="font-size:11.5px;color:#6B7280;margin-bottom:20px">${es ? 'Recompensa pendiente de validación en servidor' : 'Reward pending server-side validation'}</div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button data-act="closeGame" style="background:none;border:1px solid rgba(229,231,235,.14);color:#9CA3AF;font-size:13px;font-weight:700;padding:11px 24px;border-radius:10px;cursor:pointer">${es ? 'Cerrar' : 'Done'}</button>
        <button data-act="startGame" style="background:#2EE6A6;color:#04140A;border:none;font-size:13px;font-weight:800;padding:11px 24px;border-radius:10px;cursor:pointer">${es ? 'Jugar de nuevo' : 'Play again'}</button>
      </div>
    </div>`;
  }
  return `
  <div data-act="closeGame" style="position:fixed;inset:0;background:rgba(4,6,10,.75);z-index:70;animation:fadeUp .2s ease both"></div>
  <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:71;width:min(440px,94vw);background:#0D1220;border:1px solid rgba(229,231,235,.1);border-radius:20px;padding:28px;animation:popIn .25s ease both;box-shadow:0 30px 90px rgba(0,0,0,.6)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <span style="${GROT};font-size:18px;font-weight:700">${title}</span>
      <button data-act="closeGame" style="background:none;border:none;color:#9CA3AF;font-size:18px;cursor:pointer">✕</button>
    </div>
    ${body}
  </div>`;
}

function vToast(S) {
  if (!S.toast) return '';
  return `<div style="position:fixed;bottom:84px;left:50%;transform:translateX(-50%);z-index:80;background:#111827;border:1px solid rgba(57,255,136,.35);border-radius:12px;padding:12px 22px;font-size:13.5px;font-weight:700;box-shadow:0 12px 40px rgba(0,0,0,.5);animation:popIn .25s ease both;display:flex;align-items:center;gap:10px"><span style="color:#2EE6A6">✓</span> ${S.toast}</div>`;
}
