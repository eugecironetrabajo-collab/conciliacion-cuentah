# Referencia: terminaciones y terminales

## Terminales banco (`TERMINALS`)

| Código | Etiqueta |
|--------|----------|
| 1337 | Peugeot Pergamino |
| 3550 | Peugeot Trelew |
| 3831 | Citroën San Nicolás |
| 3847 | Citroën Trelew |

## Terminaciones ignoradas (`IGNORED_ENDINGS`)

No importar filas con estas terminaciones (últimos 6 dígitos de cuenta mayor):

- `006001`, `012001`, `012007`, `013001`, `013007`

## Terminación → dealer (libro)

| Terminación | Dealer | Notas |
|-------------|--------|--------|
| 001001 | 1337 | Peugeot Pergamino |
| 011001 | 3550 | Peugeot Trelew |
| 011007 | 3847 | Citroën Trelew |
| 002001 | 1337 o 3550 o `1337,3550` | Ver concepto |
| 006007 | 3831 o `3831,3847` | `3831,3847` si concepto contiene “bonif” (case insensitive) |

## Etiquetas UI por terminación (`ENDING_LABELS`)

| Terminación | Lugar mostrado en movimientos libro |
|-------------|-------------------------------------|
| 001001 | Peugeot Pergamino |
| 011001 | Peugeot Trelew |
| 002001 | Peugeot Junín |
| 006007 | Citroën San Nicolás |
| 011007 | Citroën Trelew |

## Ejemplos de tests (contrato)

Tomados de [`tests/terminals.test.ts`](../../../tests/terminals.test.ts):

- Cuenta `211112001001` → dealer `1337`
- Cuenta `211112002001`, concepto `DEBITO CUENTA H 3550` → dealer `3550` (un solo código en concepto)
- Cuenta `211112002001`, concepto `Doc. ANC 4714` → dealer `1337,3550`
- Cuenta `211112006007`, concepto `BONIF.VOLUMEN AC` → dealer `3831,3847`
- Cuenta `211112006001` → omitida en importación

## Dealers compuestos en UI

- `1337,3550` → “1337 · 3550 · Junín”
- `3831,3847` → “3831 · San Nicolás / 3847 · Trelew”
