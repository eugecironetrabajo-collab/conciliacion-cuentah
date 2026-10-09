# Últimos 3 pasos (solo usted, ~10 minutos)

El código y scripts del repo ya están listos. Falta conectar **su** cuenta Google a Firebase:

1. Siga [`FIREBASE_CONSOLE_SETUP.md`](FIREBASE_CONSOLE_SETUP.md) en la consola web (proyecto, Auth, usuario, Firestore, app Web).
2. En WSL, en la carpeta `recon-h`:

```bash
npx firebase login
npm run firebase:pull-env
npm run firebase:deploy
```

3. Abra `https://conciliacion-cuenta-h.web.app` (o el ID de su proyecto), entre con su usuario de Auth e **importe** banco y Quiter.

Uso diario: [`USO_DIARIO_NUBE.md`](USO_DIARIO_NUBE.md).
