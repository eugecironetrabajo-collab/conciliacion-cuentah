import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { ImportRow, Movement, Origin } from './types.js'

const dbPath = resolve(process.env.DB_PATH ?? 'data/conciliacion.db')
mkdirSync(dirname(dbPath), { recursive: true })
export const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

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
  CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)

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
})

const fingerprint = (row: ImportRow) =>
  [
    row.origin,
    row.date,
    row.processDate ?? row.date,
    row.receipt ?? '',
    row.orderNo ?? '',
    row.ref1 ?? '',
    row.ref2 ?? '',
    row.debitCents ?? 0,
    row.creditCents ?? 0,
    row.dealer ?? '6',
  ].join('|')

const insertStatement = db.prepare(`
  INSERT OR IGNORE INTO movements (
    origin, date, process_date, receipt, sector, order_no, ref1, ref2,
    debit_cents, credit_cents, notes, dealer, fingerprint
  ) VALUES (
    @origin, @date, @processDate, @receipt, @sector, @orderNo, @ref1, @ref2,
    @debitCents, @creditCents, @notes, @dealer, @fingerprint
  )
`)

export function insertMovements(rows: ImportRow[]) {
  let inserted = 0
  const insertMany = db.transaction(() => {
    for (const row of rows) {
      const result = insertStatement.run({
        origin: row.origin,
        date: row.date,
        processDate: row.processDate ?? row.date,
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
      inserted += result.changes
    }
  })
  insertMany()
  return { inserted, duplicates: rows.length - inserted, total: rows.length }
}

export function listMovements(filters: {
  status?: string
  origin?: string
  dealer?: string
  from?: string
  to?: string
} = {}) {
  const where: string[] = []
  const params: Record<string, string> = {}
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
  const sql = `SELECT * FROM movements ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY date, process_date, id`
  return (db.prepare(sql).all(params) as Record<string, unknown>[]).map(mapMovement)
}

export function getMovements(ids: number[]) {
  if (!ids.length) return []
  const placeholders = ids.map(() => '?').join(',')
  return (db.prepare(`SELECT * FROM movements WHERE id IN (${placeholders})`).all(...ids) as Record<string, unknown>[]).map(mapMovement)
}

export function confirmPairs(pairs: Array<{ bankId: number; bookId: number; differenceCents: number }>) {
  return db.transaction(() => {
    for (const pair of pairs) {
      const rows = getMovements([pair.bankId, pair.bookId])
      if (
        rows.length !== 2 ||
        rows.some((row) => row.status !== 'PENDIENTE') ||
        !rows.some((row) => row.origin === 'BANCO') ||
        !rows.some((row) => row.origin === 'LIBRO')
      ) throw new Error('Una de las partidas ya no está disponible')
      const result = db
        .prepare('INSERT INTO pairs (bank_id, book_id, difference_cents) VALUES (?, ?, ?)')
        .run(pair.bankId, pair.bookId, pair.differenceCents)
      db.prepare("UPDATE movements SET status = 'CONCILIADO', pair_id = ? WHERE id IN (?, ?)")
        .run(result.lastInsertRowid, pair.bankId, pair.bookId)
      db.prepare("INSERT INTO audit (action, detail) VALUES ('CONCILIAR', ?)")
        .run(`Pareja ${result.lastInsertRowid}: banco ${pair.bankId}, libro ${pair.bookId}`)
    }
  })()
}

export function unreconcile(id: number, reason: string) {
  const movement = getMovements([id])[0]
  if (!movement?.pairId) throw new Error('La partida no está conciliada')
  db.transaction(() => {
    db.prepare("UPDATE movements SET status = 'PENDIENTE', pair_id = NULL WHERE pair_id = ?").run(movement.pairId)
    db.prepare('DELETE FROM pairs WHERE id = ?').run(movement.pairId)
    db.prepare("INSERT INTO audit (action, detail) VALUES ('DESCONCILIAR', ?)").run(`Pareja ${movement.pairId}: ${reason}`)
  })()
}

export function statusSummary() {
  const counts = db.prepare('SELECT origin, status, COUNT(*) count FROM movements GROUP BY origin, status').all()
  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN debit_cents > 0 THEN debit_cents ELSE 0 END) debits,
      SUM(CASE WHEN credit_cents > 0 THEN credit_cents ELSE 0 END) credits
    FROM movements WHERE status != 'ELIMINADO'
  `).get()
  return { db: dbPath.split('/').pop(), counts, totals }
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
