#!/usr/bin/env bash
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"
PY="$RAIZ/qa/hu07-06/.local/venv/bin/python"
if [[ ! -x "$PY" ]]; then
  echo 'Falta venv local: bash qa/hu07-06/INSTALAR-LOCAL.sh' >&2
  exit 2
fi
export PLAYWRIGHT_BROWSERS_PATH="$RAIZ/qa/hu07-06/.local/browsers"
exec "$PY" "$RAIZ/qa/hu06-05/executar_tudo.py" "$@"
