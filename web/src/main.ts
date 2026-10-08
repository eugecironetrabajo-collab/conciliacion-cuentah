import './style.css'
import { ASSIGNEE_OPTIONS } from '../../src/assignees.js'
import { columnAmountCents, matchesConcept, nextSort, referenceOne, sortMovements, type ColumnSort, type SortKey } from '../../src/reconcile.js'
import { TERMINALS, movementLabel } from '../../src/terminals.js'
import { api, escapeHtml as esc, getMovements, getSession, login, logout, money, shortDate, type Candidate, type Movement, type Reconciliation } from './api'
import { setupColumnResize, setupQuadrantSplitter } from './resize.js'

const isFormField = (target: EventTarget | null) => {
  const element = target as HTMLElement | null
  return Boolean(element?.closest('input, select, textarea, button'))
}

const dealerOptions = `<option value="">Todas</option>${TERMINALS.map((terminal) => `<option value="${terminal.code}">${terminal.code} · ${terminal.label}</option>`).join('')}`

type Route = 'resumen' | 'movimientos' | 'conciliar' | 'importar' | 'reportes' | 'auditoria'

const routes: Array<{ id: Route; label: string; icon: string }> = [
  { id: 'resumen', label: 'Resumen', icon: '◫' },
  { id: 'movimientos', label: 'Movimientos', icon: '≡' },
  { id: 'conciliar', label: 'Conciliar', icon: '⇄' },
  { id: 'importar', label: 'Importar', icon: '↑' },
  { id: 'reportes', label: 'Reportes', icon: '↗' },
  { id: 'auditoria', label: 'Auditoría', icon: '⌕' },
]

const app = document.querySelector<HTMLDivElement>('#app')!
let sessionUser = 'local'

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'ME'

function updateSessionUser() {
  const label = document.querySelector<HTMLElement>('#session-user-name')
  const subtitle = document.querySelector<HTMLElement>('#session-user-subtitle')
  const avatar = document.querySelector<HTMLElement>('#session-avatar')
  if (label) label.textContent = sessionUser
  if (subtitle) subtitle.textContent = sessionUser === 'local' ? 'Usuario local' : 'Sesión activa'
  if (avatar) avatar.textContent = initials(sessionUser)
}

let shellListenersAttached = false

function attachShellListeners() {
  if (shellListenersAttached) return
  shellListenersAttached = true
  window.addEventListener('hashchange', () => { void render() })
  window.addEventListener('mec:unauthorized', () => renderLogin())
}

function renderLogin(error = '') {
  app.innerHTML = `
    <section class="login-screen">
      <div class="login-card panel">
        <div class="login-brand"><span class="brand-mark">M</span><div><b>MEC</b><small>Método Externo de Conciliación</small></div></div>
        <h1>Iniciar sesión</h1>
        <p>Ingrese sus credenciales para acceder a la instalación.</p>
        ${error ? `<div class="login-error">${esc(error)}</div>` : ''}
        <form id="login-form" class="login-form">
          <label>Usuario<input name="username" autocomplete="username" required></label>
          <label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label>
          <button class="button primary" type="submit">Ingresar <span>→</span></button>
        </form>
      </div>
    </section>`
  document.querySelector<HTMLFormElement>('#login-form')!.addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = new FormData(event.target as HTMLFormElement)
    try {
      const session = await login(String(form.get('username') ?? ''), String(form.get('password') ?? ''))
      sessionUser = session.user
      shell()
      attachShellListeners()
      updateSessionUser()
      if (!location.hash) location.hash = '#/resumen'
      await render()
    } catch (loginError) {
      renderLogin(loginError instanceof Error ? loginError.message : 'No se pudo iniciar sesión')
    }
  })
}

function shell() {
  app.innerHTML = `
    <header class="app-header">
      <div class="header-main">
        <a class="brand" href="#/resumen" aria-label="MEC — Método Externo de Conciliación">
          <span class="brand-mark">M</span>
          <span><b>MEC</b><small>Método Externo de Conciliación</small></span>
        </a>
        <div class="company-switcher">
          <span>Empresa activa</span>
          <button type="button" class="company-switcher-button">
            <span class="company-switcher-copy">
              <b>Peugeot Citroën Argentina S.A.</b>
              <small>Cuenta H · ARS</small>
            </span>
            <span class="menu-chevron" aria-hidden="true"></span>
          </button>
        </div>
        <div class="top-actions">
          <span class="live"><i></i>Sistema operativo</span>
          <span class="database-pill"><small>Base activa</small><b id="db-badge">conciliacion.db</b></span>
          <button class="user-menu" id="logout-button" type="button" title="Cerrar sesión">
            <span class="avatar" id="session-avatar">${esc(initials(sessionUser))}</span>
            <span class="user-menu-copy"><b id="session-user-name">${esc(sessionUser)}</b><small id="session-user-subtitle">Sesión activa</small></span>
            <span class="menu-chevron" aria-hidden="true"></span>
          </button>
        </div>
      </div>
      <div class="nav-bar">
        <button class="menu-button" id="menu-button" aria-label="Abrir navegación">☰ <span id="crumb-current">Resumen</span></button>
        <nav id="nav">${routes.map((route) => `
          <a href="#/${route.id}" data-nav="${route.id}">
            <span class="nav-icon">${route.icon}</span>${route.label}
          </a>`).join('')}</nav>
        <span class="nav-context">MEC / CUENTA H</span>
      </div>
    </header>
    <main>
      <div id="view" class="view"></div>
    </main>
    <div id="toast" role="status" aria-live="polite"></div>
  `
  document.querySelector('#menu-button')?.addEventListener('click', () => document.body.classList.toggle('menu-open'))
  document.querySelectorAll('#nav a').forEach((link) => link.addEventListener('click', () => document.body.classList.remove('menu-open')))
  document.querySelector('#logout-button')?.addEventListener('click', async () => {
    try {
      await logout()
    } catch {
      // ignore logout errors and return to login
    }
    sessionUser = 'local'
    renderLogin()
  })
}

function route(): Route {
  const id = location.hash.replace('#/', '') as Route
  return routes.some((item) => item.id === id) ? id : 'resumen'
}

function heading(eyebrow: string, title: string, text: string, actions = '') {
  return `<div class="page-heading">
    <div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${text}</p></div>
    ${actions ? `<div class="heading-actions">${actions}</div>` : ''}
  </div>`
}

function toast(message: string, tone: 'ok' | 'error' = 'ok') {
  const node = document.querySelector<HTMLDivElement>('#toast')!
  node.className = `show ${tone}`
  node.textContent = message
  window.setTimeout(() => node.className = '', 3200)
}

function loading() {
  return `<div class="loading"><span></span><span></span><span></span><p>Cargando información…</p></div>`
}

function empty(title: string, text: string) {
  return `<div class="empty"><span>✓</span><b>${title}</b><p>${text}</p></div>`
}

async function render() {
  const current = route()
  document.querySelectorAll('[data-nav]').forEach((node) => node.classList.toggle('active', (node as HTMLElement).dataset.nav === current))
  document.querySelector('#crumb-current')!.textContent = routes.find((item) => item.id === current)!.label
  const view = document.querySelector<HTMLDivElement>('#view')!
  view.innerHTML = loading()
  try {
    disposeReconcileKeys?.()
    disposeReconcileKeys = null
    if (current === 'resumen') await renderSummary(view)
    if (current === 'movimientos') await renderMovements(view)
    if (current === 'conciliar') disposeReconcileKeys = await renderReconcile(view) ?? null
    if (current === 'importar') renderImport(view)
    if (current === 'reportes') renderReports(view)
    if (current === 'auditoria') await renderAudit(view)
  } catch (error) {
    view.innerHTML = `<div class="error-panel"><b>No pudimos cargar esta pantalla</b><p>${esc(error instanceof Error ? error.message : error)}</p><button class="button secondary" id="retry">Reintentar</button></div>`
    document.querySelector('#retry')?.addEventListener('click', render)
  }
}

type StatusPayload = {
  db: string
  counts: Array<{ origin: string; status: string; count: number }>
  statement: {
    bankDebits: number
    bankDebitCount: number
    bankCredits: number
    bankCreditCount: number
    bookDebits: number
    bookDebitCount: number
    bookCredits: number
    bookCreditCount: number
    bankBalance: number
    bookBalance: number
  }
}

const balanceSheetRows = (statement: StatusPayload['statement']) => {
  const amountCell = (cents: number) => `<td class="number ${cents < 0 ? 'negative' : ''}">$ ${money(cents)}</td>`
  return `
    <tr class="total"><td>Saldo banco</td><td class="number"></td>${amountCell(statement.bankBalance)}</tr>
    <tr><td>(+) Débitos libros</td><td class="number">${statement.bookDebitCount}</td>${amountCell(statement.bookDebits)}</tr>
    <tr><td>(−) Créditos bancos</td><td class="number">${statement.bankCreditCount}</td>${amountCell(statement.bankCredits)}</tr>
    <tr><td>(+) Débitos bancos</td><td class="number">${statement.bankDebitCount}</td>${amountCell(statement.bankDebits)}</tr>
    <tr><td>(−) Créditos libros</td><td class="number">${statement.bookCreditCount}</td>${amountCell(statement.bookCredits)}</tr>
    <tr class="total"><td>Saldo libros</td><td class="number"></td>${amountCell(statement.bookBalance)}</tr>`
}

async function renderSummary(root: HTMLElement) {
  const loadStatus = (dealer = '') => api<StatusPayload>(dealer ? `/api/status?dealer=${encodeURIComponent(dealer)}` : '/api/status')
  const [status, rows] = await Promise.all([loadStatus(), getMovements()])
  const pending = rows.filter((row) => row.status === 'PENDIENTE').length
  const reconciled = rows.filter((row) => row.status === 'CONCILIADO').length
  const reconciliations = new Set(rows.filter((row) => row.reconciliationId).map((row) => row.reconciliationId)).size
  const latest = [...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
  root.innerHTML = `
    ${heading('Panel general', 'Resumen de Cuenta H', 'Saldos de banco y de libros por separado. No se suman entre sí.', '<a class="button primary" href="#/conciliar">Abrir conciliación <span>→</span></a>')}
    <section class="metrics summary-metrics">
      <article><div class="metric-icon blue">≡</div><span>Partidas pendientes</span><strong>${pending}</strong><small>Requieren revisión</small></article>
      <article><div class="metric-icon green">✓</div><span>Conciliaciones</span><strong>${reconciliations}</strong><small>${reconciled} partidas procesadas</small></article>
    </section>
    <section class="panel balance-sheet">
      <div class="panel-head balance-sheet-head">
        <div>
          <h2>Saldos de la cuenta</h2>
          <p id="balance-sheet-caption">Solo partidas pendientes. Excluye conciliadas y eliminadas.</p>
        </div>
        <label class="balance-dealer-filter">Terminal<select id="summary-dealer">${dealerOptions}</select></label>
      </div>
      <table>
        <thead><tr><th>Concepto</th><th class="number">Partidas</th><th class="number">Importe</th></tr></thead>
        <tbody id="balance-sheet-body">${balanceSheetRows(status.statement)}</tbody>
      </table>
    </section>
    <section class="panel">
      <div class="panel-head"><div><h2>Actividad reciente</h2><p>Últimas partidas incorporadas al sistema</p></div><a href="#/movimientos">Ver todas →</a></div>
      <div class="activity-list">${latest.map((row) => `
        <div class="activity-row">
          <span class="origin ${row.origin.toLowerCase()}">${row.origin === 'BANCO' ? 'B' : 'L'}</span>
          <div><b>${esc(row.notes || 'Sin descripción')}</b><small>${shortDate(row.date)} · ${esc(row.receipt)} ${esc(row.orderNo)}</small></div>
          <span class="badge ${row.status.toLowerCase()}">${row.status}</span>
          <strong>${money(row.debitCents || row.creditCents)}</strong>
        </div>`).join('')}</div>
    </section>`
  document.querySelector('#db-badge')!.textContent = status.db
  const caption = root.querySelector<HTMLElement>('#balance-sheet-caption')
  const body = root.querySelector<HTMLElement>('#balance-sheet-body')
  const dealerSelect = root.querySelector<HTMLSelectElement>('#summary-dealer')
  const updateCaption = (dealer: string) => {
    if (!caption) return
    if (!dealer) {
      caption.textContent = 'Solo partidas pendientes. Excluye conciliadas y eliminadas.'
      return
    }
    const label = TERMINALS.find((terminal) => terminal.code === dealer)?.label ?? dealer
    caption.textContent = `Saldos pendientes · ${dealer} · ${label}`
  }
  dealerSelect?.addEventListener('change', async () => {
    const dealer = dealerSelect.value
    const next = await loadStatus(dealer)
    if (body) body.innerHTML = balanceSheetRows(next.statement)
    updateCaption(dealer)
  })
}

function statusBadge(status: Movement['status']) {
  return `<span class="badge ${status.toLowerCase()}">${status}</span>`
}

function assigneeOptions(selected: string) {
  const known = (ASSIGNEE_OPTIONS as readonly string[]).includes(selected)
  const custom = selected && !known
    ? `<option value="${esc(selected)}" selected>${esc(selected)}</option>`
    : ''
  return `<option value="">Sin asignar</option>${ASSIGNEE_OPTIONS.map((option) =>
    `<option value="${esc(option)}"${selected === option ? ' selected' : ''}>${esc(option)}</option>`,
  ).join('')}${custom}<option value="__other__">Otro…</option>`
}

function assigneeCell(row: Movement) {
  if (row.status === 'PENDIENTE') {
    return `<td class="assignee-cell"><select class="assignee-select" data-assignee="${row.id}">${assigneeOptions(row.assignee)}</select></td>`
  }
  return `<td class="assignee-cell">${esc(row.assignee || '—')}</td>`
}

function bindAssigneeCells(
  root: HTMLElement,
  onSave: (id: number, assignee: string) => Promise<void>,
  onRefresh: () => void,
) {
  root.querySelectorAll<HTMLSelectElement>('.assignee-select').forEach((select) => {
    select.addEventListener('click', (event) => event.stopPropagation())
    select.addEventListener('mousedown', (event) => event.stopPropagation())
    select.addEventListener('change', async () => {
      const id = Number(select.dataset.assignee)
      if (select.value === '__other__') {
        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'assignee-other'
        input.placeholder = 'Responsable'
        input.maxLength = 80
        input.addEventListener('click', (event) => event.stopPropagation())
        input.addEventListener('mousedown', (event) => event.stopPropagation())
        select.replaceWith(input)
        input.focus()
        const commit = async () => {
          try {
            await onSave(id, input.value.trim())
            onRefresh()
          } catch (error) {
            toast(error instanceof Error ? error.message : 'No se pudo guardar el responsable', 'error')
          }
        }
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        })
        input.addEventListener('blur', commit)
        return
      }
      try {
        await onSave(id, select.value)
      } catch (error) {
        toast(error instanceof Error ? error.message : 'No se pudo guardar el responsable', 'error')
        onRefresh()
      }
    })
  })
}

async function renderMovements(root: HTMLElement) {
  const rows = await getMovements()
  root.innerHTML = `
    ${heading('Consulta de partidas', 'Búsqueda de movimientos', 'Combine filtros y abra una línea conciliada con doble clic para ver su conciliación.')}
    <section class="panel advanced-filters">
      <div class="filter-grid">
        <label>Banco<select id="f-dealer">${dealerOptions}</select></label>
        <label>Sector<input id="f-sector" placeholder="Todos"></label>
        <label>Número de orden<input id="f-orden" inputmode="numeric"></label>
        <label>Comprobante<input id="f-comprobante"></label>
        <label>Importe desde<input id="f-importe-desde" inputmode="decimal" placeholder="0,00"></label>
        <label>Importe hasta<input id="f-importe-hasta" inputmode="decimal" placeholder="Sin límite"></label>
        <label>Fecha mov. desde<input id="f-desde" type="date"></label>
        <label>Fecha mov. hasta<input id="f-hasta" type="date"></label>
        <label>Fecha proc. desde<input id="f-proceso-desde" type="date"></label>
        <label>Fecha proc. hasta<input id="f-proceso-hasta" type="date"></label>
        <label>Ref. 1<input id="f-ref1"></label>
        <label>Ref. 2<input id="f-ref2"></label>
      </div>
      <div class="filter-options">
        <fieldset><legend>Origen</legend><label><input type="radio" name="f-origen" value="BANCO"> Banco</label><label><input type="radio" name="f-origen" value="LIBRO"> Contabilidad</label><label><input type="radio" name="f-origen" value="TODOS" checked> Ambos</label></fieldset>
        <fieldset><legend>Signo</legend><label><input type="radio" name="f-signo" value="DEBITO"> Débitos</label><label><input type="radio" name="f-signo" value="CREDITO"> Créditos</label><label><input type="radio" name="f-signo" value="" checked> Ambos</label></fieldset>
        <fieldset><legend>Estado</legend><label><input type="checkbox" name="f-estado" value="PENDIENTE" checked> Pendientes</label><label><input type="checkbox" name="f-estado" value="CONCILIADO" checked> Conciliados</label><label><input type="checkbox" name="f-estado" value="ELIMINADO" checked> Eliminados</label></fieldset>
      </div>
      <div class="filter-actions"><button class="button secondary" id="f-limpiar">Limpiar</button><button class="button primary" id="f-aplicar">Buscar partidas</button></div>
    </section>
    <section class="panel table-panel">
      <div class="panel-head"><div><h2>Partidas encontradas</h2><p><span id="row-count">${rows.length}</span> resultados · Doble clic para consultar una conciliación</p></div>
        <div class="bulk-actions"><label><input id="select-visible" type="checkbox"> Seleccionar</label><button class="button secondary" id="delete-selected" disabled>Eliminar</button><button class="button secondary" id="restore-selected" disabled>Restaurar</button><button class="button secondary" id="purge-selected" disabled>Borrar definitivo</button></div>
      </div>
      <div class="table-scroll"><table class="standard-table"><thead><tr><th></th>${movementSortColumns()}</tr></thead><tbody id="movement-body"></tbody></table></div>
    </section><div id="modal-root"></div>`
  let sourceItems: Movement[] = rows
  let visibleItems: Movement[] = rows
  let movementSort: ColumnSort | null = null
  const saveAssignee = async (id: number, assignee: string) => {
    const updated = await api<Movement>(`/api/movimientos/${id}/assignee`, {
      method: 'PATCH',
      body: JSON.stringify({ assignee }),
    })
    const item = visibleItems.find((row) => row.id === id)
    if (item) item.assignee = updated.assignee
  }
  const draw = (items: Movement[]) => {
    sourceItems = items
    visibleItems = sortMovements(items, movementSort)
    document.querySelector('#row-count')!.textContent = String(items.length)
    paintSortButtons(root, 'movements', movementSort)
    const manageable = (row: Movement) => !row.isAdjustment && (row.status === 'PENDIENTE' || row.status === 'ELIMINADO')
    document.querySelector('#movement-body')!.innerHTML = visibleItems.map((row) => `<tr data-id="${row.id}" data-date="${row.date}" ${row.reconciliationId ? `data-reconciliation="${row.reconciliationId}" tabindex="0" title="Doble clic para ver conciliación ${row.reconciliationId}"` : ''}>
      <td>${manageable(row) ? `<input class="row-check" type="checkbox" data-id="${row.id}" data-status="${row.status}" aria-label="Seleccionar movimiento ${row.id}">` : ''}</td>
      <td class="muted">#${row.id}</td><td><span class="origin-label ${row.origin.toLowerCase()}">${row.origin}</span></td>
      <td>${esc(movementLabel(row.origin, row.dealer, row.sector))}</td>
      <td>${statusBadge(row.status)}${row.isAdjustment && row.status === 'PENDIENTE' ? ` <span class="badge pending">Ajuste${row.reconciliationId ? ` #${row.reconciliationId}` : ''}</span>` : ''}</td><td>${shortDate(row.date)}</td><td>${shortDate(row.processDate)}</td><td>${esc(row.receipt)} ${esc(row.orderNo)}</td>
      <td class="mono">${esc(referenceOne(row) || '—')}</td><td class="detail-cell">${esc(row.notes)}</td>
      <td class="number">${row.debitCents ? money(row.debitCents) : '—'}</td><td class="number">${row.creditCents ? money(row.creditCents) : '—'}</td>
      ${assigneeCell(row)}
      <td>${row.status === 'CONCILIADO' ? `<button class="text-button" data-open="${row.reconciliationId}">Ver #${row.reconciliationId}</button>` : `<a class="text-button" href="#/conciliar">Conciliar</a>`}</td>
    </tr>`).join('')
    bindAssigneeCells(root, saveAssignee, () => draw(sourceItems))
    document.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => openReconciliationDetail(Number((button as HTMLElement).dataset.open), root)))
    document.querySelectorAll('[data-reconciliation]').forEach((row) => {
      const open = () => openReconciliationDetail(Number((row as HTMLElement).dataset.reconciliation), root)
      row.addEventListener('dblclick', open)
      row.addEventListener('keydown', (event) => {
        if ((event as KeyboardEvent).key === 'Enter') open()
      })
    })
    const selected = () => [...document.querySelectorAll<HTMLInputElement>('.row-check:checked')]
    const refreshBulk = () => {
      const checks = selected()
      document.querySelector<HTMLButtonElement>('#delete-selected')!.disabled = !checks.some((check) => check.dataset.status === 'PENDIENTE')
      document.querySelector<HTMLButtonElement>('#restore-selected')!.disabled = !checks.some((check) => check.dataset.status === 'ELIMINADO')
      document.querySelector<HTMLButtonElement>('#purge-selected')!.disabled = !checks.some((check) => check.dataset.status === 'ELIMINADO')
    }
    const selectVisible = document.querySelector<HTMLInputElement>('#select-visible')!
    selectVisible.onchange = () => {
      document.querySelectorAll<HTMLInputElement>('.row-check').forEach((check) => { check.checked = selectVisible.checked })
      refreshBulk()
    }
    document.querySelectorAll('.row-check').forEach((check) => check.addEventListener('change', refreshBulk))
    document.querySelector<HTMLButtonElement>('#delete-selected')!.onclick = () => {
      openDeleteModal(selected().filter((check) => check.dataset.status === 'PENDIENTE').map((check) => Number(check.dataset.id)))
    }
    document.querySelector<HTMLButtonElement>('#restore-selected')!.onclick = async () => {
      const ids = selected().filter((check) => check.dataset.status === 'ELIMINADO').map((check) => Number(check.dataset.id))
      await api('/api/movimientos/restaurar', { method: 'POST', body: JSON.stringify({ ids }) })
      await renderMovements(root)
      toast(`${ids.length} movimiento(s) restaurados a pendientes`)
    }
    document.querySelector<HTMLButtonElement>('#purge-selected')!.onclick = () => {
      openPurgeModal(selected().filter((check) => check.dataset.status === 'ELIMINADO').map((check) => Number(check.dataset.id)))
    }
  }
  const openPurgeModal = (ids: number[]) => {
    const modal = document.createElement('div')
    modal.className = 'modal-backdrop'
    modal.innerHTML = `<section class="modal"><div class="modal-head"><div><span class="eyebrow">Borrado definitivo</span><h2>Borrar ${ids.length} movimiento(s)</h2><p>Desaparecen de la base. Si el archivo se vuelve a importar, pueden cargarse otra vez.</p></div><button class="modal-close">×</button></div>
      <div class="modal-actions"><button class="button secondary modal-close">Cancelar</button><button class="button danger-button" id="confirm-purge">Borrar definitivo</button></div></section>`
    document.body.append(modal)
    const close = () => modal.remove()
    modal.querySelectorAll('.modal-close').forEach((button) => button.addEventListener('click', close))
    modal.querySelector('#confirm-purge')!.addEventListener('click', async () => {
      try {
        const result = await api<{ deleted: number; rejected: number }>('/api/movimientos/borrar', { method: 'POST', body: JSON.stringify({ ids }) })
        close()
        await renderMovements(root)
        const pending = result.rejected ? ` ${result.rejected} siguen en una conciliación activa.` : ''
        toast(`${result.deleted} movimiento(s) borrados definitivamente.${pending}`)
      } catch (error) {
        toast(error instanceof Error ? error.message : 'No se pudo borrar', 'error')
      }
    })
  }
  const openDeleteModal = (ids: number[]) => {
    const modal = document.createElement('div')
    modal.className = 'modal-backdrop'
    modal.innerHTML = `<section class="modal"><div class="modal-head"><div><span class="eyebrow">Eliminación lógica</span><h2>Eliminar ${ids.length} movimiento(s)</h2><p>Quedarán ocultos de la conciliación y podrán restaurarse.</p></div><button class="modal-close">×</button></div>
      <label class="reason-field">Motivo obligatorio<textarea id="delete-reason" rows="3"></textarea></label>
      <div class="modal-actions"><button class="button secondary modal-close">Cancelar</button><button class="button danger-button" id="confirm-delete">Eliminar</button></div></section>`
    document.body.append(modal)
    const close = () => modal.remove()
    modal.querySelectorAll('.modal-close').forEach((button) => button.addEventListener('click', close))
    modal.querySelector('#confirm-delete')!.addEventListener('click', async () => {
      const motivo = (modal.querySelector('#delete-reason') as HTMLTextAreaElement).value.trim()
      if (!motivo) {
        toast('Indique el motivo de la eliminación', 'error')
        return
      }
      await api('/api/movimientos/eliminar', { method: 'POST', body: JSON.stringify({ ids, motivo }) })
      close()
      await renderMovements(root)
      toast(`${ids.length} movimiento(s) eliminados`)
    })
  }
  bindSortButtons(root, (button) => {
    movementSort = nextSort(movementSort, button.dataset.sort as SortKey, button.dataset.column ?? button.dataset.sort ?? '')
    draw(sourceItems)
  })
  draw(rows)
  document.querySelector('#f-aplicar')?.addEventListener('click', async () => {
    try {
      const params = new URLSearchParams()
      const inputValue = (id: string) => (document.querySelector(id) as HTMLInputElement | HTMLSelectElement).value
      const radioValue = (name: string) => (document.querySelector(`input[name="${name}"]:checked`) as HTMLInputElement).value
      const values = [
        ['dealer', inputValue('#f-dealer')], ['sector', inputValue('#f-sector')],
        ['orden', inputValue('#f-orden')], ['comprobante', inputValue('#f-comprobante')],
        ['importeDesde', inputValue('#f-importe-desde')], ['importeHasta', inputValue('#f-importe-hasta')],
        ['desde', inputValue('#f-desde')], ['hasta', inputValue('#f-hasta')],
        ['procesoDesde', inputValue('#f-proceso-desde')], ['procesoHasta', inputValue('#f-proceso-hasta')],
        ['ref1', inputValue('#f-ref1')], ['ref2', inputValue('#f-ref2')],
        ['origen', radioValue('f-origen')], ['signo', radioValue('f-signo')],
        ['estado', [...document.querySelectorAll<HTMLInputElement>('input[name="f-estado"]:checked')].map((input) => input.value).join(',') || 'NINGUNO'],
      ]
      values.forEach(([key, value]) => value && params.set(key, value))
      draw(await getMovements(`?${params}`))
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No se pudo buscar', 'error')
    }
  })
  document.querySelector('#f-limpiar')?.addEventListener('click', () => renderMovements(root))
}

async function openReconciliationDetail(id: number, root: HTMLElement) {
  const reconciliation = await api<Reconciliation>(`/api/reconciliaciones/${id}`)
  const modalRoot = document.querySelector<HTMLDivElement>('#modal-root')!
  const rows = reconciliation.movements
  const debits = rows.reduce((sum, row) => sum + row.debitCents, 0)
  const credits = rows.reduce((sum, row) => sum + row.creditCents, 0)
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal wide reconciliation-detail">
    <div class="modal-head"><div><span class="eyebrow">Detalle de conciliación</span><h2>Conciliación N.º ${reconciliation.id}</h2><p>${reconciliation.mode === 'AUTOMATICA' ? 'Automática' : 'Manual'} · ${new Date(`${reconciliation.createdAt}Z`).toLocaleString('es-AR')}</p></div><button class="modal-close" aria-label="Cerrar">×</button></div>
    <div class="detail-summary"><span>${statusBadge(reconciliation.status === 'ACTIVA' ? 'CONCILIADO' : 'ELIMINADO')}</span><div><small>Partidas</small><b>${rows.length}</b></div><div><small>Total débitos</small><b>${money(debits)}</b></div><div><small>Total créditos</small><b>${money(credits)}</b></div><div><small>Diferencia original</small><b>${money(Math.abs(reconciliation.adjustmentCents))}</b></div></div>
    <div class="ledger-wrap detail-ledger"><table class="ledger"><thead><tr>${ledgerColumns}</tr></thead><tbody>${rows.map((row) => ledgerRow(row, '', row.isAdjustment ? 'adjustment-row' : '')).join('')}</tbody></table></div>
    ${reconciliation.status === 'REVERTIDA' ? `<div class="reversal-note"><b>Conciliación revertida</b><span>${esc(reconciliation.reversalReason)}</span></div>` : ''}
    <div class="modal-actions"><button class="button secondary modal-close">Cerrar</button>${reconciliation.status === 'ACTIVA' ? '<button class="button danger-button" id="prepare-reversal">Preparar reversión</button>' : ''}</div>
  </section></div>`
  const close = () => modalRoot.innerHTML = ''
  modalRoot.querySelectorAll('.modal-close').forEach((button) => button.addEventListener('click', close))
  modalRoot.querySelector('.modal-backdrop')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) close()
  })
  modalRoot.querySelector('#prepare-reversal')?.addEventListener('click', () => renderReversal(reconciliation, root, modalRoot))
}

function renderReversal(reconciliation: Reconciliation, root: HTMLElement, modalRoot: HTMLElement) {
  const originalRows = reconciliation.movements.filter((row) => !row.isAdjustment)
  const staged = new Set<number>()
  const selectedActive = new Set<number>()
  const selectedStaged = new Set<number>()
  let activeSort: ColumnSort | null = null
  let stagedSort: ColumnSort | null = null
  const draw = () => {
    const activeRows = sortMovements(originalRows.filter((row) => !staged.has(row.id)), activeSort)
    const stagedRows = sortMovements(originalRows.filter((row) => staged.has(row.id)), stagedSort)
    const reversalColumns = (grid: 'reversal-active' | 'reversal-staged') => sortableColumns(grid)
    modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal wide reversal-workspace">
      <div class="modal-head"><div><span class="eyebrow">Reversión de conciliaciones</span><h2>Conciliación N.º ${reconciliation.id}</h2><p>Revierta una selección si el grupo restante queda balanceado, o revierta todo el grupo.</p></div><button class="modal-close" aria-label="Cerrar">×</button></div>
      <div class="reversal-quadrant"><div class="quadrant-head"><div><span class="step">1</span><div><h2>Conciliación activa</h2><p>Seleccione líneas y bájelas con Enter o el botón.</p></div></div></div>
        <div class="ledger-wrap reversal-ledger"><table class="ledger"><thead><tr>${reversalColumns('reversal-active')}</tr></thead><tbody>${activeRows.length ? activeRows.map((row) => ledgerRow(row, `data-reverse-active="${row.id}" tabindex="0"`, selectedActive.has(row.id) ? 'selected' : '')).join('') : `<tr><td colspan="13">${empty('Todas las líneas seleccionadas', 'Revise el cuadrante inferior antes de guardar.')}</td></tr>`}</tbody></table></div>
        <div class="selection-bar"><span>${selectedActive.size} ${selectedActive.size === 1 ? 'línea seleccionada' : 'líneas seleccionadas'}</span><button class="button dark" id="stage-reversal" ${selectedActive.size ? '' : 'disabled'}>Bajar selección ↓</button></div>
      </div>
      <div class="flow-divider"><span>↓</span><small>Partidas preparadas para reversión</small><span>↓</span></div>
      <div class="reversal-quadrant prepared"><div class="quadrant-head"><div><span class="step green">2</span><div><h2>Partidas a devolver a pendientes</h2><p>La línea de ajuste permanece en el historial.</p></div></div></div>
        <div class="ledger-wrap reversal-ledger"><table class="ledger"><thead><tr>${reversalColumns('reversal-staged')}</tr></thead><tbody>${stagedRows.length ? stagedRows.map((row) => ledgerRow(row, `data-reverse-staged="${row.id}" tabindex="0"`, selectedStaged.has(row.id) ? 'selected' : '')).join('') : `<tr><td colspan="13">${empty('Sin partidas preparadas', 'Seleccione una o más líneas arriba.')}</td></tr>`}</tbody></table></div>
        <div class="selection-bar"><span>${selectedStaged.size} ${selectedStaged.size === 1 ? 'línea seleccionada' : 'líneas seleccionadas'}</span><button class="button secondary" id="unstage-reversal" ${selectedStaged.size ? '' : 'disabled'}>Subir selección ↑</button></div>
      </div>
      <div class="ledger-totals"><div><span>Quedan en el grupo</span><strong id="reversal-remaining-difference"></strong></div><div class="difference"><span>Estado</span><strong id="reversal-balance-status"></strong></div></div>
      <label class="reason-field">Motivo de la reversión<textarea id="reversal-reason" rows="2" placeholder="Explique por qué se revierte esta conciliación"></textarea></label>
      <div class="modal-actions"><button class="button secondary modal-close">Cancelar</button><button class="button secondary" id="save-full-reversal">Revertir conciliación completa</button><button class="button danger-button" id="save-partial-reversal" ${stagedRows.length ? '' : 'disabled'}>Revertir selección</button></div>
    </section></div>`
    const remaining = reconciliation.movements.filter((row) => !row.isAdjustment && !staged.has(row.id))
    const remainingDifference = Math.abs(remaining.reduce((sum, row) => sum + row.debitCents - row.creditCents, 0) + reconciliation.movements.filter((row) => row.isAdjustment).reduce((sum, row) => sum + row.debitCents - row.creditCents, 0))
    modalRoot.querySelector('#reversal-remaining-difference')!.textContent = money(remainingDifference)
    modalRoot.querySelector('#reversal-balance-status')!.textContent = remainingDifference === 0 ? 'Balanceado' : 'Desbalanceado'
    paintSortButtons(modalRoot, 'reversal-active', activeSort)
    paintSortButtons(modalRoot, 'reversal-staged', stagedSort)
    modalRoot.querySelectorAll('.modal-close').forEach((button) => button.addEventListener('click', () => modalRoot.innerHTML = ''))
    const toggleSelection = (id: number, selected: Set<number>) => {
      if (selected.has(id)) selected.delete(id)
      else selected.add(id)
      draw()
    }
    const moveSelection = (from: Set<number>, moveToStaged: boolean, clearSelection: Set<number>) => {
      from.forEach((id) => moveToStaged ? staged.add(id) : staged.delete(id))
      from.clear()
      clearSelection.clear()
      draw()
    }
    modalRoot.querySelectorAll<HTMLElement>('[data-reverse-active]').forEach((row) => {
      const id = Number(row.dataset.reverseActive)
      row.addEventListener('click', () => toggleSelection(id, selectedActive))
      row.addEventListener('keydown', (event) => { if ((event as KeyboardEvent).key === 'Enter') moveSelection(new Set([id]), true, selectedActive) })
    })
    modalRoot.querySelectorAll<HTMLElement>('[data-reverse-staged]').forEach((row) => {
      const id = Number(row.dataset.reverseStaged)
      row.addEventListener('click', () => toggleSelection(id, selectedStaged))
      row.addEventListener('keydown', (event) => { if ((event as KeyboardEvent).key === 'Enter') moveSelection(selectedStaged, false, selectedActive) })
    })
    modalRoot.querySelector('#stage-reversal')?.addEventListener('click', () => moveSelection(selectedActive, true, selectedStaged))
    modalRoot.querySelector('#unstage-reversal')?.addEventListener('click', () => moveSelection(selectedStaged, false, selectedActive))
    const reason = () => (modalRoot.querySelector('#reversal-reason') as HTMLTextAreaElement).value.trim()
    modalRoot.querySelector('#save-full-reversal')?.addEventListener('click', async () => {
      if (!reason()) return toast('Indique el motivo de la reversión', 'error')
      await api(`/api/reconciliaciones/${reconciliation.id}/revertir`, { method: 'POST', body: JSON.stringify({ motivo: reason() }) })
      modalRoot.innerHTML = ''
      toast(`Conciliación ${reconciliation.id} revertida completamente`)
      await renderMovements(root)
    })
    modalRoot.querySelector('#save-partial-reversal')?.addEventListener('click', async () => {
      if (remainingDifference !== 0) return toast('La reversión parcial dejaría el grupo desbalanceado', 'error')
      if (!reason()) return toast('Indique el motivo de la reversión', 'error')
      await api(`/api/reconciliaciones/${reconciliation.id}/revertir-parcial`, { method: 'POST', body: JSON.stringify({ movementIds: [...staged], motivo: reason() }) })
      modalRoot.innerHTML = ''
      toast(`${staged.size} partida(s) volvieron a pendientes`)
      await renderMovements(root)
    })
    bindSortButtons(modalRoot, (button) => {
      const sort = button.dataset.grid === 'reversal-active' ? activeSort : stagedSort
      const next = nextSort(sort, button.dataset.sort as SortKey, button.dataset.column ?? '')
      if (button.dataset.grid === 'reversal-active') activeSort = next
      else stagedSort = next
      draw()
    })
  }
  draw()
}

const sortHeading = (grid: string, label: string, key: SortKey, column: string = key, numeric = false) =>
  `<th class="${numeric ? 'number' : ''}"><button type="button" class="sort-button" data-sort="${key}" data-column="${column}" data-grid="${grid}" data-label="${label}" aria-sort="none" title="Doble clic para ordenar">${label}</button></th>`

const bindSortButtons = (root: ParentNode, handler: (button: HTMLButtonElement) => void) => {
  root.querySelectorAll<HTMLButtonElement>('.sort-button').forEach((button) => {
    button.addEventListener('dblclick', (event) => {
      event.preventDefault()
      handler(button)
    })
  })
}

const paintSortButtons = (root: ParentNode, grid: string, sort: ColumnSort | null) => {
  root.querySelectorAll<HTMLButtonElement>(`.sort-button[data-grid="${grid}"]`).forEach((button) => {
    const active = Boolean(sort && sort.column === button.dataset.column)
    button.classList.toggle('active', active)
    const label = button.dataset.label ?? ''
    button.textContent = active ? `${label} ${sort!.direction === 'asc' ? '↑' : '↓'}` : label
    button.setAttribute('aria-sort', active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : 'none')
  })
}

const movementSortColumns = () => `
  ${sortHeading('movements', 'ID', 'id')}
  ${sortHeading('movements', 'Origen', 'origin')}
  ${sortHeading('movements', 'Terminal', 'terminal')}
  ${sortHeading('movements', 'Estado', 'status')}
  ${sortHeading('movements', 'Fecha', 'date')}
  ${sortHeading('movements', 'Fecha proc.', 'processDate')}
  ${sortHeading('movements', 'Comprobante', 'receipt')}
  ${sortHeading('movements', 'Referencia', 'reference')}
  ${sortHeading('movements', 'Detalle', 'notes')}
  ${sortHeading('movements', 'Débito', 'debit', 'debit', true)}
  ${sortHeading('movements', 'Crédito', 'credit', 'credit', true)}
  ${sortHeading('movements', 'Responsable', 'assignee')}
  <th>Acción</th>`

const ledgerColumns = `
  <th>Fecha</th><th>Fecha proc.</th><th>Terminal</th><th>Comprobante</th><th>Sector</th><th>Orden</th>
  <th>Referencia 1</th><th>Referencia 2</th><th class="number">Débitos libros</th>
  <th class="number">Créditos bancos</th><th class="number">Débitos bancos</th>
  <th class="number">Créditos libros</th><th>Observaciones</th>`

function sortableColumns(grid: 'pending' | 'staged' | 'reversal-active' | 'reversal-staged') {
  return `
    ${sortHeading(grid, 'Fecha', 'date')}
    ${sortHeading(grid, 'Fecha proc.', 'processDate')}
    ${sortHeading(grid, 'Terminal', 'terminal')}
    ${sortHeading(grid, 'Comprobante', 'receipt')}
    ${sortHeading(grid, 'Sector', 'sector')}
    ${sortHeading(grid, 'Orden', 'orderNo')}
    ${sortHeading(grid, 'Referencia 1', 'reference')}
    ${sortHeading(grid, 'Referencia 2', 'reference2')}
    ${sortHeading(grid, 'Débitos libros', 'amount', 'book-debit', true)}
    ${sortHeading(grid, 'Créditos bancos', 'amount', 'bank-credit', true)}
    ${sortHeading(grid, 'Débitos bancos', 'amount', 'bank-debit', true)}
    ${sortHeading(grid, 'Créditos libros', 'amount', 'book-credit', true)}
    ${sortHeading(grid, 'Observaciones', 'notes')}`
}

function ledgerRow(row: Movement, attributes = '', extraClass = '') {
  return `<tr ${attributes} class="${extraClass}">
    <td>${shortDate(row.date)}</td><td>${shortDate(row.processDate)}</td><td>${esc(movementLabel(row.origin, row.dealer, row.sector))}</td><td>${esc(row.receipt)}</td>
    <td>${esc(row.sector || '—')}</td><td>${esc(row.orderNo)}</td><td class="mono">${esc(referenceOne(row))}</td><td class="mono">${esc(row.ref2)}</td>
    <td class="number amount">${row.origin === 'LIBRO' && row.debitCents ? money(row.debitCents) : ''}</td>
    <td class="number amount">${row.origin === 'BANCO' && row.creditCents ? money(row.creditCents) : ''}</td>
    <td class="number amount">${row.origin === 'BANCO' && row.debitCents ? money(row.debitCents) : ''}</td>
    <td class="number amount">${row.origin === 'LIBRO' && row.creditCents ? money(row.creditCents) : ''}</td>
    <td class="notes"><span class="origin-dot ${row.origin.toLowerCase()}"></span>${esc(row.notes)}</td>
  </tr>`
}

async function renderReconcile(root: HTMLElement) {
  let rows = await getMovements('?estado=PENDIENTE')
  const staged = new Set<number>()
  let pendingSort: ColumnSort | null = null
  let stagedSort: ColumnSort | null = null
  let stagedAutomatically = false
  const selectedPending = new Set<number>()
  const stagedSelection = new Set<number>()

  root.innerHTML = `
    ${heading('Mesa de trabajo', 'Conciliar partidas', 'Seleccione varias líneas y use Enter o los botones para moverlas entre cuadrantes.', `
      <button class="button secondary" id="auto-preview">Búsqueda automática</button>
      <button class="button primary" id="confirm-all" disabled>Confirmar conciliación <span>→</span></button>`)}
    <section class="reconcile-filters">
      <label>Banco<select id="r-dealer">${dealerOptions}</select></label>
      <label>Sector<select id="r-sector"><option value="">Todos los sectores</option></select></label>
      <label>Fecha desde<input id="r-from" type="date"></label>
      <label>Fecha hasta<input id="r-to" type="date"></label>
      <label>Concepto<input id="r-concepto" type="search" placeholder="comp pp" autocomplete="off"></label>
      <button class="button secondary" id="r-aplicar">Buscar partidas</button>
      <button class="icon-button" id="refresh" aria-label="Actualizar">↻</button>
    </section>
    <div class="reconcile-workspace">
    <section class="quadrant">
      <div class="quadrant-head">
        <div><span class="step">1</span><div><h2>Partidas pendientes</h2><p>Doble clic para mover una línea al cuadrante inferior</p></div></div>
        <div class="legend"><span><i class="bank"></i>Banco</span><span><i class="book"></i>Libros</span><b id="pending-count"></b></div>
      </div>
      <div class="ledger-wrap top-ledger"><table class="ledger" data-resize="pending"><thead><tr>${sortableColumns('pending')}</tr></thead><tbody id="pending-grid"></tbody></table></div>
      <div class="selection-bar" id="selection-bar">
        <div><span class="selection-status">0 partidas seleccionadas</span><small>Seleccione filas y presione Enter para moverlas entre cuadrantes</small></div>
        <button class="button dark" id="stage-pair" disabled>Bajar selección ↓</button>
      </div>
    </section>
    <div class="quadrant-splitter" role="separator" aria-label="Ajustar altura de cuadrantes"><span>↕</span><small>Arrastre para cambiar el alto · Partidas preparadas para conciliación</small></div>
    <section class="quadrant prepared">
      <div class="quadrant-head">
        <div><span class="step green">2</span><div><h2>Conciliación preparada</h2><p>Seleccione líneas y use Enter o el botón para devolverlas arriba</p></div></div>
        <span class="badge pending" id="staged-count">0 partidas</span>
      </div>
      <div class="ledger-wrap bottom-ledger"><table class="ledger" data-resize="staged"><thead><tr>${sortableColumns('staged')}<th class="action-col"></th></tr></thead><tbody id="staged-grid"></tbody></table></div>
      <div class="ledger-totals">
        <div><span>Total débitos</span><strong id="total-debits">0,00</strong></div>
        <div><span>Total créditos</span><strong id="total-credits">0,00</strong></div>
        <div class="difference"><span>Diferencia</span><strong id="total-difference">0,00</strong></div>
      </div>
      <div class="selection-bar"><span id="staged-selection-status">0 partidas seleccionadas</span><button class="button secondary" id="unstage-selection" disabled>Subir selección ↑</button></div>
    </section>
    </div>`

  const stageSelected = () => {
    selectedPending.forEach((id) => staged.add(id))
    selectedPending.clear()
    stagedAutomatically = false
    draw()
  }

  const unstageSelected = () => {
    stagedSelection.forEach((id) => staged.delete(id))
    stagedSelection.clear()
    draw()
  }

  const setupResize = () => {
    const pendingTable = root.querySelector<HTMLTableElement>('.top-ledger .ledger')
    const stagedTable = root.querySelector<HTMLTableElement>('.bottom-ledger .ledger')
    if (pendingTable) setupColumnResize(pendingTable, 'cuenta-h:col-widths:conciliar-pending')
    if (stagedTable) setupColumnResize(stagedTable, 'cuenta-h:col-widths:conciliar-staged')
  }

  const draw = () => {
    const concept = (document.querySelector<HTMLInputElement>('#r-concepto')?.value ?? '')
    const available = sortMovements(
      rows.filter((row) => !staged.has(row.id) && matchesConcept(row.notes, concept)),
      pendingSort,
    )
    const grid = document.querySelector('#pending-grid')!
    grid.innerHTML = available.length
      ? available.map((row) => ledgerRow(row, `data-sel="${row.id}" data-date="${row.date}" data-bank-debit="${columnAmountCents(row, 'bank-debit')}" data-notes="${esc(row.notes)}" tabindex="0"`, [
          selectedPending.has(row.id) ? 'selected' : '',
        ].join(' '))).join('')
      : `<tr><td colspan="13">${empty('Sin partidas pendientes', 'Importe nuevos movimientos o confirme las partidas preparadas.')}</td></tr>`
    document.querySelector('#pending-count')!.textContent = `${available.length} partidas`
    paintSortButtons(root, 'pending', pendingSort)
    document.querySelectorAll('[data-sel]').forEach((node) => {
      const select = () => {
        const id = Number((node as HTMLElement).dataset.sel)
        if (selectedPending.has(id)) selectedPending.delete(id)
        else selectedPending.add(id)
        draw()
      }
      node.addEventListener('click', select)
      node.addEventListener('dblclick', (event) => {
        event.preventDefault()
        staged.add(Number((node as HTMLElement).dataset.sel))
        selectedPending.delete(Number((node as HTMLElement).dataset.sel))
        stagedAutomatically = false
        draw()
      })
      node.addEventListener('keydown', (event) => {
        if ((event as KeyboardEvent).key === ' ') {
          event.preventDefault()
          select()
        }
      })
    })
    setupResize()
    drawSelection()
    drawStaged()
  }

  const drawSelection = () => {
    const bar = document.querySelector('#selection-bar')!
    const label = bar.querySelector('.selection-status')!
    const button = document.querySelector<HTMLButtonElement>('#stage-pair')!
    label.textContent = `${selectedPending.size} ${selectedPending.size === 1 ? 'partida seleccionada' : 'partidas seleccionadas'}`
    button.disabled = selectedPending.size === 0
    bar.classList.toggle('ready', selectedPending.size > 0)
  }

  const drawStaged = () => {
    const grid = document.querySelector('#staged-grid')!
    const stagedRows = sortMovements(rows.filter((row) => staged.has(row.id)), stagedSort)
    paintSortButtons(root, 'staged', stagedSort)
    grid.innerHTML = stagedRows.length ? stagedRows.map((row) => `<tr class="staged-line ${stagedSelection.has(row.id) ? 'selected' : ''}" data-staged-line="${row.id}" tabindex="0">
      ${ledgerRow(row).replace(/^<tr[^>]*>|<\/tr>$/g, '')}
      <td class="action-col"><button class="remove-pair" data-remove="${row.id}" title="Devolver arriba">↑</button></td>
    </tr>`).join('') : `<tr><td colspan="14">${empty('Todavía no hay partidas preparadas', 'Haga doble clic arriba o ejecute la búsqueda automática.')}</td></tr>`
    document.querySelector('#staged-count')!.textContent = `${stagedRows.length} ${stagedRows.length === 1 ? 'partida' : 'partidas'}`
    document.querySelector<HTMLButtonElement>('#confirm-all')!.disabled = stagedRows.length < 2
    document.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
      staged.delete(Number((button as HTMLElement).dataset.remove))
      draw()
    }))
    document.querySelectorAll('[data-staged-line]').forEach((line) => {
      const id = Number((line as HTMLElement).dataset.stagedLine)
      line.addEventListener('click', () => {
        if (stagedSelection.has(id)) stagedSelection.delete(id)
        else stagedSelection.add(id)
        draw()
      })
      line.addEventListener('dblclick', () => { staged.delete(id); stagedSelection.delete(id); draw() })
    })
    setupResize()
    document.querySelector('#staged-selection-status')!.textContent = `${stagedSelection.size} ${stagedSelection.size === 1 ? 'partida seleccionada' : 'partidas seleccionadas'}`
    document.querySelector<HTMLButtonElement>('#unstage-selection')!.disabled = stagedSelection.size === 0
    const debits = stagedRows.reduce((sum, row) => sum + row.debitCents, 0)
    const credits = stagedRows.reduce((sum, row) => sum + row.creditCents, 0)
    document.querySelector('#total-debits')!.textContent = money(debits)
    document.querySelector('#total-credits')!.textContent = money(credits)
    document.querySelector('#total-difference')!.textContent = money(Math.abs(debits - credits))
  }

  document.querySelector('#stage-pair')!.addEventListener('click', stageSelected)
  document.querySelector('#unstage-selection')!.addEventListener('click', unstageSelected)
  const onReconcileEnter = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || isFormField(event.target)) return
    if (!root.isConnected || !location.hash.startsWith('#/conciliar')) return
    if (selectedPending.size > 0) {
      event.preventDefault()
      stageSelected()
      return
    }
    if (stagedSelection.size > 0) {
      event.preventDefault()
      unstageSelected()
      return
    }
    const focused = document.activeElement as HTMLElement | null
    const pendingId = focused?.dataset.sel
    if (pendingId) {
      event.preventDefault()
      staged.add(Number(pendingId))
      selectedPending.delete(Number(pendingId))
      stagedAutomatically = false
      draw()
      return
    }
    const stagedId = focused?.dataset.stagedLine
    if (stagedId) {
      event.preventDefault()
      staged.delete(Number(stagedId))
      stagedSelection.delete(Number(stagedId))
      draw()
    }
  }
  document.addEventListener('keydown', onReconcileEnter)
  const topLedger = root.querySelector<HTMLElement>('.top-ledger')
  const bottomLedger = root.querySelector<HTMLElement>('.bottom-ledger')
  const splitter = root.querySelector<HTMLElement>('.quadrant-splitter')
  if (topLedger && bottomLedger && splitter) {
    setupQuadrantSplitter(topLedger, bottomLedger, splitter, 'cuenta-h:quadrant-heights')
  }
  document.querySelector('#auto-preview')!.addEventListener('click', async () => {
    const proposal = await api<Candidate[]>('/api/reconcile/preview', { method: 'POST', body: '{}' })
    proposal.forEach((pair) => {
      pair.movementIds.forEach((id) => staged.add(id))
    })
    stagedAutomatically = true
    draw()
    toast(`${proposal.length * 2} partida(s) preparadas. Revise antes de confirmar.`)
  })
  document.querySelector('#confirm-all')!.addEventListener('click', async () => {
    const stagedRows = rows.filter((row) => staged.has(row.id))
    const debits = stagedRows.reduce((sum, row) => sum + row.debitCents, 0)
    const credits = stagedRows.reduce((sum, row) => sum + row.creditCents, 0)
    const difference = debits - credits
    if (difference === 0) {
      if (!confirm(`¿Confirmar ${staged.size} partidas como una sola conciliación?`)) return
      await saveReconciliation()
    } else {
      openAdjustmentModal(difference, saveReconciliation)
    }
  })
  bindSortButtons(root, (button) => {
    const key = button.dataset.sort as SortKey
    const column = button.dataset.column ?? key
    if (button.dataset.grid === 'pending') pendingSort = nextSort(pendingSort, key, column)
    else stagedSort = nextSort(stagedSort, key, column)
    draw()
  })
  document.querySelector('#r-concepto')!.addEventListener('input', () => draw())
  document.querySelector('#r-aplicar')!.addEventListener('click', async () => {
    try {
      const params = new URLSearchParams({ estado: 'PENDIENTE' })
      const value = (id: string) => (document.querySelector(id) as HTMLInputElement | HTMLSelectElement).value
      const filters = [['dealer', value('#r-dealer')], ['sector', value('#r-sector')], ['desde', value('#r-from')], ['hasta', value('#r-to')]]
      filters.forEach(([key, filterValue]) => { if (filterValue) params.set(key, filterValue) })
      rows = await getMovements(`?${params}`)
      selectedPending.clear()
      draw()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No se pudo buscar', 'error')
    }
  })
  document.querySelector('#refresh')!.addEventListener('click', async () => {
    const params = new URLSearchParams({ estado: 'PENDIENTE' })
    const value = (id: string) => (document.querySelector(id) as HTMLInputElement | HTMLSelectElement).value
    const filters = [['dealer', value('#r-dealer')], ['sector', value('#r-sector')], ['desde', value('#r-from')], ['hasta', value('#r-to')]]
    filters.forEach(([key, filterValue]) => { if (filterValue) params.set(key, filterValue) })
    rows = await getMovements(`?${params}`)
    draw()
  })
  const saveReconciliation = async (adjustment?: Record<string, string>) => {
    const result = await api<{ reconciliationId: number }>('/api/reconcile', {
      method: 'POST',
      body: JSON.stringify({
        movementIds: [...staged],
        adjustment,
        mode: stagedAutomatically ? 'AUTOMATICA' : 'MANUAL',
      }),
    })
    toast(`Conciliación N.º ${result.reconciliationId} guardada correctamente`)
    await renderReconcile(root)
  }
  const openAdjustmentModal = (difference: number, save: (adjustment: Record<string, string>) => Promise<void>) => {
    const side = difference > 0 ? 'Créditos Libros' : 'Débitos Libros'
    const modal = document.createElement('div')
    modal.className = 'modal-backdrop'
    modal.innerHTML = `<section class="modal adjustment-modal">
      <div class="modal-head"><div><span class="eyebrow">Partida de diferencia</span><h2>Completar ajuste contable</h2><p>Se generará una línea pendiente de ${side} por ${money(Math.abs(difference))}. Quedará visible en movimientos hasta contabilizarla en Quiter.</p></div><button class="modal-close">×</button></div>
      <div class="adjustment-preview"><span>${side}</span><strong>${money(Math.abs(difference))}</strong></div>
      <div class="adjustment-form">
        <label class="full">Explicación obligatoria<textarea id="adj-reason" rows="3" placeholder="Indique a qué se debe la diferencia"></textarea></label>
        <label>Fecha<input id="adj-date" type="date"></label><label>Comprobante<input id="adj-receipt" placeholder="AJDIF"></label>
        <label>Sector<input id="adj-sector" placeholder="*"></label><label>Orden<input id="adj-order"></label>
        <label>Referencia 1<input id="adj-ref1"></label><label>Referencia 2<input id="adj-ref2"></label>
      </div>
      <div class="modal-actions"><button class="button secondary modal-close">Cancelar</button><button class="button primary" id="save-adjustment">Crear ajuste y confirmar</button></div>
    </section>`
    document.body.append(modal)
    const close = () => modal.remove()
    modal.querySelectorAll('.modal-close').forEach((button) => button.addEventListener('click', close))
    modal.querySelector('#save-adjustment')!.addEventListener('click', async () => {
      const value = (id: string) => (modal.querySelector(id) as HTMLInputElement | HTMLTextAreaElement).value.trim()
      const reason = value('#adj-reason')
      if (!reason) {
        toast('La explicación de la diferencia es obligatoria', 'error')
        return
      }
      await save({
        reason, date: value('#adj-date'), receipt: value('#adj-receipt'),
        sector: value('#adj-sector'), orderNo: value('#adj-order'),
        ref1: value('#adj-ref1'), ref2: value('#adj-ref2'),
      })
      close()
    })
  }
  draw()
  return () => document.removeEventListener('keydown', onReconcileEnter)
}

let disposeReconcileKeys: (() => void) | null = null

function renderImport(root: HTMLElement) {
  root.innerHTML = `
    ${heading('Ingreso de datos', 'Importar archivos', 'Las partidas importadas quedarán pendientes. La conciliación nunca se ejecuta automáticamente.')}
    <div class="notice"><span>i</span><div><b>Importación y conciliación son pasos separados</b><p>Después de importar, vaya a Conciliar cuando desee buscar contrapartidas.</p></div></div>
    <section class="import-grid">
      <article class="panel upload-card">
        <span class="upload-icon bank">B</span><h2>Movimientos bancarios</h2><p>Listado Stellantis en TXT, CSV, XLS o XLSX. El resumen terminal solo agrega partidas nuevas.</p>
        <label class="dropzone" id="dz-txt"><input type="file" accept=".txt,.csv,.xls,.xlsx" data-origin="banco" multiple><span>↑</span><b>Seleccione uno o varios archivos</b><small>TXT, CSV, XLS o XLSX · El resumen terminal omite partidas ya cargadas</small></label>
        <p class="selected-files" data-names="banco"></p>
        <div class="upload-result" data-result="banco"></div>
      </article>
      <article class="panel upload-card">
        <span class="upload-icon book">L</span><h2>Mayor contable</h2><p>Exportación Quiter en XLS, XLSX, TXT o CSV.</p>
        <label class="dropzone" id="dz-xls"><input type="file" accept=".xls,.xlsx" data-origin="libro"><span>↑</span><b>Seleccione el Excel de Quiter</b><small>Hoja Informe · XLS o XLSX</small></label>
        <div class="upload-result" data-result="libro"></div>
      </article>
    </section>`
  document.querySelectorAll<HTMLInputElement>('input[type=file]').forEach((input) => input.addEventListener('change', async () => {
    const files = [...(input.files ?? [])]
    if (!files.length) return
    const origin = input.dataset.origin!
    const names = document.querySelector(`[data-names="${origin}"]`)
    if (names) names.textContent = files.map((file) => file.name).join(' · ')
    const result = document.querySelector(`[data-result="${origin}"]`)!
    result.innerHTML = '<span class="mini-loader"></span> Procesando archivo…'
    const data = new FormData()
    files.forEach((file) => data.append('files', file))
    try {
      const imported = await api<{
        inserted: number
        duplicates: number
        skipped: number
        skippedExisting: number
        cleanedDuplicates: number
        pending: boolean
        reconciled: boolean
        errors: string[]
        files: Array<{ name: string; inserted: number; duplicates: number; skipped: number; skippedExisting: number; cleanedDuplicates: number; errors: string[] }>
      }>(`/api/import/${origin}`, { method: 'POST', body: data })
      const cleanedLabel = imported.cleanedDuplicates ? ` · ${imported.cleanedDuplicates} duplicados corregidos` : ''
      result.innerHTML = `<div class="success-result"><b>${imported.inserted} partidas nuevas · pendientes</b><span>${imported.duplicates} duplicadas · ${imported.skippedExisting} ya existían · ${imported.skipped} omitidas${cleanedLabel} · Sin conciliación automática</span></div>
        <table class="import-summary"><thead><tr><th>Archivo</th><th>Nuevas</th><th>Duplicadas</th><th>Ya existían</th><th>Corregidos</th><th>Omitidas</th><th>Errores</th></tr></thead><tbody>
        ${imported.files.map((file) => `<tr><td>${esc(file.name)}</td><td>${file.inserted}</td><td>${file.duplicates}</td><td>${file.skippedExisting}</td><td>${file.cleanedDuplicates}</td><td>${file.skipped}</td><td>${file.errors.length}</td></tr>`).join('')}
        </tbody></table>
        ${imported.errors.length ? `<div class="error-result">${imported.errors.slice(0, 4).map(esc).join('<br>')}</div>` : ''}`
      toast('Archivo importado. No se ejecutó ninguna conciliación.')
    } catch (error) {
      result.innerHTML = `<div class="error-result">${esc(error instanceof Error ? error.message : error)}</div>`
    }
  }))
}

function renderReports(root: HTMLElement) {
  root.innerHTML = `
    ${heading('Exportación', 'Reportes', 'Descargue movimientos para análisis o archivo.')}
    <section class="panel report-card">
      <div><span class="report-icon">↗</span><h2>Reporte de movimientos</h2><p>El archivo CSV es compatible con Excel e incluye importes, referencias y el responsable pendiente.</p></div>
      <form id="report-form" class="report-form">
        <label>Estado<select name="estado"><option value="">Todos</option><option>PENDIENTE</option><option>CONCILIADO</option></select></label>
        <label>Origen<select name="origen"><option value="">Todos</option><option>BANCO</option><option>LIBRO</option></select></label>
        <label>Desde<input type="date" name="desde"></label><label>Hasta<input type="date" name="hasta"></label>
        <button class="button primary">Descargar CSV <span>↓</span></button>
      </form>
    </section>`
  document.querySelector('#report-form')!.addEventListener('submit', (event) => {
    event.preventDefault()
    const params = new URLSearchParams(new FormData(event.target as HTMLFormElement) as unknown as Record<string, string>)
    window.open(`/api/report?${params}`, '_blank')
  })
}

async function renderAudit(root: HTMLElement) {
  const rows = await api<Array<{ id: number; action: string; detail: string; actor?: string; created_at: string }>>('/api/auditoria')
  root.innerHTML = `
    ${heading('Trazabilidad', 'Auditoría', 'Registro inalterable de acciones de conciliación.')}
    <section class="panel table-panel"><div class="panel-head"><div><h2>Historial de actividad</h2><p>Últimos 100 eventos</p></div></div>
    ${rows.length ? `<div class="audit-list">${rows.map((row) => `<div class="audit-row">
      <span class="audit-icon">✓</span><div><b>${esc(row.action)}</b><p>${esc(row.detail)}${row.actor ? ` · ${esc(row.actor)}` : ''}</p></div><time>${new Date(`${row.created_at}Z`).toLocaleString('es-AR')}</time>
    </div>`).join('')}</div>` : empty('Sin actividad registrada', 'Las conciliaciones confirmadas aparecerán aquí.')}</section>`
}

async function bootstrap() {
  try {
    const session = await getSession()
    sessionUser = session.user
    shell()
    attachShellListeners()
    updateSessionUser()
    if (!location.hash) location.hash = '#/resumen'
    await render()
  } catch {
    renderLogin()
  }
}

void bootstrap()
