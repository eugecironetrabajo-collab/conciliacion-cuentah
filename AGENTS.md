# Conciliación Cuenta H — Guía para agentes

## Propósito

Aplicación web para conciliar movimientos bancarios de Cuenta H contra el mayor
contable de Quiter. Es una aplicación full-stack web; no es un CLI y no debe
introducirse una interfaz de comandos paralela sin un requerimiento explícito.

La documentación funcional para usuarios está en [`README.md`](README.md).

## Aislamiento entre empresas

- Modelo **una instalación por cliente**: URL, `.env`, volumen `data/` y dominio propios.
- No es multi-tenant: no filtrar por `company_id` ni compartir una instalación entre empresas.
- Los archivos importados se procesan en memoria; la persistencia es SQLite (`DB_PATH`).
- Multi-usuario dentro de la misma empresa está planificado en [`docs/ROADMAP.md`](docs/ROADMAP.md); no implementar multi-tenant global sin requerimiento explícito.

## Arquitectura actual

- Backend: Express + TypeScript en [`src/server.ts`](src/server.ts).
- Persistencia: SQLite con `better-sqlite3` en [`src/db.ts`](src/db.ts).
- Importación: banco, Quiter y formatos delimitados en [`src/importers.ts`](src/importers.ts).
- Conciliación, candidatos y propuestas automáticas en [`src/reconcile.ts`](src/reconcile.ts).
- Reglas de terminales y cuentas en [`src/terminals.ts`](src/terminals.ts).
- Frontend: SPA Vanilla TypeScript en [`web/src/main.ts`](web/src/main.ts).
- Estilos: Tailwind CSS v4 en [`web/src/style.css`](web/src/style.css).
- Pruebas unitarias: [`tests/`](tests/).
- Pruebas E2E: [`e2e/web.spec.ts`](e2e/web.spec.ts).

La API de desarrollo escucha en `43128` y Vite sirve la web en `43127`.
Vite hace proxy de `/api` hacia la API.

## Desarrollo y verificación

Se requiere Node.js 22 o posterior y `npm`.

```bash
npm install
npm run dev        # API + Vite
npm run dev:api    # solo API
npm run dev:web    # solo Vite
npm run check      # chequeo TypeScript
npm test           # pruebas unitarias con node --test
npm run test:e2e   # pruebas E2E con Playwright
npm run build      # check + build de Vite
npm start          # producción: sirve dist/ + API
```

La base predeterminada es `data/conciliacion.db`. Puede cambiarse con
`DB_PATH`; el puerto de la API puede cambiarse con `PORT`. Las pruebas E2E usan
una base aislada configurada en [`playwright.config.ts`](playwright.config.ts).
No usar la base principal para pruebas.

Antes de modificar parsers, persistencia o conciliación:

1. Ejecutar las pruebas relacionadas.
2. Ejecutar `npm run check`.
3. Ejecutar `npm test`.
4. Ejecutar `npm run test:e2e` cuando el cambio afecte la UI o la API.

## Invariantes de negocio

- Importar y conciliar son operaciones separadas. Importar nunca debe conciliar
  automáticamente.
- Los movimientos tienen estados `PENDIENTE`, `CONCILIADO` y `ELIMINADO`.
- `ELIMINADO` es baja lógica; el borrado definitivo es una operación distinta y
  restringida.
- Las conciliaciones son grupos 1:1, 1:N o N:1 y pueden incluir un ajuste.
- Revertir una conciliación revierte el grupo completo; no se debe revertir una
  línea individual de un grupo activo.
- Los importes se normalizan y se almacenan en centavos. No comparar importes
  mediante strings formateados.
- La reimportación debe ser idempotente: los fingerprints evitan duplicados.
- Las mutaciones relevantes deben conservar su trazabilidad en auditoría.
- Los movimientos eliminados no deben participar en listas normales, saldos,
  sugerencias ni matching.

La propuesta automática exige importe opuesto exacto y utiliza distancia de
fechas y referencias para puntuar candidatos. No asumir que filtra por dealer o
por terminación de cuenta.

## Formatos de entrada

- Banco: listados Stellantis de ancho fijo; también existen cargas delimitadas
  auxiliares.
- Libro: exportación de Quiter, normalmente hoja `Informe`.
- Los parsers actuales y sus posiciones validadas están implementados en
  [`src/importers.ts`](src/importers.ts). No inventar un parser SAP ni asumir
  formatos que no estén respaldados por código y pruebas.

## Reglas de cambio

- Planificar antes de programar cualquier cambio no trivial y esperar la
  aprobación del plan antes de editar código.
- Elegir el stack y las dependencias según el tipo de producto y el uso real de
  la aplicación. Preferir librerías conocidas, mantenidas y compatibles con el
  stack existente.
- Usar `npm` como gestor de paquetes. No cambiar de gestor sin una razón
  técnica explícita.
- Nunca hardcodear secretos, credenciales, tokens ni claves privadas. Usar
  variables de entorno y mantener los archivos locales de secretos fuera del
  repositorio.
- Para nuevas o modificadas pantallas, mantener Tailwind CSS v4 y respetar
  [`DESIGN.md`](DESIGN.md) si ese archivo existe. Si se dispone de una skill de
  diseño frontend adecuada, puede consultarse antes de diseñar una vista.
- Para documentación actualizada de paquetes, consultar una fuente oficial o
  una skill de documentación disponible en el entorno; no asumir que una API
  está vigente solo por conocimiento previo.
- Reutilizar la lógica de dominio del backend; no duplicarla innecesariamente en
  el frontend.
- Mantener separadas las capas de importación, persistencia, conciliación y
  presentación.
- No crear `src/index.ts`, `src/commands/`, comandos CLI ni rutas antiguas salvo
  requerimiento explícito.
- No asumir puertos `3000`/`5173`, `examples/demo.db` ni una tabla `pairs` como
  modelo principal.
- No modificar la base `data/conciliacion.db` durante pruebas o experimentos.
- Los cambios que alteren comportamiento de negocio deben incluir o actualizar
  pruebas que describan el nuevo comportamiento.
- No dar por terminada una tarea de código sin ejecutar las pruebas
  proporcionales al cambio y reportar su resultado. Los unitarios de este repo
  usan `node --test`, no Vitest; los E2E usan `@playwright/test`.
- Actualizar [`README.md`](README.md) cuando cambien la instalación, los
  comandos, el comportamiento funcional o el flujo de colaboración. No
  modificarlo por cambios internos que no afecten su documentación.
- Si durante el trabajo se descubre una regla estable y relevante para futuros
  cambios, actualizar este archivo y el README solo donde corresponda.
- No crear commits ni hacer push automáticamente. Solo crear commits, modificar
  ramas o hacer push cuando el usuario lo solicite explícitamente.
- Nunca eliminar commits, ramas ni historial de Git salvo solicitud explícita
  del usuario.

## Archivos de referencia rápida

| Necesidad | Archivo |
|---|---|
| Endpoint o servidor | `src/server.ts` |
| SQL, migraciones y estados | `src/db.ts` |
| Parseo e importación | `src/importers.ts` |
| Matching y propuestas | `src/reconcile.ts` |
| Dealers y cuentas | `src/terminals.ts` · skill [`.cursor/skills/mec-terminales-cuenta-h/SKILL.md`](.cursor/skills/mec-terminales-cuenta-h/SKILL.md) |
| Pantallas y flujo UI | `web/src/main.ts` |
| Estilos | `web/src/style.css` |
| Puertos y proxy | `vite.config.ts` |
| Pruebas E2E | `e2e/web.spec.ts` |
