import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { AdjustmentInput, ImportRow, Movement, Origin, ReconciliationRecord } from './types.js'
import { balanceSummary } from './reconcile.js'

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
  return importBatches([{ name: 'archivo', rows }])[0]
}

export function importBatches(files: Array<{ name: string; rows: ImportRow[] }>) {
  return db.transaction(() => {
    const seen = new Set(
      (db.prepare('SELECT fingerprint FROM movements').all() as Array<{ fingerprint: string }>).map((row) => row.fingerprint),
    )
    return files.map((file) => {
      let inserted = 0
      let duplicates = 0
      for (const row of file.rows) {
        const values = movementValues(row)
        if (seen.has(values.fingerprint)) {
          duplicates += 1
          continue
        }
        insertStatement.run(values)
        seen.add(values.fingerprint)
        inserted += 1
      }
      return { name: file.name, inserted, duplicates, total: file.rows.length }
    })
  })()
}

export function deleteMovements(ids: number[], reason: string) {
  return changeMovementStatus(ids, 'ELIMINADO', reason)
}

export function restoreMovements(ids: number[]) {
  return changeMovementStatus(ids, 'PENDIENTE', 'Restauración de movimientos eliminados')
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
  if (filters.status && filters.status !== 'TODOS') {
    where.push('status = @status')
    params.status = filters.status
  }
  if (filters.origin && filters.origin !== 'TODOS') {
    where.push('origin = @origin')
    params.origin = filters.origin
  }
  if (filters.dealer) {
    where.push('dealer = @dealer')
    params.dealer = filters.dealer
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
    if (!rows.some((row) => row.origin === 'BANCO') || !rows.some((row) => row.origin === 'LIBRO')) {
      throw new Error('La conciliación debe incluir partidas bancarias y contables')
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
          'LIBRO', 'CONCILIADO', @date, @processDate, @receipt, @sector, @orderNo, @ref1, @ref2,
          @debitCents, @creditCents, @notes, @dealer, @reconciliationId, @reconciliationId,
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
        dealer: rows[0].dealer,
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

export function unreconcile(id: number, reason: string) {
  const movement = getMovements([id])[0]
  const reconciliationId = movement?.reconciliationId ?? movement?.pairId
  if (!reconciliationId) throw new Error('La partida no está conciliada')
  return reverseReconciliation(reconciliationId, reason)
}

export function statusSummary() {
  const counts = db.prepare('SELECT origin, status, COUNT(*) count FROM movements GROUP BY origin, status').all()
  const sides = db.prepare(`
    SELECT origin,
      COALESCE(SUM(debit_cents), 0) debits,
      COALESCE(SUM(credit_cents), 0) credits,
      COALESCE(SUM(CASE WHEN debit_cents != 0 THEN 1 ELSE 0 END), 0) debit_count,
      COALESCE(SUM(CASE WHEN credit_cents != 0 THEN 1 ELSE 0 END), 0) credit_count
    FROM movements
    WHERE status != 'ELIMINADO'
    GROUP BY origin
  `).all() as Array<{ origin: string; debits: number; credits: number; debit_count: number; credit_count: number }>
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
