#!/usr/bin/env bash
# Limpeza opcional, feita SOMENTE após cópia e verificação de arquivos privados dentro do projeto.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
LOCAL="$(pwd -P)/qa/hu07-06/.local"
CRED="$LOCAL/credenciais.json"
[[ -f "$CRED" && ! -L "$CRED" ]] || { echo 'Credenciais internas ausentes; não limpar legado'; exit 1; }
LEGADO="$HOME/.config/hu07-06/credenciais.json"
DIVERGENTE=0
if [[ -f "$LEGADO" ]] && ! cmp -s "$LEGADO" "$CRED"; then
  DIVERGENTE=1
  echo 'AVISO: as credenciais antigas diferem das atuais (ex.: e-mail corrigido).'
  echo 'A versão antiga será guardada em backup PRIVADO dentro do projeto antes da exclusão.'
fi
ORIGEM="$HOME/.local/share/hu07-06/relatorios"
if [[ -d "$ORIGEM" ]]; then
  while IFS= read -r -d '' nome; do
    dest="$LOCAL/relatorios/${nome#"$ORIGEM/"}"
    [[ -f "$dest" ]] && cmp -s "$nome" "$dest" || { echo "Relatório não copiado: $nome"; exit 1; }
  done < <(find "$ORIGEM" -type f -name '*.json' -print0)
fi
cat <<'EOF'
Podem existir pastas legadas da HU07-06 FORA do repositório:
  ~/.config/hu07-06
  ~/.local/share/hu07-06
  /tmp/venv-hu07-06
Outros arquivos e caches globais NÃO serão tocados.
EOF
[[ "${1:-}" == '--confirmar' ]] || { echo 'Modo consulta. Use --confirmar para solicitar a remoção.'; exit 0; }
read -r -p 'Digite exatamente LIMPAR-LEGADO para remover somente os caminhos acima: ' R
[[ "$R" == 'LIMPAR-LEGADO' ]] || { echo 'Cancelado'; exit 1; }
if [[ "$DIVERGENTE" -eq 1 ]]; then
  umask 077
  DESTINO="$(pwd -P)/qa/.local/backup-legado/$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$DESTINO"
  cp -p -- "$LEGADO" "$DESTINO/credenciais-legadas.json"
  chmod 600 "$DESTINO/credenciais-legadas.json"
  cmp -s -- "$LEGADO" "$DESTINO/credenciais-legadas.json" || { echo 'Backup incompleto; ABORTADO'; exit 1; }
  echo "Cópia antiga preservada em $DESTINO/credenciais-legadas.json"
fi
for alvo in "$HOME/.config/hu07-06" "$HOME/.local/share/hu07-06" /tmp/venv-hu07-06; do
  if [[ -e "$alvo" && ! -L "$alvo" ]]; then rm -rf -- "$alvo"; echo "Removido: $alvo"; fi
done
printf 'Concluído. O qa/.local do projeto foi preservado.\n'
