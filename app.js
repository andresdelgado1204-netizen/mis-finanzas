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
const ACCENTS = [
  { key: 'azul', name: 'Azul', color: '#435dcc' },
  { key: 'marino', name: 'Marino', color: '#203c6b' },
  { key: 'turquesa', name: 'Turquesa', color: '#0b7f77' },
  { key: 'verde', name: 'Verde', color: '#2f7a50' },
  { key: 'grafito', name: 'Grafito', color: '#3d4552' },
  { key: 'morado', name: 'Morado', color: '#6a43bb' },
  { key: 'rosa', name: 'Rosa', color: '#b23c6f' },
  { key: 'terracota', name: 'Terracota', color: '#ad512a' },
  { key: 'dorado', name: 'Dorado', color: '#8a6508' },
];
// Color de la sesión: el que eligió la persona, o uno asignado según su cuenta
function sessionAccent() {
  const chosen = data.settings.accentColor;
  if (ACCENTS.some(a => a.key === chosen)) return chosen;
  const uid = cloud.user ? cloud.user.uid : '';
  if (!uid) return '';
  let h = 0; for (const ch of uid) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ACCENTS[h % ACCENTS.length].key;
}
function applyAccent() {
  const k = sessionAccent();
  if (k) document.documentElement.dataset.accent = k; else delete document.documentElement.dataset.accent;
  // la barra del teléfono toma el mismo fondo
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) { const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); if (bg) meta.content = bg; }
}
const CURRENCY_NAMES = { CLP: 'Peso chileno', USD: 'Dólar estadounidense', EUR: 'Euro', ARS: 'Peso argentino', PEN: 'Sol peruano',
  COP: 'Peso colombiano', MXN: 'Peso mexicano', BRL: 'Real brasileño', UYU: 'Peso uruguayo' };

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
// Reinicio de todas las cuentas solicitado por el propietario el 18-10-2026.
// La marca evita que las copias anteriores vuelvan a traer registros al sincronizar.
const FINANCE_RESET_AT = 1792353164369;
function resetOldFinancialItem(list, item) {
  const stamp = list === 'accounts' ? (item.updatedAt || 0) : (item.createdAt || item.updatedAt || 0);
  if (stamp >= FINANCE_RESET_AT) return item;
  if (list === 'accounts') {
    const original = DEFAULT_ACCOUNTS.find(a => a.id === item.id);
    if (original) return { ...original, initial: 0, updatedAt: FINANCE_RESET_AT };
  }
  return { id: item.id, deleted: true, updatedAt: FINANCE_RESET_AT };
}
function resetOldFinancialData(d) {
  if ((d.settings.financeResetAt || 0) < FINANCE_RESET_AT) {
    const reserves = d.settings.salaryReserves || { emergency: 10, savings: 10 };
    d.settings = { ...emptyData().settings, salaryReserves: reserves, financeResetAt: FINANCE_RESET_AT, updatedAt: Math.max(FINANCE_RESET_AT, d.settings.updatedAt || 0) };
  }
  for (const list of ['transactions', 'budgets', 'goals', 'accounts']) d[list] = d[list].map(item => resetOldFinancialItem(list, item));
  for (const account of DEFAULT_ACCOUNTS) if (!d.accounts.some(a => a.id === account.id)) d.accounts.push({ ...account, initial: 0, updatedAt: FINANCE_RESET_AT });
  return d;
}

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
  return resetOldFinancialData(d);
}

let data = normalize(window.PREVIEW_DATA || null);
const startMonth = () => data.settings.startMonth || '';
const ui = { tab: 'inicio', month: thisMonth(), filter: 'todos' };
if (startMonth() > ui.month) ui.month = startMonth();
let version = 0; // cambia con cada edición local

function restoreView(uid) {
  ui.tab = 'inicio'; ui.month = thisMonth(); ui.filter = 'todos';
  try {
    const saved = JSON.parse(sessionStorage.getItem('finanzas.view.' + uid) || 'null');
    if (!saved) return;
    if (['inicio', 'movimientos', 'presupuesto', 'metas', 'ajustes', 'admin'].includes(saved.tab)) ui.tab = saved.tab;
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(saved.month || '')) ui.month = saved.month;
    if (['todos', 'gasto', 'ingreso'].includes(saved.filter)) ui.filter = saved.filter;
  } catch { }
}
function rememberView() {
  if (!cloud.user) return;
  try {
    sessionStorage.setItem('finanzas.view.' + cloud.user.uid, JSON.stringify({ tab: ui.tab, month: ui.month, filter: ui.filter }));
  } catch { }
}


const live = arr => arr.filter(x => !x.deleted);
function fmt(n) {
  const cur = data.settings.currency;
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: cur, maximumFractionDigits: cur === 'CLP' ? 0 : 2 }).format(n || 0);
  } catch { return (n || 0).toLocaleString('es-CL'); }
}
const txOfMonth = m => live(data.transactions).filter(t => t.date && t.date.startsWith(m));
/* Reservas guardadas en el propio sueldo: sin movimientos duplicados. */
function reserveRates() {
  const raw = data.settings.salaryReserves || { emergency: 10, savings: 10 };
  const emergency = Math.max(0, Math.min(100, Number(raw.emergency) || 0));
  const savings = Math.max(0, Math.min(100 - emergency, Number(raw.savings) || 0));
  return { emergency, savings };
}
function salaryReserves(amount, rates) {
  const scale = data.settings.currency === 'CLP' ? 1 : 100;
  const emergency = Math.floor(amount * rates.emergency / 100 * scale) / scale;
  const savings = Math.floor(amount * rates.savings / 100 * scale) / scale;
  return { emergency, savings, rates: { ...rates } };
}
function reservedAmounts(txs = live(data.transactions)) {
  return txs.reduce((out, t) => {
    if (t.type === 'ingreso' && t.category === 'Sueldo' && t.reserves) {
      out.emergency += Number(t.reserves.emergency) || 0;
      out.savings += Number(t.reserves.savings) || 0;
    }
    out.total = out.emergency + out.savings;
    return out;
  }, { emergency: 0, savings: 0, total: 0 });
}
function occasionalExpenses(month = ui.month) {
  return txOfMonth(month).filter(t => t.type === 'gasto' && !t.budgetMonth)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
}
function occasionalHomeCard() {
  const expenses = occasionalExpenses();
  const total = expenses.reduce((sum, item) => sum + item.amount, 0);
  return `<section class="card occasional-summary">
    <div class="summary-head"><h3>Movimientos</h3><a href="#" data-tab="movimientos">Ver movimientos →</a></div>
    <p class="occasional-total neg">${fmt(total)}</p>
    <p class="muted">Total del mes seleccionado · separado de tus gastos mensuales.</p>
    ${expenses.length ? `<details class="occasional-details"><summary>Ver detalle (${expenses.length})</summary>
      <ul class="txlist">${expenses.map(t => txRow(t).replace('</small>', ` · ${esc(fmtDate(t.date))}</small>`)).join('')}</ul>
    </details>` : '<p class="muted">Aquí aparecerán los gastos que agregues con un nombre, como una salida o una reparación.</p>'}
    <button type="button" class="btn wide" data-action="new-tx">+ Agregar movimiento</button>
  </section>`;
}
function reservesCard() {
  const rates = reserveRates(), saved = reservedAmounts();
  const period = isAdmin() ? 'semanal' : 'mensual';
  return `<section class="card reserves"><h3>Separa parte de tu sueldo</h3>
    <p class="muted">De cada sueldo ${period} nuevo se reserva una parte para tus dos fondos. Otros ingresos quedan completos.</p>
    <div class="reserve-grid">
      <div><span>🛟 Fondo de emergencia</span><b>${fmt(saved.emergency)}</b></div>
      <div><span>🌱 Ahorro</span><b>${fmt(saved.savings)}</b></div>
    </div>
    <form id="reservesForm" class="form">
      <div class="reserve-grid">
        <label>Emergencia (%)<input name="emergency" type="number" min="0" max="100" step="0.1" value="${rates.emergency}" required inputmode="decimal"></label>
        <label>Ahorro (%)<input name="savings" type="number" min="0" max="100" step="0.1" value="${rates.savings}" required inputmode="decimal"></label>
      </div>
      <p class="muted">Disponible para gastar: ${100 - rates.emergency - rates.savings}% de cada sueldo. Usa 0% para desactivar un fondo.</p>
      <button class="btn wide">Guardar porcentajes</button>
    </form>
    <p class="muted">Se aplica a nuevos movimientos de categoría «Sueldo». Los sueldos anteriores no cambian. Es una reserva en la app: el dinero permanece en tu banco o efectivo y no se registra como gasto.</p>
  </section>`;
}

function totals(m) {
  let inc = 0, exp = 0;
  for (const t of txOfMonth(m)) { if (t.type === 'ingreso') inc += t.amount; else if (t.type === 'gasto') exp += t.amount; }
  const reserved = reservedAmounts(txOfMonth(m)).total;
  return { inc, exp, reserved, bal: inc - exp - reserved };
}
function spentByCat(m) {
  const o = {};
  for (const t of txOfMonth(m)) if (t.type === 'gasto') o[t.category] = (o[t.category] || 0) + t.amount;
  return o;
}
/* ---------- cuentas (efectivo, banco…) ---------- */
const LS_LASTACC = 'finanzas.ultimaCuenta';
const accId = t => t.account || 'banco';
const allAccounts = () => live(data.accounts);
// Preferencia de cada persona: 'ambos' | 'efectivo' | 'banco'
const accountMode = () => (['efectivo', 'banco'].includes(data.settings.accountMode) ? data.settings.accountMode : 'ambos');
const accounts = () => {
  const m = accountMode();
  return allAccounts().filter(a => m === 'ambos' || (m === 'efectivo' ? a.kind === 'efectivo' : a.kind !== 'efectivo'));
};
function setAccountMode(m) {
  data.settings = Object.assign({}, data.settings, { accountMode: m, updatedAt: now() });
  // si no hay una cuenta del tipo elegido, se crea (o se recupera la original)
  const need = m === 'ambos' ? ['efectivo', 'banco'] : [m];
  for (const kind of need) {
    const has = allAccounts().some(a => (kind === 'efectivo' ? a.kind === 'efectivo' : a.kind !== 'efectivo'));
    if (!has) {
      const id = kind;
      const i = data.accounts.findIndex(a => a.id === id);
      const acc = { id, name: kind === 'efectivo' ? 'Efectivo' : 'Banco', kind, initial: 0, updatedAt: now() };
      if (i >= 0) data.accounts[i] = acc; else data.accounts.push(acc);
    }
  }
  if (m !== 'ambos') { try { localStorage.setItem('finanzas.ultimoMetodo', m === 'efectivo' ? 'efectivo' : 'transferencia'); } catch { } }
  commit();
  toast(m === 'ambos' ? 'Mi dinero muestra Efectivo y Banco' : m === 'efectivo' ? 'Mi dinero muestra solo Efectivo' : 'Mi dinero muestra solo Banco');
}
const accName = id => (data.accounts.find(a => a.id === id && !a.deleted) || { name: 'Cuenta eliminada' }).name;
const accIcon = a => (a.kind === 'efectivo' ? '💵' : '🏦');
function balances() {
  const bal = {};
  for (const a of allAccounts()) bal[a.id] = a.initial || 0;
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

function monthlyPayCard() {
  const month = ui.month;
  const txs = live(data.transactions).filter(t => t.date.startsWith(month));
  let inc = 0, exp = 0;
  for (const t of txs) {
    if (t.type === 'ingreso') inc += t.amount;
    else if (t.type === 'gasto') exp += t.amount;
  }
  const reserved = reservedAmounts(txs).total;
  const left = inc - exp - reserved;
  const pays = txs.filter(isPay);
  const paid = pays.reduce((sum, t) => sum + t.amount, 0);
  const first = month + '-01';
  const next = shiftMonth(month, 1) + '-01';
  const current = today();
  const date = current >= first && current < next ? current : first;
  const daysLeft = daysBetween(date, next);
  return `<section class="card week">
    <div class="weekhead"><h3>Pago mensual</h3><span class="muted">${monthLabel(month)}</span></div>
    <div class="weekgrid">
      <div><small>Recibiste</small><b class="pos">${fmt(inc)}</b></div>
      <div><small>Gastaste</small><b class="neg">${fmt(exp)}</b></div>
      <div><small>Disponible</small><b class="${left >= 0 ? '' : 'neg'}">${fmt(left)}</b></div>
    </div>
    ${reserved > 0 ? `<p class="muted">Reservado para emergencia y ahorro: <b>${fmt(reserved)}</b> · descontado del disponible.</p>` : ''}
    ${inc > 0 ? progress(exp + reserved, inc) : ''}
    ${inc > 0 && left > 0 && current < next ? `<p class="muted">Puedes gastar unos <b>${fmt(Math.floor(left / daysLeft))}</b> por día hasta fin de mes.</p>` : ''}
    ${pays.length ? `<p class="payok">✓ Pago del mes registrado: ${fmt(paid)}</p>` : `<button class="btn wide" data-action="pay-month" data-date="${date}">Registrar pago del mes</button>`}
    <p class="muted">Resumen del mes completo. Puedes registrar ingresos adicionales en Movimientos.</p>
  </section>`;
}

function weekCard() {
  const ws = weekStart(refDay()), we = addDays(ws, 6), next = addDays(ws, 7);
  const txs = live(data.transactions).filter(t => t.date >= ws && t.date <= we);
  let inc = 0, exp = 0;
  for (const t of txs) { if (t.type === 'ingreso') inc += t.amount; else if (t.type === 'gasto') exp += t.amount; }
  const reserved = reservedAmounts(txs).total;
  const left = inc - exp - reserved;
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
      <div><small>Disponible</small><b class="${left >= 0 ? '' : 'neg'}">${fmt(left)}</b></div>
    </div>
    ${reserved > 0 ? `<p class="muted">Reservado para emergencia y ahorro: <b>${fmt(reserved)}</b> · descontado del disponible.</p>` : ''}
    ${inc > 0 ? progress(exp + reserved, inc) : ''}
    ${inc > 0 && left > 0 ? `<p class="muted">Puedes gastar unos <b>${fmt(Math.floor(left / daysLeft))}</b> por día hasta el próximo pago.</p>` : ''}
    ${payLine}
    <p class="muted">${nextLine} · ${monthLabel(m).split(' ')[0]} tiene ${paydaysInMonth(m)} ${dayName.endsWith('s') ? dayName : dayName + 's'} de pago.</p>
  </section>`;
}

function defaultBudgetRepeat(category) {
  const name = category.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /\b(luz|agua|telefono|arriendo|pasajes)\b/.test(name);
}
function budgetMonth(b) { return b.month || startMonth() || thisMonth(); }
function budgetRepeats(b) { return typeof b.repeat === 'boolean' ? b.repeat : defaultBudgetRepeat(b.category || ''); }
function activeBudget(cat, month = ui.month) {
  const candidates = data.budgets.filter(b => b.category === cat && budgetMonth(b) <= month);
  candidates.sort((a, b) => budgetMonth(b).localeCompare(budgetMonth(a)) || (b.updatedAt || 0) - (a.updatedAt || 0));
  const selected = candidates[0];
  return selected && !selected.deleted && (budgetRepeats(selected) || budgetMonth(selected) === month) ? selected : null;
}
function budgetCats() {
  return [...new Set(data.budgets.map(b => b.category).filter(c => c && c !== 'Gastos ocasionales'))].filter(c => activeBudget(c));
}
function budgetFor(cat, month = ui.month) { return activeBudget(cat, month)?.amount || 0; }
function saveBudgetMonth(cat, amount, repeat, deleted = false) {
  upsert('budgets', { id: 'b:' + cat + ':' + ui.month, category: cat, month: ui.month,
    amount, repeat, deleted, createdAt: now() });
}
function budgetPaymentId(cat, month) {
  const id = 'budget-pay:' + month + ':' + cat;
  const existing = data.transactions.find(t => t.id === id && !t.deleted);
  return existing && (existing.type !== 'gasto' || existing.category !== cat || existing.budgetMonth !== month || !existing.date.startsWith(month)) ? id + ':' + uid() : id;
}
function budgetPayment(cat, month = ui.month) {
  return live(data.transactions).find(t => t.type === 'gasto' && t.amount > 0 && t.category === cat && t.budgetMonth === month && t.date.startsWith(month));
}
function budgetPaidControl(cat) {
  const paid = budgetPayment(cat), amount = budgetFor(cat);
  return `<label class="budget-repeat budget-paid"><input type="checkbox" data-budget-pay="${esc(cat)}" ${paid ? 'checked' : ''} ${paid || amount > 0 ? '' : 'disabled'}>
    ${paid ? `Pagado: ${fmt(paid.amount)} · ${esc(accName(accId(paid)))}` : 'Marcar como pagado'}</label>
    ${paid ? `<button type="button" class="btn ghost edit-budget-payment" data-action="edit-tx" data-id="${esc(paid.id)}">Editar pago</button>` : ''}`;
}
function budgetBulkControl() {
  const payable = budgetCats().filter(c => budgetFor(c) > 0);
  const pending = payable.filter(c => !budgetPayment(c));
  return `<label class="budget-repeat budget-pay-all"><input type="checkbox" data-budget-pay-all ${payable.length && !pending.length ? 'checked' : ''} ${pending.length ? '' : 'disabled'}> ${pending.length ? `Pagar todos los pendientes (${pending.length})` : (payable.length ? 'Todos los pagos registrados' : 'Agrega montos para registrar pagos')}</label>`;
}
let pendingBulkPayment = null;
function openBulkBudgetPayment() {
  const month = ui.month;
  const items = budgetCats().filter(c => budgetFor(c) > 0 && !budgetPayment(c)).map(cat => ({ cat, amount: budgetFor(cat) }));
  if (!items.length) return;
  pendingBulkPayment = { month, items };
  const f = $('#bulkBudgetForm'); f.reset();
  $('#bulkBudgetTotal').textContent = fmt(items.reduce((sum, item) => sum + item.amount, 0));
  const spent = spentByCat(month);
  $('#bulkBudgetRows').innerHTML = items.map((item, index) => `<div class="bulk-budget-row"><b>${esc(item.cat)} · ${fmt(item.amount)}</b>
    ${spent[item.cat] > 0 ? `<p class="muted">Ya hay ${fmt(spent[item.cat])} registrados en esta categoría; este pago se sumará.</p>` : ''}
    <label>Cuenta para ${esc(item.cat)}<select name="account-${index}" required><option value="" disabled selected>Elige una cuenta</option>${accOptions('')}</select></label></div>`).join('');
  f.date.min = month + '-01'; f.date.max = addDays(shiftMonth(month, 1) + '-01', -1);
  f.date.value = today().startsWith(month) ? today() : month + '-01';
  $('#bulkBudgetDialog').showModal();
}
let pendingBudgetPayment = null;
function openBudgetPayment(cat) {
  const amount = budgetFor(cat);
  if (budgetPayment(cat) || !(amount > 0)) { render(); return; }
  pendingBudgetPayment = { cat, month: ui.month, amount };
  const f = $('#budgetPayForm');
  f.reset();
  $('#budgetPayTitle').textContent = 'Pagar ' + cat;
  $('#budgetPayAmount').textContent = fmt(amount);
  f.account.innerHTML = '<option value="" disabled selected>Elige una cuenta</option>' + accOptions('');
  f.date.min = ui.month + '-01';
  f.date.max = addDays(shiftMonth(ui.month, 1) + '-01', -1);
  f.date.value = today().startsWith(ui.month) ? today() : ui.month + '-01';
  const spent = spentByCat(ui.month)[cat] || 0;
  $('#budgetPayNotice').textContent = spent > 0 ? `Ya tienes ${fmt(spent)} en gastos de esta categoría este mes. Este pago agregará ${fmt(amount)} adicionales; revisa que no estés registrando el mismo pago dos veces.` : 'Se registrará como gasto y se descontará de la cuenta que elijas.';
  $('#budgetPayDialog').showModal();
}
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
  if (c.includes('unavailable') || !navigator.onLine) return 'Sin conexión: tus cambios se guardan y se subirán solos cuando vuelva internet.';
  return 'No se pudo sincronizar todavía. Se reintentará automáticamente.';
}
function setCloud(state, error = '') { cloud.state = state; cloud.error = error; renderSyncStatus(); }

async function cloudInit() {
  if (window.PREVIEW) { showScreen('app'); render(); return; }
  const cfgOk = window.FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId;
  if (!window.firebase || !cfgOk) { showScreen('setup'); return; }
  firebase.initializeApp(FIREBASE_CONFIG);
  cloud.auth = firebase.auth();
  try { await cloud.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch { }
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

function nameFromEmail(email) {
  const local = String(email || '').split('@')[0];
  return local.split(/[._\-]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ') || 'Mis';
}
const personName = (p, email) => (p && p.name && p.name.trim()) || nameFromEmail(email);
const myName = () => (cloud.user ? personName(cloud.profile, cloud.user.email) : '');
function renderBrand() {
  const n = myName();
  const title = n ? `Finanzas de ${n}` : 'Mis Finanzas';
  $('.brand').textContent = title;
  document.title = title;
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
  restoreView(u.uid);
  if (startMonth() > ui.month) ui.month = startMonth();
  unlocked = !lockInfo() || restoreAfterReload(u.uid);
  setStatusScreen('loading');
  // El perfil dice si la cuenta está aprobada, pendiente o bloqueada
  watchProfile();
}
function watchProfile() {
  if (!cloud.user) return;
  const uid = cloud.user.uid;
  cloud.profileUnsub = profileRef(uid).onSnapshot({ includeMetadataChanges: true },
    doc => onProfile(doc),
    () => { // reintentar en silencio
      cloud.profileUnsub = null;
      setTimeout(() => { if (cloud.user && cloud.user.uid === uid && !cloud.profileUnsub) watchProfile(); }, 3000);
    });
}

function onProfile(doc) {
  if (!doc.exists) {
    if (doc.metadata.fromCache) return; // esperar respuesta del servidor
    const t = now();
    profileRef(cloud.user.uid).set({ email: cloud.user.email, name: nameFromEmail(cloud.user.email), createdAt: t, lastSeen: t, status: 'activo' })
      .catch(() => setTimeout(() => { if (cloud.user && cloud.profileUnsub) { cloud.profileUnsub(); cloud.profileUnsub = null; watchProfile(); } }, 3000));
    return;
  }
  if (doc.metadata.hasPendingWrites) return; // esperar a que Firebase confirme el perfil
  const p = doc.data();
  if (!cloud.seenSet && !doc.metadata.fromCache) {
    cloud.seenSet = true;
    profileRef(cloud.user.uid).update({ lastSeen: now(), email: cloud.user.email }).catch(() => { });
  }
  cloud.profile = p;
  renderBrand();
  if (p.status === cloud.status) { if (ui.tab === 'ajustes' && !userIsTyping()) render(); return; }
  cloud.status = p.status;
  if (p.status === 'activo') {
    startData();
    if (isAdmin()) startAdmin();
    showScreen(unlocked ? 'app' : 'lock');
    if (cloud.justLoggedIn) { cloud.justLoggedIn = false; offerFaceId(); }
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
      snap => onListSnap(list, snap), dataError));
  }
  cloud.unsubs.push(base.collection('meta').doc('settings').onSnapshot({ includeMetadataChanges: true },
    doc => onSettingsSnap(doc), dataError));
}
// Si la conexión falla, se vuelve a conectar sola (2 s, 4 s, 8 s… hasta 30 s)
function dataError(err) {
  if (cloud.retryTimer) return;
  setCloud(!navigator.onLine || String(err && err.code).includes('unavailable') ? 'offline' : 'connecting');
  stopData();
  const wait = Math.min(30000, 2000 * 2 ** Math.min(cloud.retries || 0, 4));
  cloud.retries = (cloud.retries || 0) + 1;
  cloud.retryTimer = setTimeout(() => {
    cloud.retryTimer = null;
    if (cloud.user && cloud.status === 'activo') startData();
  }, wait);
}
function stopData() {
  cloud.unsubs.forEach(f => { try { f(); } catch { } });
  cloud.unsubs = []; cloud.known = {}; cloud.server = new Set();
}

function onLogout() {
  delete document.documentElement.dataset.accent;
  try { sessionStorage.removeItem(RELOAD_SESSION_KEY); } catch { }
  cloud.profile = null; renderBrand();
  stopData();
  if (cloud.profileUnsub) { try { cloud.profileUnsub(); } catch { } cloud.profileUnsub = null; }
  if (cloud.adminUnsub) { try { cloud.adminUnsub(); } catch { } cloud.adminUnsub = null; }
  clearTimeout(cloud.retryTimer); cloud.retryTimer = null; cloud.retries = 0;
  cloud.user = null; cloud.status = null; cloud.users = []; ui.viewing = null;
  if (ui.tab === 'admin') ui.tab = 'inicio';
  data = normalize(null);
  showScreen('auth');
}

/* ---------- administración ---------- */
function startAdmin() {
  if (cloud.adminUnsub) return;
  cloud.adminUnsub = cloud.db.collection('profiles').onSnapshot(snap => {
    cloud.users = snap.docs.map(d => Object.assign({ uid: d.id }, d.data()));
    const pend = cloud.users.filter(u => u.status === 'pendiente').length;
    $('#adminBadge').textContent = pend || '';
    $('#adminBadge').hidden = !pend;
    if (ui.tab === 'admin' && !userIsTyping()) render();
  }, () => { cloud.adminUnsub = null; setTimeout(() => { if (isAdmin() && cloud.status === 'activo') startAdmin(); }, 4000); });
}
async function createPerson(raw, pass) {
  const email = toLoginEmail(raw);
  const sec = firebase.apps.find(a => a.name === 'altas') || firebase.initializeApp(FIREBASE_CONFIG, 'altas');
  const secAuth = sec.auth();
  try { await secAuth.setPersistence(firebase.auth.Auth.Persistence.NONE); } catch { }
  const cred = await secAuth.createUserWithEmailAndPassword(email, pass);
  const uid = cred.user.uid;
  try { await secAuth.signOut(); } catch { }
  await profileRef(uid).set({ email, createdAt: now(), lastSeen: 0, status: 'activo', createdBy: cloud.user.uid });
  return { uid, email };
}

function openNameDialog(uid, current, email) {
  const f = $('#nameForm');
  f.reset(); f.uid.value = uid; f.name.value = current;
  $('#nameFor').textContent = email;
  $('#nameDialog').showModal();
  setTimeout(() => { f.name.focus(); f.name.select(); }, 50);
}
function saveName(uid, name) {
  name = name.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!name) { toast('Escribe un nombre'); return Promise.resolve(false); }
  return profileRef(uid).update({ name })
    .then(() => { toast('Nombre guardado'); return true; })
    .catch(() => { toast('No se pudo guardar el nombre. Intenta de nuevo.'); return false; });
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
const FIREBASE_USERS_URL = 'https://console.firebase.google.com/project/mis-finanzas-58ed0/authentication/users';
const APP_URL = 'https://andresdelgado1204-netizen.github.io/mis-finanzas/';
const credsText = c => `Mis Finanzas\nEntra en: ${APP_URL}\nUsuario: ${c.login}\nContraseña: ${c.pass}\n\nCuando entres, cámbiala en Ajustes → Cambiar contraseña.`;
const STATUS = { activo: ['Activa', 'ok'], pendiente: ['Pendiente', 'warn'], bloqueado: ['Bloqueada', 'bad'] };

function viewerHTML() {
  const v = ui.viewing;
  if (!v) return '';
  if (!v.data) return `<section class="card viewer"><div class="viewhead"><h3>${esc(v.name || shownName(v.email))}</h3><button class="btn ghost" data-action="adm-close">Cerrar</button></div><p class="muted">${v.error ? '⚠️ ' + esc(v.error) : 'Cargando sus datos…'}</p></section>`;
  return withData(v.data, () => {
    const bal = balances(), accs = accounts();
    const total = accs.reduce((t, a) => t + (bal[a.id] || 0), 0);
    const { inc, exp, bal: net } = totals(ui.month);
    const txs = live(data.transactions).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 25);
    const rows = txs.map(t => txRow(t).replace(/data-action="edit-tx" data-id="[^"]*"/, '')).join('');
    return `<section class="card viewer">
      <div class="viewhead"><div><h3>${esc(v.name || shownName(v.email))}</h3><span class="muted">Solo lectura</span></div><button class="btn ghost" data-action="adm-close">Cerrar</button></div>
      <div class="moneyhead"><span>Dinero total</span><b class="${total < 0 ? 'neg' : ''}">${fmt(total)}</b></div>
      <ul class="acclist ro">${accs.map(a => `<li><span class="accicon">${accIcon(a)}</span><span class="accname">${esc(a.name)}</span><b>${fmt(bal[a.id] || 0)}</b></li>`).join('')}</ul>
      <div class="weekgrid"><div><small>Ingresos ${monthLabel(ui.month).split(' ')[0]}</small><b class="pos">${fmt(inc)}</b></div>
        <div><small>Gasto total</small><b class="neg">${fmt(exp)}</b></div><div><small>Disponible del mes</small><b class="${net >= 0 ? 'pos' : 'neg'}">${fmt(net)}</b></div></div>
      <h4 class="day">Últimos movimientos</h4>
      ${rows ? `<ul class="txlist ro">${rows}</ul>` : '<p class="muted">Todavía no registra movimientos.</p>'}
    </section>`;
  });
}

function applyRemote(list, item) {
  cloud.known[list + '/' + item.id] = item.updatedAt || 0;
  item = resetOldFinancialItem(list, item);
  const i = data[list].findIndex(x => x.id === item.id);
  if (i < 0) { data[list].push(item); return true; }
  if ((item.updatedAt || 0) > (data[list][i].updatedAt || 0)) { data[list][i] = item; return true; }
  return false;
}
function afterRemote(changed) {
  if (changed) { save(); if (!userIsTyping()) render(); }
  if (cloud.server.size === LISTS.length + 1) {
    cloud.retries = 0;
    if (cloud.state === 'connecting' || cloud.state === 'error' || cloud.state === 'offline') setCloud(navigator.onLine ? 'ok' : 'offline');
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
    let st = doc.data();
    cloud.known.settings = st.updatedAt || 0;
    if ((st.financeResetAt || 0) < FINANCE_RESET_AT) {
      st = { ...data.settings, financeResetAt: FINANCE_RESET_AT, updatedAt: Math.max(FINANCE_RESET_AT, data.settings.updatedAt || 0) };
    }
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
    const part = writes.slice(i, i + 400);
    const batch = cloud.db.batch();
    part.forEach(([ref, val]) => batch.set(ref, val));
    cloud.writing++;
    setCloud(navigator.onLine ? 'saving' : 'offline');
    batch.commit()
      .then(() => { cloud.writing--; if (!cloud.writing) setCloud('ok'); })
      .catch(err => {
        cloud.writing--;
        // olvidar que se subieron, para reintentar en unos segundos
        part.forEach(([ref, val]) => {
          if (ref.id === 'settings' && ref.parent && ref.parent.id === 'meta') delete cloud.known.settings;
          else if (ref.parent) delete cloud.known[ref.parent.id + '/' + val.id];
        });
        setCloud(navigator.onLine ? 'connecting' : 'offline', navigator.onLine ? '' : cloudErr(err));
        setTimeout(cloudPush, 5000);
      });
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
  if (name === 'lock') { name = 'auth'; authMode = 'reauth'; }
  else if (name === 'auth' && authMode === 'reauth' && !(cloud.user && lockInfo())) authMode = 'login';
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
    noaccess: ['🔒', 'Esta cuenta no está autorizada', 'Las cuentas las crea el administrador. Pídele tu usuario y contraseña.'],
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
  $('#authTitle').textContent = signup ? 'Crea tu cuenta' : 'Ingresa a tu cuenta';
  $('#authSubmit').textContent = signup ? 'Crear cuenta' : 'Ingresar';
  f.password.autocomplete = signup ? 'new-password' : 'current-password';
  $('#authToggle').hidden = true; // las cuentas las crea el administrador
  $('#authToggle').textContent = signup ? '¿Ya tienes cuenta? Ingresa' : '¿No tienes cuenta? Crea una';
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
    'auth/email-already-in-use': 'Ese usuario ya existe. Elige otro.',
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
const RELOAD_SESSION_KEY = 'finanzas.reloadSession';
function restoreAfterReload(uid) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(RELOAD_SESSION_KEY) || 'null');
    sessionStorage.removeItem(RELOAD_SESSION_KEY);
    const navigation = performance.getEntriesByType('navigation')[0];
    const elapsed = saved ? now() - saved.at : -1;
    return !!(navigation && navigation.type === 'reload' && saved && saved.uid === uid && elapsed >= 0 && elapsed < RELOCK_MS);
  } catch { return false; }
}
window.addEventListener('pagehide', () => {
  try {
    if (cloud.user && unlocked && cloud.status === 'activo' && (!hiddenAt || now() - hiddenAt < RELOCK_MS)) {
      sessionStorage.setItem(RELOAD_SESSION_KEY, JSON.stringify({ uid: cloud.user.uid, at: now() }));
    } else sessionStorage.removeItem(RELOAD_SESSION_KEY);
  } catch { }
});

const rand = n => crypto.getRandomValues(new Uint8Array(n));
const toB64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
function lockInfo() { const l = readJSON(LS_LOCK); return l && cloud.user && l.uid === cloud.user.uid ? l : null; }
async function biometricAvailable() {
  try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
  catch { return false; }
}
let bioOK = false;
biometricAvailable().then(v => { bioOK = v; });
const LS_FACE_ASKED = 'finanzas.faceIdPreguntado';
async function enableLock() {
  if (!bioOK) { toast('Este dispositivo no tiene Face ID, Touch ID ni huella disponibles para la app.'); return; }
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
    unlocked = true; render(); toast('Listo: la próxima vez entras con Face ID / huella');
  } catch (e) { toast('No se activó el bloqueo: se canceló o no se pudo verificar.'); }
}
function offerFaceId() {
  let asked = false;
  try { asked = localStorage.getItem(LS_FACE_ASKED + '.' + cloud.user.uid) === '1'; } catch { }
  if (asked || lockInfo() || !bioOK) return;
  try { localStorage.setItem(LS_FACE_ASKED + '.' + cloud.user.uid, '1'); } catch { }
  setTimeout(() => $('#faceDialog').showModal(), 400);
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
  hiddenAt = 0;
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
        <div class="uinfo"><b>${esc(personName(u, u.email))}${self ? ' <span class="chip">Tú · admin</span>' : ''}</b>
          <small>${esc(shownName(u.email))}</small>
          <small><span class="chip ${cls}">${lbl}</span> Registro ${fmtDay(u.createdAt)} · Último uso ${agoText(u.lastSeen)}</small></div>
        <div class="uacts"><button class="btn ghost" data-action="adm-name" data-id="${u.uid}">Nombre</button>${self ? '' : `<button class="btn ghost" data-action="adm-view" data-id="${u.uid}">Ver finanzas</button>
          ${u.status === 'bloqueado' ? `<button class="btn ghost" data-action="adm-unblock" data-id="${u.uid}">Desbloquear</button>`
            : `<button class="btn ghost danger" data-action="adm-block" data-id="${u.uid}">Bloquear</button>`}`}</div></div>`; }).join('') || '<p class="muted">Aún no hay usuarios.</p>'}
      </section>`;
    const top = `<div class="row-end" style="margin:0 0 14px"><button class="btn ghost" data-action="personal-on">👤 Ver solo mis finanzas</button></div>`;
    const nc = ui.newCreds;
    const credsHTML = nc ? `<div class="creds">
        <b>✓ Cuenta creada. Envíale estos datos a la persona:</b>
        <pre id="credsText">${esc(credsText(nc))}</pre>
        <div class="row-end"><button class="btn ghost" data-action="adm-creds-close">Listo</button><button class="btn" data-action="adm-copy">Copiar datos</button></div>
      </div>` : '';
    const addHTML = `<section class="card"><h3>Agregar persona</h3>
      <p class="muted" style="margin-bottom:12px">Las cuentas se crean en Firebase. Cuando agregas a alguien ahí, ya puede entrar a la app con ese correo y contraseña, y aparece en esta lista.</p>
      <ol class="steps">
        <li>Toca <b>Abrir Firebase</b> y luego <b>Agregar usuario</b>.</li>
        <li>Escribe el correo y una contraseña de al menos 6 caracteres.</li>
        <li>Envíale a la persona el enlace de la app, su correo y su contraseña.</li>
      </ol>
      <div class="row-end">
        <button class="btn ghost" data-action="adm-copy-link">Copiar enlace de la app</button>
        <a class="btn" href="${FIREBASE_USERS_URL}" target="_blank" rel="noopener">Abrir Firebase</a>
      </div></section>`;
    return top + viewerHTML() + addHTML + pendHTML + listHTML;
  },

  inicio() {
    const { inc, exp, bal } = totals(ui.month);
    const byCat = Object.entries(spentByCat(ui.month)).sort((a, b) => b[1] - a[1]);
    let acc = 0;
    const stops = byCat.map(([c, v]) => { const a = acc / exp * 360; acc += v; return `${catColor(c)} ${a}deg ${acc / exp * 360}deg`; });
    const donut = exp > 0
      ? `<div class="donut" style="background:conic-gradient(${stops.join(',')})"><div><small>Gasto total</small><b>${fmt(exp)}</b></div></div>
         <ul class="legend">${byCat.map(([c, v]) => `<li><i style="background:${catColor(c)}"></i><span>${esc(c)}</span><b>${fmt(v)}</b><em>${Math.round(v / exp * 100)}%</em></li>`).join('')}</ul>`
      : '<p class="empty" style="flex:1">Sin gastos este mes.</p>';

    // 6 meses terminando en el mes elegido, pero nunca antes del mes de inicio
    const first = shiftMonth(ui.month, -5);
    const months = [...Array(6)].map((_, i) => shiftMonth(first, i));
    const series = months.map(m => ({ m, ...totals(m) }));
    const sixIncome = series.reduce((sum, item) => sum + item.inc, 0);
    const sixExpense = series.reduce((sum, item) => sum + item.exp, 0);
    const sixTotal = sixIncome + sixExpense;
    const incomeShare = sixTotal ? sixIncome / sixTotal * 100 : 0;
    const sixChart = `<div class="donutwrap six-months">
      <div class="donut" role="img" aria-label="Últimos seis meses: ingresos ${fmt(sixIncome)}, gastos ${fmt(sixExpense)}" style="background:${sixTotal ? `conic-gradient(var(--inc) 0% ${incomeShare}%, var(--exp) ${incomeShare}% 100%)` : 'var(--line)'}">
        <div><small>Balance del período</small><b class="${sixIncome - sixExpense >= 0 ? 'pos' : 'neg'}">${fmt(sixIncome - sixExpense)}</b></div>
      </div>
      <ul class="legend">
        <li><i style="background:var(--inc)"></i><span>Ingresos</span><b>${fmt(sixIncome)}</b><em>${sixTotal ? Math.round(incomeShare) : 0}%</em></li>
        <li><i style="background:var(--exp)"></i><span>Gastos</span><b>${fmt(sixExpense)}</b><em>${sixTotal ? 100 - Math.round(incomeShare) : 0}%</em></li>
      </ul>
    </div>`;

    const spent = spentByCat(ui.month);
    const budCats = budgetCats().filter(c => budgetFor(c) > 0);
    const budTotal = budCats.reduce((s, c) => s + budgetFor(c), 0);
    const budSpent = budCats.reduce((s, c) => s + (spent[c] || 0), 0);
    const goals = live(data.goals);

    const accBal = balances();
    const accs = accounts();
    const total = accs.reduce((s, a) => s + (accBal[a.id] || 0), 0);
    const reserved = reservedAmounts().total;
    return `
      <section class="card money">
        <div class="moneyhead"><h3>Mi dinero <span class="curchip" title="${esc(CURRENCY_NAMES[data.settings.currency] || '')}">${esc(data.settings.currency)}</span></h3><b class="${total < 0 ? 'neg' : ''}">${fmt(total)}</b></div>
        ${reserved > 0 ? `<p class="muted">Reservado: ${fmt(reserved)} · Disponible: <b>${fmt(total - reserved)}</b></p>` : ''}
        <ul class="acclist">${accs.map(a => `<li data-action="edit-acc" data-id="${a.id}">
          <span class="accicon">${accIcon(a)}</span><span class="accname">${esc(a.name)}</span>
          <b class="${(accBal[a.id] || 0) < 0 ? 'neg' : ''}">${fmt(accBal[a.id] || 0)}</b></li>`).join('')}</ul>
        <div class="row-end">
          ${accountMode() === 'ambos' ? '<button class="btn ghost" data-action="new-acc">+ Cuenta</button>'
            : `<button class="btn" data-action="add-money">${accountMode() === 'efectivo' ? '+ Agregar efectivo' : '+ Agregar dinero'}</button>`}
          ${accs.length >= 2 ? '<button class="btn ghost" data-action="new-transfer">⇄ Mover dinero</button>' : ''}
        </div>
      </section>
      ${isAdmin() ? weekCard() : monthlyPayCard()}
      <section class="cards3">
        <div class="card stat"><small>Ingresos</small><b class="pos">${fmt(inc)}</b></div>
        <div class="card stat"><small>Gasto total</small><b class="neg">${fmt(exp)}</b></div>
        <div class="card stat"><small>Disponible del mes</small><b class="${bal >= 0 ? 'pos' : 'neg'}">${fmt(bal)}</b></div>
      </section>
      ${occasionalHomeCard()}
      <div class="summary-head budget-summary-title"><h3>Gastos mensuales</h3><a href="#" data-tab="presupuesto">Ver gastos mensuales →</a></div>
      <section class="cards3" aria-label="Resumen de gastos mensuales">
        <div class="card stat"><small>Gasto previsto</small><b>${fmt(budTotal)}</b></div>
        <div class="card stat"><small>Pagado</small><b class="neg">${fmt(budSpent)}</b></div>
        <div class="card stat"><small>${budSpent > budTotal ? 'Excedido' : 'Pendiente'}</small><b class="${budSpent > budTotal ? 'neg' : 'pos'}">${fmt(Math.abs(budTotal - budSpent))}</b></div>
      </section>
      <section class="card">
        <div class="summary-head"><h3>Tus fondos y metas</h3><a href="#" data-tab="metas">Ver metas →</a></div>
        <div class="reserve-grid">
          <div><span>🛟 Fondo de emergencia</span><b>${fmt(reservedAmounts().emergency)}</b></div>
          <div><span>🌱 Ahorro</span><b>${fmt(reservedAmounts().savings)}</b></div>
        </div>
        <p class="muted">Total reservado del sueldo: <b>${fmt(reserved)}</b> · acumulado de todos los meses.</p>
        ${goals.length ? `<div class="home-goals">${goals.map(g => goalRow(g, true)).join('')}</div>` : '<p class="muted">Puedes agregar otras metas y ver su avance aquí.</p>'}
      </section>
      <section class="card"><h3>¿En qué gastas?</h3><div class="donutwrap">${donut}</div></section>
      <section class="card"><h3>Últimos 6 meses</h3>
        <p class="muted six-range">${monthLabel(months[0])} – ${monthLabel(months[5])}</p>
        ${sixChart}
        <p class="muted">${sixTotal ? 'Proporción de ingresos y gastos del período completo.' : 'Todavía no hay ingresos ni gastos en este período.'}</p>
      </section>
      `;
  },

  movimientos() {
    let txs = txOfMonth(ui.month).filter(t => !t.budgetMonth);
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
    const cats = budgetCats();
    const addBtn = `<div class="row-end"><button class="btn" data-action="new-budget">+ Agregar categoría</button></div>`;
    if (!cats.length) return `<section class="card budget-panel"><h3>Gastos mensuales</h3>
      <p class="empty" style="padding:24px 12px">Todavía no tienes categorías en tu presupuesto.<br>Agrega las que quieras controlar, por ejemplo Supermercado o Transporte, con su límite mensual.</p>
      ${addBtn}</section>`;
    const rows = cats.map(c => {
      const b = budgetFor(c), s = spent[c] || 0;
      return `<div class="budrow">
        <div class="budhead"><b>${esc(c)}</b><span class="muted">${fmt(s)}${b ? ` / ${fmt(b)}` : ''}</span></div>
        ${b ? progress(s, b) : ''}
        <div class="budinput"><label for="bud-${esc(c)}">Monto previsto</label>
          <span class="budctl"><input id="bud-${esc(c)}" type="number" inputmode="decimal" min="0" step="any" value="${b || ''}" placeholder="Sin límite" data-budget="${esc(c)}">
          <button class="iconbtn" data-action="del-budget" data-cat="${esc(c)}" aria-label="Quitar ${esc(c)} de gastos mensuales" title="Quitar de gastos mensuales">✕</button></span></div>
        ${budgetPaidControl(c)}
        <label class="budget-repeat"><input type="checkbox" data-budget-repeat="${esc(c)}" ${budgetRepeats(activeBudget(c)) ? 'checked' : ''}> Repetir cada mes</label>
      </div>`;
    }).join('');
    return `<section class="card budget-panel"><h3>Gastos mensuales</h3>
      <p class="muted">Planifica el monto y marca «Pagado» cuando salga el dinero. Activa «Repetir cada mes» para tus gastos habituales.</p>${addBtn}${budgetBulkControl()}<div class="budget-items">${rows}</div></section>`;
  },

  metas() {
    const goals = live(data.goals);
    return reservesCard() + `<div class="row-end" style="margin:0 0 14px"><button class="btn" data-action="new-goal">+ Nueva meta o deuda</button></div>
      ${goals.length ? goals.map(g => `<section class="card">${goalRow(g, true)}</section>`).join('')
        : '<p class="empty">También puedes crear otras metas, como unas vacaciones, o registrar una deuda para ir pagándola.</p>'}`;
  },

  ajustes() {
    const c = data.settings.categories;
    return `
      <section class="card"><h3>Tu cuenta</h3>
        <p class="acctline">${window.PREVIEW ? 'Vista previa (sin cuenta)' : `Ingresaste como <b>${esc(cloud.user ? shownName(cloud.user.email) : '')}</b>`}</p>
        ${window.PREVIEW ? '' : `<form id="myNameForm" class="form namerow">
          <label>Tu nombre<input name="name" maxlength="40" value="${esc(myName())}" autocomplete="name" required></label>
          <button class="btn ghost">Guardar</button>
        </form>`}
        <p id="syncDetail" class="muted"></p>
        <div class="lockrow">
          <div><b>Entrar con Face ID / huella</b>
            <small>${lockInfo() ? 'Activado en este dispositivo: entras sin escribir tu contraseña.' : 'Entra a la app con Face ID, Touch ID o tu huella en este dispositivo.'}</small></div>
          <button class="btn ${lockInfo() ? 'ghost' : ''}" data-action="lock-toggle">${lockInfo() ? 'Desactivar' : 'Activar'}</button>
        </div>
        ${isAdmin() ? `<div class="lockrow">
          <div><b>Modo personal</b>
            <small>${personalMode() ? 'Activado: solo ves tus finanzas. La pestaña Admin está oculta.' : 'Oculta la pestaña Admin para ver solo tus finanzas.'}</small></div>
          <button class="btn ${personalMode() ? '' : 'ghost'}" data-action="${personalMode() ? 'personal-off' : 'personal-on'}">${personalMode() ? 'Mostrar Admin' : 'Activar'}</button>
        </div>` : ''}
        <div class="row-end"><button class="btn ghost danger" data-action="logout">Cerrar sesión</button></div>
      </section>

      <section class="card"><h3>Color de tu app</h3>
        <p class="muted" style="margin-bottom:12px">Elige el color que más te guste: cambia los botones y el fondo de tu app. Cada cuenta tiene el suyo, así sabes al tiro qué sesión está abierta. Funciona en modo claro y oscuro.</p>
        <div class="swatches">
          ${ACCENTS.map(a => `<button type="button" class="swatchbox ${sessionAccent() === a.key ? 'on' : ''}" data-action="accent" data-v="${a.key}" aria-pressed="${sessionAccent() === a.key}"><span class="swatch" style="--sw:${a.color}"></span>${a.name}</button>`).join('')}
        </div>
      </section>

      <section class="card"><h3>Moneda</h3>
        <p class="muted" style="margin-bottom:10px">Estás usando <b>${esc(data.settings.currency)} – ${esc(CURRENCY_NAMES[data.settings.currency] || data.settings.currency)}</b>. Cambiarla solo cambia cómo se muestran los montos; no convierte los valores.</p>
        <label class="form" style="display:block"><select id="currencySel" data-action-change="currency">
          ${CURRENCIES.map(c => `<option value="${c}" ${c === data.settings.currency ? 'selected' : ''}>${c} – ${CURRENCY_NAMES[c]}</option>`).join('')}
        </select></label>
      </section>

      <section class="card"><h3>Mi dinero</h3>
        <p class="muted" style="margin-bottom:4px">Elige qué cuentas aparecen en «Mi dinero». Debe quedar al menos una.</p>
        ${[['efectivo', '💵', 'Efectivo', 'Dinero en la billetera'], ['banco', '🏦', 'Banco', 'Cuenta bancaria y transferencias']].map(([k, ico, name, sub]) => {
          const on = accountMode() === 'ambos' || accountMode() === k;
          return `<div class="lockrow switchrow">
            <div><b>${ico} ${name}</b><small>${sub}</small></div>
            <button type="button" class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="Mostrar ${name}" data-action="acc-toggle" data-k="${k}"><i></i></button>
          </div>`;
        }).join('')}
        ${accountMode() !== 'ambos' && allAccounts().length > accounts().length
          ? '<p class="muted">La cuenta apagada queda oculta, no se borra. Si la vuelves a encender, aparece con su saldo.</p>' : ''}
      </section>

      ${window.PREVIEW ? '' : `<section class="card"><h3>Cambiar contraseña</h3>
        <form id="passForm" class="form">
          <input type="text" name="username" autocomplete="username" value="${esc(cloud.user ? (isUsernameAccount(cloud.user.email) ? shownName(cloud.user.email).replace('@finanzas', '') : cloud.user.email) : '')}" hidden>
          <label>Contraseña actual<input name="current" type="password" autocomplete="current-password" required></label>
          <label>Nueva contraseña<input name="newpass" type="password" autocomplete="new-password" minlength="6" required></label>
          <label>Repite la nueva contraseña<input name="newpass2" type="password" autocomplete="new-password" minlength="6" required></label>
          <p id="passError" class="autherr" hidden></p>
          <div class="row-end"><button class="btn">Cambiar contraseña</button></div>
        </form>
      </section>`}

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
  applyAccent();
  renderBrand();
  $('#adminTab').hidden = !showAdmin();
  if (ui.tab === 'admin' && !showAdmin()) ui.tab = 'inicio';
  rememberView();
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
  sel.innerHTML = cats.map(c => `<option ${c === selected ? 'selected' : ''}>${esc(c)}</option>`).join('') + `<option value="__new_category__">${type === 'gasto' ? '➕ Agregar nuevo gasto…' : '➕ Nueva categoría de ingreso…'}</option>`;
}
function setTxType(type, selected) {
  txType = type;
  const isTr = type === 'transferencia';
  $('#txType').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.type === type));
  $('#catLabel').hidden = isTr || type === 'gasto';
  $('#txNewCategoryWrap').hidden = true;
  $('#txForm').newCategory.required = false;
  $('#txForm').newCategory.disabled = true;
  $('#txForm').category.required = !isTr && type !== 'gasto';
  $('#toLabel').hidden = !isTr;
  $('#accLabel').textContent = isTr ? 'Desde' : 'Pagado con';
  $('#payMethodWrap').hidden = type !== 'ingreso' || accountMode() !== 'ambos';
  $('#accField').hidden = type === 'ingreso';
  if (!isTr) fillCategories(type, selected);
  const nameField = $('#txForm').newCategory;
  nameField.readOnly = false;
  $('#txNewCategoryTitle').textContent = 'Nombre de la nueva categoría';
  if (type === 'gasto') {
    $('#txNewCategoryWrap').hidden = false;
    nameField.disabled = false;
    nameField.required = true;
    nameField.value = editingTx ? (editingTx.expenseName || editingTx.category || '') : '';
    nameField.readOnly = !!editingTx?.budgetMonth;
    $('#txNewCategoryTitle').textContent = 'Nombre del gasto';
    nameField.placeholder = 'Ej. Veterinaria, regalo o reparación';
  }
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
  if (accountMode() === 'efectivo') pm = 'efectivo';
  else if (accountMode() === 'banco') pm = 'transferencia';
  setPayMethod(tx && tx.type === 'ingreso' && accountMode() === 'ambos' ? methodOf(tx) : pm);
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
    title = esc(t.expenseName || t.category);
    sub = t.type === 'ingreso' ? (methodOf(t) === 'efectivo' ? '💵 Efectivo' : '🏦 Transferencia') : esc(accName(accId(t)));
    amount = (t.type === 'ingreso' ? '+' : '−') + fmt(t.amount); cls = t.type === 'ingreso' ? 'pos' : 'neg';
  }
  if (t.reserves && t.type === 'ingreso' && t.category === 'Sueldo') sub += ` · Emergencia ${fmt(t.reserves.emergency)} · Ahorro ${fmt(t.reserves.savings)}`;
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
  const m = accountMode();
  [...f.kind.options].forEach(o => { o.disabled = m !== 'ambos' && !a && o.value !== m; });
  if (!a && m !== 'ambos') f.kind.value = m;
  $('#accDelete').hidden = !a;
  $('#accAdjust').hidden = !a;
  if (a) {
    f.name.value = a.name; f.kind.value = a.kind; f.initial.value = a.initial || 0;
    $('#accCalc').textContent = fmt(balances()[a.id] || 0);
  } else f.initial.value = 0;
  $('#accDialog').showModal();
}

function openBudget() {
  const f = $('#budgetForm');
  f.reset();
  const used = new Set(budgetCats());
  const free = data.settings.categories.gasto.filter(c => c !== 'Gastos ocasionales' && !used.has(c));
  f.cat.innerHTML = free.map(c => `<option>${esc(c)}</option>`).join('') + '<option value="__new">➕ Nueva categoría…</option>';
  if (!free.length) f.cat.value = '__new';
  $('#budgetNewWrap').hidden = f.cat.value !== '__new';
  f.repeat.checked = defaultBudgetRepeat(f.cat.value === '__new' ? '' : f.cat.value);
  $('#budgetDialog').showModal();
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
    case 'auth-other':
      try { localStorage.removeItem(userKey()); localStorage.removeItem(LS_LOCK); } catch { }
      authMode = 'login'; cloud.auth.signOut(); break;
    case 'unlock': unlock(); break;
    case 'face-login':
      if (cloud.user && lockInfo()) unlock();
      else showAuthError('Para entrar con Face ID o huella, primero entra una vez con tu usuario y contraseña, y actívalo cuando la app te lo pregunte.');
      break;
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
      ui.viewing = { uid: id, email: u ? u.email : '', name: u ? personName(u, u.email) : '', data: null };
      render(); window.scrollTo(0, 0);
      loadUserData(id).then(d => { if (ui.viewing && ui.viewing.uid === id) { ui.viewing.data = d; render(); } })
        .catch(err => { if (ui.viewing) { ui.viewing.error = cloudErr(err); render(); } });
      break;
    }
    case 'adm-close': ui.viewing = null; render(); break;
    case 'adm-name': {
      const u = cloud.users.find(x => x.uid === id);
      openNameDialog(id, u ? personName(u, u.email) : '', u ? shownName(u.email) : '');
      break;
    }
    case 'adm-copy-link':
      if (navigator.clipboard) navigator.clipboard.writeText(APP_URL).then(() => toast('Enlace copiado')).catch(() => toast(APP_URL));
      else toast(APP_URL);
      break;
    case 'adm-creds-close': ui.newCreds = null; render(); break;
    case 'adm-copy': {
      const txt = credsText(ui.newCreds);
      const fallback = () => { const r = document.createRange(); r.selectNodeContents($('#credsText')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('Texto seleccionado: cópialo con Cmd + C'); };
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Datos copiados')).catch(fallback); else fallback();
      break;
    }
    case 'personal-on': setPersonalMode(true); break;
    case 'personal-off': setPersonalMode(false); ui.tab = 'admin'; render(); break;
    case 'logout':
      if (lockInfo()) { unlocked = false; showScreen('lock'); window.scrollTo(0, 0); break; }
      ask('¿Cerrar sesión en este dispositivo? Tus datos quedan guardados en tu cuenta.', 'Cerrar sesión').then(ok => {
        if (!ok) return;
        try { localStorage.removeItem(userKey()); localStorage.removeItem(LS_LOCK); } catch { }
        cloud.auth.signOut();
      });
      break;
    case 'other-account':
      try { localStorage.removeItem(userKey()); localStorage.removeItem(LS_LOCK); } catch { }
      cloud.auth.signOut(); break;
    case 'face-yes': $('#faceDialog').close(); enableLock(); break;
    case 'face-no': $('#faceDialog').close(); toast('Puedes activarlo cuando quieras en Ajustes'); break;
    case 'prev-month':
      if (startMonth() && shiftMonth(ui.month, -1) < startMonth()) { toast('Tus registros empiezan en ' + monthLabel(startMonth())); break; }
      ui.month = shiftMonth(ui.month, -1); render(); break;
    case 'next-month': ui.month = shiftMonth(ui.month, 1); render(); break;
    case 'filter': ui.filter = el.dataset.v; render(); break;
    case 'new-tx': openTx(); break;
    case 'accent':
      data.settings = Object.assign({}, data.settings, { accentColor: el.dataset.v, updatedAt: now() });
      commit(); toast('Color: ' + (ACCENTS.find(a => a.key === el.dataset.v) || {}).name);
      break;
    case 'add-money': {
      // abre el formulario de ingreso directo a la cuenta que usa (efectivo o banco)
      openTx();
      setTxType('ingreso', 'Otros ingresos');
      setPayMethod(accountMode() === 'efectivo' ? 'efectivo' : 'transferencia');
      $('#txTitle').textContent = accountMode() === 'efectivo' ? 'Agregar efectivo' : 'Agregar dinero al banco';
      break;
    }
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
    case 'pay-month':
    case 'pay-week': {
      const lp = lastPay();
      openTx();
      const f = $('#txForm');
      setTxType('ingreso', 'Sueldo');
      if (lp) { f.amount.value = lp.amount; setPayMethod(methodOf(lp)); }
      f.date.value = el.dataset.date;
      f.note.value = el.dataset.action === 'pay-month' ? 'Pago mensual' : 'Pago semanal';
      break;
    }
    case 'new-acc': openAcc(); break;
    case 'acc-mode': if (el.dataset.v !== accountMode()) setAccountMode(el.dataset.v); break;
    case 'acc-toggle': {
      const k = el.dataset.k, other = k === 'efectivo' ? 'banco' : 'efectivo', m = accountMode();
      const on = m === 'ambos' || m === k;
      if (on) {
        if (m === k) { toast('Debe quedar al menos una cuenta encendida'); break; }
        setAccountMode(other);           // apagar esta: queda solo la otra
      } else setAccountMode('ambos');    // encender esta: quedan ambas
      break;
    }
    case 'new-budget': openBudget(); break;
    case 'del-budget': {
      const cat = el.dataset.cat;
      ask(`¿Quitar ${cat} de gastos mensuales? Tus movimientos de esta categoría no se borran.`, 'Quitar')
        .then(ok => { if (ok) { const old = activeBudget(cat); if (old) saveBudgetMonth(cat, 0, budgetRepeats(old), true); } });
      break;
    }
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
  const expenseName = txType === 'gasto' ? f.newCategory.value.trim().replace(/\s+/g, ' ') : '';
  if (txType === 'gasto' && !expenseName) { toast('Escribe el nombre del gasto'); return; }
  let category = txType === 'gasto' ? (editingTx?.budgetMonth ? editingTx.category : 'Gastos ocasionales') : f.category.value;
  const creatingCategory = txType !== 'transferencia' && category === '__new_category__';
  if (creatingCategory) {
    category = f.newCategory.value.trim().replace(/\s+/g, ' ');
    if (!category) { toast('Escribe el nombre del gasto o categoría'); return; }
    category = data.settings.categories[txType].find(c => c.toLocaleLowerCase('es') === category.toLocaleLowerCase('es')) || category[0].toUpperCase() + category.slice(1);
  }
  const base = { id: editingTx?.id || uid(), type: txType, amount, date: f.date.value,
    note: f.note.value.trim(), createdAt: editingTx?.createdAt || now() };
  if (txType === 'gasto') base.expenseName = expenseName;
  if (editingTx?.budgetMonth && txType === 'gasto' && category === editingTx.category && f.date.value.startsWith(editingTx.budgetMonth)) base.budgetMonth = editingTx.budgetMonth;
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
    if (txType === 'ingreso' && category === 'Sueldo' && (!editingTx || editingTx.reserves)) {
      base.reserves = salaryReserves(amount, editingTx?.reserves?.rates || reserveRates());
    }
    if ((creatingCategory || txType === 'gasto') && !data.settings.categories[txType].includes(category)) {
      data.settings.categories[txType].push(category);
      data.settings.updatedAt = now();
    }
    upsert('transactions', Object.assign(base, { category, account }));
  }
  $('#txDialog').close();
  if (txType === 'gasto' && !editingTx) {
    const b = budgetFor(category, f.date.value.slice(0, 7));
    const s = spentByCat(f.date.value.slice(0, 7))[category] || 0;
    if (b && s > b) toast(`Superaste el presupuesto de ${category}`);
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

document.addEventListener('input', e => {
  if (e.target.id === 'addUser') {
    const v = e.target.value.trim().toLowerCase();
    $('#addPreview').innerHTML = v ? `Se verá como <b>${esc(v.includes('@') ? v : v + '@finanzas')}</b> · para entrar escribe <b>${esc(v)}</b>` : 'Se verá como <b>usuario@finanzas</b>';
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'currencySel') {
    data.settings = Object.assign({}, data.settings, { currency: el.value, updatedAt: now() });
    commit(); toast(`Moneda: ${el.value} – ${CURRENCY_NAMES[el.value]}`);
  }
  if (el.name === 'cat' && el.form && el.form.id === 'budgetForm') {
    $('#budgetNewWrap').hidden = el.value !== '__new';
    el.form.repeat.checked = defaultBudgetRepeat(el.value === '__new' ? el.form.newcat.value : el.value);
    if (el.value === '__new') setTimeout(() => el.form.newcat.focus(), 30);
  }
  if (el.name === 'category' && el.form?.id === 'txForm') {
    const creating = el.value === '__new_category__';
    $('#txNewCategoryWrap').hidden = !creating;
    el.form.newCategory.disabled = !creating;
    el.form.newCategory.required = creating;
    if (creating) el.form.newCategory.focus();
  }
  if (el.dataset.budgetPayAll !== undefined) {
    el.checked = false; openBulkBudgetPayment();
  }
  if (el.dataset.budgetPay !== undefined) {
    const cat = el.dataset.budgetPay;
    const paid = budgetPayment(cat);
    if (paid) {
      el.checked = true;
      ask(`¿Desmarcar ${cat} como pagado? Se anulará el gasto de ${fmt(paid.amount)} y ese monto volverá al saldo de ${accName(accId(paid))}.`, 'Desmarcar pago')
        .then(ok => { if (ok) { remove('transactions', paid.id); toast('Pago desmarcado y saldo actualizado'); } else render(); });
    } else {
      el.checked = false;
      openBudgetPayment(cat);
    }
  }
  if (el.dataset.budgetRepeat !== undefined) {
    const cat = el.dataset.budgetRepeat;
    saveBudgetMonth(cat, budgetFor(cat), el.checked);
  }
  if (el.name === 'newcat' && el.form?.id === 'budgetForm') el.form.repeat.checked = defaultBudgetRepeat(el.value);
  if (el.dataset.budget !== undefined) {
    const cat = el.dataset.budget, amount = parseAmount(el.value);
    const old = activeBudget(cat);
    saveBudgetMonth(cat, amount, old ? budgetRepeats(old) : defaultBudgetRepeat(cat));
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
  if (e.target.id === 'bulkBudgetForm') {
    e.preventDefault();
    const pending = pendingBulkPayment, f = e.target;
    if (!pending) return;
    if (!f.date.value.startsWith(pending.month)) { toast('Elige una fecha del mes seleccionado'); return; }
    const selected = pending.items.map((item, index) => ({ ...item, account: f.elements.namedItem('account-' + index).value }));
    if (selected.some(item => !accounts().some(a => a.id === item.account))) { toast('Elige la cuenta de cada gasto'); return; }
    let added = 0;
    for (const item of selected) {
      if (budgetPayment(item.cat, pending.month)) continue;
      const tx = { id: budgetPaymentId(item.cat, pending.month), type: 'gasto', category: item.cat,
        amount: item.amount, account: item.account, date: f.date.value, budgetMonth: pending.month,
        note: 'Pago de gastos mensuales', createdAt: now(), updatedAt: now() };
      const index = data.transactions.findIndex(t => t.id === tx.id);
      if (index >= 0) data.transactions[index] = tx; else data.transactions.push(tx);
      added++;
    }
    pendingBulkPayment = null;
    $('#bulkBudgetDialog').close();
    if (added) commit(); else render();
    toast(added ? `${added} pagos registrados` : 'Los pagos ya estaban registrados'); return;
  }
  if (e.target.id === 'budgetPayForm') {
    e.preventDefault();
    const pending = pendingBudgetPayment, f = e.target;
    if (!pending) return;
    if (budgetPayment(pending.cat, pending.month)) { $('#budgetPayDialog').close(); render(); toast('Este pago ya está registrado'); return; }
    if (!accounts().some(a => a.id === f.account.value)) { toast('Elige una cuenta'); return; }
    if (!f.date.value.startsWith(pending.month)) { toast('Elige una fecha del mes seleccionado'); return; }
    upsert('transactions', { id: budgetPaymentId(pending.cat, pending.month), type: 'gasto',
      category: pending.cat, amount: pending.amount, account: f.account.value, date: f.date.value,
      budgetMonth: pending.month, note: 'Pago de gastos mensuales', createdAt: now() });
    pendingBudgetPayment = null;
    $('#budgetPayDialog').close();
    toast('Pago registrado y descontado de la cuenta'); return;
  }
  if (e.target.id === 'reservesForm') {
    e.preventDefault();
    const emergency = Number(e.target.emergency.value), savings = Number(e.target.savings.value);
    if (![emergency, savings].every(n => Number.isFinite(n) && n >= 0 && n <= 100) || emergency + savings > 100) {
      toast('Los porcentajes deben sumar como máximo 100%'); return;
    }
    data.settings.salaryReserves = { emergency, savings };
    data.settings.updatedAt = now();
    commit(); toast('Porcentajes guardados para los próximos sueldos'); return;
  }
  if (e.target.id === 'budgetForm') {
    e.preventDefault();
    const f = e.target;
    let cat = f.cat.value === '__new' ? f.newcat.value.trim().replace(/\s+/g, ' ') : f.cat.value;
    if (!cat) { toast('Escribe el nombre de la categoría'); return; }
    cat = cat[0].toUpperCase() + cat.slice(1);
    const exists = data.settings.categories.gasto.find(c => c.toLowerCase() === cat.toLowerCase());
    if (exists) cat = exists;
    if (budgetCats().includes(cat)) { toast(`${cat} ya está en tu presupuesto`); return; }
    if (!exists) {
      data.settings = Object.assign({}, data.settings, {
        categories: { ...data.settings.categories, gasto: [...data.settings.categories.gasto, cat] }, updatedAt: now() });
    }
    saveBudgetMonth(cat, parseAmount(f.amount.value), f.repeat.checked);
    $('#budgetDialog').close();
    toast(`${cat} agregada a gastos mensuales`);
    return;
  }
  if (e.target.id === 'myNameForm') {
    e.preventDefault();
    saveName(cloud.user.uid, e.target.name.value);
    e.target.name.blur();
    return;
  }
  if (e.target.id === 'nameForm') {
    e.preventDefault();
    const f = e.target;
    saveName(f.uid.value, f.name.value).then(ok => { if (ok) $('#nameDialog').close(); });
    return;
  }
  if (e.target.id === 'adminAddForm') {
    e.preventDefault();
    const f = e.target, raw = f.user.value.trim(), pass = f.pass.value;
    const errEl = $('#addError');
    const fail = m => { errEl.textContent = m; errEl.hidden = false; };
    errEl.hidden = true;
    if (raw.includes('@')) { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return fail('El correo no es válido.'); }
    else if (!USER_RE.test(raw.toLowerCase())) return fail('El usuario debe tener entre 2 y 30 caracteres: letras, números, punto, guion o guion bajo (sin espacios ni tildes).');
    if (pass.length < 6) return fail('La contraseña debe tener al menos 6 caracteres.');
    const btn = $('#addBtn'); btn.disabled = true; btn.textContent = 'Creando…';
    createPerson(raw, pass)
      .then(({ email }) => {
        ui.newCreds = { login: isUsernameAccount(email) ? shownName(email).replace('@finanzas', '') : email, shown: shownName(email), pass };
        render(); toast('Cuenta creada para ' + shownName(email));
      })
      .catch(err => { btn.disabled = false; btn.textContent = 'Crear cuenta'; fail(authErr(err)); });
    return;
  }
  if (e.target.id === 'passForm') {
    e.preventDefault();
    const f = e.target, cur = f.current.value, nw = f.newpass.value;
    const errEl = $('#passError');
    const fail = m => { errEl.textContent = m; errEl.hidden = false; };
    errEl.hidden = true;
    if (nw.length < 6) return fail('La nueva contraseña debe tener al menos 6 caracteres.');
    if (nw !== f.newpass2.value) return fail('Las contraseñas nuevas no coinciden.');
    const u = cloud.auth.currentUser;
    const cred = firebase.auth.EmailAuthProvider.credential(u.email, cur);
    u.reauthenticateWithCredential(cred)
      .then(() => u.updatePassword(nw))
      .then(() => { f.reset(); toast('Contraseña cambiada'); })
      .catch(err => fail(err && (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials') ? 'La contraseña actual no es correcta.' : authErr(err)));
    return;
  }
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
      cloud.justLoggedIn = true;
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
    data.settings = { ...data.settings, currency: f.currency.value, startMonth: f.startMonth.value, payday: Number(f.payday.value), categories: { gasto, ingreso }, updatedAt: now() };
    if (ui.month < data.settings.startMonth) ui.month = data.settings.startMonth;
    commit(); toast('Preferencias guardadas');
  }
});


/* ---------- inicio ---------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
cloudInit();
