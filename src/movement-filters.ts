import type { Movement } from './types.js'

export type MovementListFilters = {
  status?: string
  origin?: string
  dealer?: string
  from?: string
  to?: string
  processFrom?: string
  processTo?: string
  sector?: string
  orderNo?: string
  receipt?: string
  ref1?: string
  ref2?: string
  sign?: string
  amountFrom?: number
  amountTo?: number
}

const movementAmount = (row: Movement) =>
  Math.max(row.debitCents, row.creditCents)

export function filterMovements(rows: Movement[], filters: MovementListFilters = {}) {
  let result = [...rows]
  if (filters.status === 'NINGUNO') return []
  if (filters.status && filters.status !== 'TODOS') {
    const statuses = filters.status.split(',').map((s) => s.trim()).filter((s) =>
      s === 'PENDIENTE' || s === 'CONCILIADO' || s === 'ELIMINADO',
    )
    if (!statuses.length) return []
    result = result.filter((row) => statuses.includes(row.status))
  }
  if (filters.origin && filters.origin !== 'TODOS') {
    result = result.filter((row) => row.origin === filters.origin)
  }
  if (filters.dealer) {
    const needle = `,${filters.dealer},`
    result = result.filter((row) => `,${row.dealer},`.includes(needle))
  }
  if (filters.from) result = result.filter((row) => row.date >= filters.from!)
  if (filters.to) result = result.filter((row) => row.date <= filters.to!)
  if (filters.processFrom) result = result.filter((row) => row.processDate >= filters.processFrom!)
  if (filters.processTo) result = result.filter((row) => row.processDate <= filters.processTo!)
  if (filters.sector) result = result.filter((row) => row.sector === filters.sector)
  if (filters.orderNo) {
    const like = filters.orderNo.toLowerCase()
    result = result.filter((row) => row.orderNo.toLowerCase().includes(like))
  }
  if (filters.receipt) {
    const like = filters.receipt.replace(/\s+/g, '').toUpperCase()
    result = result.filter((row) =>
      `${row.receipt}${row.orderNo}`.replace(/\s+/g, '').toUpperCase().includes(like),
    )
  }
  if (filters.ref1) {
    const like = filters.ref1.toLowerCase()
    result = result.filter((row) => row.ref1.toLowerCase().includes(like))
  }
  if (filters.ref2) {
    const like = filters.ref2.toLowerCase()
    result = result.filter((row) => row.ref2.toLowerCase().includes(like))
  }
  if (filters.sign === 'DEBITO') result = result.filter((row) => row.debitCents > 0)
  if (filters.sign === 'CREDITO') result = result.filter((row) => row.creditCents > 0)
  if (filters.amountFrom !== undefined) {
    result = result.filter((row) => movementAmount(row) >= filters.amountFrom!)
  }
  if (filters.amountTo !== undefined) {
    result = result.filter((row) => movementAmount(row) <= filters.amountTo!)
  }
  return result.sort((a, b) =>
    a.date.localeCompare(b.date) || a.processDate.localeCompare(b.processDate) || a.id - b.id,
  )
}

export function parseMovementQuery(search: string): MovementListFilters {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const cents = (key: string) => {
    const raw = params.get(key)
    if (!raw) return undefined
    const normalized = raw.replace(/\./g, '').replace(',', '.')
    const number = Number.parseFloat(normalized)
    return Number.isFinite(number) ? Math.round(number * 100) : undefined
  }
  return {
    status: params.get('estado') ?? undefined,
    origin: params.get('origen') ?? undefined,
    dealer: params.get('dealer') ?? undefined,
    from: params.get('desde') ?? undefined,
    to: params.get('hasta') ?? undefined,
    processFrom: params.get('procesoDesde') ?? undefined,
    processTo: params.get('procesoHasta') ?? undefined,
    sector: params.get('sector') ?? undefined,
    orderNo: params.get('orden') ?? undefined,
    receipt: params.get('comprobante') ?? undefined,
    ref1: params.get('ref1') ?? undefined,
    ref2: params.get('ref2') ?? undefined,
    sign: params.get('signo') ?? undefined,
    amountFrom: cents('importeDesde'),
    amountTo: cents('importeHasta'),
  }
}
