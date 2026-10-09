# MEC en la nube — uso diario

## Entrar

1. Abra en el navegador: **`https://<su-project-id>.web.app`** (guárdelo en favoritos).
2. Inicie sesión con el **correo y contraseña** creados en Firebase Console → Authentication (no use `demo@mec.local`; es solo del emulador).

## Flujo habitual

1. **Importar** — archivos de banco (TXT) y libro Quiter (XLS/XLSX) como en la versión de escritorio.
2. **Conciliar** — preparar partidas y confirmar.
3. **Movimientos / Reportes** — según necesite el cierre.

Los datos quedan en Firestore; no necesita tener la PC encendida ni correr `npm run dev`.

## Datos nuevos vs SQLite antigua

- **Nube vacía al inicio:** importe de nuevo banco y Quiter; concilie en la URL.
- **Historial en `conciliacion.db`:** conserve la base SQLite como consulta hasta decidir una migración (aún no automatizada en el repo).

## Respaldo operativo

Guarde siempre los **archivos fuente** (export banco + Quiter). En plan Spark no hay backup automático de Firestore.

## Actualizar la app tras cambios de código

Desde el repo, con `web/.env.production` configurado:

```bash
npm run firebase:deploy
```

## Volver a SQLite local

Rama `dev`, sin `VITE_BACKEND=firestore` en `web/.env.local`, `npm run dev`. Tag de referencia: `v1-sqlite-stable`.
