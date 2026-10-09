#!/usr/bin/env bash
set -euo pipefail
pkill -f 'firebase emulators:start' 2>/dev/null || true
pkill -f cloud-firestore-emulator 2>/dev/null || true
sleep 1
if ss -ltnp 2>/dev/null | grep -qE ':9099|:8080'; then
  echo "Algunos puertos siguen en uso. Ejecute: ss -ltnp | grep -E ':9099|:8080'"
  exit 1
fi
echo "Emuladores detenidos (puertos 9099 y 8080 libres)."
