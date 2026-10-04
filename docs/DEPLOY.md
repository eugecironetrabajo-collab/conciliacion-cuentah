# Despliegue de MEC en VPS

MEC sigue el modelo **una instalación por cliente**: cada empresa tiene su propia URL, base SQLite y administrador. No es multi-tenant.

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
git clone https://github.com/SU-ORGANIZACION/recon-h.git
cd recon-h
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

## Verificación del primer deploy

1. Abra la URL pública y confirme la pantalla de login.
2. Ingrese con `ADMIN_USER` / `ADMIN_PASSWORD`.
3. Importe un archivo de prueba desde **Importar**.
4. Concilie una partida en **Conciliar**.
5. Revise **Auditoría** y confirme que el actor registrado es el usuario logueado.
6. Ejecute un backup manual con `deploy/backup.sh`.

## Nuevo cliente

Para cada cliente nuevo:

1. Nuevo VPS o nuevo directorio en el mismo servidor.
2. Clonar el mismo repositorio.
3. `.env` propio con credenciales distintas.
4. Volumen `data/` independiente.
5. Dominio propio (por ejemplo `mec.cliente.com`).

No se requieren cambios de código por cliente.

## Comandos útiles

```bash
docker compose logs -f mec
docker compose restart mec
docker compose down
```

## Scripts de respaldo seguro (desarrollo local)

Estos scripts no modifican `main`, no usan `--force` y no tocan la base local:

```bash
./deploy/push-cursor.sh              # sube la rama actual a origin (Cursor)
./deploy/setup-github-remote.sh URL  # agrega remoto github sin reemplazar origin
```
