export type Origin = 'BANCO' | 'LIBRO'
export type Status = 'PENDIENTE' | 'CONCILIADO' | 'ELIMINADO'

export interface Movement {
  id: number
  origin: Origin
  status: Status
  date: string
  processDate: string
  receipt: string
  sector: string
  orderNo: string
  ref1: string
  ref2: string
  debitCents: number
  creditCents: number
  notes: string
  dealer: string
  pairId: number | null
  reconciliationId: number | null
  isAdjustment: boolean
}

export interface Candidate {
  bankId: number
  bookId: number
  score: number
  differenceCents: number
  reason: string
}

export interface ImportRow {
  origin: Origin
  date: string
  processDate?: string
  receipt?: string
  sector?: string
  orderNo?: string
  ref1?: string
  ref2?: string
  debitCents?: number
  creditCents?: number
  notes?: string
  dealer?: string
}

export interface AdjustmentInput {
  reason: string
  date?: string
  receipt?: string
  sector?: string
  orderNo?: string
  ref1?: string
  ref2?: string
}

export interface ReconciliationRecord {
  id: number
  status: 'ACTIVA' | 'REVERTIDA'
  mode: 'MANUAL' | 'AUTOMATICA'
  adjustmentCents: number
  adjustmentReason: string
  createdAt: string
  reversedAt: string | null
  reversalReason: string
  movements: Movement[]
}
