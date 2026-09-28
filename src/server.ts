import express from 'express'
import multer from 'multer'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  auditRows,
  confirmReconciliation,
  deleteMovements,
  getReconciliation,
  importBatches,
  listMovements,
  restoreMovements,
  reverseReconciliation,
  statusSummary,
  unreconcile,
} from './db.js'
import { parseBankFile, parseBookFile } from './importers.js'
import { automaticProposal, candidateFor, findCandidates } from './reconcile.js'

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } })
app.use(express.json({ limit: '2mb' }))

const ok = (data: unknown) => ({ ok: true, data })
const queryString = (value: unknown) => typeof value === 'string' ? value : undefined
const queryCents = (value: unknown) => {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const number = Number(value.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(number) ? Math.round(number * 100) : undefined
}

app.get('/api/health', (_req, res) => res.json(ok({ status: 'up' })))
app.get('/api/status', (_req, res) => res.json(ok(statusSummary())))
app.get('/api/movimientos', (req, res) => {
  res.json(ok(listMovements({
    status: queryString(req.query.estado),
    origin: queryString(req.query.origen),
    dealer: queryString(req.query.dealer),
    from: queryString(req.query.desde),
    to: queryString(req.query.hasta),
    processFrom: queryString(req.query.procesoDesde),
    processTo: queryString(req.query.procesoHasta),
    sector: queryString(req.query.sector),
    orderNo: queryString(req.query.orden),
    receipt: queryString(req.query.comprobante),
    ref1: queryString(req.query.ref1),
    ref2: queryString(req.query.ref2),
    sign: queryString(req.query.signo),
    amountFrom: queryCents(req.query.importeDesde),
    amountTo: queryCents(req.query.importeHasta),
  })))
})
app.get('/api/sugerencias', (req, res) => {
  const id = Number(req.query.id)
  const rows = listMovements({ status: 'PENDIENTE' })
  const candidates = findCandidates(rows).filter((candidate) => candidate.bankId === id || candidate.bookId === id)
  res.json(ok(candidates))
})
app.post('/api/reconcile/preview', (_req, res) => {
  res.json(ok(automaticProposal(listMovements({ status: 'PENDIENTE' }))))
})
app.post('/api/reconcile/check', (req, res) => {
  const rows = listMovements({ status: 'PENDIENTE' })
  const bank = rows.find((row) => row.id === Number(req.body.bankId))
  const book = rows.find((row) => row.id === Number(req.body.bookId))
  if (!bank || !book) return res.status(404).json({ ok: false, error: 'Partida no encontrada' })
  try {
    res.json(ok(candidateFor(bank, book)))
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})
app.post('/api/reconcile', (req, res) => {
  try {
    let movementIds = Array.isArray(req.body.movementIds)
      ? req.body.movementIds.map(Number)
      : []
    if (!movementIds.length && Array.isArray(req.body.pairs)) {
      movementIds = req.body.pairs.flatMap((pair: { bankId: unknown; bookId: unknown }) => [
        Number(pair.bankId), Number(pair.bookId),
      ])
    }
    if (!movementIds.length) throw new Error('No hay partidas preparadas para confirmar')
    const result = confirmReconciliation(
      movementIds,
      req.body.adjustment,
      req.body.mode === 'AUTOMATICA' ? 'AUTOMATICA' : 'MANUAL',
    )
    res.json(ok(result))
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})
app.get('/api/reconciliaciones/:id', (req, res) => {
  const reconciliation = getReconciliation(Number(req.params.id))
  if (!reconciliation) return res.status(404).json({ ok: false, error: 'Conciliación no encontrada' })
  res.json(ok(reconciliation))
})
app.post('/api/reconciliaciones/:id/revertir', (req, res) => {
  try {
    res.json(ok(reverseReconciliation(Number(req.params.id), String(req.body.motivo ?? ''))))
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})
app.post('/api/unreconcile', (req, res) => {
  try {
    unreconcile(Number(req.body.id), String(req.body.motivo ?? 'Sin motivo'))
    res.json(ok({ restored: true }))
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/movimientos/eliminar', (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number) : []
    res.json(ok(deleteMovements(ids, String(req.body.motivo ?? ''))))
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})
app.post('/api/movimientos/restaurar', (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number) : []
    res.json(ok(restoreMovements(ids)))
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/import/:origin', upload.any(), (req, res) => {
  try {
    const files = ((req.files ?? []) as Express.Multer.File[]).filter((file) => file.fieldname === 'files' || file.fieldname === 'file')
    if (!files.length) throw new Error('Seleccione un archivo')
    const origin = req.params.origin === 'banco' ? 'BANCO' : req.params.origin === 'libro' ? 'LIBRO' : null
    if (!origin) throw new Error('Origen inválido')
    const parsed = files.map((file) => {
      const result = origin === 'BANCO' ? parseBankFile(file.buffer, file.originalname) : parseBookFile(file.buffer, file.originalname)
      return { name: file.originalname, ...result }
    })
    const stored = importBatches(parsed.map((file) => ({ name: file.name, rows: file.rows })))
    const filesResult = parsed.map((file, index) => ({
      name: file.name,
      inserted: stored[index].inserted,
      duplicates: file.duplicatesInFile + stored[index].duplicates,
      skipped: file.skipped,
      errors: file.errors,
      total: file.rows.length + file.duplicatesInFile,
    }))
    res.json(ok({
      pending: true,
      reconciled: false,
      files: filesResult,
      inserted: filesResult.reduce((sum, file) => sum + file.inserted, 0),
      duplicates: filesResult.reduce((sum, file) => sum + file.duplicates, 0),
      skipped: filesResult.reduce((sum, file) => sum + file.skipped, 0),
      errors: filesResult.flatMap((file) => file.errors.map((error) => `${file.name}: ${error}`)),
    }))
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/auditoria', (_req, res) => res.json(ok(auditRows())))
app.get('/api/report', (req, res) => {
  const rows = listMovements({
    status: queryString(req.query.estado),
    origin: queryString(req.query.origen),
    from: queryString(req.query.desde),
    to: queryString(req.query.hasta),
  })
  const headers = ['Fecha', 'Origen', 'Estado', 'Comprobante', 'Orden', 'Ref. 1', 'Ref. 2', 'Débito', 'Crédito', 'Observaciones']
  const csvRows = rows.map((row) => [
    row.date, row.origin, row.status, row.receipt, row.orderNo, row.ref1, row.ref2,
    (row.debitCents / 100).toFixed(2), (row.creditCents / 100).toFixed(2), row.notes,
  ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';'))
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="conciliacion.csv"')
  res.send(`\uFEFF${headers.join(';')}\n${csvRows.join('\n')}`)
})

const dist = resolve('dist')
if (process.env.NODE_ENV === 'production' && existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(resolve(dist, 'index.html')))
}

const port = Number(process.env.PORT ?? 43128)
app.listen(port, '0.0.0.0', () => console.log(`API Cuenta H en http://127.0.0.1:${port}`))
