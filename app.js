'use strict';
/* =========================================================
   Mis Finanzas — cuenta con correo y contraseña, datos en la
   nube (Firebase) sincronizados en vivo entre dispositivos,
   y bloqueo opcional con Face ID / huella.
   ========================================================= */

const LS_DATA = 'finanzas.data.v2';
const LS_LOCK = 'finanzas.bloqueo';

const DEFAULT_CATS = {
  gasto: ['Supermercado', 'Comida fuera', 'Transporte', 'Vivienda', 'Cuentas', 'Salud', 'Ocio', 'Ropa',
    'Educación', 'Suscripciones', 'Ahorro', 'Pago de deudas', 'Otros'],
  ingreso: ['Sueldo', 'Freelance', 'Ventas', 'Reembolsos', 'Otros ingresos'],
};
const COLORS = ['#4f7cff', '#ff7a59', '#2bb673', '#f5b700', '#a35bff', '#00b3c7', '#ff4f8b',
  '#7a8a99', '#8bc34a', '#ff9800', '#795548', '#3f51b5', '#009688', '#e91e63'];
const DEFAULT_ACCOUNTS = [
  { id: 'efectivo', name: 'Efectivo', kind: 'efectivo', initial: 0, updatedAt: 0 },
  { id: 'banco', name: 'Banco', kind: 'banco', initial: 0, updatedAt: 0 },
];
const CURRENCIES = ['CLP', 'USD', 'EUR', 'ARS', 'PEN', 'COP', 'MXN', 'BRL', 'UYU'];

/* ---------- utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => Date.now();
const pad = n => String(n).padStart(2, '0');
const clone = o => JSON.parse(JSON.stringify(o));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const thisMonth = () => today().slice(0, 7);
function shiftMonth(m, delta) {
  let [y, mo] = m.split('-').map(Number);
  mo += delta;
  while (mo < 1) { mo += 12; y--; }
  while (mo > 12) { mo -= 12; y++; }
  return `${y}-${pad(mo)}`;
}
function monthLabel(m, short) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('es-CL', short ? { month: 'short' } : { month: 'long', year: 'numeric' });
}
function dayLabel(d) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
}
function fmtDate(d) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
}
function parseAmount(v) { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : 0; }

function readJSON(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast('No se pudo guardar en este dispositivo'); } }

/* ---------- datos ---------- */
function emptyData() {
  return { version: 1, settings: { currency: 'CLP', startMonth: '2026-11', payday: 5, categories: clone(DEFAULT_CATS), updatedAt: 0 }, transactions: [], budgets: [], goals: [], accounts: clone(DEFAULT_ACCOUNTS) };
}
function normalize(d) {
  const base = emptyData();
  d = Object.assign(base, d || {});
  d.settings = Object.assign(emptyData().settings, d.settings || {});
  d.settings.categories = Object.assign(clone(DEFAULT_CATS), d.settings.categories || {});
  for (const k of ['transactions', 'budgets', 'goals', 'accounts']) if (!Array.isArray(d[k])) d[k] = [];
  if (!d.accounts.length) d.accounts = clone(DEFAULT_ACCOUNTS);
  return d;
}

let data = normalize(window.PREVIEW_DATA || null);
const startMonth = () => data.settings.startMonth || '';
const ui = { tab: 'inicio', month: thisMonth(), filter: 'todos' };
if (startMonth() > ui.month) ui.month = startMonth();
let version = 0; // cambia con cada edición local

const live = arr => arr.filter(x => !x.deleted);
function fmt(n) {
  const cur = data.settings.currency;
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: cur, maximumFractionDigits: cur === 'CLP' ? 0 : 2 }).format(n || 0);
  } catch { return (n || 0).toLocaleString('es-CL'); }
}
const txOfMonth = m => live(data.transactions).filter(t => t.date && t.date.startsWith(m));
function totals(m) {
  let inc = 0, exp = 0;
  for (const t of txOfMonth(m)) { if (t.type === 'ingreso') inc += t.amount; else if (t.type === 'gasto') exp += t.amount; }
  return { inc, exp, bal: inc - exp };
}
function spentByCat(m) {
  const o = {};
  for (const t of txOfMonth(m)) if (t.type === 'gasto') o[t.category] = (o[t.category] || 0) + t.amount;
  return o;
}
/* ---------- cuentas (efectivo, banco…) ---------- */
const LS_LASTACC = 'finanzas.ultimaCuenta';
const accId = t => t.account || 'banco';
const accounts = () => live(data.accounts);
const accName = id => (data.accounts.find(a => a.id === id && !a.deleted) || { name: 'Cuenta eliminada' }).name;
const accIcon = a => (a.kind === 'efectivo' ? '💵' : '🏦');
function balances() {
  const bal = {};
  for (const a of accounts()) bal[a.id] = a.initial || 0;
  const addTo = (id, v) => { bal[id] = (bal[id] || 0) + v; };
  for (const t of live(data.transactions)) {
    if (t.type === 'ingreso' || t.type === 'ajuste') addTo(accId(t), t.amount);
    else if (t.type === 'gasto') addTo(accId(t), -t.amount);
    else if (t.type === 'transferencia') { addTo(t.from, -t.amount); addTo(t.to, t.amount); }
  }
  return bal;
}
function lastAccount() {
  let id = null;
  try { id = localStorage.getItem(LS_LASTACC); } catch { }
  return accounts().some(a => a.id === id) ? id : (accounts()[0] || {}).id;
}
function rememberAccount(id) { try { localStorage.setItem(LS_LASTACC, id); } catch { } }
function accOptions(selected) {
  return accounts().map(a => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${accIcon(a)} ${esc(a.name)}</option>`).join('');
}

/* ---------- semana de pago (pago semanal) ---------- */
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const payday = () => (Number.isInteger(data.settings.payday) ? data.settings.payday : 5);
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtD = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return fmtD(d); };
const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);
const shortDay = s => parseD(s).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
function weekStart(s) { const d = parseD(s); d.setDate(d.getDate() - (d.getDay() - payday() + 7) % 7); return fmtD(d); }
function firstPaydayFrom(s) { const d = parseD(s); d.setDate(d.getDate() + (payday() - d.getDay() + 7) % 7); return fmtD(d); }
// Día de referencia: hoy, o el primer día de pago si aún no empiezas a registrar
function refDay() {
  const start = startMonth() ? startMonth() + '-01' : '';
  return today() < start ? firstPaydayFrom(start) : today();
}
function paydaysInMonth(m) {
  let d = firstPaydayFrom(m + '-01'), n = 0;
  while (d.startsWith(m)) { n++; d = addDays(d, 7); }
  return n;
}
const isPay = t => t.type === 'ingreso' && t.category === 'Sueldo';
function lastPay() {
  return live(data.transactions).filter(isPay).sort((a, b) => b.date.localeCompare(a.date))[0];
}
function methodOf(t) { return (data.accounts.find(a => a.id === accId(t)) || {}).kind === 'efectivo' ? 'efectivo' : 'transferencia'; }

function weekCard() {
  const ws = weekStart(refDay()), we = addDays(ws, 6), next = addDays(ws, 7);
  const txs = live(data.transactions).filter(t => t.date >= ws && t.date <= we);
  let inc = 0, exp = 0;
  for (const t of txs) { if (t.type === 'ingreso') inc += t.amount; else if (t.type === 'gasto') exp += t.amount; }
  const left = inc - exp;
  const pay = txs.find(isPay);
  const t = today();
  const notYet = t < ws;
  const daysLeft = Math.max(1, daysBetween(notYet ? ws : t, next));
  const untilNext = daysBetween(t, notYet ? ws : next);
  const dayName = DAYS[payday()];
  const nextLine = notYet
    ? `Primer pago: ${dayName} ${shortDay(ws).replace(/^\S+\s/, '')} · en ${untilNext} días`
    : `Próximo pago: ${dayName} ${shortDay(next).replace(/^\S+\s/, '')} · ${untilNext === 1 ? 'mañana' : `en ${untilNext} días`}`;
  const payLine = pay
    ? `<p class="payok">✓ Pago registrado: ${fmt(pay.amount)} en ${methodOf(pay) === 'efectivo' ? 'efectivo' : 'transferencia'}</p>`
    : `<button class="btn wide" data-action="pay-week" data-date="${ws}">Registrar pago del ${dayName}</button>`;
  const m = ws.slice(0, 7);
  return `<section class="card week">
    <div class="weekhead"><h3>Semana de pago</h3><span class="muted">${shortDay(ws)} – ${shortDay(we)}</span></div>
    <div class="weekgrid">
      <div><small>Recibiste</small><b class="pos">${fmt(inc)}</b></div>
      <div><small>Gastaste</small><b class="neg">${fmt(exp)}</b></div>
      <div><small>Te queda</small><b class="${left >= 0 ? '' : 'neg'}">${fmt(left)}</b></div>
    </div>
    ${inc > 0 ? progress(exp, inc) : ''}
    ${inc > 0 && left > 0 ? `<p class="muted">Puedes gastar unos <b>${fmt(Math.floor(left / daysLeft))}</b> por día hasta el próximo pago.</p>` : ''}
    ${payLine}
    <p class="muted">${nextLine} · ${monthLabel(m).split(' ')[0]} tiene ${paydaysInMonth(m)} ${dayName.endsWith('s') ? dayName : dayName + 's'} de pago.</p>
  </section>`;
}

function budgetFor(cat) { const b = data.budgets.find(b => b.id === 'b:' + cat && !b.deleted); return b ? b.amount : 0; }
function catColor(cat) {
  const all = [...data.settings.categories.gasto, ...data.settings.categories.ingreso];
  const i = all.indexOf(cat);
  return COLORS[(i < 0 ? all.length : i) % COLORS.length];
}

/* ---------- cambios ---------- */
const userKey = () => LS_DATA + '.' + (cloud.user ? cloud.user.uid : 'local');
function save() { if (cloud.user || window.PREVIEW) writeJSON(userKey(), data); }
function commit() { version++; save(); render(); cloudPush(); }
function upsert(list, item) {
  item.updatedAt = now();
  const i = data[list].findIndex(x => x.id === item.id);
  if (i >= 0) data[list][i] = item; else data[list].push(item);
  commit();
}
function remove(list, id) {
  const i = data[list].findIndex(x => x.id === id);
  if (i >= 0) { data[list][i] = { id, deleted: true, updatedAt: now() }; commit(); }
}

/* ---------- fusión (para que varios dispositivos no se pisen) ---------- */
function mergeList(a = [], b = []) {
  const m = new Map();
  for (const x of [...a, ...b]) {
    const y = m.get(x.id);
    if (!y || (x.updatedAt || 0) > (y.updatedAt || 0)) m.set(x.id, x);
  }
  return [...m.values()].sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
}
function mergeData(l, r) {
  return {
    version: 1,
    settings: (r.settings?.updatedAt || 0) > (l.settings?.updatedAt || 0) ? r.settings : l.settings,
    transactions: mergeList(l.transactions, r.transactions),
    budgets: mergeList(l.budgets, r.budgets),
    goals: mergeList(l.goals, r.goals),
    accounts: mergeList(l.accounts, r.accounts),
  };
}
const canon = d => JSON.stringify(mergeData(emptyData(), d));

/* ---------- nube (Firebase: cuenta + datos en vivo) ---------- */
const LISTS = ['transactions', 'budgets', 'goals', 'accounts'];
const cloud = {
  user: null, auth: null, db: null, unsubs: [],
  known: {},            // última versión (updatedAt) que existe en la nube de cada elemento
  server: new Set(),    // listas ya confirmadas por el servidor (antes de eso no subimos nada)
  writing: 0, timer: null, state: 'idle', error: '',
};
const docId = id => encodeURIComponent(String(id)).replace(/\./g, '%2E');
const userDoc = () => cloud.db.collection('users').doc(cloud.user.uid);

function cloudErr(err) {
  const c = (err && err.code) || '';
  if (c.includes('permission-denied')) return 'Sin permiso en la base de datos. Revisa las reglas de Firestore.';
  if (c.includes('unavailable')) return 'Sin conexión: tus cambios se guardan y se subirán después.';
  return 'Error al sincronizar' + (err && err.message ? ': ' + err.message : '');
}
function setCloud(state, error = '') { cloud.state = state; cloud.error = error; renderSyncStatus(); }

function cloudInit() {
  if (window.PREVIEW) { showScreen('app'); render(); return; }
  const cfgOk = window.FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId;
  if (!window.firebase || !cfgOk) { showScreen('setup'); return; }
  firebase.initializeApp(FIREBASE_CONFIG);
  cloud.auth = firebase.auth();
  cloud.db = firebase.firestore();
  try { cloud.db.enablePersistence({ synchronizeTabs: true }).catch(() => { }); } catch { }
  cloud.auth.onAuthStateChanged(u => (u ? onLogin(u) : onLogout()));
}

const isAdmin = () => !!(cloud.user && window.ADMIN_UID && cloud.user.uid === window.ADMIN_UID);
/* ---------- usuarios tipo "andres@finanzas" ----------
   Quien no usa correo elige un nombre de usuario. Por dentro se guarda con
   una dirección del propio proyecto Firebase (nadie más la controla). */
const USER_DOMAIN = () => ((window.FIREBASE_CONFIG && FIREBASE_CONFIG.authDomain) || 'finanzas.local').toLowerCase();
const USER_RE = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$/;
function toLoginEmail(input) {
  const v = String(input || '').trim().toLowerCase();
  return v.includes('@') ? v : v + '@' + USER_DOMAIN();
}
const isUsernameAccount = email => String(email || '').toLowerCase().endsWith('@' + USER_DOMAIN());
function shownName(email) {
  const e = String(email || '');
  return isUsernameAccount(e) ? e.slice(0, e.lastIndexOf('@')) + '@finanzas' : e;
}

const LS_PERSONAL = 'finanzas.modoPersonal';
const personalMode = () => { try { return localStorage.getItem(LS_PERSONAL) === '1'; } catch { return false; } };
function setPersonalMode(on) {
  try { on ? localStorage.setItem(LS_PERSONAL, '1') : localStorage.removeItem(LS_PERSONAL); } catch { }
  ui.viewing = null;
  if (on && ui.tab === 'admin') ui.tab = 'inicio';
  render();
  toast(on ? 'Modo personal: solo ves tus finanzas' : 'Panel de administración visible');
}
const showAdmin = () => isAdmin() && !personalMode();
const profileRef = uid => cloud.db.collection('profiles').doc(uid);

function onLogin(u) {
  if (cloud.user && cloud.user.uid === u.uid) return;
  cloud.user = u;
  cloud.known = {}; cloud.server = new Set();
  cloud.status = null; cloud.seenSet = false; cloud.users = [];
  data = normalize(readJSON(userKey()));
  if (startMonth() > ui.month) ui.month = startMonth();
  unlocked = !lockInfo();
  setStatusScreen('loading');
  // El perfil dice si la cuenta está aprobada, pendiente o bloqueada
  cloud.profileUnsub = profileRef(u.uid).onSnapshot({ includeMetadataChanges: true },
    doc => onProfile(doc), err => { setStatusScreen('error', cloudErr(err)); });
}

function onProfile(doc) {
  if (!doc.exists) {
    if (doc.metadata.fromCache) return; // esperar respuesta del servidor
    const t = now();
    profileRef(cloud.user.uid).set({ email: cloud.user.email, createdAt: t, lastSeen: t, status: isAdmin() ? 'activo' : 'pendiente' })
      .catch(err => setStatusScreen('error', cloudErr(err)));
    return;
  }
  const p = doc.data();
  if (!cloud.seenSet && !doc.metadata.fromCache) {
    cloud.seenSet = true;
    profileRef(cloud.user.uid).update({ lastSeen: now(), email: cloud.user.email }).catch(() => { });
  }
  if (p.status === cloud.status) return;
  cloud.status = p.status;
  if (p.status === 'activo') {
    startData();
    if (isAdmin()) startAdmin();
    showScreen(unlocked ? 'app' : 'lock');
    render();
  } else {
    stopData();
    if (p.status === 'bloqueado') { try { localStorage.removeItem(userKey()); } catch { } data = normalize(null); }
    setStatusScreen(p.status === 'bloqueado' ? 'blocked' : 'pending');
  }
}

function startData() {
  if (cloud.unsubs.length) return;
  setCloud('connecting');
  const base = userDoc();
  for (const list of LISTS) {
    cloud.unsubs.push(base.collection(list).onSnapshot({ includeMetadataChanges: true },
      snap => onListSnap(list, snap), err => setCloud('error', cloudErr(err))));
  }
  cloud.unsubs.push(base.collection('meta').doc('settings').onSnapshot({ includeMetadataChanges: true },
    doc => onSettingsSnap(doc), err => setCloud('error', cloudErr(err))));
}
function stopData() {
  cloud.unsubs.forEach(f => { try { f(); } catch { } });
  cloud.unsubs = []; cloud.known = {}; cloud.server = new Set();
}

function onLogout() {
  stopData();
  if (cloud.profileUnsub) { try { cloud.profileUnsub(); } catch { } cloud.profileUnsub = null; }
  cloud.user = null; cloud.status = null; cloud.users = []; ui.viewing = null;
  if (ui.tab === 'admin') ui.tab = 'inicio';
  data = normalize(null);
  showScreen('auth');
}

/* ---------- administración ---------- */
function startAdmin() {
  cloud.unsubs.push(cloud.db.collection('profiles').onSnapshot(snap => {
    cloud.users = snap.docs.map(d => Object.assign({ uid: d.id }, d.data()));
    const pend = cloud.users.filter(u => u.status === 'pendiente').length;
    $('#adminBadge').textContent = pend || '';
    $('#adminBadge').hidden = !pend;
    if (ui.tab === 'admin' && !userIsTyping()) render();
  }, err => toast(cloudErr(err))));
}
function setUserStatus(uid, status) {
  return profileRef(uid).update({ status, reviewedAt: now() })
    .then(() => toast(status === 'activo' ? 'Cuenta activada' : 'Cuenta bloqueada'))
    .catch(err => toast(cloudErr(err)));
}
async function loadUserData(uid) {
  const base = cloud.db.collection('users').doc(uid);
  const d = { settings: null };
  for (const list of LISTS) d[list] = (await base.collection(list).get()).docs.map(x => x.data());
  const st = await base.collection('meta').doc('settings').get();
  if (st.exists) d.settings = st.data(); else delete d.settings;
  return normalize(d);
}
function withData(d, fn) { const old = data; data = d; try { return fn(); } finally { data = old; } }
const fmtDay = ts => (ts ? new Date(ts).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
function agoText(ts) {
  if (!ts) return 'nunca';
  const m = Math.round((now() - ts) / 60000);
  if (m < 2) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}
const STATUS = { activo: ['Activa', 'ok'], pendiente: ['Pendiente', 'warn'], bloqueado: ['Bloqueada', 'bad'] };

function viewerHTML() {
  const v = ui.viewing;
  if (!v) return '';
  if (!v.data) return `<section class="card viewer"><div class="viewhead"><h3>${esc(shownName(v.email))}</h3><button class="btn ghost" data-action="adm-close">Cerrar</button></div><p class="muted">${v.error ? '⚠️ ' + esc(v.error) : 'Cargando sus datos…'}</p></section>`;
  return withData(v.data, () => {
    const bal = balances(), accs = accounts();
    const total = accs.reduce((t, a) => t + (bal[a.id] || 0), 0);
    const { inc, exp, bal: net } = totals(ui.month);
    const txs = live(data.transactions).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 25);
    const rows = txs.map(t => txRow(t).replace(/data-action="edit-tx" data-id="[^"]*"/, '')).join('');
    return `<section class="card viewer">
      <div class="viewhead"><div><h3>${esc(shownName(v.email))}</h3><span class="muted">Solo lectura</span></div><button class="btn ghost" data-action="adm-close">Cerrar</button></div>
      <div class="moneyhead"><span>Dinero total</span><b class="${total < 0 ? 'neg' : ''}">${fmt(total)}</b></div>
      <ul class="acclist ro">${accs.map(a => `<li><span class="accicon">${accIcon(a)}</span><span class="accname">${esc(a.name)}</span><b>${fmt(bal[a.id] || 0)}</b></li>`).join('')}</ul>
      <div class="weekgrid"><div><small>Ingresos ${monthLabel(ui.month).split(' ')[0]}</small><b class="pos">${fmt(inc)}</b></div>
        <div><small>Gastos</small><b class="neg">${fmt(exp)}</b></div><div><small>Balance</small><b class="${net >= 0 ? 'pos' : 'neg'}">${fmt(net)}</b></div></div>
      <h4 class="day">Últimos movimientos</h4>
      ${rows ? `<ul class="txlist ro">${rows}</ul>` : '<p class="muted">Todavía no registra movimientos.</p>'}
    </section>`;
  });
}

function applyRemote(list, item) {
  cloud.known[list + '/' + item.id] = item.updatedAt || 0;
  const i = data[list].findIndex(x => x.id === item.id);
  if (i < 0) { data[list].push(item); return true; }
  if ((item.updatedAt || 0) > (data[list][i].updatedAt || 0)) { data[list][i] = item; return true; }
  return false;
}
function afterRemote(changed) {
  if (changed) { save(); if (!userIsTyping()) render(); }
  if (cloud.server.size === LISTS.length + 1) {
    if (cloud.state === 'connecting' || cloud.state === 'error') setCloud(navigator.onLine ? 'ok' : 'offline');
    cloudPush();
  }
}
function onListSnap(list, snap) {
  let changed = false;
  for (const ch of snap.docChanges()) if (ch.type !== 'removed') changed = applyRemote(list, ch.doc.data()) || changed;
  if (!snap.metadata.fromCache) cloud.server.add(list);
  afterRemote(changed);
}
function onSettingsSnap(doc) {
  let changed = false;
  if (doc.exists) {
    const st = doc.data();
    cloud.known.settings = st.updatedAt || 0;
    if ((st.updatedAt || 0) > (data.settings.updatedAt || 0)) {
      data.settings = normalize({ settings: st }).settings; changed = true;
    }
  }
  if (!doc.metadata.fromCache) cloud.server.add('settings');
  afterRemote(changed);
}

function cloudPush() {
  if (!cloud.user || !cloud.db) return;
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(doPush, 300);
}
function doPush() {
  if (!cloud.user || cloud.server.size < LISTS.length + 1) return; // esperar a conocer lo que hay en la nube
  const base = userDoc();
  const writes = [];
  for (const list of LISTS) {
    for (const item of data[list]) {
      const k = list + '/' + item.id;
      if (!(k in cloud.known) || (item.updatedAt || 0) > cloud.known[k]) {
        writes.push([base.collection(list).doc(docId(item.id)), clone(item)]);
        cloud.known[k] = item.updatedAt || 0;
      }
    }
  }
  if (!('settings' in cloud.known) || (data.settings.updatedAt || 0) > cloud.known.settings) {
    writes.push([base.collection('meta').doc('settings'), clone(data.settings)]);
    cloud.known.settings = data.settings.updatedAt || 0;
  }
  if (!writes.length) return;
  for (let i = 0; i < writes.length; i += 400) {
    const batch = cloud.db.batch();
    writes.slice(i, i + 400).forEach(([ref, val]) => batch.set(ref, val));
    cloud.writing++;
    setCloud(navigator.onLine ? 'saving' : 'offline');
    batch.commit()
      .then(() => { cloud.writing--; if (!cloud.writing) setCloud('ok'); })
      .catch(err => { cloud.writing--; setCloud('error', cloudErr(err)); });
  }
}

function userIsTyping() {
  const a = document.activeElement;
  return !!document.querySelector('dialog[open]') || (a && a.matches('input, textarea, select'));
}
function renderSyncStatus() {
  const b = $('#syncBtn');
  if (!b) return;
  const map = {
    idle: ['', 'Sin conectar'], connecting: ['busy', 'Conectando…'], saving: ['busy', 'Guardando…'],
    ok: ['ok', 'Sincronizado'], offline: ['err', 'Sin conexión'], error: ['err', 'Error'],
  };
  let [kind, msg] = map[cloud.state] || map.idle;
  if (window.PREVIEW) { kind = ''; msg = 'Vista previa'; }
  b.className = 'sync ' + kind;
  b.querySelector('span').textContent = msg;
  b.title = cloud.error || msg;
  const det = $('#syncDetail');
  if (det) det.textContent = cloud.error ? '⚠️ ' + cloud.error
    : cloud.state === 'offline' ? 'Sin conexión: lo que anotes se guarda aquí y se sube solo cuando vuelva internet.'
    : 'Tus datos se guardan en la nube y se ven al instante en todos tus dispositivos.';
}
window.addEventListener('online', () => { if (cloud.user) { setCloud(cloud.writing ? 'saving' : 'ok'); cloudPush(); } });
window.addEventListener('offline', () => { if (cloud.user) setCloud('offline'); });

/* ---------- pantallas: ingreso, bloqueo, configuración ---------- */
function showScreen(name) {
  for (const n of ['auth', 'lock', 'setup', 'status']) { const el = $('#' + n + 'Screen'); if (el) el.hidden = n !== name; }
  document.body.classList.toggle('gated', name !== 'app');
  if (name === 'lock') $('#lockEmail').textContent = cloud.user ? shownName(cloud.user.email) : '';
  if (name === 'auth') setAuthMode(authMode);
}
function setStatusScreen(kind, err) {
  const t = {
    loading: ['⏳', 'Cargando tu cuenta…', 'Un momento.'],
    pending: ['🕓', 'Tu cuenta está esperando aprobación', 'El administrador debe aprobarla antes de que puedas usar la app. Esta pantalla se actualiza sola cuando te aprueben.'],
    blocked: ['🔒', 'Tu cuenta está bloqueada', 'No tienes acceso a la app. Si crees que es un error, habla con el administrador.'],
    error: ['⚠️', 'No se pudo cargar tu cuenta', err || 'Revisa tu conexión a internet e intenta de nuevo.'],
  }[kind];
  $('#statusIcon').textContent = t[0];
  $('#statusTitle').textContent = t[1];
  $('#statusMsg').textContent = t[2];
  $('#statusEmail').textContent = cloud.user ? shownName(cloud.user.email) : '';
  showScreen('status');
}
let authMode = 'login'; // login | signup | reauth
function setAuthMode(m) {
  authMode = m;
  const f = $('#authForm');
  const signup = m === 'signup';
  $('#authTitle').textContent = signup ? 'Crea tu cuenta' : m === 'reauth' ? 'Confirma tu contraseña' : 'Ingresa a tu cuenta';
  $('#authSubmit').textContent = signup ? 'Crear cuenta' : 'Ingresar';
  f.password.autocomplete = signup ? 'new-password' : 'current-password';
  $('#authToggle').hidden = m === 'reauth';
  $('#authToggle').textContent = signup ? '¿Ya tienes cuenta? Ingresa' : '¿No tienes cuenta? Crea una';
  $('#authReset').hidden = signup;
  $('#authOther').hidden = m !== 'reauth';
  $('#authNotice').hidden = !signup;
  $('#authUserHint').hidden = !signup;
  $('#authUserLabel').textContent = signup ? 'Usuario' : 'Usuario o correo';
  if (m === 'reauth' && cloud.user) f.email.value = isUsernameAccount(cloud.user.email) ? shownName(cloud.user.email).replace('@finanzas', '') : cloud.user.email;
  $('#authError').hidden = true;
}
function authErr(err) {
  const c = (err && err.code) || '';
  const msgs = {
    'auth/invalid-email': 'Usuario o correo no válido. El usuario puede tener letras, números, punto, guion o guion bajo.',
    'auth/user-not-found': 'Usuario o contraseña incorrectos.',
    'auth/wrong-password': 'Usuario o contraseña incorrectos.',
    'auth/invalid-credential': 'Usuario o contraseña incorrectos.',
    'auth/invalid-login-credentials': 'Usuario o contraseña incorrectos.',
    'auth/email-already-in-use': 'Ese usuario ya existe. Elige otro o ingresa con tu contraseña.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos y vuelve a intentar.',
    'auth/network-request-failed': 'Sin conexión a internet. Revisa tu conexión e intenta de nuevo.',
    'auth/operation-not-allowed': 'El ingreso con correo no está activado en Firebase.',
    'auth/unauthorized-domain': 'Este sitio no está autorizado en Firebase (Authorized domains).',
  };
  return msgs[c] || 'No se pudo completar: ' + (err && err.message ? err.message : 'error desconocido');
}
function showAuthError(msg) { const e = $('#authError'); e.textContent = msg; e.hidden = false; }

/* ---------- bloqueo con Face ID / Touch ID / huella (WebAuthn) ---------- */
let unlocked = true, hiddenAt = 0;
const RELOCK_MS = 2 * 60 * 1000; // vuelve a pedir Face ID si la app estuvo cerrada más de 2 minutos
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const toB64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
function lockInfo() { const l = readJSON(LS_LOCK); return l && cloud.user && l.uid === cloud.user.uid ? l : null; }
async function biometricAvailable() {
  try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
  catch { return false; }
}
async function enableLock() {
  if (!(await biometricAvailable())) { toast('Este dispositivo no tiene Face ID, Touch ID ni huella disponibles para la app.'); return; }
  try {
    const cred = await navigator.credentials.create({ publicKey: {
      rp: { name: 'Mis Finanzas' },
      user: { id: rand(16), name: shownName(cloud.user.email), displayName: shownName(cloud.user.email) },
      challenge: rand(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000, attestation: 'none',
    } });
    writeJSON(LS_LOCK, { uid: cloud.user.uid, credId: toB64u(cred.rawId) });
    unlocked = true; render(); toast('Bloqueo activado en este dispositivo');
  } catch (e) { toast('No se activó el bloqueo: se canceló o no se pudo verificar.'); }
}
function disableLock() { try { localStorage.removeItem(LS_LOCK); } catch { } render(); toast('Bloqueo desactivado'); }
async function unlock() {
  const l = lockInfo();
  if (!l) { unlocked = true; showScreen('app'); return; }
  try {
    await navigator.credentials.get({ publicKey: {
      challenge: rand(32), timeout: 60000, userVerification: 'required',
      allowCredentials: [{ type: 'public-key', id: fromB64u(l.credId), transports: ['internal'] }],
    } });
    unlocked = true; showScreen('app'); render();
  } catch { toast('No se pudo verificar. Intenta de nuevo o usa tu contraseña.'); }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { hiddenAt = now(); return; }
  if (cloud.user && lockInfo() && unlocked && hiddenAt && now() - hiddenAt > RELOCK_MS) { unlocked = false; showScreen('lock'); }
});

/* ---------- vistas ---------- */
function progress(v, max, extraCls = '') {
  const p = max > 0 ? Math.min(100, v / max * 100) : 0;
  const cls = extraCls || (v > max ? 'over' : p > 85 ? 'warn' : '');
  return `<div class="progress ${cls}"><span style="width:${p}%"></span></div>`;
}
function monthsUntil(d) {
  const [y, m] = d.split('-').map(Number);
  // Cuenta desde el mes actual, o desde el mes de inicio si aún no llega
  const [sy, sm] = (startMonth() > thisMonth() ? startMonth() : thisMonth()).split('-').map(Number);
  return (y - sy) * 12 + (m - sm) + 1;
}
function goalRow(g, full) {
  const isDebt = g.kind === 'deuda';
  const p = g.target > 0 ? Math.min(100, g.current / g.target * 100) : 0;
  const label = isDebt
    ? `Pagado ${fmt(g.current)} de ${fmt(g.target)} · quedan ${fmt(Math.max(0, g.target - g.current))}`
    : `${fmt(g.current)} de ${fmt(g.target)}`;
  let extra = '';
  if (g.deadline && g.current < g.target) {
    const months = monthsUntil(g.deadline);
    extra = months > 0
      ? ` · necesitas ${fmt(Math.ceil((g.target - g.current) / months))}/mes para llegar al ${fmtDate(g.deadline)}`
      : ' · plazo vencido';
  } else if (g.current >= g.target && g.target > 0) extra = isDebt ? ' · ¡deuda pagada! 🎉' : ' · ¡meta cumplida! 🎉';
  return `<div class="goal">
    <div class="budhead"><b>${isDebt ? '💳' : '🎯'} ${esc(g.name)}</b><span class="muted">${Math.round(p)}%</span></div>
    ${progress(g.current, g.target, isDebt ? 'debt' : 'goalp')}
    <p class="muted">${label}${full ? extra : ''}</p>
    ${full ? `<div class="row-end">
      <button class="btn ghost" data-action="edit-goal" data-id="${g.id}">Editar</button>
      <button class="btn" data-action="contribute" data-id="${g.id}">${isDebt ? 'Registrar pago' : 'Abonar'}</button>
    </div>` : ''}
  </div>`;
}

const views = {
  admin() {
    if (!isAdmin()) return '<p class="empty">Solo para el administrador.</p>';
    const order = { pendiente: 0, activo: 1, bloqueado: 2 };
    const users = [...cloud.users].sort((a, b) => (order[a.status] - order[b.status]) || (b.createdAt || 0) - (a.createdAt || 0));
    const pend = users.filter(u => u.status === 'pendiente');
    const others = users.filter(u => u.status !== 'pendiente');
    const me = cloud.user.uid;
    const pendHTML = pend.length ? `<section class="card"><h3>Por aprobar (${pend.length})</h3>
      ${pend.map(u => `<div class="urow">
        <div class="uinfo"><b>${esc(shownName(u.email))}</b><small>Se registró el ${fmtDay(u.createdAt)}</small></div>
        <div class="uacts"><button class="btn ghost danger" data-action="adm-reject" data-id="${u.uid}">Rechazar</button>
        <button class="btn" data-action="adm-approve" data-id="${u.uid}">Aprobar</button></div></div>`).join('')}
      </section>` : '';
    const listHTML = `<section class="card"><h3>Usuarios (${others.length})</h3>
      ${others.map(u => { const [lbl, cls] = STATUS[u.status] || ['—', '']; const self = u.uid === me; return `<div class="urow">
        <div class="uinfo"><b>${esc(shownName(u.email))}${self ? ' <span class="chip">Tú · admin</span>' : ''}</b>
          <small><span class="chip ${cls}">${lbl}</span> Registro ${fmtDay(u.createdAt)} · Último uso ${agoText(u.lastSeen)}</small></div>
        <div class="uacts">${self ? '' : `<button class="btn ghost" data-action="adm-view" data-id="${u.uid}">Ver finanzas</button>
          ${u.status === 'bloqueado' ? `<button class="btn ghost" data-action="adm-unblock" data-id="${u.uid}">Desbloquear</button>`
            : `<button class="btn ghost danger" data-action="adm-block" data-id="${u.uid}">Bloquear</button>`}`}</div></div>`; }).join('') || '<p class="muted">Aún no hay usuarios.</p>'}
      </section>`;
    const top = `<div class="row-end" style="margin:0 0 14px"><button class="btn ghost" data-action="personal-on">👤 Ver solo mis finanzas</button></div>`;
    return top + viewerHTML() + pendHTML + listHTML;
  },

  inicio() {
    const { inc, exp, bal } = totals(ui.month);
    const byCat = Object.entries(spentByCat(ui.month)).sort((a, b) => b[1] - a[1]);
    let acc = 0;
    const stops = byCat.map(([c, v]) => { const a = acc / exp * 360; acc += v; return `${catColor(c)} ${a}deg ${acc / exp * 360}deg`; });
    const donut = exp > 0
      ? `<div class="donut" style="background:conic-gradient(${stops.join(',')})"><div><small>Gastos</small><b>${fmt(exp)}</b></div></div>
         <ul class="legend">${byCat.map(([c, v]) => `<li><i style="background:${catColor(c)}"></i><span>${esc(c)}</span><b>${fmt(v)}</b><em>${Math.round(v / exp * 100)}%</em></li>`).join('')}</ul>`
      : '<p class="empty" style="flex:1">Sin gastos este mes.</p>';

    // 6 meses terminando en el mes elegido, pero nunca antes del mes de inicio
    let first = shiftMonth(ui.month, -5);
    if (startMonth() && first < startMonth()) first = startMonth();
    const months = [...Array(6)].map((_, i) => shiftMonth(first, i));
    const series = months.map(m => ({ m, ...totals(m) }));
    const max = Math.max(1, ...series.flatMap(s => [s.inc, s.exp]));
    const bars = series.map(s => `<div class="bcol${s.m === ui.month ? ' cur' : ''}">
      <div class="bpair"><span class="bi" style="height:${s.inc / max * 100}%" title="Ingresos ${fmt(s.inc)}"></span><span class="be" style="height:${s.exp / max * 100}%" title="Gastos ${fmt(s.exp)}"></span></div>
      <small>${monthLabel(s.m, true).replace('.', '')}</small></div>`).join('');

    const spent = spentByCat(ui.month);
    const budCats = data.settings.categories.gasto.filter(c => budgetFor(c) > 0);
    const budTotal = budCats.reduce((s, c) => s + budgetFor(c), 0);
    const budSpent = budCats.reduce((s, c) => s + (spent[c] || 0), 0);
    const over = budCats.filter(c => (spent[c] || 0) > budgetFor(c));
    const goals = live(data.goals);

    const accBal = balances();
    const accs = accounts();
    const total = accs.reduce((s, a) => s + (accBal[a.id] || 0), 0);
    return `
      <section class="card money">
        <div class="moneyhead"><h3>Mi dinero</h3><b class="${total < 0 ? 'neg' : ''}">${fmt(total)}</b></div>
        <ul class="acclist">${accs.map(a => `<li data-action="edit-acc" data-id="${a.id}">
          <span class="accicon">${accIcon(a)}</span><span class="accname">${esc(a.name)}</span>
          <b class="${(accBal[a.id] || 0) < 0 ? 'neg' : ''}">${fmt(accBal[a.id] || 0)}</b></li>`).join('')}</ul>
        <div class="row-end">
          <button class="btn ghost" data-action="new-acc">+ Cuenta</button>
          <button class="btn ghost" data-action="new-transfer">⇄ Mover dinero</button>
        </div>
      </section>
      ${weekCard()}
      <section class="cards3">
        <div class="card stat"><small>Ingresos</small><b class="pos">${fmt(inc)}</b></div>
        <div class="card stat"><small>Gastos</small><b class="neg">${fmt(exp)}</b></div>
        <div class="card stat"><small>Balance</small><b class="${bal >= 0 ? 'pos' : 'neg'}">${fmt(bal)}</b></div>
      </section>
      ${budTotal ? `<section class="card"><h3>Presupuesto del mes</h3>${progress(budSpent, budTotal)}
        <p class="muted">${fmt(budSpent)} de ${fmt(budTotal)} · disponible ${fmt(Math.max(0, budTotal - budSpent))}
        ${over.length ? `<br><span class="neg">Excedido en: ${over.map(esc).join(', ')}</span>` : ''}</p></section>`
        : `<section class="card"><h3>Presupuesto del mes</h3><p class="muted">Aún no defines límites. <a href="#" data-tab="presupuesto">Configurar presupuesto</a></p></section>`}
      <section class="card"><h3>¿En qué gastas?</h3><div class="donutwrap">${donut}</div></section>
      <section class="card"><h3>Últimos 6 meses</h3><div class="bars">${bars}</div>
        <p class="muted"><i class="dot bi"></i>Ingresos <i class="dot be"></i>Gastos</p></section>
      ${goals.length ? `<section class="card"><h3>Metas y deudas</h3>${goals.map(g => goalRow(g)).join('')}</section>` : ''}`;
  },

  movimientos() {
    let txs = txOfMonth(ui.month);
    if (ui.filter !== 'todos') txs = txs.filter(t => t.type === ui.filter);
    txs.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
    const groups = {};
    for (const t of txs) (groups[t.date] ??= []).push(t);
    const seg = ['todos', 'gasto', 'ingreso'].map(f =>
      `<button class="${ui.filter === f ? 'on' : ''}" data-action="filter" data-v="${f}">${{ todos: 'Todos', gasto: 'Gastos', ingreso: 'Ingresos' }[f]}</button>`).join('');
    const list = Object.entries(groups).map(([d, ts]) => `<h4 class="day">${dayLabel(d)}</h4>
      <ul class="txlist">${ts.map(txRow).join('')}</ul>`).join('');
    return `<div class="seg">${seg}</div>${list || '<p class="empty">No hay movimientos este mes.<br>Toca + para agregar uno.</p>'}`;
  },

  presupuesto() {
    const spent = spentByCat(ui.month);
    const rows = data.settings.categories.gasto.map(c => {
      const b = budgetFor(c), s = spent[c] || 0;
      return `<div class="budrow">
        <div class="budhead"><b>${esc(c)}</b><span class="muted">${fmt(s)}${b ? ` / ${fmt(b)}` : ''}</span></div>
        ${b ? progress(s, b) : ''}
        <label class="budinput">Límite mensual
          <input type="number" inputmode="decimal" min="0" step="any" value="${b || ''}" placeholder="Sin límite" data-budget="${esc(c)}"></label>
      </div>`;
    }).join('');
    return `<section class="card"><h3>Límites por categoría</h3>
      <p class="muted">Los límites se repiten todos los meses; el avance corresponde al mes seleccionado.</p>${rows}</section>`;
  },

  metas() {
    const goals = live(data.goals);
    return `<div class="row-end" style="margin:0 0 14px"><button class="btn" data-action="new-goal">+ Nueva meta o deuda</button></div>
      ${goals.length ? goals.map(g => `<section class="card">${goalRow(g, true)}</section>`).join('')
        : '<p class="empty">Crea una meta de ahorro (por ejemplo, un fondo de emergencia) o registra una deuda para ir pagándola.</p>'}`;
  },

  ajustes() {
    const c = data.settings.categories;
    return `
      <section class="card"><h3>Tu cuenta</h3>
        <p class="acctline">${window.PREVIEW ? 'Vista previa (sin cuenta)' : `Ingresaste como <b>${esc(cloud.user ? shownName(cloud.user.email) : '')}</b>`}</p>
        <p id="syncDetail" class="muted"></p>
        <div class="lockrow">
          <div><b>Bloqueo con Face ID / huella</b>
            <small>${lockInfo() ? 'Activado en este dispositivo. Se pide al abrir la app.' : 'Pide Face ID, Touch ID o tu huella al abrir la app en este dispositivo.'}</small></div>
          <button class="btn ${lockInfo() ? 'ghost' : ''}" data-action="lock-toggle">${lockInfo() ? 'Desactivar' : 'Activar'}</button>
        </div>
        ${isAdmin() ? `<div class="lockrow">
          <div><b>Modo personal</b>
            <small>${personalMode() ? 'Activado: solo ves tus finanzas. La pestaña Admin está oculta.' : 'Oculta la pestaña Admin para ver solo tus finanzas.'}</small></div>
          <button class="btn ${personalMode() ? '' : 'ghost'}" data-action="${personalMode() ? 'personal-off' : 'personal-on'}">${personalMode() ? 'Mostrar Admin' : 'Activar'}</button>
        </div>` : ''}
        <div class="row-end"><button class="btn ghost danger" data-action="logout">Cerrar sesión</button></div>
      </section>

      <section class="card"><h3>Tus datos</h3>
        <div class="btngrid">
          <button class="btn ghost" data-action="export-json">Exportar respaldo (JSON)</button>
          <button class="btn ghost" data-action="export-csv">Exportar movimientos (CSV)</button>
          <button class="btn ghost" data-action="import-json">Importar respaldo</button>
        </div>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
        <p class="muted">${live(data.transactions).length} movimientos · ${live(data.goals).length} metas guardadas.</p>
      </section>`;
  },
};

function render() {
  $('#adminTab').hidden = !showAdmin();
  if (ui.tab === 'admin' && !showAdmin()) ui.tab = 'inicio';
  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
  $('#monthbar').hidden = !['inicio', 'movimientos', 'presupuesto'].includes(ui.tab);
  $('#monthLabel').textContent = monthLabel(ui.month);
  $('[data-action="prev-month"]').disabled = !!startMonth() && ui.month <= startMonth();
  $('#fab').hidden = !['inicio', 'movimientos'].includes(ui.tab);
  $('#view').innerHTML = views[ui.tab]();
  renderSyncStatus();
}

/* ---------- diálogos ---------- */
let editingTx = null, txType = 'gasto';
function fillCategories(type, selected) {
  const sel = $('#txForm').category;
  const cats = [...data.settings.categories[type]];
  if (selected && !cats.includes(selected)) cats.push(selected);
  sel.innerHTML = cats.map(c => `<option ${c === selected ? 'selected' : ''}>${esc(c)}</option>`).join('');
}
function setTxType(type, selected) {
  txType = type;
  const isTr = type === 'transferencia';
  $('#txType').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.type === type));
  $('#catLabel').hidden = isTr;
  $('#txForm').category.required = !isTr;
  $('#toLabel').hidden = !isTr;
  $('#accLabel').textContent = isTr ? 'Desde' : 'Pagado con';
  $('#payMethodWrap').hidden = type !== 'ingreso';
  $('#accField').hidden = type === 'ingreso';
  if (!isTr) fillCategories(type, selected);
}
let payMethod = 'transferencia';
function setPayMethod(m) {
  payMethod = m;
  $('#payMethod').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.method === m));
}
function methodAccount(m) {
  const cash = accounts().find(a => a.kind === 'efectivo');
  const bank = accounts().find(a => a.id === lastAccount() && a.kind !== 'efectivo') || accounts().find(a => a.kind !== 'efectivo');
  return ((m === 'efectivo' ? cash : bank) || {}).id;
}
function openTx(tx) {
  editingTx = tx || null;
  const f = $('#txForm');
  f.reset();
  $('#txTitle').textContent = tx ? 'Editar movimiento' : 'Nuevo movimiento';
  $('#txDelete').hidden = !tx;
  const from = tx ? (tx.type === 'transferencia' ? tx.from : accId(tx)) : lastAccount();
  f.account.innerHTML = accOptions(from);
  const other = (accounts().find(a => a.id !== from) || {}).id;
  f.to.innerHTML = accOptions(tx?.to || other);
  setTxType(tx ? tx.type : 'gasto', tx?.category);
  let pm = 'transferencia';
  try { pm = localStorage.getItem('finanzas.ultimoMetodo') || pm; } catch { }
  setPayMethod(tx && tx.type === 'ingreso' ? methodOf(tx) : pm);
  f.amount.value = tx ? tx.amount : '';
  f.date.value = tx ? tx.date : (ui.month === thisMonth() ? today() : ui.month + '-01');
  f.note.value = tx?.note || '';
  f.note.placeholder = 'Opcional';
  $('#txDialog').showModal();
  if (!tx) setTimeout(() => f.amount.focus(), 50);
}

function openTransfer() {
  openTx();
  const f = $('#txForm');
  const cash = accounts().find(a => a.kind === 'efectivo'), bank = accounts().find(a => a.kind !== 'efectivo');
  if (bank) f.account.value = bank.id;
  if (cash) f.to.value = cash.id;
  setTxType('transferencia');
  f.note.placeholder = 'Ej. giro en cajero';
}
function txRow(t) {
  let title, sub, amount, cls;
  if (t.type === 'transferencia') {
    title = 'Mover dinero'; sub = `${esc(accName(t.from))} → ${esc(accName(t.to))}`;
    amount = fmt(t.amount); cls = 'neutral';
  } else if (t.type === 'ajuste') {
    title = 'Ajuste de saldo'; sub = esc(accName(accId(t)));
    amount = (t.amount >= 0 ? '+' : '−') + fmt(Math.abs(t.amount)); cls = 'neutral';
  } else {
    title = esc(t.category);
    sub = t.type === 'ingreso' ? (methodOf(t) === 'efectivo' ? '💵 Efectivo' : '🏦 Transferencia') : esc(accName(accId(t)));
    amount = (t.type === 'ingreso' ? '+' : '−') + fmt(t.amount); cls = t.type === 'ingreso' ? 'pos' : 'neg';
  }
  const color = t.type === 'transferencia' || t.type === 'ajuste' ? 'var(--muted)' : catColor(t.category);
  return `<li data-action="edit-tx" data-id="${t.id}">
    <i style="background:${color}"></i>
    <div><b>${title}</b><small>${sub}${t.note ? ' · ' + esc(t.note) : ''}</small></div>
    <span class="${cls}">${amount}</span></li>`;
}

/* ---------- diálogo de cuenta ---------- */
let editingAcc = null;
function openAcc(a) {
  editingAcc = a || null;
  const f = $('#accForm');
  f.reset();
  $('#accTitle').textContent = a ? 'Editar cuenta' : 'Nueva cuenta';
  $('#accDelete').hidden = !a;
  $('#accAdjust').hidden = !a;
  if (a) {
    f.name.value = a.name; f.kind.value = a.kind; f.initial.value = a.initial || 0;
    $('#accCalc').textContent = fmt(balances()[a.id] || 0);
  } else f.initial.value = 0;
  $('#accDialog').showModal();
}

let editingGoal = null;
function openGoal(g) {
  editingGoal = g || null;
  const f = $('#goalForm');
  f.reset();
  $('#goalTitle').textContent = g ? 'Editar' : 'Nueva meta o deuda';
  $('#goalDelete').hidden = !g;
  if (g) { f.kind.value = g.kind; f.name.value = g.name; f.target.value = g.target; f.current.value = g.current; f.deadline.value = g.deadline || ''; }
  $('#goalDialog').showModal();
}

let contribGoal = null;
function openContrib(g) {
  contribGoal = g;
  const f = $('#contribForm');
  f.reset();
  $('#contribTitle').textContent = (g.kind === 'deuda' ? 'Pago a: ' : 'Abono a: ') + g.name;
  f.date.value = today() < (startMonth() || '') + '-01' ? startMonth() + '-01' : today();
  f.asTx.checked = true;
  f.account.innerHTML = accOptions(lastAccount());
  $('#contribDialog').showModal();
}

/* ---------- archivos ---------- */
function download(name, text, type) {
  if (window.PREVIEW) { toast('Exportar funciona en tu app publicada, no en la vista previa.'); return; }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportCSV() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = live(data.transactions).sort((a, b) => a.date.localeCompare(b.date))
    .map(t => [t.date, t.type, t.category || '',
      t.type === 'transferencia' ? `${accName(t.from)} → ${accName(t.to)}` : accName(accId(t)),
      t.amount, t.note].map(q).join(','));
  download(`movimientos-${today()}.csv`, '\ufeff' + ['fecha,tipo,categoria,cuenta,monto,nota', ...rows].join('\n'), 'text/csv');
}

// Confirmación propia (en lugar de confirm(), que no se ve bien en iPhone)
function ask(msg, okLabel = 'Aceptar') {
  const d = $('#askDialog');
  $('#askText').textContent = msg;
  $('#askOk').textContent = okLabel;
  d.showModal();
  return new Promise(resolve => {
    const done = v => { d.removeEventListener('close', onClose); d.close(); resolve(v); };
    const onClose = () => resolve(false);
    d.addEventListener('close', onClose, { once: true });
    $('#askOk').onclick = () => done(true);
    $('#askCancel').onclick = () => done(false);
  });
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- eventos ---------- */
document.addEventListener('click', e => {
  const tabEl = e.target.closest('[data-tab]');
  if (tabEl) { e.preventDefault(); ui.tab = tabEl.dataset.tab; render(); window.scrollTo(0, 0); return; }
  if (e.target.closest('[data-close]')) { e.target.closest('dialog').close(); return; }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.action) {
    case 'sync': toast(cloud.error || (cloud.state === 'ok' ? 'Tus datos están al día en todos tus dispositivos' : 'Sincronizando…')); break;
    case 'auth-toggle': setAuthMode(authMode === 'signup' ? 'login' : 'signup'); break;
    case 'auth-reset': {
      const raw = $('#authForm').email.value.trim();
      if (!raw) { showAuthError('Escribe tu correo arriba y vuelve a tocar "Olvidé mi contraseña".'); break; }
      if (!raw.includes('@') || isUsernameAccount(raw)) {
        showAuthError('Las cuentas con usuario no pueden recuperar la contraseña por correo. Pide ayuda al administrador.'); break;
      }
      cloud.auth.sendPasswordResetEmail(raw)
        .then(() => toast('Te enviamos un correo para cambiar tu contraseña'))
        .catch(err => showAuthError(authErr(err)));
      break;
    }
    case 'auth-other': cloud.auth.signOut(); break;
    case 'unlock': unlock(); break;
    case 'lock-password': setAuthMode('reauth'); showScreen('auth'); break;
    case 'lock-toggle': if (lockInfo()) disableLock(); else enableLock(); break;
    case 'logout-now':
      try { localStorage.removeItem(userKey()); } catch { }
      cloud.auth.signOut(); break;
    case 'adm-approve': setUserStatus(id, 'activo'); break;
    case 'adm-unblock': setUserStatus(id, 'activo'); break;
    case 'adm-reject':
    case 'adm-block': {
      const u = cloud.users.find(x => x.uid === id);
      ask(`¿${el.dataset.action === 'adm-reject' ? 'Rechazar' : 'Bloquear'} la cuenta de ${u ? shownName(u.email) : 'este usuario'}? No podrá usar la app hasta que la desbloquees.`, el.dataset.action === 'adm-reject' ? 'Rechazar' : 'Bloquear')
        .then(ok => { if (ok) { if (ui.viewing && ui.viewing.uid === id) ui.viewing = null; setUserStatus(id, 'bloqueado'); } });
      break;
    }
    case 'adm-view': {
      const u = cloud.users.find(x => x.uid === id);
      ui.viewing = { uid: id, email: u ? u.email : '', data: null };
      render(); window.scrollTo(0, 0);
      loadUserData(id).then(d => { if (ui.viewing && ui.viewing.uid === id) { ui.viewing.data = d; render(); } })
        .catch(err => { if (ui.viewing) { ui.viewing.error = cloudErr(err); render(); } });
      break;
    }
    case 'adm-close': ui.viewing = null; render(); break;
    case 'personal-on': setPersonalMode(true); break;
    case 'personal-off': setPersonalMode(false); ui.tab = 'admin'; render(); break;
    case 'logout':
      ask('¿Cerrar sesión en este dispositivo? Tus datos quedan guardados en tu cuenta.', 'Cerrar sesión').then(ok => {
        if (!ok) return;
        try { localStorage.removeItem(userKey()); localStorage.removeItem(LS_LOCK); } catch { }
        cloud.auth.signOut();
      });
      break;
    case 'prev-month':
      if (startMonth() && shiftMonth(ui.month, -1) < startMonth()) { toast('Tus registros empiezan en ' + monthLabel(startMonth())); break; }
      ui.month = shiftMonth(ui.month, -1); render(); break;
    case 'next-month': ui.month = shiftMonth(ui.month, 1); render(); break;
    case 'filter': ui.filter = el.dataset.v; render(); break;
    case 'new-tx': openTx(); break;
    case 'edit-tx': {
      const t = data.transactions.find(t => t.id === id);
      if (t?.type === 'ajuste') {
        ask(`Ajuste de saldo de ${fmt(t.amount)} en ${accName(accId(t))}. ¿Eliminarlo?`, 'Eliminar')
          .then(ok => { if (ok) remove('transactions', id); });
      } else openTx(t);
      break;
    }
    case 'new-transfer':
      if (accounts().length < 2) { toast('Necesitas al menos dos cuentas'); break; }
      openTransfer(); break;
    case 'pay-week': {
      const lp = lastPay();
      openTx();
      const f = $('#txForm');
      setTxType('ingreso', 'Sueldo');
      if (lp) { f.amount.value = lp.amount; setPayMethod(methodOf(lp)); }
      f.date.value = el.dataset.date;
      f.note.value = 'Pago semanal';
      break;
    }
    case 'new-acc': openAcc(); break;
    case 'edit-acc': openAcc(data.accounts.find(a => a.id === id)); break;
    case 'new-goal': openGoal(); break;
    case 'edit-goal': openGoal(data.goals.find(g => g.id === id)); break;
    case 'contribute': openContrib(data.goals.find(g => g.id === id)); break;
    case 'export-json': download(`finanzas-respaldo-${today()}.json`, JSON.stringify(data, null, 1), 'application/json'); break;
    case 'export-csv': exportCSV(); break;
    case 'import-json': $('#importFile').click(); break;
  }
});

$('#payMethod').addEventListener('click', e => {
  const b = e.target.closest('[data-method]');
  if (b) setPayMethod(b.dataset.method);
});
$('#txType').addEventListener('click', e => {
  const b = e.target.closest('[data-type]');
  if (b) setTxType(b.dataset.type);
});
$('#txForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  const amount = parseAmount(f.amount.value);
  if (!amount) { toast('Ingresa un monto mayor a 0'); return; }
  const base = { id: editingTx?.id || uid(), type: txType, amount, date: f.date.value,
    note: f.note.value.trim(), createdAt: editingTx?.createdAt || now() };
  if (txType === 'transferencia') {
    if (f.account.value === f.to.value) { toast('Elige dos cuentas distintas'); return; }
    upsert('transactions', Object.assign(base, { category: 'Transferencia', from: f.account.value, to: f.to.value }));
  } else {
    let account = f.account.value;
    if (txType === 'ingreso') {
      account = methodAccount(payMethod);
      if (!account) { toast(payMethod === 'efectivo' ? 'Crea una cuenta de efectivo en Inicio' : 'Crea una cuenta bancaria en Inicio'); return; }
      try { localStorage.setItem('finanzas.ultimoMetodo', payMethod); } catch { }
    } else rememberAccount(account);
    upsert('transactions', Object.assign(base, { category: f.category.value, account }));
  }
  $('#txDialog').close();
  if (txType === 'gasto' && !editingTx) {
    const b = budgetFor(f.category.value);
    const s = spentByCat(f.date.value.slice(0, 7))[f.category.value] || 0;
    if (b && s > b) toast(`Superaste el presupuesto de ${f.category.value}`);
    else toast('Movimiento guardado');
  } else toast('Movimiento guardado');
});
$('#txDelete').addEventListener('click', () => {
  if (!editingTx) return;
  const id = editingTx.id;
  $('#txDialog').close();
  ask('¿Eliminar este movimiento?', 'Eliminar').then(ok => { if (ok) { remove('transactions', id); toast('Movimiento eliminado'); } });
});

$('#accForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  const initial = Number(String(f.initial.value || 0).replace(',', '.')) || 0;
  const acc = Object.assign({}, editingAcc || { id: uid() },
    { name: f.name.value.trim(), kind: f.kind.value, initial, updatedAt: now() });
  const i = data.accounts.findIndex(a => a.id === acc.id);
  if (i >= 0) data.accounts[i] = acc; else data.accounts.push(acc);
  let msg = editingAcc ? 'Cuenta actualizada' : 'Cuenta creada';
  if (editingAcc && f.real.value !== '') {
    const real = Number(String(f.real.value).replace(',', '.'));
    const diff = Math.round((real - (balances()[acc.id] || 0)) * 100) / 100;
    if (Number.isFinite(real) && diff !== 0) {
      data.transactions.push({ id: uid(), type: 'ajuste', amount: diff, category: 'Ajuste', account: acc.id,
        date: today() < (startMonth() || '') + '-01' ? startMonth() + '-01' : today(), note: '', createdAt: now(), updatedAt: now() });
      msg = `Saldo cuadrado (${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))})`;
    }
  }
  $('#accDialog').close();
  commit(); toast(msg);
});
$('#accDelete').addEventListener('click', () => {
  if (!editingAcc) return;
  const id = editingAcc.id;
  const used = live(data.transactions).some(t => accId(t) === id || t.from === id || t.to === id);
  if (used) { toast('Esta cuenta tiene movimientos; no se puede eliminar'); return; }
  if (accounts().length <= 1) { toast('Debe quedar al menos una cuenta'); return; }
  $('#accDialog').close();
  ask(`¿Eliminar la cuenta ${editingAcc.name}?`, 'Eliminar').then(ok => { if (ok) remove('accounts', id); });
});

$('#goalForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  upsert('goals', {
    id: editingGoal?.id || uid(), kind: f.kind.value, name: f.name.value.trim(),
    target: parseAmount(f.target.value), current: parseAmount(f.current.value), deadline: f.deadline.value || '',
  });
  $('#goalDialog').close();
});
$('#goalDelete').addEventListener('click', () => {
  if (!editingGoal) return;
  const id = editingGoal.id;
  $('#goalDialog').close();
  ask('¿Eliminar esta meta?', 'Eliminar').then(ok => { if (ok) remove('goals', id); });
});

$('#contribForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  const amount = parseAmount(f.amount.value);
  if (!amount || !contribGoal) return;
  const isDebt = contribGoal.kind === 'deuda';
  if (f.asTx.checked) {
    const cat = isDebt ? 'Pago de deudas' : 'Ahorro';
    if (!data.settings.categories.gasto.includes(cat)) {
      data.settings.categories.gasto.push(cat); data.settings.updatedAt = now();
    }
    data.transactions.push({ id: uid(), type: 'gasto', amount, category: cat, date: f.date.value, account: f.account.value,
      note: contribGoal.name, createdAt: now(), updatedAt: now() });
  }
  upsert('goals', Object.assign({}, contribGoal, { current: (contribGoal.current || 0) + amount }));
  $('#contribDialog').close();
  toast(isDebt ? 'Pago registrado' : 'Abono registrado');
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.budget !== undefined) {
    const cat = el.dataset.budget, amount = parseAmount(el.value);
    if (amount) upsert('budgets', { id: 'b:' + cat, category: cat, amount });
    else remove('budgets', 'b:' + cat);
  }
  if (el.id === 'importFile' && el.files[0]) {
    el.files[0].text().then(txt => {
      const imported = normalize(JSON.parse(txt));
      data = mergeData(data, imported); commit();
      toast('Respaldo importado');
    }).catch(() => toast('El archivo no es un respaldo válido'));
    el.value = '';
  }
});

document.addEventListener('submit', e => {
  if (e.target.id === 'authForm') {
    e.preventDefault();
    const f = e.target;
    const raw = f.email.value.trim(), pass = f.password.value;
    if (!raw.includes('@') && !USER_RE.test(raw.toLowerCase())) {
      showAuthError('El usuario debe tener entre 2 y 30 caracteres: letras, números, punto, guion o guion bajo (sin espacios ni tildes).');
      return;
    }
    const email = toLoginEmail(raw);
    const btn = $('#authSubmit');
    btn.disabled = true;
    const done = () => { btn.disabled = false; };
    if (authMode === 'reauth') {
      cloud.auth.signInWithEmailAndPassword(email, pass)
        .then(() => { unlocked = true; f.password.value = ''; showScreen('app'); render(); })
        .catch(err => showAuthError(authErr(err))).finally(done);
    } else if (authMode === 'signup') {
      cloud.auth.createUserWithEmailAndPassword(email, pass)
        .then(() => { f.password.value = ''; toast('¡Cuenta creada!'); setAuthMode('login'); })
        .catch(err => showAuthError(authErr(err))).finally(done);
    } else {
      cloud.auth.signInWithEmailAndPassword(email, pass)
        .then(() => { f.password.value = ''; })
        .catch(err => showAuthError(authErr(err))).finally(done);
    }
  }
  if (e.target.id === 'prefform') {
    e.preventDefault();
    const f = e.target;
    const lines = s => [...new Set(s.split('\n').map(x => x.trim()).filter(Boolean))];
    const gasto = lines(f.gasto.value), ingreso = lines(f.ingreso.value);
    if (!gasto.length || !ingreso.length) { toast('Deja al menos una categoría de cada tipo'); return; }
    data.settings = { currency: f.currency.value, startMonth: f.startMonth.value, payday: Number(f.payday.value), categories: { gasto, ingreso }, updatedAt: now() };
    if (ui.month < data.settings.startMonth) ui.month = data.settings.startMonth;
    commit(); toast('Preferencias guardadas');
  }
});


/* ---------- inicio ---------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
cloudInit();
