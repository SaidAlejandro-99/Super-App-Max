// Informe de tiempos muertos en Excel (lo usa el subagente de Informes).
// Uso: node scripts/informes/tiempos-muertos.mjs <datos.json> <salida.xlsx> <desde> <hasta>
// datos.json: [{ fecha, turno, linea, codigo, descripcion, minutos }] — la consulta
// está en .claude/agents/informes.md.
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'

const [datosPath, salida, desde, hasta] = process.argv.slice(2)
if (!datosPath || !salida) { console.error('Uso: tiempos-muertos.mjs <datos.json> <salida.xlsx> <desde> <hasta>'); process.exit(1) }
const filas = JSON.parse(readFileSync(datosPath, 'utf8'))

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

await wb.xlsx.writeFile(salida)
console.log(`Listo: ${salida} · ${filas.length} filas · ${total} min (${(total / 60).toFixed(1)} h)`)
