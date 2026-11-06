#!/usr/bin/env bash
# Operação voluntária e DESTRUTIVA: começa pelo reset sem backup, recria identidades,
# aplica migrations, executa todos os gates e os 3 QAs Chromium com fixtures persistentes.
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
FASE='Reset sem backup'
trap 'printf "\nPAROU na fase: %s. Não execute novamente o reset só para repetir os testes.\n" "$FASE" >&2' ERR
bash "$RESET" --executar
FASE='Migrations em banco novo'
docker compose run --rm --no-deps -T backend npm run migration:run
docker compose run --rm --no-deps -T backend npm run migration:show
FASE='Bootstrap interativo do Administrador'
echo 'Cadastre o Administrador DEV com a MESMA senha do arquivo privado de QA.'
echo 'As senhas não são mostradas, gravadas no projeto, nem passadas em argumentos.'
docker compose run --rm --no-deps backend sh -lc 'npm run build && npm run admin:create -- rinaldi@gmail.com'
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
FASE='Chromium real, três suites e persistência de fixtures'
bash "$QA" --qa-executar --confirmar-persistencia --visivel
FASE='Finalizada'
trap - ERR
echo 'TODAS AS FASES CONCLUÍDAS. Consulte os relatórios privados dos três QAs Chromium.'
