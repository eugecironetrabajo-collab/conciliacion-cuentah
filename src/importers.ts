import * as XLSX from 'xlsx'
import type { ImportRow, Origin } from './types.js'

const aliases: Record<string, string[]> = {
  date: ['fecha', 'fecha movimiento', 'fec mov'],
  processDate: ['fecha proc.', 'fecha proceso', 'fec proceso'],
  receipt: ['comprobante', 'tipo comprobante'],
  sector: ['sector'],
  orderNo: ['orden', 'nro orden', 'numero orden'],
  ref1: ['ref. 1', 'ref1', 'referencia 1'],
  ref2: ['ref. 2', 'ref2', 'referencia 2'],
  debitBook: ['débitos libros', 'debitos libros', 'debe libro'],
  creditBank: ['créditos bancos', 'creditos bancos', 'haber banco'],
  debitBank: ['débitos bancos', 'debitos bancos', 'debe banco'],
  creditBook: ['créditos libros', 'creditos libros', 'haber libro'],
  notes: ['observaciones', 'detalle', 'concepto'],
  dealer: ['banco', 'dealer', 'concesionario'],
}

const normalized = (value: unknown) =>
  String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()

const lookup = (row: Record<string, unknown>, field: keyof typeof aliases) => {
  const names = aliases[field].map(normalized)
  const key = Object.keys(row).find((candidate) => names.includes(normalized(candidate)))
  return key ? row[key] : ''
}

export function parseAmount(value: unknown) {
  if (typeof value === 'number') return Math.round(value * 100)
  const raw = String(value ?? '').trim().replace(/\s/g, '')
  if (!raw) return 0
  const decimal = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
  const parsed = Number(decimal.replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(parsed)) throw new Error(`Importe inválido: ${value}`)
  return Math.round(parsed * 100)
}

const isoDate = (value: unknown) => {
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value)
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
  }
  const raw = String(value ?? '').trim()
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  throw new Error(`Fecha inválida: ${raw || '(vacía)'}`)
}

function mapRows(rows: Record<string, unknown>[], origin: Origin): ImportRow[] {
  return rows.filter((row) => Object.values(row).some(Boolean)).map((row, index) => {
    try {
      const date = isoDate(lookup(row, 'date'))
      return {
        origin,
        date,
        processDate: lookup(row, 'processDate') ? isoDate(lookup(row, 'processDate')) : date,
        receipt: String(lookup(row, 'receipt')),
        sector: String(lookup(row, 'sector')),
        orderNo: String(lookup(row, 'orderNo')),
        ref1: String(lookup(row, 'ref1')),
        ref2: String(lookup(row, 'ref2')),
        debitCents: parseAmount(lookup(row, origin === 'BANCO' ? 'debitBank' : 'debitBook')),
        creditCents: parseAmount(lookup(row, origin === 'BANCO' ? 'creditBank' : 'creditBook')),
        notes: String(lookup(row, 'notes')),
        dealer: String(lookup(row, 'dealer') || '6'),
      }
    } catch (error) {
      throw new Error(`Fila ${index + 2}: ${error instanceof Error ? error.message : error}`)
    }
  })
}

export function parseWorkbook(buffer: Buffer, origin: Origin) {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('El archivo no contiene hojas')
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  return mapRows(rows, origin)
}

export function parseText(buffer: Buffer, origin: Origin) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '')
  const firstLine = text.split(/\r?\n/)[0] ?? ''
  const delimiter = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ','
  const workbook = XLSX.read(text, { type: 'string', FS: delimiter })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return mapRows(XLSX.utils.sheet_to_json(sheet, { defval: '' }), origin)
}
