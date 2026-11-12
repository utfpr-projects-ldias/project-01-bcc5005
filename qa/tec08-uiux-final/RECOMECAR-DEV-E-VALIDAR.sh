#!/usr/bin/env bash
# Compatibilidade: rotina antiga agora usa o fluxo validado TEC08-04/05.
set -Eeuo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"
if [[ "${1:---consultar}" != '--executar' ]]; then
  bash qa/tec08-04-05/RECRIAR-DEV.sh --consultar
  echo 'Para recriar contas sem executar QA ainda: bash qa/tec08-04-05/RECRIAR-DEV.sh --executar'
  exit 0
fi
[[ "$#" == 1 ]] || { echo 'BLOQUEADO: opção inesperada' >&2; exit 2; }
bash qa/tec08-04-05/RECRIAR-DEV.sh --executar
bash qa/tec08-uiux-final/VALIDAR.sh --target
bash qa/tec08-uiux-final/VALIDAR.sh --full
bash qa/tec08-uiux-final/VALIDAR.sh --qa-verificar
bash qa/tec08-uiux-final/VALIDAR.sh --qa-executar --confirmar-persistencia
