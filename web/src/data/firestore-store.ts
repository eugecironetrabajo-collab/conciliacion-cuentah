import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import { automaticProposal, balanceSummary } from '../../../src/reconcile.js'
import { filterMovements, parseMovementQuery } from '../../../src/movement-filters.js'
import { loadDate } from '../../../src/load-date.js'
import type { AdjustmentInput, ImportRow, Movement, Origin, ReconciliationRecord } from '../../../src/types.js'
import { getFirebaseAuth, getFirestoreDb } from '../firebase-app.js'
import { importRowsIntoState, movementValues, parseFilesForOrigin } from './import-batches.js'
import { normalizeAssignee } from '../../../src/assignees.js'
import { isFirestoreMovementListRequest } from './firestore-api-routes.js'
import { type MovementDoc, movementsFromFirestoreDocs } from './firestore-movement-doc.js'

const movementsCol = () => collection(getFirestoreDb(), 'movements')
const reconciliationsCol = () => collection(getFirestoreDb(), 'reconciliations')
const itemsCol = () => collection(getFirestoreDb(), 'reconciliation_items')
const auditCol = () => collection(getFirestoreDb(), 'audit')
const metaDoc = () => doc(getFirestoreDb(), 'meta', 'counters')
const FIRESTORE_BATCH_LIMIT = 500

async function loadAllMovements(fromServer = false): Promise<MovementDoc[]> {
  const snap = fromServer
    ? await getDocsFromServer(movementsCol())
    : await getDocs(movementsCol())
  return movementsFromFirestoreDocs(snap.docs)
}

async function commitMovementWrites(
  run: (add: (fn: (batch: ReturnType<typeof writeBatch>) => void) => void) => void,
) {
  let batch = writeBatch(getFirestoreDb())
  let ops = 0
  const commits: Promise<void>[] = []
  const add = (fn: (batch: ReturnType<typeof writeBatch>) => void) => {
    if (ops >= FIRESTORE_BATCH_LIMIT) {
      commits.push(batch.commit())
      batch = writeBatch(getFirestoreDb())
      ops = 0
    }
    fn(batch)
    ops += 1
  }
  run(add)
  if (ops) commits.push(batch.commit())
  await Promise.all(commits)
}

async function patchMovementFields(
  patches: Array<{ id: number; data: Record<string, unknown> }>,
) {
  if (!patches.length) return
  await commitMovementWrites((add) => {
    for (const { id, data } of patches) {
      add((batch) => batch.set(doc(movementsCol(), String(id)), data, { merge: true }))
    }
  })
}

async function saveAllMovements(rows: MovementDoc[]) {
  const existing = await getDocsFromServer(movementsCol())
  const ids = new Set(rows.map((r) => String(r.id)))
  await commitMovementWrites((add) => {
    for (const d of existing.docs) {
      if (!ids.has(d.id)) add((batch) => batch.delete(d.ref))
    }
    for (const row of rows) {
      const { id, ...data } = row
      add((batch) => batch.set(doc(movementsCol(), String(id)), data))
    }
  })
}

async function nextIds(kind: 'movement' | 'reconciliation' | 'audit', count = 1) {
  return runTransaction(getFirestoreDb(), async (tx) => {
    const ref = metaDoc()
    const snap = await tx.get(ref)
    const data = snap.data() ?? { movement: 0, reconciliation: 0, audit: 0 }
    const key = kind
    const start = Number(data[key] ?? 0)
    tx.set(ref, { ...data, [key]: start + count }, { merge: true })
    return Array.from({ length: count }, (_, index) => start + index + 1)
  })
}

async function recordAudit(action: string, detail: string) {
  const [id] = await nextIds('audit')
  const user = getFirebaseAuth().currentUser
  await setDoc(doc(auditCol(), String(id)), {
    action,
    detail,
    actor: user?.email ?? 'admin',
    created_at: new Date().toISOString(),
  })
}

const DEMO_ROWS: ImportRow[] = [
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
]

async function ensureProcessDateBackfill() {
  const ref = metaDoc()
  const meta = await getDoc(ref)
  if (meta.data()?.process_date_backfill_v1) return
  const today = loadDate()
  const rows = await loadAllMovements(true)
  const patches = rows
    .filter((row) => row.processDate === row.date)
    .map((row) => ({ id: row.id, data: { processDate: today } }))
  if (patches.length) await patchMovementFields(patches)
  await setDoc(ref, { process_date_backfill_v1: true }, { merge: true })
}

export async function ensureDemoSeeded() {
  const meta = await getDoc(metaDoc())
  if (meta.exists() && Number(meta.data()?.movement ?? 0) > 0) return
  const rows = await loadAllMovements(true)
  if (rows.length) return
  const { movements } = importRowsIntoState([], [{ name: 'demo', rows: DEMO_ROWS }])
  const withFp = movements.map((m) => ({ ...m, fingerprint: movementValues(m).fingerprint }))
  await saveAllMovements(withFp)
  const maxId = withFp.reduce((max, row) => Math.max(max, row.id), 0)
  await setDoc(metaDoc(), { movement: maxId, reconciliation: 0, audit: 0 }, { merge: true })
}

export function waitForAuth(): Promise<User | null> {
  const auth = getFirebaseAuth()
  if (auth.currentUser) return Promise.resolve(auth.currentUser)
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub()
      resolve(user)
    })
  })
}

export async function firestoreSession() {
  const user = getFirebaseAuth().currentUser ?? (await waitForAuth())
  if (!user) throw new Error('No autenticado')
  await ensureDemoSeeded()
  await ensureProcessDateBackfill()
  return { user: user.email ?? user.uid, auth: true }
}

export async function firestoreLogin(email: string, password: string) {
  await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password)
  return firestoreSession()
}

export async function firestoreLogout() {
  await signOut(getFirebaseAuth())
  return { loggedOut: true }
}

export async function firestoreGetMovements(queryString = '') {
  await ensureDemoSeeded()
  await ensureProcessDateBackfill()
  const rows = await loadAllMovements(true)
  return filterMovements(rows, parseMovementQuery(queryString))
}

export async function firestoreStatus(dealer?: string) {
  const rows = await loadAllMovements()
  const counts = ['BANCO', 'LIBRO'].flatMap((origin) =>
    (['PENDIENTE', 'CONCILIADO', 'ELIMINADO'] as const).map((status) => ({
      origin,
      status,
      count: rows.filter((r) => r.origin === origin && r.status === status).length,
    })),
  )
  const pending = rows.filter((r) => r.status === 'PENDIENTE' && (!dealer || `,${r.dealer},`.includes(`,${dealer},`)))
  const side = (origin: Origin) => pending.filter((r) => r.origin === origin)
  const bank = side('BANCO')
  const book = side('LIBRO')
  const sum = (list: Movement[], field: 'debitCents' | 'creditCents') => list.reduce((s, r) => s + r[field], 0)
  return {
    db: 'Firestore',
    counts,
    statement: {
      bankDebits: sum(bank, 'debitCents'),
      bankDebitCount: bank.filter((r) => r.debitCents > 0).length,
      bankCredits: sum(bank, 'creditCents'),
      bankCreditCount: bank.filter((r) => r.creditCents > 0).length,
      bookDebits: sum(book, 'debitCents'),
      bookDebitCount: book.filter((r) => r.debitCents > 0).length,
      bookCredits: sum(book, 'creditCents'),
      bookCreditCount: book.filter((r) => r.creditCents > 0).length,
      bankBalance: sum(bank, 'debitCents') - sum(bank, 'creditCents'),
      bookBalance: sum(book, 'debitCents') - sum(book, 'creditCents'),
    },
  }
}

async function getReconciliationRecord(id: number): Promise<ReconciliationRecord | null> {
  const snap = await getDoc(doc(reconciliationsCol(), String(id)))
  if (!snap.exists()) return null
  const row = snap.data()
  const items = await getDocs(query(itemsCol(), orderBy('reconciliationId')))
  const movementIds = items.docs
    .map((d) => d.data())
    .filter((item) => item.reconciliationId === id)
    .sort((a, b) => Number(a.isAdjustment) - Number(b.isAdjustment))
    .map((item) => Number(item.movementId))
  const movements = (await loadAllMovements()).filter((m) => movementIds.includes(m.id))
  return {
    id,
    status: row.status as ReconciliationRecord['status'],
    mode: row.mode as ReconciliationRecord['mode'],
    adjustmentCents: Number(row.adjustmentCents ?? 0),
    adjustmentReason: String(row.adjustmentReason ?? ''),
    createdAt: String(row.createdAt),
    reversedAt: row.reversedAt ? String(row.reversedAt) : null,
    reversalReason: String(row.reversalReason ?? ''),
    movements,
  }
}

export async function firestoreConfirmReconciliation(
  movementIds: number[],
  adjustment?: AdjustmentInput,
  mode: 'MANUAL' | 'AUTOMATICA' = 'MANUAL',
) {
  let all = await loadAllMovements()
  const uniqueIds = [...new Set(movementIds)]
  const rows = all.filter((r) => uniqueIds.includes(r.id))
  if (rows.length !== uniqueIds.length || rows.some((r) => r.status !== 'PENDIENTE')) {
    throw new Error('Una de las partidas ya no está disponible')
  }
  if (uniqueIds.length < 2) throw new Error('Seleccione al menos dos partidas')

  const [reconciliationId] = await nextIds('reconciliation')
  const { differenceCents: difference } = balanceSummary(rows)
  if (difference !== 0 && !adjustment?.reason.trim()) {
    throw new Error('Explique el motivo de la diferencia contable')
  }

  let adjustmentId: number | null = null
  if (difference !== 0) {
    const [adjId] = await nextIds('movement')
    adjustmentId = adjId
    const date = adjustment?.date || rows.map((r) => r.date).sort().at(-1)!
    all.push({
      id: adjId,
      origin: 'LIBRO',
      status: 'PENDIENTE',
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
      assignee: '',
      dealer: rows.find((r) => r.origin === 'LIBRO')?.dealer ?? rows[0].dealer,
      pairId: null,
      reconciliationId,
      isAdjustment: true,
      fingerprint: `AJUSTE|${reconciliationId}|${Date.now()}`,
    })
  }

  all = all.map((row) => uniqueIds.includes(row.id)
    ? { ...row, status: 'CONCILIADO' as const, reconciliationId, pairId: reconciliationId }
    : row)

  await setDoc(doc(reconciliationsCol(), String(reconciliationId)), {
    status: 'ACTIVA',
    mode,
    adjustmentCents: difference,
    adjustmentReason: adjustment?.reason.trim() ?? '',
    createdAt: new Date().toISOString(),
    reversedAt: null,
    reversalReason: '',
  })
  const batch = writeBatch(getFirestoreDb())
  for (const id of uniqueIds) {
    batch.set(doc(itemsCol(), `${reconciliationId}_${id}`), { reconciliationId, movementId: id, isAdjustment: 0 })
  }
  if (adjustmentId) {
    batch.set(doc(itemsCol(), `${reconciliationId}_${adjustmentId}`), { reconciliationId, movementId: adjustmentId, isAdjustment: 1 })
  }
  await batch.commit()
  await saveAllMovements(all)
  await recordAudit('CONCILIAR', `Conciliación ${reconciliationId}: ${rows.length} partidas${adjustmentId ? `, ajuste ${adjustmentId}` : ''}`)
  return { reconciliationId, movementCount: rows.length, adjustmentId, differenceCents: difference }
}

export async function firestoreReverseReconciliation(id: number, reason: string) {
  if (!reason.trim()) throw new Error('Indique el motivo de la reversión')
  const reconciliation = await getReconciliationRecord(id)
  if (!reconciliation || reconciliation.status !== 'ACTIVA') throw new Error('La conciliación no está activa')
  let all = await loadAllMovements()
  const original = reconciliation.movements.filter((r) => !r.isAdjustment)

  all = all.map((row) => {
    if (original.some((o) => o.id === row.id)) {
      return { ...row, status: 'PENDIENTE' as const, reconciliationId: null, pairId: null }
    }
    if (row.isAdjustment && reconciliation.movements.some((m) => m.id === row.id)) {
      return { ...row, status: 'ELIMINADO' as const }
    }
    return row
  })

  await setDoc(doc(reconciliationsCol(), String(id)), {
    ...((await getDoc(doc(reconciliationsCol(), String(id)))).data()),
    status: 'REVERTIDA',
    reversedAt: new Date().toISOString(),
    reversalReason: reason.trim(),
  }, { merge: true })
  await saveAllMovements(all)
  await recordAudit('DESCONCILIAR', `Conciliación ${id}: ${reason.trim()}`)
  return { reconciliationId: id, restored: original.length }
}

export async function firestoreReversePartial(id: number, movementIds: number[], reason: string) {
  if (!reason.trim()) throw new Error('Indique el motivo de la reversión')
  const reconciliation = await getReconciliationRecord(id)
  if (!reconciliation || reconciliation.status !== 'ACTIVA') throw new Error('La conciliación no está activa')
  const originalRows = reconciliation.movements.filter((r) => !r.isAdjustment)
  const selectedIds = [...new Set(movementIds)]
  if (!selectedIds.length) throw new Error('Seleccione al menos una partida para revertir')
  if (selectedIds.length === originalRows.length) return firestoreReverseReconciliation(id, reason)
  const remaining = reconciliation.movements.filter((r) => !selectedIds.includes(r.id))
  if (balanceSummary(remaining).differenceCents !== 0) {
    throw new Error('La reversión parcial dejaría la conciliación desbalanceada; revierta el grupo completo')
  }
  let all = await loadAllMovements()
  all = all.map((row) => selectedIds.includes(row.id)
    ? { ...row, status: 'PENDIENTE' as const, reconciliationId: null, pairId: null }
    : row)
  const batch = writeBatch(getFirestoreDb())
  for (const movementId of selectedIds) {
    batch.delete(doc(itemsCol(), `${id}_${movementId}`))
  }
  await batch.commit()
  await saveAllMovements(all)
  await recordAudit('DESCONCILIAR', `Conciliación ${id}: reversión parcial de ${selectedIds.length} partidas. ${reason.trim()}`)
  return { reconciliationId: id, restored: selectedIds.length, partial: true }
}

export async function firestoreChangeStatus(ids: number[], status: 'PENDIENTE' | 'ELIMINADO', reason: string) {
  const uniqueIds = [...new Set(ids)]
  if (!uniqueIds.length) throw new Error('Seleccione al menos un movimiento')
  if (status === 'ELIMINADO' && !reason.trim()) throw new Error('Indique el motivo de la eliminación')
  const all = await loadAllMovements(true)
  const rows = all.filter((r) => uniqueIds.includes(r.id))
  if (rows.length !== uniqueIds.length) throw new Error('Uno de los movimientos ya no existe')
  const invalid = rows.find((r) =>
    r.isAdjustment || (status === 'ELIMINADO' ? r.status !== 'PENDIENTE' : r.status !== 'ELIMINADO'),
  )
  if (invalid) throw new Error('Solo se pueden gestionar movimientos importados en el estado correspondiente')
  await patchMovementFields(uniqueIds.map((id) => ({ id, data: { status } })))
  for (const id of uniqueIds) {
    const verified = await getDocFromServer(doc(movementsCol(), String(id)))
    if (!verified.exists() || verified.data()?.status !== status) {
      throw new Error(`No se pudo actualizar el estado del movimiento ${id} en el servidor`)
    }
  }
  await recordAudit(status === 'ELIMINADO' ? 'ELIMINAR' : 'RESTAURAR', `${uniqueIds.length} movimiento(s): ${reason.trim()}`)
  return { updated: uniqueIds.length, status }
}

export async function firestorePurge(ids: number[]) {
  const uniqueIds = [...new Set(ids)]
  const all = await loadAllMovements()
  const rows = all.filter((r) => uniqueIds.includes(r.id))
  const reconciliations = await getDocs(reconciliationsCol())
  const activeRecIds = new Set(
    reconciliations.docs.filter((d) => d.data().status === 'ACTIVA').map((d) => Number(d.id)),
  )
  const items = await getDocs(itemsCol())
  const linked = new Set<number>()
  for (const d of items.docs) {
    const item = d.data()
    if (activeRecIds.has(item.reconciliationId)) linked.add(Number(item.movementId))
  }
  const removable = rows.filter((row) => {
    if (row.isAdjustment && row.status !== 'ELIMINADO') return false
    return row.status === 'ELIMINADO' && !linked.has(row.id)
  })
  if (!removable.length) {
    throw new Error('Solo se pueden borrar definitivamente movimientos eliminados que no están en una conciliación activa')
  }
  const removableIds = new Set(removable.map((r) => r.id))
  const batch = writeBatch(getFirestoreDb())
  for (const id of removableIds) {
    batch.delete(doc(movementsCol(), String(id)))
    for (const d of items.docs) {
      if (Number(d.data().movementId) === id) batch.delete(d.ref)
    }
  }
  await batch.commit()
  await recordAudit('BORRAR', `${removableIds.size} movimiento(s) eliminados definitivamente`)
  return { deleted: removableIds.size, rejected: rows.length - removableIds.size }
}

export async function firestoreImport(origin: 'banco' | 'libro', files: File[]) {
  const parsed = await parseFilesForOrigin(origin, files)
  let all = await loadAllMovements(true)
  const importFiles = parsed.map((file) => ({
    name: file.name,
    rows: file.rows,
  }))
  const { results, movements, cleanedIds } = importRowsIntoState(all, importFiles, {
    terminalSummary: parsed.some((f) => f.format === 'terminal-summary'),
  })
  if (cleanedIds.length) {
    all = all.filter((r) => !cleanedIds.includes(r.id))
  }
  await saveAllMovements(movements.map((m) => ({
    ...m,
    fingerprint: movementValues(m).fingerprint,
  })))
  const maxId = movements.reduce((max, row) => Math.max(max, row.id), 0)
  await setDoc(metaDoc(), { movement: maxId }, { merge: true })
  const filesResult = parsed.map((file, index) => ({
    name: file.name,
    inserted: results[index]?.inserted ?? 0,
    duplicates: file.duplicatesInFile + (results[index]?.duplicates ?? 0),
    updatedDealers: results[index]?.updatedDealers ?? 0,
    skippedExisting: results[index]?.skippedExisting ?? 0,
    cleanedDuplicates: results[index]?.cleanedDuplicates ?? 0,
    skipped: file.skipped,
    errors: file.errors,
    total: file.rows.length + file.duplicatesInFile,
  }))
  return {
    pending: true,
    reconciled: false,
    files: filesResult,
    inserted: filesResult.reduce((s, f) => s + f.inserted, 0),
    duplicates: filesResult.reduce((s, f) => s + f.duplicates, 0),
    updatedDealers: filesResult.reduce((s, f) => s + f.updatedDealers, 0),
    skippedExisting: filesResult.reduce((s, f) => s + f.skippedExisting, 0),
    cleanedDuplicates: filesResult.reduce((s, f) => s + f.cleanedDuplicates, 0),
    skipped: filesResult.reduce((s, f) => s + f.skipped, 0),
    errors: filesResult.flatMap((f) => f.errors.map((e) => `${f.name}: ${e}`)),
  }
}

export async function firestoreAudit() {
  const snap = await getDocs(auditCol())
  return snap.docs
    .map((d) => ({ id: Number(d.id), ...d.data() }))
    .sort((a, b) => b.id - a.id)
    .slice(0, 100) as Array<{
    id: number
    action: string
    detail: string
    actor?: string
    created_at: string
  }>
}

export async function firestoreReport(params: URLSearchParams) {
  const rows = await firestoreGetMovements(`?${params}`)
  const headers = ['Fecha', 'Origen', 'Estado', 'Comprobante', 'Orden', 'Ref. 1', 'Ref. 2', 'Débito', 'Crédito', 'Observaciones', 'Responsable']
  const csvRows = rows.map((row) => [
    row.date, row.origin, row.status, row.receipt, row.orderNo, row.ref1, row.ref2,
    (row.debitCents / 100).toFixed(2), (row.creditCents / 100).toFixed(2), row.notes, row.assignee,
  ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';'))
  return `\uFEFF${headers.join(';')}\n${csvRows.join('\n')}`
}

export async function firestoreApi<T>(path: string, options?: RequestInit): Promise<T> {
  const method = options?.method ?? 'GET'
  const body = options?.body

  if (path.startsWith('/api/session')) return firestoreSession() as Promise<T>
  if (path.startsWith('/api/login')) {
    const parsed = JSON.parse(String(body)) as { username: string; password: string }
    return firestoreLogin(parsed.username, parsed.password) as Promise<T>
  }
  if (path.startsWith('/api/logout')) return firestoreLogout() as Promise<T>

  if (path.startsWith('/api/status')) {
    const dealer = new URL(path, 'http://local').searchParams.get('dealer') ?? undefined
    return firestoreStatus(dealer) as Promise<T>
  }
  if (path === '/api/movimientos/eliminar' && method === 'POST') {
    const parsed = JSON.parse(String(body)) as { ids: number[]; motivo: string }
    return firestoreChangeStatus(parsed.ids, 'ELIMINADO', parsed.motivo) as Promise<T>
  }
  if (path === '/api/movimientos/restaurar' && method === 'POST') {
    const parsed = JSON.parse(String(body)) as { ids: number[] }
    return firestoreChangeStatus(parsed.ids, 'PENDIENTE', 'Restauración') as Promise<T>
  }
  if (path === '/api/movimientos/borrar' && method === 'POST') {
    const parsed = JSON.parse(String(body)) as { ids: number[] }
    return firestorePurge(parsed.ids) as Promise<T>
  }
  if (path.startsWith('/api/movimientos')) {
    if (method === 'PATCH' && path.includes('/assignee')) {
      const id = Number(path.split('/')[3])
      const parsed = JSON.parse(String(body)) as { assignee: string }
      const all = await loadAllMovements(true)
      const row = all.find((r) => r.id === id)
      if (!row || row.status !== 'PENDIENTE') throw new Error('Solo se puede asignar responsable a partidas pendientes')
      const assignee = normalizeAssignee(parsed.assignee)
      await updateDoc(doc(movementsCol(), String(id)), { assignee })
      await recordAudit('ASIGNAR_RESPONSABLE', `Partida ${id}: ${assignee || 'sin responsable'}`)
      return { ...row, assignee } as T
    }
    if (isFirestoreMovementListRequest(path, method)) {
      const q = path.includes('?') ? path.slice(path.indexOf('?')) : ''
      return firestoreGetMovements(q) as Promise<T>
    }
    throw new Error(`Ruta no implementada en Firestore: ${path}`)
  }
  if (path === '/api/reconcile/preview' && method === 'POST') {
    const pending = await firestoreGetMovements('?estado=PENDIENTE')
    return automaticProposal(pending) as unknown as T
  }
  if (path === '/api/reconcile' && method === 'POST') {
    const parsed = JSON.parse(String(body)) as {
      movementIds?: number[]
      adjustment?: AdjustmentInput
      mode?: string
    }
    const movementIds = parsed.movementIds ?? []
    return firestoreConfirmReconciliation(
      movementIds,
      parsed.adjustment,
      parsed.mode === 'AUTOMATICA' ? 'AUTOMATICA' : 'MANUAL',
    ) as Promise<T>
  }
  if (path.match(/^\/api\/reconciliaciones\/\d+$/)) {
    const id = Number(path.split('/')[3])
    const rec = await getReconciliationRecord(id)
    if (!rec) throw new Error('Conciliación no encontrada')
    return rec as T
  }
  if (path.includes('/revertir-parcial')) {
    const id = Number(path.split('/')[3])
    const parsed = JSON.parse(String(body)) as { movementIds: number[]; motivo: string }
    return firestoreReversePartial(id, parsed.movementIds, parsed.motivo) as Promise<T>
  }
  if (path.includes('/revertir')) {
    const id = Number(path.split('/')[3])
    const parsed = JSON.parse(String(body)) as { motivo: string }
    return firestoreReverseReconciliation(id, parsed.motivo) as Promise<T>
  }
  if (path.startsWith('/api/import/')) {
    const origin = path.endsWith('banco') ? 'banco' : 'libro'
    if (!(body instanceof FormData)) throw new Error('Archivo inválido')
    const files = [...body.getAll('files'), ...body.getAll('file')].filter((f): f is File => f instanceof File)
    return firestoreImport(origin, files) as Promise<T>
  }
  if (path.startsWith('/api/auditoria')) return firestoreAudit() as Promise<T>
  if (path.startsWith('/api/report')) {
    const params = new URL(path, 'http://local').searchParams
    throw Object.assign(new Error('REPORT_CSV'), { csv: await firestoreReport(params) })
  }
  throw new Error(`Ruta no implementada en Firestore: ${path}`)
}
