#!/usr/bin/env bash
# Operação voluntária e DESTRUTIVA: começa pelo reset sem backup, recria identidades,
# aplica migrations, executa todos os gates e os quatro QAs Chromium com fixtures persistentes.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
RESET='qa/tec08-uiux-final/RESET-TOTAL-DEV-SEM-BACKUP.sh'
QA='qa/tec08-uiux-final/VALIDAR.sh'
if [[ "${1:---consultar}" != '--executar' ]]; then
  bash "$RESET"
  echo
  echo 'Para fazer reset SEM BACKUP + migrations + contas + todos os testes:'
  echo 'bash qa/tec08-uiux-final/RECOMECAR-DEV-E-VALIDAR.sh --executar'
  exit 0
fi
[[ $# == 1 && -t 0 ]] || { echo 'BLOQUEADO: execução exige terminal e apenas --executar.' >&2; exit 2; }
# Não destruir o banco antes de conferir os pré-requisitos de restauração de QA.
[[ -x 'qa/hu07-06/.local/venv/bin/python' ]] || { echo 'BLOQUEADO: configure primeiro o venv/Chromium de QA.' >&2; exit 2; }
[[ -f 'qa/hu07-06/.local/credenciais.json' ]] || { echo 'BLOQUEADO: configure credenciais locais antes de apagar o banco.' >&2; exit 2; }
python3 - <<'PYQA' >/dev/null
import sys
sys.path.insert(0,'qa/hu07-06')
from credenciais_locais import carregar_credenciais
for papel in ('administrador','gestor-edicao','colaborador'):
    carregar_credenciais(papel)
PYQA
[[ -d 'qa/hu07-06/.local/browsers' ]] || { echo 'BLOQUEADO: browsers Playwright privados ausentes.' >&2; exit 2; }
# O usuário autorizou destruir somente dados de um código que passou nos gates de integridade.
bash "$QA" --preflight || { echo 'BLOQUEADO: corrija o pré-voo antes de apagar os volumes.' >&2; exit 2; }
FASE='Reset sem backup'
trap 'printf "\nPAROU na fase: %s. Não execute novamente o reset só para repetir os testes.\n" "$FASE" >&2' ERR
bash "$RESET" --executar
FASE='Migrations em banco novo'
docker compose run --rm --no-deps -T backend npm run migration:run
SHOW_MIGRATIONS="$(docker compose run --rm --no-deps -T backend npm run migration:show)"
printf '%s\n' "$SHOW_MIGRATIONS"
TOTAL_APLICADAS="$(printf '%s\n' "$SHOW_MIGRATIONS" | grep -c '^\[X\]' || true)"
if [[ "$TOTAL_APLICADAS" -ne 23 ]] || printf '%s\n' "$SHOW_MIGRATIONS" | grep -q '^\[ \]'; then
  echo "BLOQUEADO: migrations inconsistentes; foram confirmadas $TOTAL_APLICADAS/23. NÃO siga para o QA." >&2
  exit 1
fi
FASE='Bootstrap interativo do Administrador'
echo 'Recrie o Administrador DEV usando o e-mail configurado no QA privado e a MESMA senha daquele arquivo.'
CRED='qa/hu07-06/.local/credenciais.json'
[[ -f "$CRED" && ! -L "$CRED" ]] || { echo 'BLOQUEADO: credenciais privadas QA ausentes; configure-as antes do reset.' >&2; exit 2; }
# Lê somente o e-mail esperado. Nunca imprime, exporta ou passa a senha como argumento.
ADMIN_EMAIL="$(python3 - <<'PYQA'
import sys
sys.path.insert(0,'qa/hu07-06')
from credenciais_locais import carregar_credenciais
email,_=carregar_credenciais('administrador')
print(email)
PYQA
)"
[[ "$ADMIN_EMAIL" == *@*.* && "$ADMIN_EMAIL" != *' '* ]] || { echo 'BLOQUEADO: e-mail QA inválido.' >&2; exit 2; }
echo 'O CLI pedirá a senha de forma interativa. Deve coincidir com a credencial privada QA.'
docker compose run --rm --no-deps -e ADMIN_BOOTSTRAP_EMAIL="$ADMIN_EMAIL" backend sh -lc 'npm run build && npm run admin:create -- "$ADMIN_BOOTSTRAP_EMAIL"'
FASE='Inicialização das aplicações'
docker compose up -d backend frontend
# Nest em watch pode demorar para aceitar conexões. Repetir apenas GET idempotente.
FASE='Esperar API HTTP 200'
pronto=0
for tentativa in $(seq 1 35); do
  if curl -fsS --max-time 3 http://localhost:3001/ >/dev/null 2>&1; then pronto=1; break; fi
  sleep 2
done
[[ "$pronto" == 1 ]] || { docker compose logs --tail=50 backend; echo 'Backend não ficou pronto.' >&2; exit 1; }
FASE='Esperar interface Next HTTP 200'
pronto=0
for tentativa in $(seq 1 35); do
  if curl -fsS --max-time 3 http://localhost:3000/login >/dev/null 2>&1; then pronto=1; break; fi
  sleep 2
done
[[ "$pronto" == 1 ]] || { echo 'Frontend não ficou pronto.' >&2; exit 1; }
FASE='Recriar Gestor e Colaborador pela API administrativa'
PY='qa/hu07-06/.local/venv/bin/python'
[[ -x "$PY" ]] || { echo 'Falta venv privado do QA: '"$PY" >&2; exit 1; }
"$PY" qa/preparar-qa/provisionar_funcionarios.py --login-automatico --confirmar
FASE='Pré-voos de ambiente e roteiros'
bash "$QA" --preflight
bash "$QA" --qa-verificar
FASE='Jest focal e regressões de QA'
bash "$QA" --target
FASE='Jest, lint e builds completos'
bash "$QA" --full
FASE='Chromium real, quatro suítes e persistência de fixtures'
bash "$QA" --qa-executar --confirmar-persistencia --visivel
FASE='Finalizada'
trap - ERR
echo 'TODAS AS FASES CONCLUÍDAS. Consulte os relatórios privados dos quatro QAs Chromium.'
