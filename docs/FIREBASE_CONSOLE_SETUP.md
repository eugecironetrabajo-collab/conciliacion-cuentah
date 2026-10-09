# Checklist: proyecto Firebase (una sola vez)

Siga estos pasos en [Firebase Console](https://console.firebase.google.com). Plan **Spark** (gratis), sin Blaze ni tarjeta.

1. **Crear proyecto** (nombre sugerido: `conciliacion-cuenta-h`). Anote el **ID del proyecto**.
2. Verifique que [`.firebaserc`](../.firebaserc) tenga el mismo `default` que ese ID.
3. **Build** → **Authentication** → **Comenzar** → **Correo/contraseña** → **Habilitar**.
4. **Authentication** → **Users** → **Agregar usuario**: su correo de trabajo y una contraseña fuerte.
5. **Build** → **Firestore Database** → **Crear base de datos** → modo producción → región cercana (ej. `southamerica-east1` si aparece).
6. **Configuración del proyecto** (engranaje) → **Sus apps** → icono **Web** `</>` → registrar app → copiar `firebaseConfig`.
7. Pegue esos valores en `web/.env.production` (véase [`web/.env.production.example`](../web/.env.production.example)).

En su PC (WSL), desde la raíz del repo:

```bash
npx firebase login
npm run firebase:pull-env    # escribe web/.env.production desde la app Web del proyecto
# Si pull-env falla: npm run firebase:env-init y pegue las claves manualmente
npm run firebase:deploy
```

URL de la app: `https://<project-id>.web.app`
