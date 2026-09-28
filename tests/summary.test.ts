import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

test('balances stay split and receipt or amount filters match partial values', async () => {
  process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'cuenta-h-')), 'conciliacion.db')
  const db = await import('../src/db.js')
  const before = db.statusSummary().statement
  const row = {
    origin: 'LIBRO' as const,
    date: '2026-09-01',
    receipt: 'AB',
    orderNo: '000104657572',
    creditCents: -175_274_173,
    notes: 'Haber negativo',
    dealer: '6',
    fingerprint: 'parcial-7572',
  }
  const imported = db.importBatches([{ name: 'quiter.xls', rows: [row] }])
  assert.equal(imported[0]?.inserted, 1)
  const byDigits = db.listMovements({ receipt: '7572' })
  assert.equal(byDigits.length, 1)
  assert.equal(byDigits[0]?.orderNo, '000104657572')
  assert.equal(byDigits[0]?.processDate, db.loadDate())
  assert.notEqual(byDigits[0]?.processDate, byDigits[0]?.date)
  assert.equal(db.listMovements({ receipt: 'AB 000104657572' }).length, 1)
  assert.equal(db.listMovements({ amountFrom: 175_274_173, amountTo: 175_274_173 }).some((item) => item.orderNo === row.orderNo), true)

  const after = db.statusSummary().statement
  assert.equal(after.bookCredits - before.bookCredits, -175_274_173)
  assert.equal(after.bookCreditCount - before.bookCreditCount, 1)
  assert.equal(after.bankDebits, before.bankDebits)
  assert.equal(after.bankCredits, before.bankCredits)
  assert.equal(after.bookBalance, before.bookBalance + 175_274_173)

  const stored = byDigits[0]
  if (!stored) throw new Error('No se guardó el comprobante')
  db.deleteMovements([stored.id], 'Fuera del saldo')
  const withoutDeleted = db.statusSummary().statement
  assert.equal(withoutDeleted.bookCredits, before.bookCredits)
  db.restoreMovements([stored.id])
  const repeated = db.importBatches([{ name: 'quiter-otra.xls', rows: [row] }])
  assert.equal(repeated[0]?.inserted, 0)
  assert.equal(db.getMovements([stored.id])[0]?.processDate, stored.processDate)
})
