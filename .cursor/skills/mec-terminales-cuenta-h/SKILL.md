---
name: mec-terminales-cuenta-h
description: >-
  Reglas de terminales banco y terminaciones de cuenta contable (libro Quiter) en
  MEC. Usar al modificar dealers, importación libro, movementLabel, filtros por
  terminal, o al explicar filas omitidas en importación.
---

# Terminales y cuentas contables (MEC)

## Fuente de verdad

- Código: [`src/terminals.ts`](../../../src/terminals.ts)
- Pruebas: [`tests/terminals.test.ts`](../../../tests/terminals.test.ts)
- Aplicación en import: [`src/importers.ts`](../../../src/importers.ts) (`bookTerminal`, `normalizeBookAmounts`)

No duplicar tablas de mapeo en el frontend. Cambios de reglas van en `terminals.ts` + tests.

## Conceptos

| Campo | Banco | Libro (Quiter) |
|-------|-------|----------------|
| `dealer` | Código terminal del listado Stellantis / resumen (ej. `1337`) | Derivado de terminación de cuenta + concepto |
| `sector` | Cuenta fija `41110100` en ancho fijo | **Cuenta mayor** del Excel |
| Terminación | N/A | Últimos **6 dígitos** numéricos de la cuenta (`accountEnding`) |

`dealer` puede ser un código simple o una lista compartida: `1337,3550` o `3831,3847`.

## Reglas `bookTerminal(cuenta, concepto)`

1. Si la terminación está en **IGNORED_ENDINGS** → `{ skip: true }` (la fila no se importa; error en importación).
2. Mapeos fijos:
   - `001001` → `1337`
   - `011001` → `3550`
   - `011007` → `3847`
3. `002001` (Junín): si el concepto menciona **exactamente uno** de `1337` o `3550` (como token numérico), usar ese código; si no, `1337,3550`.
4. `006007` (Citroën San Nicolás): `3831`; si el concepto coincide con `/bonif/i`, `3831,3847`.
5. Cualquier otra terminación conocida sin regla → `dealer: ''`, `skip: false` (se importa; dealer puede venir de `Cta.pers.`).

Detalle y ejemplos: [reference.md](reference.md).

## Importes libro

Quiter puede exportar Debe/Haber negativos. Siempre normalizar con `normalizeBookAmounts` antes de persistir. No comparar importes por strings formateados (centavos en código).

## UI

- `terminalLabel(dealer)`: etiqueta legible para banco y dealers simples/compuestos.
- `movementLabel(origin, dealer, sector)`: en **LIBRO** prioriza terminación + lugar (`ENDING_LABELS`); en **BANCO** usa `terminalLabel(dealer)`.

## Invariantes (no romper)

- La propuesta automática de conciliación **no** filtra por dealer ni por terminación (ver [`AGENTS.md`](../../../AGENTS.md)).
- Tras cambiar reglas: `npm test` (mínimo `tests/terminals.test.ts`).
- No agregar terminaciones nuevas sin requerimiento explícito del usuario y test que lo documente.

## Cuándo leer esta skill

- Editar parsers Quiter, filtros por dealer en resumen/movimientos, o columnas Terminal en UI.
- Diagnosticar “fila omitida” en importación de mayor.
- Revisar PRs que toquen `terminals.ts` o dealer en movimientos libro.
