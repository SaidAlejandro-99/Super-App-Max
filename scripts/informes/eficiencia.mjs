// Informe de eficiencia del personal en Excel (lo usa el subagente de Informes).
// Uso: node scripts/informes/eficiencia.mjs <datos.json> <salida.xlsx> <desde> <hasta>
// datos.json: [{ fuente, fecha, turno, orden, linea, supervisor, pid, nombre, nivel, operacion,
//   horas, unidades, horas_ganadas, meta_h }]
//   - una fila por persona, turno y operación (Bi-horario) o por persona, día y operación (histórico);
//   - horas = horas disponibles (60 min por hora registrada menos el tiempo muerto que descuenta);
//   - horas_ganadas = unidades ÷ meta efectiva (horas estándar);
//   - pid = identificador interno de la persona (no es la cédula; no se escribe en el archivo).
// Eficiencia = horas ganadas ÷ horas disponibles, siempre ponderada por horas.
// Las filas con más de 200 % (meta probablemente mal digitada) no entran en ningún total, resumen ni ranking;
// se listan aparte en la hoja "Filas excluidas" para revisarlas.
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'

const [datosPath, salida, desde, hasta] = process.argv.slice(2)
if (!datosPath || !salida) { console.error('Uso: eficiencia.mjs <datos.json> <salida.xlsx> <desde> <hasta>'); process.exit(1) }
const todas = JSON.parse(readFileSync(datosPath, 'utf8')).map(f => ({ ...f, horas: +f.horas || 0, horas_ganadas: +f.horas_ganadas || 0, unidades: +f.unidades || 0, meta_h: f.meta_h == null ? null : +f.meta_h }))

const LINEAS = { PANEL: 'Panel', CIRCULAR: 'Circular', '4PANEL': '4 Panel', UPANEL: 'U-panel', ALTERNAS: 'Líneas alternas', PORTASACOS: 'Portasacos', CERROMATOSO: 'Cerro Matoso' }
// Nombres del Excel de bi-horarios → nombres del Bi-horario, solo donde la equivalencia es clara.
const OPS = { 'PREP F': 'Preparación fondo', 'PREP T': 'Preparación tapa', 'PEGUE FONDO': 'Pegue fondo', 'PEGUE TAPA': 'Pegue tapa',
  'PEGUE REATA': 'Pegue reata', CIERRE: 'Cierre', BAFLE: 'Pegue bafles', 'PEGUE SOL': 'Pegue solapa',
  'PREP SOLAPA': 'Preparación solapa', 'PREP REATA': 'Preparación reata', 'PRE UP': 'Preparación upanel', 'PEGUE CIN': 'Pegue cintilla',
  CAPUCHON: 'Capuchón', 'PAÑUELO': 'Pegue pañuelo', SOPLADO: 'Soplado', REBORDE: 'Reborde', PETALO: 'Pegue pétalos', 'PREP BASE': 'Preparación base', REVISION: 'Revisión' }
const titulo = s => String(s || '').toLowerCase().replace(/(^|[\s(/.-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
// Los demás nombres en mayúsculas pasan a 'Primera letra en mayúscula' (los códigos como DD7 se dejan igual).
const frase = s => /^[A-Z]{1,3}\d+$/.test(s) ? s : s.charAt(0) + s.slice(1).toLowerCase()
const opNombre = o => OPS[String(o || '').toUpperCase()] || (o === String(o).toUpperCase() ? frase(String(o)) : o)
const linea = l => LINEAS[l] || l
// "MARTINEZ CANO ADEL" → "Adel Martinez"
const nombreCorto = n => { const p = String(n || '').toLowerCase().split(' ').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)); return p.length >= 3 ? `${p[2]} ${p[0]}` : p.reverse().join(' ') }
// Si dos personas quedan con el mismo nombre corto, se usa el nombre completo.
const cortos = new Map()
todas.forEach(f => { const c = nombreCorto(f.nombre); const s = cortos.get(c) || new Set(); s.add(f.pid); cortos.set(c, s) })
const nombre = f => { const c = nombreCorto(f.nombre); return cortos.get(c).size > 1 ? titulo(f.nombre) : c }
const supervisor = s => s ? s.split(' / ').map(nombreCorto).join(' / ') : ''

const VERDE = 'FF1B4332', LIMA = 'FFC3D35A', GRIS = 'FFEEF2EA', ROJO = 'FFFDE2E1'
const fecha = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
const ddmm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7)
const ef = (g, h) => h > 0 ? g / h : null
const META = 0.9, RARA = 2
// También cuenta como inflada una fila con unidades pero sin horas disponibles (eficiencia infinita).
const inflada = f => f.horas_ganadas > RARA * f.horas
const filas = todas.filter(f => !inflada(f))
const excluidas = todas.filter(inflada)
const tituloLibro = `Eficiencia del personal · ${desde} a ${hasta}`

const wb = new ExcelJS.Workbook()
wb.creator = 'SuperApp Max'

function encabezado(ws, columnas, sub) {
  ws.columns = columnas.map(c => ({ key: c.key, width: c.width, style: c.style || {} }))
  ws.mergeCells(1, 1, 1, columnas.length)
  ws.getCell(1, 1).value = tituloLibro
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: VERDE } }
  ws.mergeCells(2, 1, 2, columnas.length)
  ws.getCell(2, 1).value = sub
  ws.getCell(2, 1).font = { italic: true, size: 10, color: { argb: 'FF5C6B61' } }
  ws.getCell(2, 1).alignment = { wrapText: true, vertical: 'top' }
  ws.getRow(2).height = 42
  const h = ws.getRow(4)
  columnas.forEach((c, i) => { h.getCell(i + 1).value = c.header })
  h.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    c.border = { bottom: { style: 'medium', color: { argb: LIMA } } }
  })
  h.height = 30
  ws.views = [{ state: 'frozen', ySplit: 4 }]
}
function filtros(ws, n, cols) { if (n) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + n, column: cols } } }
function filaTotal(ws, etiquetaCol, valores) {
  const r = ws.addRow({})
  r.getCell(etiquetaCol).value = 'TOTAL'
  Object.entries(valores).forEach(([col, v]) => { r.getCell(+col).value = v })
  r.eachCell(c => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } } })
}
const pctCol = (header, key, width = 11) => ({ header, key, width, style: { numFmt: '0.0%', alignment: { horizontal: 'center' } } })
const numCol = (header, key, width = 10, fmt = '#,##0') => ({ header, key, width, style: { numFmt: fmt } })

const totH = filas.reduce((s, f) => s + f.horas, 0), totG = filas.reduce((s, f) => s + f.horas_ganadas, 0), totU = filas.reduce((s, f) => s + f.unidades, 0)
const fuentes = [...new Set(filas.map(f => f.fuente))]
const criterio = `Eficiencia = horas estándar ganadas (unidades ÷ meta efectiva; meta efectiva = meta/h × factor de polivalencia) ÷ horas disponibles (60 min por hora registrada menos el tiempo muerto que descuenta; la tardanza no descuenta). Ponderada por horas. Se excluyen ${excluidas.length} filas de más de ${RARA * 100} % (meta probablemente mal digitada); ver hoja Filas excluidas.`

// ---------- Por persona ----------
const personas = new Map()
filas.forEach(f => {
  const p = personas.get(f.pid) || { nombre: nombre(f), nivel: f.nivel, h: 0, g: 0, u: 0, h90: 0, lineas: new Map(), ops: new Map(), dias: new Map() }
  p.h += f.horas; p.g += f.horas_ganadas; p.u += f.unidades
  const e = ef(f.horas_ganadas, f.horas); if (e != null && e >= META) p.h90 += f.horas
  p.lineas.set(f.linea, (p.lineas.get(f.linea) || 0) + f.horas)
  p.ops.set(opNombre(f.operacion), (p.ops.get(opNombre(f.operacion)) || 0) + f.horas)
  const d = p.dias.get(f.fecha) || { h: 0, g: 0 }; d.h += f.horas; d.g += f.horas_ganadas; p.dias.set(f.fecha, d)
  personas.set(f.pid, p)
})
const mayor = m => [...m.entries()].sort((a, b) => b[1] - a[1])
const listaPersonas = [...personas.values()].map(p => {
  const ops = mayor(p.ops).map(x => x[0])
  // Mejor y peor día: solo días con al menos 2 h disponibles (si no hay, todos los días).
  let dias = [...p.dias.entries()].filter(([, d]) => d.h >= 2)
  if (!dias.length) dias = [...p.dias.entries()].filter(([, d]) => d.h > 0)
  dias = dias.map(([k, d]) => [k, d.g / d.h]).sort((a, b) => b[1] - a[1])
  const txt = x => x ? `${ddmm(x[0])} (${Math.round(x[1] * 100)} %)` : ''
  return { nombre: p.nombre, linea: linea(mayor(p.lineas)[0][0]), nivel: p.nivel, dias: p.dias.size, horas: p.h,
    operaciones: ops.slice(0, 3).join(', ') + (ops.length > 3 ? ` (+${ops.length - 3})` : ''), unidades: p.u,
    ef: ef(p.g, p.h), pct90: p.h ? p.h90 / p.h : null, mejor: txt(dias[0]), peor: dias.length > 1 ? txt(dias[dias.length - 1]) : '' }
}).sort((a, b) => (b.ef ?? -1) - (a.ef ?? -1))

const rp = wb.addWorksheet('Resumen por persona')
encabezado(rp, [
  { header: 'Operario', key: 'nombre', width: 26 },
  { header: 'Línea principal', key: 'linea', width: 16 },
  { header: 'Nivel', key: 'nivel', width: 7, style: { alignment: { horizontal: 'center' } } },
  numCol('Días trabajados', 'dias', 9),
  numCol('Horas', 'horas', 9, '#,##0.0'),
  { header: 'Operaciones', key: 'operaciones', width: 42 },
  numCol('Unidades', 'unidades', 11),
  pctCol('Eficiencia', 'ef'),
  pctCol('% de horas en 90 % o más', 'pct90', 12),
  { header: 'Mejor día', key: 'mejor', width: 14, style: { alignment: { horizontal: 'center' } } },
  { header: 'Peor día', key: 'peor', width: 14, style: { alignment: { horizontal: 'center' } } },
], `${criterio} Fuentes: ${fuentes.join(' y ')}. "% de horas en 90 % o más" cuenta las horas de cada turno y operación en que la persona llegó al 90 %. Mejor y peor día: solo días con 2 h o más. Unidades = piezas de cada operación, no sacos.`)
listaPersonas.forEach(p => rp.addRow(p))
filtros(rp, listaPersonas.length, 11)
filaTotal(rp, 1, { 5: totH, 7: totU, 8: ef(totG, totH) })

// ---------- Detalle diario ----------
const dd = wb.addWorksheet('Detalle diario')
encabezado(dd, [
  { header: 'Fecha', key: 'fecha', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
  { header: 'Turno', key: 'turno', width: 8, style: { alignment: { horizontal: 'center' } } },
  { header: 'Línea', key: 'linea', width: 16 },
  { header: 'Supervisor', key: 'supervisor', width: 24 },
  { header: 'Operario', key: 'nombre', width: 26 },
  { header: 'Operación', key: 'operacion', width: 26 },
  numCol('Horas', 'horas', 8, '#,##0.0'),
  numCol('Unidades', 'unidades', 10),
  numCol('Meta/h', 'meta_h', 9, '#,##0.0'),
  pctCol('Eficiencia', 'ef'),
  { header: 'Fuente', key: 'fuente', width: 17 },
  { header: 'Observación', key: 'obs', width: 30 },
], `Una fila por persona, turno y operación (Bi-horario) o por persona, día y operación (histórico de Excel, sin turno ni supervisor). Si un día está en las dos fuentes para la misma persona, manda el Bi-horario. Meta/h = meta efectiva (con factor), promedio ponderado por horas. Las filas de más de ${RARA * 100} % no están aquí: van en la hoja Filas excluidas.`)
filas.forEach(f => {
  dd.addRow({ fecha: fecha(f.fecha), turno: f.turno || '', linea: linea(f.linea), supervisor: supervisor(f.supervisor), nombre: nombre(f),
    operacion: opNombre(f.operacion), horas: f.horas, unidades: f.unidades, meta_h: f.meta_h, ef: ef(f.horas_ganadas, f.horas), fuente: f.fuente,
    obs: f.horas === 0 ? 'Sin horas disponibles (parada toda la jornada)' : '' })
})
filtros(dd, filas.length, 12)
filaTotal(dd, 6, { 7: totH, 8: totU, 10: ef(totG, totH) })

// ---------- Por línea ----------
function agrupar(clave) {
  const m = new Map()
  filas.forEach(f => {
    const k = clave(f), o = m.get(k) || { k, personas: new Map(), h: 0, g: 0, metaH: 0, hMeta: 0 }
    o.h += f.horas; o.g += f.horas_ganadas
    if (f.meta_h != null) { o.metaH += f.meta_h * f.horas; o.hMeta += f.horas }
    const p = o.personas.get(f.pid) || { h: 0, g: 0 }; p.h += f.horas; p.g += f.horas_ganadas; o.personas.set(f.pid, p)
    m.set(k, o)
  })
  return [...m.values()].map(o => ({ ...o, ef: ef(o.g, o.h), n: o.personas.size,
    n90: [...o.personas.values()].filter(p => p.h > 0 && p.g / p.h >= META).length })).sort((a, b) => b.h - a.h)
}
const lin = agrupar(f => linea(f.linea))
const rl = wb.addWorksheet('Resumen por línea')
encabezado(rl, [
  { header: 'Línea', key: 'k', width: 18 },
  numCol('Personas', 'n', 10),
  numCol('Horas', 'h', 10, '#,##0.0'),
  pctCol('Eficiencia ponderada', 'ef', 13),
  numCol('Personas en 90 % o más', 'n90', 13),
  pctCol('% de personas en 90 % o más', 'p90', 13),
], `${criterio} Una persona cuenta en cada línea donde trabajó, con su eficiencia en esa línea.`)
lin.forEach(o => rl.addRow({ ...o, p90: o.n ? o.n90 / o.n : null }))
filtros(rl, lin.length, 6)
const nP = personas.size, n90P = listaPersonas.filter(p => p.ef != null && p.ef >= META).length
filaTotal(rl, 1, { 2: nP, 3: totH, 4: ef(totG, totH), 5: n90P, 6: nP ? n90P / nP : null })

// ---------- Por operación ----------
const ops = agrupar(f => opNombre(f.operacion))
const ro = wb.addWorksheet('Resumen por operación')
encabezado(ro, [
  { header: 'Operación', key: 'k', width: 30 },
  numCol('Personas', 'n', 10),
  numCol('Horas', 'h', 10, '#,##0.0'),
  pctCol('Eficiencia ponderada', 'ef', 13),
  numCol('Meta/h promedio', 'meta', 11, '#,##0.0'),
], `${criterio} Meta/h promedio ponderada por horas. Los nombres abreviados del Excel histórico se unificaron con los del Bi-horario cuando la equivalencia es clara (p. ej. PREP F = Preparación fondo); los demás quedan con su nombre.`)
ops.forEach(o => ro.addRow({ ...o, meta: o.hMeta ? o.metaH / o.hMeta : null }))
filtros(ro, ops.length, 5)
filaTotal(ro, 1, { 2: nP, 3: totH, 4: ef(totG, totH) })

// ---------- Filas excluidas ----------
const fx = wb.addWorksheet('Filas excluidas')
encabezado(fx, [
  { header: 'Fecha', key: 'fecha', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
  { header: 'Turno', key: 'turno', width: 8, style: { alignment: { horizontal: 'center' } } },
  { header: 'Línea', key: 'linea', width: 16 },
  { header: 'Operario', key: 'nombre', width: 26 },
  { header: 'Operación', key: 'operacion', width: 26 },
  numCol('Horas', 'horas', 8, '#,##0.0'),
  numCol('Unidades', 'unidades', 10),
  numCol('Meta/h', 'meta_h', 9, '#,##0.0'),
  pctCol('Eficiencia', 'ef'),
  { header: 'Fuente', key: 'fuente', width: 17 },
  { header: 'Motivo', key: 'motivo', width: 30 },
], `Filas (persona, turno o día y operación) con más de ${RARA * 100} % de eficiencia (o con unidades pero sin horas disponibles). Casi siempre es una meta mal digitada. No entran en ningún total, resumen ni ranking de este libro. Revisar la meta y, si se corrige, volver a generar el informe.`)
const exOrden = [...excluidas].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.orden || 0) - (b.orden || 0) || String(a.linea).localeCompare(String(b.linea)))
exOrden.forEach(f => {
  const r = fx.addRow({ fecha: fecha(f.fecha), turno: f.turno || '', linea: linea(f.linea), nombre: nombre(f), operacion: opNombre(f.operacion),
    horas: f.horas, unidades: f.unidades, meta_h: f.meta_h, ef: ef(f.horas_ganadas, f.horas), fuente: f.fuente,
    motivo: f.horas > 0 ? `Más de ${RARA * 100} %: revisar meta` : 'Unidades sin horas disponibles' })
  r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROJO } } })
})
filtros(fx, excluidas.length, 11)
const exH = excluidas.reduce((s, f) => s + f.horas, 0), exU = excluidas.reduce((s, f) => s + f.unidades, 0)
filaTotal(fx, 5, { 6: exH, 7: exU })
fx.getCell(fx.rowCount, 5).value = `TOTAL (${excluidas.length} filas)`

await wb.xlsx.writeFile(salida)
const exP = new Set(excluidas.map(f => f.pid)).size
console.log(`Listo: ${salida} · ${filas.length} filas · ${nP} personas · ${totH.toFixed(1)} h · eficiencia ${(ef(totG, totH) * 100).toFixed(1)} % · excluidas ${excluidas.length} filas > ${RARA * 100} % (${exP} personas, ${exH.toFixed(1)} h)`)
