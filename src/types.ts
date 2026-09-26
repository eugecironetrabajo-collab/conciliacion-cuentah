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
