#!/usr/bin/env bash
# Validação real e opt-in HU08/HU09/TEC09. Não cria backups/reset/commit/push.
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PY="${RAIZ}/qa/hu07-06/.local/venv/bin/python"
if [[ ! -x "$PY" ]]; then
  echo 'Ambiente Playwright não disponível. Execute ./configurar-testes no DEV.' >&2
  exit 2
fi
export PLAYWRIGHT_BROWSERS_PATH="$RAIZ/qa/hu07-06/.local/browsers"
export PYTHONDONTWRITEBYTECODE=1
cd "$RAIZ"
exec "$PY" qa/hu08-hu09-tec09/validar_fluxo_real.py "$@"
