import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { AdjustmentInput, ImportRow, Movement, Origin, ReconciliationRecord } from './types.js'
import { balanceSummary } from './reconcile.js'
import { bankBusinessKey, type BankMatchFields } from './importers.js'
import { bookFingerprint, bookTerminal, normalizeBookAmounts } from './terminals.js'

const dbPath = resolve(process.env.DB_PATH ?? 'data/conciliacion.db')
mkdirSync(dirname(dbPath), { recursive: true })
export const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

export const loadDate = (value: Date | string = new Date()) => {
  const date = typeof value === 'string'
    ? new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
    : value
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

db.exec(`
  CREATE TABLE IF NOT EXISTS movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT NOT NULL CHECK(origin IN ('BANCO','LIBRO')),
    status TEXT NOT NULL DEFAULT 'PENDIENTE',
    date TEXT NOT NULL,
    process_date TEXT NOT NULL,
    receipt TEXT NOT NULL DEFAULT '',
    sector TEXT NOT NULL DEFAULT '',
    order_no TEXT NOT NULL DEFAULT '',
    ref1 TEXT NOT NULL DEFAULT '',
    ref2 TEXT NOT NULL DEFAULT '',
    debit_cents INTEGER NOT NULL DEFAULT 0,
    credit_cents INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    dealer TEXT NOT NULL DEFAULT '6',
    pair_id INTEGER,
    fingerprint TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS pairs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    difference_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS reconciliations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL DEFAULT 'ACTIVA' CHECK(status IN ('ACTIVA','REVERTIDA')),
    mode TEXT NOT NULL DEFAULT 'MANUAL' CHECK(mode IN ('MANUAL','AUTOMATICA')),
    adjustment_cents INTEGER NOT NULL DEFAULT 0,
    adjustment_reason TEXT NOT NULL DEFAULT '',
    legacy_pair_id INTEGER UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reversed_at TEXT,
    reversal_reason TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS reconciliation_items (
    reconciliation_id INTEGER NOT NULL,
    movement_id INTEGER NOT NULL,
    is_adjustment INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (reconciliation_id, movement_id)
  );
  CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)

const movementColumns = db.prepare('PRAGMA table_info(movements)').all() as Array<{ name: string }>
if (!movementColumns.some((column) => column.name === 'reconciliation_id')) {
  db.exec('ALTER TABLE movements ADD COLUMN reconciliation_id INTEGER')
}
if (!movementColumns.some((column) => column.name === 'is_adjustment')) {
  db.exec('ALTER TABLE movements ADD COLUMN is_adjustment INTEGER NOT NULL DEFAULT 0')
}
if (!movementColumns.some((column) => column.name === 'assignee')) {
  db.exec("ALTER TABLE movements ADD COLUMN assignee TEXT NOT NULL DEFAULT ''")
}

const legacyPairs = db.prepare(`
  SELECT p.* FROM pairs p
  LEFT JOIN reconciliations r ON r.legacy_pair_id = p.id
  WHERE r.id IS NULL
`).all() as Array<{ id: number; bank_id: number; book_id: number; difference_cents: number; created_at: string }>
db.transaction(() => {
  for (const pair of legacyPairs) {
    const result = db.prepare(`
      INSERT INTO reconciliations (mode, adjustment_cents, legacy_pair_id, created_at)
      VALUES ('AUTOMATICA', ?, ?, ?)
    `).run(pair.difference_cents, pair.id, pair.created_at)
    const reconciliationId = Number(result.lastInsertRowid)
    db.prepare('INSERT INTO reconciliation_items (reconciliation_id, movement_id) VALUES (?, ?), (?, ?)')
      .run(reconciliationId, pair.bank_id, reconciliationId, pair.book_id)
    db.prepare('UPDATE movements SET reconciliation_id = ? WHERE id IN (?, ?)')
      .run(reconciliationId, pair.bank_id, pair.book_id)
  }
})()

const mapMovement = (row: Record<string, unknown>): Movement => ({
  id: Number(row.id),
  origin: row.origin as Origin,
  status: row.status as Movement['status'],
  date: String(row.date),
  processDate: String(row.process_date),
  receipt: String(row.receipt),
  sector: String(row.sector),
  orderNo: String(row.order_no),
  ref1: String(row.ref1),
  ref2: String(row.ref2),
  debitCents: Number(row.debit_cents),
  creditCents: Number(row.credit_cents),
  notes: String(row.notes),
  assignee: String(row.assignee ?? ''),
  dealer: String(row.dealer),
  pairId: row.pair_id === null ? null : Number(row.pair_id),
  reconciliationId: row.reconciliation_id === null ? null : Number(row.reconciliation_id),
  isAdjustment: Boolean(row.is_adjustment),
})

const fingerprint = (row: ImportRow) => row.fingerprint ?? JSON.stringify([
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

const insertStatement = db.prepare(`
  INSERT OR IGNORE INTO movements (
    origin, date, process_date, receipt, sector, order_no, ref1, ref2,
    debit_cents, credit_cents, notes, dealer, fingerprint
  ) VALUES (
    @origin, @date, @processDate, @receipt, @sector, @orderNo, @ref1, @ref2,
    @debitCents, @creditCents, @notes, @dealer, @fingerprint
  )
`)

const movementValues = (row: ImportRow) => ({
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
  fingerprint: fingerprint(row),
})

export function insertMovements(rows: ImportRow[]) {
  let inserted = 0
  for (const row of rows) {
    const result = insertStatement.run(movementValues(row))
    if (result.changes) inserted += 1
  }
  return { inserted, duplicates: 0, updatedDealers: 0, skippedExisting: 0, cleanedDuplicates: 0, total: rows.length }
}

const updateBankDealer = db.prepare(`
  UPDATE movements SET dealer = @dealer
  WHERE fingerprint = @fingerprint AND origin = 'BANCO' AND dealer != @dealer
`)

const loadBankBusinessKeys = () => new Set(
  (db.prepare(`
    SELECT dealer, order_no AS orderNo, receipt, debit_cents AS debitCents, credit_cents AS creditCents
    FROM movements
    WHERE origin = 'BANCO' AND status != 'ELIMINADO'
  `).all() as Array<BankMatchFields>).map((row) => bankBusinessKey(row)),
)

export function cleanupCrossSourceBankDuplicates() {
  const rows = db.prepare(`
    SELECT id, status, dealer, order_no AS orderNo, receipt, debit_cents AS debitCents, credit_cents AS creditCents
    FROM movements
    WHERE origin = 'BANCO'
  `).all() as Array<BankMatchFields & { id: number; status: string }>

  const groups = new Map<string, Array<BankMatchFields & { id: number; status: string }>>()
  for (const row of rows) {
    const key = bankBusinessKey(row)
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }

  const toDelete: number[] = []
  for (const group of groups.values()) {
    const pending = group.filter((row) => row.status === 'PENDIENTE')
    if (pending.length < 2) continue
    const sorted = [...pending].sort((left, right) => left.id - right.id)
    toDelete.push(...sorted.slice(1).map((row) => row.id))
  }

  if (toDelete.length) deleteMovements(toDelete, 'Duplicado entre TXT y resumen terminal')
  return { cleaned: toDelete.length }
}

export function importBatches(files: Array<{ name: string; rows: ImportRow[] }>) {
  const hasBank = files.some((file) => file.rows.some((row) => row.origin === 'BANCO'))
  const { cleaned } = hasBank ? cleanupCrossSourceBankDuplicates() : { cleaned: 0 }
  const results = db.transaction(() => {
    const existingBankKeys = hasBank ? loadBankBusinessKeys() : null
    const seen = new Set(
      (db.prepare('SELECT fingerprint FROM movements').all() as Array<{ fingerprint: string }>).map((row) => row.fingerprint),
    )
    return files.map((file) => {
      let inserted = 0
      let duplicates = 0
      let updatedDealers = 0
      let skippedExisting = 0
      for (const row of file.rows) {
        const values = movementValues(row)
        if (seen.has(values.fingerprint)) {
          if (values.origin === 'BANCO') {
            const result = updateBankDealer.run(values)
            if (result.changes) updatedDealers += 1
          }
          duplicates += 1
          continue
        }
        if (values.origin === 'BANCO' && existingBankKeys) {
          const businessKey = bankBusinessKey(values)
          if (existingBankKeys.has(businessKey)) {
            skippedExisting += 1
            continue
          }
        }
        insertStatement.run(values)
        seen.add(values.fingerprint)
        if (values.origin === 'BANCO' && existingBankKeys) existingBankKeys.add(bankBusinessKey(values))
        inserted += 1
      }
      return { name: file.name, inserted, duplicates, updatedDealers, skippedExisting, cleanedDuplicates: 0, total: file.rows.length }
    })
  })()
  if (cleaned && results.length) results[0].cleanedDuplicates = cleaned
  return results
}

export function importTerminalSummaryBatches(files: Array<{ name: string; rows: ImportRow[] }>) {
  const { cleaned } = cleanupCrossSourceBankDuplicates()
  const results = db.transaction(() => {
    const existingKeys = new Set(
      (db.prepare(`
        SELECT dealer, order_no AS orderNo, receipt, debit_cents AS debitCents, credit_cents AS creditCents
        FROM movements
        WHERE origin = 'BANCO' AND status != 'ELIMINADO'
      `).all() as Array<BankMatchFields>).map((row) => bankBusinessKey(row)),
    )
    const seenFingerprints = new Set(
      (db.prepare('SELECT fingerprint FROM movements').all() as Array<{ fingerprint: string }>).map((row) => row.fingerprint),
    )
    return files.map((file) => {
      let inserted = 0
      let duplicates = 0
      let skippedExisting = 0
      for (const row of file.rows) {
        const values = movementValues(row)
        const businessKey = bankBusinessKey(values)
        if (existingKeys.has(businessKey)) {
          skippedExisting += 1
          continue
        }
        if (seenFingerprints.has(values.fingerprint)) {
          duplicates += 1
          continue
        }
        insertStatement.run(values)
        seenFingerprints.add(values.fingerprint)
        existingKeys.add(businessKey)
        inserted += 1
      }
      return { name: file.name, inserted, duplicates, updatedDealers: 0, skippedExisting, cleanedDuplicates: 0, total: file.rows.length }
    })
  })()
  if (!results.length) return results
  results[0].cleanedDuplicates = cleaned
  return results
}

export function updateMovementAssignee(id: number, assignee: string) {
  const row = getMovements([id])[0]
  if (!row) throw new Error('La partida no existe')
  if (row.status !== 'PENDIENTE') throw new Error('Solo se puede asignar responsable a partidas pendientes')
  const value = assignee.trim().slice(0, 80)
  db.prepare('UPDATE movements SET assignee = ? WHERE id = ?').run(value, id)
  db.prepare("INSERT INTO audit (action, detail) VALUES ('ASIGNAR_RESPONSABLE', ?)")
    .run(`Partida ${id}: ${value || 'sin responsable'}`)
  return getMovements([id])[0]
}

export function deleteMovements(ids: number[], reason: string) {
  return changeMovementStatus(ids, 'ELIMINADO', reason)
}

export function restoreMovements(ids: number[]) {
  return changeMovementStatus(ids, 'PENDIENTE', 'Restauración de movimientos eliminados')
}

export function purgeMovements(ids: number[]) {
  const uniqueIds = [...new Set(ids)]
  if (!uniqueIds.length) throw new Error('Seleccione al menos un movimiento')
  const rows = getMovements(uniqueIds)
  if (rows.length !== uniqueIds.length) throw new Error('Uno de los movimientos ya no existe')
  const activeLink = db.prepare(`
    SELECT 1 FROM reconciliation_items ri
    JOIN reconciliations r ON r.id = ri.reconciliation_id
    WHERE ri.movement_id = ? AND r.status = 'ACTIVA'
  `)
  const removable = rows.filter((row) => row.status === 'ELIMINADO' && !activeLink.get(row.id))
  if (!removable.length) throw new Error('Solo se pueden borrar definitivamente movimientos eliminados que no están en una conciliación activa')
  const removableIds = removable.map((row) => row.id)
  db.transaction(() => {
    const placeholders = removableIds.map(() => '?').join(',')
    db.prepare(`DELETE FROM reconciliation_items WHERE movement_id IN (${placeholders})`).run(...removableIds)
    db.prepare(`DELETE FROM movements WHERE id IN (${placeholders})`).run(...removableIds)
    db.prepare('INSERT INTO audit (action, detail) VALUES (?, ?)').run(
      'BORRAR',
      `${removableIds.length} movimiento(s) eliminados definitivamente`,
    )
  })()
  return { deleted: removableIds.length, rejected: rows.length - removableIds.length }
}

function changeMovementStatus(ids: number[], status: 'PENDIENTE' | 'ELIMINADO', reason: string) {
  const uniqueIds = [...new Set(ids)]
  if (!uniqueIds.length) throw new Error('Seleccione al menos un movimiento')
  if (status === 'ELIMINADO' && !reason.trim()) throw new Error('Indique el motivo de la eliminación')
  const rows = getMovements(uniqueIds)
  if (rows.length !== uniqueIds.length) throw new Error('Uno de los movimientos ya no existe')
  const invalid = rows.find((row) =>
    row.isAdjustment || (status === 'ELIMINADO' ? row.status !== 'PENDIENTE' : row.status !== 'ELIMINADO'),
  )
  if (invalid) throw new Error('Solo se pueden gestionar movimientos importados en el estado correspondiente')
  db.transaction(() => {
    const placeholders = uniqueIds.map(() => '?').join(',')
    db.prepare(`UPDATE movements SET status = ? WHERE id IN (${placeholders})`).run(status, ...uniqueIds)
    db.prepare('INSERT INTO audit (action, detail) VALUES (?, ?)').run(
      status === 'ELIMINADO' ? 'ELIMINAR' : 'RESTAURAR',
      `${uniqueIds.length} movimiento(s): ${reason.trim()}`,
    )
  })()
  return { updated: uniqueIds.length, status }
}

export function listMovements(filters: {
  status?: string
  origin?: string
  dealer?: string
  from?: string
  to?: string
  processFrom?: string
  processTo?: string
  sector?: string
  orderNo?: string
  receipt?: string
  ref1?: string
  ref2?: string
  sign?: string
  amountFrom?: number
  amountTo?: number
} = {}) {
  const where: string[] = []
  const params: Record<string, string | number> = {}
  if (filters.status === 'NINGUNO') {
    where.push('1 = 0')
  } else if (filters.status && filters.status !== 'TODOS') {
    const statuses = filters.status.split(',').map((status) => status.trim()).filter((status) =>
      status === 'PENDIENTE' || status === 'CONCILIADO' || status === 'ELIMINADO',
    )
    if (!statuses.length) where.push('1 = 0')
    else {
      statuses.forEach((status, index) => { params[`status${index}`] = status })
      where.push(`status IN (${statuses.map((_, index) => `@status${index}`).join(', ')})`)
    }
  }
  if (filters.origin && filters.origin !== 'TODOS') {
    where.push('origin = @origin')
    params.origin = filters.origin
  }
  if (filters.dealer) {
    where.push(`(',' || dealer || ',') LIKE @dealer`)
    params.dealer = `%,${filters.dealer},%`
  }
  if (filters.from) {
    where.push('date >= @from')
    params.from = filters.from
  }
  if (filters.to) {
    where.push('date <= @to')
    params.to = filters.to
  }
  if (filters.processFrom) {
    where.push('process_date >= @processFrom')
    params.processFrom = filters.processFrom
  }
  if (filters.processTo) {
    where.push('process_date <= @processTo')
    params.processTo = filters.processTo
  }
  if (filters.sector) {
    where.push('sector = @sector')
    params.sector = filters.sector
  }
  if (filters.orderNo) {
    where.push('order_no LIKE @orderNo')
    params.orderNo = `%${filters.orderNo}%`
  }
  if (filters.receipt) {
    where.push(`UPPER(REPLACE(receipt || order_no, ' ', '')) LIKE @receipt`)
    params.receipt = `%${filters.receipt.replace(/\s+/g, '').toUpperCase()}%`
  }
  if (filters.ref1) {
    where.push('ref1 LIKE @ref1')
    params.ref1 = `%${filters.ref1}%`
  }
  if (filters.ref2) {
    where.push('ref2 LIKE @ref2')
    params.ref2 = `%${filters.ref2}%`
  }
  if (filters.sign === 'DEBITO') where.push('debit_cents > 0')
  if (filters.sign === 'CREDITO') where.push('credit_cents > 0')
  const amountExpression = `CASE WHEN ABS(debit_cents) >= ABS(credit_cents) THEN ABS(debit_cents) ELSE ABS(credit_cents) END`
  if (filters.amountFrom !== undefined) {
    where.push(`${amountExpression} >= @amountFrom`)
    params.amountFrom = filters.amountFrom
  }
  if (filters.amountTo !== undefined) {
    where.push(`${amountExpression} <= @amountTo`)
    params.amountTo = filters.amountTo
  }
  const sql = `SELECT * FROM movements ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY date, process_date, id`
  return (db.prepare(sql).all(params) as Record<string, unknown>[]).map(mapMovement)
}

export function getMovements(ids: number[]) {
  if (!ids.length) return []
  const placeholders = ids.map(() => '?').join(',')
  return (db.prepare(`SELECT * FROM movements WHERE id IN (${placeholders})`).all(...ids) as Record<string, unknown>[]).map(mapMovement)
}

const isAdjustmentClosure = (rows: Movement[]) =>
  rows.length === 2
  && rows.every((row) => row.origin === 'LIBRO')
  && rows.filter((row) => row.isAdjustment).length === 1

export function confirmReconciliation(
  movementIds: number[],
  adjustment: AdjustmentInput | undefined,
  mode: 'MANUAL' | 'AUTOMATICA' = 'MANUAL',
) {
  return db.transaction(() => {
    const uniqueIds = [...new Set(movementIds)]
    const rows = getMovements(uniqueIds)
    if (rows.length !== uniqueIds.length || rows.some((row) => row.status !== 'PENDIENTE')) {
      throw new Error('Una de las partidas ya no está disponible')
    }
    if (uniqueIds.length < 2) {
      throw new Error('Seleccione al menos dos partidas')
    }

    if (isAdjustmentClosure(rows)) {
      const adjustmentRow = rows.find((row) => row.isAdjustment)
      const bookRow = rows.find((row) => !row.isAdjustment)
      if (!adjustmentRow || !bookRow) throw new Error('La conciliación de ajuste no es válida')
      const { differenceCents: difference } = balanceSummary(rows)
      if (difference !== 0) throw new Error('El ajuste y la partida contable deben tener importes opuestos')
      const parentReconciliationId = adjustmentRow.reconciliationId
      if (!parentReconciliationId) throw new Error('El ajuste no está vinculado a una conciliación previa')

      const result = db.prepare(`
        INSERT INTO reconciliations (mode, adjustment_cents, adjustment_reason)
        VALUES (?, 0, '')
      `).run(mode)
      const reconciliationId = Number(result.lastInsertRowid)
      const itemStatement = db.prepare(`
        INSERT INTO reconciliation_items (reconciliation_id, movement_id, is_adjustment)
        VALUES (?, ?, ?)
      `)
      itemStatement.run(reconciliationId, adjustmentRow.id, 1)
      itemStatement.run(reconciliationId, bookRow.id, 0)
      db.prepare(`
        UPDATE movements
        SET status = 'CONCILIADO', reconciliation_id = ?, pair_id = ?
        WHERE id IN (?, ?)
      `).run(reconciliationId, parentReconciliationId, adjustmentRow.id, bookRow.id)
      db.prepare(`
        DELETE FROM reconciliation_items
        WHERE reconciliation_id = ? AND movement_id = ? AND is_adjustment = 1
      `).run(parentReconciliationId, adjustmentRow.id)
      db.prepare("INSERT INTO audit (action, detail) VALUES ('CONCILIAR_AJUSTE', ?)")
        .run(`Conciliación ${reconciliationId}: ajuste ${adjustmentRow.id} cerrado con partida ${bookRow.id} desde ${parentReconciliationId}`)
      return { reconciliationId, movementCount: rows.length, adjustmentId: adjustmentRow.id, differenceCents: 0 }
    }

    const { differenceCents: difference } = balanceSummary(rows)
    if (difference !== 0 && !adjustment?.reason.trim()) {
      throw new Error('Explique el motivo de la diferencia contable')
    }
    const result = db.prepare(`
      INSERT INTO reconciliations (mode, adjustment_cents, adjustment_reason)
      VALUES (?, ?, ?)
    `).run(mode, difference, adjustment?.reason.trim() ?? '')
    const reconciliationId = Number(result.lastInsertRowid)
    const itemStatement = db.prepare(`
      INSERT INTO reconciliation_items (reconciliation_id, movement_id, is_adjustment)
      VALUES (?, ?, ?)
    `)
    for (const row of rows) itemStatement.run(reconciliationId, row.id, 0)
    db.prepare(`
      UPDATE movements
      SET status = 'CONCILIADO', reconciliation_id = ?, pair_id = ?
      WHERE id IN (${uniqueIds.map(() => '?').join(',')})
    `).run(reconciliationId, reconciliationId, ...uniqueIds)

    let adjustmentId: number | null = null
    if (difference !== 0) {
      const date = adjustment?.date || rows.map((row) => row.date).sort().at(-1)!
      const adjustmentResult = db.prepare(`
        INSERT INTO movements (
          origin, status, date, process_date, receipt, sector, order_no, ref1, ref2,
          debit_cents, credit_cents, notes, dealer, pair_id, reconciliation_id,
          is_adjustment, fingerprint
        ) VALUES (
          'LIBRO', 'PENDIENTE', @date, @processDate, @receipt, @sector, @orderNo, @ref1, @ref2,
          @debitCents, @creditCents, @notes, @dealer, NULL, @reconciliationId,
          1, @fingerprint
        )
      `).run({
        date,
        processDate: loadDate(),
        receipt: adjustment?.receipt || 'AJDIF',
        sector: adjustment?.sector || '*',
        orderNo: adjustment?.orderNo || '',
        ref1: adjustment?.ref1 || '',
        ref2: adjustment?.ref2 || '',
        debitCents: difference < 0 ? Math.abs(difference) : 0,
        creditCents: difference > 0 ? difference : 0,
        notes: adjustment!.reason.trim(),
        dealer: rows.find((row) => row.origin === 'LIBRO')?.dealer ?? rows[0].dealer,
        reconciliationId,
        fingerprint: `AJUSTE|${reconciliationId}|${Date.now()}`,
      })
      adjustmentId = Number(adjustmentResult.lastInsertRowid)
      itemStatement.run(reconciliationId, adjustmentId, 1)
    }
    db.prepare("INSERT INTO audit (action, detail) VALUES ('CONCILIAR', ?)")
      .run(`Conciliación ${reconciliationId}: ${rows.length} partidas${adjustmentId ? `, ajuste ${adjustmentId}` : ''}`)
    return { reconciliationId, movementCount: rows.length, adjustmentId, differenceCents: difference }
  })()
}

export function getReconciliation(id: number): ReconciliationRecord | null {
  const row = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  const movements = (db.prepare(`
    SELECT m.* FROM movements m
    JOIN reconciliation_items ri ON ri.movement_id = m.id
    WHERE ri.reconciliation_id = ?
    ORDER BY ri.is_adjustment, m.date, m.id
  `).all(id) as Record<string, unknown>[]).map(mapMovement)
  return {
    id: Number(row.id),
    status: row.status as ReconciliationRecord['status'],
    mode: row.mode as ReconciliationRecord['mode'],
    adjustmentCents: Number(row.adjustment_cents),
    adjustmentReason: String(row.adjustment_reason),
    createdAt: String(row.created_at),
    reversedAt: row.reversed_at ? String(row.reversed_at) : null,
    reversalReason: String(row.reversal_reason),
    movements,
  }
}

export function reverseReconciliation(id: number, reason: string) {
  return db.transaction(() => {
    if (!reason.trim()) throw new Error('Indique el motivo de la reversión')
    const reconciliation = getReconciliation(id)
    if (!reconciliation || reconciliation.status !== 'ACTIVA') throw new Error('La conciliación no está activa')

    if (isAdjustmentClosure(reconciliation.movements)) {
      const adjustment = reconciliation.movements.find((row) => row.isAdjustment)
      const bookRow = reconciliation.movements.find((row) => !row.isAdjustment)
      if (!adjustment || !bookRow) throw new Error('La conciliación de ajuste no es válida')
      const parentReconciliationId = adjustment.pairId
      if (!parentReconciliationId) throw new Error('No se encontró la conciliación origen del ajuste')

      db.prepare(`
        UPDATE movements SET status = 'PENDIENTE', reconciliation_id = ?, pair_id = NULL
        WHERE id = ?
      `).run(parentReconciliationId, adjustment.id)
      db.prepare(`
        UPDATE movements SET status = 'PENDIENTE', reconciliation_id = NULL, pair_id = NULL
        WHERE id = ?
      `).run(bookRow.id)
      db.prepare(`
        INSERT INTO reconciliation_items (reconciliation_id, movement_id, is_adjustment)
        VALUES (?, ?, 1)
      `).run(parentReconciliationId, adjustment.id)
      db.prepare(`
        UPDATE reconciliations
        SET status = 'REVERTIDA', reversed_at = CURRENT_TIMESTAMP, reversal_reason = ?
        WHERE id = ?
      `).run(reason.trim(), id)
      db.prepare("INSERT INTO audit (action, detail) VALUES ('DESCONCILIAR', ?)")
        .run(`Conciliación ${id}: ajuste ${adjustment.id} reabierto en ${parentReconciliationId}. ${reason.trim()}`)
      return { reconciliationId: id, restored: 2 }
    }

    db.prepare(`
      UPDATE movements SET status = 'PENDIENTE', pair_id = NULL, reconciliation_id = NULL
      WHERE id IN (
        SELECT movement_id FROM reconciliation_items
        WHERE reconciliation_id = ? AND is_adjustment = 0
      )
    `).run(id)
    db.prepare(`
      UPDATE movements SET status = 'ELIMINADO'
      WHERE id IN (
        SELECT movement_id FROM reconciliation_items
        WHERE reconciliation_id = ? AND is_adjustment = 1
      )
    `).run(id)
    db.prepare(`
      UPDATE reconciliations
      SET status = 'REVERTIDA', reversed_at = CURRENT_TIMESTAMP, reversal_reason = ?
      WHERE id = ?
    `).run(reason.trim(), id)
    db.prepare("INSERT INTO audit (action, detail) VALUES ('DESCONCILIAR', ?)")
      .run(`Conciliación ${id}: ${reason.trim()}`)
    return { reconciliationId: id, restored: reconciliation.movements.filter((row) => !row.isAdjustment).length }
  })()
}

export function reverseReconciliationPartial(id: number, movementIds: number[], reason: string) {
  return db.transaction(() => {
    if (!reason.trim()) throw new Error('Indique el motivo de la reversión')
    const reconciliation = getReconciliation(id)
    if (!reconciliation || reconciliation.status !== 'ACTIVA') throw new Error('La conciliación no está activa')
    const originalRows = reconciliation.movements.filter((row) => !row.isAdjustment)
    const selectedIds = [...new Set(movementIds)]
    if (!selectedIds.length) throw new Error('Seleccione al menos una partida para revertir')
    if (selectedIds.some((movementId) => !originalRows.some((row) => row.id === movementId))) {
      throw new Error('Solo se pueden revertir partidas originales de la conciliación')
    }
    if (selectedIds.length === originalRows.length) return reverseReconciliation(id, reason)

    const remainingRows = reconciliation.movements.filter((row) => !selectedIds.includes(row.id))
    const { differenceCents } = balanceSummary(remainingRows)
    if (differenceCents !== 0) {
      throw new Error('La reversión parcial dejaría la conciliación desbalanceada; revierta el grupo completo')
    }

    const placeholders = selectedIds.map(() => '?').join(',')
    db.prepare(`
      UPDATE movements SET status = 'PENDIENTE', pair_id = NULL, reconciliation_id = NULL
      WHERE id IN (${placeholders})
    `).run(...selectedIds)
    db.prepare(`
      DELETE FROM reconciliation_items
      WHERE reconciliation_id = ? AND movement_id IN (${placeholders}) AND is_adjustment = 0
    `).run(id, ...selectedIds)
    db.prepare("INSERT INTO audit (action, detail) VALUES ('DESCONCILIAR', ?)")
      .run(`Conciliación ${id}: reversión parcial de ${selectedIds.length} partidas. ${reason.trim()}`)
    return { reconciliationId: id, restored: selectedIds.length, partial: true }
  })()
}

export function unreconcile(id: number, reason: string) {
  const movement = getMovements([id])[0]
  const reconciliationId = movement?.reconciliationId ?? movement?.pairId
  if (!reconciliationId) throw new Error('La partida no está conciliada')
  return reverseReconciliation(reconciliationId, reason)
}

export function statusSummary(filters: { dealer?: string } = {}) {
  const counts = db.prepare('SELECT origin, status, COUNT(*) count FROM movements GROUP BY origin, status').all()
  const dealerClause = filters.dealer ? `AND (',' || dealer || ',') LIKE @dealer` : ''
  const sides = db.prepare(`
    SELECT origin,
      COALESCE(SUM(debit_cents), 0) debits,
      COALESCE(SUM(credit_cents), 0) credits,
      COALESCE(SUM(CASE WHEN debit_cents != 0 THEN 1 ELSE 0 END), 0) debit_count,
      COALESCE(SUM(CASE WHEN credit_cents != 0 THEN 1 ELSE 0 END), 0) credit_count
    FROM movements
    WHERE status = 'PENDIENTE' ${dealerClause}
    GROUP BY origin
  `).all(filters.dealer ? { dealer: `%,${filters.dealer},%` } : {}) as Array<{ origin: string; debits: number; credits: number; debit_count: number; credit_count: number }>
  const side = (origin: string) => sides.find((row) => row.origin === origin) ?? { debits: 0, credits: 0, debit_count: 0, credit_count: 0 }
  const bank = side('BANCO')
  const book = side('LIBRO')
  return {
    db: dbPath.split('/').pop(),
    counts,
    statement: {
      bankDebits: Number(bank.debits),
      bankDebitCount: Number(bank.debit_count),
      bankCredits: Number(bank.credits),
      bankCreditCount: Number(bank.credit_count),
      bookDebits: Number(book.debits),
      bookDebitCount: Number(book.debit_count),
      bookCredits: Number(book.credits),
      bookCreditCount: Number(book.credit_count),
      bankBalance: Number(bank.debits) - Number(bank.credits),
      bookBalance: Number(book.debits) - Number(book.credits),
    },
  }
}

export function auditRows() {
  return db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 100').all()
}

export function seedDemo() {
  const count = Number((db.prepare('SELECT COUNT(*) count FROM movements').get() as { count: number }).count)
  if (count) return
  insertMovements([
    { origin: 'BANCO', date: '2025-12-17', processDate: '2025-12-17', receipt: 'VCB', orderNo: '3414', creditCents: 1176903, notes: 'B-14/01/2026-CISSA - TRANSFERENCIA SALDOS CE (01)' },
    { origin: 'LIBRO', date: '2025-12-30', processDate: '2025-12-30', receipt: 'INTERD', orderNo: '5865', ref1: '9849002/4', debitCents: 1176903, notes: 'L-14/01/2026-Doc. OP0001 92519 DP N/pago factura TRASPASO DE SALDO' },
    { origin: 'BANCO', date: '2025-12-23', processDate: '2025-12-23', receipt: 'VDB', orderNo: '3360', debitCents: 3029874, notes: 'B-14/01/2026-RECUPERO GASTO CUOTA CAMARA NOVIEMBRE 25' },
    { origin: 'LIBRO', date: '2025-12-23', processDate: '2025-12-23', receipt: 'VCL', orderNo: '5859', ref1: '2', ref2: '9849984/1', creditCents: 3029874, notes: 'L-14/01/2026-Doc. FACTURA 79820 MATERIAL CLIENTE RECUPERO G.' },
    { origin: 'BANCO', date: '2025-12-24', processDate: '2025-12-24', receipt: 'VDB', orderNo: '3362', debitCents: 3948300, notes: 'B-14/01/2026-Licencias SalesForce 2025' },
    { origin: 'BANCO', date: '2025-12-24', processDate: '2025-12-24', receipt: 'VDB', orderNo: '3363', debitCents: 3948300, notes: 'B-14/01/2026-Licencias SalesForce 2025' },
    { origin: 'LIBRO', date: '2025-12-24', processDate: '2025-12-24', receipt: 'VCL', orderNo: '5745', ref1: '2025', ref2: '9849790/1', creditCents: 3948300, notes: 'L-14/01/2026-Doc. FACTURA 79812 MATERIAL CLIENTE LICENCIAS' },
    { origin: 'LIBRO', date: '2025-12-24', processDate: '2025-12-24', receipt: 'VCL', orderNo: '5746', ref1: '2025', ref2: '9849811/1', creditCents: 3948300, notes: 'L-14/01/2026-Doc. FACTURA 79810 MATERIAL CLIENTE LICENCIAS' },
    { origin: 'BANCO', date: '2025-12-01', processDate: '2025-12-01', receipt: 'VCB', orderNo: '3365', creditCents: 5881432, notes: 'B-14/01/2026-0166A00190572' },
    { origin: 'LIBRO', date: '2025-12-01', processDate: '2025-12-01', receipt: 'VDL', orderNo: '5754', ref1: '9818850/1', debitCents: 5881432, notes: 'L-14/01/2026-Doc. ANC 4396 S01 Compras' },
  ])
}

seedDemo()

db.exec(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
const processDateBackfill = db.prepare(`SELECT value FROM schema_meta WHERE key = 'process_date_backfill'`).get()
if (!processDateBackfill) {
  const copied = db.prepare(`SELECT id, created_at FROM movements WHERE process_date = date`).all() as Array<{ id: number; created_at: string }>
  const updateProcessDate = db.prepare(`UPDATE movements SET process_date = ? WHERE id = ?`)
  db.transaction(() => {
    copied.forEach((row) => updateProcessDate.run(loadDate(row.created_at), row.id))
    db.prepare(`INSERT INTO schema_meta (key, value) VALUES ('process_date_backfill', '1')`).run()
  })()
}

const bookNormalization = db.prepare(`SELECT value FROM schema_meta WHERE key = 'book_signs_terminals'`).get()
if (!bookNormalization) {
  const books = db.prepare(`
    SELECT id, date, ref1, ref2, debit_cents, credit_cents, notes, sector, dealer
    FROM movements WHERE origin = 'LIBRO'
  `).all() as Array<{
    id: number
    date: string
    ref1: string
    ref2: string
    debit_cents: number
    credit_cents: number
    notes: string
    sector: string
    dealer: string
  }>
  const updateBook = db.prepare(`
    UPDATE movements
    SET debit_cents = @debitCents, credit_cents = @creditCents, dealer = @dealer, fingerprint = @fingerprint
    WHERE id = @id
  `)
  const removeBook = db.prepare('DELETE FROM movements WHERE id = ?')
  const linkedBook = db.prepare('SELECT 1 FROM reconciliation_items WHERE movement_id = ?')
  const fingerprintOwner = db.prepare('SELECT id FROM movements WHERE fingerprint = ?')
  db.transaction(() => {
    books.forEach((row) => {
      const terminal = bookTerminal(row.sector, row.notes)
      if (terminal.skip && !linkedBook.get(row.id)) {
        removeBook.run(row.id)
        return
      }
      const amounts = normalizeBookAmounts(row.debit_cents, row.credit_cents)
      const dealer = terminal.dealer || row.dealer
      let fingerprint = bookFingerprint(row.date, row.ref1, row.ref2, amounts.debitCents, amounts.creditCents, row.notes, dealer)
      const owner = fingerprintOwner.get(fingerprint) as { id: number } | undefined
      if (owner && owner.id !== row.id) {
        if (!linkedBook.get(row.id)) {
          removeBook.run(row.id)
          return
        }
        fingerprint = `${fingerprint}|${row.id}`
      }
      updateBook.run({
        id: row.id,
        debitCents: amounts.debitCents,
        creditCents: amounts.creditCents,
        dealer,
        fingerprint,
      })
    })
    db.prepare(`INSERT INTO schema_meta (key, value) VALUES ('book_signs_terminals', '1')`).run()
  })()
}

const adjustmentsPending = db.prepare(`SELECT value FROM schema_meta WHERE key = 'adjustments_pending'`).get()
if (!adjustmentsPending) {
  db.transaction(() => {
    db.prepare(`
      UPDATE movements
      SET status = 'PENDIENTE', pair_id = NULL
      WHERE is_adjustment = 1
        AND status = 'CONCILIADO'
        AND reconciliation_id IN (
          SELECT id FROM reconciliations WHERE adjustment_cents != 0 AND status = 'ACTIVA'
        )
    `).run()
    db.prepare(`INSERT INTO schema_meta (key, value) VALUES ('adjustments_pending', '1')`).run()
  })()
}
