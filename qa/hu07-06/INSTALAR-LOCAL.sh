#!/usr/bin/env bash
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL="$RAIZ/qa/hu07-06/.local"
mkdir -p "$LOCAL/relatorios" "$LOCAL/browsers"
chmod 700 "$LOCAL"
if [[ ! -f "$LOCAL/credenciais.json" ]]; then
  python3 "$RAIZ/qa/hu07-06/migrar_qa_local.py"
fi
if [[ ! -f "$LOCAL/credenciais.json" ]]; then
  install -m 600 "$RAIZ/qa/hu07-06/contas-dev-fixture.json" "$LOCAL/credenciais.json"
  echo '[QA] Credenciais DEV carregadas da fixture versionada.'
fi
if [[ ! -x "$LOCAL/venv/bin/python" ]]; then
  python3 -m venv "$LOCAL/venv"
fi
"$LOCAL/venv/bin/python" -m pip install 'playwright==1.64.1'
export PLAYWRIGHT_BROWSERS_PATH="$LOCAL/browsers"
"$LOCAL/venv/bin/python" -m playwright install chromium
printf 'Ambiente local pronto: qa/hu07-06/.local/ (ignorado pelo Git)\n'
