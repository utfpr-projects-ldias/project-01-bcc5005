#!/usr/bin/env bash
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PY="$RAIZ/qa/hu07-06/.local/venv/bin/python"
LOCAL="$RAIZ/qa/hu07-06/.local"
if [[ ! -x "$PY" ]]; then
  echo '[TEC08-02] Playwright existente não encontrado; confira qa/hu07-06/.local/venv' >&2
  exit 2
fi
export PLAYWRIGHT_BROWSERS_PATH="$LOCAL/browsers"
export PYTHONDONTWRITEBYTECODE=1
cd "$RAIZ"
exec "$PY" "qa/tec08-02/validar_integracao_real.py" "$@"
