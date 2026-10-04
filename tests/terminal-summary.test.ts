import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import * as XLSX from 'xlsx'
import { parseBankFile } from '../src/importers.js'

const put = (chars: string[], start: number, value: string) => {
  ;[...value].forEach((character, index) => { chars[start + index] = character })
}

const fixedLine = (
  documentNo: string,
  description: string,
  debit = '00013551423,38',
  credit = '00000000000,00',
  date = '260803',
  receipt = 'DA',
) => {
  const chars = Array.from({ length: 207 }, () => ' ')
  put(chars, 0, '41110100')
  put(chars, 10, 'H')
  put(chars, 33, documentNo)
  put(chars, 47, receipt)
  put(chars, 54, description)
  put(chars, 120, debit)
  put(chars, 136, credit)
  put(chars, 193, date)
  return chars.join('')
}

const terminalWorkbook = (rows: unknown[][]) => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Cliente', 'Nº documento', 'Clase de documento', 'Fecha de documento', 'Indicador CME', 'Importe en moneda local', 'Moneda local', 'Texto'],
    ...rows,
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

test('terminal summary import only adds movements not already loaded by txt', async () => {
  process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'cuenta-h-')), 'conciliacion.db')
  const db = await import('../src/db.js')

  const txt = [
    'PEUGEOT'.padEnd(174, ' '),
    'Tot Cliente ARP1337',
    fixedLine('001600050529', 'CISA - TRANSFERENCIA SALDOS CE (01)', '00000000000,00', '00001596845,45'),
    '                                                    ** Tot. Cuenta 41110100',
  ].join('\r\n')
  const txtParsed = parseBankFile(Buffer.from(txt, 'latin1'), '1337.txt')
  const txtImport = db.importBatches([{ name: '1337.txt', rows: txtParsed.rows }])
  assert.equal(txtImport[0]?.inserted, 1)

  const excelBuffer = terminalWorkbook([
    ['ARP1337', '1600050529', 'DA', 46237, 'H', 1596845.45, 'ARS', 'CISA - TRANSFERENCIA SALDOS CE (01)'],
    ['ARP1337', '1900128157', 'D2', 46246, 'H', -1654334.32, 'ARS', '0166A00197560'],
  ])
  const excelParsed = parseBankFile(excelBuffer, '1337.xlsx')
  const excelImport = db.importTerminalSummaryBatches([{ name: '1337.xlsx', rows: excelParsed.rows }])

  assert.equal(excelImport[0]?.inserted, 1)
  assert.equal(excelImport[0]?.skippedExisting, 1)
  assert.equal(excelImport[0]?.duplicates, 0)
  assert.equal(db.listMovements({ origin: 'BANCO', dealer: '1337' }).length, 2)
  assert.equal(
    db.listMovements({ origin: 'BANCO', dealer: '1337' }).some((row) => row.notes === '0166A00197560'),
    true,
  )
})

test('terminal summary skips txt debit rows with padded order numbers', async () => {
  process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'cuenta-h-')), 'conciliacion.db')
  const db = await import('../src/db.js')

  const txt = [
    'PEUGEOT'.padEnd(174, ' '),
    'Tot Cliente ARP3550',
    fixedLine('001600052537', 'CISA - TRANSFERENCI...'),
    '                                                    ** Tot. Cuenta 41110100',
  ].join('\r\n')
  const txtParsed = parseBankFile(Buffer.from(txt, 'latin1'), '3550.txt')
  db.importBatches([{ name: '3550.txt', rows: txtParsed.rows }])

  const excelBuffer = terminalWorkbook([
    ['ARP3550', '1600052537', 'DA', 46237, 'H', 13551423.38, 'ARS', 'CISA - TRANSFERENCI...'],
  ])
  const excelParsed = parseBankFile(excelBuffer, '3550.xlsx')
  const excelImport = db.importTerminalSummaryBatches([{ name: '3550.xlsx', rows: excelParsed.rows }])

  assert.equal(excelImport[0]?.inserted, 0)
  assert.equal(excelImport[0]?.skippedExisting, 1)
  assert.equal(db.listMovements({ origin: 'BANCO', dealer: '3550' }).length, 1)
})

test('txt import skips movements already loaded from terminal summary', async () => {
  process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'cuenta-h-')), 'conciliacion.db')
  const db = await import('../src/db.js')

  const excelParsed = parseBankFile(terminalWorkbook([
    ['ARP3331', '102784029', 'AB', 46238, 'H', -38992278.67, 'ARS', 'COMP PP'],
  ]), '3331.xlsx')
  db.importTerminalSummaryBatches([{ name: '3331.xlsx', rows: excelParsed.rows }])

  const txt = [
    'PEUGEOT'.padEnd(174, ' '),
    'Tot Cliente ARP3331',
    fixedLine('000102784029', 'COMP PP', '00000000000,00', '00038992278,67', '260804', 'AB'),
    '                                                    ** Tot. Cuenta 41110100',
  ].join('\r\n')
  const txtParsed = parseBankFile(Buffer.from(txt, 'latin1'), '3331.txt')
  const txtImport = db.importBatches([{ name: '3331.txt', rows: txtParsed.rows }])

  assert.equal(txtImport[0]?.inserted, 0)
  assert.equal(txtImport[0]?.skippedExisting, 1)
  assert.equal(db.listMovements({ origin: 'BANCO', dealer: '3331' }).length, 1)
})

test('cross source cleanup removes second pending duplicate regardless of import order', async () => {
  process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'cuenta-h-')), 'conciliacion.db')
  const db = await import('../src/db.js')

  const excelParsed = parseBankFile(terminalWorkbook([
    ['ARP3888', '1600099888', 'DA', 46237, 'H', 13551423.38, 'ARS', 'CISA - TRANSFERENCI...'],
  ]), '3888.xlsx')
  db.importTerminalSummaryBatches([{ name: '3888.xlsx', rows: excelParsed.rows }])

  const txt = [
    'PEUGEOT'.padEnd(174, ' '),
    'Tot Cliente ARP3888',
    fixedLine('001600099888', 'CISA - TRANSFERENCI...'),
    '                                                    ** Tot. Cuenta 41110100',
  ].join('\r\n')
  const txtParsed = parseBankFile(Buffer.from(txt, 'latin1'), '3888.txt')
  db.insertMovements(txtParsed.rows.map((row) => ({ ...row, fingerprint: `${row.fingerprint}-dup` })))
  assert.equal(db.listMovements({ origin: 'BANCO', dealer: '3888', status: 'PENDIENTE' }).length, 2)

  const txtImport = db.importBatches([{ name: '3888.txt', rows: txtParsed.rows }])
  assert.equal(txtImport[0]?.cleanedDuplicates, 1)
  assert.equal(txtImport[0]?.skippedExisting, 1)
  assert.equal(txtImport[0]?.inserted, 0)
  assert.equal(db.listMovements({ origin: 'BANCO', dealer: '3888', status: 'PENDIENTE' }).length, 1)
  assert.equal(db.listMovements({ origin: 'BANCO', dealer: '3888', status: 'ELIMINADO' }).length, 1)
})
