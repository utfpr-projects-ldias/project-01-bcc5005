#!/usr/bin/env bash
# Executor central oficial: backend, frontend ou tudo; sem backups.
set -uo pipefail
umask 077
RAIZ="${REPO_PI:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
MODO="${1:-all}"
case "$MODO" in back|front|all) ;; *) echo "Uso: ./back | ./front | ./testes-all | bash qa/central/executar.sh {back|front|all}" >&2; exit 2;; esac
if ! docker info >/dev/null 2>&1; then echo "Docker indisponível. Inicie o serviço e execute ./configurar-testes." >&2; exit 2; fi
cd "$RAIZ" || { echo "Projeto não encontrado: $RAIZ"; exit 2; }
RUN="$(date +%Y%m%d-%H%M%S)"
D="$HOME/Downloads/TESTES-${MODO^^}-$RUN"
mkdir -p "$D"
RES="$D/00-RESUMO.txt"
PASSOU=0; FALHOU=0; PULOU=0; TOTAL=0
printf 'REGRESSAO CENTRAL %s\nData: %s\nBranch: %s\nHEAD: %s\nSem backup, sem commit e sem reset.\n\n' "$MODO" "$(date -Is)" "$(git branch --show-current)" "$(git rev-parse HEAD)" > "$RES"
concluir() {
  trap - EXIT
  printf '\nTOTAL %d | PASS %d | FAIL %d | SKIP %d\n' "$TOTAL" "$PASSOU" "$FALHOU" "$PULOU" >> "$RES"
  python3 - "$D" <<'PY'
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import sys
p=Path(sys.argv[1]); saida=p.with_suffix('.zip')
with ZipFile(saida,'w',ZIP_DEFLATED) as z:
    for f in sorted(p.rglob('*')):
        if f.is_file():z.write(f,f.relative_to(p.parent))
print('ZIP:',saida)
PY
  cat "$RES"
  echo "ANEXAR: $D.zip"
}
trap concluir EXIT
run() {
  local nome="$1" rc
  shift
  TOTAL=$((TOTAL+1)); echo "[$TOTAL] $nome"
  {
    printf 'Inicio %s\n' "$(date -Is)"
    "$@"
    rc=$?
    printf '\nFim %s\nEXIT_CODE=%s\n' "$(date -Is)" "$rc"
  } > "$D/$nome.txt" 2>&1
  if ((rc == 0)); then PASSOU=$((PASSOU+1)); echo "PASS: $nome" | tee -a "$RES";
  else FALHOU=$((FALHOU+1)); echo "FAIL($rc): $nome" | tee -a "$RES"; fi
}
skip() {
  local nome="$1" motivo="$2"
  TOTAL=$((TOTAL+1)); PULOU=$((PULOU+1))
  printf 'SKIP: %s - %s\n' "$nome" "$motivo" | tee -a "$RES" "$D/$nome.txt"
}
# O runner é portável para branches e clones novos; branch/HEAD são registrados no resumo.
run 00-CONTAINERS-INICIAR docker compose up -d
run 01-DOCKER docker compose ps
if [[ "$MODO" != front ]]; then
  run 00-PREFLIGHT-TS docker compose exec -T backend npx tsc --noEmit
  run 03-BACKEND-JEST-TODOS docker compose exec -T backend npm test -- --runInBand
  run 04-BACKEND-E2E-HTTP-7 docker compose exec -T backend npm run test:e2e -- --runInBand --runTestsByPath \
    test/admin-usuarios.e2e-spec.ts test/app.e2e-spec.ts test/atividades.e2e-spec.ts test/auth.e2e-spec.ts \
    test/cadastro-bloqueado.e2e-spec.ts test/contratos-api.e2e-spec.ts test/supertokens-signup-bloqueado.e2e-spec.ts
  run 05-BACKEND-OXLINT docker compose exec -T backend npm run lint:fast
  run 06-BACKEND-OXLINT-TIPOS docker compose exec -T backend npm run lint
  run 07-BACKEND-BUILD docker compose exec -T backend npm run build
  run 10-BACKEND-TSC docker compose exec -T backend npx tsc --noEmit
  run 12-MIGRATIONS-STATUS docker compose exec -T backend npm run migration:show
fi
if [[ "$MODO" != back ]]; then
  run 00-QA-TEC08-03 python3 qa/tec08-03/teste_validar_ui_real.py
  run 02-FRONTEND-JEST-TODOS docker compose exec -T frontend npm test -- --runInBand
  # Torna os warnings React parte do resultado oficial: não basta Jest retornar 0.
  run 02-FRONTEND-REACT-ACT-SEM-AVISOS python3 qa/central/verificar_react_act.py "$D/02-FRONTEND-JEST-TODOS.txt"
  run 08-FRONTEND-ESLINT docker compose exec -T frontend npm run lint
  run 09-FRONTEND-BUILD docker compose run --rm --no-deps -T frontend npm run build
  run 11-FRONTEND-TSC docker compose exec -T frontend npx tsc --noEmit
fi
if [[ "$MODO" != front ]]; then
# DBs de teste são novos (ou integrador_hu06_qa_test, nome fixo exigido
# pelo teste). Nenhum comando cria backup, elimina DB ou modifica a base dev.
DB_TAG="pi_$(date +%m%d%H%M%S)"
preparar_banco() {
  local nome="$1"
  [[ "$nome" =~ ^[a-z][a-z0-9_]{0,62}$ ]] || return 2
  docker compose exec -T -e "QA_DB_NAME=$nome" database sh -lc '
    set -eu
    if ! psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT datname FROM pg_database" | grep -Fxq "$QA_DB_NAME"; then
      psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$QA_DB_NAME\""
    fi
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$QA_DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\""
  '
}
url_para_banco() {
  docker compose exec -T -e "QA_DB_NAME=$1" backend node -e '
    if (!process.env.DATABASE_URL || !process.env.QA_DB_NAME) process.exit(3);
    const u=new URL(process.env.DATABASE_URL);u.pathname="/"+process.env.QA_DB_NAME;console.log(u.toString());
  ' | tr -d '\r'
}
# Cada suíte que exige Postgres real tem sua própria URL e guarda de nome.
# HU07-01 e HU07-05 usam o mesmo banco, mas schemas de teste independentes.
E2E=(
 'contratos-migration|TEST_DATABASE_URL|_migration_test'
 'hu06-01-banco|HU06_TEST_DATABASE_URL|_hu06_test'
 'hu06-02-etapas-api|HU06_API_TEST_DATABASE_URL|_hu06_api_test'
 'hu06-04-etapas-regressao-banco|HU06_QA_TEST_DATABASE_URL|integrador_hu06_qa_test'
 'hu07-01-modelagem-banco|HU07_TEST_DATABASE_URL|_hu07_test'
 'hu07-05-regressao-banco|HU07_TEST_DATABASE_URL|_hu07_test'
 'tec07-ajustes-02-01-auditoria-banco|TEC07_AUDIT_TEST_DATABASE_URL|_tec07_audit_test'
 'tec07-ajustes-02-02-escopo-banco|TEC07_POLICY_TEST_DATABASE_URL|_tec07_policy_test'
 'tec07-ajustes-02-03-seguranca-regressao|TEC07_REGRESSION_TEST_DATABASE_URL|_tec07_regression_test'
)
for entrada in "${E2E[@]}"; do
  IFS='|' read -r suite variavel sufixo <<< "$entrada"
  if [[ "$sufixo" == integrador_hu06_qa_test ]]; then nome="$sufixo";
  else nome="${DB_TAG}${sufixo}"; fi
  id="E2E-BANCO-${suite}"
  if ! preparar_banco "$nome" > "$D/${id}-PREPARO.txt" 2>&1; then
    skip "$id" "não foi possível preparar banco isolado; veja ${id}-PREPARO.txt"; continue
  fi
  url="$(url_para_banco "$nome")"
  if [[ "$url" != postgresql://* && "$url" != postgres://* ]]; then
    skip "$id" 'DATABASE_URL inválida ou não disponível no container backend'; continue
  fi
  run "$id" docker compose exec -T -e "$variavel=$url" backend npm run test:e2e -- --runInBand --runTestsByPath "test/${suite}.e2e-spec.ts"
done


# Isolamento real de falha de conexão. Só encerra a sessão PG que o próprio QA
# abriu em um banco novo; não reinicia o servidor nem afeta a base DEV.
DB_FALHA="${DB_TAG}_falha_conexao"
if preparar_banco "$DB_FALHA" > "$D/QA-PG-CONEXAO-PREPARO.txt" 2>&1; then
  run QA-REAL-POSTGRES-CONEXAO-ROLLBACK python3 qa/central/validar_falha_conexao_pg.py --banco "$DB_FALHA"
else
  skip QA-REAL-POSTGRES-CONEXAO-ROLLBACK 'Não foi possível preparar banco exclusivamente isolado'
fi

fi

if [[ "$MODO" != back ]]; then
# Testes unitários Python dos utilitários QA, incluindo os que não dependem de navegador.
if [[ -d qa ]]; then
  while IFS= read -r -d '' arquivo; do
    nome="QA-PY-$(echo "$arquivo" | tr '/ ' '--' | tr -cd 'a-zA-Z0-9_.-')"
    if [[ -x qa/hu07-06/.local/venv/bin/python ]]; then interp='qa/hu07-06/.local/venv/bin/python'; else interp='python3'; fi
    run "$nome" "$interp" "$arquivo"
  done < <(find qa -type f -name 'teste_*.py' -not -path '*/.local/*' -print0 | sort -z)
else
  skip QA-PY 'pasta qa/ não disponível; não confundir com testes aprovados'
fi

# Inventário completo dos arquivos QA, separado da execução efetiva.
find qa -type f \( -name '*.py' -o -name '*.sh' \) -not -path '*/.local/*' | sort > "$D/QA-INVENTARIO-FONTES.txt"
python3 - "$D/QA-INVENTARIO-FONTES.txt" "$D/QA-INVENTARIO-CLASSIFICADO.txt" <<'INVENTARIO_PY'
from pathlib import Path
import sys
fontes=Path(sys.argv[1]).read_text().splitlines()
with open(sys.argv[2],'w') as o:
 for arq in fontes:
  base=Path(arq).name
  if base.startswith(('LIMPAR','RESET','RECRIAR','RECOMECAR')): classe='MANUTENCAO/RESET (NÃO EXECUTAR COMO TESTE)'
  elif base.startswith('teste_'):classe='UNITÁRIO/ESTÁTICO (EXECUTADO)'
  elif base in ('validar_fluxo_real.py','VALIDAR-CODIGO-REAL.py','validar_modal_real.py','validar_card_evidencia_real.py','validar_integracao_real.py','validar_ui_real.py','validar_arquivamento_real.py','provisionar_funcionarios.py','verificar_logins.py'):classe='REAL PLAYWRIGHT / API (TENTAR EXECUTAR)'
  else:classe='AUXILIAR/ORQUESTRADOR/DIAGNÓSTICO (VIDE LOGS)'
  o.write(classe+' | '+arq+'\n')
 print('Fontes QA inventariadas:',len(fontes))
INVENTARIO_PY

# Instala o Playwright no diretório privado se necessário; não faz backup, reset nem apagamento de banco.
if [[ -d qa/hu07-06 ]]; then
  if [[ ! -x qa/hu07-06/.local/venv/bin/python || ! -d qa/hu07-06/.local/browsers || ! -f qa/hu07-06/.local/credenciais.json ]]; then
    run QA-REAL-INSTALAR-AMBIENTE bash qa/hu07-06/INSTALAR-LOCAL.sh
  else
    run QA-REAL-AMBIENTE-EXISTENTE bash -c 'test -x qa/hu07-06/.local/venv/bin/python && test -d qa/hu07-06/.local/browsers && test -f qa/hu07-06/.local/credenciais.json'
  fi
else
  skip QA-REAL-INSTALAR-AMBIENTE 'HU07-06 ausente, recuperar fontes via patch R7'
fi
PY_QA="$RAIZ/qa/hu07-06/.local/venv/bin/python"
export PLAYWRIGHT_BROWSERS_PATH="$RAIZ/qa/hu07-06/.local/browsers"
export PYTHONDONTWRITEBYTECODE=1
if [[ ! -x "$PY_QA" || ! -f qa/hu07-06/.local/credenciais.json || ! -d "$PLAYWRIGHT_BROWSERS_PATH" ]]; then
  skip QA-REAL-BOOTSTRAP 'Falta Playwright/Chromium/credenciais DEV; veja QA-REAL-INSTALAR-AMBIENTE'
  skip QA-REAL-CRIAR-CONTRATOS 'Sem sessão Administrador não há contrato QA real'
  skip QA-REAL-HU06-HU07 'Sem dois contratos QA reais'
  skip QA-REAL-HU08-HU09-TEC09 'Sem credenciais/Chromium para o teste real'
  for N in LOGINS-3 DOCUMENTOS-TEC08-02 FLUXO-TEC08-03 EVIDENCIAS ARQUIVAMENTO-TEC08-14B MODAL-ENTREGAVEL CARD-EVIDENCIA PERSISTENCIA-REINICIO; do
    skip "QA-REAL-$N" 'Sem ambiente Chromium/credenciais; execução não iniciada'
  done
else
  run QA-REAL-BOOTSTRAP "$PY_QA" qa/preparar-qa/provisionar_funcionarios.py --login-automatico --confirmar
  if grep -q '^EXIT_CODE=0$' "$D/QA-REAL-BOOTSTRAP.txt"; then
    run QA-REAL-CRIAR-CONTRATOS "$PY_QA" qa/revisao-contratos/VALIDAR-CODIGO-REAL.py --confirmar-persistencia --saida "$D/QA-CONTRATOS-CRIADOS.json"
  else
    skip QA-REAL-CRIAR-CONTRATOS 'Bootstrap real de funcionários falhou'
  fi
  if [[ -f "$D/QA-CONTRATOS-CRIADOS.json" ]] && grep -q '^EXIT_CODE=0$' "$D/QA-REAL-CRIAR-CONTRATOS.txt"; then
    eval "$(python3 - "$D/QA-CONTRATOS-CRIADOS.json" <<'UUID_PY'
import json,sys,re
v=json.load(open(sys.argv[1])); a,b=v.get('contratoPrincipalId',''),v.get('outroContratoId','')
p=r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}'
if re.fullmatch(p,a) and re.fullmatch(p,b) and a != b:
 print('QA_CONTRATO_ID='+a)
 print('QA_OUTRO_CONTRATO_ID='+b)
UUID_PY
)"
    if [[ -n "${QA_CONTRATO_ID:-}" && -n "${QA_OUTRO_CONTRATO_ID:-}" ]]; then
      run QA-REAL-HU06-HU07 bash qa/EXECUTAR-TODOS-QA.sh \
        --contrato-id "$QA_CONTRATO_ID" --outro-contrato-id "$QA_OUTRO_CONTRATO_ID" \
        --confirmar-alteracoes --login-automatico-bootstrap --pular-regressoes
      # O QA HU08/HU09/TEC09 cria a PRÓPRIA etapa e entregáveis nos dois
      # contratos sintéticos que este mesmo runner acabou de cadastrar.
      # Executa Chromium + API real + leitura PostgreSQL, sem UUID manual.
      run QA-REAL-HU08-HU09-TEC09 bash qa/hu08-hu09-tec09/RODAR-DEV.sh \
        --contrato-id "$QA_CONTRATO_ID" --outro-contrato-id "$QA_OUTRO_CONTRATO_ID" \
        --confirmar-persistencia --validar-banco --saida "$D/QA-REAL-HU08-HU09-TEC09.json"
    else
      skip QA-REAL-HU06-HU07 'Contrato QA criado sem par UUID válido'
      skip QA-REAL-HU08-HU09-TEC09 'Não há par UUID de contratos sintéticos desta execução'
    fi
  else
    skip QA-REAL-HU06-HU07 'Falha no fluxo real de criação de contratos'
    skip QA-REAL-HU08-HU09-TEC09 'Falha na criação dos contratos sintéticos'
  fi
  # Cada cenário abaixo é REAL, com API/Chromium/DEV; erros não bloqueiam cenários independentes.
  run QA-REAL-LOGINS-3 "$PY_QA" qa/tec08-04-05/verificar_logins.py
  run QA-REAL-DOCUMENTOS-TEC08-02 bash qa/tec08-02/VALIDAR-INTEGRACAO-REAL.sh --executar --confirmar-persistencia
  run QA-REAL-FLUXO-TEC08-03 bash qa/tec08-03/VALIDAR-INTEGRACAO-REAL.sh --executar --confirmar-persistencia --sem-janela
  run QA-REAL-EVIDENCIAS bash qa/evidencias-verificacao/VALIDAR-INTEGRACAO-REAL.sh --executar --confirmar-persistencia
  run QA-REAL-ARQUIVAMENTO-TEC08-14B bash qa/tec08-14b/VALIDAR-INTEGRACAO-REAL.sh --executar --confirmar-persistencia
  run QA-REAL-MODAL-ENTREGAVEL "$PY_QA" qa/tec08-modal-ux/validar_modal_real.py --executar --confirmar-persistencia --sem-janela
  run QA-REAL-CARD-EVIDENCIA "$PY_QA" qa/tec08-uiux-final/validar_card_evidencia_real.py --executar --confirmar-persistencia
  run QA-REAL-PERSISTENCIA-REINICIO "$PY_QA" qa/tec08-04-05/validar_persistencia_reinicio.py --executar --confirmar-reinicio
fi
run QA-ESTRUTURA-BD-HU08 bash qa/tec08-05-01/VERIFICAR-BD.sh
run QA-PY-ROTEIROS-HISTORICOS python3 qa/tec08-04-05/testar_roteiros.py
# Scripts de manutenção ou reset são catalogados, jamais executados nesta bateria.
# O aceite funcional HU06 é verificado pelo Chromium, API e PostgreSQL no QA integrado.
# A avaliação subjetiva e a aprovação/merge do PR não são etapas da regressão.
# Incluir artefatos reais produzidos nesta execução, sem copiar arquivos de credenciais.
python3 - "$RAIZ" "$D" <<'ARTEFATOS_PY'
from pathlib import Path
import shutil, sys
raiz=Path(sys.argv[1]); D=Path(sys.argv[2]); qa=raiz/'qa'
marco=D/'01-DOCKER.txt'
limite=marco.stat().st_mtime if marco.exists() else 0
n=0
for f in qa.rglob('*'):
 if not f.is_file() or not f.stat().st_mtime >= limite:continue
 if '.local' not in f.parts:continue
 nm=f.name.lower()
 if nm in ('credenciais.json','contas-dev-fixture.json') or 'token' in nm or 'senha' in nm:continue
 permitido=(nm.startswith(('resultado','relatorio','evidencias')) and f.suffix.lower() in ('.json','.zip','.txt')) or f.suffix.lower() in ('.png','.webp')
 if not permitido or f.stat().st_size > 40*1024*1024:continue
 destino=D/'QA-ARTEFATOS'/f.relative_to(qa)
 destino.parent.mkdir(parents=True,exist_ok=True)
 shutil.copy2(f,destino);n+=1
print('QA artefatos reais copiados:',n)
ARTEFATOS_PY
fi

run 90-GIT-DIFF-CHECK git diff --check
run 91-GIT-STATUS git status --short
if (( FALHOU > 0 )); then exit 1; fi
if (( PULOU > 0 )); then exit 3; fi
