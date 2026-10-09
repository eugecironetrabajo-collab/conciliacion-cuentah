#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-$ROOT/.tools/jdk-21.0.6+7-jre}"
export PATH="$JAVA_HOME/bin:$PATH"
cd "$ROOT"
exec npx firebase emulators:start --only auth,firestore
