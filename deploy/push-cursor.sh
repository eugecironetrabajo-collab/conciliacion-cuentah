#!/usr/bin/env bash
# Respaldo seguro en Cursor (origin). No usa --force ni toca main.
set -euo pipefail

BRANCH="$(git branch --show-current)"
if [[ -z "$(git status --porcelain)" ]]; then
  echo "Working tree limpio."
else
  echo "Hay cambios sin commitear. Abortando."
  exit 1
fi

echo "Rama actual: $BRANCH"
echo "Remoto: origin (Cursor)"
read -r -p "¿Subir $BRANCH a origin? [s/N] " confirm
if [[ ! "$confirm" =~ ^[sS]$ ]]; then
  echo "Cancelado."
  exit 0
fi

git push origin "$BRANCH"
echo "Listo. Commit publicado en origin/$BRANCH"
