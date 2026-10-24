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
  { key: 'rojo', name: 'Rojo', color: '#c22f35' },
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
  const base = ACCENTS.filter(a => a.key !== 'rojo'); // así no cambia el color de quienes nunca eligieron uno
  return base[h % base.length].key;
}
function applyAccent() {
  let k = sessionAccent();
  // se recuerda en este equipo, así la pantalla de ingreso también lleva tu color
  if (k) { try { localStorage.setItem('finanzas.color', k); } catch { } }
  else { try { k = localStorage.getItem('finanzas.color') || ''; } catch { } }
  if (k) document.documentElement.dataset.accent = k; else delete document.documentElement.dataset.accent;
  // la barra del teléfono toma el mismo fondo
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) { const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); if (bg) meta.content = bg; }
}
const CURRENCY_NAMES = { CLP: 'Peso chileno', USD: 'Dólar estadounidense', EUR: 'Euro', ARS: 'Peso argentino', PEN: 'Sol peruano',
  COP: 'Peso colombiano', MXN: 'Peso mexicano', BRL: 'Real brasileño', UYU: 'Peso uruguayo' };

/* ---------- utilidades ---------- */
/* ---------- emojis según el nombre (solo para mostrar, no se guardan) ---------- */
const EMOJI_RULES = [
  ['🏢', 'gastos comunes|condominio|administracion edificio'],
  ['🏠', 'arriendo|alquiler|renta casa|hipoteca|dividendo|vivienda|casa'],
  ['💡', 'luz|electricidad|electrica|enel|cge|chilquinta'],
  ['💧', 'agua|aguas andinas|esval|essbio'],
  ['🔥', 'gas(?![a-z])|lipigas|abastible|gasco|metrogas|calefaccion|parafina|lena'],
  ['🌐', 'internet|wifi|fibra|vtr|mundo|gtd'],
  ['📱', 'telefono|celular|movil|entel|movistar|wom|claro'],
  ['📺', 'netflix|disney|hbo|max|prime video|amazon prime|paramount|star\\+|star plus|youtube|streaming|television|cable|directv|suscripcion'],
  ['🎵', 'spotify|musica|deezer|apple music'],
  ['☁️', 'icloud|google one|dropbox|nube'],
  ['🛒', 'supermercado|super|mercado|lider|jumbo|unimarc|tottus|santa isabel|almacen|feria|despensa|verduleria'],
  ['🍽️', 'comida fuera|restaurante|restoran|almuerzo|cena|delivery|rappi|uber eats|pedidos ya|pedidosya|comida'],
  ['☕', 'cafe|starbucks|cafeteria'],
  ['🍞', 'pan(?![a-z])|panaderia'],
  ['⛽', 'bencina|combustible|gasolina|nafta|copec|shell|petrobras'],
  ['🚗', 'auto|carro|estacionamiento|peaje|tag|autopista|mantencion auto|taller|revision tecnica|permiso de circulacion'],
  ['🚌', 'transporte|bus|micro|metro|bip|pasaje|uber|taxi|didi|cabify|colectivo'],
  ['💊', 'farmacia|remedio|medicamento|cruz verde|salcobrand|ahumada'],
  ['🦷', 'dentista|dental|odontolog'],
  ['🩺', 'salud|doctor|medico|clinica|consulta|isapre|fonasa|examen|hospital'],
  ['🏋️', 'gimnasio|gym|deporte|smartfit|crossfit|futbol|piscina'],
  ['🎓', 'educacion|colegio|universidad|u\\b|curso|matricula|jardin|mensualidad colegio|clases|libros'],
  ['🐾', 'mascota|perro|gato|veterinari|alimento perro|alimento gato'],
  ['👕', 'ropa|zapato|zapatilla|vestuario|polera'],
  ['💇', 'peluqueria|barberia|belleza|manicure|unas|cosmetic|maquillaje'],
  ['🎁', 'regalo|cumpleanos|cumple|navidad'],
  ['✈️', 'viaje|vacacion|hotel|vuelo|avion|airbnb|turismo'],
  ['🎬', 'cine|pelicula|teatro|concierto|entrada'],
  ['🎮', 'juego|videojuego|playstation|xbox|nintendo|steam'],
  ['🍻', 'carrete|bar|cerveza|copete|salida|fiesta'],
  ['🎉', 'ocio|entretencion|panorama|diversion'],
  ['🛡️', 'seguro'],
  ['💳', 'credito|deuda|prestamo|tarjeta|cuota|pago de deudas|avance'],
  ['🐷', 'ahorro|ahorrar'],
  ['🛋️', 'hogar|mueble|decoracion|electrodomestico'],
  ['🔧', 'reparacion|arreglo|ferreteria|gasfiter|electricista|sodimac|easy'],
  ['🧹', 'limpieza|aseo|nana|lavanderia'],
  ['🍼', 'bebe|panales|guagua|hijo|hija|ninos'],
  ['🧾', 'cuentas|servicios|boleta|impuesto|contribuciones|sii'],
  ['💼', 'sueldo|salario|remuneracion|pago semanal|pago mensual'],
  ['🧑‍💻', 'freelance|honorario|pega|trabajo extra|proyecto'],
  ['🏷️', 'venta|ventas|vendi'],
  ['↩️', 'reembolso|devolucion'],
  ['📈', 'inversion|interes|dividendos|acciones|fondo mutuo|cripto'],
  ['🎊', 'bono|aguinaldo|premio'],
  ['💰', 'otros ingresos|ingreso'],
  ['📦', 'otros|otro|varios'],
].map(([e, words]) => [e, new RegExp('(^|[^a-z])(' + words + ')', 'i')]);
const plainName = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const startsWithEmoji = s => /^\p{Extended_Pictographic}/u.test(String(s || '').trim());
function emojiFor(name, fallback = '') {
  if (!name || startsWithEmoji(name)) return '';
  const n = plainName(name);
  for (const [e, re] of EMOJI_RULES) if (re.test(n)) return e;
  return fallback;
}
// "🏠 Arriendo" (escapado para HTML)
const withEmoji = (name, fallback = '') => { const e = emojiFor(name, fallback); return (e ? e + ' ' : '') + esc(name); };

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
  return { version: 1, settings: { currency: 'CLP', startMonth: '2026-10', payday: 5, categories: clone(DEFAULT_CATS), updatedAt: 0 }, transactions: [], budgets: [], goals: [], accounts: clone(DEFAULT_ACCOUNTS) };
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
// Montos a ahorrar redondeados: a miles en pesos (38.066 → 38.000), a enteros en otras monedas
function roundSave(v) {
  const step = ['CLP', 'COP', 'ARS'].includes(data.settings.currency) ? 1000 : 1;
  return Math.round((Number(v) || 0) / step) * step;
}
// Ingresos que separan ahorro: Sueldo, los que parecen pago de trabajo, o los que la persona marcó
const SALARY_RE = /sueldo|salario|semanal|quincena|remuneraci|pago (mensual|semanal)|mensualidad trabajo/i;
function reservesByDefault(cat) {
  if (!cat) return false;
  const marked = data.settings.reserveCats;
  if (Array.isArray(marked) && marked.includes(cat)) return true;
  if (Array.isArray(data.settings.noReserveCats) && data.settings.noReserveCats.includes(cat)) return false;
  return cat === 'Sueldo' || SALARY_RE.test(plainName(cat));
}
function updateReserveBox() {
  const f = $('#txForm'), wrap = $('#reserveWrap'), r = reserveRates();
  const show = txType === 'ingreso' && r.emergency + r.savings > 0;
  wrap.hidden = !show;
  if (!show) return;
  $('#reserveText').textContent = `💰 Separar para mis fondos (${r.emergency}% emergencia + ${r.savings}% ahorro)`;
  const cat = f.category.value === '__new_category__' ? f.newCategory.value.trim() : f.category.value;
  f.separate.checked = (editingTx && editingTx.type === 'ingreso' && editingTx.category === cat && editingTx.reserves) ? true : reservesByDefault(cat);
}
function salaryReserves(amount, rates) {
  const emergency = roundSave(amount * rates.emergency / 100);
  const savings = roundSave(amount * rates.savings / 100);
  return { emergency, savings, rates: { ...rates } };
}
function reservedAmounts(txs = live(data.transactions)) {
  return txs.reduce((out, t) => {
    if (t.type === 'ingreso' && t.reserves) {
      out.emergency += roundSave(t.reserves.emergency);
      out.savings += roundSave(t.reserves.savings);
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
    <div class="summary-head"><h3>Movimientos</h3><a href="#" data-tab="movimientos">Ver todo</a></div>
    <p class="occasional-total neg">${fmt(total)}</p>
    ${expenses.length ? `<details class="occasional-details"><summary>Ver detalle (${expenses.length})</summary>
      <ul class="txlist">${expenses.map(t => txRow(t).replace('</small>', ` · ${esc(fmtDate(t.date))}</small>`)).join('')}</ul>
    </details>` : '<p class="muted">Sin movimientos este mes</p>'}
  </section>`;
}
function reservesCard() {
  const rates = reserveRates(), saved = reservedAmounts();
  const period = isAdmin() ? 'semanal' : 'mensual';
  return `<section class="card reserves"><h3>Separa parte de tu sueldo</h3>
    <p class="muted">Un porcentaje de cada sueldo ${period} va a tus fondos.</p>
    <div class="kv ftotal"><span>💰 Total a ahorrar</span><b>${fmt(saved.total)}</b></div>
    <div class="reserve-grid">
      <div><span>🛟 Fondo de emergencia</span><b>${fmt(saved.emergency)}</b></div>
      <div><span>🌱 Ahorro</span><b>${fmt(saved.savings)}</b></div>
    </div>
    <form id="reservesForm" class="form">
      <div class="reserve-grid">
        <label>Emergencia (%)<input name="emergency" type="number" min="0" max="100" step="0.1" value="${rates.emergency}" required inputmode="decimal"></label>
        <label>Ahorro (%)<input name="savings" type="number" min="0" max="100" step="0.1" value="${rates.savings}" required inputmode="decimal"></label>
      </div>
      <p class="muted">Te queda para gastar el ${100 - rates.emergency - rates.savings}% de cada sueldo.</p>
      <button class="btn wide ghost">Guardar porcentajes</button>
    </form>
  </section>`;
}

function sixMonthsCard() {
  const first = shiftMonth(ui.month, -5);
  const months = [...Array(6)].map((_, i) => shiftMonth(first, i));
  const series = months.map(m => totals(m));
  const inc = series.reduce((a, t) => a + t.inc, 0), exp = series.reduce((a, t) => a + t.exp, 0);
  const sum = inc + exp, share = sum ? inc / sum * 100 : 0;
  return `<section class="card six">
    <div class="summary-head"><h3>Últimos 6 meses</h3><span class="muted">${monthLabel(months[0], true)} – ${monthLabel(months[5], true)}</span></div>
    <div class="donutwrap six-months">
      <div class="donut" role="img" aria-label="Últimos seis meses: ingresos ${fmt(inc)}, gastos ${fmt(exp)}" style="background:${sum ? `conic-gradient(var(--inc) 0% ${share}%, var(--exp) ${share}% 100%)` : 'var(--line)'}">
        <div><small>Balance</small><b class="${inc - exp >= 0 ? 'pos' : 'neg'}">${fmt(inc - exp)}</b></div>
      </div>
      <ul class="legend">
        <li><i style="background:var(--inc)"></i><span>Ingresos</span><b>${fmt(inc)}</b><em>${sum ? Math.round(share) : 0}%</em></li>
        <li><i style="background:var(--exp)"></i><span>Gastos</span><b>${fmt(exp)}</b><em>${sum ? 100 - Math.round(share) : 0}%</em></li>
      </ul>
    </div>
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
  // se puede fijar un día exacto de inicio (settings.startDate); si no, el mes de inicio
  const sd = /^\d{4}-\d{2}-\d{2}$/.test(data.settings.startDate || '') ? data.settings.startDate : '';
  const start = sd || (startMonth() ? startMonth() + '-01' : '');
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
  return `<section class="card week mweek">
    <div class="summary-head"><h3>Este mes</h3><span class="mleft ${left < 0 ? 'neg' : ''}">${left < 0 ? 'Te pasaste ' + fmt(-left) : 'Quedan ' + fmt(left)}</span></div>
    ${inc > 0 ? progress(exp + reserved, inc) : ''}
    <p class="mnote">Gastaste ${fmt(exp)} de ${fmt(inc)}${inc > 0 && left > 0 && current < next ? ` · unos ${fmt(Math.floor(left / daysLeft))} por día` : ''}</p>
    ${pays.length ? '' : `<button class="btn wide" data-action="pay-month" data-date="${date}">Registrar pago del mes</button>`}
  </section>`;
}

const homePeriod = () => ['dia', 'semana', 'quincena', 'mes'].includes(data.settings.homePeriod)
  ? data.settings.homePeriod : (isAdmin() ? 'semana' : 'mes');

/* ---------- claridad del mes: libre de verdad, por pagar, comparación y guía ---------- */
function pctChange(now, before) {
  if (!(before > 0)) return null;
  return Math.round((now - before) / before * 100);
}
// flecha ↑↓ frente al mes anterior. good: 'down' si bajar es bueno (gastos), 'up' si subir es bueno (ingresos)
function deltaTag(now, before, good = 'down') {
  const p = pctChange(now, before);
  if (p === null) return '';
  if (p === 0) return '<span class="delta same">= igual que el mes pasado</span>';
  const up = p > 0, ok = good === 'down' ? !up : up;
  return `<span class="delta ${ok ? 'good' : 'bad'}" title="Frente a ${esc(monthLabel(shiftMonth(ui.month, -1)))}">${up ? '↑' : '↓'} ${Math.abs(p)}%</span>`;
}
// lo que falta por gastar/pagar de cada gasto mensual (sin contar dos veces lo que ya gastaste en esa categoría)
function pendingFixed(month = ui.month) {
  const spent = spentByCat(month);
  return budgetCats().filter(c => budgetFor(c, month) > 0 && !budgetPayment(c, month))
    .map(c => ({ cat: c, amount: Math.max(0, budgetFor(c, month) - (spent[c] || 0)), budget: budgetFor(c, month), spent: spent[c] || 0 }))
    .filter(x => x.amount > 0);
}
function clarityCard() {
  const m = ui.month, isNow = m === refDay().slice(0, 7);
  const payable = budgetCats().filter(c => budgetFor(c) > 0);
  const pend = pendingFixed(m), pendTotal = pend.reduce((s, x) => s + x.amount, 0);
  if (!isNow && !payable.length) return '';
  const accBal = balances(), total = accounts().reduce((s, a) => s + (accBal[a.id] || 0), 0);
  const reserved = reservedAmounts().total;
  const free = total - reserved - pendTotal;
  const end = fmtD(new Date(+m.slice(0, 4), +m.slice(5, 7), 0));
  const daysLeft = Math.max(1, daysBetween(refDay(), addDays(end, 1)));
  const paidN = payable.filter(c => budgetPayment(c, m) || (spentByCat(m)[c] || 0) >= budgetFor(c, m)).length;
  const hasMoney = total !== 0 || live(data.transactions).length > 0;
  const freeHTML = isNow && hasMoney ? `<div class="clear-math">
      <div><span>Dinero hoy</span><b>${fmt(total)}</b></div>
      ${pendTotal > 0 ? `<div><span>− Gastos mensuales por pagar <small>(${pend.length})</small></span><b class="neg">−${fmt(pendTotal)}</b></div>` : ''}
      ${reserved > 0 ? `<div><span>− Reservado para ahorro</span><b class="neg">−${fmt(reserved)}</b></div>` : ''}
      <div class="clear-free"><span>Libre de verdad</span><b class="${free < 0 ? 'neg' : 'pos'}">${fmt(free)}</b></div>
    </div>
    <p class="muted clear-day">${free > 0 ? `Puedes gastar unos <b>${fmt(Math.floor(free / daysLeft))}</b> por día hasta el ${shortDay(end)} (${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}).` : free < 0 ? '⚠️ Lo que tienes no alcanza para los gastos fijos que faltan. Revisa tus gastos ocio.' : 'Ya no te queda dinero libre este mes.'}</p>` : '';
  const listHTML = payable.length ? `<div class="pay-head"><b>Por pagar este mes</b><span class="muted">${paidN} de ${payable.length} pagados</span></div>
    ${pend.length ? `<ul class="paylist">${pend.map(x => `<li><span>${withEmoji(x.cat, '🧾')}${x.spent > 0 ? `<small class="payof">faltan de ${fmt(x.budget)}</small>` : ''}</span><b>${fmt(x.amount)}</b>${x.spent > 0 ? '<button type="button" class="btn small ghost" data-tab="presupuesto">Ver</button>' : `<button type="button" class="btn small" data-action="pay-bud" data-cat="${esc(x.cat)}">Pagar</button>`}</li>`).join('')}</ul>`
      : '<p class="paydone">✅ Todos tus gastos fijos de este mes están pagados.</p>'}` : (isNow ? '<p class="muted">Agrega tus gastos fijos (arriendo, luz, internet…) para ver cuánto te queda libre de verdad. <button type="button" class="slink" data-action="new-budget">+ Agregar</button></p>' : '');
  return `<section class="card clear">
    <div class="summary-head"><h3>${isNow ? 'Tu mes, claro' : 'Gastos fijos de ' + esc(monthLabel(m).split(' ')[0])}</h3></div>
    ${freeHTML}${listHTML}
  </section>`;
}
function guideCard() {
  const m = ui.month;
  if (m !== refDay().slice(0, 7) || (data.settings.guideHidden || '') === m) return '';
  const accs = accounts();
  const steps = [
    { done: accs.some(a => (a.initial || 0) !== 0), t: 'Anota cuánto tienes hoy', d: 'El saldo con que empiezas en efectivo y en el banco.', btn: accs.map(a => `<button type="button" class="btn small ghost" data-action="edit-acc" data-id="${a.id}">${accIcon(a)} ${esc(a.name)}</button>`).join('') },
    { done: txOfMonth(m).some(t => t.type === 'ingreso'), t: 'Registra tu sueldo o ingreso', d: 'Así sabes con cuánto cuentas este mes.', btn: '<button type="button" class="btn small" data-action="new-income">+ Ingreso</button>' },
    { done: budgetCats().length > 0, t: 'Agrega tus gastos fijos', d: 'Arriendo, cuentas, internet, suscripciones…', btn: '<button type="button" class="btn small" data-action="new-budget">+ Gasto fijo</button>' },
    { done: live(data.goals).length > 0, t: 'Ponte una meta o anota una deuda', d: 'Opcional, para ahorrar con un objetivo.', btn: '<button type="button" class="btn small ghost" data-action="new-goal">+ Meta</button>' },
  ];
  const n = steps.filter(s => s.done).length;
  if (n === steps.length) return '';
  return `<section class="card guide">
    <div class="summary-head"><h3>🚀 Empieza ${esc(monthLabel(m).split(' ')[0])} ordenado</h3><button type="button" class="slink" data-action="guide-hide">Ocultar</button></div>
    <div class="guide-bar"><i style="width:${n / steps.length * 100}%"></i></div><p class="muted" style="margin-top:6px">${n} de ${steps.length} pasos listos</p>
    <ol class="guide-steps">${steps.map(s => `<li class="${s.done ? 'done' : ''}"><span class="gnum" aria-hidden="true">${s.done ? '✓' : ''}</span><div><b>${s.t}</b><small>${s.d}</small>${s.done ? '' : `<div class="gbtns">${s.btn}</div>`}</div></li>`).join('')}</ol>
  </section>`;
}
function homePeriodCard() {
  const period = homePeriod();
  if (period === 'semana') return weekCard();
  if (period === 'mes') return monthlyPayCard();
  const todayDate = refDay();
  let from = todayDate, to = todayDate;
  let title = 'Hoy';
  if (period === 'quincena') {
    const d = parseD(todayDate), y = d.getFullYear(), m = d.getMonth();
    if (d.getDate() <= 15) { from = `${y}-${pad(m + 1)}-01`; to = `${y}-${pad(m + 1)}-15`; }
    else { from = `${y}-${pad(m + 1)}-16`; to = fmtD(new Date(y, m + 1, 0)); }
    title = d.getDate() <= 15 ? 'Primera quincena' : 'Segunda quincena';
  }
  const txs = live(data.transactions).filter(t => t.date >= from && t.date <= to);
  const inc = txs.filter(t => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0);
  const exp = txs.filter(t => t.type === 'gasto').reduce((s, t) => s + t.amount, 0);
  const reserved = reservedAmounts(txs).total;
  const left = inc - exp - reserved;
  const daysLeft = Math.max(1, daysBetween(todayDate, addDays(to, 1)));
  return `<section class="card week">
    <div class="summary-head"><h3>${title}</h3><span class="muted">${shortDay(from)}${from === to ? '' : ` – ${shortDay(to)}`}</span></div>
    <div class="weekgrid">
      <div><small>Recibiste</small><b class="pos">${fmt(inc)}</b></div>
      <div><small>Gastaste</small><b class="neg">${fmt(exp)}</b></div>
      <div><small>Disponible</small><b class="${left >= 0 ? '' : 'neg'}">${fmt(left)}</b></div>
    </div>
    ${reserved > 0 ? `<p class="muted">Reservado para emergencia y ahorro: <b>${fmt(reserved)}</b> · descontado del disponible.</p>` : ''}
    ${inc > 0 ? progress(exp + reserved, inc) : ''}
    ${inc > 0 && left > 0 && period === 'dia' ? `<p class="muted">Disponible hoy: <b>${fmt(left)}</b></p>` : ''}
    ${inc > 0 && left > 0 && period === 'quincena' ? `<p class="muted">Puedes gastar unos <b>${fmt(Math.floor(left / daysLeft))}</b> por día hasta fin de quincena.</p>` : ''}
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
// Monto fijo: el mismo monto todos los meses. Variable: se repite, pero conviene revisar el monto cada mes
function budgetFixed(b) { return b ? (typeof b.fixed === 'boolean' ? b.fixed : budgetRepeats(b)) : false; }
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
function saveBudgetMonth(cat, amount, repeat, deleted = false, fixed) {
  if (typeof fixed !== 'boolean') fixed = budgetFixed(activeBudget(cat));
  upsert('budgets', { id: 'b:' + cat + ':' + ui.month, category: cat, month: ui.month,
    amount, repeat, fixed, deleted, createdAt: now() });
}
// Cambia el nombre de un gasto mensual en todos sus meses y en sus pagos
function renameBudget(old, name) {
  const t = now();
  for (const b of data.budgets.filter(x => x.category === old)) {
    const nb = Object.assign({}, b, { id: 'b:' + name + ':' + budgetMonth(b), category: name, updatedAt: t });
    const i = data.budgets.findIndex(x => x.id === nb.id);
    if (i >= 0) data.budgets[i] = nb; else data.budgets.push(nb);
    b.deleted = true; b.updatedAt = t;
  }
  for (const tx of data.transactions.filter(x => x.category === old && x.budgetMonth)) {
    tx.category = name; if (tx.expenseName === old) tx.expenseName = name; tx.updatedAt = t;
  }
  const g = data.settings.categories.gasto;
  data.settings = Object.assign({}, data.settings, {
    categories: { ...data.settings.categories, gasto: g.includes(name) ? g : g.map(c => (c === old ? name : c)).concat(g.includes(old) ? [] : [name]) },
    updatedAt: t });
  commit();
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
    <label>Cuenta para ${withEmoji(item.cat)}<select name="account-${index}" required><option value="" disabled selected>Elige una cuenta</option>${accOptions('')}</select></label></div>`).join('');
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
  $('#budgetPayTitle').textContent = 'Pagar ' + ((emojiFor(cat) ? emojiFor(cat) + ' ' : '') + cat);
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
function setCloud(state, error = '') { cloud.state = state; cloud.error = error; renderSyncStatus(); if (state === 'ok') { restoreLock(); startFromOctober(); } }
// Una sola vez: todas las cuentas empiezan en octubre de 2026 (si alguien la empezó antes, se respeta)
function startFromOctober() {
  // solo cuando ya llegaron los ajustes reales de la cuenta desde la nube
  if (!cloud.user || window.PREVIEW || cloud.status !== 'activo' || !cloud.server.has('settings') || data.settings.inicioOctubre) return;
  const patch = { inicioOctubre: true, updatedAt: now() };
  if (!data.settings.startMonth || data.settings.startMonth > '2026-10') patch.startMonth = '2026-10';
  data.settings = Object.assign({}, data.settings, patch);
  setTimeout(() => { commit(); render(); }, 0);
}

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
  $('.brand').textContent = n || 'Mis Finanzas';
  document.title = n ? `Finanzas de ${n}` : 'Mis Finanzas';
}

const LS_PERSONAL = 'finanzas.modoPersonal';
const LS_ADMUSERS = 'finanzas.adminUsuariosAbierto';
const adminUsersOpen = () => { try { return localStorage.getItem(LS_ADMUSERS) === '1'; } catch { return false; } };
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
  setTimeout(applyAccent, 0);
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
  if (!doc.metadata.fromCache) setTimeout(() => { startFromOctober(); restoreLock(); }, 0);
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
  const st = $('#syncState');
  if (st) { st.className = 'sstate ' + kind; st.querySelector('span').textContent = msg; }
  const det = $('#syncDetail');
  if (det) det.textContent = cloud.error ? '⚠️ ' + cloud.error
    : cloud.state === 'offline' ? 'Sin conexión: lo que anotes se guarda aquí y se sube solo cuando vuelva internet.'
    : '';
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
  $('#authOther').hidden = true;
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
    const credId = toB64u(cred.rawId);
    writeJSON(LS_LOCK, { uid: cloud.user.uid, credId });
    // se guarda también en tu cuenta, así no se pierde cuando la app se actualiza o se reinstala
    const ids = [...new Set([...(data.settings.faceIds || []), credId])].slice(-6);
    data.settings = Object.assign({}, data.settings, { faceIds: ids, updatedAt: now() });
    commit();
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
function disableLock() {
  try { localStorage.removeItem(LS_LOCK); } catch { }
  data.settings = Object.assign({}, data.settings, { faceIds: [], updatedAt: now() });
  commit(); render(); toast('Bloqueo desactivado');
}
// Si este equipo perdió el ajuste (por una actualización o al reinstalar), se recupera desde tu cuenta
function restoreLock() {
  if (!cloud.user || window.PREVIEW) return;
  const cur = lockInfo();
  if (cur) {
    // quienes ya lo tenían activado: se respalda una vez en su cuenta (cuando ya está sincronizada)
    const ids = data.settings.faceIds || [];
    if (cloud.state === 'ok' && cloud.status === 'activo' && cloud.server.has('settings') && !ids.includes(cur.credId) && !cur.credIds) {
      data.settings = Object.assign({}, data.settings, { faceIds: [...ids, cur.credId].slice(-6), updatedAt: now() });
      setTimeout(commit, 0);
    }
    return;
  }
  const ids = data.settings.faceIds;
  if (!Array.isArray(ids) || !ids.length) return;
  writeJSON(LS_LOCK, { uid: cloud.user.uid, credId: ids[ids.length - 1], credIds: ids });
  try { localStorage.setItem(LS_FACE_ASKED + '.' + cloud.user.uid, '1'); } catch { }
}
async function unlock() {
  const l = lockInfo();
  if (!l) { unlocked = true; showScreen('app'); return; }
  try {
    await navigator.credentials.get({ publicKey: {
      challenge: rand(32), timeout: 60000, userVerification: 'required',
      allowCredentials: (l.credIds || [l.credId]).map(id => ({ type: 'public-key', id: fromB64u(id), transports: ['internal', 'hybrid'] })),
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
    <div class="budhead"><b>${withEmoji(g.name, isDebt ? '💳' : '🎯')}</b><span class="muted">${Math.round(p)}%</span></div>
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
    const open = adminUsersOpen();
    const listHTML = `<section class="card slist ausers">
      <button type="button" class="srow chev ahead" data-action="adm-users-toggle" aria-expanded="${open}"><span>👥 Usuarios <small class="acount">${others.length}</small></span></button>
      ${open ? (others.map(u => { const [lbl, cls] = STATUS[u.status] || ['—', '']; const self = u.uid === me; const nm = personName(u, u.email); return `<div class="srow auser">
        <div class="avatar sm" aria-hidden="true">${esc((nm || '?').trim()[0] || '?').toUpperCase()}</div>
        <div class="uinfo"><b>${esc(nm)}${self ? ' <span class="chip">Tú</span>' : ''}${u.status === 'bloqueado' ? ` <span class="chip ${cls}">${lbl}</span>` : ''}</b>
          <small>${esc(shownName(u.email))} · ${agoText(u.lastSeen)}</small>
          <div class="ulinks"><button class="slink" data-action="adm-name" data-id="${u.uid}">Nombre</button>${self ? '' : `<button class="slink" data-action="adm-view" data-id="${u.uid}">Ver finanzas</button>
          ${u.status === 'bloqueado' ? `<button class="slink" data-action="adm-unblock" data-id="${u.uid}">Desbloquear</button>`
            : `<button class="slink danger" data-action="adm-block" data-id="${u.uid}">Bloquear</button>`}`}</div></div></div>`; }).join('') || '<p class="muted">Aún no hay usuarios.</p>') : ''}
      </section>`;
    const top = `<div class="atop"><button class="slink" data-action="personal-on">👤 Ver solo mis finanzas</button></div>`;
    const nc = ui.newCreds;
    const credsHTML = nc ? `<div class="creds">
        <b>✓ Cuenta creada. Envíale estos datos a la persona:</b>
        <pre id="credsText">${esc(credsText(nc))}</pre>
        <div class="row-end"><button class="btn ghost" data-action="adm-creds-close">Listo</button><button class="btn" data-action="adm-copy">Copiar datos</button></div>
      </div>` : '';
    const addHTML = `<section class="card slist">
      <div class="srow aadd"><span>➕ Agregar persona<small>Se crea en Firebase con correo y contraseña</small></span></div>
      <div class="srow alinks">
        <button type="button" class="slink" data-action="adm-copy-link">🔗 Copiar enlace</button>
        <a class="slink" href="${FIREBASE_USERS_URL}" target="_blank" rel="noopener">Abrir Firebase ↗</a>
      </div>
    </section>`;
    return top + viewerHTML() + pendHTML + listHTML + addHTML;
  },

  inicio() {
    // Gastos ocio: los gastos sueltos del mes (no incluye los gastos mensuales)
    const ocio = {};
    for (const t of occasionalExpenses()) ocio[t.category] = (ocio[t.category] || 0) + t.amount;
    const byCat = Object.entries(ocio).sort((a, b) => b[1] - a[1]);
    const exp = byCat.reduce((s, [, v]) => s + v, 0);
    const spent = spentByCat(ui.month);
    const budCats = budgetCats().filter(c => budgetFor(c) > 0);
    const budTotal = budCats.reduce((s, c) => s + budgetFor(c), 0);
    const budSpent = budCats.reduce((s, c) => s + (spent[c] || 0), 0);
    const goals = live(data.goals);
    const res = reservedAmounts();

    const accBal = balances();
    const accs = accounts();
    const total = accs.reduce((s, a) => s + (accBal[a.id] || 0), 0);
    const mode = accountMode();
    const actions = [
      mode === 'ambos' ? '<button class="slink" data-action="new-acc">+ Cuenta</button>'
        : `<button class="slink" data-action="add-money">${mode === 'efectivo' ? '+ Agregar efectivo' : '+ Agregar dinero'}</button>`,
      accs.length >= 2 ? '<button class="slink" data-action="new-transfer">⇄ Mover</button>' : '',
    ].join('');

    // 1. Mi dinero
    const money = `<section class="card money mhome">
        <div class="mlabel">Mi dinero <span class="curchip" title="${esc(CURRENCY_NAMES[data.settings.currency] || '')}">${esc(data.settings.currency)}</span></div>
        <div class="mtotal ${total < 0 ? 'neg' : ''}">${fmt(total)}</div>
        ${res.total > 0 ? `<p class="mnote">Disponible ${fmt(total - res.total)} · reservado ${fmt(res.total)}</p>` : ''}
        <div class="accpills">${accs.map(a => `<button type="button" class="accpill" data-action="edit-acc" data-id="${a.id}">${accIcon(a)} ${esc(a.name)} <b class="${(accBal[a.id] || 0) < 0 ? 'neg' : ''}">${fmt(accBal[a.id] || 0)}</b></button>`).join('')}</div>
        <div class="qacts">
          <button type="button" class="qact" data-action="new-tx"><span aria-hidden="true">−</span>Gasto</button>
          <button type="button" class="qact" data-action="new-income"><span aria-hidden="true">+</span>Ingreso</button>
          ${accs.length >= 2 ? '<button type="button" class="qact" data-action="new-transfer"><span aria-hidden="true">⇄</span>Mover</button>' : ''}
        </div>
        <div class="mactions">${actions.replace('<button class="slink" data-action="new-transfer">⇄ Mover</button>', '')}</div>
      </section>`;

    // 3. En qué gastas: una barra delgada y la lista corta
    const top = byCat.slice(0, 4), rest = byCat.slice(4).reduce((s, [, v]) => s + v, 0);
    const prevOcio = {};
    for (const t of occasionalExpenses(shiftMonth(ui.month, -1))) prevOcio[t.category] = (prevOcio[t.category] || 0) + t.amount;
    const prevExp = Object.values(prevOcio).reduce((s, v) => s + v, 0);
    const spendCard = `<section class="card">
        <div class="summary-head"><h3>Gastos ocio</h3><a href="#" data-tab="movimientos">Ver todo</a></div>
        ${exp > 0 ? `<div class="hbig">${fmt(exp)} ${deltaTag(exp, prevExp)}</div>
          <div class="stackbar" role="img" aria-label="Gastos por categoría">${byCat.map(([c, v]) => `<span style="width:${v / exp * 100}%;background:${catColor(c)}"></span>`).join('')}</div>
          <ul class="mlist">${top.map(([c, v]) => `<li><i style="background:${catColor(c)}"></i><span>${withEmoji(c, '🧾')} ${deltaTag(v, prevOcio[c] || 0)}</span><b>${fmt(v)}</b></li>`).join('')}
            ${rest > 0 ? `<li><i style="background:var(--line)"></i><span>Otros</span><b>${fmt(rest)}</b></li>` : ''}</ul>`
          : '<p class="muted">Sin gastos de ocio este mes</p>'}
      </section>`;

    // 4. Gastos mensuales, con acceso directo para agregar uno
    const budCard = `<section class="card">
        <div class="summary-head"><h3>Gastos mensuales</h3>${budTotal > 0 ? '<a href="#" data-tab="presupuesto">Ver todo</a>' : ''}</div>
        ${budTotal > 0 ? `<div class="kv"><span>Pagado</span><b>${fmt(budSpent)} <small>de ${fmt(budTotal)}</small></b></div>
        ${progress(budSpent, budTotal)}` : '<p class="muted" style="margin:0">Anota tus gastos fijos, como arriendo o cuentas.</p>'}
        <button type="button" class="slink addbud" data-action="new-budget">+ Agregar gasto mensual</button>
      </section>`;

    // 5. La meta que elijas (o la primera) + tus fondos en una línea
    const homeGoal = goals.find(g => g.id === data.settings.homeGoal) || goals[0];
    const funds = res.total > 0 ? `<div class="kv ftotal"><span>💰 Total a ahorrar</span><b>${fmt(res.total)}</b></div>
        <p class="mnote fsplit">${[res.emergency > 0 ? `🛟 Emergencia ${fmt(res.emergency)}` : '', res.savings > 0 ? `🌱 Ahorro ${fmt(res.savings)}` : ''].filter(Boolean).join(' · ')}</p>` : '';
    const goalsCard = homeGoal || funds ? `<section class="card hgoal">
        <div class="summary-head"><h3>${homeGoal ? (homeGoal.kind === 'deuda' ? 'Mi deuda' : 'Mi meta') : 'Mis fondos'}</h3><a href="#" data-tab="metas">${goals.length > 1 ? 'Cambiar' : 'Ver todo'}</a></div>
        ${homeGoal ? goalRow(homeGoal, false) : ''}
        ${funds ? `<div class="hfunds">${funds}</div>` : ''}
      </section>` : '';

    return `<div class="homegrid">${guideCard()}${money}<div class="hcol">${clarityCard()}${homePeriodCard()}${budCard}${goalsCard}</div><div class="hcol">${spendCard}</div></div>`;
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
    const all = txOfMonth(ui.month), inc = all.filter(t => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0), out = all.filter(t => t.type === 'gasto').reduce((s, t) => s + t.amount, 0);
    const pv = txOfMonth(shiftMonth(ui.month, -1)), pInc = pv.filter(t => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0), pOut = pv.filter(t => t.type === 'gasto').reduce((s, t) => s + t.amount, 0);
    const sum = `<section class="card txsum"><div><small>Ingresos</small><b class="pos">${fmt(inc)}</b>${deltaTag(inc, pInc, 'up')}</div><div><small>Gastos</small><b class="neg">${fmt(out)}</b>${deltaTag(out, pOut)}</div><div><small>Balance</small><b class="${inc - out < 0 ? 'neg' : ''}">${fmt(inc - out)}</b></div></section>`;
    return sum + `<div class="seg">${seg}</div>${list || '<p class="empty">No hay movimientos este mes.<br>Toca + para agregar uno.</p>'}`;
  },

  presupuesto() {
    const spent = spentByCat(ui.month);
    const cats = budgetCats();
    const addBtn = `<div class="row-end"><button class="btn" data-action="new-budget">+ Agregar gasto mensual</button></div>`;
    if (!cats.length) return `<section class="card budget-panel"><h3>Gastos mensuales</h3>
      <p class="empty" style="padding:24px 12px">Aún no tienes gastos mensuales.<br>Agrega los fijos, como arriendo o supermercado.</p>
      ${addBtn}</section>` + sixMonthsCard();
    const rows = cats.map(c => {
      const b = budgetFor(c), s = spent[c] || 0, ab = activeBudget(c);
      const fixed = budgetFixed(ab), ownMonth = ab && budgetMonth(ab) === ui.month;
      const mes = monthLabel(ui.month).split(' ')[0];
      return `<div class="budrow">
        ${ui.renameBud === c ? `<form class="budrename" data-old="${esc(c)}">
            <input name="name" maxlength="30" value="${esc(c)}" aria-label="Nuevo nombre" required>
            <button type="button" class="slink" data-action="bud-rename-cancel">Cancelar</button><button class="btn">Guardar</button></form>`
          : `<div class="budhead"><b>${withEmoji(c, '🧾')} <button type="button" class="editname" data-action="bud-rename" data-cat="${esc(c)}" aria-label="Editar nombre de ${esc(c)}">✏️</button></b><span class="muted">${fmt(s)}${b ? ` / ${fmt(b)}` : ''}</span></div>`}
        ${b ? progress(s, b) : ''}
        ${budgetPaidControl(c)}
        <details class="budmore"${fixed ? '' : (ownMonth ? '' : ' open')}><summary>Cambiar monto${fixed ? ' · fijo' : ' · variable'}</summary>
        <div class="budinput"><label for="bud-${esc(c)}">✏️ Monto de ${mes}${fixed ? '' : ` <span class="vartag">${ownMonth ? 'Variable' : 'Variable · revisa este mes'}</span>`}</label>
          <span class="budctl"><input id="bud-${esc(c)}" type="number" inputmode="decimal" min="0" step="any" value="${b || ''}" placeholder="Sin límite" data-budget="${esc(c)}">
          <button class="iconbtn" data-action="del-budget" data-cat="${esc(c)}" aria-label="Quitar ${esc(c)} de gastos mensuales" title="Quitar de gastos mensuales">✕</button></span></div>
        <label class="budget-repeat"><input type="checkbox" data-budget-repeat="${esc(c)}" ${fixed ? 'checked' : ''}> Monto fijo</label>
        </details>
      </div>`;
    }).join('');
    return `<section class="card budget-panel"><h3>Gastos mensuales</h3>
      <p class="muted">Planifica tus gastos fijos y márcalos como pagados.</p>${addBtn}${budgetBulkControl()}<div class="budget-items">${rows}</div></section>` + sixMonthsCard();
  },

  metas() {
    const goals = live(data.goals);
    return reservesCard() + `<div class="summary-head section-head"><h3>Metas y deudas</h3><button class="slink" data-action="new-goal">+ Nueva</button></div>
      ${goals.length ? goals.map((g, i) => {
        const on = (goals.find(x => x.id === data.settings.homeGoal) || goals[0]).id === g.id;
        return `<section class="card">${goalRow(g, true)}<button type="button" class="pinhome ${on ? 'on' : ''}" data-action="home-goal" data-id="${g.id}" aria-pressed="${on}">${on ? '★ Se muestra en Inicio' : '☆ Mostrar en Inicio'}</button></section>`;
      }).join('')
        : '<p class="empty">Crea una meta, como unas vacaciones, o registra una deuda.</p>'}`;
  },

  ajustes() {
    const login = cloud.user ? (isUsernameAccount(cloud.user.email) ? shownName(cloud.user.email).replace('@finanzas', '') : cloud.user.email) : '';
    const name = window.PREVIEW ? 'Vista previa' : myName();
    const sw = (on, action, label, extra = '') => `<button type="button" class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="${label}" data-action="${action}" ${extra}><i></i></button>`;
    const moneyRow = (k, ico, label) => {
      const on = accountMode() === 'ambos' || accountMode() === k;
      return `<div class="srow"><span><span class="sico">${ico}</span>${label}</span>${sw(on, 'acc-toggle', 'Mostrar ' + label, `data-k="${k}"`)}</div>`;
    };
    return `<div class="settings">
      <section class="card sprofile">
        <div class="avatar" aria-hidden="true">${esc((name || '?').trim()[0] || '?').toUpperCase()}</div>
        <div class="pinfo">
          <b>${esc(name)}</b>
          <small>${esc(cloud.user ? shownName(cloud.user.email) : '')}</small>
          <small id="syncDetail"></small>
        </div>
        ${window.PREVIEW ? '' : `<button type="button" class="slink" data-action="edit-name">${ui.editName ? 'Cancelar' : 'Editar'}</button>`}
      </section>
      ${ui.editName ? `<form id="myNameForm" class="card sform">
        <label class="flabel" for="myName">Tu nombre</label>
        <div class="sinline"><input id="myName" name="name" maxlength="40" value="${esc(myName())}" autocomplete="name" required><button class="btn">Guardar</button></div>
      </form>` : ''}

      <h4 class="sgroup">Apariencia</h4>
      <section class="card slist">
        <div class="srow col"><span>Color</span>
          <div class="cdots">${ACCENTS.map(a => `<button type="button" class="cdot ${sessionAccent() === a.key ? 'on' : ''}" style="--sw:${a.color}" data-action="accent" data-v="${a.key}" aria-label="${a.name}" title="${a.name}" aria-pressed="${sessionAccent() === a.key}"></button>`).join('')}</div>
        </div>
        <label class="srow" for="currencySel"><span>Moneda</span>
          <select id="currencySel" class="sselect">${CURRENCIES.map(c => `<option value="${c}" ${c === data.settings.currency ? 'selected' : ''}>${c} · ${CURRENCY_NAMES[c]}</option>`).join('')}</select>
        </label>
      </section>

      <h4 class="sgroup">Mi dinero</h4>
      <section class="card slist">
        <label class="srow" for="homePeriodSel"><span>🏠 Período de Inicio</span>
          <select id="homePeriodSel" class="sselect">${[['dia','Día'],['semana','Semana'],['quincena','Quincena'],['mes','Mes']].map(([v,l]) => `<option value="${v}" ${homePeriod() === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </label>
        ${moneyRow('efectivo', '💵', 'Efectivo')}
        ${moneyRow('banco', '🏦', 'Banco')}
        <label class="srow" for="startSel"><span>📅 Registro desde</span>
          <input type="month" id="startSel" class="sselect smonth" value="${esc(data.settings.startMonth || '')}" max="2099-12" required></label>
      </section>
      <p class="snote">Elige qué cuentas aparecen en Inicio. Las que apagues quedan ocultas, no se borran.</p>

      ${window.PREVIEW ? '' : `<h4 class="sgroup">Seguridad</h4>
      <section class="card slist">
        <div class="srow"><span>Entrar con Face ID / huella</span>${sw(!!lockInfo(), 'lock-toggle', 'Entrar con Face ID o huella')}</div>
        ${isAdmin() ? `<div class="srow"><span>Modo personal<small>Oculta la pestaña Admin</small></span>${sw(personalMode(), personalMode() ? 'personal-off' : 'personal-on', 'Modo personal')}</div>` : ''}
        <button type="button" class="srow chev" data-action="toggle-pass" aria-expanded="${!!ui.passOpen}"><span>Cambiar contraseña</span></button>
        ${ui.passOpen ? `<form id="passForm" class="form spass">
          <input type="text" name="username" autocomplete="username" value="${esc(login)}" hidden>
          <label>Contraseña actual<input name="current" type="password" autocomplete="current-password" required></label>
          <label>Nueva contraseña<input name="newpass" type="password" autocomplete="new-password" minlength="6" required></label>
          <label>Repite la nueva contraseña<input name="newpass2" type="password" autocomplete="new-password" minlength="6" required></label>
          <p id="passError" class="autherr" hidden></p>
          <div class="row-end"><button class="btn">Guardar contraseña</button></div>
        </form>` : ''}
      </section>`}

      <h4 class="sgroup">Tus datos</h4>
      <section class="card slist">
        <button type="button" class="srow" data-action="sync"><span>Sincronización</span><span id="syncState" class="sstate"><i></i><span></span></span></button>
        <button type="button" class="srow chev" data-action="export-json"><span>Exportar respaldo</span></button>
        <button type="button" class="srow chev" data-action="export-csv"><span>Exportar movimientos (Excel/CSV)</span></button>
        <button type="button" class="srow chev" data-action="import-json"><span>Importar respaldo</span></button>
      </section>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
      <p class="snote">${live(data.transactions).length} movimientos · ${live(data.goals).length} metas guardadas</p>

      ${window.PREVIEW ? '' : `<section class="card slist slogout">
        <button type="button" class="srow danger" data-action="logout">Cerrar sesión</button>
      </section>`}
    </div>`;
  },
};

function render() {
  applyAccent();
  restoreLock();
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
  sel.innerHTML = cats.map(c => `<option value="${esc(c)}" ${c === selected ? 'selected' : ''}>${withEmoji(c)}</option>`).join('') + `<option value="__new_category__">${type === 'gasto' ? '➕ Agregar nuevo gasto…' : '➕ Nueva categoría de ingreso…'}</option>`;
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
  updateReserveBox();
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
    title = '⇄ Mover dinero'; sub = `${esc(accName(t.from))} → ${esc(accName(t.to))}`;
    amount = fmt(t.amount); cls = 'neutral';
  } else if (t.type === 'ajuste') {
    title = '⚖️ Ajuste de saldo'; sub = esc(accName(accId(t)));
    amount = (t.amount >= 0 ? '+' : '−') + fmt(Math.abs(t.amount)); cls = 'neutral';
  } else {
    title = withEmoji(t.expenseName || t.category, emojiFor(t.category, t.type === 'ingreso' ? '💰' : '🧾'));
    sub = t.type === 'ingreso' ? (methodOf(t) === 'efectivo' ? '💵 Efectivo' : '🏦 Transferencia') : esc(accName(accId(t)));
    amount = (t.type === 'ingreso' ? '+' : '−') + fmt(t.amount); cls = t.type === 'ingreso' ? 'pos' : 'neg';
  }
  if (t.reserves && t.type === 'ingreso') sub += ` · Emergencia ${fmt(t.reserves.emergency)} · Ahorro ${fmt(t.reserves.savings)}`;
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
  f.repeat.checked = false; delete f.repeat.dataset.touched;
  $('#budgetDialog').showModal();
  setTimeout(() => f.newcat.focus(), 50);
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
    case 'adm-users-toggle':
      try { localStorage.setItem(LS_ADMUSERS, adminUsersOpen() ? '0' : '1'); } catch { }
      render(); break;
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
    case 'new-income': openTx(); setTxType('ingreso'); break;
    case 'pay-bud': openBudgetPayment(el.dataset.cat); break;
    case 'guide-hide': data.settings = Object.assign({}, data.settings, { guideHidden: ui.month, updatedAt: now() }); commit(); toast('Puedes volver a verla el próximo mes'); break;
    case 'edit-name': ui.editName = !ui.editName; render(); if (ui.editName) setTimeout(() => { const i = $('#myName'); if (i) { i.focus(); i.select(); } }, 30); break;
    case 'toggle-pass': ui.passOpen = !ui.passOpen; render(); break;
    case 'home-goal':
      data.settings = Object.assign({}, data.settings, { homeGoal: el.dataset.id, updatedAt: now() });
      commit(); toast('Se mostrará en Inicio');
      break;
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
    case 'bud-rename':
      ui.renameBud = el.dataset.cat; render();
      setTimeout(() => { const i = document.querySelector('.budrename input'); if (i) { i.focus(); i.select(); } }, 30);
      break;
    case 'bud-rename-cancel': ui.renameBud = null; render(); break;
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
    if (txType === 'ingreso' && f.separate.checked && !$('#reserveWrap').hidden) {
      base.reserves = salaryReserves(amount, editingTx?.reserves?.rates || reserveRates());
    }
    if (txType === 'ingreso' && !$('#reserveWrap').hidden) {
      // se recuerda la elección para la próxima vez con esta categoría
      const on = new Set(data.settings.reserveCats || []), off = new Set(data.settings.noReserveCats || []);
      if (f.separate.checked) { on.add(category); off.delete(category); } else { off.add(category); on.delete(category); }
      data.settings = Object.assign({}, data.settings, { reserveCats: [...on], noReserveCats: [...off], updatedAt: now() });
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
  const id = editingGoal?.id || uid();
  // una meta nueva pasa a mostrarse en Inicio
  if (!editingGoal) data.settings = Object.assign({}, data.settings, { homeGoal: id, updatedAt: now() });
  upsert('goals', {
    id, kind: f.kind.value, name: f.name.value.trim(),
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
  if (el.id === 'homePeriodSel') {
    if (['dia', 'semana', 'quincena', 'mes'].includes(el.value)) {
      data.settings = Object.assign({}, data.settings, { homePeriod: el.value, updatedAt: now() });
      commit(); toast('Período de Inicio actualizado');
    }
  }
  if (el.name === 'repeat' && el.form?.id === 'budgetForm') el.dataset.touched = '1';
  if (el.name === 'category' && el.form?.id === 'txForm') {
    const creating = el.value === '__new_category__';
    $('#txNewCategoryWrap').hidden = !creating;
    el.form.newCategory.disabled = !creating;
    el.form.newCategory.required = creating;
    if (creating) el.form.newCategory.focus();
    updateReserveBox();
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
  if (el.id === 'startSel' && /^\d{4}-\d{2}$/.test(el.value)) {
    data.settings = Object.assign({}, data.settings, { startMonth: el.value, inicioOctubre: true, updatedAt: now() });
    if (ui.month < el.value) ui.month = el.value;
    commit(); toast('Tus registros empiezan en ' + monthLabel(el.value));
  }
  if (el.dataset.budgetRepeat !== undefined) {
    const cat = el.dataset.budgetRepeat;
    saveBudgetMonth(cat, budgetFor(cat), true, false, el.checked);
    toast(el.checked ? 'Monto fijo: se repite igual cada mes' : 'Monto variable: puedes cambiarlo cada mes');
  }
  if (el.dataset.budget !== undefined) {
    const cat = el.dataset.budget, amount = parseAmount(el.value);
    const old = activeBudget(cat);
    saveBudgetMonth(cat, amount, old ? budgetRepeats(old) : true);
    toast(`${cat}: ${fmt(amount)} desde ${monthLabel(ui.month)}`);
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
  if (e.target.classList.contains('budrename')) {
    e.preventDefault();
    const old = e.target.dataset.old;
    let name = e.target.name.value.trim().replace(/\s+/g, ' ');
    if (!name) return;
    name = name[0].toUpperCase() + name.slice(1);
    if (name !== old && budgetCats().some(c => c.toLowerCase() === name.toLowerCase())) { toast(`Ya tienes un gasto mensual llamado ${name}`); return; }
    if (name !== old) renameBudget(old, name);
    ui.renameBud = null; render();
    if (name !== old) toast(`Ahora se llama ${name}`);
    return;
  }
  if (e.target.id === 'budgetForm') {
    e.preventDefault();
    const f = e.target;
    let cat = f.newcat.value.trim().replace(/\s+/g, ' ');
    if (!cat) { toast('Escribe qué gasto es'); return; }
    cat = cat[0].toUpperCase() + cat.slice(1);
    const exists = data.settings.categories.gasto.find(c => c.toLowerCase() === cat.toLowerCase());
    if (exists) cat = exists;
    if (budgetCats().includes(cat)) { toast(`${cat} ya está en tus gastos mensuales`); return; }
    if (!exists) {
      data.settings = Object.assign({}, data.settings, {
        categories: { ...data.settings.categories, gasto: [...data.settings.categories.gasto, cat] }, updatedAt: now() });
    }
    saveBudgetMonth(cat, parseAmount(f.amount.value), true, false, f.repeat.checked);
    $('#budgetDialog').close();
    toast(`${cat} agregado a gastos mensuales`);
    return;
  }
  if (e.target.id === 'myNameForm') {
    e.preventDefault();
    saveName(cloud.user.uid, e.target.name.value).then(ok => { if (ok) { ui.editName = false; render(); } });
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
      .then(() => { f.reset(); ui.passOpen = false; render(); toast('Contraseña cambiada'); })
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

/* ---------- ojo para ver u ocultar contraseñas ---------- */
const EYE_ON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
function addEyes() {
  document.querySelectorAll('input[type="password"]:not([data-eye])').forEach(inp => {
    inp.dataset.eye = '1';
    const wrap = document.createElement('span'); wrap.className = 'pwrap';
    inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'eye'; b.setAttribute('aria-label', 'Mostrar contraseña'); b.innerHTML = EYE_ON;
    wrap.appendChild(b);
  });
}
document.addEventListener('click', e => {
  const b = e.target.closest('.eye'); if (!b) return;
  e.preventDefault();
  const inp = b.parentNode.querySelector('input');
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  b.innerHTML = show ? EYE_OFF : EYE_ON;
  b.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
});
// al enviar, se vuelve a ocultar (así el teléfono puede ofrecer guardar la contraseña)
document.addEventListener('submit', e => {
  e.target.querySelectorAll('input[data-eye]').forEach(i => {
    i.type = 'password';
    const b = i.parentNode.querySelector('.eye'); if (b) { b.innerHTML = EYE_ON; b.setAttribute('aria-label', 'Mostrar contraseña'); }
  });
}, true);
addEyes();
new MutationObserver(addEyes).observe(document.body, { childList: true, subtree: true });
