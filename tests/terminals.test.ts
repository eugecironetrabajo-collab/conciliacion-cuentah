import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import * as XLSX from 'xlsx'
import { parseBookFile } from '../src/importers.js'
import { bookTerminal, movementLabel, normalizeBookAmounts } from '../src/terminals.js'

const workbook = (rows: unknown[][]) => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Emp', 'Cuenta mayor', 'Titulo de la cuenta', 'Cta.pers.', 'Nombre', 'Referencia', 'Fecha', 'Concepto del apunte', 'Nro.docum', 'Mon', 'Debe', 'Haber'],
    ...rows,
  ])
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Informe')
  return XLSX.write(book, { type: 'buffer', bookType: 'biff8' }) as Buffer
}

const line = (account: string, concept: string, debit: number | string = '', credit: number | string = '') =>
  ['1', account, 'H', '6', 'PEUGEOT', '1/1', 46266, concept, '1', 'ARS', debit, credit]

test('book terminals follow the account ending and bonuses can be shared', () => {
  assert.equal(bookTerminal('211112001001', 'Factura').dealer, '1337')
  assert.equal(bookTerminal('211112011001', 'Factura').dealer, '3550')
  assert.equal(bookTerminal('211112011007', 'Factura').dealer, '3847')
  assert.equal(bookTerminal('211112002001', 'Doc. ANC 4714').dealer, '1337,3550')
  assert.equal(bookTerminal('211112002001', 'DEBITO CUENTA H 3550').dealer, '3550')
  assert.equal(bookTerminal('211112006007', 'AFACTURA consultoria').dealer, '3831')
  assert.equal(bookTerminal('211112006007', 'BONIF.VOLUMEN AC').dealer, '3831,3847')
  assert.equal(bookTerminal('211112006001', 'Movimiento').skip, true)
  assert.deepEqual(normalizeBookAmounts(0, -175_274_173), { debitCents: 175_274_173, creditCents: 0 })
  assert.deepEqual(normalizeBookAmounts(-50, 20), { debitCents: 0, creditCents: 70 })
  assert.equal(movementLabel('BANCO', '1337', '41110100'), '1337 · Peugeot Pergamino')
  assert.equal(movementLabel('LIBRO', '3831', '211112006007'), '006007 · Citroën San Nicolás')
  assert.equal(movementLabel('LIBRO', '3831,3847', '211112006007'), '006007 · Citroën San Nicolás')
  assert.equal(movementLabel('LIBRO', '1337,3550', '211112002001'), '002001 · Peugeot Junín')
  assert.equal(movementLabel('LIBRO', '3847', '211112011007'), '011007 · Citroën Trelew')
})

test('ignored account endings are reported and not imported', () => {
  const parsed = parseBookFile(workbook([
    line('211112001001', 'Doc. AFACTURA 10', '', 100),
    line('211112006001', 'Doc. AFACTURA 11', 80, ''),
    line('211112013007', 'Doc. ANC 12', '', 40),
  ]), 'mayor.xls')
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0]?.dealer, '1337')
  assert.equal(parsed.errors.length, 2)
  assert.match(parsed.errors[0] ?? '', /006001/)
})

test('combined statuses and permanent deletion keep reconciled movements', async () => {
  process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'cuenta-h-')), 'conciliacion.db')
  const db = await import('../src/db.js')
  const bank = db.importBatches([{ name: 'b.txt', rows: [{ origin: 'BANCO' as const, date: '2026-09-01', debitCents: 100, dealer: '1337', notes: 'Banco', fingerprint: 'banco-purge' }] }])
  const book = db.importBatches([{ name: 'l.xls', rows: [{ origin: 'LIBRO' as const, date: '2026-09-01', creditCents: 100, sector: '211112001001', dealer: '6', notes: 'Libro', fingerprint: 'libro-purge' }] }])
  assert.equal(bank[0]?.inserted, 1)
  assert.equal(book[0]?.inserted, 1)
  const pending = db.listMovements({ status: 'PENDIENTE' })
  const removed = pending.find((row) => row.notes === 'Banco')
  const kept = pending.find((row) => row.notes === 'Libro')
  if (!removed || !kept) throw new Error('No se cargaron las partidas de prueba')
  db.deleteMovements([removed.id], 'Sobra')
  const visible = db.listMovements({ status: 'PENDIENTE,ELIMINADO' })
  assert.equal(visible.some((row) => row.id === removed.id), true)
  assert.equal(db.listMovements({ status: 'NINGUNO' }).length, 0)
  assert.equal(db.listMovements({ dealer: '1337' }).some((row) => row.id === removed.id), true)
  db.purgeMovements([removed.id])
  assert.equal(db.getMovements([removed.id]).length, 0)
  db.importBatches([{ name: 'b2.txt', rows: [{ origin: 'BANCO' as const, date: '2026-09-02', creditCents: 40, dealer: '3550', notes: 'Parcial', fingerprint: 'banco-parcial' }] }])
  const partial = db.listMovements({ status: 'PENDIENTE' }).find((row) => row.notes === 'Parcial')
  if (!partial) throw new Error('No se cargó la partida parcial')
  const reconciliation = db.confirmReconciliation([kept.id, partial.id], { reason: 'Diferencia' })
  assert.ok(reconciliation.reconciliationId)
  db.reverseReconciliation(reconciliation.reconciliationId, 'Prueba')
  db.deleteMovements([kept.id], 'Ya revertida')
  assert.equal(db.purgeMovements([kept.id]).deleted, 1)
  assert.equal(db.getMovements([kept.id]).length, 0)

  const activeBank = db.listMovements({ status: 'PENDIENTE' }).find((row) => row.notes === 'Parcial')
  const activeBook = db.importBatches([{ name: 'l2.xls', rows: [{ origin: 'LIBRO' as const, date: '2026-09-03', debitCents: 40, sector: '211112011001', notes: 'Activa', fingerprint: 'libro-activa' }] }])
  assert.equal(activeBook[0]?.inserted, 1)
  const active = db.listMovements({ status: 'PENDIENTE' }).find((row) => row.notes === 'Activa')
  if (!activeBank || !active) throw new Error('No quedaron partidas para la conciliación activa')
  const activeGroup = db.confirmReconciliation([activeBank.id, active.id], undefined)
  db.db.prepare(`UPDATE movements SET status = 'ELIMINADO' WHERE id = ?`).run(active.id)
  assert.throws(() => db.purgeMovements([active.id]), /conciliación activa/)
  assert.equal(db.getReconciliation(activeGroup.reconciliationId)?.status, 'ACTIVA')
})
