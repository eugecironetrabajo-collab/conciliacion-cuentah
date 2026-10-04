export interface Movement {
  id: number
  origin: 'BANCO' | 'LIBRO'
  status: 'PENDIENTE' | 'CONCILIADO' | 'ELIMINADO'
  date: string
  processDate: string
  receipt: string
  sector: string
  orderNo: string
  ref1: string
  ref2: string
  debitCents: number
  creditCents: number
  notes: string
  assignee: string
  dealer: string
  pairId: number | null
  reconciliationId: number | null
  isAdjustment: boolean
}

export interface Candidate {
  movementIds: [number, number]
  score: number
  differenceCents: number
  reason: string
}

export interface Reconciliation {
  id: number
  status: 'ACTIVA' | 'REVERTIDA'
  mode: 'MANUAL' | 'AUTOMATICA'
  adjustmentCents: number
  adjustmentReason: string
  createdAt: string
  reversedAt: string | null
  reversalReason: string
  movements: Movement[]
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: options?.body instanceof FormData
      ? options.headers
      : { 'Content-Type': 'application/json', ...options?.headers },
  })
  const payload = await response.json()
  if (response.status === 401 && !path.startsWith('/api/session') && !path.startsWith('/api/login')) {
    window.dispatchEvent(new CustomEvent('mec:unauthorized'))
  }
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'No se pudo completar la operación')
  return payload.data as T
}

export const getSession = () => api<{ user: string; auth: boolean }>('/api/session')
export const login = (username: string, password: string) =>
  api<{ user: string; auth: boolean }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
export const logout = () => api<{ loggedOut: boolean }>('/api/logout', { method: 'POST' })

export const getMovements = (query = '') => api<Movement[]>(`/api/movimientos${query}`)

export const money = (cents: number) =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)

export const shortDate = (date: string) => {
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}

export const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
