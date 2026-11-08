#!/usr/bin/env bash
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PY="$RAIZ/qa/hu07-06/.local/venv/bin/python"
LOCAL="$RAIZ/qa/hu07-06/.local"
if [[ ! -x "$PY" ]]; then
  echo '[TEC08-03] Playwright privado da HU07-06 ausente' >&2
  exit 2
fi
export PLAYWRIGHT_BROWSERS_PATH="$LOCAL/browsers"
export PYTHONDONTWRITEBYTECODE=1
cd "$RAIZ"
exec "$PY" qa/tec08-03/validar_ui_real.py "$@"
