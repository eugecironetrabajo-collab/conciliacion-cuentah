import assert from 'node:assert/strict'
import test from 'node:test'
import { loadDate } from '../src/load-date.js'
import { movementValues } from '../web/src/data/import-batches.js'

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
