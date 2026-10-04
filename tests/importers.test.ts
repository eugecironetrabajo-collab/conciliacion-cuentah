import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import * as XLSX from 'xlsx'
import { bankBusinessKey, isTerminalSummaryWorkbook, parseBankFile, parseBookFile } from '../src/importers.js'

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

const bankText = (clientLine: string, documentNo: string, description: string) => [
  'CITROEN'.padEnd(174, ' '),
  clientLine,
  fixedLine(documentNo, description),
  '                                                    ** Tot. Cuenta 41110100',
].join('\r\n')

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

test('fixed-width bank files read ARC terminal codes', () => {
  const parsed3831 = parseBankFile(Buffer.from(bankText('Tot Client ARC3831', '001600096137', 'CISA - SAN NICOLAS'), 'latin1'), '3831.txt')
  const parsed3847 = parseBankFile(Buffer.from(bankText('Tot Client ARC3847', '001600096138', 'CISA - TRELEW'), 'latin1'), '3847.txt')
  assert.equal(parsed3831.rows[0]?.dealer, '3831')
  assert.equal(parsed3847.rows[0]?.dealer, '3847')
})

const terminalWorkbook = (rows: unknown[][]) => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Cliente', 'Nº documento', 'Clase de documento', 'Fecha de documento', 'Indicador CME', 'Importe en moneda local', 'Moneda local', 'Texto'],
    ...rows,
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

test('terminal summary workbooks map signed amounts and terminal codes', () => {
  const buffer = terminalWorkbook([
    ['ARP1337', '1600050529', 'DA', 46237, 'H', 1596845.45, 'ARS', 'CISA - TRANSFERENCIA SALDOS CE (01)'],
    ['ARC3831', '1600052608', 'DB', 46244, 'H', -20000000, 'ARS', 'TRF FONDOS'],
  ])
  assert.equal(isTerminalSummaryWorkbook(buffer), true)
  const parsed = parseBankFile(buffer, '1337.xlsx')
  assert.equal(parsed.format, 'terminal-summary')
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.errors.length, 0)
  const [debit, credit] = parsed.rows
  if (!credit || !debit) throw new Error('No se importaron las partidas del resumen terminal')
  assert.equal(debit.dealer, '1337')
  assert.equal(debit.orderNo, '1600050529')
  assert.equal(debit.receipt, 'DA')
  assert.equal(debit.date, '2026-08-03')
  assert.equal(debit.debitCents, 159_684_545)
  assert.equal(debit.creditCents, 0)
  assert.equal(credit.dealer, '3831')
  assert.equal(credit.creditCents, 2_000_000_000)
  assert.equal(credit.debitCents, 0)
})

test('bank business key matches txt and terminal document numbers', () => {
  const txtKey = bankBusinessKey({
    dealer: '3550',
    orderNo: '001600052537',
    receipt: 'DA',
    debitCents: 1_355_142_338,
    creditCents: 0,
  })
  const terminalKey = bankBusinessKey({
    dealer: '3550',
    orderNo: '1600052537',
    receipt: 'DA',
    debitCents: 1_355_142_338,
    creditCents: 0,
  })
  assert.equal(txtKey, terminalKey)
})

test('reimporting bank files updates dealer on duplicates', async () => {
  process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'cuenta-h-')), 'conciliacion.db')
  const db = await import('../src/db.js')
  const row = {
    origin: 'BANCO' as const,
    date: '2025-11-28',
    debitCents: 100,
    notes: 'Terminal incorrecta',
    dealer: '6',
    fingerprint: 'banco-terminal-3831',
  }
  const first = db.importBatches([{ name: 'a.txt', rows: [row] }])
  assert.equal(first[0]?.inserted, 1)
  const second = db.importBatches([{ name: 'a.txt', rows: [{ ...row, dealer: '3831' }] }])
  assert.equal(second[0]?.inserted, 0)
  assert.equal(second[0]?.updatedDealers, 1)
  assert.equal(db.listMovements({ dealer: '3831' }).length, 1)
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
  assert.equal(invoice.dealer, '1337')
  assert.equal(credit.debitCents, 175_274_173)
  assert.equal(credit.creditCents, 0)
  assert.equal(credit.dealer, '1337,3550')
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
