#!/usr/bin/env bash
# Agrega remoto github sin reemplazar origin. No mergea a main.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Uso: $0 <url-del-repo-github>"
  echo "Ejemplo: $0 https://github.com/mi-org/recon-h.git"
  exit 1
fi

URL="$1"
BRANCH="$(git branch --show-current)"

if git remote get-url github >/dev/null 2>&1; then
  echo "El remoto 'github' ya existe: $(git remote get-url github)"
  exit 1
fi

if [[ -f .env ]]; then
  echo "Advertencia: existe .env local (no se sube; verificar antes de push)."
fi

git remote add github "$URL"
echo "Remoto agregado: github -> $URL"
echo ""
echo "Para publicar la rama actual sin tocar main:"
echo "  git push -u github $BRANCH"
echo ""
echo "origin (Cursor) se conserva sin cambios."
