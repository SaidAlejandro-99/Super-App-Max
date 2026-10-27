// Mi Marcador: la tarjeta del operario (cara pública de la app).
// - Pública: el operario escribe su cédula y ve solo su tarjeta (función mm_tarjeta).
// - Dentro de la app: admin y supervisores buscan por nombre; el admin cambia
//   la frase, el destacado y recarga el histórico desde el Excel.
// La tarjeta nunca recibe cédulas: la base de datos solo entrega lo que se muestra.
import './marcador.css'

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const ico = (id, extra = '') => `<svg class="ico" ${extra}><use href="#i-${id}"/></svg>`
const pct = (v, d = 1) => v == null ? '—' : (v * 100).toFixed(d).replace('.', ',') + '%'
const num = (v, d = 0) => v == null ? '—' : Number(v).toLocaleString('es-CO', { maximumFractionDigits: d })
// Verde desde el 90 % (donde arranca el bono), amarillo desde el 80 %.
const efCls = v => v == null ? '' : v >= 0.9 ? 'mm-ok' : v >= 0.8 ? 'mm-med' : 'mm-bajo'
const efColor = v => v == null ? '#6f7f73' : v >= 0.9 ? '#6cc38c' : v >= 0.8 ? '#e9a820' : '#e78a7c'
const tc = s => String(s || '').toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase())
// "CAMACHO CAHUANA OSNAIDER JOSE" → "Osnaider Camacho"
function nombreCorto(n) {
  const p = tc(n).split(' ').filter(Boolean)
  return p.length >= 3 ? `${p[2]} ${p[0]}` : p.reverse().join(' ')
}
const iniciales = n => nombreCorto(n).split(' ').map(w => w[0]).join('').slice(0, 2)
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const mesTxt = iso => `${MESES[+iso.slice(5, 7) - 1]} ${iso.slice(2, 4)}`
const ORDINAL = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta', 'séptima', 'octava', 'novena', 'décima']
const lineaTxt = l => ({ '4PANEL': '4 Panel', UPANEL: 'U-panel', CERROMATOSO: 'Cerro Matoso', PORTASACOS: 'Portasacos', ALTERNAS: 'Alternas' }[l] || tc(l))
const hoyISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }

/* ---------- turno en vivo ---------- */
const hNum = t => +String(t).slice(0, 2)
// Igual que en el Bi-horario: los turnos de 12 h no muestran la hora de almuerzo
// (def.descanso), salvo que tenga algo registrado.
function horasTurno(def, fecha, usadas) {
  if (!def) return []
  const domingo = new Date(fecha + 'T12:00:00').getDay() === 0
  const ini = hNum(domingo && def.inicio_domingo ? def.inicio_domingo : def.inicio)
  const n = ((hNum(def.fin) - ini) + 24) % 24 || 24
  const s = Array.from({ length: n }, (_, i) => { const h = (ini + i + 1) % 24; return { i, label: String(h % 12 || 12), h } })
  return s.filter(x => def.descanso == null || x.h !== +def.descanso || usadas.has(x.i))
}
// Mismo cálculo del Bi-horario: solo cuentan las horas registradas y el tiempo
// muerto descuenta (menos la llegada tarde, que se castiga).
function calcularHoy(hoy) {
  const usadas = new Set((hoy.asig || []).flatMap(a => (a.regs || []).filter(r => r.unidades != null || r.tm_causa).map(r => r.hora)))
  const horas = horasTurno(hoy.def, hoy.fecha, usadas)
  // Igual que en el Bi-horario: si en una hora pasó por dos referencias u
  // operaciones, los minutos de esa hora se reparten según lo ganado en cada una.
  const asigs = (hoy.asig || []).map(a => ({ a, regs: new Map((a.regs || []).map(r => [r.hora, r])),
    metaH: a.meta_origen !== 'turno' && a.meta_hora ? +a.meta_hora * (+a.factor || 1) : null }))
  const registrada = r => r && (r.unidades != null || r.tm_causa)
  const minutos = (k, i) => {
    const todas = asigs.map(x => [x, x.regs.get(i)]).filter(([, r]) => registrada(r))
    const tm = Math.max(0, ...todas.map(([, r]) => r.tm_causa && r.tm_tipo !== 'tardanza' ? (+r.tm_minutos || 0) : 0))
    const w = todas.map(([x, r]) => x.metaH ? (+r.unidades || 0) / x.metaH : null), suma = w.reduce((s, v) => s + (v || 0), 0)
    const j = todas.findIndex(([x]) => x === asigs[k])
    const parte = todas.length === 1 ? 1 : w.every(v => v != null) && suma > 0 ? w[j] / suma : 1 / todas.length
    return Math.max(0, 60 - tm) * parte
  }
  const ops = asigs.map(({ a, regs, metaH }, k) => {
    let total = 0, disp = 0
    const porHora = horas.map(({ i, label }) => {
      const r = regs.get(i)
      const reg = registrada(r)
      const d = reg ? minutos(k, i) : 0
      if (reg) { total += +r.unidades || 0; disp += d }
      return { label, reg, u: reg ? (+r.unidades || 0) : null, esperado: metaH && reg ? metaH * d / 60 : null }
    })
    const tms = (a.regs || []).filter(r => r.tm_causa).map(r => ({ label: (horas.find(h => h.i === r.hora) || {}).label, min: r.tm_minutos, txt: r.tm_txt, tipo: r.tm_tipo }))
    const esperado = metaH ? metaH * disp / 60 : null
    return { ...a, metaH, total, disp, esperado, ef: esperado ? total / esperado : null, porHora, tms, metaTurno: metaH ? metaH * horas.length : null }
  })
  const conMeta = ops.filter(o => o.esperado)
  let ef = conMeta.length ? conMeta.reduce((s, o) => s + o.total, 0) / conMeta.reduce((s, o) => s + o.esperado, 0) : null
  // Revisión y patinador: se califican al cierre con la meta de la línea.
  if (ef == null && hoy.estado === 'terminado' && +hoy.meta_turno && hoy.reportadas != null) ef = +hoy.reportadas / +hoy.meta_turno
  const ats = (hoy.asig || []).flatMap(a => (a.regs || []).map(r => r.at)).filter(Boolean).sort()
  return { horas, ops, ef, ultima: ats.length ? ats[ats.length - 1] : null }
}
function horaTxt(iso) {
  const d = new Date(iso); const h = d.getHours()
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`
}
function ring(ef) {
  const C = 2 * Math.PI * 44, v = Math.max(0, Math.min(1, ef || 0))
  return `<div class="mm-ring"><svg viewBox="0 0 104 104" width="104" height="104"><circle cx="52" cy="52" r="44" fill="none" stroke="#1c261d" stroke-width="10"/>
    ${ef != null ? `<circle cx="52" cy="52" r="44" fill="none" stroke="${efColor(ef)}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(v * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 52 52)"/>` : ''}</svg>
    <b class="${efCls(ef)}">${ef == null ? '—' : Math.round(ef * 100) + '%'}</b><small>efic. hoy</small></div>`
}
function barras(o) {
  const tope = Math.max(o.metaH ? o.metaH * 1.3 : 0, ...o.porHora.map(p => p.u || 0), 1)
  const bars = o.porHora.map(p => {
    if (!p.reg) return '<div class="mm-b vacia"><i></i></div>'
    const r = p.esperado ? p.u / p.esperado : null
    return `<div class="mm-b" title="${p.label}: ${num(p.u)}"><i style="height:${Math.max(2, p.u / tope * 100).toFixed(1)}%;background:${r == null ? '#8fc9a8' : efColor(r)}"></i></div>`
  }).join('')
  const goal = o.metaH ? `<div class="mm-goal" style="bottom:${(o.metaH / tope * 100).toFixed(1)}%"><span>meta ${num(o.metaH, 1)}</span></div>` : ''
  return `<div class="mm-bars">${goal}${bars}</div><div class="mm-hrs">${o.porHora.map(p => `<em>${p.label}</em>`).join('')}</div>`
}
// Prensa y Liner: eficiencia = tiempo estándar de lo que hizo ÷ tiempo en el proceso
// (lo que lleva el turno, o todo si ya terminó, menos el tiempo fuera).
const PT_TXT = { pallet: 'Pallet', bulto: 'Bulto', liner: 'Liner' }
function minutosTurnoPT(hoy) {
  const todas = horasTurno(hoy.def, hoy.fecha, new Set([...Array(24).keys()]))
  const horas = horasTurno(hoy.def, hoy.fecha, new Set())
  const total = horas.length * 60
  if (hoy.estado !== 'abierto' || !hoy.def) return total
  const domingo = new Date(hoy.fecha + 'T12:00:00').getDay() === 0
  const ini = String(domingo && hoy.def.inicio_domingo ? hoy.def.inicio_domingo : hoy.def.inicio)
  let pasados = (Date.now() - new Date(`${hoy.fecha}T${ini.slice(0, 5)}:00`).getTime()) / 60000
  const almuerzo = todas.length > horas.length ? todas.find(s => !horas.some(h => h.i === s.i)) : null
  if (almuerzo) pasados = pasados > (almuerzo.i + 1) * 60 ? pasados - 60 : Math.min(pasados, almuerzo.i * 60)
  return Math.max(0, Math.min(total, Math.round(pasados)))
}
function bloquePT(hoy) {
  const pt = hoy.pt, abierto = hoy.estado === 'abierto', ayer = hoy.fecha !== hoyISO()
  const proceso = Math.max(0, minutosTurnoPT(hoy) - (+pt.min_fuera || 0))
  const std = pt.prod.reduce((s, r) => s + (+r.cantidad || 0) / +r.meta * 60, 0)
  const ef = proceso ? std / proceso : null
  const total = pt.prod.reduce((s, r) => s + (+r.cantidad || 0), 0)
  const metas = [...new Set(pt.prod.map(r => +r.meta))]
  const hTxt = m => num(m / 60, 1) + ' h'
  return `<div class="mm-live">
    <div class="mm-lh"><span class="mm-tag-live">${abierto ? '<i class="live-dot"></i>' : ''}${ayer ? 'Ayer' : 'Hoy'} · Turno ${esc(hoy.turno)} · ${abierto ? 'en vivo' : 'terminado'}</span><button class="mm-refresh" data-mm="refrescar">${ico('actualizar')}Actualizar</button></div>
    <div class="mm-gauge">${ring(ef)}
      <div class="mm-facts"><div>${esc(lineaTxt(hoy.linea))}<br><b>${num(total)} ${hoy.linea === 'PRENSA' ? 'prensados' : 'enlainados'}</b></div>
        ${metas.length === 1 ? `<div>Tu meta por hora</div><div class="mm-meta">${num(metas[0])}<span>/h</span></div>` : `<div>Meta: ${hoy.linea === 'PRENSA' ? 'pallet 125/h · bulto 60/h' : '40/h'}</div>`}</div>
    </div>
    <div class="mm-falta">
      <div><b>${hTxt(std)}</b>de trabajo según la meta, por lo que hiciste</div>
      <div><b>${hTxt(proceso)}</b>en el proceso${+pt.min_fuera ? ` (fuera ${pt.min_fuera} min${pt.causa_txt ? ': ' + esc(pt.causa_txt) : ''})` : ''}</div>
    </div>
    ${pt.prod.length ? `<div class="mm-box" style="margin-top:12px">${pt.prod.map(r => `<div class="mm-tr"><div class="mm-nm"><b class="mono">${esc(r.codigo || 'Sin referencia')}</b><small>${esc(PT_TXT[r.presentacion] || '')} · meta ${num(r.meta)}/h</small></div><span class="mm-pct">${num(r.cantidad)}</span></div>`).join('')}</div>`
      : '<div class="mm-sub" style="margin-top:10px">Tu supervisor aún no ha anotado tu producción de hoy.</div>'}
    <div class="mm-upd">Tu supervisor anota lo que vas haciendo durante el turno</div>
  </div>`
}
function bloqueHoy(hoy) {
  if (hoy && hoy.pt && !(hoy.asig || []).length) return bloquePT(hoy)
  if (!hoy) return `<div class="mm-live off"><div class="mm-lh"><span class="mm-tag-live" style="color:var(--muted)">Hoy</span><button class="mm-refresh" data-mm="refrescar">${ico('actualizar')}Actualizar</button></div>
    <div class="mm-sub" style="margin-top:8px">Todavía no apareces en un turno del Bi-horario hoy. Cuando tu supervisor te asigne, aquí verás tu producción hora por hora.</div></div>`
  const X = calcularHoy(hoy)
  const abierto = hoy.estado === 'abierto'
  const ayer = hoy.fecha !== hoyISO()
  const una = X.ops.length === 1 ? X.ops[0] : null
  const ops = X.ops.map(o => {
    // La meta de todo el turno solo aplica si estuvo en una sola operación.
    const faltaTurno = una && o.metaTurno ? Math.max(0, o.metaTurno - o.total) : null
    const horasOp = o.porHora.filter(p => p.reg).length
    return `<div class="mm-op">
      <div class="mm-op-h" ${una ? 'hidden' : ''}><b>${esc(o.operacion)}${X.ops.filter(p => p.operacion === o.operacion).length > 1 ? ` <small class="mono" style="color:var(--muted);font-weight:500">${esc(o.codigo || '')}</small>` : ''}</b><span class="mono ${efCls(o.ef)}">${o.metaH ? `meta ${num(o.metaH, 1)}/h` : 'meta del turno'}</span></div>
      ${o.metaH ? `<div class="mm-falta">
        <div><b>${num(o.total)} / ${num(o.esperado)}</b>${abierto ? 'llevas' : 'hiciste'} vs. lo esperado en las horas registradas</div>
        ${una ? `<div><b class="${faltaTurno ? 'mm-med' : 'mm-ok'}">${faltaTurno ? num(faltaTurno) : num(o.metaTurno)}</b>${faltaTurno ? `${abierto ? 'te faltan' : 'faltaron'} para tu meta del turno (${num(o.metaTurno)})` : 'meta del turno cumplida'}</div>`
          : `<div><b>${horasOp} h</b>registradas en esta operación</div>`}
      </div>` : `<div class="mm-sub" style="margin-top:6px">${abierto ? 'Llevas' : 'Hiciste'} <b class="mono" style="color:var(--ink)">${num(o.total)}</b>. Esta operación se califica al cierre con lo que produjo la línea frente a la meta del turno.</div>`}
      ${barras(o)}
      ${o.tms.map(t => `<div class="mm-tm">${ico('reloj')}<div><b>${t.label} · ${t.min || 0} min</b> — ${esc(t.txt || '')}<br><span class="mm-sub" style="font-size:11.5px">${t.tipo === 'tardanza' ? 'Llegada tarde: no descuenta tiempo' : 'Tiempo muerto registrado por tu supervisor'}</span></div></div>`).join('')}
    </div>`
  }).join('')
  return `<div class="mm-live">
    <div class="mm-lh"><span class="mm-tag-live">${abierto ? '<i class="live-dot"></i>' : ''}${ayer ? 'Ayer' : 'Hoy'} · Turno ${esc(hoy.turno)} · ${abierto ? 'en vivo' : 'terminado'}</span><button class="mm-refresh" data-mm="refrescar">${ico('actualizar')}Actualizar</button></div>
    <div class="mm-gauge">${ring(X.ef)}
      <div class="mm-facts"><div>${una ? 'Operación' : 'Línea'}<br><b>${esc(una ? una.operacion : lineaTxt(hoy.linea))}</b></div>
        ${una && una.metaH ? `<div>Tu meta por hora</div><div class="mm-meta">${num(una.metaH, 1)}<span>/h</span></div>` : `<div>${X.ops.length} operaciones hoy</div>`}</div>
    </div>
    ${ops}
    <div class="mm-upd">${X.ultima ? `Actualizado ${horaTxt(X.ultima)} · ` : ''}tu supervisor registra cada hora</div>
  </div>`
}

/* ---------- curva de aprendizaje ---------- */
function ajuste2(xs, ys) {
  const n = xs.length; let a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0
  xs.forEach((x, i) => { const y = ys[i]; a += x; b += x * x; c += x ** 3; d += x ** 4; e += y; f += x * y; g += x * x * y })
  const M = [[n, a, b], [a, b, c], [b, c, d]], V = [e, f, g]
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  const D = det(M); if (Math.abs(D) < 1e-9) return null
  return [0, 1, 2].map(k => det(M.map((r, i) => r.map((v, j) => j === k ? V[i] : v))) / D)
}
function tendencia(hist) {
  if (hist.length < 3) return null
  const xs = hist.map((_, i) => i), ys = hist.map(h => +h.ef * 100)
  const k = hist.length >= 4 ? ajuste2(xs, ys) : null
  const f = k ? x => k[0] + k[1] * x + k[2] * x * x : (() => {
    const n = xs.length, sx = xs.reduce((s, v) => s + v, 0), sy = ys.reduce((s, v) => s + v, 0)
    const m = (n * xs.reduce((s, x, i) => s + x * ys[i], 0) - sx * sy) / ((n * xs.reduce((s, x) => s + x * x, 0) - sx * sx) || 1)
    return x => (sy - m * sx) / n + m * x
  })()
  const delta = f(hist.length - 1) - f(0)
  return { f, dir: delta > 3 ? 'up' : delta < -3 ? 'down' : 'flat' }
}
const TEND = { up: ['#5fe08f', 'tendencia', 'mejorando'], down: ['#e78a7c', 'baja', 'bajando'], flat: ['#6fb3e0', 'estable', 'estable'] }
function curva(hist) {
  if (!hist.length) return { t: null, svg: '' }
  const w = 320, h = 150, x0 = 30, x1 = 312, yv = v => 112 - Math.max(0, Math.min(105, v)) / 100 * 96
  const n = hist.length, xp = i => n <= 1 ? (x0 + x1) / 2 : x0 + i / (n - 1) * (x1 - x0)
  const t = tendencia(hist)
  const pts = hist.map((p, i) => [xp(i), yv(+p.ef * 100)])
  const linea = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')
  const area = n > 1 ? `${linea} L${pts[n - 1][0].toFixed(1)},112 L${pts[0][0].toFixed(1)},112Z` : ''
  let tpath = ''
  if (t) for (let s = 0; s <= 40; s++) { const xi = (n - 1) * s / 40; tpath += (s ? 'L' : 'M') + xp(xi).toFixed(1) + ',' + yv(t.f(xi)).toFixed(1) + ' ' }
  const idx = [...new Set([0, Math.floor((n - 1) / 2), n - 1])].filter(i => i >= 0)
  return {
    t,
    svg: `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Eficiencia por mes">
      <defs><linearGradient id="mm-ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3d35a" stop-opacity=".3"/><stop offset="1" stop-color="#c3d35a" stop-opacity="0"/></linearGradient></defs>
      <g stroke="#27332a">${[0, 50, 100].map(v => `<line x1="${x0}" y1="${yv(v)}" x2="${x1}" y2="${yv(v)}"/>`).join('')}</g>
      <line x1="${x0}" y1="${yv(90)}" x2="${x1}" y2="${yv(90)}" stroke="#e9a820" stroke-dasharray="4,4" opacity=".8"/>
      <g fill="#9bab9f" font-size="9" font-family="IBM Plex Mono">${[0, 50, 100].map(v => `<text x="${x0 - 4}" y="${yv(v) + 3}" text-anchor="end">${v}%</text>`).join('')}
        ${idx.map(i => `<text x="${xp(i)}" y="${h - 14}" text-anchor="${i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'}">${mesTxt(hist[i].mes)}</text>`).join('')}</g>
      ${area ? `<path d="${area}" fill="url(#mm-ga)"/>` : ''}
      <path d="${linea}" fill="none" stroke="#c3d35a" stroke-width="2.5" stroke-linejoin="round"/>
      ${tpath ? `<path d="${tpath}" fill="none" stroke="${TEND[t.dir][0]}" stroke-width="2" stroke-dasharray="6,5" opacity=".9"/>` : ''}
      ${pts.length ? `<circle cx="${pts[n - 1][0].toFixed(1)}" cy="${pts[n - 1][1].toFixed(1)}" r="4.5" fill="#c3d35a" stroke="#0d140f" stroke-width="2"/>` : ''}
    </svg>`,
  }
}

/* ---------- día a día: calendario del mes y detalle del día ---------- */
let ACTUAL = null                       // última tarjeta pintada
const DD = { mes: null, dia: null }     // mes y día escogidos
const DIAS_L = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
function diaADia(d) {
  const dias = new Map()
  ;(d.diario || []).forEach(r => { if (!dias.has(r.f)) dias.set(r.f, []); dias.get(r.f).push(r) })
  const efDia = f => { const rs = dias.get(f); return rs.reduce((s, r) => s + +r.ef, 0) / rs.length }
  const meses = [...new Set([...dias.keys()].map(f => f.slice(0, 7)))].sort().reverse()
  const mes = meses.includes(DD.mes) ? DD.mes : meses[0]
  const fechas = [...dias.keys()].filter(f => f.startsWith(mes)).sort()
  const dia = fechas.includes(DD.dia) ? DD.dia : fechas[fechas.length - 1]

  // Resumen del mes.
  const efs = fechas.map(efDia)
  const prom = efs.reduce((s, v) => s + v, 0) / efs.length
  const bono = efs.filter(v => v >= 0.9).length
  const iMejor = efs.indexOf(Math.max(...efs))
  let racha = 0; for (let i = efs.length - 1; i >= 0 && efs[i] >= 0.9; i--) racha++
  const dMejor = new Date(fechas[iMejor] + 'T12:00:00')

  // Calendario: semanas de lunes a domingo.
  const [y, m] = mes.split('-').map(Number)
  const primero = (new Date(y, m - 1, 1).getDay() + 6) % 7
  const total = new Date(y, m, 0).getDate()
  const hoy = hoyISO()
  let celdas = '<span class="mm-cal-h">L</span><span class="mm-cal-h">M</span><span class="mm-cal-h">M</span><span class="mm-cal-h">J</span><span class="mm-cal-h">V</span><span class="mm-cal-h">S</span><span class="mm-cal-h">D</span>'
  celdas += '<span></span>'.repeat(primero)
  for (let n = 1; n <= total; n++) {
    const f = `${mes}-${String(n).padStart(2, '0')}`
    if (!dias.has(f)) { celdas += `<span class="mm-cal-d vacio${f === hoy ? ' hoy' : ''}">${n}</span>`; continue }
    const v = efDia(f)
    celdas += `<button class="mm-cal-d ${v >= 0.9 ? 'c-ok' : v >= 0.8 ? 'c-med' : 'c-bajo'}${f === dia ? ' sel' : ''}${f === hoy ? ' hoy' : ''}" data-mm="dia" data-f="${f}"><b>${n}</b><small>${Math.round(v * 100)}%</small></button>`
  }

  // Detalle del día escogido.
  const rs = dias.get(dia), v = efDia(dia), dt = new Date(dia + 'T12:00:00')
  const vsProm = (v - prom) * 100
  const ops = rs.map(r => {
    const metaH = +r.meta || null, porH = r.prod != null ? +r.prod : null
    return `<div class="mm-dop">
      <div class="mm-dop-h"><b>${esc(tc(r.op))}</b><span class="mono ${efCls(r.ef)}">${pct(r.ef, 0)}</span></div>
      <div class="mm-dbar"><i style="width:${Math.min(100, r.ef * 100).toFixed(0)}%;background:${efColor(r.ef)}"></i><em style="left:90%"></em></div>
      <div class="mm-dstats">
        <div><b>${num(r.real)}</b>producidas</div>
        <div><b>${porH != null ? num(porH, 1) : '—'}</b>promedio por hora${metaH ? ` · meta ${num(metaH, 1)}` : ''}</div>
        <div><b>${r.horas != null ? num(r.horas, 1) : '—'}</b>horas</div>
      </div></div>`
  }).join('')
  return `
  <div class="mm-dd-tabs">${meses.map(k => `<button data-mm="mes" data-m="${k}" class="${k === mes ? 'on' : ''}">${MESES_L[+k.slice(5) - 1]}</button>`).join('')}</div>
  <div class="mm-dd-sum">
    <div><b class="${efCls(prom)}">${pct(prom)}</b>eficiencia promedio</div>
    <div><b>${bono}<small>/${fechas.length}</small></b>días con bono</div>
    <div><b class="mm-ok">${racha}</b>${racha === 1 ? 'día' : 'días'} en racha</div>
    <div><b>${DIAS[dMejor.getDay()]} ${dMejor.getDate()}</b>mejor día · ${Math.round(efs[iMejor] * 100)}%</div>
  </div>
  <div class="mm-cal-tit">Tu % de eficiencia de cada día</div>
  <div class="mm-cal">${celdas}</div>
  <div class="mm-cal-ley"><span><i class="c-ok"></i>90 % o más (bono)</span><span><i class="c-med"></i>80–89 %</span><span><i class="c-bajo"></i>menos de 80 %</span></div>
  <div class="mm-dsel">
    <div class="mm-dsel-h"><div><div class="mm-k" style="letter-spacing:2px">${DIAS_L[dt.getDay()]}</div><div class="mm-ar" style="font-weight:800;font-size:20px">${dt.getDate()} de ${MESES_L[dt.getMonth()]}</div></div>
      <div style="text-align:right"><div class="mono ${efCls(v)}" style="font-size:30px;font-weight:600;line-height:1">${pct(v, 0)}</div>
        <div class="mm-sub" style="font-size:11px">${Math.abs(vsProm) < 0.5 ? 'igual a tu promedio' : `${num(Math.abs(vsProm), 1)} ${vsProm > 0 ? 'sobre' : 'bajo'} tu promedio`}</div></div></div>
    ${ops}
  </div>`
}
function pintarDD(b) {
  if (b.dataset.mm === 'mes') { DD.mes = b.dataset.m; DD.dia = null } else DD.dia = b.dataset.f
  const box = document.getElementById('mm-dd')
  if (box && ACTUAL) box.innerHTML = diaADia(ACTUAL)
}

/* ---------- tarjeta completa ---------- */
export function tarjetaHTML(d) {
  const hist = d.historico || []
  const mesAct = hist.find(h => h.mes === d.mes)
  const iAct = hist.indexOf(mesAct)
  const mesAnt = iAct > 0 ? hist[iAct - 1] : null
  const g = d.global || {}
  const costura = (d.operaciones || []).filter(o => o.tipo === 'COSTURA').sort((a, b) => b.n - a.n)
  const manual = (d.operaciones || []).filter(o => o.tipo !== 'COSTURA').sort((a, b) => b.n - a.n)
  const dominadas = costura.filter(o => o.n >= 30)
  const poli = dominadas.length >= 3
  const siguiente = costura.find(o => o.n < 30)
  const esCostura = costura.length > 0 || /costura/i.test(d.rol || '')
  const cv = curva(hist)

  const habilidades = costura.slice(0, 6).map(o => `<div class="mm-hab"><div class="mm-hab-h">${esc(tc(o.op))}
      ${o.n >= 30 ? `<span class="ok">${num(o.n)} ${ico('check')}</span>` : `<span>${o.n} / 30</span>`}</div>
      <div class="mm-track"><i style="width:${Math.min(100, o.n / 30 * 100).toFixed(0)}%;background:${o.n >= 30 ? 'var(--good)' : 'var(--lime)'}"></i></div></div>`).join('')
  const falta = o => `Te faltan <b>${30 - o.n} registros en ${esc(tc(o.op))}</b>`
  const bloquePoli = !esCostura ? '' : poli
    ? `<div class="mm-poli">Eres <b>polivalente</b>: dominas ${dominadas.length} habilidades de costura.${siguiente ? `<br>${falta(siguiente)} para sumar tu ${ORDINAL[dominadas.length] || 'siguiente'} habilidad.` : ''}</div>`
    : `<div class="mm-how"><h4>${ico('sube')}¿Cómo ser polivalente?</h4>
        <p>Llevas <b>${dominadas.length} de 3</b> habilidades.${siguiente ? ` ${falta(siguiente)} para tu ${ORDINAL[dominadas.length]} habilidad.` : ''}</p>
        <div class="mm-step"><em>1</em><div>Dile a tu supervisor que quieres aprender otra operación de costura.</div></div>
        <div class="mm-step"><em>2</em><div>Trabaja en ella hasta sumar <b>30 registros</b>. Cada registro es un día trabajado en esa operación.</div></div>
        <div class="mm-step"><em>3</em><div>Con <b>3 habilidades de costura</b> de 30 registros o más, quedas polivalente automáticamente.</div></div>
        <div class="mm-benef">${ico('nivel')}<div><b>¿Qué ganas?</b> Ser polivalente es la llave para subir de nivel, y tu nivel define tu reconocimiento en la planta.
          <div class="mm-lvl">${[1, 2, 3].map(n => `<span class="${n === d.nivel ? 'on' : ''}">Nivel ${n}</span>`).join(ico('chev'))}</div></div></div>
      </div>`

  if (!ACTUAL || ACTUAL.nombre !== d.nombre) { DD.mes = null; DD.dia = null }
  ACTUAL = d
  const diario = (d.diario || []).length ? diaADia(d) : ''

  const dif = mesAct && mesAnt ? (mesAct.ef - mesAnt.ef) * 100 : null
  return `
  <div class="mm-who"><div class="mm-av">${esc(iniciales(d.nombre))}</div>
    <div style="min-width:0"><div class="mm-name">${esc(tc(d.nombre))}</div><div class="mm-sub" style="font-size:12px">${esc(lineaTxt(d.linea))}${d.rol ? ' · ' + esc(d.rol) : ''}</div>
      <div class="mm-chips"><span class="mm-chip mm-c-n">Nivel ${d.nivel || 1}</span>${poli ? `<span class="mm-chip mm-c-p">${ico('estrella')}Polivalente</span>` : ''}${d.ranking ? `<span class="mm-chip mm-c-r">Ranking <b>${d.ranking.pos}</b></span>` : ''}</div></div></div>
  ${bloqueHoy(d.hoy)}
  <div class="mm-kp">
    <div class="mm-kpi"><div class="l">${mesAct ? MESES_L[+d.mes.slice(5, 7) - 1] : 'Este mes'}</div><div class="v ${efCls(mesAct && mesAct.ef)}">${pct(mesAct && mesAct.ef)}</div>
      <div class="s">${dif == null ? (mesAct ? `${mesAct.n} registros` : 'Sin registros') : `${ico(dif >= 0 ? 'tendencia' : 'baja')}${num(Math.abs(dif), 1)} ${dif >= 0 ? 'más' : 'menos'} que ${MESES_L[+mesAnt.mes.slice(5, 7) - 1]}`}</div></div>
    <div class="mm-kpi"><div class="l">${g.desde ? 'Desde ' + mesTxt(g.desde) : 'Histórico'}</div><div class="v ${efCls(g.ef)}">${pct(g.ef)}</div><div class="s">${num(g.dias || 0)} días registrados</div></div>
  </div>
  ${hist.length ? `<div class="mm-sec"><span>Curva de aprendizaje</span>${cv.t ? `<span style="color:${TEND[cv.t.dir][0]};display:inline-flex;gap:4px;align-items:center">${ico(TEND[cv.t.dir][1])}${TEND[cv.t.dir][2]}</span>` : ''}</div>
  <div class="mm-chart">${cv.svg}<div class="mm-leg"><span><i style="border-color:#c3d35a"></i>Tu eficiencia</span>${cv.t ? `<span><i style="border-color:${TEND[cv.t.dir][0]};border-top-style:dashed"></i>Tendencia</span>` : ''}<span><i style="border-color:#e9a820;border-top-style:dashed"></i>Bono 90 %</span></div></div>` : ''}
  ${esCostura ? `<div class="mm-sec"><span>Mis habilidades de costura</span><span>registros</span></div>${habilidades || '<div class="mm-sub">Aún no tienes registros en operaciones de costura.</div>'}${bloquePoli}` : ''}
  ${manual.length ? `<div class="mm-sec"><span>${esCostura ? 'Otras operaciones' : 'Mis operaciones'}</span><span>registros</span></div>
    <div class="mm-box">${manual.slice(0, 5).map(o => `<div class="mm-tr"><div class="mm-nm"><b>${esc(tc(o.op))}</b></div><span class="mono" style="color:var(--muted)">${num(o.n)}</span><span class="mm-pct ${efCls(o.ef)}">${pct(o.ef, 0)}</span></div>`).join('')}</div>` : ''}
  ${diario ? `<div class="mm-sec"><span>Día a día</span><span>toca un día</span></div><div id="mm-dd">${diario}</div>` : ''}
  ${!hist.length ? '<div class="mm-empty">Aún no tienes registros en el histórico.</div>' : ''}
  <div class="mm-foot">¿Algún dato no te cuadra? Comunícalo al personal administrativo para revisarlo.</div>`
}

function portadaHTML(p) {
  const d = (p && p.destacado) || {}
  const top = (p && p.top) || []
  return `
  ${d.nombre ? `<div class="mm-spot"><div class="mm-av">${d.foto ? `<img src="${esc(d.foto)}" alt="">` : esc(iniciales(d.nombre))}</div>
    <div><div class="mm-eyb">${ico('medalla')}${esc(d.motivo || 'Reconocimiento')}</div><div class="mm-ar" style="font-weight:800;font-size:18px">${esc(d.nombre)}</div><div class="mm-sub" style="font-size:12px">¡Felicitaciones por tu constancia!</div></div></div>` : ''}
  <div class="mm-sec"><span>Top 10 costura · ${p && p.mes ? mesTxt(p.mes) : ''}</span><span style="color:var(--lime)">en curso</span></div>
  <div class="mm-box">${top.length ? top.map(r => `<div class="mm-tr"><div class="mm-ps ${r.pos <= 3 ? 'mm-g' + r.pos : ''}">${r.pos}</div>
    <div class="mm-nm"><b>${esc(tc(r.nombre))}</b><small>${esc(lineaTxt(r.linea))}</small></div><div class="mm-pct ${efCls(r.ef)}">${pct(r.ef)}</div></div>`).join('') : '<div class="mm-empty">Aún no hay datos del mes.</div>'}</div>
  ${p && p.frase ? `<div class="mm-quote">${esc(p.frase)}</div>` : ''}`
}

/* ---------- pantalla pública (operarios) ---------- */
let SB = null, pub = null
const P = { vista: 'entrada', portada: null, ced: '', data: null, fallos: 0, espera: 0 }

export function initPublico(supabase, { volver }) {
  SB = supabase
  pub = document.getElementById('mm-public')
  pub.classList.add('mm')
  pub.addEventListener('click', async e => {
    const b = e.target.closest('[data-mm]'); if (!b) return
    const a = b.dataset.mm
    if (a === 'inicio') volver()
    else if (a === 'dia' || a === 'mes') pintarDD(b)
    else if (a === 'salir') { P.vista = 'entrada'; P.ced = ''; P.data = null; pintarPublico() }
    else if (a === 'refrescar') {
      b.disabled = true
      try { if (!(await cargarTarjeta(P.ced))) P.vista = 'entrada' } catch (er) { b.disabled = false; return }
      pintarPublico()
    }
  })
  pub.addEventListener('submit', e => { e.preventDefault(); entrar() })
}
export async function mostrarPublico() {
  pub.hidden = false
  pintarPublico()
  const { data } = await SB.rpc('mm_portada')
  P.portada = data
  if (P.vista === 'entrada') pintarPublico()
}
export function ocultarPublico() { if (pub) pub.hidden = true }

async function cargarTarjeta(ced) {
  const { data, error } = await SB.rpc('mm_tarjeta', { p_cedula: ced })
  if (error) throw error
  P.data = data
  return data
}
async function entrar() {
  const inp = document.getElementById('mm-ced'), err = document.getElementById('mm-err'), btn = document.getElementById('mm-go')
  const ced = (inp.value || '').replace(/\D/g, '')
  err.hidden = true
  if (Date.now() < P.espera) { err.textContent = 'Espera un momento antes de intentar de nuevo.'; err.hidden = false; return }
  if (ced.length < 5) { err.textContent = 'Escribe tu cédula completa, solo números.'; err.hidden = false; return }
  btn.disabled = true; btn.textContent = 'Buscando…'
  try {
    const d = await cargarTarjeta(ced)
    if (!d) {
      // Tras varios intentos fallidos se hace una pausa corta.
      if (++P.fallos >= 5) { P.espera = Date.now() + 30000; P.fallos = 0 }
      err.textContent = 'No encontramos esa cédula. Revísala o pregúntale a tu supervisor.'; err.hidden = false
      return
    }
    P.fallos = 0; P.ced = ced; P.vista = 'tarjeta'
    pintarPublico(); pub.scrollTop = 0
  } catch (e) {
    err.textContent = 'No hay conexión. Intenta de nuevo en un momento.'; err.hidden = false
  } finally { btn.disabled = false; btn.textContent = 'Ver mi marcador' }
}
function pintarPublico() {
  const logo = '<img class="mm-logo" src="/logo-p.svg" alt="Poliplastics">'
  if (P.vista === 'tarjeta' && P.data) {
    pub.innerHTML = `<div class="mm-page"><div class="mm-top"><button class="mm-back" data-mm="salir">${ico('volver')} Salir</button>${logo}</div>${tarjetaHTML(P.data)}</div>`
    return
  }
  pub.innerHTML = `<div class="mm-page">
    <div class="mm-top"><button class="mm-back" data-mm="inicio">${ico('volver')} Volver</button>${logo}</div>
    <div class="mm-k">Mi Marcador</div>
    <div class="mm-title">¿Cómo va tu marcador hoy?</div>
    <div class="mm-sub">Escribe tu cédula completa. Solo tú ves tu marcador.</div>
    <form autocomplete="off"><input class="mm-ced" id="mm-ced" inputmode="numeric" autocomplete="off" placeholder="Tu cédula" maxlength="15" value="">
      <button class="mm-btn" id="mm-go" type="submit">Ver mi marcador</button></form>
    <div class="mm-err" id="mm-err" hidden></div>
    ${P.portada ? portadaHTML(P.portada) : '<div class="mm-empty">Cargando…</div>'}
  </div>`
}

/* ---------- dentro de la app (admin y supervisores) ---------- */
let C = null, el = null
let OPS = null, sel = null, q = ''

export function init(ctx) {
  C = ctx
  el = document.getElementById('mod-mm')
  el.addEventListener('click', onClick)
}
export async function show() {
  el.innerHTML = '<div class="loading">Cargando…</div>'
  if (!OPS) {
    const { data, error } = await C.supabase.from('operarios').select('cedula, nombre, linea').eq('activo', true).order('nombre').range(0, 4999)
    if (error) { el.innerHTML = '<div class="loading">No se pudo cargar el personal.</div>'; return }
    OPS = data
  }
  if (sel && !q) { const o = OPS.find(x => x.cedula === sel); if (o) q = o.nombre }
  pintar()
}
// Lo usa el Bi-horario al tocar el nombre de un operario.
export function seleccionar(ced) { sel = ced; q = '' }
const esAdmin = () => C.role() === 'admin'
function pintar() {
  el.innerHTML = `<div class="mm-in">
    <div>
      <input class="search" type="search" id="mm-q" placeholder="Buscar operario por nombre…" value="${esc(q)}" style="width:100%">
      <div class="mm-res" id="mm-res"></div>
      ${esAdmin() ? `<div class="section" style="margin-top:12px"><h2>Administrar</h2><div class="hint">Lo que ven los operarios en la entrada de Mi Marcador.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-a="portada">Destacado y frase</button><button class="btn sm" data-a="historico">Histórico (Excel)</button></div></div>` : ''}
      <div class="count" style="margin-top:10px">Los operarios entran sin usuario desde el inicio de la app (Soy operario) con su cédula.</div>
    </div>
    <div class="mm mm-panel" id="mm-card"><div class="mm-empty">Busca un operario por su nombre para ver su marcador.</div></div>
  </div>`
  const inp = document.getElementById('mm-q')
  inp.addEventListener('input', e => { q = e.target.value; llenar() })
  llenar()
  if (sel) abrir(sel)
}
function llenar() {
  const t = q.trim().toLowerCase()
  const rows = t ? OPS.filter(o => o.nombre.toLowerCase().includes(t)).slice(0, 40) : []
  document.getElementById('mm-res').innerHTML = rows.map(o => `<button data-a="ver" data-c="${esc(o.cedula)}" class="${o.cedula === sel ? 'on' : ''}"><span>${esc(tc(o.nombre))}</span><small>${esc(lineaTxt(o.linea))}</small></button>`).join('')
    || (t ? '<div class="count">Sin resultados</div>' : '')
}
async function abrir(ced) {
  sel = ced
  const box = document.getElementById('mm-card')
  box.innerHTML = '<div class="mm-empty">Cargando…</div>'
  const { data, error } = await C.supabase.rpc('mm_tarjeta', { p_cedula: ced })
  if (error || !data) { box.innerHTML = '<div class="mm-empty">No se pudo cargar este marcador.</div>'; return }
  box.innerHTML = tarjetaHTML(data)
  llenar()
}
async function onClick(e) {
  const b = e.target.closest('[data-a],[data-mm]'); if (!b) return
  if (b.dataset.mm === 'refrescar') { b.disabled = true; return abrir(sel) }
  if (b.dataset.mm === 'dia' || b.dataset.mm === 'mes') return pintarDD(b)
  switch (b.dataset.a) {
    case 'ver': return abrir(b.dataset.c)
    case 'portada': return modalPortada()
    case 'historico': return modalHistorico()
  }
}

// Foto del destacado: se reduce a 240 px y se guarda dentro de la configuración.
function reducirFoto(file) {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => {
      const s = 240, c = document.createElement('canvas'); c.width = c.height = s
      const k = Math.max(s / img.width, s / img.height), w = img.width * k, h = img.height * k
      c.getContext('2d').drawImage(img, (s - w) / 2, (s - h) / 2, w, h)
      res(c.toDataURL('image/jpeg', 0.85)); URL.revokeObjectURL(img.src)
    }
    img.onerror = rej
    img.src = URL.createObjectURL(file)
  })
}
async function modalPortada() {
  const { data } = await C.supabase.from('config').select('clave, valor').in('clave', ['mm_frase', 'mm_destacado'])
  const v = Object.fromEntries((data || []).map(r => [r.clave, r.valor]))
  const d = v.mm_destacado || {}
  let foto = d.foto || ''
  C.openModal(`<h3>Destacado y frase</h3>
    <div class="field"><label>Frase de la entrada</label><textarea id="mp-frase" rows="3">${esc(v.mm_frase || '')}</textarea></div>
    <div class="field"><label>Nombre del destacado (vacío = no se muestra)</label><input id="mp-nom" value="${esc(d.nombre || '')}"></div>
    <div class="field"><label>Motivo</label><input id="mp-mot" value="${esc(d.motivo || 'Operario del trimestre')}"></div>
    <div class="field"><label>Foto</label><div style="display:flex;gap:10px;align-items:center">
      <div class="mm" style="flex:none"><div class="mm-av" id="mp-prev">${foto ? `<img src="${esc(foto)}" alt="">` : ''}</div></div>
      <input type="file" id="mp-foto" accept="image/*"><button class="btn sm ghost" id="mp-quitar" type="button">Quitar</button></div></div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn go" id="mp-ok">Guardar</button></div>`)
  const prev = () => { document.getElementById('mp-prev').innerHTML = foto ? `<img src="${esc(foto)}" alt="">` : '' }
  document.getElementById('mp-foto').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return
    try { foto = await reducirFoto(f); prev() } catch (er) { C.toast('No se pudo leer la imagen.') }
  })
  document.getElementById('mp-quitar').addEventListener('click', () => { foto = ''; prev() })
  document.getElementById('mp-ok').addEventListener('click', async () => {
    const filas = [
      { clave: 'mm_frase', valor: document.getElementById('mp-frase').value.trim() },
      { clave: 'mm_destacado', valor: { nombre: document.getElementById('mp-nom').value.trim(), motivo: document.getElementById('mp-mot').value.trim(), foto } },
    ].map(r => ({ ...r, updated_at: new Date().toISOString() }))
    const { error } = await C.supabase.from('config').upsert(filas)
    if (error) { C.toast('No se pudo guardar: ' + error.message); return }
    C.closeModal(); C.toast('Guardado. Ya lo ven los operarios.')
  })
}

// Lee la hoja del bi-horario del Excel. Columnas por nombre: FECHA, ID, LÍNEA,
// OPERACIÓN, TIPO OPERACIÓN, META X HR, HR LAB, PROD REAL, EFICIENCIA, AUS.
export function filasDeExcel(rows) {
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()
  const hi = rows.findIndex(r => r && r.map(norm).includes('EFICIENCIA') && r.map(norm).includes('ID'))
  if (hi < 0) return null
  const H = rows[hi].map(norm), col = n => H.indexOf(n)
  const c = { f: col('FECHA'), id: col('ID'), lin: col('LINEA'), op: col('OPERACION'), tipo: col('TIPO OPERACION'), meta: col('META X HR'), hr: col('HR LAB'), real: col('PROD REAL'), ef: col('EFICIENCIA'), aus: col('AUS') }
  const n = v => typeof v === 'number' && isFinite(v) ? v : null
  const fecha = v => v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : null
  const out = []
  for (const r of rows.slice(hi + 1)) {
    if (!r) continue
    const f = fecha(r[c.f]), id = r[c.id], ef = r[c.ef]
    if (!f || typeof id !== 'number' || typeof ef !== 'number' || ef < 0 || ef > 1.5) continue
    if (c.aus >= 0 && r[c.aus]) continue
    const tipo = norm(r[c.tipo])
    out.push({ cedula: String(id), fecha: f, linea: String(r[c.lin] || '').trim(), operacion: String(r[c.op] || '').trim(),
      tipo: ['COSTURA', 'MANUAL'].includes(tipo) ? tipo : '', meta: n(r[c.meta]), horas: n(r[c.hr]), prod_real: n(r[c.real]),
      eficiencia: Math.round(ef * 10000) / 10000, origen: 'excel' })
  }
  return out
}
async function modalHistorico() {
  const { data } = await C.supabase.from('config').select('valor').eq('clave', 'mm_carga').maybeSingle()
  const u = data && data.valor
  C.openModal(`<h3>Histórico de eficiencia (Excel)</h3>
    <div class="hint" style="color:var(--muted);font-size:13px;line-height:1.5">
      ${u ? `Última carga: <b>${num(u.filas)}</b> registros hasta el <b>${esc(u.hasta)}</b>.` : 'Aún no se ha cargado el histórico.'}<br>
      Escoge el Excel de bi-horarios (hoja <b>BI HORARIO</b>). Se reemplaza todo lo que vino del Excel; las ausencias no entran.</div>
    <div class="field" style="margin-top:12px"><input type="file" id="mh-file" accept=".xlsx,.xls"></div>
    <div id="mh-info" class="hint" style="font-size:13px"></div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cerrar</button><button class="btn go" id="mh-ok" disabled>Reemplazar histórico</button></div>`)
  let filas = null
  const info = document.getElementById('mh-info'), ok = document.getElementById('mh-ok')
  document.getElementById('mh-file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return
    ok.disabled = true; filas = null
    info.textContent = 'Leyendo el archivo… (puede tardar un minuto)'
    await new Promise(r => setTimeout(r, 30))
    try {
      const buf = await f.arrayBuffer()
      const nombres = window.XLSX.read(buf, { type: 'array', bookSheets: true }).SheetNames
      const hoja = nombres.find(n => /bi\s*horario/i.test(n)) || nombres[0]
      const wb = window.XLSX.read(buf, { type: 'array', cellDates: true, dense: true, sheets: [hoja] })
      const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: null, blankrows: false })
      filas = filasDeExcel(rows)
      if (!filas || !filas.length) { info.textContent = 'No encontré la tabla del bi-horario (columnas ID y EFICIENCIA) en la hoja "' + hoja + '".'; return }
      const fs = filas.map(r => r.fecha).sort()
      info.innerHTML = `Hoja <b>${esc(hoja)}</b>: <b>${num(filas.length)}</b> registros con cédula, del <b>${fs[0]}</b> al <b>${fs[fs.length - 1]}</b>.`
      ok.disabled = false
    } catch (er) { info.textContent = 'No se pudo leer el archivo: ' + er.message }
  })
  ok.addEventListener('click', async () => {
    if (!filas) return
    ok.disabled = true
    try {
      info.textContent = 'Borrando el histórico anterior…'
      const del = await C.supabase.from('mm_historico').delete().eq('origen', 'excel')
      if (del.error) throw del.error
      for (let i = 0; i < filas.length; i += 2000) {
        info.textContent = `Subiendo… ${num(Math.min(i + 2000, filas.length))} de ${num(filas.length)}`
        const { error } = await C.supabase.from('mm_historico').insert(filas.slice(i, i + 2000))
        if (error) throw error
      }
      const fs = filas.map(r => r.fecha).sort()
      await C.supabase.from('config').upsert({ clave: 'mm_carga', valor: { fecha: new Date().toISOString(), filas: filas.length, hasta: fs[fs.length - 1] }, updated_at: new Date().toISOString() })
      C.closeModal(); C.toast(`Histórico actualizado: ${num(filas.length)} registros.`)
      if (sel) abrir(sel)
    } catch (er) {
      info.textContent = 'Se interrumpió la carga: ' + er.message + '. Vuelve a intentarlo; se reemplaza todo de nuevo.'
      ok.disabled = false
    }
  })
}
