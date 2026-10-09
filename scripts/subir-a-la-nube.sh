#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== MEC: subir a Firebase ==="

if ! npx firebase login:list 2>/dev/null | grep -q '@'; then
  echo ""
  echo "PASO 1 — En el navegador (Chrome/Edge), entrá con tu cuenta Google:"
  echo "  Ejecutá en otra terminal:  npx firebase login"
  echo "  (o: npx firebase login --no-localhost  si WSL no abre ventana)"
  echo ""
  echo "Cuando termine el login, volvé a ejecutar:  bash scripts/subir-a-la-nube.sh"
  exit 1
fi

echo "OK: Firebase CLI con sesión iniciada."
echo "PASO 2 — Descargando claves de la app web..."
npm run firebase:pull-env

echo "PASO 3 — Compilando y publicando..."
npm run firebase:deploy

PROJECT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.firebaserc','utf8')).projects.default)")
echo ""
echo "Listo. Abrí en el navegador:"
echo "  https://${PROJECT}.web.app"
echo ""
echo "Entrá con el usuario que creaste en Firebase Console → Authentication."
echo "Luego Importar (banco + Quiter). Guía: docs/USO_DIARIO_NUBE.md"
