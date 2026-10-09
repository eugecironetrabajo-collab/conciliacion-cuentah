# MEC en Firebase (plan Spark, sin costo)

Despliegue **gratuito** con Firebase Hosting + Firestore + Authentication. **No usa Cloud Functions** (evita plan Blaze y tarjeta).

La versión SQLite/Docker sigue disponible con el tag Git `v1-sqlite-stable` y la rama `dev`.

## Requisitos

- Cuenta Google
- Proyecto Firebase en plan **Spark** (gratuito)
- Node.js 22+ y `npm`

## 1. Crear proyecto Firebase

1. [Firebase Console](https://console.firebase.google.com) → Crear proyecto.
2. **Authentication** → Método **Correo/contraseña** → Habilitar.
3. Crear un usuario (correo + contraseña) para la empresa o la demo del curso.
4. **Firestore Database** → Crear base en modo producción (reglas se despliegan desde el repo).
5. **Hosting** → Seguir el asistente solo si hace falta; el repo ya trae `firebase.json`.

Copie la configuración web del proyecto (Configuración del proyecto → Sus apps → Web).

## 2. Variables de entorno

| Archivo | Uso |
|---------|-----|
| [`web/.env.local`](web/.env.local) | Emuladores (`VITE_FIREBASE_EMULATOR=true`, claves demo) |
| [`web/.env.production`](web/.env.production) | **Deploy a la nube** (claves reales de la consola, sin emulador) |

Checklist de consola (proyecto, Auth, Firestore, usuario): [`docs/FIREBASE_CONSOLE_SETUP.md`](FIREBASE_CONSOLE_SETUP.md).

Inicializar plantilla de producción:

```bash
npm run firebase:env-init
```

Edite `web/.env.production` con los valores de Firebase Console → Su app web. El build de deploy usa `vite build --mode production` y **sobrescribe** `web/.env.local` para esas variables.

Para desarrollo con emuladores, en `web/.env.local`:

```env
VITE_FIREBASE_EMULATOR=true
```

## 3. Emuladores locales (opcional)

Requiere **Java 21+** (el repo puede usar `.tools/jdk-21.0.6+7-jre` tras la primera ejecución de `npm run emulators`).

Solo debe haber **una** instancia de emuladores. Si aparece `port taken` en 9099 u 8080, o reutilizá la instancia ya activa (http://127.0.0.1:4000) o detenela con `npm run emulators:stop` y volvé a arrancar.

Terminal 1:

```bash
npm run emulators
```

Terminal 2, con [`web/.env.local`](web/.env.local) como en la sección 2 más `VITE_FIREBASE_EMULATOR=true`:

```bash
npm run dev:web
```

Abrí **http://127.0.0.1:43127**. Usuario de prueba en emulador (creado con la API del emulador o en http://127.0.0.1:4000/auth):

- Correo: `demo@mec.local`
- Contraseña: `demo1234`

## 4. Desplegar a la nube (gratis)

1. `npx firebase login` (una vez por máquina).
2. Complete `web/.env.production` (véase sección 2).
3. Verifique [`.firebaserc`](../.firebaserc) (`projectId` = consola).

```bash
npm run firebase:deploy
```

La app queda en `https://<project-id>.web.app`. Uso diario: [`docs/USO_DIARIO_NUBE.md`](USO_DIARIO_NUBE.md).

## 5. Cupos Spark (orientativo)

- Firestore: lecturas/escrituras diarias limitadas (suficiente para un equipo pequeño).
- Hosting: tráfico moderado incluido.

Si se superan los cupos, use el rollback SQLite (`v1-sqlite-stable`) en WSL o VPS; no es obligatorio pagar Firebase.

## 6. Seguridad

`firestore.rules` permite leer/escribir solo usuarios autenticados. Es adecuado para una instalación interna por empresa; no es multi-tenant público.

## 7. Desarrollo clásico (SQLite)

Sin `VITE_BACKEND=firestore` (o con `VITE_BACKEND=api`):

```bash
npm run dev
```

Sigue usando Express + SQLite como antes.
