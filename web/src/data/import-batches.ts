import { Buffer } from 'buffer'
import { bankBusinessKey, parseBankFile, parseBookFile, type BankMatchFields } from '../../../src/importers.js'
import type { ImportRow, Movement } from '../../../src/types.js'
import { loadDate } from '../../../src/load-date.js'

export const rowFingerprint = (row: ImportRow) => row.fingerprint ?? JSON.stringify([
  row.origin,
  row.date,
  row.processDate ?? row.date,
  row.receipt ?? '',
  row.orderNo ?? '',
  row.ref1 ?? '',
  row.ref2 ?? '',
  row.debitCents ?? 0,
  row.creditCents ?? 0,
  row.notes ?? '',
  row.dealer ?? '6',
])

export const movementValues = (row: ImportRow) => ({
  origin: row.origin,
  date: row.date,
  processDate: loadDate(),
  receipt: row.receipt ?? '',
  sector: row.sector ?? '',
  orderNo: row.orderNo ?? '',
  ref1: row.ref1 ?? '',
  ref2: row.ref2 ?? '',
  debitCents: row.debitCents ?? 0,
  creditCents: row.creditCents ?? 0,
  notes: row.notes ?? '',
  dealer: row.dealer ?? '6',
  fingerprint: rowFingerprint(row),
})

export async function parseFilesForOrigin(origin: 'banco' | 'libro', files: File[]) {
  return Promise.all(files.map(async (file) => {
    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = origin === 'banco' ? parseBankFile(buffer, file.name) : parseBookFile(buffer, file.name)
    return { name: file.name, ...parsed }
  }))
}

export function cleanupCrossSourceBankDuplicates(rows: Movement[]) {
  const groups = new Map<string, Movement[]>()
  for (const row of rows.filter((r) => r.origin === 'BANCO')) {
    const key = bankBusinessKey(row)
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }
  const toDelete: number[] = []
  for (const group of groups.values()) {
    const pending = group.filter((row) => row.status === 'PENDIENTE')
    if (pending.length < 2) continue
    const sorted = [...pending].sort((a, b) => a.id - b.id)
    toDelete.push(...sorted.slice(1).map((row) => row.id))
  }
  return toDelete
}

export function importRowsIntoState(
  allRows: Movement[],
  files: Array<{ name: string; rows: ImportRow[] }>,
  options: { terminalSummary?: boolean } = {},
) {
  const fingerprints = new Set(allRows.map((row) => rowFingerprint(row)))
  const bankKeys = new Set(
    allRows.filter((row) => row.origin === 'BANCO' && row.status !== 'ELIMINADO').map((row) => bankBusinessKey(row)),
  )
  const hasBank = files.some((file) => file.rows.some((row) => row.origin === 'BANCO'))
  const cleanedIds = hasBank ? cleanupCrossSourceBankDuplicates(allRows) : []
  let working = allRows.filter((row) => !cleanedIds.includes(row.id))

  const results = files.map((file) => {
    let inserted = 0
    let duplicates = 0
    let updatedDealers = 0
    let skippedExisting = 0
    const newMovements: Movement[] = []
    for (const row of file.rows) {
      const values = movementValues(row)
      if (fingerprints.has(values.fingerprint)) {
        if (values.origin === 'BANCO') {
          const target = working.find((m) => rowFingerprint(m) === values.fingerprint)
          if (target && target.dealer !== values.dealer) {
            target.dealer = values.dealer
            updatedDealers += 1
          }
        }
        duplicates += 1
        continue
      }
      if (values.origin === 'BANCO') {
        const businessKey = bankBusinessKey(values as BankMatchFields)
        if (bankKeys.has(businessKey)) {
          skippedExisting += 1
          continue
        }
      }
      const nextId = working.reduce((max, r) => Math.max(max, r.id), 0) + 1
      const movement: Movement = {
        id: nextId,
        origin: values.origin,
        status: 'PENDIENTE',
        date: values.date,
        processDate: values.processDate,
        receipt: values.receipt,
        sector: values.sector,
        orderNo: values.orderNo,
        ref1: values.ref1,
        ref2: values.ref2,
        debitCents: values.debitCents,
        creditCents: values.creditCents,
        notes: values.notes,
        assignee: '',
        dealer: values.dealer,
        pairId: null,
        reconciliationId: null,
        isAdjustment: false,
      }
      fingerprints.add(values.fingerprint)
      if (values.origin === 'BANCO') bankKeys.add(bankBusinessKey(values as BankMatchFields))
      working.push(movement)
      newMovements.push(movement)
      inserted += 1
    }
    return {
      name: file.name,
      inserted,
      duplicates,
      updatedDealers,
      skippedExisting,
      cleanedDuplicates: 0,
      total: file.rows.length,
      newMovements,
    }
  })
  if (cleanedIds.length && results[0]) results[0].cleanedDuplicates = cleanedIds.length
  return { results, movements: working, cleanedIds }
}
