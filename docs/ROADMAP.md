# Roadmap de MEC

## Modelo actual: una instalación por empresa

Cada empresa opera su propia instancia con URL, credenciales y base SQLite independientes. Los datos no se comparten entre instalaciones. Ver [`DEPLOY.md`](DEPLOY.md) para el checklist de entrega a clientes.

## Futuro: varios usuarios en la misma empresa

Hoy cada instalación admite **un administrador** (`ADMIN_USER` / `ADMIN_PASSWORD`). Todos los usuarios que entren con esas credenciales ven los mismos movimientos de esa empresa.

### Objetivo

Permitir 2–5 usuarios con login propio dentro de la **misma instalación** (misma empresa, misma base), por ejemplo:

- Contador A y Contador B de la misma concesionaria
- Mismos movimientos, conciliaciones y reportes
- Auditoría con `actor` por usuario

### Alcance previsto (no implementado)

- Tabla `users` en SQLite con contraseñas hasheadas
- Pantalla de administración de usuarios (o carga inicial por variables de entorno)
- Login contra usuarios de la base, no solo `ADMIN_USER`
- Mantener una sola base por empresa (sin multi-tenant entre empresas)

### Fuera de alcance

- Multi-tenant: varias empresas en una sola URL compartiendo código pero con datos separados por `company_id`
- SSO / OAuth
- Roles granulares (solo lectura vs edición) en la primera iteración

Este desarrollo es independiente del aislamiento entre empresas: cada empresa seguiría teniendo su propia instalación; dentro de ella habría varios usuarios.
