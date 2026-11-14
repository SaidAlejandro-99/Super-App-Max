// Corte de componentes. El área trabaja 24 h y el supervisor (de día) anota a la mañana siguiente
// lo que hizo cada máquina en cada turno: personas, cantidad y tiempo muerto. No es hora a hora.
// Eficiencia = cantidad ÷ (meta por hora × horas disponibles); horas disponibles = horas − tiempo muerto.
// En Máquina 1 y en la perforadora con 2 personas la cantidad es de las dos (misma eficiencia).
let C = null, caja = null
let fecha = null
const D = { maquinas: [], turnos: [], causas: [], operarios: [], cargado: false }

const ayer = () => { const d = new Date(Date.now() - 86400000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const pct = v => v == null ? '—' : Math.round(v * 100) + '%'
const efClase = v => v == null ? '' : v > 1.5 ? 'ef-ok ef-raro' : v >= 0.95 ? 'ef-ok' : v >= 0.8 ? 'ef-med' : 'ef-bajo'
const puedeEditar = () => ['admin', 'supervisor'].includes(C.role())
const nombre = ced => { const o = D.operarios.find(x => x.cedula === ced); return o ? o.nombre : ced }
const corto = n => { const p = String(n || '').trim().split(/\s+/); return p.length >= 3 ? `${p[2]} ${p[0]}` : n }
const maq = cod => D.maquinas.find(m => m.codigo === cod)
// Horas de trabajo de un turno: los de 12 h cuentan 11 (como se definieron las metas).
function horasDe(codigo) {
  const t = D.turnos.find(x => x.codigo === codigo); if (!t) return 8
  const h = (+t.fin.slice(0, 2) - +t.inicio.slice(0, 2) + 24) % 24 || 24
  return h >= 12 ? 11 : h
}
const turnoTxt = codigo => { const t = D.turnos.find(x => x.codigo === codigo); return t ? `Turno ${t.codigo} · ${t.inicio.slice(0, 5)}–${t.fin.slice(0, 5)}` : codigo }
const metaDe = (m, personas) => personas >= 2 && m.meta_hora_2 ? +m.meta_hora_2 : +m.meta_hora
const eficiencia = r => { const disp = (r.horas * 60 - (r.tm_minutos || 0)) / 60; return disp > 0 && r.meta_hora ? r.cantidad / (r.meta_hora * disp) : null }

async function cargarCatalogos() {
  if (D.cargado) return
  const s = C.supabase
  const [m, t, c, o] = await Promise.all([
    s.from('corte_maquinas').select('*').eq('activo', true).order('orden'),
    s.from('turnos_def').select('codigo, inicio, fin, descanso').order('orden'),
    s.from('causas_tm').select('*').order('orden'),
    s.from('operarios').select('cedula, nombre, linea, activo').order('nombre').range(0, 4999),
  ])
  const err = m.error || t.error || c.error || o.error; if (err) throw err
  D.maquinas = m.data; D.turnos = t.data; D.causas = c.data.filter(x => x.tipo !== 'tardanza'); D.operarios = o.data
  D.cargado = true
}

let REG = []
async function cargarDia() {
  const { data, error } = await C.supabase.from('corte_registros').select('*, corte_personas(cedula)').eq('fecha', fecha).order('created_at')
  if (error) throw error
  REG = data.map(r => ({ ...r, personas: r.corte_personas.map(p => p.cedula) }))
}

export async function pintar(contenedor, ctx) {
  C = ctx; caja = contenedor
  if (!fecha) fecha = ayer()
  caja.innerHTML = '<div class="loading">Cargando…</div>'
  try { await cargarCatalogos(); await cargarDia() } catch (e) { caja.innerHTML = `<div class="banner">No se pudo cargar Corte de componentes: ${C.esc(e.message || e)}</div>`; return }
  const ed = puedeEditar()
  let tot = 0, esp = 0
  REG.forEach(r => { const disp = (r.horas * 60 - (r.tm_minutos || 0)) / 60; if (disp > 0) { tot += +r.cantidad; esp += r.meta_hora * disp } })
  const efDia = REG.length ? REG.reduce((s, r) => s + (eficiencia(r) || 0) * (r.horas * 60 - r.tm_minutos), 0) / REG.reduce((s, r) => s + (r.horas * 60 - r.tm_minutos), 0) : null
  const personas = new Set(REG.flatMap(r => r.personas)).size
  const tm = REG.reduce((s, r) => s + (+r.tm_minutos || 0), 0)
  caja.innerHTML = `
  <div class="ct-head">
    <div class="hint" style="margin:0">Producción del día por máquina y turno. Se anota al día siguiente; no es hora a hora.</div>
    <label class="ct-fecha">Fecha de producción <input type="date" id="ct-fecha" value="${fecha}"></label>
  </div>
  <div class="grid kpis" style="margin-bottom:12px">
    <div class="kpi"><div class="label">Eficiencia del área</div><div class="value ${efClase(efDia)}">${pct(efDia)}</div><div class="sub">${REG.length} turnos de máquina</div></div>
    <div class="kpi"><div class="label">Personas</div><div class="value">${personas}</div></div>
    <div class="kpi"><div class="label">Tiempo muerto</div><div class="value">${C.fmt0(tm)}<small style="font-size:14px;color:var(--muted)"> min</small></div></div>
  </div>
  <div class="ct-maquinas">${D.maquinas.map(m => tarjeta(m, ed)).join('')}</div>`
  document.getElementById('ct-fecha').addEventListener('change', e => { fecha = e.target.value || ayer(); pintar(caja, C) })
  caja.onclick = onClick
}

function tarjeta(m, ed) {
  const regs = REG.filter(r => r.maquina === m.codigo).sort((a, b) => a.turno.localeCompare(b.turno))
  const metaTxt = `${C.fmt0(m.meta_hora)} ${m.unidad}/h${m.meta_hora_2 ? ` · con 2 personas ${C.fmt0(m.meta_hora_2)}/h` : ''}`
  return `<div class="section ct-maq">
    <div class="bh-bloque-head">
      <div><h2 style="margin:0">${C.esc(m.nombre)}</h2>
        <div class="hint" style="margin:0">Meta ${metaTxt} · turno normal ${C.fmt0(m.horas)} h${m.max_personas > 1 ? ` · hasta ${m.max_personas} personas, una sola cantidad` : ''}</div></div>
      ${ed && regs.length < 3 ? `<button class="btn sm go" data-k="nuevo" data-m="${m.codigo}">+ Turno</button>` : ''}
    </div>
    ${regs.length ? `<div class="tablebox"><table class="ct-tabla">
      <thead><tr><th>Turno</th><th>Personas</th><th class="num">Cantidad</th><th class="num">Horas</th><th class="num">TM</th><th class="num">Meta/h</th><th class="num">Efic.</th>${ed ? '<th></th>' : ''}</tr></thead>
      <tbody>${regs.map(r => { const ef = eficiencia(r); const c = r.tm_causa && D.causas.find(x => x.codigo === r.tm_causa); return `<tr>
        <td>${C.esc(turnoTxt(r.turno))}</td>
        <td>${r.personas.map(p => `<span class="bh-nombre" data-k="marcador" data-c="${C.esc(p)}" title="Abrir Mi Marcador">${C.esc(corto(nombre(p)))}</span>`).join('<span class="muted"> y </span>') || '<span class="muted">sin personas</span>'}</td>
        <td class="num"><b>${C.fmt0(r.cantidad)}</b></td>
        <td class="num">${C.fmt0(r.horas)}</td>
        <td class="num muted">${r.tm_minutos ? `${r.tm_minutos}′${c ? ` <small>${C.esc(c.corta || c.descripcion)}</small>` : ''}` : ''}</td>
        <td class="num">${C.fmt0(r.meta_hora)}${r.meta_ajustada ? ' <span class="pill man" title="Meta ajustada por día atípico">ajust.</span>' : ''}</td>
        <td class="num ${efClase(ef)}"><b>${pct(ef)}</b></td>
        ${ed ? `<td class="num"><button class="btn sm ghost" data-k="editar" data-id="${r.id}">✎</button></td>` : ''}</tr>
        ${r.nota ? `<tr class="ct-nota"><td colspan="${ed ? 8 : 7}">${C.esc(r.nota)}</td></tr>` : ''}` }).join('')}</tbody>
    </table></div>` : `<div class="muted" style="font-size:13px">${ed ? 'Sin registros este día. Toca "+ Turno" para anotar.' : 'Sin registros este día.'}</div>`}
  </div>`
}

function onClick(e) {
  const x = e.target.closest('[data-k]'); if (!x) return
  if (x.dataset.k === 'nuevo') return modalRegistro(maq(x.dataset.m), null)
  if (x.dataset.k === 'editar') { const r = REG.find(y => y.id === x.dataset.id); return modalRegistro(maq(r.maquina), r) }
  if (x.dataset.k === 'marcador') return C.verMarcador(x.dataset.c)
}

function modalRegistro(m, r) {
  const usados = new Set(REG.filter(y => y.maquina === m.codigo && (!r || y.id !== r.id)).map(y => y.turno))
  const turnos = D.turnos.filter(t => !usados.has(t.codigo))
  let personas = r ? [...r.personas] : []
  let ajustar = r ? r.meta_ajustada : false
  C.openModal(`<h3>${C.esc(m.nombre)} · ${r ? 'editar turno' : 'nuevo turno'}</h3>
    <div class="hint" style="color:var(--muted);font-size:12.5px;margin-bottom:8px">Producción del ${C.esc(fecha)}.</div>
    <div class="ct-form">
      <div class="field"><label>Turno</label><select id="cr-turno">${turnos.map(t => `<option value="${C.esc(t.codigo)}" ${r && r.turno === t.codigo ? 'selected' : ''}>${C.esc(turnoTxt(t.codigo))}</option>`).join('')}</select></div>
      <div class="field"><label>Horas trabajadas</label><input type="number" id="cr-horas" min="0.5" max="12" step="0.5" inputmode="decimal"></div>
    </div>
    <div class="field"><label>Personas (${m.max_personas > 1 ? `hasta ${m.max_personas}` : '1'})</label>
      <div class="bh-lideres" id="cr-pers"></div>
      <input type="search" class="search" id="cr-q" style="width:100%;margin-top:6px" placeholder="Buscar por nombre o cédula…" autocomplete="off">
      <div class="hlist" id="cr-res" style="max-height:180px"></div></div>
    <div class="ct-form">
      <div class="field"><label>Cantidad (${C.esc(m.unidad)})</label><input type="number" id="cr-cant" min="0" step="1" inputmode="numeric" value="${r ? r.cantidad : ''}"></div>
      <div class="field"><label>Meta por hora</label><div id="cr-metatxt" style="padding:8px 0"></div>
        <label style="font-size:12.5px;font-weight:500"><input type="checkbox" id="cr-ajustar" ${ajustar ? 'checked' : ''}> Ajustar (día atípico)</label>
        <input type="number" id="cr-meta" min="1" step="1" inputmode="numeric" ${ajustar ? '' : 'hidden'} value="${r && r.meta_ajustada ? r.meta_hora : ''}"></div>
    </div>
    <div class="ct-form">
      <div class="field"><label>Tiempo muerto (minutos)</label><input type="number" id="cr-tm" min="0" step="1" inputmode="numeric" value="${r && r.tm_minutos ? r.tm_minutos : ''}" placeholder="0"></div>
      <div class="field"><label>Causa</label><select id="cr-causa"><option value="">—</option>${D.causas.map(c => `<option value="${C.esc(c.codigo)}" ${r && r.tm_causa === c.codigo ? 'selected' : ''}>${C.esc(c.codigo)} · ${C.esc(c.descripcion)}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Nota (opcional)</label><input type="text" id="cr-nota" maxlength="300" value="${C.esc(r && r.nota || '')}"></div>
    <div class="ct-prev" id="cr-prev"></div>
    <div class="modal-actions" style="justify-content:space-between">
      ${r ? '<button class="btn ghost danger" id="cr-borrar">Borrar</button>' : '<span></span>'}
      <span><button class="btn ghost" data-act="closeModal">Cancelar</button> <button class="btn go" id="cr-ok">Guardar</button></span>
    </div>`, true)
  const $ = id => document.getElementById(id)
  if (!turnos.length) { $('cr-turno').outerHTML = '<div class="muted">Esta máquina ya tiene todos los turnos del día.</div>' }
  $('cr-horas').value = r ? r.horas : horasDe($('cr-turno') ? $('cr-turno').value : '')
  if ($('cr-turno')) $('cr-turno').addEventListener('change', e => { $('cr-horas').value = horasDe(e.target.value); prev() })
  const meta = () => ajustar && +$('cr-meta').value > 0 ? +$('cr-meta').value : metaDe(m, personas.length)
  const prev = () => {
    $('cr-metatxt').innerHTML = `<b>${C.fmt0(metaDe(m, personas.length))}</b> ${C.esc(m.unidad)}/h${m.meta_hora_2 ? (personas.length >= 2 ? ' (con 2 personas)' : ' (1 persona)') : ''}`
    const h = +$('cr-horas').value || 0, tm = +$('cr-tm').value || 0, cant = +$('cr-cant').value
    const ef = eficiencia({ horas: h, tm_minutos: tm, cantidad: cant, meta_hora: meta() })
    $('cr-prev').innerHTML = $('cr-cant').value === '' ? '' : `Meta del turno: <b>${C.fmt0(Math.round(meta() * Math.max(0, h * 60 - tm) / 60))}</b> ${C.esc(m.unidad)} · Eficiencia <b class="${efClase(ef)}">${pct(ef)}</b>${ef > 1.5 ? ' <b class="ef-med">· revisa la cantidad, es muy alta</b>' : ''}`
  }
  const pintarPers = () => {
    $('cr-pers').innerHTML = personas.map(c => `<span class="bh-pop">${C.esc(corto(nombre(c)))} <button class="bh-x" data-q="${C.esc(c)}" title="Quitar">×</button></span>`).join('') || '<span class="muted" style="font-size:13px">Sin personas todavía.</span>'
    $('cr-q').hidden = personas.length >= m.max_personas
    prev()
  }
  const buscar = q => {
    const n = q.trim().toLowerCase()
    const lista = D.operarios.filter(o => o.activo && !personas.includes(o.cedula) && (!n || (o.nombre + ' ' + o.cedula).toLowerCase().includes(n)))
      .sort((a, b) => ((b.linea || '').startsWith('CORTE') ? 1 : 0) - ((a.linea || '').startsWith('CORTE') ? 1 : 0) || a.nombre.localeCompare(b.nombre)).slice(0, 40)
    $('cr-res').innerHTML = n || personas.length < m.max_personas ? `<table><tbody>${lista.map(o => `<tr class="bh-pick" data-p="${C.esc(o.cedula)}"><td>${C.esc(corto(o.nombre))}<div class="muted" style="font-size:11px">${C.esc(o.nombre)}</div></td><td class="muted" style="font-size:12px">${C.esc(o.linea || '')}</td></tr>`).join('') || '<tr><td class="empty">Sin resultados</td></tr>'}</tbody></table>` : ''
  }
  $('cr-pers').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (!b) return; personas = personas.filter(c => c !== b.dataset.q); pintarPers(); buscar($('cr-q').value) })
  $('cr-res').addEventListener('click', e => {
    const t = e.target.closest('[data-p]'); if (!t || personas.length >= m.max_personas) return
    personas.push(t.dataset.p); $('cr-q').value = ''; pintarPers(); buscar(''); if (personas.length >= m.max_personas) $('cr-res').innerHTML = ''
  })
  $('cr-q').addEventListener('input', e => buscar(e.target.value))
  $('cr-ajustar').addEventListener('change', e => { ajustar = e.target.checked; $('cr-meta').hidden = !ajustar; if (ajustar && !$('cr-meta').value) $('cr-meta').value = metaDe(m, personas.length); prev() })
  ;['cr-horas', 'cr-cant', 'cr-tm', 'cr-meta'].forEach(id => $(id).addEventListener('input', prev))
  pintarPers(); if (personas.length < m.max_personas) buscar('')

  $('cr-ok').addEventListener('click', async () => {
    const turno = $('cr-turno') ? $('cr-turno').value : null
    const horas = +$('cr-horas').value, cantidad = $('cr-cant').value === '' ? null : +$('cr-cant').value
    const tm = +$('cr-tm').value || 0, causa = $('cr-causa').value || null
    if (!turno) { C.toast('Elige el turno.'); return }
    if (!personas.length) { C.toast('Agrega a la persona (o personas) de la máquina.'); return }
    if (!(horas > 0 && horas <= 12)) { C.toast('Las horas deben estar entre 0,5 y 12.'); return }
    if (cantidad == null || cantidad < 0) { C.toast(`Escribe la cantidad de ${m.unidad}.`); return }
    if (tm >= horas * 60) { C.toast('El tiempo muerto no puede ser todo el turno.'); return }
    if (tm && !causa) { C.toast('Elige la causa del tiempo muerto.'); return }
    if (ajustar && !(+$('cr-meta').value > 0)) { C.toast('Escribe la meta ajustada.'); return }
    const fila = { id: r ? r.id : crypto.randomUUID(), fecha, maquina: m.codigo, turno, horas, cantidad, meta_hora: meta(), meta_ajustada: !!ajustar,
      tm_minutos: tm, tm_causa: tm ? causa : null, nota: $('cr-nota').value.trim() || null, supervisor_cedula: (C.perfil() || {}).supervisor_cedula || null }
    const ef = eficiencia(fila)
    if (ef > 1.5 && !$('cr-ok').dataset.confirmado) { $('cr-ok').dataset.confirmado = '1'; $('cr-ok').textContent = 'Guardar igual'; C.toast(`La eficiencia da ${pct(ef)}: revisa la cantidad. Si está bien, toca "Guardar igual".`, 5000); return }
    $('cr-ok').disabled = true
    const s = C.supabase
    let { error } = await s.from('corte_registros').upsert(fila)
    if (!error) ({ error } = await s.from('corte_personas').delete().eq('registro_id', fila.id))
    if (!error) ({ error } = await s.from('corte_personas').insert(personas.map(cedula => ({ registro_id: fila.id, cedula }))))
    if (error) {
      $('cr-ok').disabled = false
      C.toast(/duplicate|unique/i.test(error.message) ? 'Esa máquina ya tiene ese turno en esta fecha.' : 'No se pudo guardar (¿sin señal?): ' + error.message, 5000); return
    }
    C.closeModal(); C.toast('Guardado.'); pintar(caja, C)
  })
  if (r) $('cr-borrar').addEventListener('click', async () => {
    if (!$('cr-borrar').dataset.ok) { $('cr-borrar').dataset.ok = '1'; $('cr-borrar').textContent = '¿Seguro? Toca otra vez'; return }
    const { error } = await C.supabase.from('corte_registros').delete().eq('id', r.id)
    if (error) { C.toast('No se pudo borrar: ' + error.message, 5000); return }
    C.closeModal(); C.toast('Borrado.'); pintar(caja, C)
  })
}
