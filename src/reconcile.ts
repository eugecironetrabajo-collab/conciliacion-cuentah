import type { Candidate, Movement } from './types.js'

export function signedAmount(row: Movement) {
  return row.debitCents - row.creditCents
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
