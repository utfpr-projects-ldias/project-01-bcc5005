#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" != '--confirmar' ]]; then
  echo 'Este comando exclui SOMENTE caminhos antigos da HU07 fora do projeto.'
  echo 'ANTES: confira que credenciais e todos os relatórios foram migrados para qa/hu07-06/.local/'
  echo 'Para executar: bash qa/hu07-06/LIMPAR-LEGADO.sh --confirmar'
  exit 0
fi
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL="$RAIZ/qa/hu07-06/.local"
[[ -f "$LOCAL/credenciais.json" ]] || { echo 'Não há credenciais migradas; abortando' >&2; exit 2; }
[[ -d "$LOCAL/relatorios" ]] || { echo 'Não há pasta local de relatórios; abortando' >&2; exit 2; }
python3 "$RAIZ/qa/hu07-06/migrar_qa_local.py"
read -r -p 'Apagar pastas LEGADAS fora do repositório (SIM para confirmar)? ' ACEITO
[[ "$ACEITO" == 'SIM' ]] || { echo 'Cancelado'; exit 0; }
rm -rf -- "$HOME/.config/hu07-06" "$HOME/.local/share/hu07-06" /tmp/venv-hu07-06
for pasta in /tmp/hu07-*; do
  [[ -d "$pasta" && ! -L "$pasta" ]] || continue
  rm -rf -- "$pasta"
done
echo 'Pasta qa/hu07-06/.local/ preservada. Cache geral do Chromium e Downloads preservados.'
echo 'Se desejar excluir também o cache COMPARTILHADO de Playwright (pode afetar outros projetos):'
echo '  rm -rf -- "$HOME/.cache/ms-playwright"'
