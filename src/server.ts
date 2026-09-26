import express from 'express'
import multer from 'multer'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditRows, confirmPairs, insertMovements, listMovements, statusSummary, unreconcile } from './db.js'
import { parseText, parseWorkbook } from './importers.js'
import { automaticProposal, candidateFor, findCandidates } from './reconcile.js'

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } })
app.use(express.json({ limit: '2mb' }))

const ok = (data: unknown) => ({ ok: true, data })
const queryString = (value: unknown) => typeof value === 'string' ? value : undefined

app.get('/api/health', (_req, res) => res.json(ok({ status: 'up' })))
app.get('/api/status', (_req, res) => res.json(ok(statusSummary())))
app.get('/api/movimientos', (req, res) => {
  res.json(ok(listMovements({
    status: queryString(req.query.estado),
    origin: queryString(req.query.origen),
    dealer: queryString(req.query.dealer),
    from: queryString(req.query.desde),
    to: queryString(req.query.hasta),
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
    const pairs = Array.isArray(req.body.pairs) ? req.body.pairs : []
    if (!pairs.length) throw new Error('No hay parejas preparadas para confirmar')
    confirmPairs(pairs.map((pair: { bankId: unknown; bookId: unknown; differenceCents?: unknown }) => ({
      bankId: Number(pair.bankId),
      bookId: Number(pair.bookId),
      differenceCents: Number(pair.differenceCents ?? 0),
    })))
    res.json(ok({ confirmed: pairs.length }))
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

app.post('/api/import/:origin', upload.single('file'), (req, res) => {
  try {
    if (!req.file) throw new Error('Seleccione un archivo')
    const origin = req.params.origin === 'banco' ? 'BANCO' : req.params.origin === 'libro' ? 'LIBRO' : null
    if (!origin) throw new Error('Origen inválido')
    const isText = /\.(txt|csv)$/i.test(req.file.originalname)
    const rows = isText ? parseText(req.file.buffer, origin) : parseWorkbook(req.file.buffer, origin)
    const result = insertMovements(rows)
    res.json(ok({ ...result, pending: true }))
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
