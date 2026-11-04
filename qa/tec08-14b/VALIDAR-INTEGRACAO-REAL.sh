#!/usr/bin/env bash
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PY="$RAIZ/qa/hu07-06/.local/venv/bin/python"
[[ -x "$PY" ]] || { echo 'Playwright privado da HU07-06 não encontrado.' >&2; exit 2; }
export PLAYWRIGHT_BROWSERS_PATH="$RAIZ/qa/hu07-06/.local/browsers"
export PYTHONDONTWRITEBYTECODE=1
cd "$RAIZ"
exec "$PY" qa/tec08-14b/validar_arquivamento_real.py "$@"
