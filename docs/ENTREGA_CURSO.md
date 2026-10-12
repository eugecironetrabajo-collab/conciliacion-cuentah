# Entrega — proyecto con agente IA (consigna del curso)

Documento de apoyo para copiar o adjuntar en la plataforma del curso. **No incluir contraseñas ni tokens.**

## Repositorio

- URL: https://github.com/eugecironetrabajo-collab/conciliacion-cuentah
- Rama de referencia: **`main`** (incluye skill, Firestore y documentación actualizada; commit `f1f2be8` en adelante).

### Visibilidad pública (requisito de la consigna)

El repositorio debe figurar como **Public** en GitHub:

1. Repo → **Settings** → **General** → sección **Danger Zone** / visibilidad.
2. Elegir **Change visibility** → **Public**.

Comprobación sin login: `https://api.github.com/repos/eugecironetrabajo-collab/conciliacion-cuentah` debe responder **200** (no 404).

## Desarrollo con agente de IA y planificación

La aplicación **Conciliación Cuenta H** se construyó y evolucionó con **Cursor** (agente de IA), siguiendo [`AGENTS.md`](../AGENTS.md) como reglas del proyecto.

Antes de cambios relevantes se usó **planificación en Cursor** (por ejemplo el plan y la implementación de la skill de terminales), y commits incrementales con revisión de pruebas.

## Skill utilizada

- Ruta: [`.cursor/skills/mec-terminales-cuenta-h/SKILL.md`](../.cursor/skills/mec-terminales-cuenta-h/SKILL.md)
- Dominio: terminaciones de cuenta contable (últimos seis dígitos del mayor Quiter) → códigos de terminal/dealer.
- Código fuente de verdad: [`src/terminals.ts`](../src/terminals.ts)
- Contrato de pruebas: [`tests/terminals.test.ts`](../tests/terminals.test.ts)

## Verificaciones ejecutadas (antes de dar por terminado)

Desde la raíz del proyecto, con Node.js 22+:

```bash
npm run check   # TypeScript
npm test        # pruebas unitarias (node --test)
npm run test:e2e # Playwright
```

Última corrida documentada en este entregable (rama `main`):

| Comando | Resultado |
|---------|-----------|
| `npm run check` | OK |
| `npm test` | OK — 41 tests |
| `npm run test:e2e` | OK — 17 tests (Playwright; backend API forzado en `playwright.config.ts` para no mezclar con `web/.env.local` Firestore) |

## Prueba manual

Se verificó manualmente el flujo principal:

- **Importar** listados banco y mayor Quiter (partidas quedan pendientes; no concilia solo).
- **Conciliar** con selección manual o búsqueda automática y confirmación de grupo.
- **Movimientos**: filtros, eliminación lógica y detalle de conciliación.

Demo en producción (Firebase, login requerido): https://conciliacion-cuenta-h.web.app

## Acceso a la demo (fuera del repositorio)

Las credenciales de Firebase Auth **no** van en GitHub. Entregarlas por el canal privado del curso (correo, Moodle, etc.):

- URL: https://conciliacion-cuenta-h.web.app
- Usuario: _(completar al enviar al profesor)_
- Contraseña: _(completar al enviar al profesor; nunca en el repo)_

## Texto sugerido para el informe (un párrafo)

> Se desarrolló la aplicación web Conciliación Cuenta H con agente de IA en Cursor, planificando cambios antes de implementarlos y siguiendo AGENTS.md. Se incorporó la skill de proyecto `mec-terminales-cuenta-h`, alineada con `src/terminals.ts` y validada por `tests/terminals.test.ts`. El repositorio público en GitHub incluye README, pruebas unitarias y E2E, y se ejecutaron las verificaciones (`npm run check`, `npm test`, `npm run test:e2e`) además de prueba manual del flujo importar/conciliar.

## Checklist rápido (13 ítems de la consigna)

| Ítem | Dónde se cumple |
|------|-----------------|
| Agente de IA | Informe + historial Git / uso de Cursor |
| Planificación previa | Planes Cursor + este documento |
| AGENTS.md | Raíz del repo |
| README.md | Raíz del repo |
| Al menos una Skill | `.cursor/skills/mec-terminales-cuenta-h/` |
| Tests unitarios | `tests/`, `npm test` |
| Tests E2E | `e2e/`, `npm run test:e2e` |
| Verificaciones | Sección anterior |
| Prueba manual | Sección anterior |
| Git | GitHub |
| Repo público | Settings → Public (ver arriba) |
| AGENTS y README visibles | Raíz en `main` |
| Sin credenciales en repo | Solo `.env.example`; sin `.env` commiteado |
