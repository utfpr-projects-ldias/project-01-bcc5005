#!/usr/bin/env bash
# Entrada histórica, encaminhada ao único reset DEV vigente. Nenhum backup.
set -euo pipefail
RAIZ=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
case "${1:---consultar}" in
  --consultar) [[ $# -le 1 ]] || exit 2; exec bash "$RAIZ/reset-dev" --consultar ;;
  --apagar-confirmado|--executar) [[ $# -eq 1 ]] || exit 2; exec bash "$RAIZ/reset-dev" --executar ;;
  *) echo 'Use --consultar ou --executar.' >&2; exit 2 ;;
esac
