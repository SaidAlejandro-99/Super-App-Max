// Módulo 2 — Bi-horario.
// Reemplaza la hoja en papel PSS-FR-009. Un turno (fecha + turno + línea)
// tiene una hoja por referencia; cada hoja, bloques por operación con su meta;
// cada bloque, operarios; y cada operario, una casilla por hora.
// Decisiones de diseño: docs/BIHORARIO.md
//
// Los cambios se guardan primero en el equipo (cola en localStorage) y se
// envían a Supabase en orden; si no hay señal, se reintentan solos.

let C = null            // contexto que entrega main.js
let el = null           // contenedor del módulo
const CAT = { cargado: false, turnos: [], causas: [], supervisores: [], operarios: [] }
let vista = 'lista'     // 'lista' | 'turno'
let fechaLista = hoyISO()
let T = null            // turno abierto: { turno, hojas, bloques, asig, regs: Map }
let hojaActual = null
// Bloques de operación contraídos (solo muestran los datos de la operación).
const colapsados = new Set((() => { try { return JSON.parse(localStorage.getItem('bh_colapsados') || '[]') } catch (e) { return [] } })())
function guardarColapsados() { try { localStorage.setItem('bh_colapsados', JSON.stringify([...colapsados])) } catch (e) {} }

export const LINEAS = [
  { v: 'CIRCULAR', t: 'Circular' }, { v: '4PANEL', t: '4 Panel' }, { v: 'UPANEL', t: 'U-panel' },
  { v: 'PANEL', t: 'Panel' }, { v: 'PORTASACOS', t: 'Portasacos' }, { v: 'CERROMATOSO', t: 'Cerro Matoso' },
  { v: 'CONTAINER', t: 'Container' }, { v: 'ALTERNAS', t: 'Líneas alternas' },
  { v: 'PRENSA', t: 'Prensa' }, { v: 'LINER', t: 'Liner' },
]
// Prensa y Liner (producto terminado) no usan hojas por referencia: cada persona
// anota lo que hizo y el tiempo que estuvo fuera del proceso. Metas por hora:
const PT_METAS = { PRENSA: [['pallet', 'Pallet', 125], ['bulto', 'Bulto', 60]], LINER: [['liner', 'Liner', 40]] }
const esPT = linea => !!PT_METAS[linea]
// Vista del turno: 'hojas' (por referencia) o 'general' (todo unido por operación).
let vistaTurno = 'hojas', verProyeccion = false
// Colores para distinguir la referencia (cliente) en la vista general.
// (Un poco más vivos que la paleta base, para que se distingan del verde de la app.)
const COLORES = ['#2fa36b', '#e09a1a', '#3b82c4', '#9b59b6', '#d9534f', '#17a2a8']
// Hojas que se ven como mapa (una sola tabla) en vez del detalle por operación.
const hojasMapa = new Set((() => { try { return JSON.parse(localStorage.getItem('bh_mapa') || '[]') } catch (e) { return [] } })())
function guardarMapa() { try { localStorage.setItem('bh_mapa', JSON.stringify([...hojasMapa])) } catch (e) {} }
const lineaTxt = v => (LINEAS.find(l => l.v === v) || { t: v }).t

/* ---------- utilidades ---------- */
function hoyISO() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
// crypto.randomUUID solo existe en https o localhost; desde el celular por la
// red local (http://192.168…) no está, así que se arma el UUID a mano.
const uid = () => {
  if (crypto.randomUUID) return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
function fechaTxt(iso) { const d = new Date(iso + 'T12:00:00'); return `${DIAS[d.getDay()]} ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}` }
const hNum = t => +String(t).slice(0, 2)

// Horas del turno: inicio, cantidad de casillas y etiqueta de cada una.
// La etiqueta es la hora en que termina la casilla, como en la hoja de papel
// (turno de 6 a 18 → 7, 8, 9 … 6). El índice i es la hora que se guarda en bh_registros.
function slotsTurno(turno, fecha) {
  const def = CAT.turnos.find(t => t.codigo === turno); if (!def) return []
  const domingo = new Date(fecha + 'T12:00:00').getDay() === 0
  const ini = hNum(domingo && def.inicio_domingo ? def.inicio_domingo : def.inicio)
  const fin = hNum(def.fin)
  const n = ((fin - ini) + 24) % 24 || 24
  return Array.from({ length: n }, (_, i) => { const h = (ini + i + 1) % 24; return { i, label: String(h % 12 || 12), h } })
}
// Casillas que se muestran: los turnos de 12 h (4 y 5) no muestran la hora de
// almuerzo (turnos_def.descanso), salvo que ese turno ya tenga algo registrado ahí.
function horasTurno(turno, fecha, X = T) {
  const s = slotsTurno(turno, fecha)
  const def = CAT.turnos.find(t => t.codigo === turno)
  const d = def && def.descanso != null ? s.find(h => h.h === +def.descanso) : null
  if (!d) return s
  const usado = X && X.turno.turno === turno && X.turno.fecha === fecha && [...X.regs.values()].some(r => r.hora === d.i && horaRegistrada(r))
  return usado ? s : s.filter(h => h !== d)
}
function turnoTxt(codigo) {
  const d = CAT.turnos.find(t => t.codigo === codigo); if (!d) return codigo
  const f = t => { const h = hNum(t); return `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}` }
  return `Turno ${codigo} · ${f(d.inicio)}–${f(d.fin)}`
}
const supNombre = ced => { const s = CAT.supervisores.find(x => x.cedula === ced); return s ? nombreCorto(s.nombre) : '' }
// "MARTINEZ CANO ADEL" → "Adel Martinez"
function nombreCorto(n) {
  const p = String(n || '').toLowerCase().split(' ').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1))
  if (p.length >= 3) return `${p[2]} ${p[0]}`
  return p.reverse().join(' ')
}
const opNombre = ced => { const o = CAT.operarios.find(x => x.cedula === ced); return o ? nombreCorto(o.nombre) : ced }
const causa = cod => CAT.causas.find(c => c.codigo === cod)

/* ---------- cola de sincronización ---------- */
const QKEY = 'bh_cola'
let cola = []; try { cola = JSON.parse(localStorage.getItem(QKEY) || '[]') } catch (e) { cola = [] }
let enviando = false
function guardarCola() { try { localStorage.setItem(QKEY, JSON.stringify(cola)) } catch (e) {} pintarSync() }
function pintarSync() {
  const s = document.getElementById('syncchip'); if (!s) return
  s.hidden = !cola.length
  s.textContent = navigator.onLine ? `Sincronizando ${cola.length}…` : `Sin señal · ${cola.length} por enviar`
}
const CONFLICTO = { bh_registros: 'asignacion_id,hora' }
function encolar(tabla, tipo, datos) { cola.push({ tabla, tipo, datos }); guardarCola(); enviar() }
const esDeRed = err => !navigator.onLine || /fetch|network|Load failed|timeout/i.test((err && (err.message || err.details)) || '')
async function enviar() {
  if (enviando) return
  enviando = true
  try {
    while (cola.length) {
      const { tabla, tipo, datos } = cola[0]
      let r
      if (tipo === 'upsert') r = await C.supabase.from(tabla).upsert(datos, { onConflict: CONFLICTO[tabla] || 'id' })
      else if (tipo === 'update') r = await C.supabase.from(tabla).update(datos.set).match(datos.match)
      else r = await C.supabase.from(tabla).delete().match(datos)
      if (r.error) {
        if (esDeRed(r.error)) break
        console.error(tabla, r.error)
        C.toast('No se pudo guardar un cambio: ' + (r.error.message || 'error'))
      }
      cola.shift(); guardarCola()
    }
  } finally { enviando = false; pintarSync() }
}
window.addEventListener('online', enviar)
setInterval(() => { if (cola.length) enviar() }, 20000)

/* ---------- carga ---------- */
async function cargarCatalogos() {
  const s = C.supabase
  const [t, c, sp, op] = await Promise.all([
    s.from('turnos_def').select('*').order('orden'),
    s.from('causas_tm').select('*').order('orden'),
    s.from('supervisores').select('*').order('nombre'),
    s.from('operarios').select('cedula, nombre, linea, operacion_base, activo').order('nombre').range(0, 4999),
  ])
  const err = t.error || c.error || sp.error || op.error
  if (err) throw err
  // Sin sesión la base de datos devuelve listas vacías: eso no cuenta como cargado.
  if (!t.data.length) throw new Error('Catálogos vacíos: no hay sesión')
  CAT.turnos = t.data; CAT.causas = c.data; CAT.supervisores = sp.data; CAT.operarios = op.data
  CAT.cargado = true
  try { localStorage.setItem('bh_cat', JSON.stringify(CAT)) } catch (e) {}
}
async function asegurarCatalogos() {
  if (CAT.cargado) return
  try { await cargarCatalogos() } catch (e) {
    console.error(e)
    try { const copia = JSON.parse(localStorage.getItem('bh_cat') || '{}'); if (copia.turnos && copia.turnos.length) Object.assign(CAT, copia) } catch (_) {}
    if (!CAT.cargado) throw e
  }
}
export async function recargarOperarios() {
  const { data } = await C.supabase.from('operarios').select('cedula, nombre, linea, operacion_base, activo').order('nombre').range(0, 4999)
  if (data) CAT.operarios = data
  const sp = await C.supabase.from('supervisores').select('*').order('nombre')
  if (sp.data) CAT.supervisores = sp.data
}

async function cargarTurno(id) {
  const s = C.supabase
  try {
    const [tu, ho, bl, as, rg, pt, pp] = await Promise.all([
      s.from('bh_turnos').select('*').eq('id', id).single(),
      s.from('bh_hojas').select('*').eq('turno_id', id).order('orden'),
      s.from('bh_bloques').select('*').eq('turno_id', id).order('orden'),
      s.from('bh_asignaciones').select('*').eq('turno_id', id).order('orden'),
      s.from('bh_registros').select('*').eq('turno_id', id),
      s.from('bh_pt').select('*').eq('turno_id', id).order('created_at'),
      s.from('bh_pt_personas').select('*').eq('turno_id', id).order('orden'),
    ])
    const err = tu.error || ho.error || bl.error || as.error || rg.error || pt.error || pp.error
    if (err) throw err
    T = { turno: tu.data, hojas: ho.data, bloques: bl.data, asig: as.data, regs: new Map(), pt: pt.data, ptp: pp.data }
    rg.data.forEach(r => T.regs.set(r.asignacion_id + '|' + r.hora, r))
  } catch (e) {
    // Sin señal: se usa la última copia guardada en el equipo.
    const copia = leerCopia(id)
    if (!copia) throw e
    T = copia
    C.toast('Sin señal: mostrando la última copia guardada en este equipo.')
  }
  // Cambios que aún no han subido se aplican encima de lo descargado.
  cola.forEach(aplicarLocal)
  guardarCopia()
}
function guardarCopia() {
  if (!T) return
  try { localStorage.setItem('bh_turno_' + T.turno.id, JSON.stringify({ ...T, regs: [...T.regs.values()] })) } catch (e) {}
}
function leerCopia(id) {
  try {
    const o = JSON.parse(localStorage.getItem('bh_turno_' + id) || 'null'); if (!o) return null
    const regs = new Map(); o.regs.forEach(r => regs.set(r.asignacion_id + '|' + r.hora, r))
    return { pt: [], ptp: [], ...o, regs }
  } catch (e) { return null }
}
function aplicarLocal({ tabla, tipo, datos }) {
  if (!T) return
  const lista = { bh_hojas: T.hojas, bh_bloques: T.bloques, bh_asignaciones: T.asig, bh_pt: T.pt, bh_pt_personas: T.ptp }[tabla]
  if (tabla === 'bh_registros') {
    if (datos.turno_id !== T.turno.id && !(datos.asignacion_id && T.asig.some(a => a.id === datos.asignacion_id))) return
    const k = datos.asignacion_id + '|' + datos.hora
    if (tipo === 'delete') T.regs.delete(k); else T.regs.set(k, { ...T.regs.get(k), ...datos })
  } else if (tabla === 'bh_turnos' && tipo === 'update' && datos.match.id === T.turno.id) {
    Object.assign(T.turno, datos.set)
  } else if (lista) {
    if (tipo === 'delete') {
      const i = lista.findIndex(x => x.id === datos.id); if (i >= 0) lista.splice(i, 1)
      // En la base el borrado es en cascada; aquí se replica para la pantalla.
      if (tabla === 'bh_hojas') T.bloques.filter(b => b.hoja_id === datos.id).forEach(b => aplicarLocal({ tabla: 'bh_bloques', tipo, datos: { id: b.id } }))
      if (tabla === 'bh_bloques') T.asig.filter(a => a.bloque_id === datos.id).forEach(a => aplicarLocal({ tabla: 'bh_asignaciones', tipo, datos: { id: a.id } }))
      if (tabla === 'bh_asignaciones') [...T.regs.keys()].filter(k => k.startsWith(datos.id + '|')).forEach(k => T.regs.delete(k))
    }
    else if (datos.turno_id === T.turno.id) { const i = lista.findIndex(x => x.id === datos.id); if (i >= 0) lista[i] = { ...lista[i], ...datos }; else lista.push({ ...datos }) }
  }
}
// Guarda un cambio: se aplica en pantalla, se guarda en el equipo y se encola.
function cambio(tabla, tipo, datos) {
  aplicarLocal({ tabla, tipo, datos })
  guardarCopia()
  encolar(tabla, tipo, datos)
}

/* ---------- permisos ---------- */
const esStaff = () => ['admin', 'supervisor'].includes(C.role())
function puedeEditar() {
  if (!T) return false
  if (C.role() === 'admin') return true
  if (!esStaff()) return false
  if (T.turno.estado === 'abierto') return true
  return T.turno.terminado_at && (Date.now() - new Date(T.turno.terminado_at).getTime()) < 2 * 864e5
}

/* ---------- cálculos ---------- */
// Meta por hora de una operación según el Módulo 1 (60 / minutos estándar).
function metaEstudio(codigo, operacion) {
  const filas = C.m1.tiemposOf(codigo).filter(r => r.op === operacion)
  const min = filas.reduce((s, r) => s + (+r.min || 0), 0)
  return filas.length && min > 0 ? Math.round((60 / min) * 10) / 10 : null
}
const reg = (asigId, h) => T && T.regs.get(asigId + '|' + h)
// Minutos disponibles de una hora: 60 menos el tiempo muerto que descuenta
// (pérdida o manualidad). La llegada tarde no descuenta: se castiga.
function minutosDisponibles(r) {
  if (!r) return 0
  const c = r.tm_causa && causa(r.tm_causa)
  const tm = c && c.tipo !== 'tardanza' ? (+r.tm_minutos || 0) : 0
  return Math.max(0, 60 - tm)
}
// Solo cuentan las horas que tienen algo registrado (unidades o novedad).
const horaRegistrada = r => r && (r.unidades != null || r.tm_causa)
// Las funciones de cálculo reciben el turno (X) para poder usarse también en
// las tarjetas de la lista, donde se calculan varios turnos a la vez.
const regX = (X, asigId, h) => X.regs.get(asigId + '|' + h)
// Calificación de revisión y patinador: unidades reportadas al cerrar ÷ meta del turno.
function calificacionTurno(X) {
  const meta = +X.turno.meta_turno || 0
  const rep = X.hojas.filter(h => h.unidades_reportadas != null)
  if (!meta || X.turno.estado !== 'terminado' || !rep.length) return null
  return X.hojas.reduce((s, h) => s + (+h.unidades_reportadas || 0), 0) / meta
}
// Una persona puede pasar de una referencia u operación a otra dentro de la misma
// hora. Esa hora no se le cuenta dos veces: sus minutos se reparten entre lo que
// hizo según el tiempo estándar ganado en cada parte (unidades ÷ meta).
// Ej.: 10 de meta 20 y 8 de meta 18 en la misma hora → 0,5 + 0,44 = 94 %.
function dispReparto(X, a, i) {
  const r = regX(X, a.id, i)
  if (!horaRegistrada(r)) return 0
  const otras = X.asig.filter(o => o.cedula === a.cedula && o.id !== a.id).map(o => [o, regX(X, o.id, i)]).filter(([, g]) => horaRegistrada(g))
  if (!otras.length) return minutosDisponibles(r)
  const todas = [[a, r], ...otras]
  // El tiempo muerto de esa hora es uno solo para la persona (el mayor que se anotó).
  const tm = Math.max(...todas.map(([, g]) => { const c = g.tm_causa && causa(g.tm_causa); return c && c.tipo !== 'tardanza' ? (+g.tm_minutos || 0) : 0 }))
  const ganado = ([o, g]) => {
    const b = X.bloques.find(x => x.id === o.bloque_id)
    const m = b && b.meta_origen !== 'turno' && b.meta_hora ? b.meta_hora * (+o.factor || 1) : null
    return m ? (+g.unidades || 0) / m : null
  }
  const w = todas.map(ganado), suma = w.reduce((s, v) => s + (v || 0), 0)
  const parte = w.every(v => v != null) && suma > 0 ? w[0] / suma : 1 / todas.length
  return Math.max(0, 60 - tm) * parte
}
function resumenAsig(a, bloque, X = T) {
  let total = 0, disp = 0
  const acum = []
  slotsTurno(X.turno.turno, X.turno.fecha).forEach(({ i }) => {
    const r = regX(X, a.id, i)
    if (horaRegistrada(r)) { total += +r.unidades || 0; disp += dispReparto(X, a, i) }
    acum.push(total)
  })
  if (bloque.meta_origen === 'turno') return { total, disp, acum, esperado: null, ef: calificacionTurno(X) }
  // Polivalencia: la meta se pondera con el factor que eligió el supervisor.
  const esperado = bloque.meta_hora ? bloque.meta_hora * (+a.factor || 1) * disp / 60 : null
  return { total, disp, acum, esperado, ef: esperado ? total / esperado : null }
}
function resumenBloque(b, X = T) {
  const horas = slotsTurno(X.turno.turno, X.turno.fecha)
  const asig = X.asig.filter(a => a.bloque_id === b.id).sort((p, q) => p.orden - q.orden)
  const porHora = horas.map(({ i }) => asig.reduce((s, a) => s + (+(regX(X, a.id, i) || {}).unidades || 0), 0))
  let acc = 0; const acum = porHora.map(v => (acc += v))
  const res = asig.map(a => resumenAsig(a, b, X))
  const total = acc
  if (b.meta_origen === 'turno') return { asig, porHora, acum, total, esperado: null, ef: calificacionTurno(X) }
  const esperado = res.reduce((s, r) => s + (r.esperado || 0), 0)
  return { asig, porHora, acum, total, esperado, ef: esperado ? total / esperado : null }
}
// Todo el turno agrupado por operación, sin importar la referencia (vista
// general, tarjetas de la lista y proyección al cierre).
function resumenOperaciones(X = T) {
  // Los arreglos por hora van por índice i (todas las casillas); "horas" son las que se muestran.
  const slots = slotsTurno(X.turno.turno, X.turno.fecha)
  const horas = horasTurno(X.turno.turno, X.turno.fecha, X)
  const ordenHoja = new Map(X.hojas.map((h, i) => [h.id, h.orden ?? i]))
  const bloques = [...X.bloques].sort((a, b) => (ordenHoja.get(a.hoja_id) - ordenHoja.get(b.hoja_id)) || (a.orden - b.orden))
  const ops = new Map()
  bloques.forEach(b => {
    const r = resumenBloque(b, X)
    let o = ops.get(b.operacion)
    if (!o) { o = { operacion: b.operacion, porHora: slots.map(() => 0), hojasHora: slots.map(() => new Set()), personas: new Set(), esperado: 0, conMeta: false, turnoMeta: false }; ops.set(b.operacion, o) }
    slots.forEach(({ i }) => { if (r.porHora[i]) { o.porHora[i] += r.porHora[i]; o.hojasHora[i].add(b.hoja_id) } })
    r.asig.forEach(a => o.personas.add(a.cedula))
    if (b.meta_origen === 'turno') o.turnoMeta = true
    else if (r.esperado) { o.esperado += r.esperado; o.conMeta = true }
  })
  const lista = [...ops.values()].map(o => {
    let acc = 0; const acum = o.porHora.map(v => (acc += v))
    const conDato = o.porHora.map((v, i) => v ? i : -1).filter(i => i >= 0)
    const ultima = conDato.length ? conDato[conDato.length - 1] : -1
    // Proyección: promedio de las horas que sí tuvieron producción en esta operación,
    // por las horas que faltan del turno.
    const prom = conDato.length ? acc / conDato.length : 0
    const proyeccion = ultima >= 0 ? Math.round(acc + prom * horas.filter(h => h.i > ultima).length) : null
    const ef = o.turnoMeta ? calificacionTurno(X) : (o.conMeta && o.esperado ? acc / o.esperado : null)
    return { ...o, acum, total: acc, ultima, prom, proyeccion, ef }
  })
  return { horas, lista }
}
// Operaciones que marcan cuántos sacos van, según la línea.
const CLAVES = { CIRCULAR: ['Pegue tapa', 'Pegue solapa', 'Pegue reata', 'Costura DD5'] }
const clavesDe = linea => CLAVES[linea] || ['Pegue tapa', 'Pegue solapa']
const esSalida = op => /^pegue (tapa|solapa)$/i.test(op)
const pct = v => v == null ? '—' : Math.round(v * 100) + '%'
const efClase = v => v == null ? '' : v >= 0.95 ? 'ef-ok' : v >= 0.8 ? 'ef-med' : 'ef-bajo'

/* ---------- entrada del módulo ---------- */
export function init(ctx) {
  C = ctx
  el = document.getElementById('mod-bh')
  el.addEventListener('click', onClick)
  pintarSync()
}
// Al iniciar sesión se vuelven a pedir los catálogos (supervisores, turnos, personal).
export function alEntrar() { CAT.cargado = false }
export async function show() {
  el.innerHTML = '<div class="loading">Cargando Bi-horario…</div>'
  try { await asegurarCatalogos() } catch (e) { el.innerHTML = '<div class="empty">No se pudo cargar el Bi-horario. Revisa la conexión.</div>'; return }
  enviar()
  if (vista === 'turno' && T) await abrirTurno(T.turno.id)
  else await pintarLista()
}
export function onM1Ready() { if (vista === 'turno' && T) pintarTurno() }

/* ---------- vista: lista de turnos ---------- */
// Trae todo lo de los turnos de una fecha para armar el resumen de cada tarjeta.
async function cargarDia(turnos) {
  const ids = turnos.map(t => t.id); if (!ids.length) return new Map()
  const s = C.supabase
  const [ho, bl, as, rg, pt, pp] = await Promise.all([
    s.from('bh_hojas').select('*').in('turno_id', ids),
    s.from('bh_bloques').select('*').in('turno_id', ids),
    s.from('bh_asignaciones').select('*').in('turno_id', ids),
    s.from('bh_registros').select('asignacion_id, hora, turno_id, unidades, tm_causa, tm_minutos').in('turno_id', ids).range(0, 19999),
    s.from('bh_pt').select('*').in('turno_id', ids),
    s.from('bh_pt_personas').select('*').in('turno_id', ids),
  ])
  if (ho.error || bl.error || as.error || rg.error || pt.error || pp.error) return new Map()
  const m = new Map()
  turnos.forEach(t => m.set(t.id, { turno: t, hojas: ho.data.filter(x => x.turno_id === t.id), bloques: bl.data.filter(x => x.turno_id === t.id), asig: as.data.filter(x => x.turno_id === t.id), regs: new Map(),
    pt: pt.data.filter(x => x.turno_id === t.id), ptp: pp.data.filter(x => x.turno_id === t.id) }))
  rg.data.forEach(r => { const X = m.get(r.turno_id); if (X) X.regs.set(r.asignacion_id + '|' + r.hora, r) })
  return m
}
// Datos que resumen un turno (tarjetas y Planta en vivo).
function datosTurno(X) {
  if (esPT(X.turno.linea)) { const r = resumenPT(X); return { pt: r, ef: r.ef, personas: r.personas.length, tm: r.fuera } }
  const { horas, lista } = resumenOperaciones(X)
  let esp = 0, tot = 0
  lista.forEach(o => { if (!o.turnoMeta && o.conMeta) { esp += o.esperado; tot += o.total } })
  let tm = 0; const porCausa = {}
  // Tiempo muerto de la línea: en cada hora y causa se toma el mayor (no se suma por persona).
  const porHora = new Map()
  X.regs.forEach(r => { const c = r.tm_causa && causa(r.tm_causa); if (c && c.tipo === 'perdida') { const k = r.hora + '|' + c.codigo; porHora.set(k, Math.max(porHora.get(k) || 0, +r.tm_minutos || 0)) } })
  porHora.forEach((m, k) => { const cod = k.split('|')[1]; tm += m; porCausa[cod] = (porCausa[cod] || 0) + m })
  const top = Object.entries(porCausa).sort((a, b) => b[1] - a[1])[0]
  const conGente = lista.filter(o => o.personas.size && o.total > 0 && !o.turnoMeta)
  const cuello = conGente.length > 1 ? conGente.reduce((m, o) => o.total < m.total ? o : m) : null
  const fabricado = X.hojas.some(h => h.unidades_reportadas != null) ? X.hojas.reduce((s, h) => s + (+h.unidades_reportadas || 0), 0) : null
  const salida = lista.filter(o => esSalida(o.operacion)).reduce((s, o) => s + o.total, 0)
  return { horas, lista, ef: esp ? tot / esp : null, tm, top, cuello, fabricado, salida, meta: +X.turno.meta_turno || 0, personas: new Set(X.asig.map(a => a.cedula)).size }
}
const tmTxt = d => d.tm ? `${d.tm} min${d.top ? ' · ' + (d.top[0] === '411' ? 'DM' : d.top[0] === '425' ? 'FM' : d.top[0]) : ''}` : '0'
function resumenTarjeta(X) {
  const d = datosTurno(X), t = X.turno
  // Turno cerrado: lo fabricado va resaltado.
  if (d.pt) {
    const total = d.pt.personas.reduce((s, p) => s + p.cantidad, 0)
    return `${t.estado === 'terminado' ? `<div class="bh-card-fab"><small>${t.linea === 'PRENSA' ? 'Prensado' : 'Enlainado'}</small><b>${C.fmt0(total)}</b></div>` : ''}
    <div class="bh-card-kpis"><span>${d.personas} pers.</span><span>Efic. <b class="${efClase(d.ef)}">${pct(d.ef)}</b></span><span>Fuera ${d.tm ? d.tm + ' min' : '0'}</span></div>`
  }
  return `${t.estado === 'terminado' && d.fabricado != null ? `<div class="bh-card-fab"><small>Fabricado</small><b>${C.fmt0(d.fabricado)}</b>${d.meta ? `<span>de ${C.fmt0(d.meta)} · <b class="${efClase(d.fabricado / d.meta)}">${Math.round(100 * d.fabricado / d.meta)}%</b></span>` : ''}</div>` : ''}
    <div class="bh-card-kpis"><span>${d.personas} pers.</span><span>Efic. <b class="${efClase(d.ef)}">${pct(d.ef)}</b></span><span>TM ${tmTxt(d)}</span></div>
    ${d.cuello && t.estado === 'abierto' ? `<div class="bh-card-cuello">Cuello: ${C.esc(d.cuello.operacion)} (${C.fmt0(d.cuello.total)})</div>` : ''}`
}

// La lista tiene tres vistas: turnos por línea, Planta en vivo (todo lo abierto) y Personas (eficiencia del día).
let vistaLista = 'turnos', filtroEstado = 'todos', viejosAbiertos = []
const filtroPers = { linea: '', sup: '', orden: 'mejor' }
const ordenLinea = l => { const i = LINEAS.findIndex(x => x.v === l); return i < 0 ? 99 : i }
const ordenTurno = c => (CAT.turnos.find(t => t.codigo === c) || { orden: 99 }).orden
function porLinea(turnos) {
  const m = new Map()
  ;[...turnos].sort((a, b) => ordenLinea(a.linea) - ordenLinea(b.linea) || ordenTurno(a.turno) - ordenTurno(b.turno)).forEach(t => { if (!m.has(t.linea)) m.set(t.linea, []); m.get(t.linea).push(t) })
  return [...m.entries()]
}

async function pintarLista() {
  vista = 'lista'; T = null; vistaTurno = 'hojas'
  el.innerHTML = '<div class="loading">Cargando…</div>'
  const s = C.supabase
  let turnos = [], error = null
  if (vistaLista === 'planta') {
    // Todo lo que está en curso, aunque haya empezado ayer (turnos de noche).
    // Solo los de hoy y los de noche de ayer; los de días anteriores sin terminar se avisan aparte.
    const ayer = new Date(hoyISO() + 'T12:00:00'); ayer.setDate(ayer.getDate() - 1)
    const r = await s.from('bh_turnos').select('*').eq('estado', 'abierto').order('fecha'); error = r.error
    const desde = ayer.toISOString().slice(0, 10)
    turnos = (r.data || []).filter(t => t.fecha >= desde)
    viejosAbiertos = (r.data || []).filter(t => t.fecha < desde)
  } else {
    const r = await s.from('bh_turnos').select('*').eq('fecha', fechaLista).order('created_at'); turnos = r.data || []; error = r.error
  }
  const dia = await cargarDia(turnos)
  const yo = (C.perfil() || {}).supervisor_cedula
  let pendientes = []
  if (esStaff()) { try { pendientes = await turnosSinTerminar(C.role() === 'admin' ? null : yo) } catch (e) { pendientes = [] } }
  const tabs = [['turnos', 'Turnos'], ['planta', 'Planta en vivo'], ['personas', 'Personas']]
  el.innerHTML = `
  <div class="bh-head">
    <div><h2>Bi-horario</h2><div class="hint">${vistaLista === 'planta' ? 'Todos los turnos en curso, por línea y operación.' : vistaLista === 'personas' ? 'La eficiencia de cada operario en los turnos del día.' : 'Los turnos del día, ordenados por línea.'}</div></div>
    <div class="controls" style="margin:0">
      ${vistaLista !== 'planta' ? `<input type="date" id="bh-fecha" value="${fechaLista}">` : ''}
      ${esStaff() ? '<button class="btn go" data-a="nuevoTurno">+ Abrir turno</button>' : ''}
    </div>
  </div>
  <nav class="tabs" style="position:static;margin:0 0 14px;border-radius:10px;border:1px solid var(--line)">
    ${tabs.map(([v, txt]) => `<button aria-selected="${vistaLista === v}" data-a="vistaLista" data-v="${v}">${txt}</button>`).join('')}
  </nav>
  ${error ? '<div class="banner">Sin señal: no se pudo traer la lista de turnos.</div>' : ''}
  ${C.role() !== 'admin' ? avisoPendientes(pendientes, true) : ''}
  ${vistaLista === 'planta' ? pintarPlanta(turnos, dia) : vistaLista === 'personas' ? pintarPersonasDia(turnos, dia) : pintarTurnosPorLinea(turnos, dia)}
  ${C.role() === 'admin' ? resumenPendientesAdmin(pendientes) : ''}`
  const f = document.getElementById('bh-fecha'); if (f) f.addEventListener('change', e => { fechaLista = e.target.value || hoyISO(); pintarLista() })
  el.querySelectorAll('[data-filtro]').forEach(x => x.addEventListener('change', e => { filtroPers[x.dataset.filtro] = e.target.value; pintarLista() }))
}

function pintarTurnosPorLinea(turnos, dia) {
  const abiertos = turnos.filter(t => t.estado === 'abierto').length
  const lista = turnos.filter(t => filtroEstado === 'todos' || (filtroEstado === 'curso' ? t.estado === 'abierto' : t.estado === 'terminado'))
  const chips = [['todos', `Todos (${turnos.length})`], ['curso', `En curso (${abiertos})`], ['terminados', `Terminados (${turnos.length - abiertos})`]]
  return `
  <div class="bh-chips" style="margin-bottom:12px">${chips.map(([v, t]) => `<button class="bh-chip ${filtroEstado === v ? 'on' : ''}" data-a="filtroEstado" data-v="${v}">${t}</button>`).join('')}</div>
  ${porLinea(lista).map(([linea, ts]) => `
  <div class="bh-linea">
    <div class="bh-linea-t">${C.esc(lineaTxt(linea))}</div>
    <div class="bh-linea-cards">${ts.map(t => `
      <button class="bh-card ${t.estado === 'abierto' ? 'abierto' : ''}" data-a="abrir" data-id="${t.id}">
        <div class="bh-card-top"><b>${C.esc(turnoTxt(t.turno))}</b><span class="pill ${t.estado === 'abierto' ? 'si' : 'man'}">${t.estado === 'abierto' ? 'En curso' : 'Terminado'}</span></div>
        <div class="muted" style="font-size:12.5px">${C.esc([supNombre(t.supervisor_cedula), supNombre(t.supervisor2_cedula)].filter(Boolean).join(' · ') || 'Sin supervisor')}</div>
        ${dia.has(t.id) ? resumenTarjeta(dia.get(t.id)) : ''}
      </button>`).join('')}</div>
  </div>`).join('') || `<div class="empty">No hay turnos ${filtroEstado === 'curso' ? 'en curso' : filtroEstado === 'terminados' ? 'terminados' : ''} el ${fechaTxt(fechaLista)}.</div>`}`
}

// Planta en vivo: todos los turnos abiertos, por línea, con cada operación.
function pintarPlanta(turnos, dia) {
  // Los turnos de días anteriores sin terminar ya salen en el aviso de arriba (turnos sin terminar).
  const aviso = ''
  if (!turnos.length) return '<div class="empty">No hay turnos en curso en este momento.</div>' + aviso
  const todos = turnos.map(t => dia.get(t.id)).filter(Boolean)
  let esp = 0, tot = 0
  todos.forEach(X => { if (!esPT(X.turno.linea)) resumenOperaciones(X).lista.forEach(o => { if (!o.turnoMeta && o.conMeta) { esp += o.esperado; tot += o.total } }) })
  return `
  <div class="grid kpis" style="margin-bottom:12px">
    <div class="kpi"><div class="label">Turnos en curso</div><div class="value">${turnos.length}</div></div>
    <div class="kpi"><div class="label">Personas</div><div class="value">${new Set(todos.flatMap(X => esPT(X.turno.linea) ? (X.ptp || []).map(p => p.cedula) : X.asig.map(a => a.cedula))).size}</div></div>
    <div class="kpi"><div class="label">Eficiencia de la planta</div><div class="value ${efClase(esp ? tot / esp : null)}">${pct(esp ? tot / esp : null)}</div></div>
  </div>
  ${porLinea(turnos).map(([linea, ts]) => ts.map(t => {
    const X = dia.get(t.id); if (!X) return ''
    const d = datosTurno(X)
    const cab = `<div class="bh-planta-h" data-a="abrir" data-id="${t.id}" title="Abrir el turno">
      <div><b>${C.esc(lineaTxt(linea))}</b> · ${C.esc(turnoTxt(t.turno))} <span class="muted">· ${C.esc(supNombre(t.supervisor_cedula) || 'Sin supervisor')}${t.fecha !== hoyISO() ? ' · empezó ' + fechaTxt(t.fecha) : ''}</span></div>
      <div class="bh-planta-k"><span>Efic. <b class="${efClase(d.ef)}">${pct(d.ef)}</b></span><span>${d.personas} pers.</span><span>${d.pt ? 'Fuera ' + (d.tm || 0) + ' min' : 'TM ' + tmTxt(d)}</span><span class="linkish">Abrir →</span></div></div>`
    if (d.pt) return `<div class="section bh-planta">${cab}
      <div class="tablebox"><table><thead><tr><th>Persona</th><th class="num">Hizo</th><th class="num">En el proceso</th><th class="num">Efic.</th></tr></thead><tbody>
      ${d.pt.personas.map(p => `<tr><td><span class="bh-nombre" data-a="verMarcador" data-c="${C.esc(p.cedula)}">${C.esc(opNombre(p.cedula))}</span></td><td class="num">${C.fmt0(p.cantidad)}</td><td class="num">${C.fmt(p.proceso / 60, 1)} h</td><td class="num ${efClase(p.ef)}">${pct(p.ef)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Sin personas.</td></tr>'}
      </tbody></table></div></div>`
    // Igual que la vista general del turno: cada operación hora por hora, con el acumulado
    // y el color de la referencia trabajada en cada hora.
    const colorHoja = new Map(X.hojas.map((h, k) => [h.id, COLORES[k % COLORES.length]]))
    const filas = d.lista.map(o => ({ ...o, personas: o.personas.size, cuello: d.cuello && d.cuello.operacion === o.operacion }))
    return `<div class="section bh-planta">${cab}
      ${X.hojas.length ? `<div class="bh-leyenda" style="margin-bottom:6px">${X.hojas.map(h => `<span><i style="background:${colorHoja.get(h.id)}"></i>${C.esc(h.codigo)} · ${C.esc(C.m1.codeInfo(h.codigo).cliente || '')}</span>`).join('')}</div>` : ''}
      ${filas.length ? tablaMapa(filas, d.horas, colorHoja, false) : '<div class="empty">Aún no hay operaciones.</div>'}</div>`
  }).join('')).join('')}${aviso}`
}

// Personas: la eficiencia de cada operario en todos los turnos del día.
// Se suma en minutos: tiempo estándar de lo que hizo ÷ tiempo que tuvo disponible.
function pintarPersonasDia(turnos, dia) {
  const m = new Map()
  const get = (ced, t) => {
    let p = m.get(ced)
    if (!p) { p = { cedula: ced, lineas: new Set(), sups: new Set(), ops: [], total: 0, ganado: 0, disp: 0, horas: new Set() }; m.set(ced, p) }
    p.lineas.add(t.linea); if (t.supervisor_cedula) p.sups.add(t.supervisor_cedula)
    return p
  }
  turnos.forEach(t => {
    const X = dia.get(t.id); if (!X) return
    if (esPT(t.linea)) {
      resumenPT(X).personas.forEach(r => {
        const p = get(r.cedula, t)
        p.ops.push({ op: lineaTxt(t.linea), ef: r.ef }); p.total += r.cantidad; p.ganado += r.std; p.disp += r.proceso
        for (let k = 0; k < Math.round(r.proceso / 60); k++) p.horas.add(t.id + '|pt' + k)
      })
      return
    }
    const slots = slotsTurno(t.turno, t.fecha)
    X.asig.forEach(a => {
      const b = X.bloques.find(x => x.id === a.bloque_id); if (!b) return
      const r = resumenAsig(a, b, X), p = get(a.cedula, t)
      slots.forEach(h => { if (horaRegistrada(regX(X, a.id, h.i))) p.horas.add(t.id + '|' + h.i) })
      p.ops.push({ op: b.operacion, ef: r.ef, turnoMeta: b.meta_origen === 'turno' })
      p.total += r.total
      if (r.esperado) { p.ganado += r.total / r.esperado * r.disp; p.disp += r.disp }
    })
  })
  const todas = [...m.values()].map(p => ({ ...p, ef: p.disp ? p.ganado / p.disp : null }))
  const lineas = [...new Set(todas.flatMap(p => [...p.lineas]))].sort((a, b) => ordenLinea(a) - ordenLinea(b))
  const sups = [...new Set(todas.flatMap(p => [...p.sups]))]
  const lista = todas.filter(p => (!filtroPers.linea || p.lineas.has(filtroPers.linea)) && (!filtroPers.sup || p.sups.has(filtroPers.sup)))
    .sort((a, b) => filtroPers.orden === 'peor' ? (a.ef ?? 9) - (b.ef ?? 9) : filtroPers.orden === 'nombre' ? opNombre(a.cedula).localeCompare(opNombre(b.cedula)) : (b.ef ?? -1) - (a.ef ?? -1))
  const conEf = lista.filter(p => p.disp)
  const efG = conEf.length ? conEf.reduce((s, p) => s + p.ganado, 0) / conEf.reduce((s, p) => s + p.disp, 0) : null
  return `
  <div class="controls">
    <select data-filtro="linea"><option value="">Todas las líneas</option>${lineas.map(l => `<option value="${C.esc(l)}" ${l === filtroPers.linea ? 'selected' : ''}>${C.esc(lineaTxt(l))}</option>`).join('')}</select>
    <select data-filtro="sup"><option value="">Todos los supervisores</option>${sups.map(c => `<option value="${C.esc(c)}" ${c === filtroPers.sup ? 'selected' : ''}>${C.esc(supNombre(c))}</option>`).join('')}</select>
    <select data-filtro="orden"><option value="mejor" ${filtroPers.orden === 'mejor' ? 'selected' : ''}>De mejor a peor</option><option value="peor" ${filtroPers.orden === 'peor' ? 'selected' : ''}>De peor a mejor</option><option value="nombre" ${filtroPers.orden === 'nombre' ? 'selected' : ''}>Por nombre</option></select>
  </div>
  <div class="grid kpis" style="margin-bottom:12px">
    <div class="kpi"><div class="label">Personas</div><div class="value">${lista.length}</div></div>
    <div class="kpi"><div class="label">Eficiencia del grupo</div><div class="value ${efClase(efG)}">${pct(efG)}</div></div>
    <div class="kpi"><div class="label">En 90 % o más</div><div class="value">${lista.filter(p => p.ef != null && p.ef >= 0.9).length}<small style="font-size:14px;color:var(--muted)"> / ${lista.length}</small></div></div>
  </div>
  <div class="section" style="padding:10px"><div class="tablebox"><table class="bh-pers">
    <thead><tr><th>#</th><th>Operario</th><th>Línea</th><th>Operaciones</th><th class="num">Horas</th><th class="num">Producido</th><th>Eficiencia</th></tr></thead>
    <tbody>${lista.map((p, k) => `<tr>
      <td class="muted">${k + 1}</td>
      <td><span class="bh-nombre" data-a="verMarcador" data-c="${C.esc(p.cedula)}" title="Abrir Mi Marcador">${C.esc(opNombre(p.cedula))}</span><div class="muted" style="font-size:11px">${C.esc([...p.sups].map(supNombre).join(' · '))}</div></td>
      <td class="muted">${C.esc([...p.lineas].map(lineaTxt).join(', '))}</td>
      <td>${p.ops.map(o => `<span class="bh-pop">${C.esc(o.op)} <b class="${efClase(o.ef)}">${o.turnoMeta && o.ef == null ? 'al cierre' : pct(o.ef)}</b></span>`).join('')}</td>
      <td class="num">${p.horas.size}</td><td class="num"><b>${C.fmt0(p.total)}</b></td>
      <td><div class="bh-efbar"><i class="${efClase(p.ef)}" style="width:${Math.min(100, Math.round((p.ef || 0) * 100))}%"></i><b class="${efClase(p.ef)}">${pct(p.ef)}</b></div></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No hay personas en los turnos de este día.</td></tr>'}</tbody>
  </table></div>
  <div class="count">Eficiencia del día: lo que hizo cada persona frente a su meta, en el tiempo que tuvo disponible, sumando todos sus turnos y operaciones. Toca el nombre para abrir su Mi Marcador.</div></div>`
}

/* ---------- turnos sin terminar ---------- */
// Un turno queda "sin terminar" si ya pasó su hora de salida y sigue en curso.
function finTurno(t) {
  const def = CAT.turnos.find(d => d.codigo === t.turno); if (!def) return null
  const fin = new Date(`${t.fecha}T${String(def.fin).slice(0, 5)}:00`)
  if (hNum(def.fin) <= hNum(def.inicio)) fin.setDate(fin.getDate() + 1)   // turnos de noche terminan al otro día
  return fin
}
// Del supervisor que se indique; sin cédula (admin), los de todos.
async function turnosSinTerminar(cedula) {
  const { data } = await C.supabase.from('bh_turnos').select('*').eq('estado', 'abierto').order('fecha')
  const ahora = Date.now()
  return (data || []).filter(t => { const f = finTurno(t); return f && f.getTime() < ahora })
    .filter(t => !cedula || t.supervisor_cedula === cedula || t.supervisor2_cedula === cedula)
}
const MSG_RAPIDO = 'Es rápido: solo escribe lo que se fabricó y dale <b>Terminar</b>.'
const listaPendientes = (ts, conSup) => ts.map(t => `<button class="btn sm" data-a="abrir" data-id="${t.id}">${C.esc(lineaTxt(t.linea))} · T${C.esc(t.turno)} · ${fechaTxt(t.fecha)}${conSup ? ` · <span class="muted">${C.esc(supNombre(t.supervisor_cedula) || 'sin supervisor')}</span>` : ''}</button>`).join(' ')
function avisoPendientes(ts, propios) {
  if (!ts.length) return ''
  return `<div class="banner bh-pend"><b>${propios ? `Tienes ${ts.length} turno${ts.length > 1 ? 's' : ''} sin terminar` : `Hay ${ts.length} turno${ts.length > 1 ? 's' : ''} sin terminar`}.</b> ${MSG_RAPIDO}
    <div class="controls" style="margin:8px 0 0">${listaPendientes(ts, !propios)}</div></div>`
}

// Para el admin: un resumen corto al final (cuántos y de quién), que se abre al tocarlo.
function resumenPendientesAdmin(ts) {
  if (!ts.length) return ''
  const porSup = new Map()
  ts.forEach(t => { const k = supNombre(t.supervisor_cedula) || 'Sin supervisor'; porSup.set(k, (porSup.get(k) || 0) + 1) })
  return `<details class="bh-pend-res"><summary><b>${ts.length}</b> turno${ts.length > 1 ? 's' : ''} sin terminar · ${[...porSup.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${C.esc(n)} ${c}`).join(' · ')}</summary>
    <div class="controls" style="margin:8px 0 0">${listaPendientes(ts, true)}</div></details>`
}

function modalNuevoTurno() {
  const p = C.perfil() || {}
  const sups = CAT.supervisores.filter(s => s.activo)
  const opt = (sel) => `<option value="">—</option>` + sups.map(s => `<option value="${s.cedula}" ${s.cedula === sel ? 'selected' : ''}>${C.esc(nombreCorto(s.nombre))}</option>`).join('')
  C.openModal(`<h3>Abrir turno</h3>
    <div class="field"><label>Fecha (los turnos de noche llevan la fecha en que inician)</label><input type="date" id="nt-fecha" value="${fechaLista}"></div>
    <div class="field"><label>Turno</label><select id="nt-turno">${CAT.turnos.map(t => `<option value="${t.codigo}">${C.esc(turnoTxt(t.codigo))}</option>`).join('')}</select></div>
    <div class="field"><label>Línea</label><select id="nt-linea">${LINEAS.map(l => `<option value="${l.v}">${l.t}</option>`).join('')}</select></div>
    <div class="field"><label>Supervisor</label><select id="nt-sup">${opt(p.supervisor_cedula)}</select></div>
    <div class="field"><label>Segundo supervisor (opcional)</label><select id="nt-sup2">${opt('')}</select></div>
    <div class="field" id="nt-metabox"><label>Meta del turno (sacos de la línea)</label><input type="number" id="nt-meta" inputmode="numeric" min="1" step="1" placeholder="Ej: 300"></div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn go" id="nt-ok">Abrir</button></div>`)
  // Prensa y Liner se miden por persona con su meta fija: no llevan meta del turno.
  const linSel = document.getElementById('nt-linea')
  linSel.addEventListener('change', () => { document.getElementById('nt-metabox').hidden = esPT(linSel.value) })
  document.getElementById('nt-ok').addEventListener('click', async () => {
    const fila = {
      id: uid(), fecha: document.getElementById('nt-fecha').value || hoyISO(),
      turno: document.getElementById('nt-turno').value, linea: document.getElementById('nt-linea').value,
      supervisor_cedula: document.getElementById('nt-sup').value || null,
      supervisor2_cedula: document.getElementById('nt-sup2').value || null,
      meta_turno: +document.getElementById('nt-meta').value || null,
    }
    if (!fila.supervisor_cedula) { C.toast('Elige el supervisor.'); return }
    if (esPT(fila.linea)) fila.meta_turno = null
    else if (!fila.meta_turno || fila.meta_turno <= 0) { C.toast('Escribe la meta del turno.'); return }
    // Si ese turno ya existe (lo abrió otro supervisor), se abre el mismo.
    const { data: ya } = await C.supabase.from('bh_turnos').select('id').match({ fecha: fila.fecha, turno: fila.turno, linea: fila.linea }).maybeSingle()
    if (ya) { C.closeModal(); C.toast('Ese turno ya estaba abierto: te llevo a él.'); fechaLista = fila.fecha; await abrirTurno(ya.id); return }
    const abrir = () => {
      C.closeModal()
      T = { turno: { ...fila, estado: 'abierto', observaciones: '' }, hojas: [], bloques: [], asig: [], regs: new Map(), pt: [], ptp: [] }
      fechaLista = fila.fecha
      encolar('bh_turnos', 'upsert', fila)
      vista = 'turno'; vistaTurno = 'hojas'; hojaActual = null; guardarCopia(); pintarTurno()
      if (esPT(fila.linea)) modalPersonasPT(); else modalReferencia()
    }
    let pend = []
    try { pend = await turnosSinTerminar(fila.supervisor_cedula) } catch (e) { pend = [] }
    if (!pend.length) return abrir()
    C.openModal(`<h3>Antes de abrir este turno</h3>
      <div class="hint" style="color:var(--muted);font-size:13.5px;line-height:1.5;margin-bottom:10px"><b>${C.esc(supNombre(fila.supervisor_cedula))}</b>, tienes <b>${pend.length} turno${pend.length > 1 ? 's' : ''} sin terminar</b>. ${MSG_RAPIDO}</div>
      <div class="controls" style="margin:0 0 6px">${listaPendientes(pend)}</div>
      <div class="modal-actions"><button class="btn ghost" id="nt-igual">Abrir igual</button></div>`)
    document.getElementById('nt-igual').addEventListener('click', abrir)
    // Los botones de cada turno usan data-a="abrir"; el modal está fuera del módulo, así que se atienden aquí.
    document.querySelectorAll('.modal [data-a="abrir"]').forEach(x => x.addEventListener('click', async () => { C.closeModal(); await abrirTurno(x.dataset.id) }))
  })
}

/* ---------- vista: turno ---------- */
async function abrirTurno(id) {
  el.innerHTML = '<div class="loading">Abriendo turno…</div>'
  try { await cargarTurno(id) } catch (e) { console.error(e); C.toast('No se pudo abrir el turno.'); return pintarLista() }
  if (vista !== 'turno') vistaTurno = 'hojas'
  vista = 'turno'
  if (!T.hojas.some(h => h.id === hojaActual)) hojaActual = T.hojas[0] ? T.hojas[0].id : null
  pintarTurno()
}

function pintarTurno() {
  if (!T) return pintarLista()
  const t = T.turno, ed = puedeEditar()
  if (!T.hojas.some(h => h.id === hojaActual)) hojaActual = T.hojas[0] ? T.hojas[0].id : null
  const hoja = T.hojas.find(h => h.id === hojaActual)
  el.innerHTML = `
  <div class="bh-head">
    <div>
      <button class="btn ghost sm" data-a="volver">← Turnos</button>
      <h2 style="margin-top:8px">${C.esc(lineaTxt(t.linea))} · ${C.esc(turnoTxt(t.turno))}</h2>
      <div class="hint">${fechaTxt(t.fecha)} · ${C.esc([supNombre(t.supervisor_cedula), supNombre(t.supervisor2_cedula)].filter(Boolean).join(' y '))}
        · <span class="pill ${t.estado === 'abierto' ? 'si' : 'man'}">${t.estado === 'abierto' ? 'En curso' : 'Terminado'}</span>
        ${!ed ? ' · <b>solo lectura</b>' : ''}</div>
    </div>
    <div class="controls" style="margin:0">
      ${ed && t.estado === 'abierto' ? '<button class="btn go" data-a="terminar">✓ Terminar Bi-horario</button>' : ''}
      ${ed && t.estado === 'terminado' ? '<button class="btn" data-a="terminar">Editar cierre</button>' : ''}
      ${ed ? '<button class="btn ghost" data-a="editarTurno">✎ Editar turno</button>' : ''}
      ${C.role() === 'admin' ? '<button class="btn ghost danger" data-a="eliminarTurno">Eliminar turno</button>' : ''}
    </div>
  </div>
  ${esPT(t.linea) ? pintarPT(ed) + (t.observaciones ? `<div class="section"><h2>Observaciones</h2><div style="white-space:pre-wrap">${C.esc(t.observaciones)}</div></div>` : '') : `
  <div class="bh-meta-turno">
    <span>Meta del turno: <b>${t.meta_turno ? C.fmt0(t.meta_turno) : '—'}</b> sacos</span>
    ${ed ? '<button class="btn sm ghost" data-a="metaTurno">✎</button>' : ''}
    ${t.estado === 'terminado' && T.hojas.some(h => h.unidades_reportadas != null) ? `<span>· Fabricado: <b>${C.fmt0(T.hojas.reduce((s, h) => s + (+h.unidades_reportadas || 0), 0))}</b>${calificacionTurno(T) != null ? ` (<b class="${efClase(calificacionTurno(T))}">${pct(calificacionTurno(T))}</b>)` : ''}</span>` : ''}
  </div>
  <div class="bh-hojas">
    ${T.hojas.length ? `<button class="bh-hoja vista ${vistaTurno === 'general' ? 'on' : ''}" data-a="vistaGeneral"><b>▦ Vista general</b><span>Todo el turno por operación</span></button>` : ''}
    ${T.asig.length ? `<button class="bh-hoja vista ${vistaTurno === 'personas' ? 'on' : ''}" data-a="vistaPersonas"><b>% Eficiencia por persona</b><span>Cómo va cada operario</span></button>` : ''}
    ${T.hojas.map((h, i) => { const c = C.m1.codeInfo(h.codigo); return `<button class="bh-hoja ${vistaTurno === 'hojas' && h.id === hojaActual ? 'on' : ''}" data-a="hoja" data-id="${h.id}" style="border-left:4px solid ${COLORES[i % COLORES.length]}"><b class="mono">${C.esc(h.codigo)}</b><span>${C.esc(c.cliente || '')}</span></button>` }).join('')}
    ${ed ? '<button class="bh-hoja add" data-a="referencia">+ Referencia</button>' : ''}
  </div>
  ${vistaTurno === 'personas' && T.asig.length ? pintarPersonas()
    : vistaTurno === 'general' && T.hojas.length ? pintarGeneral()
    : hoja ? pintarHoja(hoja, ed) : `<div class="empty">${ed ? 'Agrega la referencia (código del saco) que se va a trabajar.' : 'Este turno no tiene referencias.'}</div>`}
  ${t.observaciones ? `<div class="section"><h2>Observaciones</h2><div style="white-space:pre-wrap">${C.esc(t.observaciones)}</div></div>` : ''}`}`
}

/* ---------- Prensa y Liner (producto terminado) ---------- */
// Minutos de trabajo que lleva el turno: todo el turno si ya terminó; si está
// abierto, hasta ahora (sin contar la hora de almuerzo de los turnos de 12 h).
function minutosTurno(X) {
  const slots = slotsTurno(X.turno.turno, X.turno.fecha), horas = horasTurno(X.turno.turno, X.turno.fecha, X)
  const total = horas.length * 60
  const def = CAT.turnos.find(t => t.codigo === X.turno.turno)
  if (X.turno.estado !== 'abierto' || !def) return total
  const domingo = new Date(X.turno.fecha + 'T12:00:00').getDay() === 0
  const ini = String(domingo && def.inicio_domingo ? def.inicio_domingo : def.inicio)
  const inicio = new Date(`${X.turno.fecha}T${ini.slice(0, 5)}:00`)
  let pasados = (Date.now() - inicio.getTime()) / 60000
  const almuerzo = slots.length > horas.length ? slots.find(s => !horas.includes(s)) : null
  if (almuerzo) pasados = pasados > (almuerzo.i + 1) * 60 ? pasados - 60 : Math.min(pasados, almuerzo.i * 60)
  return Math.max(0, Math.min(total, Math.round(pasados)))
}
// Eficiencia por persona = tiempo estándar de lo que hizo ÷ tiempo que estuvo en el proceso.
function resumenPT(X) {
  const minTurno = minutosTurno(X)
  const personas = [...(X.ptp || [])].sort((a, b) => a.orden - b.orden).map(p => {
    const prod = (X.pt || []).filter(r => r.cedula === p.cedula)
    const std = prod.reduce((s, r) => s + (+r.cantidad || 0) / +r.meta_hora * 60, 0)
    const proceso = Math.max(0, minTurno - (+p.min_fuera || 0))
    return { ...p, prod, std, proceso, cantidad: prod.reduce((s, r) => s + (+r.cantidad || 0), 0), ef: proceso ? std / proceso : null }
  })
  const porTipo = (PT_METAS[X.turno.linea] || []).map(([v, t, meta]) => ({ v, t, meta, cantidad: (X.pt || []).filter(r => r.presentacion === v).reduce((s, r) => s + (+r.cantidad || 0), 0) })).filter(p => p.cantidad)
  const std = personas.reduce((s, p) => s + p.std, 0), proceso = personas.reduce((s, p) => s + p.proceso, 0)
  return { minTurno, personas, porTipo, ef: proceso ? std / proceso : null, fuera: personas.reduce((s, p) => s + (+p.min_fuera || 0), 0) }
}
const horasTxt = min => C.fmt(min / 60, min % 60 ? 1 : 0) + ' h'
function pintarPT(ed) {
  const r = resumenPT(T)
  const metas = PT_METAS[T.turno.linea].map(([, t, m]) => `${t.toLowerCase()} ${m}/h`).join(' · ')
  const tit = T.turno.linea === 'PRENSA' ? 'prensado' : 'enlainado'
  return `
  <div class="bh-hoja-bar">
    <div class="hint" style="margin:0">Cada persona anota lo que hizo. Meta: <b>${metas}</b>. ${T.turno.estado === 'abierto' ? `Lleva <b>${horasTxt(r.minTurno)}</b> de turno.` : `Turno de <b>${horasTxt(r.minTurno)}</b>.`}</div>
    ${ed ? '<button class="btn go" data-a="ptPersona">+ Persona</button>' : ''}
  </div>
  <div class="grid kpis" style="margin-bottom:12px">
    <div class="kpi"><div class="label">Total ${tit}</div><div class="value">${C.fmt0(r.personas.reduce((s, p) => s + p.cantidad, 0))}</div>
      <div class="sub">${r.porTipo.map(p => `${p.t}: ${C.fmt0(p.cantidad)}`).join(' · ') || 'Sin producción'}</div></div>
    <div class="kpi"><div class="label">Personas</div><div class="value">${r.personas.length}</div></div>
    <div class="kpi"><div class="label">Eficiencia del grupo</div><div class="value ${efClase(r.ef)}">${pct(r.ef)}</div></div>
  </div>
  ${r.personas.map(p => {
    const c = p.causa && causa(p.causa)
    return `<div class="section bh-bloque">
    <div class="bh-bloque-head">
      <div><h2 style="margin:0"><span class="bh-nombre" data-a="verMarcador" data-c="${C.esc(p.cedula)}" title="Abrir Mi Marcador">${C.esc(opNombre(p.cedula))}</span></h2>
        <div class="hint" style="margin:0">En el proceso <b>${horasTxt(p.proceso)}</b>${+p.min_fuera ? ` · fuera <b>${p.min_fuera} min</b>${c ? ' (' + C.esc(c.corta || c.descripcion) + ')' : ''}` : ''}
          · Hizo <b>${C.fmt0(p.cantidad)}</b> · Eficiencia <b class="${efClase(p.ef)}">${pct(p.ef)}</b></div></div>
      ${ed ? `<div class="controls" style="margin:0"><button class="btn sm go" data-a="ptProd" data-c="${C.esc(p.cedula)}">+ Producción</button>
        <button class="btn sm ghost" data-a="ptFuera" data-c="${C.esc(p.cedula)}">Tiempo fuera</button>
        <button class="btn sm ghost danger" data-a="ptQuitar" data-c="${C.esc(p.cedula)}">Quitar</button></div>` : ''}
    </div>
    ${p.prod.length ? `<div class="tablebox"><table><thead><tr><th>Referencia</th><th>Cliente</th><th>Presentación</th><th class="num">Cantidad</th><th class="num">Meta/h</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>
      ${p.prod.map(x => `<tr><td class="mono">${C.esc(x.codigo || '—')}</td><td class="muted">${C.esc(x.codigo ? C.m1.codeInfo(x.codigo).cliente || '' : '')}</td>
        <td>${C.esc((PT_METAS[T.turno.linea].find(m => m[0] === x.presentacion) || [, x.presentacion])[1])}</td><td class="num"><b>${C.fmt0(x.cantidad)}</b></td><td class="num muted">${C.fmt0(x.meta_hora)}</td>
        ${ed ? `<td><button class="bh-x" title="Borrar" data-a="ptBorrar" data-id="${x.id}">×</button></td>` : ''}</tr>`).join('')}
    </tbody></table></div>` : `<div class="muted" style="font-size:13px">${ed ? 'Toca "+ Producción" para anotar lo que hizo.' : 'Sin producción anotada.'}</div>`}
  </div>` }).join('') || `<div class="empty">${ed ? 'Agrega a las personas que trabajan en este turno.' : 'Sin personas.'}</div>`}`
}
function modalPersonasPT() {
  const ya = new Set((T.ptp || []).map(p => p.cedula))
  const elegidos = new Set()
  const linea = T.turno.linea
  C.openModal(`<h3>Personas en ${C.esc(lineaTxt(linea))}</h3>
    <input class="search" style="width:100%" type="search" id="pp-q" placeholder="Buscar por nombre o cédula…" autocomplete="off">
    <div class="hlist" id="pp-res"></div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button> <button class="btn go" id="pp-ok">Agregar (0)</button></div>`, true)
  const draw = q => {
    const n = q.trim().toLowerCase()
    const lista = CAT.operarios.filter(o => o.activo && !ya.has(o.cedula) && (!n || (o.nombre + ' ' + o.cedula).toLowerCase().includes(n)))
      .sort((x, y) => ((y.linea === linea) - (x.linea === linea)) || x.nombre.localeCompare(y.nombre)).slice(0, 150)
    document.getElementById('pp-res').innerHTML = `<table><tbody>${lista.map(o => `<tr class="bh-pick ${elegidos.has(o.cedula) ? 'on' : ''}" data-ced="${o.cedula}">
      <td style="width:30px"><input type="checkbox" ${elegidos.has(o.cedula) ? 'checked' : ''} tabindex="-1"></td>
      <td>${C.esc(nombreCorto(o.nombre))}<div class="muted" style="font-size:11.5px">${C.esc(o.nombre)}</div></td>
      <td class="muted" style="font-size:12px">${C.esc(lineaTxt(o.linea))}</td></tr>`).join('') || '<tr><td class="empty">Sin resultados</td></tr>'}</tbody></table>`
  }
  draw('')
  const q = document.getElementById('pp-q'); setTimeout(() => q.focus(), 50)
  q.addEventListener('input', e => draw(e.target.value))
  document.getElementById('pp-res').addEventListener('click', e => {
    const tr = e.target.closest('[data-ced]'); if (!tr) return
    const c = tr.dataset.ced; elegidos.has(c) ? elegidos.delete(c) : elegidos.add(c)
    tr.classList.toggle('on', elegidos.has(c)); tr.querySelector('input').checked = elegidos.has(c)
    document.getElementById('pp-ok').textContent = `Agregar (${elegidos.size})`
  })
  document.getElementById('pp-ok').addEventListener('click', () => {
    let orden = (T.ptp || []).length
    elegidos.forEach(ced => cambio('bh_pt_personas', 'upsert', { id: uid(), turno_id: T.turno.id, cedula: ced, min_fuera: 0, causa: null, nota: '', orden: orden++ }))
    C.closeModal(); pintarTurno()
  })
}
// Producción de una persona: referencia (las trabajadas en la planta los últimos
// 2 días salen primero), presentación (prensa: pallet o bulto) y cantidad.
async function modalProduccionPT(ced) {
  const linea = T.turno.linea, metas = PT_METAS[linea]
  let codigo = null, pres = metas[0][0]
  C.openModal(`<h3>Producción · ${C.esc(opNombre(ced))}</h3>
    <div class="field"><label>Referencia</label>
      <input class="search" style="width:100%" type="search" id="pr-q" placeholder="Buscar código o cliente…" autocomplete="off">
      <div class="hlist" id="pr-res" style="max-height:240px"><div class="muted" style="padding:10px">Cargando las referencias de los últimos 2 días…</div></div>
      <div class="hint" id="pr-sel" style="margin-top:6px">Sin referencia elegida (se puede guardar solo la cantidad).</div></div>
    ${metas.length > 1 ? `<div class="field"><label>Presentación</label><div class="bh-chips" id="pr-pres">${metas.map(([v, t, m]) => `<button type="button" class="bh-chip ${v === pres ? 'on' : ''}" data-p="${v}">${t} · ${m}/h</button>`).join('')}</div></div>` : ''}
    <div class="field"><label>Cantidad</label><input type="number" id="pr-cant" inputmode="numeric" min="0" step="1" class="bh-num" placeholder="0"></div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn go" id="pr-ok">Guardar</button></div>`, true)
  // Referencias trabajadas en la planta en los últimos 2 días (cualquier línea).
  let recientes = []
  try {
    const d = new Date(T.turno.fecha + 'T12:00:00'); d.setDate(d.getDate() - 2)
    const desde = d.toISOString().slice(0, 10)
    const { data: ts } = await C.supabase.from('bh_turnos').select('id').gte('fecha', desde).lte('fecha', T.turno.fecha)
    const ids = (ts || []).map(t => t.id)
    if (ids.length) {
      const [h, p] = await Promise.all([C.supabase.from('bh_hojas').select('codigo').in('turno_id', ids), C.supabase.from('bh_pt').select('codigo').in('turno_id', ids)])
      recientes = [...new Set([...(h.data || []), ...(p.data || [])].map(x => x.codigo).filter(Boolean))]
    }
  } catch (e) { recientes = [] }
  const res = document.getElementById('pr-res'); if (!res) return
  const draw = q => {
    const n = q.trim().toLowerCase()
    const todos = C.m1.codigos()
    const match = c => !n || (c.codigo + ' ' + (c.cliente || '') + ' ' + (c.descripcion || '')).toLowerCase().includes(n)
    const rec = recientes.map(k => todos.find(c => c.codigo === k) || { codigo: k, cliente: '' }).filter(match)
    const otros = n ? todos.filter(c => !recientes.includes(c.codigo) && match(c)).slice(0, 60) : []
    const fila = c => `<tr class="bh-pick ${c.codigo === codigo ? 'on' : ''}" data-ref="${C.esc(c.codigo)}"><td class="codecell">${C.esc(c.codigo)}</td><td class="muted" style="font-size:12px">${C.esc(c.cliente || '')}</td></tr>`
    res.innerHTML = `<table><tbody>
      ${rec.length ? `<tr><td colspan="2" class="muted" style="font-size:11.5px;padding-top:8px">Trabajadas en los últimos 2 días</td></tr>${rec.map(fila).join('')}` : ''}
      ${otros.length ? `<tr><td colspan="2" class="muted" style="font-size:11.5px;padding-top:8px">Otras referencias</td></tr>${otros.map(fila).join('')}` : ''}
      ${!rec.length && !otros.length ? `<tr><td class="empty">${n ? 'Sin resultados' : 'No hay referencias de los últimos 2 días: búscala.'}</td></tr>` : ''}</tbody></table>`
  }
  draw('')
  document.getElementById('pr-q').addEventListener('input', e => draw(e.target.value))
  res.addEventListener('click', e => {
    const x = e.target.closest('[data-ref]'); if (!x) return
    codigo = codigo === x.dataset.ref ? null : x.dataset.ref
    const info = codigo ? C.m1.codeInfo(codigo) : null
    document.getElementById('pr-sel').innerHTML = codigo ? `Referencia: <b class="mono">${C.esc(codigo)}</b> ${C.esc(info && info.cliente || '')}` : 'Sin referencia elegida (se puede guardar solo la cantidad).'
    draw(document.getElementById('pr-q').value)
    document.getElementById('pr-cant').focus()
  })
  const pp = document.getElementById('pr-pres')
  if (pp) pp.addEventListener('click', e => { const x = e.target.closest('[data-p]'); if (!x) return; pres = x.dataset.p; pp.querySelectorAll('[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === pres)) })
  document.getElementById('pr-ok').addEventListener('click', () => {
    const cantidad = +document.getElementById('pr-cant').value
    if (!cantidad || cantidad <= 0) { C.toast('Escribe la cantidad.'); document.getElementById('pr-cant').focus(); return }
    const meta = metas.find(m => m[0] === pres)[2]
    cambio('bh_pt', 'upsert', { id: uid(), turno_id: T.turno.id, cedula: ced, codigo, presentacion: pres, cantidad, meta_hora: meta, created_at: new Date().toISOString() })
    C.closeModal(); pintarTurno()
  })
}
// Tiempo fuera del proceso: manualidad (no había material) o tiempo muerto.
// No cuenta en contra: se descuenta del tiempo con el que se mide a la persona.
function modalFueraPT(ced) {
  const p = (T.ptp || []).find(x => x.cedula === ced); if (!p) return
  let min = +p.min_fuera || 0, cau = p.causa || 'MAN'
  const rapidas = CAT.causas.filter(c => c.rapida && c.tipo !== 'tardanza')
  C.openModal(`<h3>Tiempo fuera · ${C.esc(opNombre(ced))}</h3>
    <div class="hint" style="color:var(--muted);font-size:12.5px;margin-bottom:10px">El tiempo que no estuvo en ${T.turno.linea === 'PRENSA' ? 'prensa' : 'liner'} (por ejemplo, no había sacos y se fue a manualidad). No le cuenta en contra.</div>
    <div class="field"><label>Minutos</label><div class="bh-chips" id="fu-min">${[0, 30, 60, 120, 180, 240].map(m => `<button type="button" class="bh-chip ${m === min ? 'on' : ''}" data-m="${m}">${m === 0 ? 'Nada' : m < 60 ? m + ' min' : m / 60 + ' h'}</button>`).join('')}
      <input type="number" id="fu-x" min="0" max="720" step="5" placeholder="otro" style="width:80px" value="${[0, 30, 60, 120, 180, 240].includes(min) ? '' : min}"></div></div>
    <div class="field"><label>Motivo</label><div class="bh-chips" id="fu-cau">${rapidas.map(c => `<button type="button" class="bh-chip ${c.tipo} ${c.codigo === cau ? 'on' : ''}" data-c="${c.codigo}">${C.esc(c.corta || c.descripcion)}</button>`).join('')}</div></div>
    <div class="field"><label>Nota (opcional)</label><input type="text" id="fu-nota" value="${C.esc(p.nota || '')}" placeholder="Ej: apoyo en corte"></div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn go" id="fu-ok">Guardar</button></div>`)
  const marcar = () => {
    document.querySelectorAll('#fu-min [data-m]').forEach(b => b.classList.toggle('on', +b.dataset.m === min))
    document.querySelectorAll('#fu-cau [data-c]').forEach(b => b.classList.toggle('on', b.dataset.c === cau))
  }
  document.getElementById('fu-min').addEventListener('click', e => { const x = e.target.closest('[data-m]'); if (!x) return; min = +x.dataset.m; document.getElementById('fu-x').value = ''; marcar() })
  document.getElementById('fu-x').addEventListener('input', e => { min = Math.max(0, Math.min(720, +e.target.value || 0)); marcar() })
  document.getElementById('fu-cau').addEventListener('click', e => { const x = e.target.closest('[data-c]'); if (!x) return; cau = x.dataset.c; marcar() })
  document.getElementById('fu-ok').addEventListener('click', () => {
    cambio('bh_pt_personas', 'upsert', { ...p, min_fuera: min, causa: min ? cau : null, nota: document.getElementById('fu-nota').value.trim() })
    C.closeModal(); pintarTurno()
  })
}

/* ---------- mapa: una sola tabla por operación (vista general y hoja contraída) ---------- */
// Promedio de las horas con producción y proyección al cierre del turno.
function proyectar(porHora, horas) {
  const conDato = porHora.map((v, i) => v ? i : -1).filter(i => i >= 0)
  const total = porHora.reduce((s, v) => s + v, 0)
  if (!conDato.length) return { prom: 0, proyeccion: null }
  const prom = total / conDato.length
  const ultima = conDato[conDato.length - 1]
  return { prom, proyeccion: Math.round(total + prom * horas.filter(h => h.i > ultima).length) }
}
// Fondo de la casilla con el color de la referencia; si en esa hora hubo dos, se parte en franjas.
function fondoCelda(ids, colorHoja) {
  const cs = [...ids].map(id => colorHoja.get(id) + '4d')
  if (!cs.length) return ''
  if (cs.length === 1) return `background:${cs[0]}`
  const paso = 100 / cs.length
  return `background:linear-gradient(90deg,${cs.map((c, i) => `${c} ${i * paso}% ${(i + 1) * paso}%`).join(',')})`
}
// filas: [{ operacion, meta, porHora, acum, hojasHora, total, personas, ef, turnoMeta, cuello, bloqueId }]
function tablaMapa(filas, horas, colorHoja, conMeta) {
  return `
  <div class="section bh-bloque bh-mapa" style="padding:10px">
    <div class="tablebox bh-grid"><table>
      <thead><tr><th class="bh-op">Operación</th>${conMeta ? '<th class="num">Meta/h</th>' : ''}${horas.map(h => `<th class="num">${h.label}</th>`).join('')}<th class="num">Total</th><th class="num">Pers.</th><th class="num">Efic.</th>${verProyeccion ? '<th class="num">Proyección</th>' : ''}</tr></thead>
      <tbody>${filas.map(o => { const p = proyectar(o.porHora, horas); return `<tr class="${o.cuello ? 'bh-fila-cuello' : ''}">
        <td class="bh-op">${o.bloqueId ? `<span class="bh-nombre" data-a="verBloque" data-id="${o.bloqueId}" title="Ver el detalle de esta operación">${C.esc(o.operacion)}</span>` : `<span>${C.esc(o.operacion)}</span>`}</td>
        ${conMeta ? `<td class="num muted">${C.esc(o.meta)}</td>` : ''}
        ${horas.map(h => `<td class="num bh-gcel" style="${fondoCelda(o.hojasHora[h.i], colorHoja)}">${o.porHora[h.i] ? `<span class="bh-u">${C.fmt0(o.porHora[h.i])}</span><span class="bh-ac">${C.fmt0(o.acum[h.i])}</span>` : ''}</td>`).join('')}
        <td class="num"><b>${C.fmt0(o.total)}</b></td><td class="num">${o.personas}</td>
        <td class="num ${efClase(o.ef)}">${o.turnoMeta && o.ef == null ? '<small>al cierre</small>' : pct(o.ef)}</td>
        ${verProyeccion ? `<td class="num bh-proy">${p.proyeccion != null ? `≈ <b>${C.fmt0(p.proyeccion)}</b><small>${C.fmt(p.prom, 1)}/h</small>` : '—'}</td>` : ''}
      </tr>` }).join('') || `<tr><td colspan="${horas.length + 5}" class="empty">Aún no hay operaciones.</td></tr>`}</tbody>
    </table></div>
    <div class="count">Cada casilla: arriba lo de la hora, abajo el acumulado.${colorHoja.size > 1 ? ' El color indica la referencia trabajada en esa hora.' : ''}${verProyeccion ? ' La proyección supone que se sigue al mismo promedio por hora (de las horas trabajadas) hasta el final del turno.' : ''}</div>
  </div>`
}
const botonProyeccion = () => `<button class="btn sm ${verProyeccion ? 'go' : 'ghost'}" data-a="proyeccion">${verProyeccion ? '✓ Proyección al cierre' : 'Ver proyección al cierre'}</button>`
const colorDeHojas = () => new Map(T.hojas.map((h, i) => [h.id, COLORES[i % COLORES.length]]))

/* ---------- vista general: todo el turno unido por operación ---------- */
function pintarGeneral() {
  const { horas, lista } = resumenOperaciones(T)
  const colorHoja = colorDeHojas()
  const conGente = lista.filter(o => o.personas.size && o.total > 0 && !o.turnoMeta)
  const cuello = conGente.length > 1 ? conGente.reduce((m, o) => o.total < m.total ? o : m) : null
  const filas = lista.map(o => ({ ...o, personas: o.personas.size, cuello: cuello && cuello.operacion === o.operacion }))
  return `
  <div class="bh-hoja-bar">
    <div class="bh-leyenda">${T.hojas.map(h => `<span><i style="background:${colorHoja.get(h.id)}"></i>${C.esc(h.codigo)} · ${C.esc(C.m1.codeInfo(h.codigo).cliente || '')}</span>`).join('')}</div>
    ${botonProyeccion()}
  </div>
  ${cuello ? `<div class="banner bh-cuello">Cuello de botella del turno: <b>${C.esc(cuello.operacion)}</b> con ${C.fmt0(cuello.total)} sacos.</div>` : ''}
  ${tablaMapa(filas, horas, colorHoja, false)}`
}

/* ---------- vista de eficiencia por persona ---------- */
// Une las operaciones de cada operario en el turno. El nombre abre su Mi Marcador.
function pintarPersonas() {
  const slots = slotsTurno(T.turno.turno, T.turno.fecha)
  const mapa = new Map()
  T.asig.forEach(a => {
    const b = T.bloques.find(x => x.id === a.bloque_id); if (!b) return
    const r = resumenAsig(a, b)
    let p = mapa.get(a.cedula)
    if (!p) { p = { cedula: a.cedula, ops: [], total: 0, esperado: 0, horasSet: new Set(), tmHora: new Map(), soloTurno: true }; mapa.set(a.cedula, p) }
    // Si en una misma hora estuvo en dos referencias u operaciones, la hora y su tiempo muerto cuentan una vez.
    slots.forEach(h => {
      const g = reg(a.id, h.i); if (!horaRegistrada(g)) return
      p.horasSet.add(h.i)
      const c = g.tm_causa && causa(g.tm_causa)
      if (c && c.tipo !== 'tardanza') p.tmHora.set(h.i, Math.max(p.tmHora.get(h.i) || 0, +g.tm_minutos || 0))
    })
    p.ops.push({ operacion: b.operacion, ef: r.ef, total: r.total, turno: b.meta_origen === 'turno' })
    p.total += r.total
    if (r.esperado) { p.esperado += r.esperado; p.soloTurno = false }
  })
  const lista = [...mapa.values()].map(p => ({ ...p, horas: p.horasSet.size, tm: [...p.tmHora.values()].reduce((s, v) => s + v, 0), ef: p.esperado ? p.total / p.esperado : (p.soloTurno ? calificacionTurno(T) : null) }))
    .sort((x, y) => (y.ef ?? -1) - (x.ef ?? -1))
  const conEf = lista.filter(p => p.esperado)
  const efLinea = conEf.length ? conEf.reduce((s, p) => s + p.total, 0) / conEf.reduce((s, p) => s + p.esperado, 0) : null
  const enBono = lista.filter(p => p.ef != null && p.ef >= 0.9).length
  return `
  <div class="bh-hoja-bar"><div class="hint" style="margin:0">Toca el nombre para abrir su <b>Mi Marcador</b>. Eficiencia con lo registrado hasta ahora.</div></div>
  <div class="grid kpis" style="margin-bottom:12px">
    <div class="kpi"><div class="label">Personas</div><div class="value">${lista.length}</div></div>
    <div class="kpi"><div class="label">Eficiencia del grupo</div><div class="value ${efClase(efLinea)}">${pct(efLinea)}</div></div>
    <div class="kpi"><div class="label">En 90 % o más</div><div class="value">${enBono}<small style="font-size:14px;color:var(--muted)"> / ${lista.length}</small></div></div>
  </div>
  <div class="section" style="padding:10px"><div class="tablebox"><table class="bh-pers">
    <thead><tr><th>#</th><th>Operario</th><th>Operaciones del turno</th><th class="num">Horas</th><th class="num">Producido</th><th class="num">Esperado</th><th class="num">TM</th><th>Eficiencia</th></tr></thead>
    <tbody>${lista.map((p, k) => `<tr>
      <td class="muted">${k + 1}</td>
      <td><span class="bh-nombre" data-a="verMarcador" data-c="${C.esc(p.cedula)}" title="Abrir Mi Marcador">${C.esc(opNombre(p.cedula))}</span></td>
      <td>${p.ops.map(o => `<span class="bh-pop">${C.esc(o.operacion)} <b class="${efClase(o.ef)}">${o.turno && o.ef == null ? 'al cierre' : pct(o.ef)}</b></span>`).join('')}</td>
      <td class="num">${p.horas}</td>
      <td class="num"><b>${C.fmt0(p.total)}</b></td>
      <td class="num muted">${p.esperado ? C.fmt0(p.esperado) : '—'}</td>
      <td class="num muted">${p.tm ? p.tm + '′' : ''}</td>
      <td><div class="bh-efbar"><i class="${efClase(p.ef)}" style="width:${Math.min(100, Math.round((p.ef || 0) * 100))}%"></i><b class="${efClase(p.ef)}">${p.ef == null && p.soloTurno ? 'al cierre' : pct(p.ef)}</b></div></td>
    </tr>`).join('')}</tbody>
  </table></div>
  <div class="count">Producido frente a lo esperado según la meta de cada operación (con el ajuste de polivalencia) y el tiempo disponible. TM: minutos de tiempo muerto que descuentan.</div></div>`
}

function pintarHoja(hoja, ed) {
  const horas = horasTurno(T.turno.turno, T.turno.fecha)
  const bloques = T.bloques.filter(b => b.hoja_id === hoja.id).sort((a, b) => a.orden - b.orden)
  const res = new Map(bloques.map(b => [b.id, resumenBloque(b)]))
  const conGente = bloques.filter(b => res.get(b.id).asig.length && res.get(b.id).total > 0)
  const cuello = conGente.length > 1 ? conGente.reduce((m, b) => res.get(b.id).total < res.get(m.id).total ? b : m) : null
  const c = C.m1.codeInfo(hoja.codigo)
  const mapa = bloques.length && hojasMapa.has(hoja.id)
  const colorHoja = new Map([[hoja.id, colorDeHojas().get(hoja.id)]])
  const filasMapa = () => bloques.map(b => {
    const r = res.get(b.id)
    return {
      operacion: b.operacion, bloqueId: b.id, porHora: r.porHora, acum: r.acum, total: r.total, personas: r.asig.length, ef: r.ef,
      turnoMeta: b.meta_origen === 'turno', cuello: cuello && cuello.id === b.id,
      hojasHora: r.porHora.map(v => v ? new Set([hoja.id]) : new Set()),
      meta: b.meta_origen === 'turno' ? 'turno' : b.meta_hora != null ? metaTxt(b.meta_hora) : '—',
    }
  })
  return `
  <div class="bh-hoja-bar">
    <div class="hint" style="margin:0">${C.esc([c.descripcion, c.linea ? 'Línea ' + c.linea : ''].filter(Boolean).join(' · '))}</div>
    <div class="controls" style="margin:0">
      ${ed ? `<button class="btn sm ghost" data-a="editarHoja" data-id="${hoja.id}">✎ Cambiar código</button>` : ''}
      ${mapa ? botonProyeccion() : ''}
      ${bloques.length ? `<button class="btn sm ${mapa ? 'go' : 'ghost'}" data-a="toggleMapa">${mapa ? '☰ Ver detalle' : '▦ Ver mapa'}</button>` : ''}
    </div>
  </div>
  ${cuello ? `<div class="banner bh-cuello">Cuello de botella: <b>${C.esc(cuello.operacion)}</b> con ${C.fmt0(res.get(cuello.id).total)} sacos acumulados.</div>` : ''}
  ${mapa ? tablaMapa(filasMapa(), horas, colorHoja, true) : bloques.map(b => pintarBloque(b, res.get(b.id), horas, ed, cuello && cuello.id === b.id)).join('')}
  ${ed ? `<div class="controls" style="margin-top:14px"><button class="btn go" data-a="operacion">+ Operación</button>
    <button class="btn ghost danger" data-a="quitarHoja">Quitar esta referencia</button></div>` : ''}`
}

function pintarBloque(b, r, horas, ed, esCuello) {
  const meta = b.meta_origen === 'turno' ? `del turno (${C.fmt0(T.turno.meta_turno || 0)})` : b.meta_hora != null ? `${C.fmt(b.meta_hora, b.meta_hora % 1 ? 1 : 0)}/h` : 'sin meta'
  const origen = { estudio: ['si', 'Métodos y Tiempos'], manual: ['inc', 'Manual'], turno: ['man', 'Meta del turno'] }[b.meta_origen] || ['inc', 'Manual']
  const contraido = colapsados.has(b.id)
  const titulo = `<button class="bh-toggle" data-a="toggleBloque" data-id="${b.id}" title="${contraido ? 'Ver personas' : 'Ocultar personas'}">
        <span class="bh-chev">${contraido ? '▸' : '▾'}</span><h2>${C.esc(b.operacion)}</h2><span class="muted" style="font-size:12px">${r.asig.length} pers.</span></button>`
  if (contraido) return `
  <div class="section bh-bloque contraido ${esCuello ? 'cuello' : ''}">
    <div class="bh-bloque-head">
      <div>${titulo}
        <div class="hint" style="margin:0">Meta <b>${meta}</b> · Total <b>${C.fmt0(r.total)}</b> · ${b.meta_origen === 'turno' ? 'Calificación' : 'Eficiencia'} <b class="${efClase(r.ef)}">${b.meta_origen === 'turno' && r.ef == null ? 'al cierre' : pct(r.ef)}</b></div></div>
    </div>
    <div class="tablebox bh-grid"><table>
      <thead><tr><th class="bh-op">Operación</th>${horas.map(h => `<th class="num">${h.label}</th>`).join('')}<th class="num">Total</th><th class="num">Efic.</th></tr></thead>
      <tbody>
        <tr><td class="bh-op">Por hora</td>${horas.map(h => `<td class="num">${r.porHora[h.i] ? C.fmt0(r.porHora[h.i]) : ''}</td>`).join('')}<td class="num"><b>${C.fmt0(r.total)}</b></td><td class="num ${efClase(r.ef)}">${pct(r.ef)}</td></tr>
        <tr class="bh-acum"><td class="bh-op">Acumulado</td>${horas.map(h => `<td class="num">${r.porHora[h.i] ? C.fmt0(r.acum[h.i]) : ''}</td>`).join('')}<td class="num"></td><td class="num"></td></tr>
      </tbody>
    </table></div>
  </div>`
  return `
  <div class="section bh-bloque ${esCuello ? 'cuello' : ''}">
    <div class="bh-bloque-head">
      <div>${titulo}
        <div class="hint" style="margin:0">Meta <b>${meta}</b> · <span class="pill ${origen[0]}">${origen[1]}</span>
        · Total <b>${C.fmt0(r.total)}</b> · ${b.meta_origen === 'turno' ? 'Calificación' : 'Eficiencia'} <b class="${efClase(r.ef)}">${b.meta_origen === 'turno' && r.ef == null ? 'al cierre' : pct(r.ef)}</b></div></div>
      ${ed ? `<div class="controls" style="margin:0"><button class="btn sm go" data-a="personas" data-id="${b.id}">+ Persona</button>
        <button class="btn sm ghost" data-a="editarBloque" data-id="${b.id}">✎ Editar</button>
        <button class="btn sm ghost danger" data-a="quitarBloque" data-id="${b.id}">Quitar</button></div>` : ''}
    </div>
    <div class="tablebox bh-grid"><table>
      <thead><tr><th class="bh-op">Operario</th>${horas.map(h => `<th class="num">${h.label}</th>`).join('')}<th class="num">Total</th><th class="num">Efic.</th></tr></thead>
      <tbody>
        ${r.asig.map(a => { const ra = resumenAsig(a, b); return `<tr>
          <td class="bh-op"><span ${ed ? `class="bh-nombre" data-a="editarAsig" data-id="${a.id}" title="Editar persona"` : ''}>${C.esc(opNombre(a.cedula))}</span>${+a.factor < 1 ? `<button class="bh-factor" ${ed ? `data-a="factor" data-id="${a.id}"` : ''} title="Meta ajustada por cambio de operación (${Math.round(a.factor * 100)} %)">${b.meta_hora ? 'meta ' + metaTxt(b.meta_hora * a.factor) + '/h' : Math.round(a.factor * 100) + '%'}</button>` : ''}${ed ? `<button class="bh-x" title="Quitar de esta operación" data-a="quitarAsig" data-id="${a.id}">×</button>` : ''}</td>
          ${horas.map(h => celda(a, h.i, ra.acum[h.i], ed)).join('')}
          <td class="num"><b>${C.fmt0(ra.total)}</b></td><td class="num ${efClase(ra.ef)}">${b.meta_origen === 'turno' && ra.ef == null ? '—' : pct(ra.ef)}</td></tr>` }).join('')}
        ${r.asig.length ? `<tr class="bh-acum"><td class="bh-op">Acumulado operación</td>${horas.map(h => `<td class="num">${r.porHora[h.i] ? `<span class="bh-acum-total">${C.fmt0(r.acum[h.i])}</span><span class="bh-acum-hora">${C.fmt0(r.porHora[h.i])}</span>` : ''}</td>`).join('')}<td class="num"><b>${C.fmt0(r.total)}</b></td><td class="num ${efClase(r.ef)}">${b.meta_origen === 'turno' && r.ef == null ? '—' : pct(r.ef)}</td></tr>`
          : `<tr><td colspan="${horas.length + 3}" class="empty">${ed ? 'Agrega a las personas de esta operación.' : 'Sin personas.'}</td></tr>`}
      </tbody>
    </table></div>
  </div>`
}

function celda(a, h, acum, ed) {
  const r = reg(a.id, h)
  const c = r && r.tm_causa ? causa(r.tm_causa) : null
  const u = r && r.unidades != null ? C.fmt0(r.unidades) : ''
  const tm = c ? `<span class="bh-tm ${c.tipo}" title="${C.esc(c.descripcion)}">${C.esc(c.codigo === '411' ? 'DM' : c.codigo === '425' ? 'FM' : c.codigo)}${r.tm_minutos ? ' ' + r.tm_minutos + '′' : ''}</span>` : ''
  const contenido = (u || tm) ? `<span class="bh-u">${u}</span>${u ? `<span class="bh-ac">${C.fmt0(acum)}</span>` : ''}${tm}` : (ed ? '<span class="bh-vacio">+</span>' : '')
  return `<td class="bh-cel ${r && r.nota ? 'nota' : ''}" ${ed ? `data-a="celda" data-id="${a.id}" data-h="${h}"` : ''} title="${r && r.nota ? C.esc(r.nota) : ''}">${contenido}</td>`
}

/* ---------- casilla: unidades y tiempo muerto ---------- */
function modalCelda(asigId, h) {
  const a = T.asig.find(x => x.id === asigId); if (!a) return
  const b = T.bloques.find(x => x.id === a.bloque_id)
  const horas = slotsTurno(T.turno.turno, T.turno.fecha)
  const r = reg(asigId, h) || {}
  let tmSel = r.tm_causa || '', minSel = r.tm_minutos || 60
  const rapidas = CAT.causas.filter(c => c.rapida)
  const otras = CAT.causas.filter(c => !c.rapida)
  const iniH = (horas[h].h + 23) % 24
  const rango = `${iniH % 12 || 12} a ${horas[h].label}`
  C.openModal(`<h3>${C.esc(opNombre(a.cedula))}</h3>
    <div class="hint" style="color:var(--muted);font-size:12.5px;margin-bottom:10px">${C.esc(b.operacion)} · hora ${C.esc(rango)}${b.meta_hora ? ` · meta ${C.fmt(b.meta_hora, b.meta_hora % 1 ? 1 : 0)}/h` : ''}</div>
    <div class="field"><label>Unidades (sacos) en esta hora</label>
      <div class="bh-entrada">
        <input type="number" id="ce-u" inputmode="numeric" enterkeyhint="next" min="0" step="1" class="bh-num" value="${r.unidades ?? ''}" placeholder="0">
        <button class="btn" id="ce-ok" title="Guardar y cerrar">✓ Guardar</button>
        <button class="btn go" id="ce-sig" title="Guardar y pasar a la siguiente persona">Siguiente ↓</button>
      </div></div>
    <div class="field"><label>Tiempo muerto o novedad (opcional)</label>
      <div class="bh-chips" id="ce-tm">${rapidas.map(c => `<button type="button" class="bh-chip ${c.tipo} ${tmSel === c.codigo ? 'on' : ''}" data-c="${c.codigo}">${C.esc(c.corta || c.descripcion)}</button>`).join('')}</div>
      <select id="ce-otra" style="margin-top:8px"><option value="">Otras causas…</option>${otras.map(c => `<option value="${c.codigo}" ${tmSel === c.codigo ? 'selected' : ''}>${c.codigo} · ${C.esc(c.descripcion)}</option>`).join('')}</select>
    </div>
    <div class="field" id="ce-minbox" ${tmSel ? '' : 'hidden'}><label>Minutos</label>
      <div class="bh-chips" id="ce-min">${[15, 30, 45, 60].map(m => `<button type="button" class="bh-chip ${minSel === m ? 'on' : ''}" data-m="${m}">${m === 60 ? 'Hora completa' : m + ' min'}</button>`).join('')}
        <input type="number" id="ce-minx" min="1" max="60" step="1" placeholder="otro" value="${[15, 30, 45, 60].includes(minSel) ? '' : minSel}" style="width:80px"></div>
    </div>
    <div class="field"><label>Nota (opcional)</label><input type="text" id="ce-nota" value="${C.esc(r.nota || '')}" placeholder="Ej: máquina 3, cambio de aguja…"></div>
    <div class="modal-actions">
      ${r.unidades != null || r.tm_causa ? '<button class="btn ghost danger" id="ce-borrar">Borrar</button>' : ''}
      <button class="btn ghost" data-act="closeModal">Cancelar</button>
    </div>`)
  const inp = document.getElementById('ce-u'); setTimeout(() => { inp.focus(); inp.select() }, 50)
  const marcar = () => {
    document.querySelectorAll('#ce-tm .bh-chip').forEach(x => x.classList.toggle('on', x.dataset.c === tmSel))
    document.getElementById('ce-otra').value = CAT.causas.some(c => !c.rapida && c.codigo === tmSel) ? tmSel : ''
    document.getElementById('ce-minbox').hidden = !tmSel
    document.querySelectorAll('#ce-min .bh-chip').forEach(x => x.classList.toggle('on', +x.dataset.m === minSel))
  }
  document.getElementById('ce-tm').addEventListener('click', e => { const x = e.target.closest('[data-c]'); if (!x) return; tmSel = tmSel === x.dataset.c ? '' : x.dataset.c; marcar() })
  document.getElementById('ce-otra').addEventListener('change', e => { tmSel = e.target.value; marcar() })
  document.getElementById('ce-min').addEventListener('click', e => { const x = e.target.closest('[data-m]'); if (!x) return; minSel = +x.dataset.m; document.getElementById('ce-minx').value = ''; marcar() })
  document.getElementById('ce-minx').addEventListener('input', e => { const v = Math.max(1, Math.min(60, +e.target.value || 0)); if (v) { minSel = v; marcar() } })
  const guardar = () => {
    const uv = inp.value === '' ? null : Math.max(0, +inp.value)
    const nota = document.getElementById('ce-nota').value.trim()
    if (uv == null && !tmSel && !nota) { borrar(); return true }
    cambio('bh_registros', 'upsert', { asignacion_id: asigId, hora: h, turno_id: T.turno.id, unidades: uv, tm_causa: tmSel || null, tm_minutos: tmSel ? minSel : null, nota, updated_at: new Date().toISOString() })
    return true
  }
  const borrar = () => { if (T.regs.has(asigId + '|' + h)) cambio('bh_registros', 'delete', { asignacion_id: asigId, hora: h }) }
  document.getElementById('ce-ok').addEventListener('click', () => { guardar(); C.closeModal(); pintarTurno() })
  document.getElementById('ce-sig').addEventListener('click', () => {
    guardar(); C.closeModal(); pintarTurno()
    // Siguiente persona del mismo bloque en la misma hora; si era la última, el primero del siguiente bloque.
    const orden = T.bloques.filter(x => x.hoja_id === b.hoja_id).sort((x, y) => x.orden - y.orden)
      .flatMap(x => T.asig.filter(y => y.bloque_id === x.id).sort((p, q) => p.orden - q.orden))
    const i = orden.findIndex(x => x.id === asigId)
    if (orden[i + 1]) modalCelda(orden[i + 1].id, h)
  })
  const bb = document.getElementById('ce-borrar'); if (bb) bb.addEventListener('click', () => { borrar(); C.closeModal(); pintarTurno() })
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('ce-sig').click() })
}

/* ---------- referencia, operación, personas ---------- */
function modalReferencia(hojaEditar) {
  const cods = C.m1.codigos()
  const he = hojaEditar ? T.hojas.find(h => h.id === hojaEditar) : null
  C.openModal(`<h3>${he ? 'Cambiar código de la referencia' : 'Agregar referencia'}</h3>
    <div class="hint" style="color:var(--muted);font-size:12.5px">${he ? `Hoy es <b class="mono">${C.esc(he.codigo)}</b>. Se conservan las operaciones, personas y horas registradas; las metas de Métodos y Tiempos se recalculan con el código nuevo.`
      : 'El código del saco que se va a trabajar. Si cambian de referencia en el turno, se agrega otra.'}</div>
    <input class="search" style="width:100%;margin-top:10px" type="search" id="rf-q" placeholder="Buscar código o cliente…" autocomplete="off">
    <div class="hlist" id="rf-res"></div>`, true)
  const linea = T.turno.linea
  const draw = q => {
    const n = q.trim().toLowerCase()
    const lista = cods.filter(c => !n || (c.codigo + ' ' + c.cliente + ' ' + (c.descripcion || '')).toLowerCase().includes(n))
      .sort((a, b) => (b.linea && linea.startsWith(b.linea) ? 1 : 0) - (a.linea && linea.startsWith(a.linea) ? 1 : 0)).slice(0, 120)
    document.getElementById('rf-res').innerHTML = `<table><tbody>${lista.map(c => `<tr>
      <td class="codecell">${C.esc(c.codigo)}</td><td class="muted" style="font-size:12px">${C.esc(c.cliente)}</td>
      <td>${C.m1.tiemposOf(c.codigo).length ? '<span class="pill si">Con tiempos</span>' : '<span class="pill no">Sin estudio</span>'}</td>
      <td><button class="btn sm go" data-ref="${C.esc(c.codigo)}">Elegir</button></td></tr>`).join('') || '<tr><td class="empty">Sin resultados</td></tr>'}</tbody></table>`
  }
  draw('')
  document.getElementById('rf-q').addEventListener('input', e => draw(e.target.value))
  document.getElementById('rf-res').addEventListener('click', e => {
    const x = e.target.closest('[data-ref]'); if (!x) return
    if (he) {
      const nuevo = x.dataset.ref
      cambio('bh_hojas', 'upsert', { ...he, codigo: nuevo })
      // Las metas del estudio dependen del código: se recalculan; si el código nuevo
      // no tiene esa operación estudiada, la meta se conserva como manual.
      const sinEstudio = []
      T.bloques.filter(b => b.hoja_id === he.id && b.meta_origen === 'estudio').forEach(b => {
        const m = metaEstudio(nuevo, b.operacion)
        if (m != null) cambio('bh_bloques', 'upsert', { ...b, meta_hora: m })
        else { cambio('bh_bloques', 'upsert', { ...b, meta_origen: 'manual' }); sinEstudio.push(b.operacion) }
      })
      C.closeModal(); pintarTurno()
      C.toast(sinEstudio.length ? `Código cambiado. Sin estudio en el código nuevo (quedan con meta manual): ${sinEstudio.join(', ')}.` : 'Código cambiado.')
      return
    }
    const fila = { id: uid(), turno_id: T.turno.id, codigo: x.dataset.ref, orden: T.hojas.length }
    cambio('bh_hojas', 'upsert', fila)
    hojaActual = fila.id; vistaTurno = 'hojas'
    C.closeModal(); pintarTurno()
    modalOperacion()
  })
}

function modalOperacion(bloqueId) {
  const hoja = T.hojas.find(h => h.id === hojaActual); if (!hoja) return
  const b = bloqueId ? T.bloques.find(x => x.id === bloqueId) : null
  const delCodigo = [...new Set(C.m1.tiemposOf(hoja.codigo).map(r => r.op))]
  const tipo = n => C.m1.tipoOf(n)
  const resto = C.m1.opList().map(o => o.nombre).filter(n => !delCodigo.includes(n))
  // Las operaciones que ya están en esta referencia no se repiten (salvo la que se está editando).
  const ya = new Set(T.bloques.filter(x => x.hoja_id === hoja.id && (!b || x.id !== b.id)).map(x => x.operacion))
  delCodigo.sort((x, y) => (tipo(x) === 'Costura' ? 0 : 1) - (tipo(y) === 'Costura' ? 0 : 1))
  // Se puede escribir para buscar: la lista se filtra (sin importar tildes ni mayúsculas).
  const sinTilde = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const opciones = filtro => {
    const f = sinTilde(filtro || ''), ok = n => !f || sinTilde(n).includes(f)
    const d = delCodigo.filter(ok), r = resto.filter(ok)
    return (d.length ? `<optgroup label="De esta referencia (con meta de Métodos y Tiempos)">${d.map(n => `<option ${ya.has(n) ? 'disabled' : ''}>${C.esc(n)}</option>`).join('')}</optgroup>` : '')
      + (r.length ? `<optgroup label="Otras operaciones (meta manual)">${r.map(n => `<option ${ya.has(n) ? 'disabled' : ''}>${C.esc(n)}</option>`).join('')}</optgroup>` : '')
  }
  C.openModal(`<h3>${b ? 'Editar operación' : 'Agregar operación'}</h3>
    <div class="field"><label>Operación</label>
      <input type="search" id="op-q" class="search" style="width:100%;margin-bottom:6px" placeholder="Escribe para buscar (ej: tapa, reata, cierre)…" autocomplete="off">
      <select id="op-sel" size="6" style="width:100%">${opciones('')}</select></div>
    ${b ? '<div class="hint" style="color:var(--muted);font-size:12px;margin:-4px 0 10px">Si cambias la operación, las personas y sus horas registradas pasan a la nueva.</div>' : ''}
    <div class="field"><label>Meta (obligatoria)</label><div class="bh-chips" id="op-tipo"></div></div>
    <div class="field" id="op-metabox"><label>Meta por hora (sacos)</label><input type="number" id="op-meta" min="0" step="0.1" inputmode="decimal" placeholder="Ej: 25"></div>
    <div class="hint" id="op-hint" style="color:var(--muted);font-size:12.5px"></div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn go" id="op-ok">${b ? 'Guardar' : 'Agregar'}</button></div>`)
  const sel = document.getElementById('op-sel'), meta = document.getElementById('op-meta'), hint = document.getElementById('op-hint')
  const op = () => sel.value
  // Revisión y patinador pueden calificarse con la meta del turno.
  const admiteTurno = n => /revisi|patin/i.test(n || '')
  let tipoMeta = b ? b.meta_origen : null
  const refrescar = (cambioOp) => {
    const n = op(), m = metaEstudio(hoja.codigo, n)
    if (cambioOp || !tipoMeta) tipoMeta = admiteTurno(n) ? 'turno' : m != null ? 'estudio' : 'manual'
    if (tipoMeta === 'estudio' && m == null) tipoMeta = 'manual'
    if (tipoMeta === 'turno' && !admiteTurno(n)) tipoMeta = 'manual'
    const opciones = [
      m != null ? ['estudio', `Métodos y Tiempos · ${C.fmt(m, 1)}/h`] : null,
      ['manual', 'Manual'],
      admiteTurno(n) ? ['turno', `Meta del turno · ${C.fmt0(T.turno.meta_turno || 0)}`] : null,
    ].filter(Boolean)
    document.getElementById('op-tipo').innerHTML = opciones.map(([v, t]) => `<button type="button" class="bh-chip ${tipoMeta === v ? 'on' : ''}" data-t="${v}">${C.esc(t)}</button>`).join('')
    document.getElementById('op-metabox').hidden = tipoMeta !== 'manual'
    if (tipoMeta === 'manual' && (cambioOp || meta.value === '')) meta.value = b && b.meta_origen === 'manual' && b.meta_hora != null ? b.meta_hora : ''
    hint.innerHTML = tipoMeta === 'estudio' ? 'Meta del estudio de Métodos y Tiempos para esta referencia.'
      : tipoMeta === 'turno' ? 'Se califica al cerrar: unidades fabricadas del turno ÷ meta del turno.'
      : m != null ? 'Meta escrita a mano: vale solo para este turno.' : 'Esta operación no tiene tiempo estudiado para esta referencia: escribe la meta (vale solo para este turno).'
  }
  document.getElementById('op-tipo').addEventListener('click', e => { const x = e.target.closest('[data-t]'); if (!x) return; tipoMeta = x.dataset.t; refrescar(false); if (tipoMeta === 'manual') meta.focus() })
  if (b) sel.value = b.operacion
  else { const primera = [...sel.options].find(o => !o.disabled); if (primera) sel.value = primera.value }
  sel.addEventListener('change', () => refrescar(true))
  const q = document.getElementById('op-q')
  q.addEventListener('input', () => {
    const antes = sel.value
    sel.innerHTML = opciones(q.value)
    const sigue = [...sel.options].find(o => o.value === antes && !o.disabled)
    const primera = sigue || [...sel.options].find(o => !o.disabled)
    sel.value = primera ? primera.value : ''
    if (sel.value !== antes) refrescar(true)
  })
  if (!b) setTimeout(() => q.focus(), 50)
  refrescar(false)
  document.getElementById('op-ok').addEventListener('click', () => {
    const nombre = op(); if (!nombre) { C.toast('Elige la operación.'); return }
    let mv = null
    if (tipoMeta === 'estudio') mv = metaEstudio(hoja.codigo, nombre)
    else if (tipoMeta === 'manual') {
      mv = meta.value === '' ? null : +meta.value
      if (!mv || mv <= 0) { C.toast('Escribe la meta por hora: sin meta no se puede medir.'); meta.focus(); return }
    } else if (!T.turno.meta_turno) { C.toast('Primero escribe la meta del turno (arriba, en ✎).'); return }
    const origen = tipoMeta
    if (b) cambio('bh_bloques', 'upsert', { ...b, operacion: nombre, meta_hora: mv, meta_origen: origen })
    else {
      const fila = { id: uid(), turno_id: T.turno.id, hoja_id: hoja.id, operacion: nombre, meta_hora: mv, meta_origen: origen, orden: T.bloques.filter(x => x.hoja_id === hoja.id).length }
      cambio('bh_bloques', 'upsert', fila)
      C.closeModal(); pintarTurno()
      const previa = personasDeReferenciaAnterior(hoja, nombre)
      if (previa) modalMismasPersonas(fila.id, previa); else modalPersonas(fila.id)
      return
    }
    C.closeModal(); pintarTurno()
  })
}

// Cambio de referencia en el turno: la misma operación de la referencia anterior
// suele seguir con la misma gente. Devuelve { hoja, asig } o null.
function personasDeReferenciaAnterior(hoja, operacion) {
  const antes = T.hojas.filter(h => h.id !== hoja.id && (h.orden ?? 0) <= (hoja.orden ?? 0)).sort((a, b) => (b.orden ?? 0) - (a.orden ?? 0))
  for (const h of antes) {
    const b = T.bloques.find(x => x.hoja_id === h.id && x.operacion === operacion)
    const asig = b ? T.asig.filter(a => a.bloque_id === b.id).sort((p, q) => p.orden - q.orden) : []
    if (asig.length) return { hoja: h, asig }
  }
  return null
}
function modalMismasPersonas(bloqueId, previa) {
  const b = T.bloques.find(x => x.id === bloqueId); if (!b) return
  const elegidos = new Set(previa.asig.map(a => a.cedula))
  C.openModal(`<h3>¿Las mismas personas?</h3>
    <div class="hint" style="color:var(--muted);font-size:13px;margin-bottom:10px">En <b class="mono">${C.esc(previa.hoja.codigo)}</b> estaban estas personas en <b>${C.esc(b.operacion)}</b>. Quita a quien no siga y agrégalas de una vez.</div>
    <div class="hlist" id="mp-res"><table><tbody>${previa.asig.map(a => `<tr class="bh-pick on" data-ced="${a.cedula}">
      <td style="width:30px"><input type="checkbox" checked tabindex="-1"></td>
      <td>${C.esc(opNombre(a.cedula))}${+a.factor < 1 ? ` <span class="muted" style="font-size:11.5px">· meta al ${Math.round(a.factor * 100)} %</span>` : ''}</td></tr>`).join('')}</tbody></table></div>
    <div class="modal-actions" style="justify-content:space-between">
      <button class="btn ghost" id="mp-otras">Elegir otras personas</button>
      <button class="btn go" id="mp-ok">Agregar (${elegidos.size})</button>
    </div>`)
  document.getElementById('mp-res').addEventListener('click', e => {
    const tr = e.target.closest('[data-ced]'); if (!tr) return
    const c = tr.dataset.ced; elegidos.has(c) ? elegidos.delete(c) : elegidos.add(c)
    tr.classList.toggle('on', elegidos.has(c)); tr.querySelector('input').checked = elegidos.has(c)
    document.getElementById('mp-ok').textContent = `Agregar (${elegidos.size})`
  })
  document.getElementById('mp-otras').addEventListener('click', () => { C.closeModal(); modalPersonas(bloqueId) })
  document.getElementById('mp-ok').addEventListener('click', () => {
    let orden = T.asig.filter(a => a.bloque_id === b.id).length
    // Siguen en la misma operación: se conserva el ajuste de meta que tenían.
    previa.asig.filter(a => elegidos.has(a.cedula)).forEach(a =>
      cambio('bh_asignaciones', 'upsert', { id: uid(), turno_id: T.turno.id, bloque_id: b.id, cedula: a.cedula, orden: orden++, factor: +a.factor || 1 }))
    C.closeModal(); pintarTurno()
    C.toast(`${elegidos.size} persona(s) agregadas a ${b.operacion}.`)
  })
}

function modalPersonas(bloqueId) {
  const b = T.bloques.find(x => x.id === bloqueId); if (!b) return
  const ya = new Set(T.asig.filter(a => a.bloque_id === b.id).map(a => a.cedula))
  const enTurno = new Set(T.asig.map(a => a.cedula))
  const elegidos = new Set()
  C.openModal(`<h3>Personas en ${C.esc(b.operacion)}</h3>
    <input class="search" style="width:100%" type="search" id="pe-q" placeholder="Buscar por nombre o cédula…" autocomplete="off">
    <div class="hlist" id="pe-res"></div>
    <div class="modal-actions" style="justify-content:space-between">
      <button class="btn ghost" id="pe-nueva">+ Persona nueva</button>
      <span><button class="btn ghost" data-act="closeModal">Cancelar</button> <button class="btn go" id="pe-ok">Agregar (0)</button></span>
    </div>`, true)
  const linea = T.turno.linea
  const draw = q => {
    const n = q.trim().toLowerCase()
    const lista = CAT.operarios.filter(o => o.activo && !ya.has(o.cedula) && (!n || (o.nombre + ' ' + o.cedula).toLowerCase().includes(n)))
      .sort((x, y) => ((y.linea === linea) - (x.linea === linea)) || x.nombre.localeCompare(y.nombre)).slice(0, 150)
    document.getElementById('pe-res').innerHTML = `<table><tbody>${lista.map(o => `<tr class="bh-pick ${elegidos.has(o.cedula) ? 'on' : ''}" data-ced="${o.cedula}">
      <td style="width:30px"><input type="checkbox" ${elegidos.has(o.cedula) ? 'checked' : ''} tabindex="-1"></td>
      <td>${C.esc(nombreCorto(o.nombre))}<div class="muted" style="font-size:11.5px">${C.esc(o.nombre)}</div></td>
      <td class="muted" style="font-size:12px">${C.esc(lineaTxt(o.linea))}<br>${C.esc(o.operacion_base || '')}</td>
      <td>${enTurno.has(o.cedula) ? '<span class="pill inc">Ya en el turno</span>' : ''}</td></tr>`).join('') || '<tr><td class="empty">Sin resultados</td></tr>'}</tbody></table>`
  }
  draw('')
  const q = document.getElementById('pe-q'); setTimeout(() => q.focus(), 50)
  q.addEventListener('input', e => draw(e.target.value))
  document.getElementById('pe-res').addEventListener('click', e => {
    const tr = e.target.closest('[data-ced]'); if (!tr) return
    const c = tr.dataset.ced; elegidos.has(c) ? elegidos.delete(c) : elegidos.add(c)
    tr.classList.toggle('on', elegidos.has(c)); tr.querySelector('input').checked = elegidos.has(c)
    document.getElementById('pe-ok').textContent = `Agregar (${elegidos.size})`
  })
  document.getElementById('pe-ok').addEventListener('click', async () => {
    let orden = T.asig.filter(a => a.bloque_id === b.id).length
    const lista = [...elegidos]
    C.closeModal()
    // Polivalencia: si la persona ya trabaja en OTRA operación del turno, se pregunta cómo ponderar su meta.
    // Si es la misma operación en otra referencia, conserva el ajuste que tenía.
    const opDe = a => (T.bloques.find(x => x.id === a.bloque_id) || {}).operacion
    for (const ced of lista) {
      const suyas = T.asig.filter(a => a.cedula === ced && a.bloque_id !== b.id)
      const misma = suyas.find(a => opDe(a) === b.operacion)
      const factor = b.meta_origen === 'turno' ? 1 : misma ? (+misma.factor || 1) : suyas.length ? await preguntarFactor(ced, b) : 1
      cambio('bh_asignaciones', 'upsert', { id: uid(), turno_id: T.turno.id, bloque_id: b.id, cedula: ced, orden: orden++, factor })
    }
    C.closeModal(); pintarTurno()
  })
  document.getElementById('pe-nueva').addEventListener('click', () => modalPersonaNueva(ced => {
    cambio('bh_asignaciones', 'upsert', { id: uid(), turno_id: T.turno.id, bloque_id: b.id, cedula: ced, orden: T.asig.filter(a => a.bloque_id === b.id).length })
    pintarTurno()
  }, linea))
}

// Editar una persona dentro de una operación: cambiarla por otra (sus horas
// registradas pasan a la nueva), ajustar su ponderación o quitarla.
function modalEditarPersona(asigId) {
  const a = T.asig.find(x => x.id === asigId); if (!a) return
  const b = T.bloques.find(x => x.id === a.bloque_id)
  const ocupados = new Set(T.asig.filter(x => x.bloque_id === b.id && x.id !== a.id).map(x => x.cedula))
  let elegido = null
  C.openModal(`<h3>${C.esc(opNombre(a.cedula))} · ${C.esc(b.operacion)}</h3>
    ${b.meta_origen !== 'turno' ? `<div class="field"><label>Meta con la que se mide${b.meta_hora ? ` (la de la operación es ${metaTxt(b.meta_hora)}/h)` : ''}</label>
      <div id="ep-f">${chipsFactor(b.meta_hora, +a.factor || 1)}</div></div>` : ''}
    <div class="field"><label>¿Se equivocaron de persona? Cámbiala por otra (se conservan las horas registradas)</label>
      <input class="search" style="width:100%" type="search" id="ep-q" placeholder="Buscar por nombre o cédula…" autocomplete="off">
      <div class="hlist" id="ep-res" style="max-height:30vh"></div></div>
    <div class="modal-actions" style="justify-content:space-between">
      <button class="btn ghost danger" id="ep-quitar">Quitar de esta operación</button>
      <span><button class="btn ghost" data-act="closeModal">Cancelar</button> <button class="btn go" id="ep-ok">Guardar</button></span>
    </div>`, true)
  let factor = +a.factor || 1
  const fbox = document.getElementById('ep-f')
  if (fbox) fbox.addEventListener('click', e => { const x = e.target.closest('[data-f]'); if (!x) return; factor = +x.dataset.f; fbox.querySelectorAll('.bh-chip').forEach(c => c.classList.toggle('on', +c.dataset.f === factor)) })
  const draw = q => {
    const n = q.trim().toLowerCase()
    if (!n) { document.getElementById('ep-res').innerHTML = '<div class="empty" style="padding:12px">Escribe para buscar.</div>'; return }
    const lista = CAT.operarios.filter(o => o.activo && o.cedula !== a.cedula && !ocupados.has(o.cedula) && (o.nombre + ' ' + o.cedula).toLowerCase().includes(n)).slice(0, 60)
    document.getElementById('ep-res').innerHTML = `<table><tbody>${lista.map(o => `<tr class="bh-pick ${elegido === o.cedula ? 'on' : ''}" data-ced="${o.cedula}">
      <td>${C.esc(nombreCorto(o.nombre))}<div class="muted" style="font-size:11.5px">${C.esc(o.nombre)}</div></td><td class="muted" style="font-size:12px">${C.esc(lineaTxt(o.linea))}</td></tr>`).join('') || '<tr><td class="empty">Sin resultados</td></tr>'}</tbody></table>`
  }
  draw('')
  document.getElementById('ep-q').addEventListener('input', e => draw(e.target.value))
  document.getElementById('ep-res').addEventListener('click', e => {
    const tr = e.target.closest('[data-ced]'); if (!tr) return
    elegido = elegido === tr.dataset.ced ? null : tr.dataset.ced
    draw(document.getElementById('ep-q').value)
  })
  document.getElementById('ep-ok').addEventListener('click', () => {
    cambio('bh_asignaciones', 'upsert', { ...a, cedula: elegido || a.cedula, factor })
    C.closeModal(); C.toast(elegido ? `Cambiado por ${opNombre(elegido)}.` : 'Guardado.'); pintarTurno()
  })
  document.getElementById('ep-quitar').addEventListener('click', () => {
    confirmar('Quitar persona', `¿Quitar a <b>${C.esc(opNombre(a.cedula))}</b> de esta operación? Se borran sus horas registradas en ella.`, () => cambio('bh_asignaciones', 'delete', { id: a.id }))
  })
}

function modalEditarTurno() {
  const t = T.turno
  const sups = CAT.supervisores.filter(s => s.activo || s.cedula === t.supervisor_cedula || s.cedula === t.supervisor2_cedula)
  const opt = sel => `<option value="">—</option>` + sups.map(s => `<option value="${s.cedula}" ${s.cedula === sel ? 'selected' : ''}>${C.esc(nombreCorto(s.nombre))}</option>`).join('')
  C.openModal(`<h3>Editar turno</h3>
    <div class="field"><label>Fecha</label><input type="date" id="et-fecha" value="${t.fecha}"></div>
    <div class="field"><label>Turno</label><select id="et-turno">${CAT.turnos.map(x => `<option value="${x.codigo}" ${x.codigo === t.turno ? 'selected' : ''}>${C.esc(turnoTxt(x.codigo))}</option>`).join('')}</select></div>
    <div class="field"><label>Línea</label><select id="et-linea">${LINEAS.map(l => `<option value="${l.v}" ${l.v === t.linea ? 'selected' : ''}>${l.t}</option>`).join('')}</select></div>
    <div class="field"><label>Supervisor</label><select id="et-sup">${opt(t.supervisor_cedula)}</select></div>
    <div class="field"><label>Segundo supervisor (opcional)</label><select id="et-sup2">${opt(t.supervisor2_cedula)}</select></div>
    <div class="field"><label>Meta del turno (sacos de la línea)</label><input type="number" id="et-meta" inputmode="numeric" min="1" step="1" value="${t.meta_turno ?? ''}"></div>
    <div class="hint" id="et-aviso" style="color:var(--warn);font-size:12.5px"></div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn go" id="et-ok">Guardar</button></div>`)
  const aviso = document.getElementById('et-aviso')
  document.getElementById('et-turno').addEventListener('change', e => {
    aviso.textContent = e.target.value !== t.turno ? 'Ojo: las horas ya registradas se conservan en el mismo orden (la primera hora sigue siendo la primera del turno nuevo).' : ''
  })
  document.getElementById('et-ok').addEventListener('click', async () => {
    const set = {
      fecha: document.getElementById('et-fecha').value || t.fecha,
      turno: document.getElementById('et-turno').value, linea: document.getElementById('et-linea').value,
      supervisor_cedula: document.getElementById('et-sup').value || null,
      supervisor2_cedula: document.getElementById('et-sup2').value || null,
      meta_turno: +document.getElementById('et-meta').value || null,
    }
    if (!set.supervisor_cedula) { C.toast('Elige el supervisor.'); return }
    if (!set.meta_turno || set.meta_turno <= 0) { C.toast('Escribe la meta del turno.'); return }
    // No puede quedar repetido con otro turno de la misma fecha, turno y línea.
    if (set.fecha !== t.fecha || set.turno !== t.turno || set.linea !== t.linea) {
      const { data: otro } = await C.supabase.from('bh_turnos').select('id').match({ fecha: set.fecha, turno: set.turno, linea: set.linea }).maybeSingle()
      if (otro && otro.id !== t.id) { C.toast('Ya existe un turno con esa fecha, turno y línea.'); return }
    }
    const horasAntes = slotsTurno(t.turno, t.fecha).length, horasDespues = slotsTurno(set.turno, set.fecha).length
    if (horasDespues < horasAntes) {
      const fuera = [...T.regs.values()].filter(r => r.hora >= horasDespues && horaRegistrada(r)).length
      if (fuera) { C.toast(`El turno nuevo tiene menos horas y hay ${fuera} registro(s) en las horas que sobran. Bórralos primero.`); return }
    }
    cambio('bh_turnos', 'update', { set, match: { id: t.id } })
    fechaLista = set.fecha
    C.closeModal(); C.toast('Turno actualizado.'); pintarTurno()
  })
}

// Opciones de meta para quien cambia de operación (polivalencia).
const FACTORES = [[0.3, '30 %', 'Aprendiz'], [0.5, '50 %'], [0.75, '75 %'], [0.9, '90 %'], [1, 'Sin ajuste']]
const metaTxt = v => C.fmt(v, Math.abs(v % 1) > 0.05 ? 1 : 0)
// Botones que muestran la meta por hora en grande y el porcentaje en pequeño.
function chipsFactor(meta, actual, clase) {
  return `<div class="bh-chips bh-fact ${clase || ''}">${FACTORES.map(([v, p, nota]) => `<button type="button" class="bh-chip ${+actual === v ? 'on' : ''}" data-f="${v}">
    <b>${meta ? metaTxt(meta * v) + '/h' : p}</b><small>${v === 1 ? 'Sin ajuste' : p}${nota ? ' · ' + nota : ''}</small></button>`).join('')}</div>`
}

// Pregunta con qué meta medir a alguien que pasa a otra operación en el mismo turno.
// Devuelve el factor: 0.3, 0.5, 0.75, 0.9 o 1 (sin ajuste).
function preguntarFactor(ced, bloque, actual) {
  return new Promise(resolve => {
    const otras = T.asig.filter(a => a.cedula === ced && a.bloque_id !== bloque.id).map(a => {
      const bl = T.bloques.find(x => x.id === a.bloque_id)
      const horasReg = slotsTurno(T.turno.turno, T.turno.fecha).filter(h => horaRegistrada(reg(a.id, h.i))).length
      return `${bl ? bl.operacion : ''}${horasReg ? ` (${horasReg} h)` : ''}`
    })
    C.openModal(`<h3>${C.esc(opNombre(ced))} cambia de operación</h3>
      <div class="hint" style="color:var(--muted);font-size:13px;margin-bottom:12px">Venía en <b>${C.esc(otras.join(', ') || 'otra operación')}</b> y pasa a <b>${C.esc(bloque.operacion)}</b>${bloque.meta_hora ? `, que tiene una meta de <b>${metaTxt(bloque.meta_hora)} por hora</b>` : ''}.
        ¿Con qué meta lo vas a medir?</div>
      ${chipsFactor(bloque.meta_hora, actual, 'bh-factores')}`)
    document.querySelector('.bh-factores').addEventListener('click', e => { const x = e.target.closest('[data-f]'); if (!x) return; resolve(+x.dataset.f) })
    // Si cierran la ventana sin elegir, queda sin ajuste.
    const bg = document.getElementById('modalBg')
    const alCerrar = e => { if (e.target.id === 'modalBg') { bg.removeEventListener('click', alCerrar); resolve(actual || 1) } }
    bg.addEventListener('click', alCerrar)
  })
}

// También la usa el módulo Personal.
export function modalPersonaNueva(alGuardar, lineaDef = '') {
  C.openModal(`<h3>Persona nueva</h3>
    <div class="field"><label>Nombre completo (apellidos y nombres)</label><input id="pn-nom" placeholder="PEREZ GOMEZ JUAN CARLOS"></div>
    <div class="field"><label>Cédula</label><input id="pn-ced" inputmode="numeric" placeholder="Solo números"></div>
    <div class="field"><label>Línea</label><select id="pn-lin">${[...LINEAS, { v: 'CORTE-SS', t: 'Corte' }, { v: 'PRENSA', t: 'Prensa' }, { v: 'LINER', t: 'Liner' }, { v: 'ESTAMPADO SS', t: 'Estampado' }]
      .map(l => `<option value="${l.v}" ${l.v === lineaDef ? 'selected' : ''}>${l.t}</option>`).join('')}</select></div>
    <div class="field"><label>Operación habitual (opcional)</label><input id="pn-op" placeholder="Ej: Pegar tapa"></div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn go" id="pn-ok">Guardar</button></div>`)
  document.getElementById('pn-ok').addEventListener('click', async () => {
    const nombre = document.getElementById('pn-nom').value.trim().replace(/\s+/g, ' ').toUpperCase()
    const cedula = document.getElementById('pn-ced').value.replace(/\D/g, '')
    if (nombre.split(' ').length < 2) { C.toast('Escribe el nombre completo.'); return }
    if (cedula.length < 5) { C.toast('Escribe la cédula (solo números).'); return }
    const existe = CAT.operarios.find(o => o.cedula === cedula)
    if (existe && existe.activo) { C.toast('Esa cédula ya está registrada: ' + nombreCorto(existe.nombre) + '.'); return }
    const fila = { cedula, nombre, linea: document.getElementById('pn-lin').value, operacion_base: document.getElementById('pn-op').value.trim(), activo: true, updated_at: new Date().toISOString() }
    const { error } = await C.supabase.from('operarios').upsert(fila)
    if (error) { C.toast('No se pudo guardar: ' + error.message); return }
    if (existe) Object.assign(existe, fila); else CAT.operarios.push(fila)
    CAT.operarios.sort((a, b) => a.nombre.localeCompare(b.nombre))
    C.closeModal(); C.toast(existe ? 'Persona reactivada.' : 'Persona agregada.')
    if (alGuardar) alGuardar(cedula)
  })
}

/* ---------- terminar ---------- */
function modalTerminar() {
  const t = T.turno
  const sinRegistro = T.asig.filter(a => !slotsTurno(t.turno, t.fecha).some(h => horaRegistrada(reg(a.id, h.i)))).length
  C.openModal(`<h3>${t.estado === 'abierto' ? 'Terminar Bi-horario' : 'Cierre del turno'}</h3>
    ${t.estado === 'abierto' ? `<div class="hint" style="color:var(--muted);font-size:13px;margin-bottom:10px">Al terminar, el turno queda cerrado. Podrás corregirlo hasta 2 días después.${sinRegistro ? ` <b>Ojo: ${sinRegistro} persona(s) no tienen ninguna hora registrada.</b>` : ''}</div>` : ''}
    ${esPT(t.linea) ? '' : `<div class="field"><label>Unidades fabricadas en el turno (sacos completos de cada código)</label>
      <div class="bh-cierre">${T.hojas.map(h => `<div><span><b class="mono">${C.esc(h.codigo)}</b><small>${C.esc(C.m1.codeInfo(h.codigo).cliente || '')}</small></span>
        <input type="number" class="tt-uni" data-id="${h.id}" inputmode="numeric" min="0" step="1" placeholder="0" value="${h.unidades_reportadas ?? ''}"></div>`).join('') || '<div class="muted">Este turno no tiene referencias.</div>'}</div>
      <div class="hint" style="color:var(--muted);font-size:12px;margin-top:6px">Meta del turno: <b>${C.fmt0(t.meta_turno || 0)}</b>. Con esto se califica a revisión y patinadores.</div></div>`}
    <div class="field"><label>Observaciones (personal de amarre, soplado, pie de máquina, novedades…)</label>
      <textarea id="tt-obs" rows="4" style="width:100%;font:inherit;padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--fg)">${C.esc(t.observaciones || '')}</textarea></div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn go" id="tt-ok">${t.estado === 'abierto' ? '✓ Terminar' : 'Guardar'}</button></div>`)
  document.getElementById('tt-ok').addEventListener('click', () => {
    const inputs = [...document.querySelectorAll('.tt-uni')]
    if (inputs.some(i => i.value === '')) { C.toast('Escribe las unidades fabricadas de cada código (0 si no se terminó ninguno).'); return }
    inputs.forEach(i => { const h = T.hojas.find(x => x.id === i.dataset.id); if (h) cambio('bh_hojas', 'upsert', { ...h, unidades_reportadas: Math.max(0, +i.value) }) })
    const set = { observaciones: document.getElementById('tt-obs').value.trim() }
    if (t.estado === 'abierto') { set.estado = 'terminado'; set.terminado_at = new Date().toISOString() }
    cambio('bh_turnos', 'update', { set, match: { id: t.id } })
    C.closeModal(); C.toast(set.estado ? 'Bi-horario terminado.' : 'Cierre guardado.'); pintarTurno()
  })
}

function modalMetaTurno() {
  C.openModal(`<h3>Meta del turno</h3>
    <div class="field"><label>Sacos de la línea en el turno</label><input type="number" id="mt-v" inputmode="numeric" min="1" step="1" value="${T.turno.meta_turno ?? ''}"></div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn go" id="mt-ok">Guardar</button></div>`)
  const i = document.getElementById('mt-v'); setTimeout(() => i.focus(), 50)
  document.getElementById('mt-ok').addEventListener('click', () => {
    const v = +i.value; if (!v || v <= 0) { C.toast('Escribe la meta del turno.'); return }
    cambio('bh_turnos', 'update', { set: { meta_turno: v }, match: { id: T.turno.id } })
    C.closeModal(); pintarTurno()
  })
}

/* ---------- confirmaciones de borrado ---------- */
function confirmar(titulo, texto, alAceptar) {
  C.openModal(`<h3>${titulo}</h3><div class="hint" style="color:var(--muted);font-size:13px">${texto}</div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn danger" id="cf-ok">Sí, quitar</button></div>`)
  document.getElementById('cf-ok').addEventListener('click', () => { alAceptar(); C.closeModal(); pintarTurno() })
}

/* ---------- clics ---------- */
async function onClick(e) {
  const x = e.target.closest('[data-a]'); if (!x) return
  const id = x.dataset.id
  switch (x.dataset.a) {
    case 'nuevoTurno': return modalNuevoTurno()
    case 'abrir': return abrirTurno(id)
    case 'volver': return pintarLista()
    case 'vistaLista': vistaLista = x.dataset.v; return pintarLista()
    case 'filtroEstado': filtroEstado = x.dataset.v; return pintarLista()
    case 'hoja': hojaActual = id; vistaTurno = 'hojas'; return pintarTurno()
    case 'vistaGeneral': vistaTurno = 'general'; return pintarTurno()
    case 'vistaPersonas': vistaTurno = 'personas'; return pintarTurno()
    case 'verMarcador': return C.verMarcador(x.dataset.c)
    case 'ptPersona': return modalPersonasPT()
    case 'ptProd': return modalProduccionPT(x.dataset.c)
    case 'ptFuera': return modalFueraPT(x.dataset.c)
    case 'ptBorrar': cambio('bh_pt', 'delete', { id }); return pintarTurno()
    case 'ptQuitar': {
      const c = x.dataset.c
      return confirmar('Quitar persona', `¿Quitar a <b>${C.esc(opNombre(c))}</b> de este turno? Se borra también lo que tenía anotado.`, () => {
        T.pt.filter(r => r.cedula === c).forEach(r => cambio('bh_pt', 'delete', { id: r.id }))
        const p = T.ptp.find(r => r.cedula === c); if (p) cambio('bh_pt_personas', 'delete', { id: p.id })
        pintarTurno()
      })
    }
    case 'proyeccion': verProyeccion = !verProyeccion; return pintarTurno()
    case 'toggleMapa': hojasMapa.has(hojaActual) ? hojasMapa.delete(hojaActual) : hojasMapa.add(hojaActual); guardarMapa(); return pintarTurno()
    case 'verBloque': {
      // Desde el mapa: abre el detalle de la hoja con esa operación expandida y la muestra.
      if (vistaTurno === 'general') return
      hojasMapa.delete(hojaActual); guardarMapa(); colapsados.delete(id); guardarColapsados(); pintarTurno()
      const toggle = el.querySelector(`[data-a="toggleBloque"][data-id="${id}"]`)
      if (toggle) toggle.closest('.bh-bloque').scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    case 'metaTurno': return modalMetaTurno()
    case 'editarTurno': return modalEditarTurno()
    case 'editarHoja': return modalReferencia(id)
    case 'editarAsig': return modalEditarPersona(id)
    case 'factor': {
      const a = T.asig.find(y => y.id === id); if (!a) return
      const f = await preguntarFactor(a.cedula, T.bloques.find(b => b.id === a.bloque_id), +a.factor)
      cambio('bh_asignaciones', 'upsert', { ...a, factor: f }); C.closeModal(); return pintarTurno()
    }
    case 'eliminarTurno': {
      const t = T.turno
      C.openModal(`<h3>Eliminar turno</h3><div class="hint" style="color:var(--muted);font-size:13px">¿Eliminar el turno <b>${C.esc(lineaTxt(t.linea))} · ${C.esc(turnoTxt(t.turno))}</b> del ${fechaTxt(t.fecha)} con todas sus referencias, operaciones y registros? <b>No se puede deshacer.</b></div>
        <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn danger" id="el-ok">Sí, eliminar</button></div>`)
      document.getElementById('el-ok').addEventListener('click', async () => {
        encolar('bh_turnos', 'delete', { id: t.id })
        // Espera a que la cola termine de enviar (máx. 8 s) para que la lista ya no lo muestre.
        for (let i = 0; i < 40 && cola.length; i++) { await enviar(); await new Promise(r => setTimeout(r, 200)) }
        try { localStorage.removeItem('bh_turno_' + t.id) } catch (e) {}
        C.closeModal(); C.toast('Turno eliminado.'); pintarLista()
      })
      return
    }
    case 'toggleBloque': colapsados.has(id) ? colapsados.delete(id) : colapsados.add(id); guardarColapsados(); return pintarTurno()
    case 'toggleTodos': {
      const ids = T.bloques.filter(b => b.hoja_id === hojaActual).map(b => b.id)
      const todos = ids.every(i => colapsados.has(i))
      ids.forEach(i => todos ? colapsados.delete(i) : colapsados.add(i))
      guardarColapsados(); return pintarTurno()
    }
    case 'referencia': return modalReferencia()
    case 'operacion': return modalOperacion()
    case 'editarBloque': return modalOperacion(id)
    case 'personas': return modalPersonas(id)
    case 'celda': return modalCelda(id, +x.dataset.h)
    case 'terminar': return modalTerminar()
    case 'quitarAsig': {
      const a = T.asig.find(y => y.id === id)
      return confirmar('Quitar persona', `¿Quitar a <b>${C.esc(opNombre(a.cedula))}</b> de esta operación? Se borran sus horas registradas en ella.`, () => cambio('bh_asignaciones', 'delete', { id }))
    }
    case 'quitarBloque': {
      const b = T.bloques.find(y => y.id === id)
      return confirmar('Quitar operación', `¿Quitar <b>${C.esc(b.operacion)}</b> con sus personas y horas registradas?`, () => cambio('bh_bloques', 'delete', { id }))
    }
    case 'quitarHoja': {
      const h = T.hojas.find(y => y.id === hojaActual)
      return confirmar('Quitar referencia', `¿Quitar <b>${C.esc(h.codigo)}</b> de este turno con todas sus operaciones y registros?`, () => cambio('bh_hojas', 'delete', { id: h.id }))
    }
  }
}
