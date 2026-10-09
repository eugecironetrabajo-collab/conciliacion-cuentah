import assert from 'node:assert/strict'
import test from 'node:test'
import { isFirestoreMovementListRequest } from '../web/src/data/firestore-api-routes.js'

test('movement list routing accepts GET /api/movimientos and query variants', () => {
  assert.equal(isFirestoreMovementListRequest('/api/movimientos', 'GET'), true)
  assert.equal(isFirestoreMovementListRequest('/api/movimientos?estado=PENDIENTE', 'GET'), true)
})

test('movement list routing rejects POST mutations on movimientos paths', () => {
  assert.equal(isFirestoreMovementListRequest('/api/movimientos/eliminar', 'POST'), false)
  assert.equal(isFirestoreMovementListRequest('/api/movimientos/restaurar', 'POST'), false)
  assert.equal(isFirestoreMovementListRequest('/api/movimientos/borrar', 'POST'), false)
  assert.equal(isFirestoreMovementListRequest('/api/movimientos/eliminar', 'GET'), false)
})
