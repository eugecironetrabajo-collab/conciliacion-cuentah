import assert from 'node:assert/strict'
import test from 'node:test'
import { filterMovements } from '../src/movement-filters.js'
import type { Movement } from '../src/types.js'

const row = (partial: Partial<Movement> & Pick<Movement, 'id'>): Movement => ({
  origin: 'BANCO',
  status: 'PENDIENTE',
  date: '2025-01-01',
  processDate: '2025-01-01',
  receipt: '',
  sector: '',
  orderNo: '',
  ref1: '',
  ref2: '',
  debitCents: 0,
  creditCents: 0,
  notes: '',
  assignee: '',
  dealer: '6',
  pairId: null,
  reconciliationId: null,
  isAdjustment: false,
  ...partial,
})

test('filterMovements respects status and amount filters', () => {
  const rows = [
    row({ id: 1, debitCents: 1000 }),
    row({ id: 2, status: 'CONCILIADO', debitCents: 5000 }),
  ]
  assert.deepEqual(filterMovements(rows, { status: 'PENDIENTE' }).map((r) => r.id), [1])
  assert.deepEqual(filterMovements(rows, { amountFrom: 2000 }).map((r) => r.id), [2])
})
