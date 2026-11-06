#!/usr/bin/env bash
# Somente leitura de banco, sem migrations, sem QA com mutações, sem correções de fonte.
set -uo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIRETORIO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODO="${1:---ajuda}"
cd "$RAIZ" || exit 2
umask 077

preflight() {
  echo '=== DIAGNÓSTICO DE REPOSITÓRIO (sem alterações) ==='
  python3 "$DIRETORIO/verificar_snapshot.py"
  verif=$?
  echo
  echo '=== Arquivos alterados: somente NOMES (sem conteúdo) ==='
  git status --short 2>/dev/null || true
  echo
  echo '=== Formatação de patch Git ==='
  git diff --check && echo 'OK: git diff --check' || echo 'ATENÇÃO: git diff --check reportou divergências'
  echo
  echo '=== Infraestrutura (somente consulta) ==='
  if command -v docker >/dev/null 2>&1; then
    docker compose ps --status running 2>&1 || true
  else
    echo 'Docker não disponível neste terminal.'
  fi
  echo
  echo '=== Base privada de QA ==='
  PY="$RAIZ/qa/hu07-06/.local/venv/bin/python"
  [[ -x "$PY" ]] && echo 'OK: Python privado do Playwright localizado' || echo 'PENDENTE no ambiente atual: qa/hu07-06/.local/venv/bin/python'
  [[ -d "$RAIZ/qa/hu07-06/.local/browsers" ]] && echo 'OK: diretório privado dos browsers localizado' || echo 'PENDENTE no ambiente atual: diretório Playwright privado (pode ser intencional no ZIP)'
  echo 'Pré-voo concluído. Exit code da identidade de fonte:' "$verif"
  return "$verif"
}

novo_logdir() {
  LOCAL="$DIRETORIO/.local/execucoes/$(date +%Y%m%dT%H%M%S)-$$"
  mkdir -p "$LOCAL"
  chmod 700 "$LOCAL"
  echo "Logs privados desta rodada: $LOCAL"
}

passaram=0
falharam=0
run_step() {
  local titulo="$1" nome="$2"; shift 2
  local log="$LOCAL/$nome.log"
  echo
  echo "==> $titulo"
  if "$@" >"$log" 2>&1; then
    passaram=$((passaram+1)); echo "APROVADO | log: $log"
  else
    local rc=$?
    falharam=$((falharam+1)); echo "FALHOU (exit $rc) | log: $log"
  fi
  # Não imprimir logs completos ou credenciais automaticamente.
  # O objetivo é NÃO interromper as verificações independentes após o primeiro erro.
}

resumo() {
  echo
  echo "RESUMO: $passaram etapa(s) aprovadas; $falharam com falha."
  echo 'Para visualizar a falha: abra o log indicado; revise e oculte segredos antes de compartilhar.'
  if ((falharam>0)); then return 1; fi
}

exigir_snapshot() {
  python3 "$DIRETORIO/verificar_snapshot.py"
  local rc=$?
  if ((rc!=0)); then
    echo 'Interrompido: o projeto difere da versão auditada. Não executar bateria a partir deste pacote.' >&2
    return "$rc"
  fi
}

case "$MODO" in
  --preflight)
    preflight ;;
  --target)
    exigir_snapshot || exit $?
    novo_logdir
    run_step 'Jest focal: formulário do entregável + evidências + permissões' 'frontend-jest-direcionado' \
      docker compose exec -T frontend npm test -- --runInBand --runTestsByPath \
      src/app/contratos/components/formulario-entregavel.test.tsx \
      src/app/contratos/components/entregaveis-da-etapa.test.tsx \
      src/app/contratos/components/painel-comprovacao-evidencia.test.tsx \
      src/app/admin/usuarios/page.test.tsx
    resumo ;;
  --full)
    exigir_snapshot || exit $?
    novo_logdir
    run_step 'Backend: Jest unitário' 'backend-jest' docker compose exec -T backend npm test -- --runInBand
    run_step 'Backend: oxlint' 'backend-lint' docker compose exec -T backend npm run lint
    run_step 'Backend: nest build' 'backend-build' docker compose exec -T backend npm run build
    run_step 'Frontend: Jest unitário' 'frontend-jest' docker compose exec -T frontend npm test -- --runInBand
    run_step 'Frontend: ESLint' 'frontend-lint' docker compose exec -T frontend npm run lint
    run_step 'Frontend: next build' 'frontend-build' docker compose exec -T frontend npm run build
    resumo ;;
  --qa-verificar)
    exigir_snapshot || exit $?
    novo_logdir
    run_step 'QA evidências: pré-voo SOMENTE LEITURA' 'qa-evidencias-preflight' \
      bash qa/evidencias-verificacao/VALIDAR-INTEGRACAO-REAL.sh --verificar
    PY="$RAIZ/qa/hu07-06/.local/venv/bin/python"
    if [[ -x "$PY" ]]; then
      run_step 'QA modal: pré-voo SOMENTE LEITURA' 'qa-modal-preflight' \
        "$PY" qa/tec08-modal-ux/validar_modal_real.py --verificar
    else
      echo 'QA modal: Python privado indisponível; nenhuma instalação automática.'
      falharam=$((falharam+1))
    fi
    resumo ;;
  --ajuda|-h|--help)
    cat <<'EOF'
MODOS (sem migração, sem reset de banco, sem criação de dados sintéticos):
  --preflight      compara hashes/HEAD/branch, status Git e localização do QA privado
  --target         Jest de quatro suites afetadas; falha conhecida no label Salvando...
  --full           todos os unitários, lint e builds; cada gate roda mesmo se outro falhar
  --qa-verificar   SOMENTE preflight dos QAs existentes (GET/migration:show e credenciais)
NÃO há modo de executar QA mutável neste kit. Corrigir e validar os gates primeiro.
EOF
    ;;
  *) echo "Modo inválido: $MODO" >&2; exit 2 ;;
esac
