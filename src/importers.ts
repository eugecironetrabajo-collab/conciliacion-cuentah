import * as XLSX from 'xlsx'
import { bookFingerprint, bookTerminal, normalizeBookAmounts } from './terminals.js'
import type { ImportRow, Origin } from './types.js'

export interface ParsedImport {
  rows: ImportRow[]
  skipped: number
  duplicatesInFile: number
  errors: string[]
}

const aliases: Record<string, string[]> = {
  date: ['fecha', 'fecha movimiento', 'fec mov'],
  processDate: ['fecha proc.', 'fecha proceso', 'fec proceso'],
  receipt: ['comprobante', 'tipo comprobante'],
  sector: ['sector'],
  orderNo: ['orden', 'nro orden', 'numero orden'],
  ref1: ['ref. 1', 'ref1', 'referencia 1', 'referencia'],
  ref2: ['ref. 2', 'ref2', 'referencia 2', 'nro.docum', 'nro docum'],
  debitBook: ['débitos libros', 'debitos libros', 'debe libro', 'debe'],
  creditBank: ['créditos bancos', 'creditos bancos', 'haber banco'],
  debitBank: ['débitos bancos', 'debitos bancos', 'debe banco'],
  creditBook: ['créditos libros', 'creditos libros', 'haber libro', 'haber'],
  notes: ['observaciones', 'detalle', 'concepto', 'concepto del apunte'],
  dealer: ['banco', 'dealer', 'concesionario', 'cta.pers.', 'cta pers'],
}

const normalized = (value: unknown) =>
  String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()

const lookup = (row: Record<string, unknown>, field: keyof typeof aliases) => {
  const names = aliases[field].map(normalized)
  const key = Object.keys(row).find((candidate) => names.includes(normalized(candidate)))
  return key ? row[key] : ''
}

const slice = (line: string, start: number, end: number) =>
  start >= line.length ? '' : line.slice(start, Math.min(end, line.length))

export function parseAmount(value: unknown) {
  if (typeof value === 'number') return Math.round(value * 100)
  const raw = String(value ?? '').trim().replace(/\s/g, '')
  if (!raw || raw === '-') return 0
  const decimal = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
  const parsed = Number(decimal.replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(parsed)) throw new Error(`Importe inválido: ${value}`)
  return Math.round(parsed * 100)
}

const calendarDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Fecha inválida: ${day}/${month}/${year}`)
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseDate(value: unknown) {
  if (value instanceof Date) return calendarDate(value.getFullYear(), value.getMonth() + 1, value.getDate())
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value)
    if (!date) throw new Error(`Fecha inválida: ${value}`)
    return calendarDate(date.y, date.m, date.d)
  }
  const raw = String(value ?? '').trim()
  const full = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (full) return calendarDate(Number(full[3]), Number(full[2]), Number(full[1]))
  const short = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/)
  if (short) return calendarDate(2000 + Number(short[3]), Number(short[2]), Number(short[1]))
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  if (/^\d{6}$/.test(raw) && raw !== '000000') {
    return calendarDate(2000 + Number(raw.slice(0, 2)), Number(raw.slice(2, 4)), Number(raw.slice(4, 6)))
  }
  throw new Error(`Fecha inválida: ${raw || '(vacía)'}`)
}

const fingerprint = (parts: unknown[]) => JSON.stringify(parts)

const deduplicate = (rows: ImportRow[]): Pick<ParsedImport, 'rows' | 'duplicatesInFile'> => {
  const seen = new Set<string>()
  const unique: ImportRow[] = []
  let duplicatesInFile = 0
  for (const row of rows) {
    const key = row.fingerprint ?? ''
    if (seen.has(key)) {
      duplicatesInFile += 1
      continue
    }
    seen.add(key)
    unique.push(row)
  }
  return { rows: unique, duplicatesInFile }
}

function parseFixedWidth(text: string): ParsedImport {
  const lines = text.split(/\r?\n/)
  const dealer = lines.map((line) => line.match(/ARP(\d{3,6})/)?.[1]).find(Boolean)
    ?? '6'
  const rows: ImportRow[] = []
  const errors: string[] = []
  let skipped = 0

  lines.forEach((original, index) => {
    const line = original.replace(/[\t]/g, '')
    const trimmed = line.trim()
    if (!trimmed) return
    if (trimmed.slice(0, 8) !== '41110100') {
      skipped += 1
      return
    }
    if (line.slice(0, 8).trim() !== '41110100') {
      errors.push(`Línea ${index + 1}: la cuenta 41110100 debe comenzar en la primera columna`)
      return
    }
    try {
      const account = slice(line, 0, 8).trim()
      const reference = slice(line, 10, 32).trim()
      const detail = slice(line, 33, 119).trim()
      const documentNo = slice(line, 33, 45).trim()
      const receipt = slice(line, 47, 49).trim()
      const description = slice(line, 54, 105).trim()
      const invoice = slice(line, 106, 116).trim().replace(/^0+$/, '')
      const debitCents = parseAmount(slice(line, 120, 135))
      const creditCents = parseAmount(slice(line, 136, 151))
      const date = parseDate(slice(line, 193, 199).trim())
      if (!debitCents && !creditCents) {
        skipped += 1
        return
      }
      rows.push({
        origin: 'BANCO',
        date,
        processDate: date,
        receipt,
        sector: account,
        orderNo: documentNo,
        ref1: invoice,
        ref2: reference,
        debitCents,
        creditCents,
        notes: description || detail,
        dealer,
        fingerprint: fingerprint(['BANCO', account, reference, detail, debitCents, creditCents, date]),
      })
    } catch (error) {
      errors.push(`Línea ${index + 1}: ${error instanceof Error ? error.message : error}`)
    }
  })
  return { ...deduplicate(rows), skipped, errors }
}

const isQuiterSummary = (concept: string) =>
  /saldos?\s+(anteriores|finales)|saldo\s+periodo|^\*{3,}$/i.test(concept.trim())

const bookIdentity = (concept: string) => {
  const text = concept.replace(/^Doc\.\s+/i, '').trim()
  const match = text.match(/^([A-Z][A-Z0-9]{0,12})(?:\s+(\d{1,8}))?/)
  return { receipt: match?.[1] ?? '', orderNo: match?.[2] ?? '' }
}

function parseQuiter(buffer: Buffer): ParsedImport {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames.find((name) => normalized(name) === 'informe') ?? workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) throw new Error('El archivo no contiene hojas')
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true })
  const headers = (matrix[0] ?? []).map(normalized)
  const column = (...names: string[]) => headers.findIndex((header) => names.includes(header))
  const indexes = {
    account: column('cuenta mayor'),
    dealer: column('cta.pers.'),
    reference: column('referencia'),
    date: column('fecha'),
    concept: column('concepto del apunte'),
    document: column('nro.docum'),
    debit: column('debe'),
    credit: column('haber'),
  }
  if (indexes.date < 0 || indexes.concept < 0 || indexes.debit < 0 || indexes.credit < 0) {
    throw new Error('El Excel no tiene las columnas Fecha, Concepto del apunte, Debe y Haber')
  }
  const rows: ImportRow[] = []
  const errors: string[] = []
  let skipped = 0
  matrix.slice(1).forEach((row, offset) => {
    const excelRow = offset + 2
    const concept = String(row[indexes.concept] ?? '').trim()
    const rawDate = row[indexes.date]
    if (!concept && !rawDate) {
      skipped += 1
      return
    }
    if (!rawDate || isQuiterSummary(concept)) {
      skipped += 1
      return
    }
    try {
      const date = parseDate(rawDate)
      const identity = bookIdentity(concept)
      const parsedDebit = parseAmount(row[indexes.debit])
      const parsedCredit = parseAmount(row[indexes.credit])
      if (!parsedDebit && !parsedCredit) {
        skipped += 1
        return
      }
      const reference = indexes.reference >= 0 ? String(row[indexes.reference] ?? '').trim() : ''
      const documentNo = indexes.document >= 0 ? String(row[indexes.document] ?? '').trim() : ''
      const personalAccount = indexes.dealer >= 0 ? String(row[indexes.dealer] ?? '').trim() : ''
      const account = indexes.account >= 0 ? String(row[indexes.account] ?? '').trim() : ''
      const terminal = bookTerminal(account, concept)
      if (terminal.skip) {
        skipped += 1
        errors.push(`Fila ${excelRow}: la cuenta ${account} no debe tener importes`)
        return
      }
      const { debitCents, creditCents } = normalizeBookAmounts(parsedDebit, parsedCredit)
      const dealer = terminal.dealer || personalAccount || '6'
      rows.push({
        origin: 'LIBRO',
        date,
        processDate: date,
        receipt: identity.receipt,
        sector: account,
        orderNo: identity.orderNo,
        ref1: reference,
        ref2: documentNo,
        debitCents,
        creditCents,
        notes: concept,
        dealer,
        fingerprint: bookFingerprint(date, reference, documentNo, debitCents, creditCents, concept, dealer),
      })
    } catch (error) {
      errors.push(`Fila ${excelRow}: ${error instanceof Error ? error.message : error}`)
    }
  })
  return { ...deduplicate(rows), skipped, errors }
}

function parseDelimited(text: string, origin: Origin): ParsedImport {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  const firstLine = lines[0] ?? ''
  const delimiter = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ','
  const parseLine = (line: string) => {
    const values: string[] = []
    let value = ''
    let quoted = false
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          value += '"'
          index += 1
        } else quoted = !quoted
      } else if (character === delimiter && !quoted) {
        values.push(value.trim())
        value = ''
      } else value += character
    }
    values.push(value.trim())
    return values
  }
  const headers = parseLine(firstLine)
  const errors: string[] = []
  const rows = lines.slice(1).flatMap((line, index) => {
    if (!line.trim()) return []
    const record = Object.fromEntries(parseLine(line).map((value, column) => [headers[column] ?? `columna_${column}`, value]))
    try {
      const date = parseDate(lookup(record, 'date'))
      const row: ImportRow = {
        origin,
        date,
        processDate: lookup(record, 'processDate') ? parseDate(lookup(record, 'processDate')) : date,
        receipt: String(lookup(record, 'receipt')),
        sector: String(lookup(record, 'sector')),
        orderNo: String(lookup(record, 'orderNo')),
        ref1: String(lookup(record, 'ref1')),
        ref2: String(lookup(record, 'ref2')),
        debitCents: parseAmount(lookup(record, origin === 'BANCO' ? 'debitBank' : 'debitBook')),
        creditCents: parseAmount(lookup(record, origin === 'BANCO' ? 'creditBank' : 'creditBook')),
        notes: String(lookup(record, 'notes')),
        dealer: String(lookup(record, 'dealer') || '6'),
      }
      row.fingerprint = fingerprint([
        origin, row.date, row.processDate, row.receipt, row.orderNo, row.ref1, row.ref2,
        row.debitCents, row.creditCents, row.notes, row.dealer,
      ])
      return [row]
    } catch (error) {
      errors.push(`Fila ${index + 2}: ${error instanceof Error ? error.message : error}`)
      return []
    }
  })
  return { ...deduplicate(rows), skipped: 0, errors }
}

const decode = (buffer: Buffer) => {
  const utf8 = buffer.toString('utf8').replace(/^\uFEFF/, '')
  return utf8.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(buffer) : utf8
}

const isFixedWidthBank = (text: string) =>
  text.split(/\r?\n/).some((line) => line.trim().startsWith('41110100') && line.trim().length > 180)

export function parseBankFile(buffer: Buffer, filename = ''): ParsedImport {
  const text = decode(buffer)
  if (isFixedWidthBank(text) || /\.txt$/i.test(filename)) return parseFixedWidth(text)
  if (/\.(xls|xlsx)$/i.test(filename)) return parseQuiter(buffer)
  return parseDelimited(text, 'BANCO')
}

export function parseBookFile(buffer: Buffer, filename = ''): ParsedImport {
  if (/\.(xls|xlsx)$/i.test(filename)) return parseQuiter(buffer)
  const text = decode(buffer)
  return parseDelimited(text, 'LIBRO')
}

export function parseText(buffer: Buffer, origin: Origin) {
  const text = decode(buffer)
  const parsed = origin === 'BANCO' && isFixedWidthBank(text) ? parseFixedWidth(text) : parseDelimited(text, origin)
  if (parsed.errors.length && !parsed.rows.length) throw new Error(parsed.errors[0])
  return parsed.rows
}

export function parseWorkbook(buffer: Buffer, origin: Origin) {
  const parsed = origin === 'LIBRO' ? parseBookFile(buffer, 'archivo.xls') : parseBankFile(buffer, 'archivo.xlsx')
  if (parsed.errors.length && !parsed.rows.length) throw new Error(parsed.errors[0])
  return parsed.rows
}
