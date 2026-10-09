export const loadDate = (value: Date | string = new Date()) => {
  const date = typeof value === 'string'
    ? new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
    : value
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}
