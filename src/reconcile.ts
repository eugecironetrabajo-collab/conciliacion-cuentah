import { movementLabel } from './terminals.js'
import type { Candidate, Movement } from './types.js'

export type SortKey =
  | 'id' | 'origin' | 'terminal' | 'status' | 'date' | 'processDate'
  | 'receipt' | 'sector' | 'orderNo' | 'reference' | 'reference2' | 'notes'
  | 'assignee' | 'amount' | 'debit' | 'credit'
export type SortDirection = 'asc' | 'desc'

export interface ColumnSort {
  key: SortKey
  direction: SortDirection
  column: string
}

const textCompare = (left: string, right: string) =>
  left.localeCompare(right, 'es', { sensitivity: 'base' })

export const referenceOne = (row: Pick<Movement, 'ref1' | 'ref2' | 'receipt'>) =>
  row.ref1 || row.ref2 || row.receipt || ''

export function signedAmount(row: Movement) {
  return row.debitCents - row.creditCents
}

export function rowAmountCents(row: Pick<Movement, 'origin' | 'debitCents' | 'creditCents'>) {
  if (row.origin === 'LIBRO' && row.debitCents) return Math.abs(row.debitCents)
  if (row.origin === 'BANCO' && row.creditCents) return Math.abs(row.creditCents)
  if (row.origin === 'BANCO' && row.debitCents) return Math.abs(row.debitCents)
  if (row.origin === 'LIBRO' && row.creditCents) return Math.abs(row.creditCents)
  return 0
}

export function columnAmountCents(row: Movement, column: string) {
  if (column === 'book-debit') return row.origin === 'LIBRO' ? row.debitCents : 0
  if (column === 'bank-credit') return row.origin === 'BANCO' ? row.creditCents : 0
  if (column === 'bank-debit') return row.origin === 'BANCO' ? row.debitCents : 0
  if (column === 'book-credit') return row.origin === 'LIBRO' ? row.creditCents : 0
  if (column === 'debit') return row.debitCents
  if (column === 'credit') return row.creditCents
  return rowAmountCents(row)
}

const descendingFirst = (key: SortKey) => key === 'amount' || key === 'debit' || key === 'credit'

export function nextSort(current: ColumnSort | null, key: SortKey, column: string = key): ColumnSort {
  const first: SortDirection = descendingFirst(key) ? 'desc' : 'asc'
  if (!current || current.column !== column) return { key, direction: first, column }
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc', column }
}

export function matchesConcept(notes: string, query: string) {
  const needle = query.trim().toLocaleLowerCase('es')
  if (!needle) return true
  return notes.toLocaleLowerCase('es').includes(needle)
}

const sortValue = (row: Movement, sort: ColumnSort): string | number => {
  switch (sort.key) {
    case 'id': return row.id
    case 'origin': return row.origin
    case 'terminal': return movementLabel(row.origin, row.dealer, row.sector)
    case 'status': return row.status
    case 'date': return row.date
    case 'processDate': return row.processDate
    case 'receipt': return `${row.receipt} ${row.orderNo}`.trim()
    case 'sector': return row.sector
    case 'orderNo': return row.orderNo
    case 'reference': return referenceOne(row)
    case 'reference2': return row.ref2
    case 'notes': return row.notes
    case 'assignee': return row.assignee
    case 'amount': return columnAmountCents(row, sort.column)
    case 'debit': return row.debitCents
    case 'credit': return row.creditCents
    default: return row.notes
  }
}

export function sortMovements<T extends Movement>(rows: T[], sort: ColumnSort | null) {
  if (!sort) return [...rows]
  const direction = sort.direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const left = sortValue(a, sort)
    const right = sortValue(b, sort)
    const compared = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : textCompare(String(left), String(right))
    if (compared === 0) return a.id - b.id
    return compared * direction
  })
}

export function balanceSummary(rows: Movement[]) {
  const debits = rows.reduce((sum, row) => sum + row.debitCents, 0)
  const credits = rows.reduce((sum, row) => sum + row.creditCents, 0)
  const differenceCents = debits - credits
  return {
    debits,
    credits,
    differenceCents,
    adjustmentSide: differenceCents > 0
      ? 'CREDITO_LIBRO'
      : differenceCents < 0
        ? 'DEBITO_LIBRO'
        : null,
    adjustmentCents: Math.abs(differenceCents),
  } as const
}

const dayDistance = (a: string, b: string) =>
  Math.round(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000)

const references = (row: Movement) =>
  `${row.orderNo} ${row.ref1} ${row.ref2} ${row.notes}`.toLowerCase()

const isCredit = (row: Movement) => row.creditCents > 0 && row.debitCents === 0
const isDebit = (row: Movement) => row.debitCents > 0 && row.creditCents === 0

export function isAutoPair(a: Movement, b: Movement) {
  if (a.origin === 'LIBRO' && b.origin === 'LIBRO') {
    return (isCredit(a) && isDebit(b)) || (isCredit(b) && isDebit(a))
  }
  const bank = a.origin === 'BANCO' ? a : b.origin === 'BANCO' ? b : null
  const book = a.origin === 'LIBRO' ? a : b.origin === 'LIBRO' ? b : null
  if (!bank || !book) return false
  return (isCredit(bank) && isDebit(book)) || (isDebit(bank) && isCredit(book))
}

export function candidateFor(left: Movement, right: Movement): Candidate {
  if (!isAutoPair(left, right)) {
    throw new Error('La pareja no corresponde a una conciliación automática permitida')
  }
  const differenceCents = Math.abs(signedAmount(left) + signedAmount(right))
  const days = dayDistance(left.date, right.date)
  let score = Math.max(0, 100 - Math.min(differenceCents / 100, 70) - Math.min(days * 2, 20))
  const leftRefs = references(left)
  const sharedReference = [right.orderNo, right.ref1, right.ref2]
    .filter((value) => value.length >= 3)
    .some((value) => leftRefs.includes(value.toLowerCase()))
  if (sharedReference) score = Math.min(100, score + 10)
  return {
    movementIds: [left.id, right.id],
    score: Math.round(score),
    differenceCents,
    reason: differenceCents === 0
      ? days === 0 ? 'Importe y fecha coinciden' : `Importe exacto · ${days} día(s) de diferencia`
      : `Diferencia de importe: ${differenceCents} centavos`,
  }
}

export function findCandidates(rows: Movement[]) {
  const pending = rows.filter((row) => row.status === 'PENDIENTE')
  const candidates: Candidate[] = []
  for (let index = 0; index < pending.length; index += 1) {
    for (let other = index + 1; other < pending.length; other += 1) {
      const left = pending[index]
      const right = pending[other]
      if (!left || !right || !isAutoPair(left, right)) continue
      const candidate = candidateFor(left, right)
      if (candidate.score >= 70) candidates.push(candidate)
    }
  }
  return candidates.sort((a, b) => b.score - a.score || a.differenceCents - b.differenceCents)
}

export function automaticProposal(rows: Movement[]) {
  const used = new Set<number>()
  const proposal: Candidate[] = []
  for (const candidate of findCandidates(rows)) {
    const [leftId, rightId] = candidate.movementIds
    if (used.has(leftId) || used.has(rightId)) continue
    if (candidate.differenceCents !== 0) continue
    proposal.push(candidate)
    used.add(leftId)
    used.add(rightId)
  }
  return proposal
}
