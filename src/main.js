// SuperApp Max — Planta Súper Sacos
// Módulo 1: Métodos y Tiempos. Es el mismo panel del artefacto original
// ("Tiempos y Movimientos SS"), pero los datos viven en Supabase.
// Este archivo también arma el selector de módulos (Bi-horario y Personal
// viven en sus propios archivos).
import { supabase } from './supabaseClient.js'
import * as bihorario from './bihorario.js'
import * as personal from './personal.js'
import * as marcador from './marcador.js'

/* ---------- estado ---------- */
const D = {
  operaciones: [],   // [{nombre, familia, tipo}]
  codigos: {},       // codigo -> {codigo, cliente, descripcion, linea}
  tiempos: {},       // codigo -> [{op, min, obs, val, supl, muestras, ts}]
  actualizado: {},   // codigo -> ISO de la última edición de sus tiempos
  planning: [],      // [{codigo, cliente, descripcion, linea, prox_fab, ult_fab, veces}]
  corte_planning: '',
}
let ROLE = null, PERFIL = null, dbReady = false
let swTimer = null, swRunning = false, swBase = 0, swAcc = 0, swSamples = [], swMax = 5, swRowIndex = -1, swOp = '', swHadPrev = false, swConfirmed = false
let curTab = 'resumen', curCode = null, codeFilter = { q: '', cli: '', estado: '' }, opFilter = { q: '', fam: '', tipo: '' }

/* ---------- utilidades de datos ---------- */
function opList() { return D.operaciones }
let _tipoMap = null
function tipoMap() { const m = {}; opList().forEach(o => m[o.nombre] = o.tipo); return m }
function tipoOf(nombre) { return (_tipoMap || (_tipoMap = tipoMap()))[nombre] || '' }
function invalidateMaps() { _tipoMap = null }

function codigos() {
  return Object.values(D.codigos).sort((a, b) => (a.cliente || '').localeCompare(b.cliente || '') || a.codigo.localeCompare(b.codigo))
}
function codigoByCode(code) { return D.codigos[code] || null }
function tiemposOf(code) { return D.tiempos[code] || [] }
function hasTiempos(code) { return tiemposOf(code).length > 0 }
function fmtDateShort(iso) { if (!iso) return ''; const d = new Date(iso); if (isNaN(d.getTime())) return ''; return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getFullYear()).slice(2) }
function ultAct(code) { return fmtDateShort(D.actualizado[code]) }
// Un código con operaciones agregadas desde el Bi-horario sigue incompleto hasta
// que el admin confirme que tiene todas sus operaciones de costura.
function statusCode(code) { const r = tiemposOf(code); if (!r.length) return 'sin'; if (D.porConfirmar && D.porConfirmar.has(code)) return 'incompleto'; return r.every(x => typeof x.min === 'number' && !isNaN(x.min)) ? 'completo' : 'incompleto' }
async function marcarPorConfirmar(code, valor) {
  const { error } = await supabase.from('codigos').update({ ops_por_confirmar: valor, updated_at: new Date().toISOString() }).eq('codigo', code)
  if (error) { console.error(error); toast('No se pudo guardar el estado del código.'); return false }
  valor ? D.porConfirmar.add(code) : D.porConfirmar.delete(code)
  return true
}
function confirmarOps(code) {
  marcarPorConfirmar(code, false).then(ok => { if (ok) { toast('Listo: el código queda con sus operaciones confirmadas.'); render() } })
}
function estadoPill(code) { const s = statusCode(code); return s === 'completo' ? '<span class="pill si">Completo</span>' : (s === 'incompleto' ? '<span class="pill inc">Incompleto</span>' : '<span class="pill no">Sin estudio</span>') }
function codeInfo(code) { return codigoByCode(code) || D.planning.find(p => p.codigo === code) || { codigo: code, cliente: '', descripcion: '', linea: '' } }
function futuras() { return D.planning.map(p => ({ codigo: p.codigo, cliente: p.cliente, descripcion: p.descripcion, linea: p.linea, prox_fab: p.prox_fab, estado: statusCode(p.codigo), costura: costuraTotal(p.codigo) })) }
function maxUlt() { return D.planning.reduce((m, p) => (p.ult_fab || '') > m ? p.ult_fab : m, '') }
function costuraTotal(code) { return tiemposOf(code).reduce((s, r) => tipoOf(r.op) === 'Costura' ? s + (+r.min || 0) : s, 0) }
function nOpsCostura(code) { return tiemposOf(code).filter(r => tipoOf(r.op) === 'Costura').length }
function uph(min) { return (typeof min === 'number' && min > 0) ? 60 / min : null }
const num = v => (v == null || v === '') ? null : Number(v)

/* ---------- Supabase: carga ---------- */
// Supabase entrega máximo 1000 filas por consulta; se pide por páginas.
async function fetchAll(table, select, order) {
  const out = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(select).range(from, from + 999)
    for (const o of order) q = q.order(o)
    const { data, error } = await q
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

async function loadAll() {
  dbReady = false; render()
  try {
    const [ops, cods, ts, plan, cfg] = await Promise.all([
      fetchAll('operaciones', 'nombre, familia, tipo', ['nombre']),
      fetchAll('codigos', 'codigo, cliente, descripcion, linea, tiempos_updated_at, ops_por_confirmar', ['codigo']),
      fetchAll('tiempos', 'codigo, operacion, min, obs, val, supl, muestras, orden, tomado_at, fuente', ['codigo', 'orden']),
      fetchAll('planning', 'codigo, cliente, descripcion, linea, prox_fab, ult_fab, veces, orden', ['orden']),
      fetchAll('config', 'clave, valor', ['clave']),
    ])
    D.operaciones = ops
    D.codigos = {}; D.actualizado = {}; D.porConfirmar = new Set()
    cods.forEach(c => {
      D.codigos[c.codigo] = { codigo: c.codigo, cliente: c.cliente, descripcion: c.descripcion, linea: c.linea }
      if (c.tiempos_updated_at) D.actualizado[c.codigo] = c.tiempos_updated_at
      if (c.ops_por_confirmar) D.porConfirmar.add(c.codigo)
    })
    D.tiempos = {}
    ts.forEach(t => {
      ;(D.tiempos[t.codigo] ||= []).push({
        op: t.operacion, min: num(t.min), obs: num(t.obs), val: num(t.val), supl: num(t.supl),
        muestras: Array.isArray(t.muestras) ? t.muestras : [], ts: t.tomado_at || undefined, fuente: t.fuente || undefined,
      })
    })
    D.planning = plan
    const corte = cfg.find(c => c.clave === 'corte_planning')
    D.corte_planning = corte ? corte.valor : ''
    invalidateMaps()
  } catch (e) {
    console.error(e)
    toast('No se pudieron cargar los datos. Revisa la conexión.')
  }
  dbReady = true; render()
  const m = MODULOS[curMod].mod; if (m && m.onM1Ready) m.onM1Ready()
}

/* ---------- Supabase: escritura ---------- */
function requireWrite() {
  if (ROLE !== 'admin') { toast('Modo visita: solo lectura.'); return false }
  return true
}
async function saveTiempos(code, rows, { sinRepintar = false } = {}) {
  if (!requireWrite()) return false
  const { error } = await supabase.rpc('guardar_tiempos', { p_codigo: code, p_rows: rows })
  if (error) { console.error(error); toast('No se pudo guardar. Intenta de nuevo.'); return false }
  D.tiempos[code] = rows.map(r => ({ ...r }))
  D.actualizado[code] = new Date().toISOString()
  if (!codigoByCode(code)) {
    const p = D.planning.find(x => x.codigo === code)
    D.codigos[code] = { codigo: code, cliente: p ? p.cliente : '', descripcion: p ? p.descripcion : '', linea: p ? p.linea : '' }
  }
  if (!sinRepintar) render()
  return true
}
async function saveCodigo(obj) {
  if (!requireWrite()) return false
  const { error } = await supabase.from('codigos').upsert({ ...obj, updated_at: new Date().toISOString() })
  if (error) { console.error(error); toast('No se pudo guardar el código.'); return false }
  D.codigos[obj.codigo] = { ...obj }
  render()
  return true
}
async function saveOperacion(rec) {
  if (!requireWrite()) return false
  const { error } = await supabase.from('operaciones').upsert({ ...rec, updated_at: new Date().toISOString() })
  if (error) { console.error(error); toast('No se pudo guardar la operación.'); return false }
  const ix = D.operaciones.findIndex(x => x.nombre === rec.nombre)
  if (ix >= 0) D.operaciones[ix] = rec; else D.operaciones.push(rec)
  invalidateMaps(); render()
  return true
}

/* ---------- toast / modal ---------- */
let toastT = null
function toast(msg) { const n = document.getElementById('notice'); n.textContent = msg; n.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => n.classList.remove('show'), 2600) }
function openModal(html, wide) { const m = document.getElementById('modal'); m.innerHTML = html; m.classList.toggle('wide', !!wide); document.getElementById('modalBg').classList.add('open') }
function closeModal() { try { clearInterval(swTimer) } catch (e) {} swRunning = false; document.getElementById('modalBg').classList.remove('open') }
document.getElementById('modalBg').addEventListener('click', e => { if (e.target.id === 'modalBg') closeModal() })

/* ---------- helpers de formato ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const fmt = (n, d = 2) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d })
const fmt0 = n => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('es-CO')
const loadingHtml = '<div class="loading">Cargando datos…</div>'

/* ---------- RESUMEN ---------- */
function renderResumen() {
  const el = document.getElementById('p-resumen')
  if (!dbReady) { el.innerHTML = loadingHtml; return }
  const cods = codigos()
  const comp = cods.filter(c => statusCode(c.codigo) === 'completo').length
  const inc = cods.filter(c => statusCode(c.codigo) === 'incompleto').length
  const sinE = cods.length - comp - inc
  const ops = opList(); const nCos = ops.filter(o => o.tipo === 'Costura').length
  const fut = futuras(); const fComp = fut.filter(f => f.estado === 'completo').length; const fFalta = fut.length - fComp
  const pct = fut.length ? Math.round(100 * fComp / fut.length) : 0
  const faltan = fut.filter(f => f.estado !== 'completo')
  el.innerHTML = `
  <div class="grid kpis">
    <div class="kpi accent"><div class="label">Códigos registrados</div><div class="value">${fmt0(cods.length)}</div><div class="sub">de ${fmt0(new Set(cods.map(c => c.cliente)).size)} clientes</div></div>
    <div class="kpi good"><div class="label">Tiempos completos</div><div class="value">${fmt0(comp)}</div><div class="sub">${cods.length ? Math.round(100 * comp / cods.length) : 0}% del total</div></div>
    <div class="kpi bad"><div class="label">Faltan por completar</div><div class="value">${fmt0(inc + sinE)}</div><div class="sub">${inc} incompletos · ${sinE} sin estudio</div></div>
    <div class="kpi"><div class="label">Operaciones</div><div class="value">${fmt0(ops.length)}</div><div class="sub">${nCos} de costura</div></div>
  </div>

  <div class="section">
    <h2>Producción futura — cobertura de tiempos</h2>
    <div class="hint">Todos los códigos que vienen de hoy en adelante según el plan (MAESTRO_PROG), hasta ${esc(maxUlt())}. Corte del plan: ${esc(D.corte_planning)}.</div>
    <div class="grid kpis" style="margin-bottom:14px">
      <div class="kpi accent click" data-tab-go="futura" title="Ver todos"><div class="label">Códigos a fabricar</div><div class="value">${fmt0(fut.length)}</div><div class="sub">toca para ver la lista →</div></div>
      <div class="kpi good"><div class="label">Con tiempos completos</div><div class="value">${pct}%</div><div class="sub">${fComp} códigos</div></div>
      <div class="kpi bad"><div class="label">Faltan</div><div class="value">${100 - pct}%</div><div class="sub">${fFalta} códigos a priorizar</div></div>
    </div>
    <div class="bar"><i class="b-si" style="width:${pct}%"></i><i class="b-no" style="width:${100 - pct}%"></i></div>
    <div class="legend"><span><i class="dot" style="background:var(--good)"></i>Completos</span><span><i class="dot" style="background:var(--amber)"></i>Faltan (sin estudio o incompletos)</span></div>
  </div>

  <div class="section">
    <h2>A estudiar primero (${faltan.length})</h2>
    <div class="hint">Lo que viene y todavía no tiene los tiempos completos, por orden de próxima fabricación. Un código con operaciones pero sin todos los minutos cuenta como incompleto.</div>
    ${faltan.length ? `<div class="tablebox"><table><thead><tr><th>Código</th><th>Cliente</th><th>Descripción</th><th>Línea</th><th>Estado</th><th></th></tr></thead><tbody>
      ${faltan.map(f => `<tr><td class="codecell">${esc(f.codigo)}</td><td>${esc(f.cliente)}</td><td class="muted">${esc(f.descripcion)}</td><td>${esc(f.linea)}</td><td>${estadoPill(f.codigo)}</td>
        <td><button class="btn sm" data-go="${esc(f.codigo)}">Registrar</button></td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty">Todo lo que viene ya tiene tiempos completos. 🎯</div>`}
  </div>

  <div class="section">
    <h2>Para actualizar el plan</h2>
    <div class="hint">La producción futura es una foto del plan. Cuando cambie en Teams, súbeme el MAESTRO_PROG y lo recargo. El resto del panel (códigos, tiempos, operaciones) vive permanente aquí.</div>
  </div>`
}

let futFilter = ''
function renderFutura() {
  const el = document.getElementById('p-futura')
  if (!dbReady) { el.innerHTML = loadingHtml; return }
  const all = futuras()
  let rows = all
  if (futFilter === 'completo') rows = all.filter(f => f.estado === 'completo')
  if (futFilter === 'falta') rows = all.filter(f => f.estado !== 'completo')
  el.innerHTML = `
  <div class="section">
    <h2>Producción futura (${all.length})</h2>
    <div class="hint">Códigos que vienen de hoy en adelante según el plan, ordenados por próxima fabricación. Hasta ${esc(maxUlt())}. Corte ${esc(D.corte_planning)}.</div>
    <div class="controls">
      <select id="ff"><option value="">Todos (${all.length})</option><option value="falta">Faltan — sin estudio o incompletos (${all.filter(f => f.estado !== 'completo').length})</option><option value="completo">Completos (${all.filter(f => f.estado === 'completo').length})</option></select>
    </div>
    <div class="tablebox"><table>
      <thead><tr><th>Código</th><th>Cliente</th><th>Descripción</th><th>Línea</th><th>Estado</th><th class="num">Costura (min)</th><th></th></tr></thead>
      <tbody>${rows.map(f => `<tr>
        <td class="codecell"><span class="linkish" data-go="${esc(f.codigo)}">${esc(f.codigo)}</span></td>
        <td>${esc(f.cliente)}</td><td class="muted">${esc(f.descripcion)}</td><td>${esc(f.linea)}</td>
        <td>${estadoPill(f.codigo)}</td><td class="num">${f.estado === 'sin' ? '—' : fmt(f.costura)}</td>
        <td><button class="btn sm" data-go="${esc(f.codigo)}">${f.estado === 'completo' ? 'Ver' : 'Registrar'}</button></td></tr>`).join('')}</tbody>
    </table></div>
    <div class="count">${rows.length} de ${all.length} códigos</div>
  </div>`
  const sel = document.getElementById('ff'); sel.value = futFilter; sel.addEventListener('change', e => { futFilter = e.target.value; renderFutura() })
}

/* ---------- DESDE BI-HORARIO ---------- */
// Actualiza tiempos estándar con la producción por hora del Bi-horario.
// Solo se usan "horas limpias" (función mt_desde_bihorario): con unidades, sin tiempo
// muerto, la persona en una sola operación esa hora y sin ajuste de polivalencia.
// La hora real ya incluye pausas y fatiga, así que el tiempo estándar nuevo es
// 60 ÷ unidades por hora (sin valoración ni suplementos aparte).
const BH_MIN_HORAS = 6, BH_MIN_PERS = 2, BH_MIN_TURNOS = 2
const isoDias = n => { const d = new Date(); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const BH = { desde: isoDias(-60), hasta: isoDias(0), q: '', ver: 'accion', crit: 'mediana', datos: null, clave: '' }
const BH_CRIT = { mediana: ['Mediana', 'La mitad de las horas va más rápido y la otra mitad más lento. Recomendado: no lo mueven las horas raras.'], p75: ['Ritmo de los mejores (percentil 75)', 'El ritmo que alcanza el 25 % más rápido de las horas. Sirve para metas más exigentes.'], promedio: ['Promedio', 'El promedio simple de todas las horas.'] }
function filasBH() {
  return (BH.datos || []).filter(d => tipoOf(d.operacion) === 'Costura').map(d => {
    const actuales = tiemposOf(d.codigo).filter(r => r.op === d.operacion)
    const teAct = actuales.reduce((s, r) => s + (+r.min || 0), 0) || null
    const ritmo = +d[BH.crit]
    const teNuevo = ritmo > 0 ? 60 / ritmo : null
    const actH = teAct ? 60 / teAct : null
    const dif = actH && ritmo ? (ritmo - actH) / actH : null
    // Si todas las horas tienen el mismo número, puede que se haya anotado igual para todos y no medido.
    const plano = d.horas >= 4 && +d.p25 === +d.p75
    // Igual a la meta: puede que el supervisor haya anotado la meta y no lo producido.
    const comoMeta = actH && Math.abs(+d.mediana - actH) / actH < 0.02
    const estado = !teAct ? 'sin' : dif >= 0.1 ? 'subir' : dif <= -0.1 ? 'bajar' : 'ok'
    return { ...d, actuales, teAct, actH, ritmo, teNuevo, dif, plano, comoMeta, estado,
      suficiente: d.horas >= BH_MIN_HORAS && d.personas >= BH_MIN_PERS && d.turnos >= BH_MIN_TURNOS, info: codeInfo(d.codigo) }
  })
}
const BH_ESTADO = {
  sin: ['no', 'Sin estudio', 'No tiene tiempo: con esto lo llenas.'],
  subir: ['si', 'Más rápido', 'Producen más de lo que dice el estándar: conviene actualizar.'],
  bajar: ['inc', 'Más lento', 'Producen menos que el estándar. Actualizar bajaría la exigencia: mejor cronometra antes.'],
  ok: ['man', 'Al día', 'El estándar coincide con lo que se produce.'],
}
async function renderDesdeBH() {
  const el = document.getElementById('p-bihorario')
  if (!dbReady) { el.innerHTML = loadingHtml; return }
  const clave = BH.desde + '|' + BH.hasta
  if (BH.clave !== clave) {
    el.innerHTML = '<div class="loading">Calculando la producción por hora del Bi-horario…</div>'
    const { data, error } = await supabase.rpc('mt_desde_bihorario', { p_desde: BH.desde, p_hasta: BH.hasta })
    if (error) { el.innerHTML = '<div class="loading">No se pudo traer el Bi-horario. Revisa la conexión.</div>'; return }
    BH.datos = data; BH.clave = clave
  }
  const todas = filasBH()
  const q = BH.q.trim().toLowerCase()
  const accion = f => f.suficiente && (f.estado === 'sin' || f.estado === 'subir')
  let filas = todas.filter(f => !q || (f.codigo + ' ' + f.operacion + ' ' + (f.info.cliente || '')).toLowerCase().includes(q))
  if (BH.ver === 'accion') filas = filas.filter(accion)
  if (BH.ver === 'suf') filas = filas.filter(f => f.suficiente)
  // Agrupado por cliente; primero los que tienen más para actualizar.
  const grupos = new Map()
  filas.forEach(f => { const k = f.info.cliente || 'Sin cliente'; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(f) })
  const lista = [...grupos.entries()].sort((a, b) => b[1].filter(accion).length - a[1].filter(accion).length || a[0].localeCompare(b[0]))
  const n = k => todas.filter(f => f.suficiente && f.estado === k).length
  el.innerHTML = `
  <div class="section">
    <h2>Tiempos de costura desde el Bi-horario</h2>
    <div class="banner" style="margin:4px 0 10px">Actualizar unas operaciones <b>no completa el código</b>. Si agregas una operación nueva, el código queda <b>incompleto</b> hasta que lo abras (toca el código) y confirmes que tiene todas sus operaciones de costura.</div>
    <div class="hint">Solo operaciones de costura, por cliente. Compara lo que se produce por hora con el estándar de hoy. Cuentan las <b>horas limpias</b> (sin tiempo muerto, la persona en una sola operación y sin ajuste de polivalencia) y se piden al menos ${BH_MIN_HORAS} horas, de ${BH_MIN_PERS} personas, en ${BH_MIN_TURNOS} turnos.</div>
    <div class="grid kpis" style="margin-bottom:12px">
      <div class="kpi bad"><div class="label">Sin estudio</div><div class="value">${n('sin')}</div><div class="sub">llénalos con el Bi-horario</div></div>
      <div class="kpi good"><div class="label">Más rápido que el estándar</div><div class="value">${n('subir')}</div><div class="sub">conviene actualizar</div></div>
      <div class="kpi"><div class="label">Más lento que el estándar</div><div class="value">${n('bajar')}</div><div class="sub">cronometra antes</div></div>
      <div class="kpi"><div class="label">Al día</div><div class="value">${n('ok')}</div><div class="sub">no hay que hacer nada</div></div>
    </div>
    <div class="controls">
      <label class="muted" style="font-size:13px">Desde <input type="date" id="bh-d" value="${BH.desde}"></label>
      <label class="muted" style="font-size:13px">Hasta <input type="date" id="bh-h" value="${BH.hasta}"></label>
      <select id="bh-crit">${Object.entries(BH_CRIT).map(([k, [t]]) => `<option value="${k}" ${k === BH.crit ? 'selected' : ''}>Criterio: ${t}</option>`).join('')}</select>
      <select id="bh-ver"><option value="accion" ${BH.ver === 'accion' ? 'selected' : ''}>Para actualizar (sin estudio o más rápido)</option><option value="suf" ${BH.ver === 'suf' ? 'selected' : ''}>Todas con datos suficientes</option><option value="todos" ${BH.ver === 'todos' ? 'selected' : ''}>Todas</option></select>
      <input class="search" type="search" id="bh-q" placeholder="Buscar cliente o código…" value="${esc(BH.q)}">
    </div>
    <div class="hint" style="margin-top:-4px">${esc(BH_CRIT[BH.crit][1])}</div>
  </div>
  ${lista.map(([cliente, fs]) => `
  <div class="section mt-bh" style="padding:12px 14px">
    <h2 style="font-size:15px">${esc(cliente)} <span class="muted" style="font-weight:500;font-size:12.5px">· ${fs.filter(accion).length} para actualizar</span></h2>
    <div class="tablebox"><table>
      <thead><tr><th>Operación</th><th class="num">Horas</th><th class="num">Estándar → Real</th><th></th></tr></thead>
      <tbody>${fs.sort((a, b) => a.codigo.localeCompare(b.codigo) || a.operacion.localeCompare(b.operacion)).map(f => {
        const i = todas.indexOf(f), [cls, txt, ayuda] = BH_ESTADO[f.estado]
        const avisos = [f.plano ? 'todas las horas iguales' : '', f.comoMeta ? 'igual a la meta (¿anotaron la meta?)' : ''].filter(Boolean)
        return `<tr>
        <td><b>${esc(f.operacion)}</b><div class="mono muted" style="font-size:11px"><span class="linkish" data-go="${esc(f.codigo)}" title="Abrir el código para revisar todas sus operaciones">${esc(f.codigo)}</span></div><div style="font-size:10.5px;margin-top:2px">Código: ${estadoPill(f.codigo)}</div></td>
        <td class="num" title="${f.personas} personas · ${f.turnos} turnos">${f.horas}<div class="muted" style="font-size:11px">${f.personas}p · ${f.turnos}t</div></td>
        <td class="num nowrap">${f.actH ? fmt(f.actH, 1) : '—'} → <b>${fmt(f.ritmo, 1)}/h</b>${f.dif != null ? ` <span class="${f.dif > 0 ? 'ef-ok' : 'ef-bajo'}" style="font-size:11.5px">${f.dif > 0 ? '+' : ''}${fmt(f.dif * 100, 0)}%</span>` : ''}
          <div class="muted" style="font-size:11px">${f.teAct ? fmt(f.teAct) + ' → ' : ''}${f.teNuevo ? fmt(f.teNuevo) + ' min' : ''}</div></td>
        <td><span class="pill ${cls}" title="${esc(ayuda)}">${txt}</span>${avisos.length ? `<div style="font-size:11px;color:var(--warn)">⚠ ${esc(avisos.join(' · '))}</div>` : ''}
          <div style="margin-top:4px">${!f.suficiente ? `<span class="pill inc" title="Mínimo ${BH_MIN_HORAS} horas, ${BH_MIN_PERS} personas y ${BH_MIN_TURNOS} turnos">Pocos datos</span>`
          : f.estado === 'ok' ? '' : `<button class="btn sm ${accion(f) ? 'go' : 'ghost'} admin-only" data-act="bhActualizar" data-arg="${i}">Actualizar</button>`}</div></td></tr>` }).join('')}</tbody>
    </table></div>
  </div>`).join('') || `<div class="empty">${(BH.datos || []).length ? 'Nada con este filtro.' : 'No hay datos del Bi-horario en estas fechas.'}</div>`}`
  const recargar = () => { BH.desde = document.getElementById('bh-d').value || BH.desde; BH.hasta = document.getElementById('bh-h').value || BH.hasta; renderDesdeBH() }
  document.getElementById('bh-d').addEventListener('change', recargar)
  document.getElementById('bh-h').addEventListener('change', recargar)
  document.getElementById('bh-crit').addEventListener('change', e => { BH.crit = e.target.value; renderDesdeBH() })
  document.getElementById('bh-ver').addEventListener('change', e => { BH.ver = e.target.value; renderDesdeBH() })
  const qi = document.getElementById('bh-q')
  qi.addEventListener('input', e => { BH.q = e.target.value; clearTimeout(qi._t); qi._t = setTimeout(() => { renderDesdeBH().then(() => { const n = document.getElementById('bh-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length) }) }, 250) })
}
function bhActualizar(i) {
  const f = filasBH()[+i]; if (!f || !f.teNuevo) return
  const fecha = d => d ? fmtDateShort(d + 'T12:00:00') : ''
  const fuente = `Bi-horario: ${BH_CRIT[BH.crit][0].toLowerCase()} de ${f.horas} h limpias, ${f.personas} personas, ${fecha(f.primera)} a ${fecha(f.ultima)}`
  openModal(`<h3>Actualizar tiempo</h3>
    <div class="hint" style="color:var(--muted);font-size:13px;margin-bottom:10px"><b class="mono">${esc(f.codigo)}</b> · ${esc(f.info.cliente || '')}<br><b>${esc(f.operacion)}</b></div>
    ${[['Tiempo actual', f.teAct ? `${fmt(f.teAct)} min · ${fmt(60 / f.teAct, 1)}/h` : 'Sin estudio'],
       [`Bi-horario (${esc(BH_CRIT[BH.crit][0].toLowerCase())})`, `${fmt(f.ritmo, 1)}/h`],
       ['<b>Tiempo nuevo</b>', `<b>${fmt(f.teNuevo)} min · ${fmt(f.ritmo, 1)}/h</b>`]]
      .map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13.5px"><span class="muted">${k}</span><span class="mono">${v}</span></div>`).join('')}
    <div class="hint" style="color:var(--muted);font-size:12.5px;margin-top:8px">Datos: <b>${f.horas} horas limpias</b> de ${f.personas} personas en ${f.turnos} turnos, del ${fecha(f.primera)} al ${fecha(f.ultima)}.</div>
    ${f.estado === 'bajar' ? '<div class="banner" style="margin-top:8px">⚠ Producen <b>menos</b> que el estándar: actualizar baja la exigencia y deja como normal el ritmo de hoy. Lo recomendable es cronometrar antes.</div>' : ''}
    ${f.comoMeta ? '<div class="banner" style="margin-top:8px">⚠ Lo anotado es igual a la meta: puede que el supervisor haya escrito la meta y no lo producido.</div>' : ''}
    ${f.plano ? '<div class="banner" style="margin-top:8px">⚠ Todas las horas tienen el mismo número. Revisa que el supervisor lo haya medido hora por hora antes de actualizar.</div>' : ''}
    ${f.actuales.length > 1 ? `<div class="hint" style="color:var(--muted);font-size:12.5px;margin-top:8px">Esta operación tiene ${f.actuales.length} partes en el estudio: se ajustan todas en la misma proporción.</div>` : ''}
    ${!f.actuales.length ? `<div class="hint" style="color:var(--muted);font-size:12.5px;margin-top:8px">Es una operación nueva en este código. El código queda <b>incompleto</b> hasta que entres y confirmes que tiene todas sus operaciones de costura.</div>` : ''}
    <div class="hint" style="color:var(--muted);font-size:12.5px;margin-top:8px">Cambia la meta por hora de esta operación en los turnos nuevos del Bi-horario. Las tomas de cronómetro de esta operación se reemplazan; queda anotado que el tiempo salió del Bi-horario.</div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn go" id="bh-ok">Actualizar</button></div>`)
  document.getElementById('bh-ok').addEventListener('click', async () => {
    const te = +f.teNuevo.toFixed(3), ts = new Date().toISOString()
    const base = { obs: te, val: 100, supl: 0, muestras: [], ts, fuente }
    let rows
    if (f.actuales.length) {
      // Se reparte el tiempo nuevo entre las partes de la operación en la misma proporción.
      const k = f.teAct ? te / f.teAct : 1
      rows = tiemposOf(f.codigo).map(r => r.op === f.operacion ? { ...r, ...base, min: +((+r.min || te / f.actuales.length) * k).toFixed(3), obs: +((+r.min || te / f.actuales.length) * k).toFixed(3) } : { ...r })
    } else rows = [...tiemposOf(f.codigo).map(r => ({ ...r })), { op: f.operacion, min: te, ...base }]
    if (await saveTiempos(f.codigo, rows, { sinRepintar: true })) {
      // Operación nueva en el código: puede que le falten otras de costura, así que queda por confirmar.
      if (!f.actuales.length) await marcarPorConfirmar(f.codigo, true)
      closeModal(); toast(`${f.operacion} de ${f.codigo}: ${fmt(te)} min (${fmt(60 / te, 1)}/h).${!f.actuales.length ? ' El código queda incompleto hasta que confirmes sus operaciones.' : ''}`)
      // Solo se marca esa fila: la lista no se reordena ni salta, para seguir operación por operación.
      const tr = document.querySelector(`[data-act="bhActualizar"][data-arg="${i}"]`)?.closest('tr')
      if (tr) {
        tr.style.background = 'var(--good-bg)'
        const celdas = tr.querySelectorAll('td')
        celdas[2].innerHTML = `<b>${fmt(60 / te, 1)}/h</b><div class="muted" style="font-size:11px">${fmt(te)} min</div>`
        celdas[3].innerHTML = `<span class="pill si">✓ Actualizado</span>${!f.actuales.length ? '<div class="muted" style="font-size:11px">Código por confirmar</div>' : ''}`
      }
    }
  })
}

/* ---------- CÓDIGOS ---------- */
function renderCodigos() {
  const el = document.getElementById('p-codigos')
  if (!dbReady) { el.innerHTML = loadingHtml; return }
  if (curCode) { renderEditor(el); return }
  const clientes = [...new Set(codigos().map(c => c.cliente))].sort()
  el.innerHTML = `
  <div class="controls">
    <input class="search" type="search" id="cq" placeholder="Buscar código, cliente o descripción…" value="${esc(codeFilter.q)}">
    <select id="ccli"><option value="">Todos los clientes</option>${clientes.map(c => `<option ${c === codeFilter.cli ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select id="cest"><option value="">Todos</option><option value="completo" ${codeFilter.estado === 'completo' ? 'selected' : ''}>Tiempos completos</option><option value="falta" ${codeFilter.estado === 'falta' ? 'selected' : ''}>Faltan (sin estudio o incompletos)</option></select>
    <button class="btn go right admin-only" id="addCodeBtn">+ Código</button>
  </div>
  <div class="tablebox"><table>
    <thead><tr><th>Código</th><th>Cliente</th><th>Descripción</th><th>Línea</th><th class="num">Costura (min)</th><th>Estado</th><th class="num">Act.</th><th></th></tr></thead>
    <tbody id="cod-tbody"></tbody>
  </table></div>
  <div class="count" id="cod-count"></div>`
  fillCodigos()
  document.getElementById('cq').addEventListener('input', e => { codeFilter.q = e.target.value; fillCodigos() })
  document.getElementById('ccli').addEventListener('change', e => { codeFilter.cli = e.target.value; fillCodigos() })
  document.getElementById('cest').addEventListener('change', e => { codeFilter.estado = e.target.value; fillCodigos() })
  document.getElementById('addCodeBtn').addEventListener('click', () => editCodigo(null))
}
function fillCodigos() {
  const tb = document.getElementById('cod-tbody'); if (!tb) return
  let rows = codigos()
  if (codeFilter.cli) rows = rows.filter(c => c.cliente === codeFilter.cli)
  if (codeFilter.estado === 'completo') rows = rows.filter(c => statusCode(c.codigo) === 'completo')
  if (codeFilter.estado === 'falta') rows = rows.filter(c => statusCode(c.codigo) !== 'completo')
  if (codeFilter.q) { const q = codeFilter.q.toLowerCase(); rows = rows.filter(c => (c.codigo + ' ' + c.cliente + ' ' + (c.descripcion || '')).toLowerCase().includes(q)) }
  tb.innerHTML = rows.map(c => {
    const ht = hasTiempos(c.codigo); return `<tr>
      <td class="codecell"><span class="linkish" data-go="${esc(c.codigo)}">${esc(c.codigo)}</span></td>
      <td>${esc(c.cliente)}</td><td class="muted">${esc(c.descripcion)}</td><td>${esc(c.linea)}</td>
      <td class="num">${ht ? fmt(costuraTotal(c.codigo)) : '—'}</td>
      <td>${estadoPill(c.codigo)}</td>
      <td class="num muted" style="font-size:11.5px;white-space:nowrap">${ultAct(c.codigo) || '—'}</td>
      <td class="nowrap"><button class="btn sm" data-go="${esc(c.codigo)}">Tiempos</button> <button class="btn sm ghost admin-only" data-act="editCodigo" data-arg="${esc(c.codigo)}">Editar</button></td>
    </tr>`
  }).join('') || `<tr><td colspan="8" class="empty">Sin resultados</td></tr>`
  const cc = document.getElementById('cod-count'); if (cc) cc.textContent = `${rows.length} de ${codigos().length} códigos`
}
function editCodigo(code) {
  const c = code ? codigoByCode(code) : { codigo: '', cliente: '', descripcion: '', linea: '' }
  const isNew = !code
  openModal(`<h3>${isNew ? 'Nuevo código' : 'Editar código'}</h3>
    <div class="field"><label>Código Dynamics</label><input id="f-cod" ${isNew ? '' : 'disabled'} value="${esc(c.codigo)}" placeholder="SS220T094094110XXX01"></div>
    <div class="field"><label>Cliente</label><input id="f-cli" value="${esc(c.cliente)}"></div>
    <div class="field"><label>Descripción</label><input id="f-desc" value="${esc(c.descripcion)}"></div>
    <div class="field"><label>Línea</label><select id="f-lin">${['', 'CIR', '4P', 'UP', 'PS', 'CRRO', 'CONT', 'OT', 'VAL'].map(l => `<option ${l === c.linea ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn go" id="f-save">Guardar</button></div>`)
  document.getElementById('f-save').addEventListener('click', async () => {
    const codigo = (document.getElementById('f-cod').value || '').trim().toUpperCase().replace(/\s+/g, '')
    if (!codigo) { toast('Escribe el código.'); return }
    if (!/^[A-Z0-9._~:@+-]+$/.test(codigo)) { toast('El código tiene caracteres no válidos.'); return }
    if (isNew && codigoByCode(codigo)) { toast('Ese código ya existe.'); return }
    const obj = { codigo, cliente: document.getElementById('f-cli').value.trim(), descripcion: document.getElementById('f-desc').value.trim(), linea: document.getElementById('f-lin').value }
    if (await saveCodigo(obj)) { closeModal(); toast('Código guardado.') }
  })
}

/* ---------- EDITOR de tiempos por código (dentro de Códigos) ---------- */
function goCode(code) { curCode = code; setTab('codigos') }
function backToCodes() { curCode = null; renderCodigos() }
function renderEditor(el) {
  const c = codeInfo(curCode)
  const rows = tiemposOf(curCode); const ht = rows.length > 0
  el.innerHTML = `
  <div class="controls" style="justify-content:space-between"><button class="btn ghost sm" data-act="backToCodes">← Todos los códigos</button><button class="btn go sm" data-act="imgCostura" title="Generar imagen de las operaciones de costura para compartir">📷 Imagen de costura</button></div>
  <div class="section">
    <div class="editor-head">
      <div class="meta"><div class="code">${esc(c.codigo)}</div><div class="desc">${esc(c.cliente)} · ${esc(c.descripcion || '')} · Línea ${esc(c.linea || '—')}${ultAct(curCode) ? ` · <b>Act. ${ultAct(curCode)}</b>` : ''}</div></div>
      <div class="tot"><div class="v mono">${fmt(costuraTotal(curCode))}</div><div class="l">min costura · ${nOpsCostura(curCode)} op</div></div>
    </div>
    ${D.porConfirmar && D.porConfirmar.has(curCode) ? (() => {
      // Operaciones de costura que aparecen en el Bi-horario para este código y aún no están en el estudio.
      const enEstudio = new Set(rows.map(r => r.op))
      const faltan = (BH.datos || []).filter(d => d.codigo === curCode && tipoOf(d.operacion) === 'Costura' && !enEstudio.has(d.operacion))
      return `<div class="banner">Este código tiene operaciones que vinieron del <b>Bi-horario</b> y queda <b>incompleto</b> hasta que confirmes que están todas las operaciones de costura.
        ${faltan.length ? `<div style="margin-top:6px">En el Bi-horario también aparecen: ${faltan.map(d => `<b>${esc(d.operacion)}</b> (${fmt(+d.mediana, 1)}/h)`).join(', ')}.</div>` : ''}
        <div class="controls admin-only" style="margin:8px 0 0"><button class="btn sm go" data-act="confirmarOps" data-arg="${esc(curCode)}">✓ Ya están todas las operaciones</button></div></div>`
    })() : ''}
    ${!ht ? `<div class="banner">Este código no tiene tiempos. Puedes ingresarlos desde cero abajo, u <b>homologar</b> los de otro código con el mismo saco.</div>
      <div class="controls admin-only"><button class="btn go" data-act="openHomologar">Homologar de otro código</button></div>` : ''}
    <div class="tablebox"><table>
      <thead><tr><th style="width:44px">#</th><th>Operación</th><th>Tipo</th><th class="num">Tiempo (min)</th><th class="num">Und/hora</th><th></th></tr></thead>
      <tbody>${rows.map((r, i) => {
    const t = tipoOf(r.op); return `<tr>
        <td class="num muted">${i + 1}</td><td>${esc(r.op)}${r.fuente ? `<div class="muted" style="font-size:11px" title="${esc(r.fuente)}">Desde Bi-horario${r.ts ? ' · ' + fmtDateShort(r.ts) : ''}</div>` : ''}</td>
        <td>${t === 'Costura' ? '<span class="pill cos">Costura</span>' : (t === 'Manual' ? '<span class="pill man">Manual</span>' : '<span class="pill no">?</span>')}</td>
        <td class="num"><input type="number" step="0.01" min="0" value="${r.min == null ? '' : r.min}" data-i="${i}" class="tmin" ${ROLE !== 'admin' ? 'disabled' : ''}></td>
        <td class="num">${uph(r.min) != null ? fmt(uph(r.min), 1) : '—'}</td>
        <td class="nowrap"><button class="btn sm go admin-only" data-act="openCrono" data-arg="${i}" title="Tomar tiempo con cronómetro">⏱ Tomar</button> ${r.muestras && r.muestras.length ? `<button class="btn sm ghost" data-act="verRegistro" data-arg="${i}" title="Ver muestras tomadas">👁 ${r.muestras.length}</button> ` : ''}<button class="btn sm danger admin-only" data-act="delRow" data-arg="${i}">Quitar</button></td>
      </tr>`
  }).join('')}
      ${rows.length ? '' : `<tr><td colspan="6" class="empty">Sin operaciones todavía.</td></tr>`}</tbody>
    </table></div>
    <div class="addrow admin-only">
      <div class="combo" id="opcombo">
        <input type="text" id="newop" autocomplete="off" placeholder="Escribe la operación (costura primero)…">
        <div class="combo-menu" id="opmenu" hidden></div>
      </div>
      <input type="number" id="newmin" step="0.01" min="0" placeholder="min">
      <button class="btn go" data-act="addRow">Agregar</button>
      <button class="btn right" data-act="openHomologar">Homologar de otro código</button>
    </div>
    <div class="count">Los tiempos se guardan en la nube al salir de cada celda. El total y el análisis usan solo las operaciones de costura.</div>
  </div>`
  el.querySelectorAll('input.tmin').forEach(inp => inp.addEventListener('change', async e => {
    const i = +e.target.dataset.i; const v = e.target.value === '' ? null : parseFloat(e.target.value)
    const nr = tiemposOf(curCode).map((r, idx) => idx === i ? { op: r.op, min: v } : { ...r })
    if (await saveTiempos(curCode, nr)) toast('Tiempo guardado.')
  }))
  setupCombo()
}
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
function filterOps(q) {
  const n = norm(q); const ops = opList(); const m = o => !n || norm(o.nombre).includes(n)
  return { cos: ops.filter(o => o.tipo === 'Costura' && m(o)), man: ops.filter(o => o.tipo === 'Manual' && m(o)) }
}
function renderMenu(q) {
  const m = document.getElementById('opmenu'); if (!m) return; const { cos, man } = filterOps(q)
  let h = ''; if (cos.length) h += '<div class="gh">Costura</div>' + cos.map(o => `<div class="it cos" data-op="${esc(o.nombre)}">${esc(o.nombre)}<span class="tag">Costura</span></div>`).join('')
  if (man.length) h += '<div class="gh">Manual</div>' + man.map(o => `<div class="it" data-op="${esc(o.nombre)}">${esc(o.nombre)}<span class="tag">Manual</span></div>`).join('')
  if (!cos.length && !man.length) h = '<div class="gh">Sin coincidencias</div>'
  m.innerHTML = h; m.hidden = false
  m.querySelectorAll('.it').forEach(it => it.addEventListener('mousedown', e => { e.preventDefault(); document.getElementById('newop').value = it.dataset.op; m.hidden = true; document.getElementById('newmin').focus() }))
}
function setupCombo() {
  const inp = document.getElementById('newop'); if (!inp) return
  inp.addEventListener('focus', () => renderMenu(inp.value)); inp.addEventListener('input', () => renderMenu(inp.value))
  inp.addEventListener('blur', () => setTimeout(() => { const m = document.getElementById('opmenu'); if (m) m.hidden = true }, 150))
}
async function addRow() {
  const typed = (document.getElementById('newop').value || '').trim(); const minv = document.getElementById('newmin').value
  if (!typed) { toast('Escribe la operación.'); return }
  const ops = opList(); let op = ops.find(o => o.nombre.toLowerCase() === typed.toLowerCase())
  if (!op) { const { cos, man } = filterOps(typed); op = cos[0] || man[0] }
  if (!op) { toast('No encontré esa operación. Si es nueva, créala en la pestaña Operaciones.'); return }
  const nr = [...tiemposOf(curCode), { op: op.nombre, min: minv === '' ? null : parseFloat(minv) }]
  if (await saveTiempos(curCode, nr)) { toast('Operación agregada: ' + op.nombre + '.') }
}
function delRow(i) {
  i = +i
  const r = tiemposOf(curCode)[i]; if (!r) return
  const tiene = (r.muestras && r.muestras.length) || typeof r.min === 'number'
  openModal(`<h3>Quitar operación</h3>
    <div class="hint" style="color:var(--muted);font-size:13px;margin:4px 0 2px">¿Seguro que quieres quitar <b>${esc(r.op)}</b> de <b>${esc(curCode)}</b>?${tiene ? ' Se pierde su tiempo' + ((r.muestras && r.muestras.length) ? ' y sus ' + r.muestras.length + ' muestras' : '') + '.' : ''}</div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn danger" data-act="doDelRow" data-arg="${i}">Sí, quitar</button></div>`)
}
async function doDelRow(i) {
  i = +i
  const nr = tiemposOf(curCode).filter((_, idx) => idx !== i)
  if (await saveTiempos(curCode, nr)) { closeModal(); toast('Operación quitada.') }
}
function verRegistro(i) {
  i = +i
  const r = tiemposOf(curCode)[i]; if (!r || !r.muestras || !r.muestras.length) { toast('Esta operación no tiene registro de muestras.'); return }
  const rows = r.muestras.map((s, k) => `<tr><td>M${k + 1}</td><td class="num">${swFmt(s * 1000)}</td><td class="num">${fmt(s / 60)}</td></tr>`).join('')
  openModal(`<h3>Registro de la toma</h3>
    <div class="hint" style="color:var(--muted);font-size:12.5px;margin-bottom:10px"><b>${esc(r.op)}</b> · ${esc(curCode)}${r.ts ? ` · ${fmtDateShort(r.ts)}` : ''}</div>
    <div class="tablebox" style="margin-bottom:12px"><table style="min-width:0"><thead><tr><th>Muestra</th><th class="num">mm:ss</th><th class="num">min</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="sw-calc">
      <div class="row"><label>Muestras tomadas</label><span class="mono">${r.muestras.length}</span></div>
      <div class="row"><label>Promedio observado (TO)</label><span class="mono">${fmt(r.obs)} min</span></div>
      <div class="row"><label>Valoración del ritmo</label><span class="mono">${r.val != null ? r.val + '%' : '—'}</span></div>
      <div class="row"><label>Suplementos</label><span class="mono">${r.supl != null ? r.supl + '%' : '—'}</span></div>
      <div class="row"><label>Producción por hora</label><span class="mono">${uph(r.min) != null ? fmt(uph(r.min), 1) + ' und/hora' : '—'}</span></div>
      <div class="sw-te"><span style="font-size:12.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Tiempo estándar</span><span class="v">${fmt(r.min)} min</span></div>
    </div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cerrar</button>${ROLE === 'admin' ? `<button class="btn go" data-act="verRegToCrono" data-arg="${i}">Volver a tomar</button>` : ''}</div>`)
}
function verRegToCrono(i) { closeModal(); openCrono(i) }

/* ---------- cronómetro ---------- */
function swFmt(ms) { const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), d = Math.floor((ms % 1000) / 100); return m + ':' + String(s).padStart(2, '0') + '.' + d }
function swElapsed() { return swAcc + (swRunning ? (performance.now() - swBase) : 0) }
function openCrono(i) {
  i = +i
  const row = tiemposOf(curCode)[i]; if (!row) return
  swRowIndex = i; swOp = row.op; swSamples = []; swAcc = 0; swRunning = false; swMax = 5
  swHadPrev = !!(row.muestras && row.muestras.length); swConfirmed = false
  const defSupl = (typeof row.supl === 'number') ? row.supl : 19
  const defVal = (typeof row.val === 'number') ? row.val : 100
  openModal(`<h3>Cronómetro</h3>
    <div class="hint" style="color:var(--muted);font-size:12.5px;margin-bottom:6px"><b>${esc(swOp)}</b> · ${esc(curCode)}</div>
    <div class="sw-cfg">Muestras a tomar: <input type="number" id="sw-max" min="1" max="20" value="5"> <span>· toca Vuelta al terminar cada ciclo</span></div>
    <div class="sw-time" id="sw-time">0:00.0</div>
    <div class="sw-ctrls">
      <button class="btn go" id="sw-run" data-act="swRun">Iniciar</button>
      <button class="btn lap" id="sw-lap" data-act="swLap">Vuelta</button>
      <button class="btn ghost" data-act="swReset">Reiniciar</button>
    </div>
    <div class="sw-samples" id="sw-samples"></div>
    <div class="sw-calc">
      <div class="row"><label>Promedio observado (TO)</label><span class="mono" id="sw-to">—</span></div>
      <div class="row"><label>Valoración del ritmo (%)</label><input type="number" id="sw-val" value="${defVal}" min="1" step="1"></div>
      <div class="row"><label>Suplementos (%)</label><input type="number" id="sw-supl" value="${defSupl}" min="0" step="1"></div>
      <div style="font-size:11px;color:var(--muted);margin:-4px 0 8px">Base costura 19% (9% OIT + 10% del puesto). Súbelo si la operación es más pesada.</div>
      <div class="sw-te"><span style="font-size:12.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Tiempo estándar</span><span class="v" id="sw-te">—</span></div>
      <div style="text-align:right;font-size:12.5px;color:var(--muted);margin-top:4px" id="sw-uph"></div>
    </div>
    <div class="banner" id="sw-confirm" hidden style="margin-top:10px"></div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn go" id="sw-save" data-act="swSave">Guardar tiempo</button></div>`, true)
  document.getElementById('sw-max').addEventListener('change', e => { swMax = Math.max(1, Math.min(20, +e.target.value || 5)) })
  ;['sw-val', 'sw-supl'].forEach(id => document.getElementById(id).addEventListener('input', swCalc))
  swRenderSamples(); swCalc()
}
function swRun() {
  if (swRunning) { swAcc = swElapsed(); swRunning = false; clearInterval(swTimer); document.getElementById('sw-run').textContent = 'Continuar'; document.getElementById('sw-time').classList.remove('run') }
  else {
    swBase = performance.now(); swRunning = true; document.getElementById('sw-run').textContent = 'Pausar'; document.getElementById('sw-time').classList.add('run')
    clearInterval(swTimer); swTimer = setInterval(() => { const t = document.getElementById('sw-time'); if (t) t.textContent = swFmt(swElapsed()) }, 100)
  }
}
function swLap() {
  const e = swElapsed(); if (e < 300) return
  swSamples.push(e / 1000) // segundos
  swAcc = 0; swBase = performance.now() // snapback: reinicia el ciclo
  swRenderSamples(); swCalc()
  const t = document.getElementById('sw-time'); if (t) t.textContent = swFmt(swElapsed())
  if (swSamples.length >= swMax) { swRunning = false; clearInterval(swTimer); const r = document.getElementById('sw-run'); if (r) { r.textContent = 'Iniciar' } const tt = document.getElementById('sw-time'); if (tt) tt.classList.remove('run'); toast('Listas las ' + swMax + ' muestras.') }
}
function swReset() { clearInterval(swTimer); swRunning = false; swAcc = 0; swSamples = []; const t = document.getElementById('sw-time'); if (t) { t.textContent = '0:00.0'; t.classList.remove('run') } const r = document.getElementById('sw-run'); if (r) r.textContent = 'Iniciar'; swRenderSamples(); swCalc() }
function swRenderSamples() {
  const box = document.getElementById('sw-samples'); if (!box) return
  box.innerHTML = swSamples.length ? swSamples.map((s, i) => `<span class="sw-chip">M${i + 1} <b>${swFmt(s * 1000)}</b></span>`).join('') : '<span class="muted" style="font-size:12.5px">Sin muestras aún</span>'
}
function swTOmin() { if (!swSamples.length) return null; const avgSec = swSamples.reduce((a, b) => a + b, 0) / swSamples.length; return avgSec / 60 }
function swCalc() {
  const to = swTOmin(); const toEl = document.getElementById('sw-to'), teEl = document.getElementById('sw-te')
  if (!toEl) return
  if (to == null) { toEl.textContent = '—'; teEl.textContent = '—'; return }
  const val = parseFloat(document.getElementById('sw-val').value) || 0
  const supl = parseFloat(document.getElementById('sw-supl').value) || 0
  const te = to * (val / 100) * (1 + supl / 100)
  toEl.textContent = fmt(to) + ' min'; teEl.textContent = fmt(te) + ' min'
  const u = document.getElementById('sw-uph'); if (u) u.textContent = te > 0 ? ('≈ ' + fmt(60 / te, 1) + ' und/hora') : ''
}
function swSaveConfirm() { swConfirmed = true; swSave() }
function swHideConfirm() { document.getElementById('sw-confirm').hidden = true }
async function swSave() {
  const to = swTOmin(); if (to == null) { toast('Toma al menos una muestra.'); return }
  const prev = tiemposOf(curCode)[swRowIndex]
  if (swHadPrev && !swConfirmed && prev && prev.muestras && prev.muestras.length) {
    const c = document.getElementById('sw-confirm')
    c.innerHTML = `⚠ Vas a reemplazar la toma anterior de <b>${esc(swOp)}</b> (${prev.muestras.length} muestras · ${fmt(prev.min)} min). La anterior se pierde.
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm ghost" data-act="swHideConfirm">Seguir tomando</button><button class="btn sm danger" data-act="swSaveConfirm">Sí, reemplazar</button></div>`
    c.hidden = false; c.scrollIntoView({ block: 'nearest' }); return
  }
  const val = parseFloat(document.getElementById('sw-val').value) || 100
  const supl = parseFloat(document.getElementById('sw-supl').value) || 0
  const te = +(to * (val / 100) * (1 + supl / 100)).toFixed(3)
  const rows = tiemposOf(curCode).map((r, idx) => idx === swRowIndex
    ? { op: r.op, min: te, obs: +to.toFixed(3), val, supl, muestras: swSamples.map(s => +s.toFixed(2)), ts: new Date().toISOString() }
    : { ...r })
  if (await saveTiempos(curCode, rows)) { closeModal(); toast('Tiempo estándar guardado: ' + fmt(te) + ' min.') }
}

/* ---------- homologar ---------- */
function openHomologar() {
  openModal(`<h3>Homologar tiempos a ${esc(curCode)}</h3>
    <div class="htabs"><button class="htab active" id="ht-full">Saco completo</button><button class="htab" id="ht-one">Operación individual</button></div>
    <div id="hbody"></div>`, true)
  document.getElementById('ht-full').addEventListener('click', e => { setHtab(e.target); hFull() })
  document.getElementById('ht-one').addEventListener('click', e => { setHtab(e.target); hOne() })
  hFull()
}
function setHtab(btn) { document.querySelectorAll('.htab').forEach(x => x.classList.toggle('active', x === btn)) }
function hFull() {
  const src = codigos().filter(c => c.codigo !== curCode && hasTiempos(c.codigo))
  document.getElementById('hbody').innerHTML = `
    <div class="hint" style="color:var(--muted);font-size:12.5px">Copia TODAS las operaciones de otro código a <b>${esc(curCode)}</b>. Queda una copia independiente.</div>
    <input class="search" style="width:100%;margin-top:10px" type="search" id="h-q" placeholder="Buscar código o cliente…">
    <div class="hlist" id="h-res"></div>`
  const draw = q => {
    const r = src.filter(c => !q || (c.codigo + ' ' + c.cliente).toLowerCase().includes(q.toLowerCase())).slice(0, 150)
    document.getElementById('h-res').innerHTML = `<table><tbody>
      ${r.length ? r.map(c => `<tr><td class="codecell">${esc(c.codigo)}</td><td class="muted" style="font-size:12px">${esc(c.cliente)}</td><td class="num">${fmt(costuraTotal(c.codigo))}</td><td><button class="btn sm go" data-act="doHomologarFull" data-arg="${esc(c.codigo)}">Copiar</button></td></tr>`).join('') : `<tr><td class="empty">Sin resultados</td></tr>`}
    </tbody></table>`
  }
  draw(''); document.getElementById('h-q').addEventListener('input', e => draw(e.target.value))
}
async function doHomologarFull(srcCode) {
  const nr = tiemposOf(srcCode).map(r => ({ op: r.op, min: r.min }))
  if (await saveTiempos(curCode, nr)) { closeModal(); toast('Saco completo homologado de ' + srcCode + '.') }
}
function hOne() {
  const withT = codigos().filter(c => c.codigo !== curCode && hasTiempos(c.codigo))
  const clientes = [...new Set(withT.map(c => c.cliente))].sort()
  document.getElementById('hbody').innerHTML = `
    <div class="hint" style="color:var(--muted);font-size:12.5px">Copia UNA operación de otro código. Elige cliente, código y operación. Puedes agregar varias seguidas.</div>
    <div class="field" style="margin-top:10px"><label>Cliente</label><select id="ho-cli"><option value="">Elige cliente…</option>${clientes.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
    <div class="field"><label>Código (con tiempos)</label><select id="ho-cod" disabled><option value="">Elige código…</option></select></div>
    <div class="hlist" id="ho-ops"><div class="empty">Elige un cliente y un código.</div></div>`
  const cli = document.getElementById('ho-cli'), cod = document.getElementById('ho-cod'), box = document.getElementById('ho-ops')
  cli.addEventListener('change', () => {
    const list = withT.filter(c => c.cliente === cli.value)
    cod.innerHTML = `<option value="">Elige código…</option>` + list.map(c => `<option>${esc(c.codigo)}</option>`).join(''); cod.disabled = !cli.value
    box.innerHTML = `<div class="empty">Elige un código.</div>`
  })
  cod.addEventListener('change', () => {
    if (!cod.value) { box.innerHTML = `<div class="empty">Elige un código.</div>`; return } const rows = tiemposOf(cod.value)
    box.innerHTML = `<table><thead><tr><th>Operación</th><th>Tipo</th><th class="num">Min</th><th></th></tr></thead><tbody>
      ${rows.map((r, i) => { const t = tipoOf(r.op); return `<tr><td>${esc(r.op)}</td><td>${t === 'Costura' ? '<span class="pill cos">Costura</span>' : '<span class="pill man">Manual</span>'}</td><td class="num">${fmt(r.min)}</td><td><button class="btn sm go" data-act="addOneOp" data-arg="${esc(cod.value)}" data-arg2="${i}">Agregar</button></td></tr>` }).join('')}
    </tbody></table>`
  })
}
async function addOneOp(srcCode, i) {
  const r = tiemposOf(srcCode)[+i]; if (!r) return
  const nr = [...tiemposOf(curCode), { op: r.op, min: r.min }]
  if (await saveTiempos(curCode, nr)) { toast('Agregada: ' + r.op + '.') }
}

/* ---------- OPERACIONES ---------- */
function renderOperaciones() {
  const el = document.getElementById('p-operaciones')
  if (!dbReady) { el.innerHTML = loadingHtml; return }
  const ops = opList(); const fams = [...new Set(ops.map(o => o.familia))]
  el.innerHTML = `
  <div class="controls">
    <input class="search" type="search" id="oq" placeholder="Buscar operación…" value="${esc(opFilter.q)}">
    <select id="ofam"><option value="">Todas las familias</option>${fams.map(f => `<option ${f === opFilter.fam ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
    <select id="otipo"><option value="">Costura y manual</option><option ${opFilter.tipo === 'Costura' ? 'selected' : ''}>Costura</option><option ${opFilter.tipo === 'Manual' ? 'selected' : ''}>Manual</option></select>
    <button class="btn go right admin-only" id="addOpBtn">+ Operación</button>
  </div>
  <div class="tablebox"><table>
    <thead><tr><th style="width:44px">#</th><th>Familia</th><th>Operación</th><th>Tipo</th><th></th></tr></thead>
    <tbody id="op-tbody"></tbody>
  </table></div>
  <div class="count" id="op-count"></div>`
  fillOps()
  document.getElementById('oq').addEventListener('input', e => { opFilter.q = e.target.value; fillOps() })
  document.getElementById('ofam').addEventListener('change', e => { opFilter.fam = e.target.value; fillOps() })
  document.getElementById('otipo').addEventListener('change', e => { opFilter.tipo = e.target.value; fillOps() })
  document.getElementById('addOpBtn').addEventListener('click', () => editOp(null))
}
// Orden de familias como en el artefacto original.
const FAMILIAS = ['Corte', 'Perforación', 'Preparación', 'Pegue', 'Cierre y amarre', 'Unión / costura', 'Doblado', 'Marcado', 'Estampado', 'Etiqueta y liner', 'Revisión y prensa', 'Acabado', 'Traslado y montaje', 'Otras']
function famRank(f) { const i = FAMILIAS.indexOf(f); return i < 0 ? FAMILIAS.length : i }
function fillOps() {
  const tb = document.getElementById('op-tbody'); if (!tb) return
  const ops = opList(); let rows = ops.slice().sort((a, b) => famRank(a.familia) - famRank(b.familia) || a.nombre.localeCompare(b.nombre))
  if (opFilter.fam) rows = rows.filter(o => o.familia === opFilter.fam)
  if (opFilter.tipo) rows = rows.filter(o => o.tipo === opFilter.tipo)
  if (opFilter.q) { const q = opFilter.q.toLowerCase(); rows = rows.filter(o => o.nombre.toLowerCase().includes(q)) }
  tb.innerHTML = rows.map((o, i) => `<tr><td class="num muted">${i + 1}</td><td>${esc(o.familia)}</td><td>${esc(o.nombre)}</td>
      <td>${o.tipo === 'Costura' ? '<span class="pill cos">Costura</span>' : '<span class="pill man">Manual</span>'}</td>
      <td><button class="btn sm ghost admin-only" data-act="editOp" data-arg="${esc(o.nombre)}">Editar</button></td></tr>`).join('') || `<tr><td colspan="5" class="empty">Sin resultados</td></tr>`
  const cc = document.getElementById('op-count'); if (cc) cc.textContent = `${rows.length} de ${ops.length} operaciones · ${ops.filter(o => o.tipo === 'Costura').length} costura · ${ops.filter(o => o.tipo === 'Manual').length} manual`
}
function editOp(nombre) {
  const ops = opList(); const o = nombre ? ops.find(x => x.nombre === nombre) : { nombre: '', familia: 'Otras', tipo: 'Manual' }
  openModal(`<h3>${nombre ? 'Editar operación' : 'Nueva operación'}</h3>
    <div class="field"><label>Nombre</label><input id="o-nom" ${nombre ? 'disabled' : ''} value="${esc(o.nombre)}"></div>
    <div class="field"><label>Familia</label><select id="o-fam">${FAMILIAS.map(f => `<option ${f === o.familia ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
    <div class="field"><label>Tipo</label><select id="o-tipo"><option ${o.tipo === 'Costura' ? 'selected' : ''}>Costura</option><option ${o.tipo === 'Manual' ? 'selected' : ''}>Manual</option></select></div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn go" id="o-save">Guardar</button></div>`)
  document.getElementById('o-save').addEventListener('click', async () => {
    const nom = (document.getElementById('o-nom').value || '').trim()
    if (!nom) { toast('Escribe el nombre.'); return }
    const rec = { nombre: nom, familia: document.getElementById('o-fam').value, tipo: document.getElementById('o-tipo').value }
    if (await saveOperacion(rec)) { closeModal(); toast('Operación guardada.') }
  })
}

/* ---------- imagen de costura (para compartir) ---------- */
let _imgBlob = null, _imgName = ''
function _fitText(g, txt, maxW) { txt = String(txt || ''); if (g.measureText(txt).width <= maxW) return txt; let t = txt; while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1); return t + '…' }
async function imgCostura() {
  if (!curCode) { toast('Abre un código primero.'); return }
  const c = codeInfo(curCode)
  const rows = tiemposOf(curCode).filter(r => tipoOf(r.op) === 'Costura')
  if (!rows.length) { toast('Este código no tiene operaciones de costura.'); return }
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready } catch (e) {}
  const W = 1080, pad = 52, headH = 236, titleH = 70, rowH = 102, footH = 118, S = 2
  const H = headH + titleH + rows.length * rowH + footH
  const cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S
  const g = cv.getContext('2d'); g.scale(S, S)
  g.textBaseline = 'alphabetic'; g.textAlign = 'left'
  // fondo
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H)
  // cabecera verde
  g.fillStyle = '#1B4332'; g.fillRect(0, 0, W, headH)
  g.fillStyle = '#A8B826'; g.fillRect(0, headH - 8, W, 8)
  g.fillStyle = '#A8B826'; g.font = '700 25px Archivo, sans-serif'
  g.fillText('POLIPLASTICS · PLANTA SUPER SACOS', pad, 56)
  g.fillStyle = '#ffffff'; g.font = '800 58px Archivo, sans-serif'
  g.fillText(_fitText(g, c.codigo, W - pad * 2), pad, 126)
  g.fillStyle = 'rgba(255,255,255,.85)'; g.font = "400 25px 'IBM Plex Sans', sans-serif"
  const d1 = [c.cliente, ('Línea ' + (c.linea || '—'))].filter(Boolean).join('   ·   ')
  g.fillText(_fitText(g, d1, W - pad * 2), pad, 168)
  if (c.descripcion) { g.font = "400 22px 'IBM Plex Sans', sans-serif"; g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText(_fitText(g, c.descripcion, W - pad * 2), pad, 202) }
  // franja título
  let y = headH
  g.fillStyle = '#f3f5ef'; g.fillRect(0, y, W, titleH)
  g.fillStyle = '#1B4332'; g.font = '700 23px Archivo, sans-serif'
  g.fillText('OPERACIONES DE COSTURA', pad, y + 44)
  g.textAlign = 'right'; g.font = '700 20px Archivo, sans-serif'; g.fillStyle = '#52636b'
  g.fillText('UND / HORA', W - pad, y + 44); g.textAlign = 'left'
  y += titleH
  // filas
  rows.forEach((r, i) => {
    if (i % 2 === 1) { g.fillStyle = '#f7f8f4'; g.fillRect(0, y, W, rowH) }
    const cy = y + rowH / 2
    // badge número
    g.fillStyle = '#1B4332'; g.beginPath(); g.arc(pad + 24, cy, 24, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#ffffff'; g.font = '700 26px Archivo, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(String(i + 1), pad + 24, cy + 1)
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'
    // nombre operación
    const nameX = pad + 68, rightW = 210, nameMax = W - pad - rightW - nameX
    g.fillStyle = '#17201c'; g.font = "600 29px 'IBM Plex Sans', sans-serif"
    g.fillText(_fitText(g, r.op, nameMax), nameX, cy + 9)
    // und/hora grande + min pequeño a la derecha
    const u = uph(r.min)
    g.textAlign = 'right'
    if (u != null) {
      g.fillStyle = '#1B4332'; g.font = '800 40px Archivo, sans-serif'
      g.fillText(fmt(u, 1), W - pad, cy + 2)
      g.fillStyle = '#7a8a92'; g.font = "400 20px 'IBM Plex Mono', monospace"
      g.fillText(fmt(r.min, 2) + ' min', W - pad, cy + 30)
    } else {
      g.fillStyle = '#E9A820'; g.font = '700 24px Archivo, sans-serif'
      g.fillText('Pendiente', W - pad, cy + 8)
    }
    g.textAlign = 'left'
    g.strokeStyle = '#e7eae4'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y + rowH); g.lineTo(W, y + rowH); g.stroke()
    y += rowH
  })
  // pie
  const conT = rows.filter(r => uph(r.min) != null).length
  g.fillStyle = '#1B4332'; g.fillRect(0, y, W, footH)
  g.fillStyle = '#ffffff'; g.font = '700 24px Archivo, sans-serif'
  g.fillText('Total costura: ' + fmt(costuraTotal(curCode), 2) + ' min', pad, y + 46)
  g.fillStyle = 'rgba(255,255,255,.78)'; g.font = "400 21px 'IBM Plex Sans', sans-serif"
  g.fillText(rows.length + ' operaciones de costura · ' + conT + ' con tiempo' + (conT < rows.length ? ' · ' + (rows.length - conT) + ' pendiente(s)' : ''), pad, y + 78)
  g.textAlign = 'right'; g.font = "400 20px 'IBM Plex Sans', sans-serif"; g.fillStyle = 'rgba(255,255,255,.7)'
  g.fillText('Estudio de tiempos y movimientos' + (ultAct(curCode) ? ' · Act. ' + ultAct(curCode) : ''), W - pad, y + 78)
  g.textAlign = 'left'
  // salida
  const url = cv.toDataURL('image/png')
  _imgName = 'Costura_' + String(c.codigo).replace(/[^\w.-]+/g, '_') + '.png'
  _imgBlob = await new Promise(res => cv.toBlob(res, 'image/png'))
  openModal(`<h3>Imagen de costura · ${esc(c.codigo)}</h3>
    <div class="hint" style="color:var(--muted);font-size:12.5px;margin-bottom:10px">Compártela con operarios y supervisores. En el celular también puedes mantener presionada la imagen para guardarla o enviarla.</div>
    <img src="${url}" alt="Operaciones de costura" style="width:100%;border-radius:10px;border:1px solid var(--line);display:block">
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cerrar</button><button class="btn" data-act="copyImg">📋 Copiar imagen</button><button class="btn go" data-act="dlImg">⬇ Descargar imagen</button></div>`, true)
}
async function copyImg() {
  if (!_imgBlob) { toast('Genera la imagen primero.'); return }
  try {
    if (!(navigator.clipboard && window.ClipboardItem)) throw new Error('nocb')
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': _imgBlob })])
    toast('Imagen copiada. Pégala en WhatsApp con Ctrl+V.')
  } catch (e) {
    // reintento usando una promesa (Safari)
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': Promise.resolve(_imgBlob) })])
      toast('Imagen copiada. Pégala en WhatsApp con Ctrl+V.')
    } catch (e2) {
      toast('Tu navegador no deja copiar aquí. Usa Descargar, o mantén presionada la imagen en el celular.')
    }
  }
}
function downloadBlob(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
function dlImg() {
  if (!_imgBlob) { toast('Genera la imagen primero.'); return }
  downloadBlob(_imgBlob, _imgName); toast('Imagen descargada.')
}

/* ---------- export ---------- */
function exportExcel() {
  if (!dbReady) { toast('Espera a que carguen los datos.'); return }
  if (!window.XLSX) { toast('No se pudo cargar el generador de Excel. Revisa la conexión.'); return }
  const cods = codigos(); const tm = tipoMap()
  const tRows = []; cods.forEach(c => { tiemposOf(c.codigo).forEach(r => { tRows.push({ Cliente: c.cliente, Codigo: c.codigo, Descripcion: c.descripcion, Linea: c.linea, Operacion: r.op, Tipo: tm[r.op] || '', Tiempo_estandar_min: r.min, Und_hora: (uph(r.min) != null ? +uph(r.min).toFixed(1) : ''), Observado_min: (typeof r.obs === 'number' ? r.obs : ''), Valoracion_pct: (typeof r.val === 'number' ? r.val : ''), Suplementos_pct: (typeof r.supl === 'number' ? r.supl : '') }) }) })
  const estLabel = s => s === 'completo' ? 'Completo' : (s === 'incompleto' ? 'Incompleto' : 'Sin estudio')
  const cRows = cods.map(c => ({ Codigo: c.codigo, Cliente: c.cliente, Descripcion: c.descripcion, Linea: c.linea, Estado: estLabel(statusCode(c.codigo)), Min_costura_total: hasTiempos(c.codigo) ? +costuraTotal(c.codigo).toFixed(2) : '', Actualizado: ultAct(c.codigo) || '' }))
  const oRows = opList().map(o => ({ Operacion: o.nombre, Familia: o.familia, Tipo: o.tipo }))
  const pRows = futuras().map(f => ({ Codigo: f.codigo, Cliente: f.cliente, Descripcion: f.descripcion, Linea: f.linea, Estado: estLabel(f.estado), Min_costura: f.estado === 'sin' ? '' : +f.costura.toFixed(2) }))
  const X = window.XLSX
  const wb = X.utils.book_new()
  X.utils.book_append_sheet(wb, X.utils.json_to_sheet(tRows), 'Tiempos')
  X.utils.book_append_sheet(wb, X.utils.json_to_sheet(cRows), 'Codigos')
  X.utils.book_append_sheet(wb, X.utils.json_to_sheet(oRows), 'Operaciones')
  X.utils.book_append_sheet(wb, X.utils.json_to_sheet(pRows), 'Produccion proxima')
  const out = X.write(wb, { bookType: 'xlsx', type: 'array' })
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'Tiempos_Movimientos_SuperSacos.xlsx')
  toast('Excel generado.')
}

/* ---------- navegación / render ---------- */
function setTab(t) {
  curTab = t; if (t !== 'codigos') curCode = null; document.querySelectorAll('nav.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'))
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'p-' + t)); window.scrollTo(0, 0); render()
}
function render() {
  if (curTab === 'resumen') renderResumen()
  else if (curTab === 'codigos') renderCodigos()
  else if (curTab === 'futura') renderFutura()
  else if (curTab === 'operaciones') renderOperaciones()
  else if (curTab === 'bihorario') renderDesdeBH()
}
document.querySelectorAll('nav.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)))
document.getElementById('exportBtn').addEventListener('click', exportExcel)

// Botones dentro de las tablas y ventanas: data-go abre un código,
// data-act llama a la acción con su nombre (data-arg / data-arg2).
const ACTIONS = {
  closeModal, backToCodes, imgCostura, openHomologar, addRow, editCodigo, openCrono, verRegistro, delRow, doDelRow,
  verRegToCrono, swRun, swLap, swReset, swSave, swSaveConfirm, swHideConfirm, doHomologarFull, addOneOp, editOp, copyImg, dlImg,
  bhActualizar, confirmarOps,
}
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]'); if (go) { goCode(go.dataset.go); return }
  const tab = e.target.closest('[data-tab-go]'); if (tab) { setTab(tab.dataset.tabGo); return }
  const act = e.target.closest('[data-act]'); if (!act) return
  const fn = ACTIONS[act.dataset.act]; if (fn) fn(act.dataset.arg, act.dataset.arg2)
})

/* tema */
function applyTheme(t) { if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); try { localStorage.setItem('ssth', t) } catch (e) {} }
let theme = 'system'; try { theme = localStorage.getItem('ssth') || 'system' } catch (e) {} applyTheme(theme)
document.getElementById('themeBtn').addEventListener('click', () => { theme = theme === 'dark' ? 'light' : (theme === 'light' ? 'system' : 'dark'); applyTheme(theme); toast('Tema: ' + (theme === 'system' ? 'del sistema' : theme === 'dark' ? 'oscuro' : 'claro')) })

/* ---------- módulos ---------- */
const MODULOS = {
  m1: { t: 'Tiempos y Movimientos', s: 'Planta Super Sacos · por código Dynamics', el: 'mod-m1' },
  bh: { t: 'Bi-horario', s: 'Producción por hora · Planta Super Sacos', el: 'mod-bh', mod: bihorario },
  personal: { t: 'Personal', s: 'Operarios y supervisores · Planta Super Sacos', el: 'mod-personal', mod: personal },
  mm: { t: 'Mi Marcador', s: 'Eficiencia de los operarios · Planta Super Sacos', el: 'mod-mm', mod: marcador },
}
let curMod = 'm1'
// Lo que los otros módulos necesitan de este archivo.
const ctx = {
  supabase, toast, openModal, closeModal, esc, fmt, fmt0, downloadBlob,
  role: () => ROLE, perfil: () => PERFIL,
  // Desde el Bi-horario: abre el Mi Marcador de un operario.
  verMarcador: ced => { marcador.seleccionar(ced); setModule('mm') },
  m1: { ready: () => dbReady, codigos, codeInfo, tiemposOf, tipoOf, opList, planning: () => D.planning },
}
function setModule(m) {
  if (!MODULOS[m]) m = 'm1'
  curMod = m
  try { localStorage.setItem('ssmod', m) } catch (e) {}
  for (const [k, v] of Object.entries(MODULOS)) document.getElementById(v.el).hidden = k !== m
  document.querySelectorAll('#modsw button').forEach(b => b.setAttribute('aria-selected', b.dataset.mod === m ? 'true' : 'false'))
  document.getElementById('brandT').textContent = MODULOS[m].t
  document.getElementById('brandS').textContent = MODULOS[m].s
  document.getElementById('exportBtn').hidden = m !== 'm1'
  window.scrollTo(0, 0)
  if (MODULOS[m].mod) MODULOS[m].mod.show()
  else render()
}
document.querySelectorAll('#modsw button').forEach(b => b.addEventListener('click', () => setModule(b.dataset.mod)))
bihorario.init(ctx)
personal.init(ctx)
marcador.init(ctx)

/* ---------- login / roles (Supabase Auth) ---------- */
function setRole(perfil) {
  PERFIL = perfil
  // 'admin' edita todo; 'supervisor' llena el Bi-horario y ve el Módulo 1 en solo lectura.
  ROLE = perfil && (perfil.rol === 'admin' || perfil.rol === 'supervisor') ? perfil.rol : 'visita'
  document.body.classList.toggle('visita', ROLE !== 'admin')
  document.body.classList.toggle('es-admin', ROLE === 'admin')
  const rc = document.getElementById('rolechip')
  const etiqueta = { admin: 'Administrador', supervisor: 'Supervisor', visita: 'Solo lectura' }[ROLE]
  if (rc) rc.textContent = `${perfil && perfil.nombre ? perfil.nombre + ' · ' : ''}${etiqueta}`
}
async function entrar(session) {
  const { data: perfil } = await supabase.from('perfiles').select('nombre, rol, supervisor_cedula').eq('id', session.user.id).maybeSingle()
  setRole(perfil || { nombre: session.user.email, rol: 'visita' })
  document.getElementById('login').hidden = true
  document.getElementById('inicio').hidden = true
  let guardado = null; try { guardado = localStorage.getItem('ssmod') } catch (e) {}
  setModule(guardado || (ROLE === 'supervisor' ? 'bh' : 'm1'))
  await loadAll()
}
// Sin sesión se muestra el inicio con los dos ingresos; el login de
// supervisores y administrativos se abre desde ahí.
function mostrarLogin() {
  ROLE = null; PERFIL = null; document.body.classList.remove('visita')
  const pw = document.getElementById('login-pw'); if (pw) pw.value = ''
  const btn = document.getElementById('login-btn'); btn.disabled = false; btn.textContent = 'Ingresar al panel'
  document.getElementById('login').hidden = true
  document.getElementById('inicio').hidden = false
}
document.getElementById('door-staff').addEventListener('click', () => {
  document.getElementById('inicio').hidden = true
  document.getElementById('login').hidden = false
  document.getElementById('login-email').focus()
})
document.getElementById('login-back').addEventListener('click', () => {
  document.getElementById('login').hidden = true
  document.getElementById('inicio').hidden = false
})

// Mi Marcador público: se abre con el botón "Soy operario" o con el enlace …/#marcador.
document.getElementById('door-op').addEventListener('click', () => { location.hash = 'marcador' })
function ruta() {
  if (location.hash === '#marcador') marcador.mostrarPublico()
  else marcador.ocultarPublico()
}
marcador.initPublico(supabase, { volver: () => { history.replaceState(null, '', location.pathname + location.search); ruta() } })
window.addEventListener('hashchange', ruta)
ruta()
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault()
  const err = document.getElementById('login-err'); err.hidden = true
  const btn = document.getElementById('login-btn'); btn.disabled = true; btn.textContent = 'Entrando…'
  const email = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-pw').value
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  btn.disabled = false; btn.textContent = 'Ingresar al panel'
  if (error) { err.textContent = 'Correo o contraseña incorrectos. Intenta de nuevo.'; err.hidden = false }
})
document.getElementById('login-forgot').addEventListener('click', () => {
  const n = document.getElementById('login-note')
  n.innerHTML = 'Para restablecer tu contraseña, escríbele a <b>Said Meléndez</b>: <b>said.melendez@poliplastics.com</b>'; n.hidden = false
})
document.getElementById('logoutBtn').addEventListener('click', () => supabase.auth.signOut())

let sesionActual = null
supabase.auth.onAuthStateChange((_evt, session) => {
  const antes = sesionActual && sesionActual.user.id
  sesionActual = session
  if (!session) { mostrarLogin(); return }
  // Solo recarga cuando cambia el usuario (no en cada renovación del token).
  if (session.user.id !== antes) setTimeout(() => entrar(session), 0)
})

render()
