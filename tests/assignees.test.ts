import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

test('assignee updates persist for pending movements only', async () => {
  process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'cuenta-h-')), 'conciliacion.db')
  const db = await import('../src/db.js')
  db.importBatches([
    { name: 'b.txt', rows: [{ origin: 'BANCO' as const, date: '2026-09-10', debitCents: 100, dealer: '1337', notes: 'Banco responsable', fingerprint: 'assignee-bank' }] },
    { name: 'l.xls', rows: [{ origin: 'LIBRO' as const, date: '2026-09-10', creditCents: 100, sector: '211112001001', notes: 'Libro responsable', fingerprint: 'assignee-libro' }] },
  ])
  const pending = db.listMovements({ status: 'PENDIENTE' })
  const bank = pending.find((item) => item.notes === 'Banco responsable')
  const book = pending.find((item) => item.notes === 'Libro responsable')
  if (!bank || !book) throw new Error('No se cargaron las partidas de prueba')

  const updated = db.updateMovementAssignee(book.id, 'Pend Bru')
  assert.equal(updated?.assignee, 'Pend Bru')
  assert.equal(db.listMovements({ status: 'PENDIENTE' }).find((item) => item.id === book.id)?.assignee, 'Pend Bru')

  db.confirmReconciliation([bank.id, book.id], undefined)
  assert.throws(() => db.updateMovementAssignee(book.id, 'Pend Miche'), /pendientes/)
})
