import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import * as XLSX from 'xlsx'
import { parseBankFile, parseBookFile } from '../src/importers.js'

const put = (chars: string[], start: number, value: string) => {
  ;[...value].forEach((character, index) => { chars[start + index] = character })
}

const fixedLine = (documentNo: string, description: string) => {
  const chars = Array.from({ length: 207 }, () => ' ')
  put(chars, 0, '41110100')
  put(chars, 10, 'H')
  put(chars, 33, documentNo)
  put(chars, 47, 'DA')
  put(chars, 54, description)
  put(chars, 120, '00000098058,81')
  put(chars, 136, '00000000000,00')
  put(chars, 193, '251128')
  return chars.join('')
}

test('fixed-width bank files keep one copy and decode Windows-1252', () => {
  const text = [
    'PEUGEOT'.padEnd(174, ' '),
    'Tot Cliente ARP1337',
    fixedLine('001600096137', 'CISA - FLETE NIÑO'),
    fixedLine('001600096137', 'CISA - FLETE NIÑO'),
    fixedLine('001900225461', 'Digital dealer'),
    '                                                    ** Tot. Cuenta 41110100',
  ].join('\r\n')
  const buffer = Buffer.from(text, 'latin1')
  const parsed = parseBankFile(buffer, '1-No compensados 1337.txt')
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.duplicatesInFile, 1)
  assert.equal(parsed.errors.length, 0)
  const first = parsed.rows[0]
  if (!first) throw new Error('No se importó la partida bancaria')
  assert.equal(first.date, '2025-11-28')
  assert.equal(first.debitCents, 9_805_881)
  assert.equal(first.creditCents, 0)
  assert.equal(first.receipt, 'DA')
  assert.equal(first.orderNo, '001600096137')
  assert.equal(first.dealer, '1337')
  assert.match(first.notes ?? '', /NIÑO/)
})

test('Quiter workbook skips structural rows and preserves signed amounts', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Emp', 'Cuenta mayor', 'Titulo de la cuenta', 'Cta.pers.', 'Nombre', 'Referencia', 'Fecha', 'Concepto del apunte', 'Nro.docum', 'Mon', 'Debe', 'Haber', 'Saldo', 'Sig', ' ', 'Usuario'],
    ['1', '211112', 'H', '6', '', '', 46266, 'Saldos anteriores', '', '', '', '', '', 'D', '', ''],
    ['1', '211112001001', 'H', '6', 'PEUGEOT', '10721870/1', 46266, 'Doc. AFACTURA 84490 SO1', '10721870', 'ARS', '', 30270, '', 'D', '', 'mpardo'],
    ['1', '211112002001', 'H', '6', 'PEUGEOT', '10720881/1', 46266, 'Doc. ANC 4714 SO1', '10720881', 'ARS', '', -1752741.73, '', 'H', '', 'bgiannotti'],
    ['', '211112', 'H', '6', '', '', 46281, 'Saldo periodo seleccionado', '', '', '', '', '', 'D', '', ''],
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Informe')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'biff8' }) as Buffer
  const parsed = parseBookFile(buffer, 'LSTEXTMR.xls')
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.errors.length, 0)
  const [invoice, credit] = parsed.rows
  if (!invoice || !credit) throw new Error('No se importaron las partidas de Quiter')
  assert.equal(invoice.date, '2026-09-01')
  assert.equal(invoice.receipt, 'AFACTURA')
  assert.equal(invoice.orderNo, '84490')
  assert.equal(invoice.ref1, '10721870/1')
  assert.equal(invoice.ref2, '10721870')
  assert.equal(invoice.creditCents, 3_027_000)
  assert.equal(invoice.dealer, '6')
  assert.equal(credit.creditCents, -175_274_173)
})

test('reimporting is idempotent and deleted movements can be restored', async () => {
  process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'cuenta-h-')), 'conciliacion.db')
  const db = await import('../src/db.js')
  const row = {
    origin: 'BANCO' as const,
    date: '2025-11-28',
    debitCents: 100,
    notes: 'Movimiento persistente',
    dealer: '1337',
    fingerprint: JSON.stringify(['persistencia', 'unico']),
  }
  const first = db.importBatches([{ name: 'a.txt', rows: [row, row] }, { name: 'b.txt', rows: [row] }])
  assert.deepEqual(first.map((file) => file.inserted), [1, 0])
  assert.deepEqual(first.map((file) => file.duplicates), [1, 1])
  const stored = db.listMovements({ status: 'PENDIENTE', dealer: '1337' }).find((item) => item.notes === row.notes)
  if (!stored) throw new Error('No se persistió el movimiento')
  db.deleteMovements([stored.id], 'Carga duplicada')
  assert.equal(db.listMovements({ status: 'ELIMINADO' }).some((item) => item.id === stored.id), true)
  assert.throws(() => db.deleteMovements([stored.id], 'Repetida'), /estado correspondiente/)
  db.restoreMovements([stored.id])
  assert.equal(db.getMovements([stored.id])[0].status, 'PENDIENTE')
})
