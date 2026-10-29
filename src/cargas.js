// Cargar archivos (Métodos y Tiempos → Cargar archivos, solo admin).
// El Excel se lee en el computador y solo se suben las columnas que usa la app:
//  - Pedidos ("BDD ANGIE V2" del PLANNING): pedido → código, para buscar la referencia.
//  - Plan ("MAESTRO_PROG" de SUPERSACOS): producción futura y pedido → código.
//  - Programación ("Prog. Personal" de NOVEDADES NÓMINA): línea, grupo y turno de cada persona.
// Las funciones leer* no tocan la pantalla ni la base de datos (se prueban aparte).

const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
// Las celdas vacías con formato de fecha llegan como 1899/1900: no son fechas reales.
const iso = v => v instanceof Date && !isNaN(v) && v.getFullYear() >= 2000 ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : null
const numero = v => typeof v === 'number' && isFinite(v) ? v : null
const texto = v => v == null ? '' : String(v).trim()
const conCodigo = c => !!c && c !== '-' && c.length > 5
// Busca la fila de encabezados (la que tiene todas las columnas pedidas) y el índice de cada una.
function encabezados(rows, nombres, max = 15) {
  for (let i = 0; i < Math.min(rows.length, max); i++) {
    const H = (rows[i] || []).map(norm)
    const idx = nombres.map(n => H.findIndex(h => h === n || h.startsWith(n)))
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

// Plan: los pedidos que no están entregados forman la producción futura (por código).
const ENTREGADO = /ENTREGAD/
export function leerPlan(rows) {
  const e = encabezados(rows, ['LINEA', 'PEDIDO PLANEADOR DYN', 'CLIENTE', 'UNDS', 'FECHA DE DESPACHO PACTADA', 'CODIGO DYNAMICS', 'DESCRIPCION DYNAMICS', 'STATUS', 'FI PROD'])
  if (!e) return null
  const c = e.idx, pedidos = new Map(), porCodigo = new Map()
  rows.slice(e.fila + 1).forEach(r => {
    if (!r) return
    const codigo = texto(r[c['CODIGO DYNAMICS']]).toUpperCase(); if (!conCodigo(codigo)) return
    const estado = texto(r[c.STATUS]).toUpperCase(), planeador = texto(r[c['PEDIDO PLANEADOR DYN']])
    const despacho = iso(r[c['FECHA DE DESPACHO PACTADA']]), inicio = iso(r[c['FI PROD']])
    if (planeador) pedidos.set(planeador, { planeador, origen: 'plan', pedido: planeador.split('-')[0], codigo, cliente: texto(r[c.CLIENTE]), linea: texto(r[c.LINEA]),
      referencia: texto(r[c['DESCRIPCION DYNAMICS']]).slice(0, 200), recibido: null, entrega: despacho, cantidad: numero(r[c.UNDS]), saldo: null, estado })
    if (ENTREGADO.test(estado)) return
    const p = porCodigo.get(codigo) || { codigo, cliente: texto(r[c.CLIENTE]), descripcion: texto(r[c['DESCRIPCION DYNAMICS']]).slice(0, 60), linea: texto(r[c.LINEA]), prox_fab: null, ult_fab: null, veces: 0 }
    const f = inicio || despacho
    if (f && (!p.prox_fab || f < p.prox_fab)) p.prox_fab = f
    if (despacho && (!p.ult_fab || despacho > p.ult_fab)) p.ult_fab = despacho
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
  pedidos: { titulo: 'Pedidos', archivo: 'PLANNING SUPER SACOS 2026 (.xlsm)', hoja: /BDD ANGIE V2/i,
    que: 'Solo los pedidos con código. No se suben precios. En el Bi-horario, el supervisor busca la referencia por número de pedido.' },
  plan: { titulo: 'Plan de producción', archivo: 'SUPERSACOS (.xlsx)', hoja: /^MAESTRO_PROG$/i,
    que: 'Los pedidos que faltan por entregar: actualiza "Producción futura" y también sirve para buscar por pedido.' },
  programacion: { titulo: 'Programación del personal', archivo: 'NOVEDADES NÓMINA SUPER SACOS (.xlsx)', hoja: /^PROG\. PERSONAL/i,
    que: 'Línea, grupo (supervisor) y operación de cada persona, y su turno de hoy a 14 días. Al escoger personas en el Bi-horario salen primero las de esa línea, ese grupo y ese turno.' },
}
const leidos = {}

export async function render(el) {
  const { data } = await C.supabase.from('config').select('clave, valor').in('clave', ['carga_pedidos', 'carga_plan', 'carga_programacion'])
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
    const hoja = nombres.find(n => ARCHIVOS[k].hoja.test(n.trim()))
    if (!hoja) { info.innerHTML = `No encontré la hoja que necesito en este archivo. ¿Es <b>${C.esc(ARCHIVOS[k].archivo)}</b>?`; return }
    const wb = window.XLSX.read(buf, { type: 'array', cellDates: true, dense: true, sheets: [hoja] })
    const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: null, blankrows: false })
    let r
    if (k === 'pedidos') {
      r = leerPedidos(rows); if (!r) throw new Error('no encontré las columnas de pedidos')
      info.innerHTML = `Hoja <b>${C.esc(hoja)}</b>: <b>${C.fmt0(r.length)}</b> pedidos con código, de ${C.fmt0(new Set(r.map(p => p.codigo)).size)} códigos.`
    } else if (k === 'plan') {
      r = leerPlan(rows); if (!r) throw new Error('no encontré las columnas del MAESTRO_PROG')
      info.innerHTML = `Hoja <b>${C.esc(hoja)}</b>: <b>${C.fmt0(r.pedidos.length)}</b> pedidos; <b>${C.fmt0(r.planning.length)}</b> códigos por fabricar (producción futura).`
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
  ok.disabled = true; info.textContent = 'Subiendo…'
  try {
    let resumen = ''
    if (k === 'pedidos') {
      let x = await C.supabase.from('pedidos').delete().eq('origen', 'bdd'); if (x.error) throw x.error
      await enLotes('pedidos', r)
      await codigosNuevos(r)
      resumen = `${C.fmt0(r.length)} pedidos con código`
    } else if (k === 'plan') {
      let x = await C.supabase.from('pedidos').delete().eq('origen', 'plan'); if (x.error) throw x.error
      await enLotes('pedidos', r.pedidos)
      await codigosNuevos(r.pedidos)
      x = await C.supabase.from('planning').delete().neq('codigo', ''); if (x.error) throw x.error
      await enLotes('planning', r.planning)
      x = await C.supabase.from('config').upsert({ clave: 'corte_planning', valor: hoyISO(), updated_at: new Date().toISOString() }); if (x.error) throw x.error
      resumen = `${C.fmt0(r.planning.length)} códigos por fabricar, ${C.fmt0(r.pedidos.length)} pedidos`
    } else {
      // Personas: se actualizan las del archivo (las que no estén en el archivo no se tocan).
      await enLotes('operarios', r.personas.map(p => ({ ...p, updated_at: new Date().toISOString() })), { onConflict: 'cedula' })
      const hoy = hoyISO(), desde = masDias(hoy, -1), hasta = masDias(hoy, 14)
      const x = await C.supabase.from('programacion').delete().gte('fecha', desde).lte('fecha', hasta); if (x.error) throw x.error
      await enLotes('programacion', r.turnos)
      resumen = `${C.fmt0(r.personas.filter(p => p.activo).length)} personas activas, ${C.fmt0(r.turnos.length)} turnos programados`
    }
    await C.supabase.from('config').upsert({ clave: 'carga_' + k, valor: { fecha: new Date().toISOString(), resumen }, updated_at: new Date().toISOString() })
    info.innerHTML = `Listo: ${C.esc(resumen)}.`
    C.toast(`${ARCHIVOS[k].titulo}: ${resumen}.`)
    if (C.alCargar) C.alCargar(k)
  } catch (e) {
    info.textContent = 'Se interrumpió la carga: ' + (e.message || e) + '. Vuelve a intentarlo.'
    ok.disabled = false
  }
}
