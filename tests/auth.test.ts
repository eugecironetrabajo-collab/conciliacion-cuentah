import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request } from 'express'

const withAuthEnv = async () => {
  process.env.AUTH_REQUIRED = 'true'
  process.env.ADMIN_USER = 'testadmin'
  process.env.ADMIN_PASSWORD = 'secret-pass'
  process.env.SESSION_SECRET = 'unit-test-secret'
  return import('../src/auth.js')
}

test('verifyLogin accepts valid credentials and rejects invalid ones', async () => {
  const { verifyLogin } = await withAuthEnv()
  assert.equal(verifyLogin('testadmin', 'secret-pass'), 'testadmin')
  assert.equal(verifyLogin('testadmin', 'wrong'), null)
  assert.equal(verifyLogin('other', 'secret-pass'), null)
})

test('session cookie encodes and decodes the current user', async () => {
  const { createSessionCookie, currentUser } = await withAuthEnv()
  const cookie = createSessionCookie('testadmin')
  const req = { headers: { cookie } } as Request
  assert.equal(currentUser(req), 'testadmin')
})

test('authMiddleware blocks protected API routes without a session', async () => {
  const { authMiddleware } = await withAuthEnv()
  const req = { path: '/api/movimientos', headers: {} } as Request
  let status = 0
  const res = {
    status(code: number) {
      status = code
      return this
    },
    json() {
      return this
    },
  } as Parameters<typeof authMiddleware>[1]
  let nextCalled = false
  authMiddleware(req, res, () => {
    nextCalled = true
  })
  assert.equal(status, 401)
  assert.equal(nextCalled, false)
})

test('authRequired is enabled in production', async () => {
  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  const { authRequired } = await import('../src/auth.js')
  assert.equal(authRequired(), true)
  process.env.NODE_ENV = previous
})
