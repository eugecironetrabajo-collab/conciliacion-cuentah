import type { Movement } from '../../../src/types.js'

export type MovementDoc = Movement & { fingerprint: string }

/** Map a Firestore document to a movement; document ID is the canonical numeric id. */
export function movementFromFirestoreDoc(
  docId: string,
  data: Record<string, unknown>,
): MovementDoc | null {
  const id = Number(docId)
  if (!Number.isFinite(id) || String(id) !== docId.trim()) return null
  const { id: _embedded, ...fields } = data
  return { id, ...fields } as MovementDoc
}

export function movementsFromFirestoreDocs(
  docs: Array<{ id: string; data: () => Record<string, unknown> }>,
): MovementDoc[] {
  const rows: MovementDoc[] = []
  for (const d of docs) {
    const row = movementFromFirestoreDoc(d.id, d.data())
    if (row) rows.push(row)
  }
  return rows
}
