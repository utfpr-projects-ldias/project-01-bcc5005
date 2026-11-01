#!/usr/bin/env bash
set -euo pipefail
RAIZ="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$RAIZ"
echo '[HU07] Validando Python, frontend (incluindo ESLint) e backend antes do QA real.'
bash qa/hu07-06/VALIDAR-HU07-06.sh "$RAIZ"
echo '[HU07] Testes locais aprovados; execução real das cinco sessões ainda pendente.'
