import assert from 'node:assert/strict'
import test from 'node:test'
import { loadDate } from '../src/load-date.js'
import { bookFingerprint } from '../src/terminals.js'
import type { MovementDoc } from '../web/src/data/firestore-movement-doc.js'
import { importRowsIntoState, movementValues } from '../web/src/data/import-batches.js'

const sampleLibroRow = {
  origin: 'LIBRO' as const,
  date: '2026-10-09',
  receipt: 'AFACTURA',
  sector: '211112001001',
  orderNo: '',
  ref1: '85017',
  ref2: '18827892/1',
  debitCents: 0,
  creditCents: 283_114_961,
  notes: 'Doc. AFACTURA 85017 SO1 00208-00126248 MATERIAL',
  dealer: '1337',
  fingerprint: bookFingerprint(
    '2026-10-09',
    '85017',
    '18827892/1',
    0,
    283_114_961,
    'Doc. AFACTURA 85017 SO1 00208-00126248 MATERIAL',
    '1337',
    '211112001001',
  ),
}

test('libro reimport ignores volatile L-date prefix in concept', () => {
  const firstRow = {
    ...sampleLibroRow,
    notes: 'L-16/10/2026-Doc. AFACTURA 85017 SO1 00208-00126248 MATERIAL',
    fingerprint: bookFingerprint(
      sampleLibroRow.date,
      sampleLibroRow.ref1,
      sampleLibroRow.ref2,
      0,
      sampleLibroRow.creditCents,
      'L-16/10/2026-Doc. AFACTURA 85017 SO1 00208-00126248 MATERIAL',
      '1337',
      sampleLibroRow.sector,
    ),
  }
  const secondRow = {
    ...sampleLibroRow,
    notes: 'L-20/10/2026-Doc. AFACTURA 85017 SO1 00208-00126248 MATERIAL',
    fingerprint: bookFingerprint(
      sampleLibroRow.date,
      sampleLibroRow.ref1,
      sampleLibroRow.ref2,
      0,
      sampleLibroRow.creditCents,
      'L-20/10/2026-Doc. AFACTURA 85017 SO1 00208-00126248 MATERIAL',
      '1337',
      sampleLibroRow.sector,
    ),
  }
  const first = importRowsIntoState([], [{ name: 'quiter.xls', rows: [firstRow] }])
  const second = importRowsIntoState(first.movements, [{ name: 'quiter.xls', rows: [secondRow] }])
  assert.equal(second.results[0]?.inserted, 0)
  assert.equal(second.results[0]?.duplicates, 1)
  assert.equal(second.movements.length, 1)
})

test('reimporting libro rows is idempotent', () => {
  const first = importRowsIntoState([], [{ name: 'quiter.xls', rows: [sampleLibroRow] }])
  assert.equal(first.results[0]?.inserted, 1)
  assert.equal(first.movements.length, 1)
  const second = importRowsIntoState(first.movements, [{ name: 'quiter.xls', rows: [sampleLibroRow] }])
  assert.equal(second.results[0]?.inserted, 0)
  assert.equal(second.results[0]?.duplicates, 1)
  assert.equal(second.movements.length, 1)
})

test('legacy stored fingerprint still dedupes libro reimport by business fields', () => {
  const legacyFingerprint = JSON.stringify([
    'LIBRO',
    sampleLibroRow.date,
    sampleLibroRow.date,
    sampleLibroRow.receipt,
    sampleLibroRow.orderNo,
    sampleLibroRow.ref1,
    sampleLibroRow.ref2,
    sampleLibroRow.debitCents,
    sampleLibroRow.creditCents,
    sampleLibroRow.notes,
    sampleLibroRow.dealer,
  ])
  const existing: MovementDoc = {
    id: 6,
    origin: 'LIBRO',
    status: 'CONCILIADO',
    date: sampleLibroRow.date,
    processDate: '2026-10-16',
    receipt: sampleLibroRow.receipt ?? '',
    sector: sampleLibroRow.sector ?? '',
    orderNo: sampleLibroRow.orderNo ?? '',
    ref1: sampleLibroRow.ref1 ?? '',
    ref2: sampleLibroRow.ref2 ?? '',
    debitCents: sampleLibroRow.debitCents ?? 0,
    creditCents: sampleLibroRow.creditCents ?? 0,
    notes: sampleLibroRow.notes ?? '',
    assignee: '',
    dealer: sampleLibroRow.dealer ?? '6',
    pairId: null,
    reconciliationId: 9,
    isAdjustment: false,
    fingerprint: legacyFingerprint,
  }
  const { results, movements } = importRowsIntoState([existing], [{ name: 'quiter.xls', rows: [sampleLibroRow] }])
  assert.equal(results[0]?.inserted, 0)
  assert.equal(results[0]?.duplicates, 1)
  assert.equal(movements.length, 1)
})

test('movementValues sets processDate to load day, not movement date from file', () => {
  const values = movementValues({
    origin: 'LIBRO',
    date: '2020-01-15',
    processDate: '2020-01-15',
    receipt: 'VCL',
    debitCents: 100,
  })
  assert.equal(values.processDate, loadDate())
  assert.equal(values.date, '2020-01-15')
  assert.notEqual(values.processDate, values.date)
})
