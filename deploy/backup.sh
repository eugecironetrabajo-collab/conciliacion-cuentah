#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DATA_DIR:-$ROOT_DIR/data}"
DB_FILE="${DB_PATH:-$DATA_DIR/conciliacion.db}"
BACKUP_DIR="${BACKUP_DIR:-$DATA_DIR/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [[ ! -f "$DB_FILE" ]]; then
  echo "No se encontró la base en $DB_FILE"
  exit 1
fi

TARGET="$BACKUP_DIR/conciliacion-$STAMP.db"
cp "$DB_FILE" "$TARGET"
echo "Backup creado: $TARGET"
