'use strict';
/* Agenda personal. Los datos viven en los ajustes de su dueño y usan la
   sincronización existente. No agrega usuarios ni comparte el taller. */
const AGENDA_KINDS = { telefono: 'Teléfono · batería, pantalla o flex', mac: 'MacBook / notebook', placa: 'Placa / equipo apagado' };
const AGENDA_STATUS = { cola: 'Por hacer', curso: 'En reparación', pausa: 'Pausado', repuesto: 'Esperando repuesto', autorizacion: 'Esperando autorización', listo: 'Terminado' };
const agendaUI = { date: '', panel: 'hoy', filter: 'pendientes' };
function agendaDefaults() {
  return { jobs: [], blocks: [], exceptions: {}, completed: {}, exerciseVersion: 1,
    config: { wakeTime: '08:30', commuteMinutes: 30, prepMinutes: 20, weekdayStart: '10:30', weekdayEnd: '19:30', saturdayStart: '10:30', saturdayEnd: '15:00', breakStart: '14:00', breakMinutes: 30, gap: 10 },
    routines: [
      { id: 'ejercicio-lunes', day: 1, time: '09:00', minutes: 20, name: 'Ejercicio en casa' },
      { id: 'ejercicio-miercoles', day: 3, time: '09:00', minutes: 20, name: 'Ejercicio en casa' },
      { id: 'ejercicio-viernes', day: 5, time: '09:00', minutes: 20, name: 'Ejercicio en casa' },
      { id: 'curso-lunes', day: 1, time: '20:45', minutes: 45, name: 'Curso de reparación' },
      { id: 'patitas', day: 2, time: '20:45', minutes: 45, name: 'Editar Patitas' },
      { id: 'descanso', day: 3, time: '20:45', minutes: 45, name: 'Tiempo para mí' },
      { id: 'curso-jueves', day: 4, time: '20:45', minutes: 45, name: 'Curso de reparación' },
      { id: 'finanzas', day: 5, time: '20:45', minutes: 15, name: 'Registrar pago y revisar finanzas' },
      { id: 'edicion-sabado', day: 6, time: '16:30', minutes: 60, name: 'Patitas / Mis Finanzas (opcional)' }
    ] };
}
function personalAgenda() {
  const defaults = agendaDefaults(), saved = clone(data.settings.personalAgenda || {});
  const a = { ...defaults, ...saved, config: { ...defaults.config, ...saved.config },
    jobs: Array.isArray(saved.jobs) ? saved.jobs : [], blocks: Array.isArray(saved.blocks) ? saved.blocks : [],
    routines: Array.isArray(saved.routines) ? saved.routines : defaults.routines,
    exceptions: saved.exceptions || {}, completed: saved.completed || {} };
  // Conserva los equipos anteriores y reúne todo en una única cola personal.
  let active = false;
  a.jobs.sort((x,y) => x.received.localeCompare(y.received) || x.order-y.order).forEach(j => {
    j.tech = 'yo';
    if (j.status === 'curso') { if (active) j.status = 'pausa'; else active = true; }
  });
  if (Array.isArray(saved.routines) && saved.exerciseVersion !== 1) {
    for (const r of defaults.routines.filter(r=>r.id.startsWith('ejercicio-'))) {
      if (!a.routines.some(x=>x.id === r.id)) a.routines.push(r);
    }
  }
  a.exerciseVersion = 1;
  for (const r of a.routines) if (r.id.startsWith('ejercicio-') && !Number.isFinite(r.wakeOffset)) r.wakeOffset = agMinutes(r.time) - agMinutes(a.config.wakeTime);
  a.routines.sort((x,y) => (x.day+6)%7 - (y.day+6)%7 || x.time.localeCompare(y.time));
  delete a.nextSimple;
  return a;
}
function savePersonalAgenda(a) {
  if (!hasPersonalAgenda()) return false;
  data.settings = { ...data.settings, personalAgenda: a, updatedAt: Math.max(now(), (data.settings.updatedAt || 0) + 1) };
  commit(); return true;
}
const agMinutes = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '') ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : NaN;
const agTime = n => pad(Math.floor(n / 60)) + ':' + pad(n % 60);
const agStamp = () => today() + 'T' + agTime(new Date().getHours() * 60 + new Date().getMinutes());
const agDateValid = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && fmtD(parseD(s)) === s;
const agKey = (date, id) => date + ':' + id;
function agendaWorkWindows(date, config) {
  const day = parseD(date).getDay();
  if (day === 0) return [];
  const from = agMinutes(day === 6 ? config.saturdayStart : config.weekdayStart);
  const to = agMinutes(day === 6 ? config.saturdayEnd : config.weekdayEnd);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return [];
  const pause = agMinutes(config.breakStart), length = Number(config.breakMinutes);
  if (!length || !Number.isFinite(pause) || pause >= to || pause + length <= from) return [[from, to]];
  return [[from, Math.max(from, pause)], [Math.min(to, pause + length), to]].filter(([a, b]) => b > a);
}
// Una sola cola personal por llegada, sin reparaciones simultáneas.
// Los bloques pueden continuar tras el descanso o al siguiente día hábil.
function planAgenda(a, reference = agStamp()) {
  const slots = [], unplaced = [];
  let next = reference;
  const jobs = a.jobs.filter(j => ['cola', 'curso'].includes(j.status)).slice().sort((x, y) =>
    Number(y.status === 'curso') - Number(x.status === 'curso') || x.received.localeCompare(y.received) || x.order - y.order);
  for (const job of jobs) {
    const tech = 'yo';
    let cursor = next > job.received ? next : job.received;
    let date = cursor.slice(0, 10), minute = agMinutes(cursor.slice(11, 16));
    const elapsed = job.status === 'curso' && job.started ? Math.max(0, Math.floor((new Date(reference) - new Date(job.started)) / 60000)) : 0;
    let remaining = Math.max(5, Math.min(480, (Number(job.minutes) || 30) - elapsed));
    let days = 0, pieces = [];
    while (remaining > 0 && days < 730) {
      const windows = agendaWorkWindows(date, a.config);
      for (const [from, to] of windows) {
        const start = Math.max(from, minute);
        if (start >= to) continue;
        const length = Math.min(remaining, to - start), end = start + length;
        pieces.push({ id: job.id, tech, date, from: agTime(start), to: agTime(end), minutes: length });
        remaining -= length; minute = end;
        if (!remaining) break;
      }
      if (remaining) { date = addDays(date, 1); minute = 0; days++; }
    }
    if (remaining) { unplaced.push(job.id); continue; }
    slots.push(...pieces);
    let nextMinute = minute + Number(a.config.gap || 0);
    if (nextMinute >= 1440) { date = addDays(date, 1); nextMinute -= 1440; }
    next = date + 'T' + agTime(nextMinute);
  }
  return { slots, unplaced };
}
function agendaOccurrences(a, from, to) {
  const out = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    for (const r of a.routines) if (r.day === parseD(date).getDay() && !a.exceptions[agKey(date, r.id)]) {
      out.push({ ...r, date, key: agKey(date, r.id), recurring: true });
    }
  }
  for (const b of a.blocks) if (b.date >= from && b.date <= to) out.push({ ...b, key: b.id, recurring: false });
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.time.localeCompare(y.time));
}
function agendaPersonalConflict(a, block, ignoreKey = '') {
  const from = agMinutes(block.time), to = from + Number(block.minutes);
  if (!Number.isFinite(from) || to > 1440) return 'El bloque debe terminar dentro del mismo día.';
  const day = parseD(block.date).getDay();
  const workFrom = agMinutes(day === 6 ? a.config.saturdayStart : a.config.weekdayStart);
  const workTo = agMinutes(day === 6 ? a.config.saturdayEnd : a.config.weekdayEnd);
  // También protege el descanso del taller, dentro de su jornada.
  const commute = Number(a.config.commuteMinutes ?? 30);
  if (day !== 0 && from < workTo + commute && to > workFrom - commute) return 'Ese horario está reservado para el trabajo y el traslado. Elige un espacio fuera de la jornada.';
  if (agendaOccurrences(a, block.date, block.date).some(b => b.key !== ignoreKey && from < agMinutes(b.time) + b.minutes && to > agMinutes(b.time))) return 'Ya tienes otra actividad en ese horario.';
  return '';
}
function agendaMorning(a, date) {
  const wake = agMinutes(a.config.wakeTime || '08:30');
  const day = parseD(date).getDay();
  const leave = day === 0 ? null : agMinutes(day === 6 ? a.config.saturdayStart : a.config.weekdayStart) - Number(a.config.commuteMinutes ?? 30);
  const exercise = agendaOccurrences(a,date,date).filter(b=>b.id.startsWith('ejercicio-'));
  const used = exercise.reduce((sum,b)=>sum+Number(b.minutes),0);
  return { wake, leave, exercise, available: leave === null ? null : Math.max(0, leave-wake), free: leave === null ? null : Math.max(0,leave-wake-used-Number(a.config.prepMinutes ?? 20)) };
}
function agendaScheduleError(a) {
  const wake = agMinutes(a.config.wakeTime || '08:30');
  if (!Number.isFinite(wake)) return 'Revisa la hora de levantarte.';
  for (const start of [a.config.weekdayStart,a.config.saturdayStart]) {
    if (wake + Number(a.config.prepMinutes ?? 20) > agMinutes(start) - Number(a.config.commuteMinutes ?? 30)) return 'No queda tiempo para prepararte y llegar al trabajo. Elige una hora más temprana.';
  }
  const monday = addDays(today(),-(parseD(today()).getDay()+6)%7);
  for (const r of a.routines) {
    const date=addDays(monday,(r.day+6)%7);
    if(r.id.startsWith('ejercicio-') && agMinutes(r.time)<wake) return 'El ejercicio no puede quedar antes de levantarte.';
    const message=agendaPersonalConflict({...a,exceptions:{}},{...r,date},agKey(date,r.id));
    if(message) return `${r.name}: ${message}`;
    if(r.id.startsWith('ejercicio-') && agMinutes(r.time)+r.minutes+Number(a.config.prepMinutes ?? 20)>agMinutes(r.day===6?a.config.saturdayStart:a.config.weekdayStart)-Number(a.config.commuteMinutes ?? 30)) return 'El ejercicio deja poco tiempo para prepararte. Levántate antes o reduce su duración.';
  }
  for(const b of a.blocks){const message=agendaPersonalConflict(a,b,b.id);if(message)return `${b.name}: ${message}`;}
  return '';
}
function agendaChangeWake(a, time, commute, prep) {
  const wake=agMinutes(time);
  if(!Number.isFinite(wake)||!Number.isFinite(commute)||commute<0||commute>180||!Number.isFinite(prep)||prep<5||prep>120) return 'Revisa la hora, el traslado y el tiempo para prepararte.';
  const previous=agMinutes(a.config.wakeTime || '08:30');
  a.config={...a.config,wakeTime:time,commuteMinutes:commute,prepMinutes:prep};
  for(const r of a.routines) if(r.id.startsWith('ejercicio-')) {
    const offset=Number.isFinite(r.wakeOffset)?r.wakeOffset:agMinutes(r.time)-previous;
    if(wake+offset<0||wake+offset+r.minutes>1440)return 'El ejercicio debe quedar dentro del mismo día.';
    r.wakeOffset=offset;r.time=agTime(wake+offset);
  }
  return agendaScheduleError(a);
}
function agendaJobRow(j, a, plan) {
  const slot = plan.slots.find(s => s.id === j.id);
  const last = plan.slots.filter(s => s.id === j.id).slice(-1)[0];
  const stopped = ['pausa', 'repuesto', 'autorizacion'].includes(j.status);
  const overrun = j.status === 'curso' && j.started && (new Date(agStamp()) - new Date(j.started)) / 60000 >= j.minutes;
  return `<article class="ag-job ${j.status === 'curso' ? 'ag-running' : ''}">
    <div class="ag-row"><span class="ag-caption">Equipo #${String(j.order).padStart(3,'0')}</span><span class="ag-status">${AGENDA_STATUS[j.status] || 'Por hacer'}</span></div>
    <h3>${esc(j.device)}</h3><p>${esc(j.fault)}</p>
    <p class="ag-caption">Llegó ${esc(shortDay(j.received.slice(0,10)))} · ${esc(j.received.slice(11,16))} · ${j.minutes} min${j.kind !== 'telefono' ? ' · diagnóstico / trabajo especializado' : ''}</p>
    ${slot ? `<p class="ag-time">${esc(shortDay(slot.date))} · ${slot.from}–${slot.to}${last && (last.date !== slot.date || last.to !== slot.to) ? ` · continúa hasta ${esc(shortDay(last.date))} ${last.to}` : ''}</p>` : `<p class="ag-caption">${stopped ? 'Fuera de la cola activa hasta que lo retomes.' : j.status === 'listo' ? 'Finalizado ' + esc(shortDay((j.finished || j.received).slice(0,10))) : 'Sin espacio calculado; revisa tus horarios.'}</p>`}
    ${j.started ? `<p class="ag-caption">${j.status === 'curso' ? 'En curso desde' : 'Último inicio'} ${esc(shortDay(j.started.slice(0,10)))} ${esc(j.started.slice(11,16))}</p>` : ''}
    ${overrun ? '<p class="ag-error">La estimación ya se cumplió. Edita los minutos restantes para ajustar los siguientes turnos.</p>' : ''}
    <div class="ag-job-actions">${j.status !== 'listo' ? `<button class="btn small" data-ag="${j.status === 'curso' ? 'finish' : 'start'}" data-id="${esc(j.id)}">${j.status === 'curso' ? 'Terminar' : stopped ? 'Retomar' : 'Empezar'}</button>${j.status === 'curso' ? `<button class="btn small ghost" data-ag="pause" data-id="${esc(j.id)}">Pausar</button>` : ''}` : `<button class="btn small ghost" data-ag="reopen" data-id="${esc(j.id)}">Reabrir</button>`}<button class="btn small ghost" data-ag="edit-job" data-id="${esc(j.id)}">Editar / estado</button></div>
  </article>`;
}
function agendaBlockRow(b, a) {
  const done = !!a.completed[b.key];
  return `<div class="ag-personal ${done ? 'ag-done' : ''}"><div><b>${esc(b.name)}</b><span class="ag-caption">${b.time}–${agTime(agMinutes(b.time) + b.minutes)}${b.recurring ? ' · semanal' : ''}${done ? ' · completado' : ''}</span></div><details class="ag-options"><summary>Opciones<span class="sr-only"> de ${esc(b.name)}</span></summary><div class="ag-job-actions"><button class="btn small ghost" data-ag="complete-block" data-key="${esc(b.key)}">${done ? 'Deshacer' : 'Hecho'}</button><button class="btn small ghost" data-ag="move-block" data-key="${esc(b.key)}" data-date="${b.date}">Mover</button></div></details></div>`;
}
function renderPersonalAgenda() {
  if (!hasPersonalAgenda()) return '';
  const a = personalAgenda(), date = agendaUI.date || today(), plan = planAgenda(a);
  const pending = a.jobs.filter(j => j.status !== 'listo').sort((x,y) => x.received.localeCompare(y.received) || x.order-y.order);
  const monday = addDays(date, -(parseD(date).getDay() + 6) % 7), sunday = addDays(monday,6);
  const week = agendaOccurrences(a, monday, sunday);
  const morning=agendaMorning(a,date);
  const duration=n=>`${Math.floor(n/60)?Math.floor(n/60)+' h ':''}${n%60?n%60+' min':n===0?'0 min':''}`.trim();
  const morningCard=`<details class="ag-morning"><summary><span>Mi mañana</span><span class="ag-caption">Me levanto ${a.config.wakeTime} · ${morning.leave===null?'día libre':'salgo '+agTime(morning.leave)}</span></summary><form id="agendaMorningForm" class="form"><label>Me levanto a las<input type="time" name="wakeTime" value="${a.config.wakeTime}" required></label><details><summary>Traslado y preparación</summary><div class="ag-fields"><label>Traslado · minutos<input type="number" name="commuteMinutes" min="0" max="180" value="${a.config.commuteMinutes}" required></label><label>Prepararme · minutos<input type="number" name="prepMinutes" min="5" max="120" value="${a.config.prepMinutes}" required></label></div></details><output class="ag-caption" data-wake-preview>${morning.available===null?'Sin salida al trabajo este día.':`${duration(morning.available)} antes de salir · ${duration(morning.free)} fuera de ejercicio y preparación.`}</output><p class="ag-caption">Al cambiar tu hora se ajusta el ejercicio de la rutina. Las actividades movidas a una fecha concreta y los cursos conservan su horario.</p><p class="ag-error" role="alert"></p><button class="btn">Guardar mi mañana</button></form></details>`;
  const jobForm = `<dialog id="agendaJobDialog"><form id="agendaJobForm" class="form" method="dialog"><h3 id="agendaJobTitle">Agregar equipo</h3><input type="hidden" name="id">
    <label>Equipo / modelo<input name="device" maxlength="80" required placeholder="Ej. iPhone 12 o MacBook Air"></label>
    <label>Falla o trabajo<textarea name="fault" maxlength="240" required placeholder="Ej. No enciende; primero diagnosticar"></textarea></label>
    <label>Tipo de reparación<select name="kind"><option value="telefono">Teléfono · batería, pantalla o flex</option><option value="mac">MacBook / notebook</option><option value="placa">Placa / equipo apagado</option></select></label>
    <p class="ag-caption">Se agrega a tu cola personal por orden de llegada, con una hora estimada según tu jornada.</p>
    <label>Tiempo estimado / restante, en minutos<input name="minutes" type="number" min="5" max="480" step="5" inputmode="numeric" value="30" required></label><p class="ag-caption">En placas y equipos apagados, reserva primero el diagnóstico. Al editar un equipo en reparación, indica los minutos que faltan desde ahora.</p>
    <label>Fecha y hora de llegada<input name="received" type="datetime-local" required></label>
    <label>Estado<select name="status">${Object.entries(AGENDA_STATUS).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>
    <p class="ag-caption">Los horarios son estimados; no son una promesa de entrega. No guardes contraseñas de los equipos aquí.</p><p class="ag-error" role="alert"></p><div class="row-end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn">Guardar equipo</button></div></form></dialog>`;
  const personalForm = `<dialog id="agendaBlockDialog"><form id="agendaBlockForm" class="form" method="dialog"><h3>Mi actividad personal</h3><input name="id" type="hidden"><input name="origin" type="hidden"><label>Actividad<input name="name" maxlength="80" required placeholder="Curso, Patitas o tiempo para mí"></label><label>Día<input type="date" name="date" required></label><label>Hora<input type="time" name="time" required value="20:45"></label><label>Duración en minutos<input name="minutes" type="number" min="5" max="240" step="5" value="45" required></label><p class="ag-caption">Mover una actividad semanal cambia solo esa fecha. La rutina de las siguientes semanas se conserva.</p><p class="ag-error" role="alert"></p><div class="row-end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn">Guardar actividad</button></div></form></dialog>`;
  let content;
  if (agendaUI.panel === 'cola') {
    const jobs = (agendaUI.filter === 'listo' ? a.jobs.filter(j=>j.status === 'listo').sort((x,y)=>(y.finished || y.received).localeCompare(x.finished || x.received)) : pending);
    content = `<section><div class="ag-row"><h3>Mis equipos</h3><label class="ag-filter">Ver<select id="agendaFilter"><option value="pendientes" ${agendaUI.filter==='pendientes'?'selected':''}>Pendientes</option><option value="listo" ${agendaUI.filter==='listo'?'selected':''}>Terminados</option></select></label></div><p class="ag-caption">Orden de llegada. Los equipos en espera conservan su turno y liberan tu espacio de trabajo.</p>${jobs.length ? jobs.map(j=>agendaJobRow(j,a,plan)).join('') : '<p class="muted">No hay equipos en esta lista.</p>'}</section>`;
  } else if (agendaUI.panel === 'semana') {
    content = `<section><div class="ag-row"><h3>Mi semana · ${esc(shortDay(monday))}–${esc(shortDay(sunday))}</h3><label class="ag-filter">Fecha<input id="agendaDate" type="date" value="${date}"></label></div>${Array.from({length:7},(_,i)=>{ const day=addDays(monday,i), blocks=week.filter(b=>b.date===day), windows=agendaWorkWindows(day,a.config); return `<section class="ag-weekday"><h4>${esc(shortDay(day))}</h4><p class="ag-caption">${windows.length ? `Trabajo ${windows[0] && agTime(windows[0][0])}–${agTime(windows[windows.length-1][1])} · traslado de ${a.config.commuteMinutes} min por trayecto` : 'Sin trabajo programado · tiempo personal'}</p>${blocks.map(b=>agendaBlockRow(b,a)).join('')}${!blocks.length ? '<p class="ag-caption">Tiempo libre, sin tareas añadidas.</p>' : ''}</section>`; }).join('')}<button class="btn ghost" data-ag="new-block">Agregar actividad</button></section>`;
  } else {
    const daySlots = plan.slots.filter(s=>s.date === date);
    const personal = agendaOccurrences(a,date,date);
    const inProgress = a.jobs.filter(j=>j.status === 'curso');
    content = `<section><div class="ag-row"><h3>Tu día</h3><label class="ag-filter">Fecha<input id="agendaDate" type="date" value="${date}"></label></div>
      ${inProgress.length ? `<div class="ag-now"><span class="ag-caption">En reparación ahora</span>${inProgress.map(j=>`<p><b>${esc(j.device)}</b></p>`).join('')}</div>` : '<p class="ag-caption">Empieza un equipo de tu cola para marcar lo que estás haciendo.</p>'}
      <section class="ag-my-work"><h4>Mis reparaciones</h4>${daySlots.map(s=>{const j=a.jobs.find(j=>j.id===s.id);return `<div class="ag-slot"><span>${s.from}–${s.to}</span><b>${esc(j.device)}</b><small>#${String(j.order).padStart(3,'0')} · ${esc(j.fault)}</small><button class="slink" data-ag="edit-job" data-id="${esc(j.id)}">Ver equipo</button></div>`;}).join('') || '<p class="ag-caption">Sin reparaciones previstas para este día.</p>'}</section>
      <div class="ag-personal-section"><div class="ag-row"><h3>Fuera del taller</h3><button class="slink" data-ag="new-block">Agregar actividad</button></div><p class="ag-caption">Trabajo, cursos y tiempo personal, sin cruzar horarios.</p>${personal.map(b=>agendaBlockRow(b,a)).join('') || '<p class="muted">No tienes actividades añadidas. Puedes dejar este espacio libre.</p>'}</div>
      ${pending.length ? `<details class="ag-more"><summary>Siguiente equipo</summary>${(()=>{const j=pending.find(j=>['cola','curso'].includes(j.status));return j?agendaJobRow(j,a,plan):'<p class="ag-caption">Tus equipos están en espera.</p>';})()}</details>` : ''}</section>`;
  }
  return `<div class="personal-agenda"><header class="ag-header"><div><h2>Mi agenda</h2><p class="ag-caption">Solo en tu cuenta · ${pending.length} ${pending.length===1?'equipo pendiente':'equipos pendientes'}</p></div><div class="ag-job-actions"><button class="slink" data-ag="refresh">Actualizar</button><button class="btn" data-ag="new-job">Agregar equipo</button></div></header>
    <div class="period-switch ag-tabs" role="group" aria-label="Vista de mi agenda">${[['hoy','Hoy'],['cola','Mis equipos'],['semana','Mi semana']].map(([id,name])=>`<button data-ag="panel" data-panel="${id}" aria-pressed="${agendaUI.panel===id}">${name}</button>`).join('')}</div>
    ${morningCard}
    ${plan.unplaced.length ? '<p class="ag-error">Hay equipos sin horario. Revisa la duración y tu jornada.</p>' : ''}${content}
    <details class="ag-config"><summary>Configurar mi horario y rutina</summary><form id="agendaConfigForm" class="form"><p class="ag-caption">Tu horario de trabajo. Domingo libre. Descanso propuesto de 14:00 a 14:30 y margen de 10 minutos; puedes ajustarlos.</p><div class="ag-fields"><label>Lunes a viernes · entrada<input name="weekdayStart" type="time" value="${a.config.weekdayStart}" required></label><label>Salida<input name="weekdayEnd" type="time" value="${a.config.weekdayEnd}" required></label><label>Sábado · entrada<input name="saturdayStart" type="time" value="${a.config.saturdayStart}" required></label><label>Salida del sábado<input name="saturdayEnd" type="time" value="${a.config.saturdayEnd}" required></label><label>Inicio del descanso<input name="breakStart" type="time" value="${a.config.breakStart}" required></label><label>Descanso · minutos (0 para quitar)<input name="breakMinutes" type="number" min="0" max="120" step="5" value="${a.config.breakMinutes}" required></label><label>Margen entre equipos · minutos<input name="gap" type="number" min="0" max="60" step="5" value="${a.config.gap}" required></label></div>
    <h3>Rutina semanal</h3><p class="ag-caption">Aplica a las próximas semanas. Puedes mover una fecha concreta desde Mi semana.</p>${a.routines.map(r=>`<fieldset class="ag-routine"><legend>${esc(DAYS[r.day])}</legend><label>Actividad<input name="name-${r.id}" maxlength="80" value="${esc(r.name)}" required></label><div class="ag-fields"><label>Hora<input type="time" name="time-${r.id}" value="${r.time}" required></label><label>Minutos<input type="number" min="5" max="240" step="5" name="minutes-${r.id}" value="${r.minutes}" required></label></div></fieldset>`).join('')}<p class="ag-error" role="alert"></p><button class="btn">Guardar horario</button></form></details>
    <details class="ag-help"><summary>Cómo se organizan los horarios</summary><p class="ag-caption ag-footnote">Los horarios se recalculan con las duraciones estimadas al abrir o actualizar la agenda. Los equipos pausados no se reprograman hasta retomarlos. La agenda no crea gastos ni ingresos.</p></details>
    ${jobForm}${personalForm}</div>`;
}
function agendaOpenJob(id = '') {
  const a=personalAgenda(), j=a.jobs.find(j=>j.id===id), f=document.getElementById('agendaJobForm');
  f.reset(); f.elements.id.value=j?.id || ''; f.elements.device.value=j?.device || ''; f.elements.fault.value=j?.fault || '';
  f.elements.kind.value=j?.kind || 'telefono'; f.elements.minutes.value=j?.minutes || 30;
  f.elements.received.value=j?.received || agStamp(); f.elements.status.value=j?.status || 'cola';
  document.getElementById('agendaJobTitle').textContent=j ? `Equipo #${String(j.order).padStart(3,'0')}` : 'Agregar equipo';
  document.getElementById('agendaJobDialog').showModal();
}
function agendaOpenBlock(key = '', date = '') {
  const a=personalAgenda(), f=document.getElementById('agendaBlockForm'); f.reset();
  const occurrence=key ? agendaOccurrences(a,date,date).find(b=>b.key===key) : null;
  f.elements.id.value=occurrence && !occurrence.recurring ? occurrence.id : '';
  f.elements.origin.value=occurrence?.recurring ? occurrence.key : '';
  f.elements.name.value=occurrence?.name || ''; f.elements.date.value=occurrence?.date || agendaUI.date || today();
  f.elements.time.value=occurrence?.time || '20:45'; f.elements.minutes.value=occurrence?.minutes || 45;
  document.getElementById('agendaBlockDialog').showModal();
}
document.addEventListener('click', event => {
  const b=event.target.closest('[data-ag]'); if (!b || !hasPersonalAgenda()) return;
  const action=b.dataset.ag, a=personalAgenda(), j=a.jobs.find(j=>j.id===b.dataset.id);
  if(action==='refresh'){render();return;}
  if(action==='panel'){agendaUI.panel=b.dataset.panel;render();return;}
  if(action==='new-job'||action==='edit-job'){agendaOpenJob(b.dataset.id);return;}
  if(action==='new-block'||action==='move-block'){agendaOpenBlock(b.dataset.key,b.dataset.date);return;}
  if(action==='complete-block'){a.completed[b.dataset.key]=!a.completed[b.dataset.key];savePersonalAgenda(a);return;}
  if(!j)return;
  if(action==='start'){
    if(a.jobs.some(x=>x.id!==j.id&&x.status==='curso')){toast('Ya tienes un equipo en reparación. Páusalo o termínalo primero.');return;}
    j.status='curso'; j.started=agStamp();
  }else if(action==='pause'){
    const elapsed=j.started?Math.max(0,Math.floor((new Date(agStamp())-new Date(j.started))/60000)):0;
    j.minutes=Math.max(5,Math.ceil((j.minutes-elapsed)/5)*5);j.status='pausa';
  }
  else if(action==='finish'){j.status='listo';j.finished=agStamp();}
  else if(action==='reopen'){j.status='cola';delete j.finished;}
  else return;
  j.updatedAt=now();savePersonalAgenda(a);
});
document.addEventListener('change', event=>{
  if(!hasPersonalAgenda())return;
  if(event.target.id==='agendaDate'&&agDateValid(event.target.value)){agendaUI.date=event.target.value;render();}
  if(event.target.id==='agendaFilter'){agendaUI.filter=event.target.value;render();}
  if(event.target.matches('#agendaJobForm [name="kind"]')){
    const f=event.target.form;
    f.elements.minutes.value=f.elements.kind.value==='telefono'?'30':'60';
  }
});
document.addEventListener('submit',event=>{
  const f=event.target;
  const formID=f.getAttribute('id');
  if(!['agendaJobForm','agendaBlockForm','agendaConfigForm','agendaMorningForm'].includes(formID))return;
  event.preventDefault();if(!hasPersonalAgenda())return;
  const a=personalAgenda(), v=name=>f.elements[name].value, error=message=>{f.querySelector('.ag-error').textContent=message;};
  if(formID==='agendaMorningForm'){
    const message=agendaChangeWake(a,v('wakeTime'),Number(v('commuteMinutes')),Number(v('prepMinutes')));
    if(message){error(message);return;}
  }else if(formID==='agendaJobForm'){
    const id=v('id'), old=a.jobs.find(j=>j.id===id), kind=v('kind'), minutes=Number(v('minutes')), received=v('received');
    if(!v('device').trim()||!v('fault').trim()||!AGENDA_KINDS[kind]||!AGENDA_STATUS[v('status')]||!Number.isFinite(minutes)||minutes<5||minutes>480||minutes%5||!agDateValid(received.slice(0,10))||!Number.isFinite(agMinutes(received.slice(11,16)))){error('Revisa el equipo, la llegada y la duración (de 5 a 480 minutos, en pasos de 5).');return;}
    if(!old&&a.jobs.length>=500){error('La agenda admite 500 equipos. Conserva tu historial mediante una exportación antes de seguir ampliándola.');return;}
    const tech='yo';
    if(v('status')==='curso'&&a.jobs.some(j=>j.id!==id&&j.status==='curso')){error('Ya tienes un equipo en reparación. Páusalo o termínalo antes.');return;}
    const j={...old,id:old?.id||uid(),order:old?.order||Math.max(0,...a.jobs.map(j=>j.order))+1,device:v('device').trim(),fault:v('fault').trim(),kind,tech,minutes,received,status:v('status'),updatedAt:now()};
    if(j.status==='curso')j.started=agStamp();
    if(j.status==='listo'&&old?.status!=='listo')j.finished=agStamp();
    if(old)a.jobs[a.jobs.findIndex(x=>x.id===old.id)]=j;else a.jobs.push(j);
    document.getElementById('agendaJobDialog').close();
  }else if(formID==='agendaBlockForm'){
    const block={id:v('id')||uid(),name:v('name').trim(),date:v('date'),time:v('time'),minutes:Number(v('minutes'))};
    if(!block.name||!agDateValid(block.date)||!Number.isFinite(block.minutes)||block.minutes<5||block.minutes>240||block.minutes%5){error('Revisa la fecha, el nombre y la duración de la actividad.');return;}
    const conflict=agendaPersonalConflict(a,block,v('origin')||v('id'));if(conflict){error(conflict);return;}
    const index=a.blocks.findIndex(b=>b.id===block.id);
    if(index>=0)a.blocks[index]=block;else a.blocks.push(block);
    if(v('origin')){a.exceptions[v('origin')]=true;if(a.completed[v('origin')])a.completed[block.id]=true;}
    document.getElementById('agendaBlockDialog').close();
  }else{
    const config={...a.config,weekdayStart:v('weekdayStart'),weekdayEnd:v('weekdayEnd'),saturdayStart:v('saturdayStart'),saturdayEnd:v('saturdayEnd'),breakStart:v('breakStart'),breakMinutes:Number(v('breakMinutes')),gap:Number(v('gap'))};
    if(Object.entries(config).some(([key,value])=>typeof value==='string'?!Number.isFinite(agMinutes(value)):!Number.isFinite(value))||agMinutes(config.weekdayStart)>=agMinutes(config.weekdayEnd)||agMinutes(config.saturdayStart)>=agMinutes(config.saturdayEnd)||config.breakMinutes<0||config.breakMinutes>120||config.gap<0||config.gap>60){error('Revisa las horas de entrada, salida, descanso y margen.');return;}
    if(!agendaWorkWindows('2026-11-02',config).length||!agendaWorkWindows('2026-11-07',config).length){error('El descanso no puede ocupar toda la jornada.');return;}
    a.config=config;
    for(const r of a.routines){r.name=v('name-'+r.id).trim();r.time=v('time-'+r.id);r.minutes=Number(v('minutes-'+r.id));
      if(!r.name||!Number.isFinite(agMinutes(r.time))||!Number.isFinite(r.minutes)||r.minutes<5||r.minutes>240||agMinutes(r.time)+r.minutes>1440){error('Revisa la hora y duración de la rutina.');return;}
      if(r.id.startsWith('ejercicio-'))r.wakeOffset=agMinutes(r.time)-agMinutes(a.config.wakeTime);
    }
    // Comprueba una semana representativa sin excepciones, y todas las
    // actividades con fecha. Así un cambio de jornada no crea solapamientos.
    const message=agendaScheduleError(a);if(message){error(message);return;}
  }
  savePersonalAgenda(a);toast('Agenda guardada en tu cuenta');
});
document.addEventListener('input',event=>{
  if(!hasPersonalAgenda()||!event.target.matches('#agendaMorningForm input'))return;
  const f=event.target.form,a=personalAgenda();
  const message=agendaChangeWake(a,f.elements.wakeTime.value,Number(f.elements.commuteMinutes.value),Number(f.elements.prepMinutes.value));
  const exercise=a.routines.find(r=>r.id.startsWith('ejercicio-'));
  const morning=agendaMorning(a,agendaUI.date||today());
  f.querySelector('[data-wake-preview]').textContent=message || `${exercise?'Ejercicio desde '+exercise.time+' en los días programados. ':''}${morning.leave===null?'Día libre.':'Salida al trabajo '+agTime(morning.leave)+'.'}`;
});
