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

test('status summary can filter pending balances by dealer code', async () => {
  process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'cuenta-h-')), 'conciliacion.db')
  const db = await import('../src/db.js')
  const beforeAll = db.statusSummary().statement
  const before1337 = db.statusSummary({ dealer: '1337' }).statement
  const before3550 = db.statusSummary({ dealer: '3550' }).statement

  db.importBatches([
    { name: 'b1337.txt', rows: [{ origin: 'BANCO' as const, date: '2026-09-02', debitCents: 100, dealer: '1337', orderNo: '9001337', receipt: 'ST', notes: 'Banco 1337', fingerprint: 'saldo-1337' }] },
    { name: 'b3550.txt', rows: [{ origin: 'BANCO' as const, date: '2026-09-02', debitCents: 250, dealer: '3550', orderNo: '9003550', receipt: 'ST', notes: 'Banco 3550', fingerprint: 'saldo-3550' }] },
    { name: 'l.xls', rows: [{ origin: 'LIBRO' as const, date: '2026-09-02', creditCents: 40, dealer: '1337,3550', sector: '211112002001', notes: 'Libro compartido', fingerprint: 'saldo-compartido' }] },
  ])

  const all = db.statusSummary().statement
  const only1337 = db.statusSummary({ dealer: '1337' }).statement
  const only3550 = db.statusSummary({ dealer: '3550' }).statement

  assert.equal(all.bankDebits - beforeAll.bankDebits, 350)
  assert.equal(all.bookCredits - beforeAll.bookCredits, 40)
  assert.equal(only1337.bankDebits - before1337.bankDebits, 100)
  assert.equal(only1337.bookCredits - before1337.bookCredits, 40)
  assert.equal(only3550.bankDebits - before3550.bankDebits, 250)
  assert.equal(only3550.bookCredits - before3550.bookCredits, 40)
})

test('reconciled movements do not affect pending balances', async () => {
  process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'cuenta-h-')), 'conciliacion.db')
  const db = await import('../src/db.js')
  const before = db.statusSummary().statement
  db.importBatches([
    { name: 'b.txt', rows: [{ origin: 'BANCO' as const, date: '2026-09-01', debitCents: 100, dealer: '1337', orderNo: '9000100', receipt: 'ST', notes: 'Banco saldo', fingerprint: 'saldo-banco' }] },
    { name: 'l.xls', rows: [{ origin: 'LIBRO' as const, date: '2026-09-01', creditCents: 100, sector: '211112001001', notes: 'Libro saldo', fingerprint: 'saldo-libro' }] },
  ])
  const pending = db.listMovements({ status: 'PENDIENTE' })
  const bank = pending.find((row) => row.notes === 'Banco saldo')
  const book = pending.find((row) => row.notes === 'Libro saldo')
  if (!bank || !book) throw new Error('No se cargaron las partidas de saldo')
  const afterImport = db.statusSummary().statement
  assert.equal(afterImport.bankDebits - before.bankDebits, 100)
  assert.equal(afterImport.bookCredits - before.bookCredits, 100)

  db.confirmReconciliation([bank.id, book.id], undefined)
  const afterReconcile = db.statusSummary().statement
  assert.equal(afterReconcile.bankDebits, before.bankDebits)
  assert.equal(afterReconcile.bookCredits, before.bookCredits)
})
