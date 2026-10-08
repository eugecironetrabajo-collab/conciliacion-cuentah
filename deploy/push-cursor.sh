#!/usr/bin/env bash
# Obsoleto: el remoto origin (Cursor Cloud) fue eliminado a propósito.
# Respaldo: git push github <rama>
set -euo pipefail

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "No hay remoto 'origin' (Cursor Cloud). Use: git push github \$(git branch --show-current)"
  exit 1
fi

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
