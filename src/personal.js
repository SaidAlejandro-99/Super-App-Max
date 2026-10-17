// Personal: operarios (los que se asignan en el Bi-horario) y supervisores.
// Supervisores y admin agregan y retiran operarios; solo el admin edita
// supervisores y reactiva personas retiradas.
import { LINEAS, modalPersonaNueva, recargarOperarios } from './bihorario.js'

let C = null, el = null
let tab = 'operarios', filtro = { q: '', linea: '', retirados: false }
let OPS = [], SUPS = []

export function init(ctx) {
  C = ctx
  el = document.getElementById('mod-personal')
  el.addEventListener('click', onClick)
}
export async function show() {
  el.innerHTML = '<div class="loading">Cargando personal…</div>'
  await cargar()
  pintar()
}
async function cargar() {
  const [o, s] = await Promise.all([
    C.supabase.from('operarios').select('cedula, nombre, linea, rol, operacion_base, activo').order('nombre').range(0, 4999),
    C.supabase.from('supervisores').select('*').order('nombre'),
  ])
  if (o.error || s.error) { C.toast('No se pudo cargar el personal.'); return }
  OPS = o.data; SUPS = s.data
}
const esAdmin = () => C.role() === 'admin'
const esStaff = () => ['admin', 'supervisor'].includes(C.role())
const lineaTxt = v => (LINEAS.find(l => l.v === v) || { t: v }).t

function pintar() {
  el.innerHTML = `
  <nav class="tabs" style="position:static;margin:-4px 0 14px;border-radius:10px;border:1px solid var(--line)">
    <button aria-selected="${tab === 'operarios'}" data-a="tab" data-t="operarios">Operarios</button>
    ${esAdmin() ? `<button aria-selected="${tab === 'supervisores'}" data-a="tab" data-t="supervisores">Supervisores</button>` : ''}
  </nav>
  <div id="pp-body"></div>`
  tab === 'supervisores' && esAdmin() ? pintarSupervisores() : pintarOperarios()
}

function pintarOperarios() {
  const lineas = [...new Set(OPS.map(o => o.linea).filter(Boolean))].sort()
  document.getElementById('pp-body').innerHTML = `
  <div class="controls">
    <input class="search" type="search" id="pp-q" placeholder="Buscar por nombre o cédula…" value="${C.esc(filtro.q)}">
    <select id="pp-lin"><option value="">Todas las líneas</option>${lineas.map(l => `<option value="${C.esc(l)}" ${l === filtro.linea ? 'selected' : ''}>${C.esc(lineaTxt(l))}</option>`).join('')}</select>
    ${esAdmin() ? `<label class="muted" style="font-size:13px"><input type="checkbox" id="pp-ret" ${filtro.retirados ? 'checked' : ''}> Ver retirados</label>` : ''}
    ${esStaff() ? '<button class="btn go right" data-a="nueva">+ Persona</button>' : ''}
  </div>
  <div class="tablebox"><table>
    <thead><tr><th>Nombre</th><th>Cédula</th><th>Línea</th><th>Operación habitual</th><th>Estado</th><th></th></tr></thead>
    <tbody id="pp-tb"></tbody>
  </table></div>
  <div class="count" id="pp-count"></div>`
  llenarOperarios()
  document.getElementById('pp-q').addEventListener('input', e => { filtro.q = e.target.value; llenarOperarios() })
  document.getElementById('pp-lin').addEventListener('change', e => { filtro.linea = e.target.value; llenarOperarios() })
  const r = document.getElementById('pp-ret'); if (r) r.addEventListener('change', e => { filtro.retirados = e.target.checked; llenarOperarios() })
}
function llenarOperarios() {
  const q = filtro.q.trim().toLowerCase()
  const rows = OPS.filter(o => (filtro.retirados || o.activo) && (!filtro.linea || o.linea === filtro.linea) && (!q || (o.nombre + ' ' + o.cedula).toLowerCase().includes(q)))
  document.getElementById('pp-tb').innerHTML = rows.map(o => `<tr>
    <td>${C.esc(o.nombre)}</td><td class="mono">${C.esc(o.cedula)}</td><td>${C.esc(lineaTxt(o.linea))}</td>
    <td class="muted">${C.esc(o.operacion_base || '')}</td>
    <td>${o.activo ? '<span class="pill si">Activo</span>' : '<span class="pill no">Retirado</span>'}</td>
    <td class="nowrap">${o.activo && esStaff() ? `<button class="btn sm ghost danger" data-a="retirar" data-c="${C.esc(o.cedula)}">Retirar</button>` : ''}
      ${!o.activo && esAdmin() ? `<button class="btn sm ghost" data-a="reactivar" data-c="${C.esc(o.cedula)}">Reactivar</button>` : ''}</td></tr>`).join('')
    || '<tr><td colspan="6" class="empty">Sin resultados</td></tr>'
  document.getElementById('pp-count').textContent = `${rows.length} personas · ${OPS.filter(o => o.activo).length} activas en total`
}

function pintarSupervisores() {
  document.getElementById('pp-body').innerHTML = `
  <div class="controls"><div class="hint" style="margin:0">Los supervisores que aparecen al abrir un turno del Bi-horario.</div>
    <button class="btn go right" data-a="supNuevo">+ Supervisor</button></div>
  <div class="tablebox"><table>
    <thead><tr><th>Nombre</th><th>Cédula</th><th>Estado</th><th></th></tr></thead>
    <tbody>${SUPS.map(s => `<tr><td>${C.esc(s.nombre)}</td><td class="mono">${C.esc(s.cedula)}</td>
      <td>${s.activo ? '<span class="pill si">Activo</span>' : '<span class="pill no">Inactivo</span>'}</td>
      <td><button class="btn sm ghost" data-a="supEditar" data-c="${C.esc(s.cedula)}">Editar</button></td></tr>`).join('')}</tbody>
  </table></div>
  <div class="count">Para que un supervisor entre a la app hay que crearle su usuario (correo y contraseña). Pásale el correo a Said y se liga a su nombre.</div>`
}

function modalSupervisor(cedula) {
  const s = cedula ? SUPS.find(x => x.cedula === cedula) : { cedula: '', nombre: '', activo: true }
  C.openModal(`<h3>${cedula ? 'Editar supervisor' : 'Nuevo supervisor'}</h3>
    <div class="field"><label>Nombre completo</label><input id="sp-nom" value="${C.esc(s.nombre)}"></div>
    <div class="field"><label>Cédula</label><input id="sp-ced" inputmode="numeric" value="${C.esc(s.cedula)}" ${cedula ? 'disabled' : ''}></div>
    <div class="field"><label>Estado</label><select id="sp-act"><option value="1" ${s.activo ? 'selected' : ''}>Activo</option><option value="0" ${!s.activo ? 'selected' : ''}>Inactivo</option></select></div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn go" id="sp-ok">Guardar</button></div>`)
  document.getElementById('sp-ok').addEventListener('click', async () => {
    const fila = {
      cedula: cedula || document.getElementById('sp-ced').value.replace(/\D/g, ''),
      nombre: document.getElementById('sp-nom').value.trim().replace(/\s+/g, ' ').toUpperCase(),
      activo: document.getElementById('sp-act').value === '1', updated_at: new Date().toISOString(),
    }
    if (fila.nombre.split(' ').length < 2) { C.toast('Escribe el nombre completo.'); return }
    if (fila.cedula.length < 5) { C.toast('Escribe la cédula (solo números).'); return }
    if (!cedula && SUPS.some(x => x.cedula === fila.cedula)) { C.toast('Esa cédula ya está registrada.'); return }
    const { error } = await C.supabase.from('supervisores').upsert(fila)
    if (error) { C.toast('No se pudo guardar: ' + error.message); return }
    C.closeModal(); C.toast('Supervisor guardado.')
    await cargar(); await recargarOperarios(); pintar()
  })
}

async function cambiarEstado(cedula, activo) {
  const { error } = await C.supabase.from('operarios').update({ activo, updated_at: new Date().toISOString() }).eq('cedula', cedula)
  if (error) { C.toast('No se pudo guardar: ' + error.message); return }
  const o = OPS.find(x => x.cedula === cedula); if (o) o.activo = activo
  await recargarOperarios()
  C.toast(activo ? 'Persona reactivada.' : 'Persona retirada.'); llenarOperarios()
}

async function onClick(e) {
  const x = e.target.closest('[data-a]'); if (!x) return
  const c = x.dataset.c
  switch (x.dataset.a) {
    case 'tab': tab = x.dataset.t; return pintar()
    case 'nueva': return modalPersonaNueva(async () => { await cargar(); pintar() })
    case 'retirar': {
      const o = OPS.find(y => y.cedula === c)
      C.openModal(`<h3>Retirar persona</h3><div class="hint" style="color:var(--muted);font-size:13px">¿Retirar a <b>${C.esc(o.nombre)}</b>? Ya no aparecerá para asignar en el Bi-horario. Sus registros anteriores se conservan.</div>
        <div class="modal-actions"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn danger" id="rt-ok">Sí, retirar</button></div>`)
      document.getElementById('rt-ok').addEventListener('click', () => { C.closeModal(); cambiarEstado(c, false) })
      return
    }
    case 'reactivar': return cambiarEstado(c, true)
    case 'supNuevo': return modalSupervisor(null)
    case 'supEditar': return modalSupervisor(c)
  }
}
