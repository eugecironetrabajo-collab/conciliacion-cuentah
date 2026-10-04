import { expect, test } from '@playwright/test'

test('moves individual lines between quadrants with double click', async ({ page }) => {
  await page.goto('/#/conciliar')
  await expect(page.getByRole('heading', { name: 'Partidas pendientes' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Conciliación preparada' })).toBeVisible()

  await page.locator('#pending-grid [data-sel]').first().dblclick()
  await expect(page.locator('#staged-count')).toHaveText('1 partida')
  await page.locator('#staged-grid [data-staged-line]').dblclick()
  await expect(page.locator('#staged-count')).toHaveText('0 partidas')
  await expect(page.getByRole('button', { name: /Confirmar conciliación/ })).toBeDisabled()
})

test('moves multiple pending lines with selection and Enter', async ({ page }) => {
  await page.goto('/#/conciliar')
  const rows = page.locator('#pending-grid [data-sel]')
  await rows.nth(0).click()
  await rows.nth(1).click()
  await expect(page.locator('#selection-bar')).toContainText('2 partidas seleccionadas')
  await page.keyboard.press('Enter')
  await expect(page.locator('#staged-count')).toHaveText('2 partidas')
  await page.locator('#staged-grid [data-staged-line]').first().click()
  await page.keyboard.press('Enter')
  await expect(page.locator('#staged-count')).toHaveText('1 partida')
})

test('import screen states that importing does not reconcile', async ({ page }) => {
  await page.goto('/#/importar')
  await expect(page.getByText('Importación y conciliación son pasos separados')).toBeVisible()
  await expect(page.getByText(/nunca se ejecuta automáticamente/)).toBeVisible()
})

test('assigns responsable from movimientos grid', async ({ page }) => {
  const pendingResponse = await page.request.get('/api/movimientos?estado=PENDIENTE')
  const pendingPayload = await pendingResponse.json()
  const pending = pendingPayload.data.find((row: { status: string; isAdjustment?: boolean }) => row.status === 'PENDIENTE' && !row.isAdjustment)
  expect(pending).toBeTruthy()

  await page.goto('/#/movimientos')
  const select = page.locator(`.assignee-select[data-assignee="${pending.id}"]`)
  await expect(select).toBeVisible()
  await select.selectOption('Pend Bru')

  const updatedResponse = await page.request.get('/api/movimientos?estado=PENDIENTE')
  const updatedPayload = await updatedResponse.json()
  const updated = updatedPayload.data.find((row: { id: number }) => row.id === pending.id)
  expect(updated?.assignee).toBe('Pend Bru')
})

test('sorts movimientos grid by date on header double click', async ({ page }) => {
  await page.goto('/#/movimientos')
  const dateHeader = page.locator('.standard-table button[data-column="date"]')
  await expect(dateHeader).toBeVisible()
  const readDates = () => page.locator('#movement-body tr').evaluateAll((rows) =>
    rows.map((row) => (row as HTMLElement).dataset.date ?? ''))
  expect((await readDates()).length).toBeGreaterThan(1)
  await dateHeader.dblclick()
  await expect(dateHeader).toHaveAttribute('aria-sort', 'ascending')
  assertOrdered(await readDates(), 'asc')
})

test('sorts movimientos grid by id on header double click', async ({ page }) => {
  await page.goto('/#/movimientos')
  const idHeader = page.locator('.standard-table button[data-column="id"]')
  await expect(idHeader).toBeVisible()
  const readIds = () => page.locator('#movement-body tr').evaluateAll((rows) =>
    rows.map((row) => Number((row as HTMLElement).dataset.id ?? 0)))
  const before = await readIds()
  expect(before.length).toBeGreaterThan(1)
  await idHeader.dblclick()
  await expect(idHeader).toHaveAttribute('aria-sort', 'ascending')
  assertOrdered(await readIds(), 'asc')
  await idHeader.dblclick()
  await expect(idHeader).toHaveAttribute('aria-sort', 'descending')
  assertOrdered(await readIds(), 'desc')
  expect(await readIds()).not.toEqual(before)
})

test('filters summary balances by terminal code', async ({ page }) => {
  const amount = (75_000_000 + (Date.now() % 100_000)).toString()
  const amountCell = amount.padStart(15, '0').replace(/(\d{2})$/, ',$1')
  const documentNo = String(Date.now()).padStart(12, '0').slice(-12)
  const chars = Array.from({ length: 207 }, () => ' ')
  const put = (start: number, value: string) => [...value].forEach((character, index) => { chars[start + index] = character })
  put(0, '41110100')
  put(33, documentNo)
  put(47, 'DA')
  put(54, 'SALDO TERMINAL 3550')
  put(120, amountCell)
  put(136, '00000000000,00')
  put(193, '251128')
  await page.goto('/#/importar')
  await page.locator('#dz-txt input').setInputFiles({
    name: '3550-saldo.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(`PEUGEOT${' '.repeat(164)}Tot Cliente ARP3550\r\n${chars.join('')}\r\n${' '.repeat(52)}** Tot. Cuenta 41110100`),
  })
  await expect(page.locator('[data-result="banco"]')).toContainText('1 partidas nuevas')

  await page.goto('/#/resumen')
  const balanceCell = page.locator('#balance-sheet-body tr.total').first().locator('td.number').last()
  const allBalance = await balanceCell.innerText()
  await page.locator('#summary-dealer').selectOption('3550')
  await expect(page.locator('#balance-sheet-caption')).toContainText('3550')
  const filteredBalance = await balanceCell.innerText()
  expect(filteredBalance).not.toBe(allBalance)
})

test('keeps documented movement filters', async ({ page }) => {
  await page.goto('/#/movimientos')
  await expect(page.locator('#f-importe-desde')).toBeVisible()
  await expect(page.locator('#f-proceso-hasta')).toBeVisible()
  await expect(page.locator('input[name="f-estado"]')).toHaveCount(3)
  await expect(page.locator('input[name="f-origen"]')).toHaveCount(3)
  await expect(page.locator('#f-aplicar')).toBeVisible()
})

test('applies bank and date filters in conciliation', async ({ page }) => {
  await page.goto('/#/conciliar')
  await page.locator('#r-dealer').selectOption('1337')
  await page.locator('#r-from').fill('2026-01-01')
  await page.locator('#r-to').fill('2026-12-31')
  await page.locator('#r-aplicar').click()
  await expect(page.locator('#pending-grid')).toBeVisible()
  const dates = await page.locator('#pending-grid [data-date]').evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.date))
  for (const date of dates) expect(date! >= '2026-01-01').toBeTruthy()
  for (const date of dates) expect(date! <= '2026-12-31').toBeTruthy()
})

test('opens a numbered group and reverses all original movements', async ({ page }) => {
  const pendingResponse = await page.request.get('/api/movimientos?estado=PENDIENTE')
  const pendingPayload = await pendingResponse.json()
  const bank = pendingPayload.data.find((row: { origin: string }) => row.origin === 'BANCO')
  const book = pendingPayload.data.find((row: { origin: string }) => row.origin === 'LIBRO')
  expect(bank).toBeTruthy()
  expect(book).toBeTruthy()

  const reconciliationResponse = await page.request.post('/api/reconcile', {
    data: {
      movementIds: [bank.id, book.id],
      adjustment: { reason: 'Diferencia de prueba E2E' },
    },
  })
  expect(reconciliationResponse.ok()).toBeTruthy()
  const reconciliationPayload = await reconciliationResponse.json()
  const reconciliationId = reconciliationPayload.data.reconciliationId

  await page.goto('/#/movimientos')
  await page.locator(`tr[data-reconciliation="${reconciliationId}"]`).first().dblclick()
  await expect(page.getByRole('heading', { name: `Conciliación N.º ${reconciliationId}` })).toBeVisible()
  await page.getByRole('button', { name: 'Preparar reversión' }).click()
  const reversalReference = page.locator('button[data-grid="reversal-active"][data-sort="reference"]')
  await reversalReference.dblclick()
  await expect(reversalReference).toHaveAttribute('aria-sort', 'ascending')
  await page.locator('#reversal-reason').fill('Reversión controlada por prueba E2E')
  await page.getByRole('button', { name: 'Revertir conciliación completa' }).click()
  await expect(page.locator('#toast')).toContainText(`Conciliación ${reconciliationId} revertida`)

  const detailResponse = await page.request.get(`/api/reconciliaciones/${reconciliationId}`)
  const detail = await detailResponse.json()
  expect(detail.data.status).toBe('REVERTIDA')
})

test('imports several bank files once and restores a logically deleted movement', async ({ page }) => {
  const documentNo = String(Date.now()).padStart(12, '0').slice(-12)
  const chars = Array.from({ length: 207 }, () => ' ')
  const put = (start: number, value: string) => [...value].forEach((character, index) => { chars[start + index] = character })
  put(0, '41110100')
  put(33, documentNo)
  put(47, 'DA')
  put(54, 'FLETE E2E')
  put(120, '00000000125,50')
  put(136, '00000000000,00')
  put(193, '251128')
  const content = Buffer.from(`${chars.join('')}\n${chars.join('')}`)
  await page.goto('/#/importar')
  await page.locator('#dz-txt input').setInputFiles([
    { name: 'banco-a.txt', mimeType: 'text/plain', buffer: content },
    { name: 'banco-b.txt', mimeType: 'text/plain', buffer: content },
  ])
  await expect(page.locator('[data-result="banco"]')).toContainText('1 partidas nuevas')
  await expect(page.locator('[data-result="banco"]')).toContainText('Sin conciliación automática')

  await page.goto('/#/movimientos')
  await page.locator('#f-orden').fill(documentNo)
  await page.locator('#f-aplicar').click()
  await expect(page.locator('#movement-body tr')).toHaveCount(1)
  await page.locator('.row-check').check()
  await page.locator('#delete-selected').click()
  await page.locator('#delete-reason').fill('Eliminación de prueba E2E')
  await page.locator('#confirm-delete').click()
  await expect(page.locator('#toast')).toContainText('1 movimiento(s) eliminados')

  await page.locator('input[name="f-estado"][value="PENDIENTE"]').uncheck()
  await page.locator('input[name="f-estado"][value="CONCILIADO"]').uncheck()
  await page.locator('input[name="f-estado"][value="ELIMINADO"]').check()
  await page.locator('#f-orden').fill(documentNo)
  await page.locator('#f-aplicar').click()
  await expect(page.locator('#movement-body tr')).toHaveCount(1)
  await page.locator('.row-check').check()
  await page.locator('#restore-selected').click()
  await expect(page.locator('#toast')).toContainText('1 movimiento(s) restaurados')

  await page.locator('input[name="f-estado"][value="CONCILIADO"]').uncheck()
  await page.locator('input[name="f-estado"][value="ELIMINADO"]').uncheck()
  await page.locator('#f-orden').fill(documentNo)
  await page.locator('#f-aplicar').click()
  await expect(page.locator('#movement-body tr')).toHaveCount(1)
  await page.locator('.row-check').check()
  await page.locator('#delete-selected').click()
  await page.locator('#delete-reason').fill('Borrado definitivo de prueba')
  await page.locator('#confirm-delete').click()
  await expect(page.locator('#toast')).toContainText('1 movimiento(s) eliminados')
  await page.locator('input[name="f-estado"][value="PENDIENTE"]').uncheck()
  await page.locator('input[name="f-estado"][value="ELIMINADO"]').check()
  await page.locator('#f-orden').fill(documentNo)
  await page.locator('#f-aplicar').click()
  await expect(page.locator('#movement-body tr')).toHaveCount(1)
  await page.locator('.row-check').check()
  await page.locator('#purge-selected').click()
  await page.locator('#confirm-purge').click()
  await expect(page.locator('#toast')).toContainText('1 movimiento(s) borrados definitivamente')
})

test('filters a partial receipt and an amount, and shows separate balances', async ({ page }) => {
  const documentNo = `000104${String(Date.now()).slice(-6)}`
  const cents = 80_000_000 + (Date.now() % 100_000)
  const amount = (cents / 100).toFixed(2).replace('.', ',').padStart(15, '0')
  const chars = Array.from({ length: 207 }, () => ' ')
  const put = (start: number, value: string) => [...value].forEach((character, index) => { chars[start + index] = character })
  put(0, '41110100')
  put(33, documentNo)
  put(47, 'AB')
  put(54, 'SALDO FILTRO')
  put(120, amount)
  put(136, '00000000000,00')
  put(193, '251128')
  await page.goto('/#/importar')
  await page.locator('#dz-txt input').setInputFiles({
    name: 'filtro.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(chars.join('')),
  })
  await expect(page.locator('[data-result="banco"]')).toContainText('1 partidas nuevas')

  await page.goto('/#/movimientos')
  await page.locator('#f-comprobante').fill(documentNo.slice(-4))
  const shown = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)
  await page.locator('#f-importe-desde').fill(shown)
  await page.locator('#f-importe-hasta').fill(shown)
  await page.locator('#f-aplicar').click()
  await expect(page.locator('#movement-body tr')).toHaveCount(1)
  await expect(page.locator('#movement-body tr')).toContainText(`AB ${documentNo}`)
  const today = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
  await expect(page.locator('#movement-body tr')).toContainText(today)

  await page.goto('/#/resumen')
  await expect(page.getByRole('cell', { name: 'Saldo banco' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '(+) Débitos libros' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '(−) Créditos bancos' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Saldo libros' })).toBeVisible()
  await expect(page.getByText('Total débitos')).toHaveCount(0)
})

test('sorts conciliation grids and filters pending rows by concept', async ({ page }) => {
  await page.goto('/#/conciliar')
  await expect(page.locator('#r-concepto')).toBeVisible()
  const pending = page.locator('#pending-grid [data-sel]')
  await expect(pending.first()).toBeVisible()

  const read = async (name: 'date' | 'bankDebit' | 'notes') =>
    pending.evaluateAll((rows, key) => rows.map((row) => (row as HTMLElement).dataset[key] ?? ''), name)

  const dateHeader = page.locator('.top-ledger button[data-column="date"]')
  await dateHeader.dblclick()
  await expect(dateHeader).toHaveAttribute('aria-sort', 'ascending')
  assertOrdered(await read('date'), 'asc')
  await dateHeader.dblclick()
  await expect(dateHeader).toHaveAttribute('aria-sort', 'descending')
  assertOrdered(await read('date'), 'desc')

  const amountHeader = page.locator('.top-ledger button[data-column="bank-debit"]')
  await amountHeader.dblclick()
  await expect(amountHeader).toHaveAttribute('aria-sort', 'descending')
  assertOrdered((await read('bankDebit')).map(Number), 'desc')
  await amountHeader.dblclick()
  assertOrdered((await read('bankDebit')).map(Number), 'asc')

  const notesHeader = page.locator('.top-ledger button[data-column="notes"]')
  await notesHeader.dblclick()
  await expect(notesHeader).toHaveAttribute('aria-sort', 'ascending')
  assertOrdered(await read('notes'), 'asc', (left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
  await notesHeader.dblclick()
  await expect(notesHeader).toHaveAttribute('aria-sort', 'descending')
  assertOrdered(await read('notes'), 'desc', (left, right) => left.localeCompare(String(right), 'es', { sensitivity: 'base' }))

  await page.locator('#r-concepto').fill('')
  const stagedTarget = page.locator('#pending-grid [data-sel]').first()
  await stagedTarget.dblclick()
  await expect(page.locator('#staged-grid [data-staged-line]')).toHaveCount(1)

  await page.locator('#r-concepto').fill('comp pp')
  const visibleNotes = await page.locator('#pending-grid [data-sel]').evaluateAll((rows) =>
    rows.map((row) => (row as HTMLElement).dataset.notes ?? ''))
  for (const note of visibleNotes) expect(note.toLocaleLowerCase('es')).toContain('comp pp')
  await expect(page.locator('#staged-grid [data-staged-line]')).toHaveCount(1)

  await page.locator('#r-concepto').fill('texto-que-no-esta-en-ninguna-observacion')
  await expect(page.locator('#pending-grid [data-sel]')).toHaveCount(0)
  await expect(page.locator('#staged-grid [data-staged-line]')).toHaveCount(1)
})

function assertOrdered(
  values: Array<string | number>,
  direction: 'asc' | 'desc',
  compare: (left: string | number, right: string | number) => number = (left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
) {
  for (let index = 1; index < values.length; index += 1) {
    const compared = compare(values[index - 1], values[index])
    if (direction === 'asc') expect(compared).toBeLessThanOrEqual(0)
    else expect(compared).toBeGreaterThanOrEqual(0)
  }
}
