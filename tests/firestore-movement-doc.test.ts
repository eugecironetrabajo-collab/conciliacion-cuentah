import assert from 'node:assert/strict'
import test from 'node:test'
import { movementFromFirestoreDoc, movementsFromFirestoreDocs } from '../web/src/data/firestore-movement-doc.js'

test('movementFromFirestoreDoc uses document id and ignores embedded id field', () => {
  const row = movementFromFirestoreDoc('9', {
    id: 99,
    origin: 'BANCO',
    status: 'PENDIENTE',
    fingerprint: 'fp',
  })
  assert.equal(row?.id, 9)
  assert.equal(row?.status, 'PENDIENTE')
})

test('movementFromFirestoreDoc rejects non-numeric document ids', () => {
  assert.equal(
    movementFromFirestoreDoc('autoId', { origin: 'BANCO', status: 'PENDIENTE', id: 9 }),
    null,
  )
})

test('movementsFromFirestoreDocs skips invalid document ids', () => {
  const rows = movementsFromFirestoreDocs([
    { id: '9', data: () => ({ status: 'PENDIENTE', origin: 'BANCO' }) },
    { id: 'bad', data: () => ({ status: 'PENDIENTE', id: 9 }) },
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.id, 9)
})
