import './style.css'
import { api, escapeHtml as esc, getMovements, money, shortDate, type Candidate, type Movement } from './api'

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
    <aside class="sidebar">
      <a class="brand" href="#/resumen" aria-label="Cuenta H">
        <span class="brand-mark">H</span>
        <span><b>Cuenta H</b><small>Conciliación</small></span>
      </a>
      <nav id="nav">${routes.map((route) => `
        <a href="#/${route.id}" data-nav="${route.id}">
          <span class="nav-icon">${route.icon}</span>${route.label}
        </a>`).join('')}</nav>
      <div class="sidebar-foot">
        <span class="status-dot"></span>
        <span><b>Base activa</b><small id="db-badge">conciliacion.db</small></span>
      </div>
    </aside>
    <main>
      <header class="topbar">
        <button class="menu-button" id="menu-button" aria-label="Abrir menú">☰</button>
        <div class="crumb">Administración <span>/</span> <b id="crumb-current">Resumen</b></div>
        <div class="top-actions"><span class="live"><i></i>Sistema operativo</span><button class="avatar">AP</button></div>
      </header>
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
    api<{ db: string; counts: Array<{ origin: string; status: string; count: number }>; totals: { debits: number; credits: number } }>('/api/status'),
    getMovements(),
  ])
  const pending = rows.filter((row) => row.status === 'PENDIENTE').length
  const reconciled = rows.filter((row) => row.status === 'CONCILIADO').length
  const pairs = new Set(rows.filter((row) => row.pairId).map((row) => row.pairId)).size
  const latest = [...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
  root.innerHTML = `
    ${heading('Panel general', 'Resumen de Cuenta H', 'Estado de la conciliación y actividad reciente.', '<a class="button primary" href="#/conciliar">Abrir conciliación <span>→</span></a>')}
    <section class="metrics">
      <article><div class="metric-icon blue">≡</div><span>Partidas pendientes</span><strong>${pending}</strong><small>Requieren revisión</small></article>
      <article><div class="metric-icon green">✓</div><span>Pares conciliados</span><strong>${pairs}</strong><small>${reconciled} partidas procesadas</small></article>
      <article><div class="metric-icon amber">∑</div><span>Total débitos</span><strong>$ ${money(Number(status.totals.debits ?? 0))}</strong><small>Banco y libros</small></article>
      <article><div class="metric-icon ink">⇄</div><span>Diferencia global</span><strong>$ ${money(Math.abs(Number(status.totals.debits ?? 0) - Number(status.totals.credits ?? 0)))}</strong><small>Débitos contra créditos</small></article>
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
    ${heading('Libro mayor', 'Movimientos', 'Consulte todas las partidas bancarias y contables.')}
    <section class="panel filters">
      <label>Estado<select id="f-estado"><option>TODOS</option><option>PENDIENTE</option><option>CONCILIADO</option><option>ELIMINADO</option></select></label>
      <label>Origen<select id="f-origen"><option>TODOS</option><option>BANCO</option><option>LIBRO</option></select></label>
      <label>Desde<input id="f-desde" type="date"></label>
      <label>Hasta<input id="f-hasta" type="date"></label>
      <button class="button secondary" id="f-aplicar">Aplicar filtros</button>
    </section>
    <section class="panel table-panel">
      <div class="panel-head"><div><h2>Registro de partidas</h2><p><span id="row-count">${rows.length}</span> resultados</p></div></div>
      <div class="table-scroll"><table class="standard-table"><thead><tr><th>ID</th><th>Origen</th><th>Estado</th><th>Fecha</th><th>Comprobante</th><th>Referencia</th><th>Detalle</th><th class="number">Débito</th><th class="number">Crédito</th><th>Acción</th></tr></thead><tbody id="movement-body"></tbody></table></div>
    </section>`
  const draw = (items: Movement[]) => {
    document.querySelector('#row-count')!.textContent = String(items.length)
    document.querySelector('#movement-body')!.innerHTML = items.map((row) => `<tr>
      <td class="muted">#${row.id}</td><td><span class="origin-label ${row.origin.toLowerCase()}">${row.origin}</span></td>
      <td>${statusBadge(row.status)}</td><td>${shortDate(row.date)}</td><td>${esc(row.receipt)} ${esc(row.orderNo)}</td>
      <td class="mono">${esc(row.ref1 || row.ref2 || '—')}</td><td class="detail-cell">${esc(row.notes)}</td>
      <td class="number">${row.debitCents ? money(row.debitCents) : '—'}</td><td class="number">${row.creditCents ? money(row.creditCents) : '—'}</td>
      <td>${row.status === 'CONCILIADO' ? `<button class="text-button danger" data-unreconcile="${row.id}">Desconciliar</button>` : `<a class="text-button" href="#/conciliar">Conciliar</a>`}</td>
    </tr>`).join('')
    document.querySelectorAll('[data-unreconcile]').forEach((button) => button.addEventListener('click', async () => {
      const reason = prompt('Motivo para desconciliar:')
      if (!reason) return
      await api('/api/unreconcile', { method: 'POST', body: JSON.stringify({ id: Number((button as HTMLElement).dataset.unreconcile), motivo: reason }) })
      toast('La pareja volvió a pendientes')
      await renderMovements(root)
    }))
  }
  draw(rows)
  document.querySelector('#f-aplicar')?.addEventListener('click', async () => {
    const params = new URLSearchParams()
    const values = [
      ['estado', (document.querySelector('#f-estado') as HTMLSelectElement).value],
      ['origen', (document.querySelector('#f-origen') as HTMLSelectElement).value],
      ['desde', (document.querySelector('#f-desde') as HTMLInputElement).value],
      ['hasta', (document.querySelector('#f-hasta') as HTMLInputElement).value],
    ]
    values.forEach(([key, value]) => value && params.set(key, value))
    draw(await getMovements(`?${params}`))
  })
}

const ledgerColumns = `
  <th>Fecha</th><th>Fecha proc.</th><th>Comprobante</th><th>Sector</th><th>Orden</th>
  <th>Ref. 1</th><th>Ref. 2</th><th class="number">Débitos libros</th>
  <th class="number">Créditos bancos</th><th class="number">Débitos bancos</th>
  <th class="number">Créditos libros</th><th>Observaciones</th>`

function ledgerRow(row: Movement, attributes = '', extraClass = '') {
  return `<tr ${attributes} class="${extraClass}">
    <td>${shortDate(row.date)}</td><td>${shortDate(row.processDate)}</td><td>${esc(row.receipt)}</td>
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
  const staged = new Map<string, Candidate>()
  let selectedBank: number | null = null
  let selectedBook: number | null = null
  let checked: Candidate | null = null

  root.innerHTML = `
    ${heading('Mesa de trabajo', 'Conciliar partidas', 'Seleccione una partida bancaria y su contrapartida contable.', `
      <button class="button secondary" id="auto-preview">Búsqueda automática</button>
      <button class="button primary" id="confirm-all" disabled>Confirmar conciliación <span>→</span></button>`)}
    <section class="reconcile-filters">
      <label>Banco<select id="r-dealer"><option value="">Todos</option><option value="6">6 · Peugeot Citroën Argentina</option></select></label>
      <label>Sector<select id="r-sector"><option value="">Todos los sectores</option></select></label>
      <label>Fecha desde<input id="r-from" type="date"></label>
      <label>Fecha hasta<input id="r-to" type="date"></label>
      <button class="icon-button" id="refresh" aria-label="Actualizar">↻</button>
    </section>
    <section class="quadrant">
      <div class="quadrant-head">
        <div><span class="step">1</span><div><h2>Partidas pendientes</h2><p>Seleccione una línea de banco y una de libros</p></div></div>
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
        <span class="badge pending" id="staged-count">0 parejas</span>
      </div>
      <div class="ledger-wrap bottom-ledger"><table class="ledger"><thead><tr>${ledgerColumns}<th class="action-col"></th></tr></thead><tbody id="staged-grid"></tbody></table></div>
      <div class="ledger-totals">
        <div><span>Total débitos</span><strong id="total-debits">0,00</strong></div>
        <div><span>Total créditos</span><strong id="total-credits">0,00</strong></div>
        <div class="difference"><span>Diferencia</span><strong id="total-difference">0,00</strong></div>
      </div>
    </section>`

  const draw = () => {
    const used = new Set([...staged.values()].flatMap((pair) => [pair.bankId, pair.bookId]))
    const available = rows.filter((row) => !used.has(row.id))
    const grid = document.querySelector('#pending-grid')!
    grid.innerHTML = available.length
      ? available.map((row) => ledgerRow(row, `data-sel="${row.id}" tabindex="0"`, [
          row.id === selectedBank || row.id === selectedBook ? 'selected' : '',
          checked && (row.id === checked.bankId || row.id === checked.bookId) ? 'matched' : '',
        ].join(' '))).join('')
      : `<tr><td colspan="12">${empty('Sin partidas pendientes', 'Importe nuevos movimientos o confirme las parejas preparadas.')}</td></tr>`
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
      node.addEventListener('click', select)
      node.addEventListener('keydown', (event) => {
        if ((event as KeyboardEvent).key === 'Enter' || (event as KeyboardEvent).key === ' ') select()
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
      button.disabled = checked.differenceCents !== 0
      bar.classList.toggle('ready', checked.differenceCents === 0)
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
    const pairs = [...staged.values()]
    grid.innerHTML = pairs.length ? pairs.map((pair, pairIndex) => {
      const bank = rows.find((row) => row.id === pair.bankId)!
      const book = rows.find((row) => row.id === pair.bookId)!
      return `${ledgerRow(book, '', 'pair-first')}<tr class="pair-second">
        ${ledgerRow(bank).replace(/^<tr[^>]*>|<\/tr>$/g, '')}
        <td class="action-col"><button class="remove-pair" data-remove="${pair.bankId}-${pair.bookId}" title="Devolver arriba">↑</button></td>
      </tr>${pairIndex < pairs.length - 1 ? '<tr class="pair-gap"><td colspan="13"></td></tr>' : ''}`
    }).join('') : `<tr><td colspan="13">${empty('Todavía no hay partidas preparadas', 'Seleccione una contrapartida arriba o ejecute la búsqueda automática.')}</td></tr>`
    document.querySelector('#staged-count')!.textContent = `${pairs.length} ${pairs.length === 1 ? 'pareja' : 'parejas'}`
    document.querySelector<HTMLButtonElement>('#confirm-all')!.disabled = pairs.length === 0
    document.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
      staged.delete((button as HTMLElement).dataset.remove!)
      draw()
    }))
    const stagedRows = rows.filter((row) => usedBy(pairs).has(row.id))
    const debits = stagedRows.reduce((sum, row) => sum + row.debitCents, 0)
    const credits = stagedRows.reduce((sum, row) => sum + row.creditCents, 0)
    document.querySelector('#total-debits')!.textContent = money(debits)
    document.querySelector('#total-credits')!.textContent = money(credits)
    document.querySelector('#total-difference')!.textContent = money(Math.abs(debits - credits))
  }

  const usedBy = (pairs: Candidate[]) => new Set(pairs.flatMap((pair) => [pair.bankId, pair.bookId]))

  document.querySelector('#stage-pair')!.addEventListener('click', () => {
    if (!checked || checked.differenceCents !== 0) return
    staged.set(`${checked.bankId}-${checked.bookId}`, checked)
    selectedBank = selectedBook = null
    checked = null
    draw()
  })
  document.querySelector('#auto-preview')!.addEventListener('click', async () => {
    const proposal = await api<Candidate[]>('/api/reconcile/preview', { method: 'POST', body: '{}' })
    proposal.forEach((pair) => staged.set(`${pair.bankId}-${pair.bookId}`, pair))
    draw()
    toast(`${proposal.length} pareja(s) preparadas. Revise antes de confirmar.`)
  })
  document.querySelector('#confirm-all')!.addEventListener('click', async () => {
    if (!confirm(`¿Confirmar ${staged.size} pareja(s)? Esta acción quedará registrada en auditoría.`)) return
    await api<{ confirmed: number }>('/api/reconcile', { method: 'POST', body: JSON.stringify({ pairs: [...staged.values()] }) })
    toast('Conciliación confirmada correctamente')
    await renderReconcile(root)
  })
  document.querySelector('#refresh')!.addEventListener('click', async () => {
    rows = await getMovements('?estado=PENDIENTE')
    draw()
  })
  draw()
}

function renderImport(root: HTMLElement) {
  root.innerHTML = `
    ${heading('Ingreso de datos', 'Importar archivos', 'Las partidas importadas quedarán pendientes. La conciliación nunca se ejecuta automáticamente.')}
    <div class="notice"><span>i</span><div><b>Importación y conciliación son pasos separados</b><p>Después de importar, vaya a Conciliar cuando desee buscar contrapartidas.</p></div></div>
    <section class="import-grid">
      <article class="panel upload-card">
        <span class="upload-icon bank">B</span><h2>Movimientos bancarios</h2><p>Listado Stellantis en TXT, CSV, XLS o XLSX.</p>
        <label class="dropzone" id="dz-txt"><input type="file" accept=".txt,.csv,.xls,.xlsx" data-origin="banco"><span>↑</span><b>Seleccione o arrastre un archivo</b><small>Máximo 15 MB</small></label>
        <div class="upload-result" data-result="banco"></div>
      </article>
      <article class="panel upload-card">
        <span class="upload-icon book">L</span><h2>Mayor contable</h2><p>Exportación Quiter en XLS, XLSX, TXT o CSV.</p>
        <label class="dropzone" id="dz-xls"><input type="file" accept=".txt,.csv,.xls,.xlsx" data-origin="libro"><span>↑</span><b>Seleccione o arrastre un archivo</b><small>Máximo 15 MB</small></label>
        <div class="upload-result" data-result="libro"></div>
      </article>
    </section>`
  document.querySelectorAll<HTMLInputElement>('input[type=file]').forEach((input) => input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    const origin = input.dataset.origin!
    const result = document.querySelector(`[data-result="${origin}"]`)!
    result.innerHTML = '<span class="mini-loader"></span> Procesando archivo…'
    const data = new FormData()
    data.append('file', file)
    try {
      const imported = await api<{ inserted: number; duplicates: number; pending: boolean }>(`/api/import/${origin}`, { method: 'POST', body: data })
      result.innerHTML = `<div class="success-result"><b>${imported.inserted} partidas nuevas</b><span>${imported.duplicates} duplicadas omitidas · Estado: pendiente</span></div>`
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
