import assert from 'node:assert/strict'
import test from 'node:test'
import { automaticProposal, candidateFor } from '../src/reconcile.js'
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
