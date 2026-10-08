# Despliegue de MEC en VPS

MEC sigue el modelo **una instalación por cliente**: cada empresa tiene su propia URL, base SQLite y administrador. No es multi-tenant.

## Privacidad y aislamiento de datos

| Pregunta | Respuesta |
|---|---|
| ¿El repositorio GitHub contiene movimientos importados? | **No.** Solo código fuente. |
| ¿Se guardan los archivos `.txt` / `.xls` originales? | **No.** Se procesan en memoria al importar; los datos quedan en SQLite. |
| ¿Dónde viven los datos de cada empresa? | En `data/conciliacion.db` de **su** servidor (volumen Docker o ruta `DB_PATH`). |
| ¿Pueden dos empresas compartir la misma URL? | **No recomendado.** Una instalación compartida expone los mismos movimientos a todos los usuarios que entren. |
| ¿Cómo se aísla cada empresa? | Instalación independiente: VPS o directorio propio, `.env` propio, volumen `data/` propio, dominio propio. |

**Regla operativa:** nunca reutilizar el mismo `.env`, volumen `data/` ni base SQLite entre empresas distintas.

## Requisitos

- VPS con Ubuntu 22.04 o posterior
- Docker y Docker Compose
- Dominio apuntando al servidor (para HTTPS)
- Node.js 22 solo si despliega sin Docker

## Despliegue con Docker (recomendado)

### 1. Preparar el servidor

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER
```

Cierre sesión y vuelva a entrar para usar Docker sin `sudo`.

### 2. Clonar el repositorio

```bash
git clone https://github.com/eugecironetrabajo-collab/conciliacion-cuentah.git
cd conciliacion-cuentah
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
```

Edite `.env` y defina al menos:

| Variable | Descripción |
|---|---|
| `ADMIN_USER` | Usuario administrador de esta instalación |
| `ADMIN_PASSWORD` | Contraseña fuerte |
| `SESSION_SECRET` | Cadena aleatoria larga para firmar cookies |
| `NODE_ENV` | Debe ser `production` en el VPS |

En producción el login es obligatorio. Sin `SESSION_SECRET` la aplicación no arranca.

### 4. Levantar la aplicación

```bash
docker compose up -d --build
```

La app queda disponible en `http://SERVIDOR:43128`. La base SQLite se guarda en `./data/conciliacion.db` mediante un volumen persistente.

Para política de reinicio explícita:

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build
```

### 5. HTTPS con Nginx y Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/mec
```

Ajuste `server_name` con su dominio, active el sitio y obtenga el certificado:

```bash
sudo ln -s /etc/nginx/sites-available/mec /etc/nginx/sites-enabled/mec
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d mec.ejemplo.com
```

Certbot configurará HTTPS y la renovación automática.

### 6. Backups diarios

```bash
chmod +x deploy/backup.sh
crontab -e
```

Agregue una línea como:

```cron
15 2 * * * /ruta/al/repo/deploy/backup.sh >> /var/log/mec-backup.log 2>&1
```

Los respaldos se guardan en `data/backups/` con fecha y hora.

## Despliegue sin Docker

```bash
npm ci
npm run build
cp .env.example .env
# Editar .env con NODE_ENV=production y credenciales
NODE_ENV=production npm start
```

Use un proceso supervisor (`systemd`, `pm2`, etc.) y un reverse proxy Nginx igual que en el flujo Docker.

## Servicio local (WSL / systemd)

Para dejar MEC corriendo en segundo plano en tu PC sin ejecutar `npm run dev` cada vez:

### 1. Preparar entorno

```bash
cp .env.example .env
# Editar .env: NODE_ENV=production, ADMIN_PASSWORD, SESSION_SECRET
npm run build
```

Genere `SESSION_SECRET` con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Instalar el servicio

Copie la plantilla y ajuste las rutas si su usuario o instalación de Node difieren:

```bash
mkdir -p ~/.config/systemd/user
cp deploy/mec.service.example ~/.config/systemd/user/mec.service
systemctl --user daemon-reload
systemctl --user enable --now mec
```

Para que el servicio siga activo sin una sesión interactiva abierta:

```bash
sudo loginctl enable-linger $USER
```

### 3. Comandos de operación

| Acción | Comando |
|---|---|
| Ver estado | `systemctl --user status mec` |
| Reiniciar tras cambios de código | `npm run build && systemctl --user restart mec` |
| Ver logs | `journalctl --user -u mec -f` |
| Detener | `systemctl --user stop mec` |

La app queda en `http://127.0.0.1:43128` con login activo.

### 4. Arranque con Windows (WSL)

El servicio arranca cuando **WSL arranca**. Por defecto WSL no se inicia al prender la PC.

- **Manual:** abrir una terminal WSL una vez por sesión de Windows.
- **Automático:** crear una tarea programada en Windows que ejecute `wsl -d <distro> --exec true` al iniciar sesión.

### 5. Acceso desde otra PC en la red local (opcional)

El servidor escucha en `0.0.0.0`. Desde otra PC en la misma red:

`http://<IP-de-tu-PC-en-WSL>:43128`

Requiere permitir el puerto 43128 en el firewall de Windows. Solo recomendable en red de confianza.

## Verificación del primer deploy

1. Abra la URL pública y confirme la pantalla de login.
2. Ingrese con `ADMIN_USER` / `ADMIN_PASSWORD`.
3. Importe un archivo de prueba desde **Importar**.
4. Concilie una partida en **Conciliar**.
5. Revise **Auditoría** y confirme que el actor registrado es el usuario logueado.
6. Ejecute un backup manual con `deploy/backup.sh`.

## Entregar a un nuevo cliente (checklist)

Use esta lista para cada empresa. No comparta instalaciones entre clientes.

| Paso | Acción | Verificación |
|---|---|---|
| 1 | Nuevo VPS o directorio aislado en el servidor | Rutas y contenedores distintos por cliente |
| 2 | `git clone` del repositorio | Mismo código, distinto entorno |
| 3 | `cp .env.example .env` con `ADMIN_PASSWORD` y `SESSION_SECRET` únicos | Credenciales distintas por cliente |
| 4 | Volumen `data/` propio (`./data:/app/data` en Docker) | Base SQLite vacía al inicio |
| 5 | Dominio propio (ej. `mec.cliente.com`) + HTTPS | URL exclusiva del cliente |
| 6 | `docker compose up -d --build` | Login funcional |
| 7 | Importar archivo de prueba y conciliar una partida | Datos solo en su `conciliacion.db` |
| 8 | Configurar backup diario (`deploy/backup.sh`) | Respaldo en `data/backups/` |

No se requieren cambios de código por cliente. El aislamiento es por infraestructura, no por lógica multi-empresa en la aplicación.

## Comandos útiles

```bash
docker compose logs -f mec
docker compose restart mec
docker compose down
```

## Scripts de respaldo seguro (desarrollo local)

Estos scripts no modifican `main`, no usan `--force` y no tocan la base local:

```bash
git push github dev                  # respaldo en GitHub (remoto privado)
./deploy/setup-github-remote.sh URL  # agrega remoto github si aún no existe
```

El repositorio en Cursor Cloud (`origin`) fue dado de baja; no volver a publicar ahí si el objetivo es trabajar solo en local + GitHub privado.
