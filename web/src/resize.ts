const MIN_COL_WIDTH = 48
const AUTO_FIT_PADDING = 12

const readWidths = (key: string) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as number[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

const writeWidths = (key: string, widths: number[]) => {
  localStorage.setItem(key, JSON.stringify(widths))
}

const ensureColgroup = (table: HTMLTableElement) => {
  let colgroup = table.querySelector('colgroup')
  if (!colgroup) {
    colgroup = document.createElement('colgroup')
    const headers = table.querySelectorAll('thead th')
    headers.forEach(() => colgroup!.append(document.createElement('col')))
    table.prepend(colgroup)
  }
  return colgroup
}

const columnWidths = (table: HTMLTableElement, colgroup: HTMLElement, headers: HTMLTableCellElement[]) =>
  headers.map((header, index) => {
    const column = colgroup.children[index] as HTMLTableColElement
    const parsed = Number.parseFloat(column.style.width)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
    return Math.max(MIN_COL_WIDTH, Math.round(column.getBoundingClientRect().width || header.getBoundingClientRect().width))
  })

const syncTableWidth = (table: HTMLTableElement, widths: number[]) => {
  const total = widths.reduce((sum, width) => sum + width, 0)
  table.style.width = `${total}px`
  table.style.minWidth = `${total}px`
}

const applyWidths = (
  table: HTMLTableElement,
  colgroup: HTMLElement,
  headers: HTMLTableCellElement[],
  widths: number[],
) => {
  widths.forEach((width, index) => {
    const column = colgroup.children[index] as HTMLTableColElement
    if (column) column.style.width = `${width}px`
  })
  syncTableWidth(table, widths)
}

export const measureColumnWidth = (table: HTMLTableElement, index: number) => {
  const header = table.querySelectorAll<HTMLTableCellElement>('thead th')[index]
  let max = header?.scrollWidth ?? 0
  table.querySelectorAll<HTMLTableCellElement>(`tbody tr`).forEach((row) => {
    const cell = row.children[index] as HTMLTableCellElement | undefined
    if (cell) max = Math.max(max, cell.scrollWidth)
  })
  return Math.max(MIN_COL_WIDTH, Math.round(max + AUTO_FIT_PADDING))
}

export function applyColumnWidths(table: HTMLTableElement, storageKey: string) {
  const widths = readWidths(storageKey)
  if (!widths?.length) return
  const colgroup = ensureColgroup(table)
  const headers = [...table.querySelectorAll<HTMLTableCellElement>('thead th')]
  applyWidths(table, colgroup, headers, widths)
}

export function setupColumnResize(table: HTMLTableElement, storageKey: string) {
  const headers = [...table.querySelectorAll<HTMLTableCellElement>('thead th')]
  if (!headers.length) return
  const colgroup = ensureColgroup(table)
  const saved = readWidths(storageKey)
  const initial = saved?.length === headers.length
    ? saved
    : columnWidths(table, colgroup, headers)
  applyWidths(table, colgroup, headers, initial)
  if (!saved?.length) writeWidths(storageKey, initial)

  const persistWidths = () => {
    const widths = columnWidths(table, colgroup, headers)
    writeWidths(storageKey, widths)
  }

  headers.forEach((header, index) => {
    if (header.querySelector('.col-resize')) return
    header.style.position = 'relative'
    const handle = document.createElement('span')
    handle.className = 'col-resize'
    handle.setAttribute('role', 'separator')
    handle.setAttribute('aria-orientation', 'vertical')
    header.append(handle)

    handle.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      const startX = event.clientX
      const col = colgroup.children[index] as HTMLTableColElement
      const startWidth = columnWidths(table, colgroup, headers)[index]

      const onMove = (moveEvent: MouseEvent) => {
        const widths = columnWidths(table, colgroup, headers)
        widths[index] = Math.max(MIN_COL_WIDTH, Math.round(startWidth + moveEvent.clientX - startX))
        applyWidths(table, colgroup, headers, widths)
      }

      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        persistWidths()
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })

    handle.addEventListener('dblclick', (event) => {
      event.preventDefault()
      event.stopPropagation()
      const widths = columnWidths(table, colgroup, headers)
      widths[index] = measureColumnWidth(table, index)
      applyWidths(table, colgroup, headers, widths)
      persistWidths()
    })
  })
}

export function setupQuadrantSplitter(
  topLedger: HTMLElement,
  bottomLedger: HTMLElement,
  splitter: HTMLElement,
  storageKey: string,
  options?: { defaultTopHeight?: number; minPersistedHeight?: number },
) {
  const defaultTopHeight = options?.defaultTopHeight ?? 300
  const minPersistedHeight = options?.minPersistedHeight ?? 200
  const saved = Number(localStorage.getItem(storageKey))
  if (Number.isFinite(saved) && saved >= minPersistedHeight) topLedger.style.height = `${saved}px`
  else topLedger.style.height = `${defaultTopHeight}px`

  splitter.addEventListener('mousedown', (event) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = topLedger.getBoundingClientRect().height
    const panels = topLedger.closest('.reconcile-workspace, .reversal-workspace-panels, .modal')

    const onMove = (moveEvent: MouseEvent) => {
      const container = panels?.getBoundingClientRect()
      const bottomMin = 180
      const reserved = bottomMin + (splitter.getBoundingClientRect().height || 28) + 120
      const containerHeight = container
        ? Math.max(container.height, 480)
        : Math.round(window.innerHeight * 0.62)
      const maxTop = Math.max(minPersistedHeight, Math.round(containerHeight - reserved))
      const height = Math.min(
        maxTop,
        Math.max(minPersistedHeight, Math.round(startHeight + moveEvent.clientY - startY)),
      )
      topLedger.style.height = `${height}px`
      bottomLedger.style.minHeight = `${bottomMin}px`
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const persisted = Math.round(topLedger.getBoundingClientRect().height)
      if (persisted >= minPersistedHeight) localStorage.setItem(storageKey, String(persisted))
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })
}
