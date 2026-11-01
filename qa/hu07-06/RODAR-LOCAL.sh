#!/usr/bin/env bash
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL="$RAIZ/qa/hu07-06/.local"
if [[ ! -x "$LOCAL/venv/bin/python" ]]; then
  echo 'Primeiro: bash qa/hu07-06/INSTALAR-LOCAL.sh' >&2
  exit 2
fi
if [[ $# -lt 1 ]]; then
  echo 'Uso: bash qa/hu07-06/RODAR-LOCAL.sh <script.py> [argumentos]' >&2
  exit 2
fi
SCRIPT="$1"; shift
case "$SCRIPT" in
  preflight.py|validar_fluxo_real.py|ajustar_vinculo_qa.py|configurar_credenciais.py|consolidar_evidencias.py) ;;
  *) echo "Script QA não permitido: $SCRIPT" >&2; exit 2 ;;
esac
export PLAYWRIGHT_BROWSERS_PATH="$LOCAL/browsers"
cd "$RAIZ"
exec "$LOCAL/venv/bin/python" "$RAIZ/qa/hu07-06/$SCRIPT" "$@"
