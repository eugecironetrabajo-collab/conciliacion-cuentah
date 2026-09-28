import assert from 'node:assert/strict'
import test from 'node:test'
import { automaticProposal, balanceSummary, candidateFor, matchesConcept, nextSort, rowAmountCents, sortMovements } from '../src/reconcile.js'
import { parseAmount, parseText } from '../src/importers.js'
import type { Movement } from '../src/types.js'

const movement = (values: Partial<Movement> & Pick<Movement, 'id' | 'origin'>): Movement => ({
  status: 'PENDIENTE',
  date: '2025-12-01',
  processDate: '2025-12-01',
  receipt: 'VDL',
  sector: '',
  orderNo: '',
  ref1: '',
  ref2: '',
  debitCents: 0,
  creditCents: 0,
  notes: '',
  dealer: '6',
  pairId: null,
  ...values,
  reconciliationId: values.reconciliationId ?? null,
  isAdjustment: values.isAdjustment ?? false,
})

test('opposing exact amounts are compatible', () => {
  const bank = movement({ id: 1, origin: 'BANCO', creditCents: 1176903 })
  const book = movement({ id: 2, origin: 'LIBRO', debitCents: 1176903 })
  const candidate = candidateFor(bank, book)
  assert.equal(candidate.differenceCents, 0)
  assert.equal(candidate.score, 100)
})

test('automatic proposal never reuses a movement', () => {
  const rows = [
    movement({ id: 1, origin: 'BANCO', debitCents: 10000 }),
    movement({ id: 2, origin: 'BANCO', debitCents: 10000 }),
    movement({ id: 3, origin: 'LIBRO', creditCents: 10000 }),
  ]
  const proposal = automaticProposal(rows)
  assert.equal(proposal.length, 1)
  assert.equal(proposal[0].bookId, 3)
})

test('1:N reconciliation creates a credit-book adjustment when debits are greater', () => {
  const rows = [
    movement({ id: 1, origin: 'BANCO', debitCents: 60_000 }),
    movement({ id: 2, origin: 'BANCO', debitCents: 40_000 }),
    movement({ id: 3, origin: 'LIBRO', creditCents: 90_000 }),
  ]
  assert.deepEqual(balanceSummary(rows), {
    debits: 100_000,
    credits: 90_000,
    differenceCents: 10_000,
    adjustmentSide: 'CREDITO_LIBRO',
    adjustmentCents: 10_000,
  })
})

test('N:1 reconciliation creates a debit-book adjustment when credits are greater', () => {
  const rows = [
    movement({ id: 1, origin: 'BANCO', creditCents: 70_000 }),
    movement({ id: 2, origin: 'LIBRO', debitCents: 30_000 }),
    movement({ id: 3, origin: 'LIBRO', debitCents: 35_000 }),
  ]
  assert.equal(balanceSummary(rows).adjustmentSide, 'DEBITO_LIBRO')
  assert.equal(balanceSummary(rows).adjustmentCents, 5_000)
})

test('amount sort reads every column as one value, largest first', () => {
  const rows = [
    movement({ id: 1, origin: 'BANCO', debitCents: 2_000 }),
    movement({ id: 2, origin: 'BANCO', creditCents: 1_500 }),
    movement({ id: 3, origin: 'LIBRO', debitCents: 1_800 }),
  ]
  assert.deepEqual(rows.map(rowAmountCents), [2_000, 1_500, 1_800])
  const largestFirst = nextSort(null, 'amount', 'bank-debit')
  assert.equal(largestFirst.direction, 'desc')
  assert.deepEqual(sortMovements(rows, largestFirst).map((row) => row.id), [1, 3, 2])
  const smallestFirst = nextSort(largestFirst, 'amount', 'bank-debit')
  assert.equal(smallestFirst.direction, 'asc')
  assert.deepEqual(sortMovements(rows, smallestFirst).map((row) => row.id), [2, 3, 1])
  const otherAmountColumn = nextSort(smallestFirst, 'amount', 'book-debit')
  assert.equal(otherAmountColumn.direction, 'desc')
})

test('date sort starts oldest first and concept sort starts A to Z', () => {
  const rows = [
    movement({ id: 1, origin: 'LIBRO', date: '2026-03-02', processDate: '2026-09-20', notes: 'COMP PP lote 2' }),
    movement({ id: 2, origin: 'BANCO', date: '2026-01-15', processDate: '2026-09-01', notes: 'otro' }),
    movement({ id: 3, origin: 'LIBRO', date: '2026-01-15', processDate: '2026-09-28', notes: 'comp pp adelanto' }),
  ]
  const oldest = nextSort(null, 'date', 'date')
  assert.deepEqual(sortMovements(rows, oldest).map((row) => row.id), [2, 3, 1])
  const newest = nextSort(oldest, 'date', 'date')
  assert.deepEqual(sortMovements(rows, newest).map((row) => row.id), [1, 2, 3])
  const processOldest = nextSort(null, 'processDate', 'processDate')
  assert.deepEqual(sortMovements(rows, processOldest).map((row) => row.id), [2, 1, 3])
  const alphabetical = nextSort(null, 'notes', 'notes')
  assert.equal(alphabetical.direction, 'asc')
  assert.deepEqual(sortMovements(rows, alphabetical).map((row) => row.id), [3, 1, 2])
  assert.deepEqual(sortMovements(rows, nextSort(alphabetical, 'notes', 'notes')).map((row) => row.id), [2, 1, 3])
})

test('concept search matches observaciones without hiding a different case', () => {
  assert.equal(matchesConcept('COMP PP 1337', 'comp pp'), true)
  assert.equal(matchesConcept('Pago proveedores', 'comp pp'), false)
  assert.equal(matchesConcept('Comp Pp parcial', '  COMP PP '), true)
  assert.equal(matchesConcept('sin concepto', ''), true)
})

test('Argentine formatted amounts are converted to cents', () => {
  assert.equal(parseAmount('58.814,32'), 5_881_432)
  assert.equal(parseAmount('11769.03'), 1_176_903)
})

test('text import maps ledger aliases without reconciling', () => {
  const content = Buffer.from('Fecha;Comprobante;Orden;Débitos Bancos;Observaciones\n01/12/2025;VDB;3365;58.814,32;Prueba')
  const rows = parseText(content, 'BANCO')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].date, '2025-12-01')
  assert.equal(rows[0].debitCents, 5_881_432)
  assert.equal(rows[0].origin, 'BANCO')
})
