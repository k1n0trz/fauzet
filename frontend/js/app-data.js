// Fauzet App — i18n dictionaries + static datasets (ported from Fauzet App.dc.html)
"use strict";

var FZ_DICT = {
  en: {
    welcomeBack: 'Welcome back', loginSub: 'Log in to your Fauzet account.', password: 'Password', forgot: 'Forgot password?',
    login: 'Log In', noAccount: 'No account yet?', signup: 'Sign up', createAccount: 'Create account',
    signupSub: 'Free forever. Start earning in minutes.', username: 'Username', country: 'Country', confirmPassword: 'Confirm password',
    referralCode: 'Referral code', optional: 'optional',
    acceptTerms: 'I accept the Terms of Service and the Privacy Policy.',
    acceptAge: 'I confirm I am of legal age in my country.',
    haveAccount: 'Already have an account?', resetPassword: 'Reset password',
    resetSub: 'We will email you a secure reset link.', sendResetLink: 'Send reset link', backToLogin: 'Back to log in',
    verifyEmail: 'Verify your email', verifySub: 'We sent a 6-digit code to your email. Enter it below to activate your account.',
    confirmCode: 'Confirm code', resendHint: 'Didn’t get it? Resend in 00:42',
    twoFactor: 'Two-factor authentication', twoFactorSub: 'Enter the 6-digit code from your authenticator app.',
    verify: 'Verify', recoveryHint: 'Lost your device? Use a recovery code.',
    authFooter: 'Protected by rate limits, captcha and anti-fraud monitoring. ZYXE is an internal utility and reward unit — not an investment.',
    orLabel: 'or', googleCta: 'Continue with Google',
    skip: 'Skip', next: 'Next', finish: 'Claim & enter', promoTag: 'Promotional balance — not withdrawable',
    verified: 'Verified',
    hiMateo: 'Hi, Mateo 👋', demoNote: 'Demo data — mocked, not authoritative',
    totalBalance: 'TOTAL BALANCE', estRef: 'Reference value', notGuaranteed: 'not guaranteed',
    available: 'Available', pending: 'Pending', locked: 'Locked', eligibleConv: 'Eligible to convert', promo: 'Promotional',
    streak: 'Streak', faucetReady: 'Your faucet is ready.', faucetReadyLong: 'YOUR FAUCET IS READY',
    nextClaim: 'Next claim in', claimZyxes: 'Claim ZYXEs', rewardRange: 'Reward range', claimsToday: 'claims today',
    mining: 'MINING', active: 'Active', hashpower: 'Hashpower', estDaily: 'Est. daily', poolShare: 'Pool share',
    energy: 'Energy', openMining: 'Open mining room', dailyProgress: 'TODAY’S PROGRESS',
    activeMissions: 'ACTIVE MISSIONS', viewAll: 'View all', recentActivity: 'RECENT ACTIVITY',
    totalCrew: 'Total crew', activeCrew: 'Active', thisWeek: 'ZYXE this week',
    seasonEvent: 'SEASONAL EVENT', seasonDesc: 'Complete event missions to climb the seasonal ranking.', joinEvent: 'View event',
    notifications: 'Notifications', comingSoon: 'This module is being built.',
    faucetCooling: 'FAUCET COOLING DOWN', nextClaimHint: 'Come back when the countdown ends. Streak stays safe for 24h.',
    claimValidating: 'Validating claim… checking cooldown, device and anti-fraud rules.',
    claimApproved: 'Claim approved and credited to your available balance.',
    backToDashboard: 'Back to dashboard', bonusMult: 'Bonus multiplier',
    captchaLabel: 'I’m not a robot — tap to verify',
    dailyClaims: 'DAILY CLAIM LIMIT', limitResets: 'resets at 00:00 UTC', streakBonus: 'CLAIM STREAK', days: 'days',
    streakHint: '+20% bonus at 7 days', claimHistory: 'CLAIM HISTORY'
  },
  es: {
    welcomeBack: 'Hola de nuevo', loginSub: 'Inicia sesión en tu cuenta Fauzet.', password: 'Contraseña', forgot: '¿Olvidaste tu contraseña?',
    login: 'Iniciar sesión', noAccount: '¿Aún no tienes cuenta?', signup: 'Regístrate', createAccount: 'Crear cuenta',
    signupSub: 'Gratis para siempre. Empieza a ganar en minutos.', username: 'Usuario', country: 'País', confirmPassword: 'Confirmar contraseña',
    referralCode: 'Código de referido', optional: 'opcional',
    acceptTerms: 'Acepto los Términos de Servicio y la Política de Privacidad.',
    acceptAge: 'Confirmo que soy mayor de edad en mi país.',
    haveAccount: '¿Ya tienes cuenta?', resetPassword: 'Restablecer contraseña',
    resetSub: 'Te enviaremos un enlace seguro por email.', sendResetLink: 'Enviar enlace', backToLogin: 'Volver a iniciar sesión',
    verifyEmail: 'Verifica tu email', verifySub: 'Enviamos un código de 6 dígitos a tu email. Ingrésalo para activar tu cuenta.',
    confirmCode: 'Confirmar código', resendHint: '¿No llegó? Reenviar en 00:42',
    twoFactor: 'Autenticación de dos factores', twoFactorSub: 'Ingresa el código de 6 dígitos de tu app de autenticación.',
    verify: 'Verificar', recoveryHint: '¿Perdiste tu dispositivo? Usa un código de recuperación.',
    authFooter: 'Protegido por límites de tasa, captcha y monitoreo antifraude. ZYXE es una unidad interna de utilidad y recompensa — no una inversión.',
    orLabel: 'o', googleCta: 'Continuar con Google',
    skip: 'Omitir', next: 'Siguiente', finish: 'Reclamar y entrar', promoTag: 'Saldo promocional — no retirable',
    verified: 'Verificado',
    hiMateo: 'Hola, Mateo 👋', demoNote: 'Datos demo — simulados, no autoritativos',
    totalBalance: 'SALDO TOTAL', estRef: 'Valor de referencia', notGuaranteed: 'no garantizado',
    available: 'Disponible', pending: 'Pendiente', locked: 'Bloqueado', eligibleConv: 'Elegible para convertir', promo: 'Promocional',
    streak: 'Racha', faucetReady: 'Tu faucet está listo.', faucetReadyLong: 'TU FAUCET ESTÁ LISTO',
    nextClaim: 'Próximo claim en', claimZyxes: 'Reclamar ZYXEs', rewardRange: 'Rango de recompensa', claimsToday: 'claims hoy',
    mining: 'MINERÍA', active: 'Activa', hashpower: 'Hashpower', estDaily: 'Est. diario', poolShare: 'Parte del pool',
    energy: 'Energía', openMining: 'Abrir sala de minería', dailyProgress: 'PROGRESO DE HOY',
    activeMissions: 'MISIONES ACTIVAS', viewAll: 'Ver todo', recentActivity: 'ACTIVIDAD RECIENTE',
    totalCrew: 'Crew total', activeCrew: 'Activos', thisWeek: 'ZYXE esta semana',
    seasonEvent: 'EVENTO DE TEMPORADA', seasonDesc: 'Completa misiones del evento para subir en el ranking.', joinEvent: 'Ver evento',
    notifications: 'Notificaciones', comingSoon: 'Este módulo está en construcción.',
    faucetCooling: 'FAUCET EN ENFRIAMIENTO', nextClaimHint: 'Vuelve cuando termine la cuenta regresiva. Tu racha se conserva 24h.',
    claimValidating: 'Validando claim… revisando cooldown, dispositivo y reglas antifraude.',
    claimApproved: 'Claim aprobado y acreditado a tu saldo disponible.',
    backToDashboard: 'Volver al dashboard', bonusMult: 'Multiplicador de bono',
    captchaLabel: 'No soy un robot — toca para verificar',
    dailyClaims: 'LÍMITE DIARIO DE CLAIMS', limitResets: 'se reinicia a las 00:00 UTC', streakBonus: 'RACHA DE CLAIMS', days: 'días',
    streakHint: '+20% de bono a los 7 días', claimHistory: 'HISTORIAL DE CLAIMS'
  }
};

function fzObSteps(es) {
  return es ? [
    { icon: '👋', title: 'Bienvenido a Fauzet', desc: 'Reclama recompensas, juega, construye minería virtual y haz crecer tu saldo de ZYXEs. Te mostramos lo esencial en 4 pasos.' },
    { icon: '💠', title: 'Conoce ZYXE', desc: 'ZYXE es la unidad interna de recompensa y utilidad de Fauzet. Se gana con actividad válida y se usa dentro de la plataforma. No es una inversión.' },
    { icon: '🎯', title: 'Elige cómo ganar', desc: 'Selecciona lo que más te interesa. Puedes cambiarlo cuando quieras.' },
    { icon: '🛡️', title: 'Protege tu cuenta', desc: 'Activa la autenticación de dos factores ahora y agrega tu wallet de retiro más adelante, cuando la necesites.' },
    { icon: '🎁', title: 'Tu recompensa de bienvenida', desc: 'Un bono promocional para explorar la plataforma. No es retirable, pero puedes usarlo en boosts y energía.' }
  ] : [
    { icon: '👋', title: 'Welcome to Fauzet', desc: 'Claim rewards, play games, build virtual mining power and grow your ZYXE balance. Here’s the essential tour in 4 steps.' },
    { icon: '💠', title: 'Meet ZYXE', desc: 'ZYXE is Fauzet’s internal reward and utility unit. You earn it through valid activity and use it inside the platform. It is not an investment.' },
    { icon: '🎯', title: 'Choose how to earn', desc: 'Pick what interests you most. You can change this anytime.' },
    { icon: '🛡️', title: 'Protect your account', desc: 'Enable two-factor authentication now, and add a withdrawal wallet later when you need it.' },
    { icon: '🎁', title: 'Your welcome reward', desc: 'A promotional bonus to explore the platform. It isn’t withdrawable, but you can spend it on boosts and energy.' }
  ];
}

function fzNavDefs(es, faucetReady) {
  return [
    { id: 'dashboard', icon: '⬒', label: es ? 'Panel' : 'Dashboard' },
    { id: 'faucet', icon: '💧', label: 'Faucet', badge: faucetReady ? (es ? 'LISTO' : 'READY') : null },
    { id: 'games', icon: '🎮', label: es ? 'Juegos' : 'Games' },
    { id: 'mining', icon: '⛏️', label: es ? 'Minería' : 'Mining' },
    { id: 'missions', icon: '🎯', label: es ? 'Misiones' : 'Missions' },
    { id: 'store', icon: '🚀', label: es ? 'Tienda' : 'Boost Store' },
    { id: 'wallet', icon: '💠', label: 'Wallet' },
    { id: 'vault', icon: '🏦', label: 'Vault' },
    { id: 'crew', icon: '👥', label: 'Mining Crew' },
    { id: 'trading', icon: '📈', label: 'Trading' },
    { id: 'convert', icon: '🔄', label: es ? 'Convertir' : 'Convert' },
    { id: 'withdraw', icon: '📤', label: es ? 'Retirar' : 'Withdraw' },
    { id: 'profile', icon: '⚙️', label: es ? 'Cuenta' : 'Account' },
    { id: 'support', icon: '🛟', label: es ? 'Soporte' : 'Support' }
  ];
}

function fzGameDefs(es) {
  return [
    { id: 'tap', cat: 'quick', icon: '⛏️', bg: 'linear-gradient(135deg,rgba(57,255,136,.14),rgba(34,211,238,.08))', name: 'Tap Miner', diff: es ? 'FÁCIL' : 'EASY', diffColor: '#2EE6A6', desc: es ? 'Toca lo más rápido posible durante 10 segundos.' : 'Tap as fast as you can for 10 seconds.', energy: 5, duration: '10s', reward: '5–25', best: '84', playable: true },
    { id: 'memory', cat: 'skill', icon: '🃏', bg: 'linear-gradient(135deg,rgba(34,211,238,.14),rgba(124,58,237,.1))', name: 'Memory Drops', diff: es ? 'MEDIO' : 'MEDIUM', diffColor: '#22D3EE', desc: es ? 'Encuentra los 6 pares antes de que acabe el tiempo.' : 'Match all 6 pairs before time runs out.', energy: 8, duration: '45s', reward: '10–40', best: '112', playable: true },
    { id: 'runner', cat: 'skill', icon: '🏃', bg: 'linear-gradient(135deg,rgba(124,58,237,.16),rgba(34,211,238,.08))', name: 'Hash Runner', diff: es ? 'MEDIO' : 'MEDIUM', diffColor: '#22D3EE', desc: es ? 'Esquiva obstáculos y multiplica tu puntuación.' : 'Dodge obstacles and multiply your score.', energy: 10, duration: '60s', reward: '10–50', best: '2,140', playable: false, blockedCta: es ? 'Límite diario alcanzado' : 'Daily limit reached' },
    { id: 'rush', cat: 'quick', icon: '💧', bg: 'linear-gradient(135deg,rgba(34,211,238,.16),rgba(57,255,136,.08))', name: 'Faucet Rush', diff: es ? 'FÁCIL' : 'EASY', diffColor: '#2EE6A6', desc: es ? 'Recoge gotas a contrarreloj y mantén tu racha.' : 'Collect drops against the clock and keep your streak.', energy: 5, duration: '30s', reward: '5–30', best: '—', playable: false, blockedCta: es ? 'En cooldown · 22 min' : 'Cooling down · 22 min' },
    { id: 'spin', cat: 'daily', icon: '🎡', bg: 'linear-gradient(135deg,rgba(124,58,237,.18),rgba(57,255,136,.06))', name: 'Daily Spin', diff: es ? 'GRATIS' : 'FREE', diffColor: '#7C3AED', desc: es ? '1 giro gratis al día. Probabilidades publicadas, sin apuestas.' : '1 free spin per day. Published odds, no wagering.', energy: 0, duration: '5s', reward: '5–50', best: '25', playable: true, cta: es ? 'Girar' : 'Spin' }
  ];
}

function fzMissionDefs(es) {
  return [
    { id: 'm1', cat: 'daily', icon: '💧', title: es ? 'Reclama 5 veces hoy' : 'Claim 5 times today', req: es ? 'Claims de faucet válidos' : 'Valid faucet claims', cur: 3, goal: 5, reward: 30, expires: es ? 'expira hoy 24:00' : 'expires today 24:00' },
    { id: 'm2', cat: 'daily', icon: '🎮', title: es ? 'Gana 50 ZYXE en juegos' : 'Earn 50 ZYXE from games', req: es ? 'Recompensas validadas de juego' : 'Validated game rewards', cur: 24, goal: 50, reward: 40, expires: es ? 'expira hoy 24:00' : 'expires today 24:00' },
    { id: 'm3', cat: 'mining', icon: '⛏️', title: es ? 'Mantén 100+ GH/s por 24h' : 'Keep 100+ GH/s for 24h', req: es ? 'Hashpower válido continuo' : 'Continuous valid hashpower', cur: 20, goal: 24, reward: 60, expires: es ? '2 días restantes' : '2 days left' },
    { id: 'm4', cat: 'weekly', icon: '🔥', title: es ? 'Racha de 7 días' : '7-day streak', req: es ? 'Actividad diaria válida' : 'Valid daily activity', cur: 6, goal: 7, reward: 100, expires: es ? 'semanal' : 'weekly' },
    { id: 'm5', cat: 'referral', icon: '👥', title: es ? 'Un miembro de crew activo' : 'One active crew member', req: es ? 'Actividad monetizable de tu red' : 'Monetizable activity from your network', cur: 1, goal: 1, reward: 50, expires: es ? 'sin límite' : 'no expiry' },
    { id: 'm6', cat: 'premium', icon: '💎', title: es ? 'Misión patrocinada: encuesta' : 'Sponsored mission: survey', req: es ? 'Verificada por el proveedor' : 'Verified by provider', cur: 0, goal: 1, reward: 200, expires: es ? '5 días restantes' : '5 days left', premium: true }
  ];
}

function fzStoreDefs(es) {
  return [
    { id: 'b1', icon: '⚡', name: es ? 'Recarga de energía' : 'Energy refill', desc: es ? 'Restaura tu energía al 100% al instante.' : 'Instantly restores your energy to 100%.', meta: es ? 'Instantáneo · máx 3/día' : 'Instant · max 3/day', price: 80, tag: 'UTILITY', tagColor: '#22D3EE', iconBg: 'rgba(34,211,238,.12)', border: 'rgba(229,231,235,.08)', effect: es ? 'Energía → 100' : 'Energy → 100' },
    { id: 'b2', icon: '🚀', name: es ? 'Boost de hashpower ×1.5' : 'Hashpower boost ×1.5', desc: es ? 'Aumenta tu hashpower válido un 50% durante 6 horas.' : 'Increases your valid hashpower by 50% for 6 hours.', meta: es ? '6 horas · no acumulable' : '6 hours · not stackable', price: 150, tag: 'BOOST', tagColor: '#2EE6A6', iconBg: 'rgba(57,255,136,.12)', border: 'rgba(229,231,235,.08)', effect: '×1.5 hash / 6h' },
    { id: 'b3', icon: '⏩', name: es ? 'Acelerador de cooldown' : 'Cooldown accelerator', desc: es ? 'Reduce el cooldown del faucet a la mitad durante 24h.' : 'Halves faucet cooldown for 24 hours.', meta: es ? '24 horas · máx 1 activo' : '24 hours · max 1 active', price: 200, tag: 'BOOST', tagColor: '#2EE6A6', iconBg: 'rgba(57,255,136,.12)', border: 'rgba(229,231,235,.08)', effect: 'Cooldown ÷2 / 24h' },
    { id: 'b4', icon: '🔧', name: es ? 'Kit de reparación' : 'Repair kit', desc: es ? 'Repara completamente un minero de cualquier tier.' : 'Fully repairs one miner of any tier.', meta: es ? 'Un uso · cualquier minero' : 'Single use · any miner', price: 120, tag: 'UTILITY', tagColor: '#22D3EE', iconBg: 'rgba(34,211,238,.12)', border: 'rgba(229,231,235,.08)', effect: es ? 'Durabilidad → 100%' : 'Durability → 100%' },
    { id: 'b5', icon: '🎟️', name: es ? 'Pase de misión premium' : 'Premium mission pass', desc: es ? 'Desbloquea las misiones patrocinadas premium de la semana.' : 'Unlocks this week’s premium sponsored missions.', meta: es ? '7 días · renovable' : '7 days · renewable', price: 350, tag: 'PREMIUM', tagColor: '#c4a5f5', iconBg: 'rgba(124,58,237,.15)', border: 'rgba(124,58,237,.3)', effect: es ? 'Misiones premium / 7d' : 'Premium missions / 7d' },
    { id: 'b6', icon: '🔮', name: 'Nova Rig II', desc: es ? 'Minero premium: 74 GH/s, alta eficiencia, 6⚡/h.' : 'Premium miner: 74 GH/s, high efficiency, 6⚡/h.', meta: es ? 'Permanente · requiere slot' : 'Permanent · requires slot', price: 1200, tag: 'MINER', tagColor: '#c4a5f5', iconBg: 'rgba(124,58,237,.15)', border: 'rgba(124,58,237,.3)', effect: '+74 GH/s' }
  ];
}

function fzWalletTxDefs() {
  return [
    { cat: 'faucet', icon: '💧', label: 'Faucet claim', ref: 'TX-88412', date: 'Jul 11 10:12', status: 'CONFIRMED', amount: '+18', after: '2,198' },
    { cat: 'games', icon: '🎮', label: 'Tap Miner reward', ref: 'TX-88399', date: 'Jul 11 09:58', status: 'CONFIRMED', amount: '+24', after: '2,180' },
    { cat: 'mining', icon: '⛏️', label: 'Mining pool payout', ref: 'TX-88102', date: 'Jul 11 00:00', status: 'CONFIRMED', amount: '+181', after: '2,156' },
    { cat: 'crew', icon: '👥', label: 'Crew reward · L1 · satoshi_ana', ref: 'TX-87990', date: 'Jul 10 18:24', status: 'PENDING', amount: '+12', after: '—' },
    { cat: 'purchases', icon: '🚀', label: 'Hashpower boost ×1.5', ref: 'TX-87721', date: 'Jul 10 14:02', status: 'CONFIRMED', amount: '-150', after: '1,975' },
    { cat: 'faucet', icon: '💧', label: 'Faucet claim', ref: 'TX-87614', date: 'Jul 10 11:40', status: 'REJECTED', amount: '+0', after: '2,125' },
    { cat: 'mining', icon: '⛏️', label: 'Mining pool payout', ref: 'TX-87001', date: 'Jul 10 00:00', status: 'CONFIRMED', amount: '+176', after: '2,125' },
    { cat: 'crew', icon: '👥', label: 'Crew reward · L2 · block_leo', ref: 'TX-86818', date: 'Jul 09 21:05', status: 'UNDER REVIEW', amount: '+8', after: '—' }
  ];
}

function fzCrewLevels() {
  return [
    { level: 1, pct: '5%', alpha: '.35', members: 4, barPct: '80%', earned: 312 },
    { level: 2, pct: '2%', alpha: '.26', members: 6, barPct: '100%', earned: 98 },
    { level: 3, pct: '1%', alpha: '.18', members: 2, barPct: '40%', earned: 28 },
    { level: 4, pct: '0.5%', alpha: '.12', members: 0, barPct: '4%', earned: 0 }
  ];
}

function fzCrewActivity(es) {
  return [
    { initial: 'A', name: 'satoshi_ana', level: 1, action: es ? 'completó una misión patrocinada' : 'completed a sponsored mission', status: es ? 'VÁLIDA' : 'VALID', stColor: '#2EE6A6', amount: 12 },
    { initial: 'L', name: 'block_leo', level: 2, action: es ? 'actividad recompensada verificada' : 'verified rewarded activity', status: es ? 'EN REVISIÓN' : 'REVIEWING', stColor: '#f59e0b', amount: 8 },
    { initial: 'K', name: 'kripto_kai', level: 1, action: es ? 'compró un boost de minería' : 'bought a mining boost', status: es ? 'VÁLIDA' : 'VALID', stColor: '#2EE6A6', amount: 7 },
    { initial: 'M', name: 'mina_marta', level: 3, action: es ? 'recompensa de pool de minería' : 'mining pool reward', status: es ? 'VÁLIDA' : 'VALID', stColor: '#2EE6A6', amount: 2 },
    { initial: 'D', name: 'doge_dan', level: 1, action: es ? 'registro — sin recompensa aún' : 'signed up — no reward yet', status: es ? 'SIN ACTIVIDAD' : 'NO ACTIVITY', stColor: '#6B7280', amount: 0 }
  ];
}

var FZ_PAIRS = ['ZYXE/BTC', 'ZYXE/LTC', 'ZYXE/DOGE', 'ZYXE/BCH', 'ZYXE/DASH'];
var FZ_PAIR_PRICES = ['0.00000114', '0.0000482', '0.0198', '0.0000091', '0.000162'];
var FZ_PAIR_CHANGES = ['+2.4%', '-0.8%', '+5.1%', '+0.3%', '-1.2%'];
var FZ_PAIR_VOLS = ['1.2M', '840K', '2.1M', '310K', '190K'];
var FZ_PAIR_RATES = [0.00000114, 0.0000482, 0.0198, 0.0000091, 0.000162];
var FZ_PAIR_UNITS = ['BTC', 'LTC', 'DOGE', 'BCH', 'DASH'];

var FZ_CV_ASSETS = [
  { sym: 'LTC', name: 'Litecoin', color: '#bebebe', img: 'assets/coin-ltc.png' },
  { sym: 'DOGE', name: 'Dogecoin', color: '#e1c76c', img: 'assets/coin-doge.png' },
  { sym: 'BCH', name: 'Bitcoin Cash', color: '#7ddc8f', img: 'assets/coin-bch.png' },
  { sym: 'DASH', name: 'Dash', color: '#7fb2e5', img: 'assets/coin-dash.png' }
];
var FZ_CV_RATES = [0.0000482, 0.0198, 0.0000091, 0.000162];
var FZ_CV_NETFEES = [0.0001, 1, 0.00001, 0.0001];
var FZ_CV_NETFEE_LABELS = ['0.0001 LTC', '1 DOGE', '0.00001 BCH', '0.0001 DASH'];
var FZ_CV_UNITS = ['LTC', 'DOGE', 'BCH', 'DASH'];

var FZ_WD_BALS = ['0.0842 LTC', '312 DOGE', '0 BCH', '0 DASH'];

var FZ_VAULT_PERIODS_META = { mults: [1.0, 1.05, 1.15, 1.35], multLabels: ['1.00×', '1.05×', '1.15×', '1.35×'], unlocks: ['—', 'Jul 18, 2026', 'Aug 10, 2026', 'Oct 09, 2026'], shortNames: ['Flex', '7d', '30d', '90d'] };

function fzNotifList(es) {
  return es ? [
    { accent: '#2EE6A6', title: 'Tu faucet está listo', body: 'Puedes reclamar tu próxima recompensa ahora.', time: 'hace 2 min' },
    { accent: '#2EE6A6', title: 'Recompensa de minería recibida', body: '+181 ZYXE del pool diario acreditados.', time: 'hace 6 h' },
    { accent: '#f59e0b', title: 'Tu minero necesita mantenimiento', body: 'Core Rig al 34% de durabilidad. Repáralo para evitar pérdida de eficiencia.', time: 'hace 9 h' },
    { accent: '#22D3EE', title: 'Energía baja', body: 'Te queda 64/100 de energía. Restaura para seguir minando a plena capacidad.', time: 'hace 12 h' },
    { accent: '#7C3AED', title: 'Actividad de tu crew', body: 'satoshi_ana completó una misión monetizable. +12 ZYXE pendientes.', time: 'ayer' },
    { accent: '#22D3EE', title: 'Anuncio de plataforma', body: 'Hash Season 02 comienza esta semana con pool de 500,000 ZYXE.', time: 'hace 2 días' }
  ] : [
    { accent: '#2EE6A6', title: 'Your faucet is ready', body: 'You can claim your next reward now.', time: '2 min ago' },
    { accent: '#2EE6A6', title: 'Mining reward received', body: '+181 ZYXE from the daily pool credited.', time: '6 h ago' },
    { accent: '#f59e0b', title: 'Your miner needs maintenance', body: 'Core Rig at 34% durability. Repair it to avoid efficiency loss.', time: '9 h ago' },
    { accent: '#22D3EE', title: 'Energy low', body: 'You have 64/100 energy left. Restore it to keep mining at full capacity.', time: '12 h ago' },
    { accent: '#7C3AED', title: 'Crew activity', body: 'satoshi_ana completed a monetizable mission. +12 ZYXE pending.', time: 'yesterday' },
    { accent: '#22D3EE', title: 'Platform announcement', body: 'Hash Season 02 starts this week with a 500,000 ZYXE pool.', time: '2 days ago' }
  ];
}
