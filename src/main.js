// SuperApp Integrada — Planta Súper Sacos
// Módulo 1: Métodos y Tiempos (primera versión: login + visor de solo lectura)
import { supabase } from './supabaseClient.js'

const app = document.getElementById('app')

// Estado en memoria
const state = {
  session: null,
  perfil: null,      // { nombre, rol }
  codigos: [],       // lista de códigos
  tiposOp: {},       // nombre operación -> tipo (Costura/Manual)
  minPorCodigo: {},  // codigo -> { total, costura, ops }
  filtro: '',
  codigoAbierto: null,
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))
const fmt = (n, d = 2) => (typeof n === 'number' && !isNaN(n)) ? n.toFixed(d) : '—'

// ---------- Arranque ----------
init()

async function init() {
  const { data } = await supabase.auth.getSession()
  state.session = data.session
  supabase.auth.onAuthStateChange((_evt, session) => {
    state.session = session
    if (session) entrarApp()
    else renderLogin()
  })
  if (state.session) entrarApp()
  else renderLogin()
}

// ---------- Login ----------
function renderLogin(errMsg) {
  app.innerHTML = `
    <div class="login-wrap">
      <form class="login-card" id="loginForm">
        <h1>SuperApp</h1>
        <p class="sub">Planta Súper Sacos · Poliplastics S.A.S.</p>
        ${errMsg ? `<div class="login-error">${esc(errMsg)}</div>` : ''}
        <div class="field">
          <label for="email">Correo</label>
          <input id="email" type="email" autocomplete="username" required />
        </div>
        <div class="field">
          <label for="pass">Contraseña</label>
          <input id="pass" type="password" autocomplete="current-password" required />
        </div>
        <button class="btn btn-primary" type="submit" id="loginBtn">Entrar</button>
      </form>
    </div>`
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = document.getElementById('loginBtn')
    const email = document.getElementById('email').value.trim()
    const password = document.getElementById('pass').value
    btn.disabled = true
    btn.textContent = 'Entrando…'
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      renderLogin('Correo o contraseña incorrectos.')
    }
    // Si entra bien, onAuthStateChange dispara entrarApp()
  })
}

// ---------- App autenticada ----------
async function entrarApp() {
  app.innerHTML = `<div class="loading">Cargando…</div>`
  // Perfil del usuario (rol)
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre, rol')
    .eq('id', state.session.user.id)
    .maybeSingle()
  state.perfil = perfil || { nombre: state.session.user.email, rol: 'sin-rol' }

  await cargarDatos()
  renderCodigos()
}

async function cargarDatos() {
  // Operaciones (para saber tipo Costura/Manual)
  const { data: ops } = await supabase.from('operaciones').select('nombre, tipo')
  state.tiposOp = {}
  for (const o of ops || []) state.tiposOp[o.nombre] = o.tipo

  // Códigos
  const { data: cods } = await supabase
    .from('codigos')
    .select('codigo, cliente, descripcion, linea')
    .order('codigo')
  state.codigos = cods || []

  // Tiempos (solo lo necesario para totales): codigo, operacion, min
  state.minPorCodigo = {}
  const { data: tiempos } = await supabase
    .from('tiempos')
    .select('codigo, operacion, min')
  for (const t of tiempos || []) {
    const agg = state.minPorCodigo[t.codigo] || { total: 0, costura: 0, ops: 0 }
    const m = typeof t.min === 'number' ? t.min : 0
    agg.total += m
    agg.ops += 1
    if (state.tiposOp[t.operacion] === 'Costura') agg.costura += m
    state.minPorCodigo[t.codigo] = agg
  }
}

function topbar() {
  const p = state.perfil
  return `
    <div class="topbar">
      <div class="brand">SuperApp <small>Métodos y Tiempos</small></div>
      <div class="user">
        <span>${esc(p.nombre || '')}</span>
        <span class="rol">${esc(p.rol || '')}</span>
        <button class="btn-ghost" id="logoutBtn">Salir</button>
      </div>
    </div>`
}

function wireTopbar() {
  const b = document.getElementById('logoutBtn')
  if (b) b.addEventListener('click', () => supabase.auth.signOut())
}

// ---------- Vista: lista de códigos ----------
function renderCodigos() {
  state.codigoAbierto = null
  const f = state.filtro.trim().toLowerCase()
  const lista = state.codigos.filter((c) => {
    if (!f) return true
    return (
      c.codigo.toLowerCase().includes(f) ||
      (c.cliente || '').toLowerCase().includes(f) ||
      (c.descripcion || '').toLowerCase().includes(f)
    )
  })

  app.innerHTML = `
    ${topbar()}
    <div class="container">
      <div class="toolbar">
        <input class="search" id="search" placeholder="Buscar por código, cliente o descripción…" value="${esc(state.filtro)}" />
        <span class="count">${lista.length} de ${state.codigos.length} códigos</span>
      </div>
      <div class="tablebox">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Cliente</th>
              <th class="hide-mobile">Descripción</th>
              <th class="num">Costura (min)</th>
              <th class="num hide-mobile">Total (min)</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${lista.map(filaCodigo).join('') || `<tr><td colspan="6"><div class="empty">Sin resultados.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`

  wireTopbar()
  const s = document.getElementById('search')
  s.addEventListener('input', (e) => {
    state.filtro = e.target.value
    renderCodigos()
    // Mantener foco al re-renderizar
    const ns = document.getElementById('search')
    ns.focus()
    ns.setSelectionRange(ns.value.length, ns.value.length)
  })
  document.querySelectorAll('[data-codigo]').forEach((el) =>
    el.addEventListener('click', () => abrirCodigo(el.getAttribute('data-codigo')))
  )
}

function filaCodigo(c) {
  const agg = state.minPorCodigo[c.codigo]
  const tiene = !!agg
  return `
    <tr>
      <td><span class="linkish" data-codigo="${esc(c.codigo)}">${esc(c.codigo)}</span></td>
      <td>${esc(c.cliente || '—')}</td>
      <td class="hide-mobile">${esc(c.descripcion || '—')}</td>
      <td class="num">${tiene ? fmt(agg.costura) : '—'}</td>
      <td class="num hide-mobile">${tiene ? fmt(agg.total) : '—'}</td>
      <td>${tiene ? '<span class="pill pill-ok">Con tiempos</span>' : '<span class="pill pill-no">Sin tiempos</span>'}</td>
    </tr>`
}

// ---------- Vista: detalle de un código ----------
async function abrirCodigo(codigo) {
  state.codigoAbierto = codigo
  const c = state.codigos.find((x) => x.codigo === codigo)
  app.innerHTML = `${topbar()}<div class="container"><div class="loading">Cargando operaciones…</div></div>`
  wireTopbar()

  const { data: filas } = await supabase
    .from('tiempos')
    .select('operacion, min, obs, val, supl, muestras, orden')
    .eq('codigo', codigo)
    .order('orden')

  const rows = filas || []
  const total = rows.reduce((s, r) => s + (typeof r.min === 'number' ? r.min : 0), 0)
  const costura = rows.reduce((s, r) => s + (state.tiposOp[r.operacion] === 'Costura' && typeof r.min === 'number' ? r.min : 0), 0)

  app.innerHTML = `
    ${topbar()}
    <div class="container">
      <button class="back" id="back">← Volver a códigos</button>
      <div class="detail-head">
        <h2>${esc(c?.codigo || codigo)}</h2>
        <div class="meta">${esc(c?.cliente || '')}${c?.descripcion ? ' · ' + esc(c.descripcion) : ''}</div>
        <div class="chips">
          <div class="chip"><b>${esc(c?.linea || '—')}</b><span>Línea</span></div>
          <div class="chip"><b>${rows.length}</b><span>Operaciones</span></div>
          <div class="chip"><b>${fmt(costura)}</b><span>Costura (min)</span></div>
          <div class="chip"><b>${fmt(total)}</b><span>Total (min)</span></div>
        </div>
      </div>
      <div class="tablebox">
        <table>
          <thead>
            <tr>
              <th class="num">#</th>
              <th>Operación</th>
              <th>Tipo</th>
              <th class="num">Tiempo (min)</th>
              <th class="num hide-mobile">Und/hora</th>
              <th class="num hide-mobile">Muestras</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(filaOperacion).join('') || `<tr><td colspan="6"><div class="empty">Este código no tiene operaciones registradas.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`

  wireTopbar()
  document.getElementById('back').addEventListener('click', renderCodigos)
}

function filaOperacion(r, i) {
  const tipo = state.tiposOp[r.operacion] || 'Manual'
  const undHora = (typeof r.min === 'number' && r.min > 0) ? Math.round(60 / r.min) : null
  const nMuestras = Array.isArray(r.muestras) ? r.muestras.length : 0
  return `
    <tr>
      <td class="num">${i + 1}</td>
      <td>${esc(r.operacion)}</td>
      <td class="${tipo === 'Costura' ? 'tipo-costura' : 'tipo-manual'}">${esc(tipo)}</td>
      <td class="num">${fmt(r.min, 3)}</td>
      <td class="num hide-mobile">${undHora ?? '—'}</td>
      <td class="num hide-mobile">${nMuestras || '—'}</td>
    </tr>`
}
