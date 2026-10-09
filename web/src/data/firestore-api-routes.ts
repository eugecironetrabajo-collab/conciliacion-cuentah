/** True when firestoreApi should list movements (GET /api/movimientos), not mutate. */
export function isFirestoreMovementListRequest(path: string, method: string) {
  if (method !== 'GET') return false
  return path === '/api/movimientos' || path.startsWith('/api/movimientos?')
}
