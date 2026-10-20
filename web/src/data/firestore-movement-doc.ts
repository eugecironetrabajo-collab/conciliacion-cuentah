import type { Movement, Origin, Status } from '../../../src/types.js'

export type MovementDoc = Movement & { fingerprint: string }

const str = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}
const status = (value: unknown): Status => {
  const raw = str(value)
  if (raw === 'CONCILIADO' || raw === 'ELIMINADO' || raw === 'PENDIENTE') return raw
  return 'PENDIENTE'
}
const origin = (value: unknown): Origin => (str(value) === 'BANCO' ? 'BANCO' : 'LIBRO')

/** Map a Firestore document to a movement; document ID is the canonical numeric id. */
export function movementFromFirestoreDoc(
  docId: string,
  data: Record<string, unknown>,
): MovementDoc | null {
  const id = Number(docId)
  if (!Number.isFinite(id) || String(id) !== docId.trim()) return null
  const { id: _embedded, fingerprint: fp, ...rest } = data
  const row: MovementDoc = {
    id,
    origin: origin(rest.origin),
    status: status(rest.status),
    date: str(rest.date),
    processDate: str(rest.processDate),
    receipt: str(rest.receipt),
    sector: str(rest.sector),
    orderNo: str(rest.orderNo),
    ref1: str(rest.ref1),
    ref2: str(rest.ref2),
    debitCents: num(rest.debitCents),
    creditCents: num(rest.creditCents),
    notes: str(rest.notes),
    assignee: str(rest.assignee),
    dealer: str(rest.dealer) || '6',
    pairId: rest.pairId === null || rest.pairId === undefined ? null : num(rest.pairId),
    reconciliationId: rest.reconciliationId === null || rest.reconciliationId === undefined
      ? null
      : num(rest.reconciliationId),
    isAdjustment: Boolean(rest.isAdjustment),
    fingerprint: str(fp),
  }
  return row
}

export function movementsFromFirestoreDocs(
  docs: Array<{ id: string; data: () => Record<string, unknown> }>,
): MovementDoc[] {
  const rows: MovementDoc[] = []
  for (const d of docs) {
    const row = movementFromFirestoreDoc(d.id, d.data())
    if (row) rows.push(row)
  }
  return rows
}
