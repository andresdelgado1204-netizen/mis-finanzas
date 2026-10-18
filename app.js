'use strict';
/* =========================================================
   Mis Finanzas — app local-first con sincronización a un
   repositorio privado de GitHub (API de contenidos).
   ========================================================= */

const LS_DATA = 'finanzas.data.v1';
const LS_CFG = 'finanzas.github.v1';
const API = 'https://api.github.com';

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

let data = normalize(readJSON(LS_DATA) || window.PREVIEW_DATA);
let cfg = Object.assign({ owner: '', repo: '', path: 'finanzas.json', token: '', lastSync: 0 }, readJSON(LS_CFG) || {});
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
function save() { writeJSON(LS_DATA, data); }
function commit() { version++; save(); render(); scheduleSync(); }
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

/* ---------- GitHub ---------- */
const ghReady = () => !!(cfg.token && cfg.owner && cfg.repo && cfg.path);
function ghUrl() {
  return `${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`;
}
function ghHeaders(extra) {
  return Object.assign({ Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, extra || {});
}
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
async function ghError(r) {
  let msg = '';
  try { msg = (await r.json()).message || ''; } catch { }
  if (r.status === 401) return 'Token inválido o vencido. Crea uno nuevo en GitHub.';
  if (r.status === 403) return 'El token no tiene permiso de escritura (Contents: Read and write).';
  if (r.status === 404) return 'No se encontró el repositorio, o el token no tiene acceso a él.';
  return `GitHub respondió ${r.status}${msg ? ': ' + msg : ''}`;
}
function deviceName() {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  return 'navegador';
}
async function pull() {
  const r = await fetch(ghUrl(), { headers: ghHeaders(), cache: 'no-store' });
  if (r.status === 404) {
    // ¿No existe el archivo, o no existe el repo? Lo distinguimos.
    const rr = await fetch(`${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`, { headers: ghHeaders(), cache: 'no-store' });
    if (!rr.ok) throw new Error(await ghError(rr));
    return null; // repo ok, archivo aún no creado
  }
  if (!r.ok) throw new Error(await ghError(r));
  const j = await r.json();
  let text = j.content ? b64decode(j.content) : '';
  if (!text && j.size > 0) { // archivos > 1 MB vienen sin contenido
    const r2 = await fetch(ghUrl(), { headers: ghHeaders({ Accept: 'application/vnd.github.raw+json' }), cache: 'no-store' });
    if (!r2.ok) throw new Error(await ghError(r2));
    text = await r2.text();
  }
  let parsed;
  try { parsed = text ? JSON.parse(text) : emptyData(); } catch { throw new Error(`El archivo ${cfg.path} no es un JSON válido.`); }
  return { sha: j.sha, data: normalize(parsed) };
}
function push(d, sha) {
  const body = { message: `Actualizar finanzas desde ${deviceName()}`, content: b64encode(JSON.stringify(d, null, 1)) };
  if (sha) body.sha = sha;
  return fetch(ghUrl(), { method: 'PUT', headers: ghHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
}

let syncing = false, syncAgain = false, syncTimer = null, lastAuto = 0;
const syncState = { kind: '', msg: '' };
function scheduleSync() { if (!ghReady()) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(), 2500); }
function setSync(kind, msg) { syncState.kind = kind; syncState.msg = msg; renderSyncStatus(); }
function userIsTyping() {
  const a = document.activeElement;
  return !!document.querySelector('dialog[open]') || (a && a.matches('input, textarea, select'));
}
async function sync(manual) {
  if (window.PREVIEW) { if (manual) toast('En la vista previa no se sincroniza; funciona en tu app publicada.'); return; }
  if (!ghReady()) { if (manual) { toast('Configura GitHub en Ajustes'); ui.tab = 'ajustes'; render(); } return; }
  if (!navigator.onLine) { setSync('err', 'Sin conexión'); return; }
  if (syncing) { syncAgain = true; return; }
  syncing = true; lastAuto = now();
  setSync('busy', 'Sincronizando…');
  const startVersion = version;
  try {
    for (let attempt = 0; ; attempt++) {
      const remote = await pull();
      const before = canon(data);
      const merged = remote ? mergeData(data, remote.data) : mergeData(emptyData(), data);
      const localChanged = canon(merged) !== before;
      data = merged; save();
      if (localChanged && !userIsTyping()) render();
      if (remote && canon(remote.data) === canon(merged)) break; // nada que subir
      const r = await push(merged, remote?.sha);
      if (r.ok) break;
      if ((r.status === 409 || r.status === 422) && attempt < 3) continue; // otro dispositivo escribió justo antes
      throw new Error(await ghError(r));
    }
    cfg.lastSync = now(); writeJSON(LS_CFG, cfg);
    setSync('ok', 'Sincronizado');
    if (manual) toast('Datos sincronizados');
  } catch (e) {
    setSync('err', e.message || 'Error al sincronizar');
    if (manual) toast(e.message || 'Error al sincronizar');
  } finally {
    syncing = false;
    if (syncAgain || version !== startVersion) { syncAgain = false; scheduleSync(); }
  }
}
function renderSyncStatus() {
  const b = $('#syncBtn');
  if (!b) return;
  let kind = syncState.kind, msg = syncState.msg;
  if (window.PREVIEW) { kind = ''; msg = 'Vista previa'; }
  else if (!ghReady()) { kind = ''; msg = 'Solo en este dispositivo'; }
  else if (!msg) msg = cfg.lastSync ? 'Toca para sincronizar' : 'Sin sincronizar';
  b.className = 'sync ' + kind;
  b.querySelector('span').textContent = msg;
  b.title = kind === 'err' ? msg : (cfg.lastSync ? 'Última sincronización: ' + new Date(cfg.lastSync).toLocaleString('es-CL') : 'Sincronizar ahora');
  const det = $('#syncDetail');
  if (det) det.textContent = ghReady()
    ? (kind === 'err' ? '⚠️ ' + msg : cfg.lastSync ? 'Última sincronización: ' + new Date(cfg.lastSync).toLocaleString('es-CL') : '')
    : '';
}

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
      <section class="card"><h3>Sincronización con GitHub</h3>
        <p class="muted" style="margin-bottom:12px">Tus datos se guardan en un archivo dentro de un repositorio <b>privado</b>. Ingresa los mismos datos en cada dispositivo.</p>
        <form id="ghform" class="form">
          <label>Tu usuario de GitHub<input name="owner" value="${esc(cfg.owner)}" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" placeholder="tu-usuario" required></label>
          <label>Repositorio privado de datos<input name="repo" value="${esc(cfg.repo)}" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" placeholder="finanzas-datos" required></label>
          <label>Archivo<input name="path" value="${esc(cfg.path)}" autocapitalize="off" autocorrect="off" spellcheck="false" required></label>
          <label>Token de acceso (fine-grained)<input name="token" type="password" value="${esc(cfg.token)}" autocomplete="off" placeholder="github_pat_…" required></label>
          <div class="row-end">
            ${cfg.token ? '<button type="button" class="btn ghost danger" data-action="gh-disconnect">Desconectar</button>' : ''}
            <button class="btn">Guardar y sincronizar</button>
          </div>
        </form>
        <p id="syncDetail" class="muted"></p>
      </section>

      <section class="card"><h3>Preferencias</h3>
        <form id="prefform" class="form">
          <label>Empiezo a registrar en<select name="startMonth">${(() => {
            const opts = []; let m = shiftMonth(thisMonth(), -12);
            for (let i = 0; i < 25; i++, m = shiftMonth(m, 1)) opts.push(m);
            if (startMonth() && !opts.includes(startMonth())) opts.unshift(startMonth());
            return opts.map(x => `<option value="${x}" ${x === startMonth() ? 'selected' : ''}>${monthLabel(x)}</option>`).join('');
          })()}</select></label>
          <label>Me pagan cada semana el día<select name="payday">${DAYS.map((d, i) => `<option value="${i}" ${i === payday() ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
          <label>Moneda<select name="currency">${CURRENCIES.map(x => `<option ${x === data.settings.currency ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <label>Categorías de gasto (una por línea)<textarea name="gasto" rows="7">${esc(c.gasto.join('\n'))}</textarea></label>
          <label>Categorías de ingreso (una por línea)<textarea name="ingreso" rows="4">${esc(c.ingreso.join('\n'))}</textarea></label>
          <p class="muted" style="margin:-4px 0 10px">Renombrar una categoría no cambia los movimientos ya guardados con el nombre anterior.</p>
          <div class="row-end"><button class="btn">Guardar preferencias</button></div>
        </form>
      </section>

      <section class="card"><h3>Tus datos</h3>
        <div class="btngrid">
          <button class="btn ghost" data-action="export-json">Exportar respaldo (JSON)</button>
          <button class="btn ghost" data-action="export-csv">Exportar movimientos (CSV)</button>
          <button class="btn ghost" data-action="import-json">Importar respaldo</button>
          <button class="btn ghost danger" data-action="wipe-local">Borrar datos de este dispositivo</button>
        </div>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
        <p class="muted">${live(data.transactions).length} movimientos · ${live(data.goals).length} metas guardadas.</p>
      </section>`;
  },
};

function render() {
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
    case 'sync': sync(true); break;
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
    case 'gh-disconnect':
      ask('¿Quitar la conexión con GitHub en este dispositivo? Tus datos locales se mantienen.', 'Desconectar').then(ok => {
        if (!ok) return;
        cfg = { owner: '', repo: '', path: 'finanzas.json', token: '', lastSync: 0 };
        writeJSON(LS_CFG, cfg); setSync('', ''); render();
      });
      break;
    case 'export-json': download(`finanzas-respaldo-${today()}.json`, JSON.stringify(data, null, 1), 'application/json'); break;
    case 'export-csv': exportCSV(); break;
    case 'import-json': $('#importFile').click(); break;
    case 'wipe-local':
      ask(ghReady()
        ? '¿Borrar los datos guardados en este dispositivo? Se volverán a descargar desde GitHub.'
        : '¿Borrar todos tus datos? No tienes GitHub configurado, así que no se podrán recuperar.', 'Borrar').then(ok => {
        if (!ok) return;
        data = emptyData(); save(); render();
        if (ghReady()) sync(true);
      });
      break;
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
  if (e.target.id === 'ghform') {
    e.preventDefault();
    const f = e.target;
    cfg.owner = f.owner.value.trim();
    cfg.repo = f.repo.value.trim();
    cfg.path = f.path.value.trim().replace(/^\/+/, '') || 'finanzas.json';
    cfg.token = f.token.value.trim();
    writeJSON(LS_CFG, cfg);
    sync(true);
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

window.addEventListener('online', () => sync());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && now() - lastAuto > 30000) sync();
});

/* ---------- inicio ---------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
render();
sync();
