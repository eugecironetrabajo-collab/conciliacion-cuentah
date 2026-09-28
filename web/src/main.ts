import './style.css'
import { TERMINALS, movementLabel } from '../../src/terminals.js'
import { api, escapeHtml as esc, getMovements, money, shortDate, type Candidate, type Movement, type Reconciliation } from './api'

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

function shell() {
  app.innerHTML = `
    <header class="app-header">
      <div class="header-main">
        <a class="brand" href="#/resumen" aria-label="SYC Conciliaciones">
          <span class="brand-mark">S</span>
          <span><b>SYC</b><small>Conciliaciones Cuenta H</small></span>
        </a>
        <div class="company-switcher">
          <span>Empresa activa</span>
          <button type="button"><b>Peugeot Citroën Argentina S.A.</b><small>Cuenta H · ARS</small><i>⌄</i></button>
        </div>
        <div class="top-actions">
          <span class="live"><i></i>Sistema operativo</span>
          <span class="database-pill"><small>Base activa</small><b id="db-badge">conciliacion.db</b></span>
          <button class="user-menu"><span class="avatar">AP</span><span><b>Administración</b><small>Usuario local</small></span><i>⌄</i></button>
        </div>
      </div>
      <div class="nav-bar">
        <button class="menu-button" id="menu-button" aria-label="Abrir navegación">☰ <span id="crumb-current">Resumen</span></button>
        <nav id="nav">${routes.map((route) => `
          <a href="#/${route.id}" data-nav="${route.id}">
            <span class="nav-icon">${route.icon}</span>${route.label}
          </a>`).join('')}</nav>
        <span class="nav-context">SYC / Cuenta H</span>
      </div>
    </header>
    <main>
      <div id="view" class="view"></div>
    </main>
    <div id="toast" role="status" aria-live="polite"></div>
  `
  document.querySelector('#menu-button')?.addEventListener('click', () => document.body.classList.toggle('menu-open'))
  document.querySelectorAll('#nav a').forEach((link) => link.addEventListener('click', () => document.body.classList.remove('menu-open')))
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
    if (current === 'resumen') await renderSummary(view)
    if (current === 'movimientos') await renderMovements(view)
    if (current === 'conciliar') await renderReconcile(view)
    if (current === 'importar') renderImport(view)
    if (current === 'reportes') renderReports(view)
    if (current === 'auditoria') await renderAudit(view)
  } catch (error) {
    view.innerHTML = `<div class="error-panel"><b>No pudimos cargar esta pantalla</b><p>${esc(error instanceof Error ? error.message : error)}</p><button class="button secondary" id="retry">Reintentar</button></div>`
    document.querySelector('#retry')?.addEventListener('click', render)
  }
}

async function renderSummary(root: HTMLElement) {
  const [status, rows] = await Promise.all([
    api<{
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
    }>('/api/status'),
    getMovements(),
  ])
  const pending = rows.filter((row) => row.status === 'PENDIENTE').length
  const reconciled = rows.filter((row) => row.status === 'CONCILIADO').length
  const reconciliations = new Set(rows.filter((row) => row.reconciliationId).map((row) => row.reconciliationId)).size
  const latest = [...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
  const statement = status.statement
  const amountCell = (cents: number) => `<td class="number ${cents < 0 ? 'negative' : ''}">$ ${money(cents)}</td>`
  root.innerHTML = `
    ${heading('Panel general', 'Resumen de Cuenta H', 'Saldos de banco y de libros por separado. No se suman entre sí.', '<a class="button primary" href="#/conciliar">Abrir conciliación <span>→</span></a>')}
    <section class="metrics summary-metrics">
      <article><div class="metric-icon blue">≡</div><span>Partidas pendientes</span><strong>${pending}</strong><small>Requieren revisión</small></article>
      <article><div class="metric-icon green">✓</div><span>Conciliaciones</span><strong>${reconciliations}</strong><small>${reconciled} partidas procesadas</small></article>
    </section>
    <section class="panel balance-sheet">
      <div class="panel-head"><div><h2>Saldos de la cuenta</h2><p>Débitos y créditos de cada origen, sin mezclarlos</p></div></div>
      <table>
        <thead><tr><th>Concepto</th><th class="number">Partidas</th><th class="number">Importe</th></tr></thead>
        <tbody>
          <tr class="total"><td>Saldo banco</td><td class="number"></td>${amountCell(statement.bankBalance)}</tr>
          <tr><td>(+) Débitos libros</td><td class="number">${statement.bookDebitCount}</td>${amountCell(statement.bookDebits)}</tr>
          <tr><td>(−) Créditos bancos</td><td class="number">${statement.bankCreditCount}</td>${amountCell(statement.bankCredits)}</tr>
          <tr><td>(+) Débitos bancos</td><td class="number">${statement.bankDebitCount}</td>${amountCell(statement.bankDebits)}</tr>
          <tr><td>(−) Créditos libros</td><td class="number">${statement.bookCreditCount}</td>${amountCell(statement.bookCredits)}</tr>
          <tr class="total"><td>Saldo libros</td><td class="number"></td>${amountCell(statement.bookBalance)}</tr>
        </tbody>
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
}

function statusBadge(status: Movement['status']) {
  return `<span class="badge ${status.toLowerCase()}">${status}</span>`
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
      <div class="table-scroll"><table class="standard-table"><thead><tr><th></th><th>ID</th><th>Origen</th><th>Terminal</th><th>Estado</th><th>Fecha</th><th>Fecha proc.</th><th>Comprobante</th><th>Referencia</th><th>Detalle</th><th class="number">Débito</th><th class="number">Crédito</th><th>Acción</th></tr></thead><tbody id="movement-body"></tbody></table></div>
    </section><div id="modal-root"></div>`
  const draw = (items: Movement[]) => {
    document.querySelector('#row-count')!.textContent = String(items.length)
    const manageable = (row: Movement) => !row.isAdjustment && (row.status === 'PENDIENTE' || row.status === 'ELIMINADO')
    document.querySelector('#movement-body')!.innerHTML = items.map((row) => `<tr ${row.reconciliationId ? `data-reconciliation="${row.reconciliationId}" tabindex="0" title="Doble clic para ver conciliación ${row.reconciliationId}"` : ''}>
      <td>${manageable(row) ? `<input class="row-check" type="checkbox" data-id="${row.id}" data-status="${row.status}" aria-label="Seleccionar movimiento ${row.id}">` : ''}</td>
      <td class="muted">#${row.id}</td><td><span class="origin-label ${row.origin.toLowerCase()}">${row.origin}</span></td>
      <td>${esc(movementLabel(row.origin, row.dealer, row.sector))}</td>
      <td>${statusBadge(row.status)}</td><td>${shortDate(row.date)}</td><td>${shortDate(row.processDate)}</td><td>${esc(row.receipt)} ${esc(row.orderNo)}</td>
      <td class="mono">${esc(row.ref1 || row.ref2 || '—')}</td><td class="detail-cell">${esc(row.notes)}</td>
      <td class="number">${row.debitCents ? money(row.debitCents) : '—'}</td><td class="number">${row.creditCents ? money(row.creditCents) : '—'}</td>
      <td>${row.status === 'CONCILIADO' ? `<button class="text-button" data-open="${row.reconciliationId}">Ver #${row.reconciliationId}</button>` : `<a class="text-button" href="#/conciliar">Conciliar</a>`}</td>
    </tr>`).join('')
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
  let prepared = false
  const originalRows = reconciliation.movements.filter((row) => !row.isAdjustment)
  const draw = () => {
    modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal wide reversal-workspace">
      <div class="modal-head"><div><span class="eyebrow">Reversión de conciliaciones</span><h2>Conciliación N.º ${reconciliation.id}</h2><p>El grupo es indivisible: todas sus partidas se revierten juntas.</p></div><button class="modal-close" aria-label="Cerrar">×</button></div>
      <div class="reversal-quadrant"><div class="quadrant-head"><div><span class="step">1</span><div><h2>Conciliación activa</h2><p>Doble clic para preparar la reversión completa</p></div></div></div>
        <div class="ledger-wrap reversal-ledger"><table class="ledger"><thead><tr>${ledgerColumns}</tr></thead><tbody>${prepared ? `<tr><td colspan="13">${empty('Grupo trasladado', 'Las partidas están listas para ser revertidas.')}</td></tr>` : reconciliation.movements.map((row) => ledgerRow(row, 'data-reverse-group tabindex="0"', row.isAdjustment ? 'adjustment-row' : '')).join('')}</tbody></table></div>
      </div>
      <div class="flow-divider"><span>↓</span><small>Grupo preparado para reversión</small><span>↓</span></div>
      <div class="reversal-quadrant prepared"><div class="quadrant-head"><div><span class="step green">2</span><div><h2>Partidas a devolver a pendientes</h2><p>La línea de ajuste será anulada y permanecerá en el historial</p></div></div></div>
        <div class="ledger-wrap reversal-ledger"><table class="ledger"><thead><tr>${ledgerColumns}</tr></thead><tbody>${prepared ? originalRows.map((row) => ledgerRow(row)).join('') : `<tr><td colspan="13">${empty('Sin partidas preparadas', 'Traslade la conciliación completa desde el cuadrante superior.')}</td></tr>`}</tbody></table></div>
      </div>
      <label class="reason-field">Motivo de la reversión<textarea id="reversal-reason" rows="2" placeholder="Explique por qué se revierte esta conciliación">${prepared ? '' : ''}</textarea></label>
      <div class="modal-actions"><button class="button secondary modal-close">Cancelar</button>${prepared ? '<button class="button secondary" id="return-reversal">Devolver arriba</button>' : ''}<button class="button danger-button" id="save-reversal" ${prepared ? '' : 'disabled'}>Guardar reversión</button></div>
    </section></div>`
    modalRoot.querySelectorAll('.modal-close').forEach((button) => button.addEventListener('click', () => modalRoot.innerHTML = ''))
    modalRoot.querySelectorAll('[data-reverse-group]').forEach((row) => {
      const stage = () => { prepared = true; draw() }
      row.addEventListener('dblclick', stage)
      row.addEventListener('keydown', (event) => { if ((event as KeyboardEvent).key === 'Enter') stage() })
    })
    modalRoot.querySelector('#return-reversal')?.addEventListener('click', () => { prepared = false; draw() })
    modalRoot.querySelector('#save-reversal')?.addEventListener('click', async () => {
      const reason = (modalRoot.querySelector('#reversal-reason') as HTMLTextAreaElement).value.trim()
      if (!reason) {
        toast('Indique el motivo de la reversión', 'error')
        return
      }
      await api(`/api/reconciliaciones/${reconciliation.id}/revertir`, { method: 'POST', body: JSON.stringify({ motivo: reason }) })
      modalRoot.innerHTML = ''
      toast(`Conciliación ${reconciliation.id} revertida. ${originalRows.length} partidas volvieron a pendientes.`)
      await renderMovements(root)
    })
  }
  draw()
}

const ledgerColumns = `
  <th>Fecha</th><th>Fecha proc.</th><th>Terminal</th><th>Comprobante</th><th>Sector</th><th>Orden</th>
  <th>Ref. 1</th><th>Ref. 2</th><th class="number">Débitos libros</th>
  <th class="number">Créditos bancos</th><th class="number">Débitos bancos</th>
  <th class="number">Créditos libros</th><th>Observaciones</th>`

function ledgerRow(row: Movement, attributes = '', extraClass = '') {
  return `<tr ${attributes} class="${extraClass}">
    <td>${shortDate(row.date)}</td><td>${shortDate(row.processDate)}</td><td>${esc(movementLabel(row.origin, row.dealer, row.sector))}</td><td>${esc(row.receipt)}</td>
    <td>${esc(row.sector || '—')}</td><td>${esc(row.orderNo)}</td><td class="mono">${esc(row.ref1)}</td><td class="mono">${esc(row.ref2)}</td>
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
  let stagedAutomatically = false
  let selectedBank: number | null = null
  let selectedBook: number | null = null
  let checked: Candidate | null = null

  root.innerHTML = `
    ${heading('Mesa de trabajo', 'Conciliar partidas', 'Haga doble clic para bajar partidas individualmente o use la búsqueda automática.', `
      <button class="button secondary" id="auto-preview">Búsqueda automática</button>
      <button class="button primary" id="confirm-all" disabled>Confirmar conciliación <span>→</span></button>`)}
    <section class="reconcile-filters">
      <label>Banco<select id="r-dealer">${dealerOptions}</select></label>
      <label>Sector<select id="r-sector"><option value="">Todos los sectores</option></select></label>
      <label>Fecha desde<input id="r-from" type="date"></label>
      <label>Fecha hasta<input id="r-to" type="date"></label>
      <button class="icon-button" id="refresh" aria-label="Actualizar">↻</button>
    </section>
    <section class="quadrant">
      <div class="quadrant-head">
        <div><span class="step">1</span><div><h2>Partidas pendientes</h2><p>Doble clic para mover una línea al cuadrante inferior</p></div></div>
        <div class="legend"><span><i class="bank"></i>Banco</span><span><i class="book"></i>Libros</span><b id="pending-count"></b></div>
      </div>
      <div class="ledger-wrap top-ledger"><table class="ledger"><thead><tr>${ledgerColumns}</tr></thead><tbody id="pending-grid"></tbody></table></div>
      <div class="selection-bar" id="selection-bar">
        <div><span class="selection-status">Seleccione dos partidas</span><small>Una bancaria y una contable</small></div>
        <div class="selection-difference" id="selection-difference"></div>
        <button class="button dark" id="stage-pair" disabled>Mover al cuadrante inferior ↓</button>
      </div>
    </section>
    <div class="flow-divider"><span>↓</span><small>Partidas preparadas para conciliación</small><span>↓</span></div>
    <section class="quadrant prepared">
      <div class="quadrant-head">
        <div><span class="step green">2</span><div><h2>Conciliación preparada</h2><p>Revise las contrapartidas antes de confirmar</p></div></div>
        <span class="badge pending" id="staged-count">0 partidas</span>
      </div>
      <div class="ledger-wrap bottom-ledger"><table class="ledger"><thead><tr>${ledgerColumns}<th class="action-col"></th></tr></thead><tbody id="staged-grid"></tbody></table></div>
      <div class="ledger-totals">
        <div><span>Total débitos</span><strong id="total-debits">0,00</strong></div>
        <div><span>Total créditos</span><strong id="total-credits">0,00</strong></div>
        <div class="difference"><span>Diferencia</span><strong id="total-difference">0,00</strong></div>
      </div>
    </section>`

  const draw = () => {
    const available = rows.filter((row) => !staged.has(row.id))
    const grid = document.querySelector('#pending-grid')!
    grid.innerHTML = available.length
      ? available.map((row) => ledgerRow(row, `data-sel="${row.id}" tabindex="0"`, [
          row.id === selectedBank || row.id === selectedBook ? 'selected' : '',
          checked && (row.id === checked.bankId || row.id === checked.bookId) ? 'matched' : '',
        ].join(' '))).join('')
      : `<tr><td colspan="13">${empty('Sin partidas pendientes', 'Importe nuevos movimientos o confirme las partidas preparadas.')}</td></tr>`
    document.querySelector('#pending-count')!.textContent = `${available.length} partidas`
    document.querySelectorAll('[data-sel]').forEach((node) => {
      const select = async () => {
        const row = rows.find((item) => item.id === Number((node as HTMLElement).dataset.sel))!
        if (row.origin === 'BANCO') selectedBank = selectedBank === row.id ? null : row.id
        else selectedBook = selectedBook === row.id ? null : row.id
        checked = null
        if (selectedBank && selectedBook) {
          checked = await api<Candidate>('/api/reconcile/check', {
            method: 'POST', body: JSON.stringify({ bankId: selectedBank, bookId: selectedBook }),
          })
        }
        draw()
      }
      let clickTimer: number | undefined
      node.addEventListener('click', () => {
        window.clearTimeout(clickTimer)
        clickTimer = window.setTimeout(select, 220)
      })
      node.addEventListener('dblclick', (event) => {
        event.preventDefault()
        window.clearTimeout(clickTimer)
        staged.add(Number((node as HTMLElement).dataset.sel))
        selectedBank = selectedBook = null
        checked = null
        stagedAutomatically = false
        draw()
      })
      node.addEventListener('keydown', (event) => {
        if ((event as KeyboardEvent).key === 'Enter') {
          staged.add(Number((node as HTMLElement).dataset.sel))
          selectedBank = selectedBook = null
          checked = null
          stagedAutomatically = false
          draw()
        } else if ((event as KeyboardEvent).key === ' ') select()
      })
    })
    drawSelection()
    drawStaged()
  }

  const drawSelection = () => {
    const bar = document.querySelector('#selection-bar')!
    const label = bar.querySelector('.selection-status')!
    const hint = bar.querySelector('small')!
    const difference = document.querySelector('#selection-difference')!
    const button = document.querySelector<HTMLButtonElement>('#stage-pair')!
    if (checked) {
      label.textContent = checked.differenceCents === 0 ? 'Contrapartida compatible' : 'Los importes no compensan'
      hint.textContent = checked.reason
      difference.innerHTML = `<span>Diferencia</span><strong>${money(checked.differenceCents)}</strong>`
      button.disabled = false
      bar.classList.add('ready')
    } else {
      label.textContent = selectedBank || selectedBook ? 'Falta seleccionar la contrapartida' : 'Seleccione dos partidas'
      hint.textContent = selectedBank ? 'Ahora seleccione una línea de libros' : selectedBook ? 'Ahora seleccione una línea bancaria' : 'Una bancaria y una contable'
      difference.innerHTML = ''
      button.disabled = true
      bar.classList.remove('ready')
    }
  }

  const drawStaged = () => {
    const grid = document.querySelector('#staged-grid')!
    const stagedRows = rows.filter((row) => staged.has(row.id))
    grid.innerHTML = stagedRows.length ? stagedRows.map((row) => `<tr class="staged-line" data-staged-line="${row.id}">
      ${ledgerRow(row).replace(/^<tr[^>]*>|<\/tr>$/g, '')}
      <td class="action-col"><button class="remove-pair" data-remove="${row.id}" title="Devolver arriba">↑</button></td>
    </tr>`).join('') : `<tr><td colspan="14">${empty('Todavía no hay partidas preparadas', 'Haga doble clic arriba o ejecute la búsqueda automática.')}</td></tr>`
    document.querySelector('#staged-count')!.textContent = `${stagedRows.length} ${stagedRows.length === 1 ? 'partida' : 'partidas'}`
    const hasBank = stagedRows.some((row) => row.origin === 'BANCO')
    const hasBook = stagedRows.some((row) => row.origin === 'LIBRO')
    document.querySelector<HTMLButtonElement>('#confirm-all')!.disabled = !hasBank || !hasBook
    document.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
      staged.delete(Number((button as HTMLElement).dataset.remove))
      draw()
    }))
    document.querySelectorAll('[data-staged-line]').forEach((line) => line.addEventListener('dblclick', () => {
      staged.delete(Number((line as HTMLElement).dataset.stagedLine))
      draw()
    }))
    const debits = stagedRows.reduce((sum, row) => sum + row.debitCents, 0)
    const credits = stagedRows.reduce((sum, row) => sum + row.creditCents, 0)
    document.querySelector('#total-debits')!.textContent = money(debits)
    document.querySelector('#total-credits')!.textContent = money(credits)
    document.querySelector('#total-difference')!.textContent = money(Math.abs(debits - credits))
  }

  document.querySelector('#stage-pair')!.addEventListener('click', () => {
    if (!checked) return
    staged.add(checked.bankId)
    staged.add(checked.bookId)
    selectedBank = selectedBook = null
    checked = null
    stagedAutomatically = false
    draw()
  })
  document.querySelector('#auto-preview')!.addEventListener('click', async () => {
    const proposal = await api<Candidate[]>('/api/reconcile/preview', { method: 'POST', body: '{}' })
    proposal.forEach((pair) => {
      staged.add(pair.bankId)
      staged.add(pair.bookId)
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
  document.querySelector('#refresh')!.addEventListener('click', async () => {
    rows = await getMovements('?estado=PENDIENTE')
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
      <div class="modal-head"><div><span class="eyebrow">Partida de diferencia</span><h2>Completar ajuste contable</h2><p>Se generará una línea de ${side} por ${money(Math.abs(difference))}.</p></div><button class="modal-close">×</button></div>
      <div class="adjustment-preview"><span>${side}</span><strong>${money(Math.abs(difference))}</strong></div>
      <div class="adjustment-form">
        <label class="full">Explicación obligatoria<textarea id="adj-reason" rows="3" placeholder="Indique a qué se debe la diferencia"></textarea></label>
        <label>Fecha<input id="adj-date" type="date"></label><label>Comprobante<input id="adj-receipt" placeholder="AJDIF"></label>
        <label>Sector<input id="adj-sector" placeholder="*"></label><label>Orden<input id="adj-order"></label>
        <label>Ref. 1<input id="adj-ref1"></label><label>Ref. 2<input id="adj-ref2"></label>
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
}

function renderImport(root: HTMLElement) {
  root.innerHTML = `
    ${heading('Ingreso de datos', 'Importar archivos', 'Las partidas importadas quedarán pendientes. La conciliación nunca se ejecuta automáticamente.')}
    <div class="notice"><span>i</span><div><b>Importación y conciliación son pasos separados</b><p>Después de importar, vaya a Conciliar cuando desee buscar contrapartidas.</p></div></div>
    <section class="import-grid">
      <article class="panel upload-card">
        <span class="upload-icon bank">B</span><h2>Movimientos bancarios</h2><p>Listado Stellantis en TXT, CSV, XLS o XLSX.</p>
        <label class="dropzone" id="dz-txt"><input type="file" accept=".txt,.csv" data-origin="banco" multiple><span>↑</span><b>Seleccione uno o varios TXT</b><small>Se eliminan duplicados entre archivos</small></label>
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
        pending: boolean
        reconciled: boolean
        errors: string[]
        files: Array<{ name: string; inserted: number; duplicates: number; skipped: number; errors: string[] }>
      }>(`/api/import/${origin}`, { method: 'POST', body: data })
      result.innerHTML = `<div class="success-result"><b>${imported.inserted} partidas nuevas · pendientes</b><span>${imported.duplicates} duplicadas · ${imported.skipped} omitidas · Sin conciliación automática</span></div>
        <table class="import-summary"><thead><tr><th>Archivo</th><th>Nuevas</th><th>Duplicadas</th><th>Omitidas</th><th>Errores</th></tr></thead><tbody>
        ${imported.files.map((file) => `<tr><td>${esc(file.name)}</td><td>${file.inserted}</td><td>${file.duplicates}</td><td>${file.skipped}</td><td>${file.errors.length}</td></tr>`).join('')}
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
      <div><span class="report-icon">↗</span><h2>Reporte de movimientos</h2><p>El archivo CSV es compatible con Excel y conserva importes y referencias.</p></div>
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
  const rows = await api<Array<{ id: number; action: string; detail: string; created_at: string }>>('/api/auditoria')
  root.innerHTML = `
    ${heading('Trazabilidad', 'Auditoría', 'Registro inalterable de acciones de conciliación.')}
    <section class="panel table-panel"><div class="panel-head"><div><h2>Historial de actividad</h2><p>Últimos 100 eventos</p></div></div>
    ${rows.length ? `<div class="audit-list">${rows.map((row) => `<div class="audit-row">
      <span class="audit-icon">✓</span><div><b>${esc(row.action)}</b><p>${esc(row.detail)}</p></div><time>${new Date(`${row.created_at}Z`).toLocaleString('es-AR')}</time>
    </div>`).join('')}</div>` : empty('Sin actividad registrada', 'Las conciliaciones confirmadas aparecerán aquí.')}</section>`
}

shell()
window.addEventListener('hashchange', render)
if (!location.hash) location.hash = '#/resumen'
render()
