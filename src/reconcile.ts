import type { Candidate, Movement } from './types.js'

export type SortKey = 'date' | 'processDate' | 'amount' | 'notes'
export type SortDirection = 'asc' | 'desc'

export interface ColumnSort {
  key: SortKey
  direction: SortDirection
  column: string
}

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

export function nextSort(current: ColumnSort | null, key: SortKey, column: string = key): ColumnSort {
  const first: SortDirection = key === 'amount' ? 'desc' : 'asc'
  if (!current || current.column !== column) return { key, direction: first, column }
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc', column }
}

export function matchesConcept(notes: string, query: string) {
  const needle = query.trim().toLocaleLowerCase('es')
  if (!needle) return true
  return notes.toLocaleLowerCase('es').includes(needle)
}

export function sortMovements<T extends Movement>(rows: T[], sort: ColumnSort | null) {
  if (!sort) return [...rows]
  const direction = sort.direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    let compared = 0
    if (sort.key === 'date') compared = a.date.localeCompare(b.date)
    else if (sort.key === 'processDate') compared = a.processDate.localeCompare(b.processDate)
    else if (sort.key === 'amount') compared = rowAmountCents(a) - rowAmountCents(b)
    else compared = a.notes.localeCompare(b.notes, 'es', { sensitivity: 'base' })
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

export function candidateFor(bank: Movement, book: Movement): Candidate {
  if (bank.origin !== 'BANCO' || book.origin !== 'LIBRO') {
    throw new Error('La pareja debe contener una partida bancaria y una contable')
  }
  const differenceCents = Math.abs(signedAmount(bank) + signedAmount(book))
  const days = dayDistance(bank.date, book.date)
  let score = Math.max(0, 100 - Math.min(differenceCents / 100, 70) - Math.min(days * 2, 20))
  const bankRefs = references(bank)
  const sharedReference = [book.orderNo, book.ref1, book.ref2]
    .filter((value) => value.length >= 3)
    .some((value) => bankRefs.includes(value.toLowerCase()))
  if (sharedReference) score = Math.min(100, score + 10)
  return {
    bankId: bank.id,
    bookId: book.id,
    score: Math.round(score),
    differenceCents,
    reason: differenceCents === 0
      ? days === 0 ? 'Importe y fecha coinciden' : `Importe exacto · ${days} día(s) de diferencia`
      : `Diferencia de importe: ${differenceCents} centavos`,
  }
}

export function findCandidates(rows: Movement[]) {
  const banks = rows.filter((row) => row.origin === 'BANCO' && row.status === 'PENDIENTE')
  const books = rows.filter((row) => row.origin === 'LIBRO' && row.status === 'PENDIENTE')
  return banks
    .flatMap((bank) => books.map((book) => candidateFor(bank, book)))
    .filter((candidate) => candidate.score >= 70)
    .sort((a, b) => b.score - a.score || a.differenceCents - b.differenceCents)
}

export function automaticProposal(rows: Movement[]) {
  const usedBanks = new Set<number>()
  const usedBooks = new Set<number>()
  const proposal: Candidate[] = []
  for (const candidate of findCandidates(rows)) {
    if (usedBanks.has(candidate.bankId) || usedBooks.has(candidate.bookId)) continue
    if (candidate.differenceCents !== 0) continue
    proposal.push(candidate)
    usedBanks.add(candidate.bankId)
    usedBooks.add(candidate.bookId)
  }
  return proposal
}
