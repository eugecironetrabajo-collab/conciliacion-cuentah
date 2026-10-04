import { createHmac, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

const COOKIE_NAME = 'mec_session'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000

export const authRequired = () =>
  process.env.NODE_ENV === 'production' || process.env.AUTH_REQUIRED === 'true'

const sessionSecret = () => {
  const secret = process.env.SESSION_SECRET?.trim()
  if (authRequired() && !secret) throw new Error('SESSION_SECRET es obligatorio cuando la autenticación está activa')
  return secret || 'dev-insecure-secret'
}

const adminCredentials = () => ({
  user: process.env.ADMIN_USER?.trim() || 'admin',
  password: process.env.ADMIN_PASSWORD ?? '',
})

type SessionPayload = { user: string; exp: number }

const sign = (payload: string) =>
  createHmac('sha256', sessionSecret()).update(payload).digest('base64url')

const encodeSession = (session: SessionPayload) => {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  return `${payload}.${sign(payload)}`
}

const decodeSession = (token: string): SessionPayload | null => {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = sign(payload)
  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionPayload
    if (!session.user || !session.exp || session.exp < Date.now()) return null
    return session
  } catch {
    return null
  }
}

const readCookie = (req: Request, name: string) => {
  const header = req.headers.cookie ?? ''
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : ''
}

export const currentUser = (req: Request) => {
  const token = readCookie(req, COOKIE_NAME)
  return token ? decodeSession(token)?.user ?? null : null
}

let auditActor = 'sistema'

export const setAuditActor = (actor: string) => {
  auditActor = actor || 'sistema'
}

export const getAuditActor = () => auditActor

export const createSessionCookie = (user: string) => {
  const token = encodeSession({ user, exp: Date.now() + SESSION_TTL_MS })
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}`
}

export const clearSessionCookie = () =>
  `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`

export const verifyLogin = (username: string, password: string) => {
  const admin = adminCredentials()
  if (!admin.password && authRequired()) return null
  const userOk = username === admin.user
  const left = Buffer.from(password)
  const right = Buffer.from(admin.password)
  const passOk = left.length === right.length && timingSafeEqual(left, right)
  return userOk && passOk ? admin.user : null
}

const publicPaths = new Set(['/api/health', '/api/login'])

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!authRequired() || !req.path.startsWith('/api/') || publicPaths.has(req.path)) {
    setAuditActor('sistema')
    return next()
  }
  const user = currentUser(req)
  if (!user) return res.status(401).json({ ok: false, error: 'Sesión no válida' })
  setAuditActor(user)
  res.locals.user = user
  return next()
}
