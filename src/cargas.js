// Cargar archivos (Métodos y Tiempos → Cargar archivos, solo admin).
// El Excel se lee en el computador y solo se suben las columnas que usa la app:
//  - PLANNING SUPER SACOS (desde nov-2026, un solo archivo):
//      hoja "BDD": pedido → código, para buscar la referencia.
//      hoja "PROG PISO": programación de piso → producción futura (lo que no está TERMINADO).
//    (Antes el plan venía del MAESTRO_PROG del archivo SUPERSACOS; ese archivo ya no se usa.)
//  - Programación ("Prog. Personal" de NOVEDADES NÓMINA): línea, grupo y turno de cada persona.
// Las funciones leer* no tocan la pantalla ni la base de datos (se prueban aparte).

const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
// Las celdas vacías con formato de fecha llegan como 1899/1900: no son fechas reales.
// Si la celda no tiene formato de fecha llega como número de serie de Excel (46330 = 4-nov-2026).
const serial = n => { const d = new Date(Math.round((n - 25569) * 86400000)); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) }
const iso = v => {
  if (typeof v === 'number' && v > 36526 && v < 73051) v = serial(v)
  return v instanceof Date && !isNaN(v) && v.getFullYear() >= 2000 ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : null
}
const numero = v => typeof v === 'number' && isFinite(v) ? v : null
const texto = v => v == null ? '' : String(v).trim()
const conCodigo = c => !!c && c !== '-' && c.length > 5
// Busca la fila de encabezados (la que tiene todas las columnas pedidas) y el índice de cada una.
function encabezados(rows, nombres, max = 15) {
  for (let i = 0; i < Math.min(rows.length, max); i++) {
    const H = (rows[i] || []).map(norm)
    // Primero el nombre exacto ("PEDIDO" no debe tomar "PEDIDO PLAN"); si no, el que empiece así.
    const idx = nombres.map(n => { const k = H.indexOf(n); return k >= 0 ? k : H.findIndex(h => h.startsWith(n)) })
    if (idx.every(k => k >= 0)) return { fila: i, idx: Object.fromEntries(nombres.map((n, k) => [n, idx[k]])), H }
  }
  return null
}

export function leerPedidos(rows) {
  const e = encabezados(rows, ['PEDIDO', 'PEDIDO PLANEADOR', 'CODIGO DYN', 'CLIENTE', 'LINEA', 'REFERENCIA', 'RECIBIDO EN PROD', 'ENTREGA REAL', 'TOTAL PEDIDO', 'SALDO TOTAL'])
  if (!e) return null
  const c = e.idx, vistos = new Map()
  rows.slice(e.fila + 1).forEach(r => {
    if (!r) return
    const codigo = texto(r[c['CODIGO DYN']]).toUpperCase(), planeador = texto(r[c['PEDIDO PLANEADOR']])
    if (!conCodigo(codigo) || !planeador) return
    vistos.set(planeador, { planeador, origen: 'bdd', pedido: texto(r[c.PEDIDO]), codigo, cliente: texto(r[c.CLIENTE]), linea: texto(r[c.LINEA]),
      referencia: texto(r[c.REFERENCIA]).slice(0, 200), recibido: iso(r[c['RECIBIDO EN PROD']]), entrega: iso(r[c['ENTREGA REAL']]),
      cantidad: numero(r[c['TOTAL PEDIDO']]), saldo: numero(r[c['SALDO TOTAL']]), estado: '' })
  })
  return [...vistos.values()]
}

// Programación de piso (hoja "PROG PISO" del PLANNING): lo que no está TERMINADO es la producción futura.
export function leerProgPiso(rows) {
  const e = encabezados(rows, ['LINEA', 'PEDIDO PLAN', 'PEDIDO', 'CLIENTE', 'CANT', 'CODIGO', 'DESCRIPCION', 'ESTADO', 'F. INICIO', 'F. FIN'])
  if (!e) return null
  const c = e.idx, pedidos = new Map(), porCodigo = new Map()
  rows.slice(e.fila + 1).forEach(r => {
    if (!r) return
    const codigo = texto(r[c.CODIGO]).toUpperCase(); if (!conCodigo(codigo)) return
    const estado = texto(r[c.ESTADO]).toUpperCase(), planeador = texto(r[c['PEDIDO PLAN']])
    const inicio = iso(r[c['F. INICIO']]), fin = iso(r[c['F. FIN']])
    if (planeador) pedidos.set(planeador, { planeador, origen: 'plan', pedido: texto(r[c.PEDIDO]) || planeador.split('-')[0], codigo, cliente: texto(r[c.CLIENTE]), linea: texto(r[c.LINEA]),
      referencia: texto(r[c.DESCRIPCION]).slice(0, 200), recibido: null, entrega: fin, cantidad: numero(r[c.CANT]), saldo: null, estado })
    if (/TERMINAD|ENTREGAD/.test(estado)) return
    const p = porCodigo.get(codigo) || { codigo, cliente: texto(r[c.CLIENTE]), descripcion: texto(r[c.DESCRIPCION]).slice(0, 60), linea: texto(r[c.LINEA]), prox_fab: null, ult_fab: null, veces: 0 }
    const f = inicio || fin
    if (f && (!p.prox_fab || f < p.prox_fab)) p.prox_fab = f
    if (fin && (!p.ult_fab || fin > p.ult_fab)) p.ult_fab = fin
    p.veces++
    porCodigo.set(codigo, p)
  })
  const planning = [...porCodigo.values()].sort((a, b) => (a.prox_fab || '9999').localeCompare(b.prox_fab || '9999')).map((p, i) => ({ ...p, orden: i }))
  return { pedidos: [...pedidos.values()], planning }
}

// Programación: personas (sin administrativos) y su turno de cada día entre desde y hasta.
export function leerProgramacion(rows, desde, hasta) {
  const e = encabezados(rows, ['ID', 'NOMBRE', 'ESTADO', 'LINEA', 'GRUPO', 'ROL', 'OPERACION'])
  if (!e) return null
  const c = e.idx, encab = rows[e.fila]
  const dias = encab.map((v, k) => [k, iso(v)]).filter(([, f]) => f && f >= desde && f <= hasta)
  const personas = [], turnos = []
  rows.slice(e.fila + 1).forEach(r => {
    if (!r || typeof r[c.ID] !== 'number') return
    const rol = texto(r[c.ROL]), linea = texto(r[c.LINEA]).toUpperCase()
    if (/^admi/i.test(rol) || linea === 'PLANTA SS') return
    const cedula = String(r[c.ID])
    personas.push({ cedula, nombre: texto(r[c.NOMBRE]).replace(/\s+/g, ' ').toUpperCase(), activo: norm(r[c.ESTADO]) === 'ACTIVO',
      linea, grupo: norm(r[c.GRUPO]), rol: rol === '0' || rol === '-' ? '' : rol, operacion_base: texto(r[c.OPERACION]) === '0' ? '' : texto(r[c.OPERACION]) })
    if (norm(r[c.ESTADO]) !== 'ACTIVO') return
    dias.forEach(([k, fecha]) => { const v = texto(r[k]); if (v && v !== '0') turnos.push({ cedula, fecha, turno: v.toUpperCase() }) })
  })
  return { personas, turnos, dias: dias.length }
}

/* ---------- pantalla ---------- */
let C = null
export function init(ctx) { C = ctx }
const hoyISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const masDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const ARCHIVOS = {
  pedidos: { titulo: 'Planning: pedidos y programación de piso', archivo: 'PLANNING SUPER SACOS 2026 (.xlsm)', hoja: /^BDD( ANGIE.*)?$/i, hoja2: /^PROG PISO$/i,
    que: 'Hoja BDD: los pedidos con código (no se suben precios); en el Bi-horario el supervisor busca la referencia por número de pedido. Hoja PROG PISO: lo que no está TERMINADO actualiza "Producción futura".' },
  programacion: { titulo: 'Programación del personal', archivo: 'NOVEDADES NÓMINA SUPER SACOS (.xlsx)', hoja: /^PROG\.? ?PERSONAL/i,
    que: 'Línea, grupo (supervisor) y operación de cada persona, y su turno de hoy a 14 días. Al escoger personas en el Bi-horario salen primero las de esa línea, ese grupo y ese turno.' },
}
const leidos = {}

export async function render(el) {
  const { data } = await C.supabase.from('config').select('clave, valor').in('clave', ['carga_pedidos', 'carga_programacion'])
  const ult = Object.fromEntries((data || []).map(r => [r.clave.replace('carga_', ''), r.valor]))
  el.innerHTML = `
  <div class="section">
    <h2>Cargar archivos</h2>
    <div class="hint">Escoge el Excel de cada uno. Se lee en este computador y solo se suben las columnas que usa la app; lo anterior se reemplaza. No gasta créditos de Netlify. Hazlo desde el PC: el de planning pesa 10 MB.</div>
  </div>
  ${Object.entries(ARCHIVOS).map(([k, a]) => `
  <div class="section">
    <h2>${a.titulo}</h2>
    <div class="hint">Archivo: <b>${C.esc(a.archivo)}</b>. ${C.esc(a.que)}${ult[k] ? `<br>Última carga: <b>${C.esc(new Date(ult[k].fecha).toLocaleString('es-CO'))}</b> · ${C.esc(ult[k].resumen || '')}` : '<br>Aún no se ha cargado.'}</div>
    <div class="controls"><input type="file" accept=".xlsx,.xlsm,.xls" data-carga="${k}"></div>
    <div class="hint" id="cg-info-${k}"></div>
    <div class="controls"><button class="btn go" id="cg-ok-${k}" data-cargar="${k}" disabled>Cargar</button></div>
  </div>`).join('')}`
  el.querySelectorAll('[data-carga]').forEach(inp => inp.addEventListener('change', e => leerArchivo(inp.dataset.carga, e.target.files[0])))
  el.querySelectorAll('[data-cargar]').forEach(b => b.addEventListener('click', () => cargar(b.dataset.cargar)))
}

async function leerArchivo(k, f) {
  const info = document.getElementById('cg-info-' + k), ok = document.getElementById('cg-ok-' + k)
  ok.disabled = true; leidos[k] = null
  if (!f) return
  info.textContent = 'Leyendo el archivo… (puede tardar un minuto)'
  await new Promise(r => setTimeout(r, 30))
  try {
    const buf = await f.arrayBuffer()
    const nombres = window.XLSX.read(buf, { type: 'array', bookSheets: true }).SheetNames
    // Si cambian el nombre de la hoja (V3, 2027…) se toma la del número más alto; las "VIEJA" no.
    const ultimoNumero = n => +((n.match(/\d+/g) || ['0']).pop())
    const buscarHoja = re => nombres.filter(n => re.test(n.trim()) && !/VIEJ/i.test(n)).sort((a, b) => ultimoNumero(b) - ultimoNumero(a))[0]
    const hoja = buscarHoja(ARCHIVOS[k].hoja), hoja2 = ARCHIVOS[k].hoja2 ? buscarHoja(ARCHIVOS[k].hoja2) : null
    if (!hoja || (ARCHIVOS[k].hoja2 && !hoja2)) { info.innerHTML = `No encontré ${hoja ? 'la hoja PROG PISO' : 'la hoja que necesito'} en este archivo. ¿Es <b>${C.esc(ARCHIVOS[k].archivo)}</b>?`; return }
    const wb = window.XLSX.read(buf, { type: 'array', cellDates: true, dense: true, sheets: [hoja, hoja2].filter(Boolean) })
    const filasDe = h => window.XLSX.utils.sheet_to_json(wb.Sheets[h], { header: 1, defval: null, blankrows: false })
    const rows = filasDe(hoja)
    let r
    if (k === 'pedidos') {
      const ped = leerPedidos(rows); if (!ped) throw new Error('no encontré las columnas de pedidos en la hoja ' + hoja)
      const plan = leerProgPiso(filasDe(hoja2)); if (!plan) throw new Error('no encontré las columnas de la hoja ' + hoja2)
      r = { pedidos: ped, plan }
      info.innerHTML = `Hoja <b>${C.esc(hoja)}</b>: <b>${C.fmt0(ped.length)}</b> pedidos con código, de ${C.fmt0(new Set(ped.map(p => p.codigo)).size)} códigos.<br>
        Hoja <b>${C.esc(hoja2)}</b>: <b>${C.fmt0(plan.pedidos.length)}</b> lotes programados; <b>${C.fmt0(plan.planning.length)}</b> códigos por fabricar (producción futura).`
    } else {
      const hoy = hoyISO()
      r = leerProgramacion(rows, masDias(hoy, -1), masDias(hoy, 14)); if (!r) throw new Error('no encontré las columnas de la programación')
      info.innerHTML = `Hoja <b>${C.esc(hoja)}</b>: <b>${C.fmt0(r.personas.filter(p => p.activo).length)}</b> personas activas; turnos de <b>${r.dias}</b> días (de ayer a 14 días).`
    }
    leidos[k] = r; ok.disabled = false
  } catch (e) { info.textContent = 'No se pudo leer el archivo: ' + e.message }
}

async function enLotes(tabla, filas, opciones) {
  for (let i = 0; i < filas.length; i += 1000) {
    const q = opciones ? C.supabase.from(tabla).upsert(filas.slice(i, i + 1000), opciones) : C.supabase.from(tabla).insert(filas.slice(i, i + 1000))
    const { error } = await q; if (error) throw error
  }
}
// Los códigos de los pedidos que no existan en Métodos y Tiempos se crean (sin tiempos),
// para que el supervisor pueda usarlos en el Bi-horario. Los que ya existen no se tocan.
async function codigosNuevos(pedidos) {
  const m = new Map()
  pedidos.forEach(x => { if (!m.has(x.codigo)) m.set(x.codigo, { codigo: x.codigo, cliente: x.cliente, descripcion: x.referencia.slice(0, 120), linea: x.linea }) })
  await enLotes('codigos', [...m.values()], { onConflict: 'codigo', ignoreDuplicates: true })
}
async function cargar(k) {
  const r = leidos[k]; if (!r) return
  const info = document.getElementById('cg-info-' + k), ok = document.getElementById('cg-ok-' + k)
  // Protección: si el archivo trae muchos menos datos que la carga anterior, se pregunta antes.
  const n = k === 'pedidos' ? r.pedidos.length : r.personas.filter(p => p.activo).length
  const { data: prev } = await C.supabase.from('config').select('valor').eq('clave', 'carga_' + k).maybeSingle()
  const antes = prev && prev.valor && prev.valor.n
  if (antes && n < antes * 0.7 && !window.confirm(`Este archivo trae ${n} y la carga anterior tenía ${antes}. ¿Seguro que es el archivo correcto?`)) return
  ok.disabled = true; info.textContent = 'Subiendo…'
  try {
    let resumen = ''
    if (k === 'pedidos') {
      // Pedidos (BDD) y programación de piso (PROG PISO) reemplazan lo que venía del PLANNING y del MAESTRO_PROG.
      let x = await C.supabase.from('pedidos').delete().in('origen', ['bdd', 'plan']); if (x.error) throw x.error
      await enLotes('pedidos', r.pedidos)
      await enLotes('pedidos', r.plan.pedidos)
      await codigosNuevos([...r.pedidos, ...r.plan.pedidos])
      x = await C.supabase.from('planning').delete().neq('codigo', ''); if (x.error) throw x.error
      await enLotes('planning', r.plan.planning)
      x = await C.supabase.from('config').upsert({ clave: 'corte_planning', valor: hoyISO(), updated_at: new Date().toISOString() }); if (x.error) throw x.error
      resumen = `${C.fmt0(r.pedidos.length)} pedidos con código, ${C.fmt0(r.plan.planning.length)} códigos por fabricar`
    } else {
      // Personas: se actualizan las del archivo (las que no estén en el archivo no se tocan).
      await enLotes('operarios', r.personas.map(p => ({ ...p, updated_at: new Date().toISOString() })), { onConflict: 'cedula' })
      const hoy = hoyISO(), desde = masDias(hoy, -1), hasta = masDias(hoy, 14)
      const x = await C.supabase.from('programacion').delete().gte('fecha', desde).lte('fecha', hasta); if (x.error) throw x.error
      await enLotes('programacion', r.turnos)
      resumen = `${C.fmt0(r.personas.filter(p => p.activo).length)} personas activas, ${C.fmt0(r.turnos.length)} turnos programados`
    }
    await C.supabase.from('config').upsert({ clave: 'carga_' + k, valor: { fecha: new Date().toISOString(), resumen, n }, updated_at: new Date().toISOString() })
    info.innerHTML = `Listo: ${C.esc(resumen)}.`
    C.toast(`${ARCHIVOS[k].titulo}: ${resumen}.`)
    if (C.alCargar) C.alCargar(k)
  } catch (e) {
    info.textContent = 'Se interrumpió la carga: ' + (e.message || e) + '. Vuelve a intentarlo.'
    ok.disabled = false
  }
}
