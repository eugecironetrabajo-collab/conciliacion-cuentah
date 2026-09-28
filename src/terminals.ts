export const TERMINALS = [
  { code: '1337', label: 'Peugeot Pergamino' },
  { code: '3550', label: 'Peugeot Trelew' },
  { code: '3831', label: 'Citroën San Nicolás' },
  { code: '3847', label: 'Citroën Trelew' },
] as const

const IGNORED_ENDINGS = new Set(['006001', '012001', '012007', '013001', '013007'])

export const accountEnding = (account: string) => account.replace(/\D/g, '').slice(-6)

const namedTerminals = (concept: string, codes: string[]) =>
  codes.filter((code) => new RegExp(`(?<!\\d)${code}(?!\\d)`).test(concept))

export function bookTerminal(account: string, concept: string) {
  const ending = accountEnding(account)
  if (IGNORED_ENDINGS.has(ending)) return { dealer: '', skip: true }
  if (ending === '001001') return { dealer: '1337', skip: false }
  if (ending === '011001') return { dealer: '3550', skip: false }
  if (ending === '011007') return { dealer: '3847', skip: false }
  if (ending === '002001') {
    const named = namedTerminals(concept, ['1337', '3550'])
    return { dealer: named.length === 1 ? named[0]! : '1337,3550', skip: false }
  }
  if (ending === '006007') {
    return { dealer: /bonif/i.test(concept) ? '3831,3847' : '3831', skip: false }
  }
  return { dealer: '', skip: false }
}

export function normalizeBookAmounts(debitCents: number, creditCents: number) {
  let debit = debitCents
  let credit = creditCents
  if (debit < 0) {
    credit += Math.abs(debit)
    debit = 0
  }
  if (credit < 0) {
    debit += Math.abs(credit)
    credit = 0
  }
  return { debitCents: debit, creditCents: credit }
}

export function terminalLabel(dealer: string) {
  if (dealer === '1337,3550') return '1337 · 3550 · Junín'
  if (dealer === '3831,3847') return '3831 · San Nicolás / 3847 · Trelew'
  const known = TERMINALS.find((terminal) => terminal.code === dealer)
  return known ? `${known.code} · ${known.label}` : (dealer || '—')
}

export const bookFingerprint = (
  date: string,
  reference: string,
  documentNo: string,
  debitCents: number,
  creditCents: number,
  concept: string,
  dealer: string,
) => JSON.stringify(['LIBRO', date, reference, documentNo, debitCents, creditCents, concept, dealer])
