#!/usr/bin/env bash
# Entrada de compatibilidade: a regressão oficial é única e independe de branch/HEAD.
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec bash "$RAIZ/qa/central/executar.sh" all
