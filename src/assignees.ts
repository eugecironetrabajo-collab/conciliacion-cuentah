export const ASSIGNEE_OPTIONS = [
  'Pend Bru',
  'Pend Miche',
  'Pend Jose',
  'Pend Ro.R',
  'Pend Euge',
  'Pend Noe',
  'Pend Ro.B',
] as const

export const MAX_ASSIGNEE_LENGTH = 80

export function normalizeAssignee(value: unknown) {
  const assignee = String(value ?? '').trim().slice(0, MAX_ASSIGNEE_LENGTH)
  return assignee
}
