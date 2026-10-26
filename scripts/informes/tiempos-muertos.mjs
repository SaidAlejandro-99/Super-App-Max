// Informe de tiempos muertos en Excel (lo usa el subagente de Informes).
// Uso: node scripts/informes/tiempos-muertos.mjs <datos.json> <salida.xlsx> <desde> <hasta> [perdidas.json]
// datos.json: [{ fecha, turno, linea, codigo, descripcion, minutos }]
// perdidas.json (opcional): [{ fecha, turno, linea, operacion, nombre, codigo, descripcion,
//   tm_minutos, ritmo_real, meta, unidades_perdidas }]
// Las consultas están en .claude/agents/informes.md.
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'

const [datosPath, salida, desde, hasta, perdidasPath] = process.argv.slice(2)
if (!datosPath || !salida) { console.error('Uso: tiempos-muertos.mjs <datos.json> <salida.xlsx> <desde> <hasta> [perdidas.json]'); process.exit(1) }
const filas = JSON.parse(readFileSync(datosPath, 'utf8'))
const perdidas = perdidasPath ? JSON.parse(readFileSync(perdidasPath, 'utf8')) : null
// "MARTINEZ CANO ADEL" → "Adel Martinez"
const nombreCorto = n => { const p = String(n || '').toLowerCase().split(' ').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)); return p.length >= 3 ? `${p[2]} ${p[0]}` : p.reverse().join(' ') }

const LINEAS = { PANEL: 'Panel', CIRCULAR: 'Circular', '4PANEL': '4 Panel', UPANEL: 'U-panel', ALTERNAS: 'Líneas alternas', PORTASACOS: 'Portasacos', CERROMATOSO: 'Cerro Matoso' }
const VERDE = 'FF1B4332', LIMA = 'FFC3D35A', GRIS = 'FFEEF2EA'
const fecha = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
const titulo = `Tiempos muertos · ${desde} a ${hasta}`

const wb = new ExcelJS.Workbook()
wb.creator = 'SuperApp Max'

function encabezado(ws, columnas, sub) {
  ws.columns = columnas.map(c => ({ key: c.key, width: c.width, style: c.style || {} }))
  ws.mergeCells(1, 1, 1, columnas.length)
  Object.assign(ws.getCell(1, 1), { value: titulo })
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: VERDE } }
  ws.mergeCells(2, 1, 2, columnas.length)
  ws.getCell(2, 1).value = sub
  ws.getCell(2, 1).font = { italic: true, size: 10, color: { argb: 'FF5C6B61' } }
  const h = ws.getRow(4)
  columnas.forEach((c, i) => { h.getCell(i + 1).value = c.header })
  h.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    c.border = { bottom: { style: 'medium', color: { argb: LIMA } } }
  })
  h.height = 22
  ws.views = [{ state: 'frozen', ySplit: 4 }]
}
function filaTotal(ws, etiquetaCol, valores) {
  const r = ws.addRow({})
  r.getCell(etiquetaCol).value = 'TOTAL'
  Object.entries(valores).forEach(([col, v]) => { r.getCell(+col).value = v })
  r.eachCell(c => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } } })
}

// Hoja 1: el formato pedido.
const ws = wb.addWorksheet('Tiempos muertos')
encabezado(ws, [
  { header: 'Fecha', key: 'fecha', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
  { header: 'Turno', key: 'turno', width: 8, style: { alignment: { horizontal: 'center' } } },
  { header: 'Línea', key: 'linea', width: 16 },
  { header: 'Código', key: 'codigo', width: 9, style: { alignment: { horizontal: 'center' } } },
  { header: 'Descripción tiempo muerto', key: 'descripcion', width: 60 },
  { header: 'Tiempo (min)', key: 'minutos', width: 13, style: { numFmt: '#,##0' } },
], 'Fuente: Bi-horario de SuperApp Max. Tiempo = minutos de parada de la línea (en cada hora se toma el mayor tiempo registrado). Solo causas de pérdida; no incluye llegadas tarde ni manualidad.')
filas.forEach(f => ws.addRow({ fecha: fecha(f.fecha), turno: f.turno, linea: LINEAS[f.linea] || f.linea, codigo: f.codigo, descripcion: f.descripcion, minutos: +f.minutos }))
ws.getColumn('descripcion').alignment = { wrapText: true, vertical: 'top' }
if (filas.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + filas.length, column: 6 } }
const total = filas.reduce((s, f) => s + +f.minutos, 0)
filaTotal(ws, 5, { 6: total })

// Hoja 2: resumen por causa (de mayor a menor).
const porCausa = new Map()
filas.forEach(f => { const c = porCausa.get(f.codigo) || { codigo: f.codigo, descripcion: f.descripcion, minutos: 0, veces: 0 }; c.minutos += +f.minutos; c.veces++; porCausa.set(f.codigo, c) })
const rc = wb.addWorksheet('Resumen por causa')
encabezado(rc, [
  { header: 'Código', key: 'codigo', width: 9, style: { alignment: { horizontal: 'center' } } },
  { header: 'Descripción tiempo muerto', key: 'descripcion', width: 60 },
  { header: 'Tiempo (min)', key: 'minutos', width: 13, style: { numFmt: '#,##0' } },
  { header: 'Horas', key: 'horas', width: 9, style: { numFmt: '#,##0.0' } },
  { header: '% del total', key: 'pct', width: 11, style: { numFmt: '0.0%' } },
  { header: 'Turnos con la causa', key: 'veces', width: 12 },
], 'Suma de todas las líneas y turnos del periodo.')
;[...porCausa.values()].sort((a, b) => b.minutos - a.minutos)
  .forEach(c => rc.addRow({ ...c, horas: c.minutos / 60, pct: total ? c.minutos / total : 0 }))
rc.getColumn('descripcion').alignment = { wrapText: true, vertical: 'top' }
filaTotal(rc, 2, { 3: total, 4: total / 60, 5: total ? 1 : 0 })

// Hoja 3: resumen por línea.
const porLinea = new Map()
filas.forEach(f => { const k = LINEAS[f.linea] || f.linea; porLinea.set(k, (porLinea.get(k) || 0) + +f.minutos) })
const rl = wb.addWorksheet('Resumen por línea')
encabezado(rl, [
  { header: 'Línea', key: 'linea', width: 18 },
  { header: 'Tiempo (min)', key: 'minutos', width: 13, style: { numFmt: '#,##0' } },
  { header: 'Horas', key: 'horas', width: 9, style: { numFmt: '#,##0.0' } },
  { header: '% del total', key: 'pct', width: 11, style: { numFmt: '0.0%' } },
], 'Suma de todas las causas del periodo.')
;[...porLinea.entries()].sort((a, b) => b[1] - a[1])
  .forEach(([linea, minutos]) => rl.addRow({ linea, minutos, horas: minutos / 60, pct: total ? minutos / total : 0 }))
filaTotal(rl, 1, { 2: total, 3: total / 60, 4: total ? 1 : 0 })

// Hojas 4 y 5: unidades dejadas de fabricar, por persona y operación.
// Unidades = minutos parados ÷ 60 × ritmo real de esa persona en esa operación
// (lo que produjo ÷ el tiempo que tuvo disponible en el turno). Sin ritmo, se usa la meta.
let totalU = 0
if (perdidas) {
  const up = wb.addWorksheet('Unidades por operación')
  encabezado(up, [
    { header: 'Fecha', key: 'fecha', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Turno', key: 'turno', width: 8, style: { alignment: { horizontal: 'center' } } },
    { header: 'Línea', key: 'linea', width: 16 },
    { header: 'Operación', key: 'operacion', width: 22 },
    { header: 'Operario', key: 'nombre', width: 22 },
    { header: 'Código', key: 'codigo', width: 9, style: { alignment: { horizontal: 'center' } } },
    { header: 'Descripción tiempo muerto', key: 'descripcion', width: 40 },
    { header: 'Tiempo (min)', key: 'tm_minutos', width: 12, style: { numFmt: '#,##0' } },
    { header: 'Ritmo real (u/h)', key: 'ritmo_real', width: 13, style: { numFmt: '#,##0.0' } },
    { header: 'Meta (u/h)', key: 'meta', width: 11, style: { numFmt: '#,##0.0' } },
    { header: 'Unidades dejadas de fabricar', key: 'unidades_perdidas', width: 16, style: { numFmt: '#,##0' } },
  ], 'Unidades = minutos parados ÷ 60 × ritmo real de la persona en esa operación (lo que produjo ÷ el tiempo que tuvo disponible). Si no produjo nada, se usa la meta. Las unidades son de cada operación (piezas), no sacos terminados.')
  perdidas.forEach(p => up.addRow({ ...p, fecha: fecha(p.fecha), linea: LINEAS[p.linea] || p.linea, nombre: nombreCorto(p.nombre),
    tm_minutos: +p.tm_minutos, ritmo_real: p.ritmo_real == null ? null : +p.ritmo_real, meta: p.meta == null ? null : +p.meta, unidades_perdidas: +p.unidades_perdidas }))
  up.getColumn('descripcion').alignment = { wrapText: true, vertical: 'top' }
  if (perdidas.length) up.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + perdidas.length, column: 11 } }
  totalU = perdidas.reduce((s, p) => s + +p.unidades_perdidas, 0)
  filaTotal(up, 7, { 8: perdidas.reduce((s, p) => s + +p.tm_minutos, 0), 11: totalU })

  const porOp = new Map()
  perdidas.forEach(p => { const o = porOp.get(p.operacion) || { operacion: p.operacion, minutos: 0, unidades: 0 }; o.minutos += +p.tm_minutos; o.unidades += +p.unidades_perdidas; porOp.set(p.operacion, o) })
  const ro = wb.addWorksheet('Resumen por operación')
  encabezado(ro, [
    { header: 'Operación', key: 'operacion', width: 24 },
    { header: 'Tiempo parado (min)', key: 'minutos', width: 14, style: { numFmt: '#,##0' } },
    { header: 'Unidades dejadas de fabricar', key: 'unidades', width: 16, style: { numFmt: '#,##0' } },
  ], 'Suma de todas las personas, líneas y turnos del periodo. El tiempo es por persona.')
  ;[...porOp.values()].sort((a, b) => b.unidades - a.unidades).forEach(o => ro.addRow(o))
  filaTotal(ro, 1, { 2: perdidas.reduce((s, p) => s + +p.tm_minutos, 0), 3: totalU })

  const porMot = new Map()
  perdidas.forEach(p => { const o = porMot.get(p.codigo) || { codigo: p.codigo, descripcion: p.descripcion, minutos: 0, unidades: 0 }; o.minutos += +p.tm_minutos; o.unidades += +p.unidades_perdidas; porMot.set(p.codigo, o) })
  const rm = wb.addWorksheet('Unidades por motivo')
  encabezado(rm, [
    { header: 'Código', key: 'codigo', width: 9, style: { alignment: { horizontal: 'center' } } },
    { header: 'Descripción tiempo muerto', key: 'descripcion', width: 60 },
    { header: 'Tiempo parado (min)', key: 'minutos', width: 14, style: { numFmt: '#,##0' } },
    { header: 'Unidades dejadas de fabricar', key: 'unidades', width: 16, style: { numFmt: '#,##0' } },
    { header: '% de las unidades', key: 'pct', width: 12, style: { numFmt: '0.0%' } },
  ], 'Unidades dejadas de fabricar agrupadas por motivo del tiempo muerto. El tiempo es por persona.')
  ;[...porMot.values()].sort((a, b) => b.unidades - a.unidades).forEach(o => rm.addRow({ ...o, pct: totalU ? o.unidades / totalU : 0 }))
  rm.getColumn('descripcion').alignment = { wrapText: true, vertical: 'top' }
  filaTotal(rm, 2, { 3: perdidas.reduce((s, p) => s + +p.tm_minutos, 0), 4: totalU, 5: totalU ? 1 : 0 })
}

await wb.xlsx.writeFile(salida)
console.log(`Listo: ${salida} · ${filas.length} filas · ${total} min (${(total / 60).toFixed(1)} h)${perdidas ? ` · ${totalU} unidades dejadas de fabricar` : ''}`)
