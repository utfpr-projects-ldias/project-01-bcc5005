#!/usr/bin/env bash
# TEC08 UI/UX: validações independentes com logs privados e sem mutação de dados.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
QA="$ROOT/qa/tec08-uiux-final"
cd "$ROOT" || exit 2
umask 077
MODO="${1:---ajuda}"
LOGDIR=""
OK=0; ERRO=0

verificar_origem() {
  if [[ "$(git branch --show-current 2>/dev/null)" != "tec-08" ]]; then
    echo 'BLOQUEIO: verificador QA reservado a branch tec-08.' >&2; return 3
  fi
  if ! git merge-base --is-ancestor '3eeed69ccb1af2b069cb38ef0563c7b45354072b' HEAD; then
    echo 'BLOQUEIO: HEAD nao contem o commit-base auditado 3eeed69.' >&2; return 3
  fi
  if ! (cd "$ROOT" && sha256sum -c --status qa/tec08-uiux-final/HASHES.sha256); then
    echo 'BLOQUEIO: pelo menos um arquivo da implementação difere do pacote validado.' >&2; return 3
  fi
  if ! git diff --check; then
    echo 'BLOQUEIO: git diff --check apontou erros de espaço ou conflito.' >&2; return 3
  fi
  echo 'OK: branch, HEAD, hashes e git diff --check.'
}

abrir_logs() {
  LOGDIR="$QA/.local/execucoes/$(date -u +%Y%m%dT%H%M%SZ)-$$"
  mkdir -p "$LOGDIR"; chmod 700 "$LOGDIR"
  echo "Logs privados: $LOGDIR"
}

passo() {
  local titulo="$1" slug="$2"; shift 2
  local log="$LOGDIR/${slug}.log"
  echo; echo "==> $titulo"
  if "$@" >"$log" 2>&1; then
    echo "APROVADO | $log"; OK=$((OK+1))
  else
    local codigo=$?
    echo "FALHOU (exit $codigo) | $log"; ERRO=$((ERRO+1))
  fi
}

resumo() {
  echo; echo "RESUMO: $OK aprovado(s), $ERRO falha(s)."
  echo 'Os logs não foram impressos. Revise e oculte dados pessoais antes de compartilhá-los.'
  (( ERRO == 0 ))
}

python_privado() {
  local path="$ROOT/qa/hu07-06/.local/venv/bin/python"
  if [[ ! -x "$path" ]]; then
    echo 'BLOQUEIO: Playwright privado não localizado (não instalar nada por cima do QA existente).' >&2
    return 3
  fi
  export PLAYWRIGHT_BROWSERS_PATH="$ROOT/qa/hu07-06/.local/browsers"
  export PYTHONDONTWRITEBYTECODE=1
  [[ -d "$PLAYWRIGHT_BROWSERS_PATH" ]] || { echo 'BLOQUEIO: diretório browsers privado não localizado.' >&2; return 3; }
  PY="$path"
}

case "$MODO" in
  --preflight)
    verificar_origem || exit $?
    git status --short
    echo 'As migrations, os usuários e os volumes NÃO foram alterados.'
    ;;
  --target)
    verificar_origem || exit $?
    abrir_logs
    passo 'Frontend Jest: entregáveis / evidências / navegação / contratos' 'frontend-jest-focal' \
      docker compose exec -T frontend npm test -- --runInBand --runTestsByPath \
      src/app/contratos/components/formulario-entregavel.test.tsx \
      src/lib/entregaveis.datas.test.ts \
      src/app/contratos/components/resumo-planejamento-contrato.test.tsx \
      src/app/contratos/components/entregaveis-da-etapa.test.tsx \
      src/app/contratos/components/painel-comprovacao-evidencia.test.tsx \
      src/app/contratos/components/conteudo-entregavel.cadastro.test.tsx \
      src/app/contratos/components/modal-etapa.test.tsx \
      src/app/contratos/components/painel-etapas.test.tsx \
      src/app/contratos/components/painel-etapas.hu06-04.test.tsx \
      src/app/contratos/components/formulario-contrato.test.tsx \
      src/app/contratos/components/painel-documentos.test.tsx \
      src/app/admin/usuarios/components/modal-identificacao-contrato.test.tsx \
      src/app/admin/usuarios/components/editor-permissoes-contrato.test.tsx \
      'src/app/contratos/[id]/entregaveis/[entregavelId]/page.test.tsx' \
      src/app/contratos/page.test.tsx \
      'src/app/contratos/[id]/page.test.tsx' \
      src/app/components/menu-modulos.test.tsx \
      src/app/components/estrutura-interna.test.tsx
    passo 'Regressões dos roteiros Chromium: seleção de arquivo e retorno aos cartões' 'qa-roteiros-unitarios' \
      python3 -m unittest discover -s qa/tec08-uiux-final -p 'teste_fluxos_qa_atualizados.py' -v
    passo 'Regressões TEC08-03: uploads, contratos e transições' 'qa-documentos-unitarios' \
      python3 -m unittest discover -s qa/tec08-03 -p 'teste_validar_ui_real.py' -v
    passo 'Backend Jest: eventos, comprovantes e arquivamento' 'backend-jest-focal' \
      docker compose exec -T backend npm test -- --runInBand --runTestsByPath \
      src/entregaveis/evidencias-recebidas.service.spec.ts \
      src/entregaveis/entregaveis.service.spec.ts \
      src/entregaveis/resumo-documental.spec.ts \
      src/documentos/documentos.service.spec.ts \
      src/documentos/documentos.controller.spec.ts \
      src/entregaveis/arquivamento-planejamento.service.spec.ts \
      src/autorizacao/gestao-permissoes.service.spec.ts
    resumo ;;
  --full)
    verificar_origem || exit $?
    abrir_logs
    passo 'Backend Jest' 'backend-jest' docker compose exec -T backend npm test -- --runInBand
    passo 'Backend lint' 'backend-lint' docker compose exec -T backend npm run lint
    passo 'Backend build' 'backend-build' docker compose exec -T backend npm run build
    passo 'Frontend Jest' 'frontend-jest' docker compose exec -T frontend npm test -- --runInBand
    passo 'Frontend lint' 'frontend-lint' docker compose exec -T frontend npm run lint
    passo 'Frontend build' 'frontend-build' docker compose exec -T frontend npm run build
    if resumo; then
      cp "$QA/HASHES.sha256" "$QA/.local/ultimo-full-aprovado.sha256" && chmod 600 "$QA/.local/ultimo-full-aprovado.sha256"
      echo 'GATE: bateria completa aprovada nesta versão dos arquivos.'
    else
      rm -f "$QA/.local/ultimo-full-aprovado.sha256"; exit 1
    fi
    ;;
  --qa-verificar)
    verificar_origem || exit $?
    python_privado || exit $?
    abrir_logs
    passo 'Regressões dos roteiros QA atualizados' 'qa-roteiros-unitarios' \
      python3 -m unittest discover -s qa/tec08-uiux-final -p 'teste_fluxos_qa_atualizados.py' -v
    passo 'Pré-voo evidências / banco / contas' 'qa-evidencias-preflight' \
      bash qa/evidencias-verificacao/VALIDAR-INTEGRACAO-REAL.sh --verificar
    passo 'Pré-voo TEC08-03: cadastro e documentos contratuais' 'qa-tec08-03-preflight' \
      bash qa/tec08-03/VALIDAR-INTEGRACAO-REAL.sh --verificar
    passo 'Pré-voo modal de entregável' 'qa-modal-preflight' \
      "$PY" qa/tec08-modal-ux/validar_modal_real.py --verificar
    passo 'Pré-voo card/modal de evidência' 'qa-card-preflight' \
      "$PY" qa/tec08-uiux-final/validar_card_evidencia_real.py --verificar
    resumo ;;
  --qa-executar)
    verificar_origem || exit $?
    [[ "${2:-}" == '--confirmar-persistencia' ]] || {
      echo 'QA real cria dados sintéticos persistentes. Exigido: --qa-executar --confirmar-persistencia' >&2
      exit 3
    }
    python_privado || exit $?
    [[ -f "$QA/.local/ultimo-full-aprovado.sha256" ]] || {
      echo 'Execute --full e obtenha 6/6 antes do QA mutável.' >&2; exit 3
    }
    cmp -s "$QA/HASHES.sha256" "$QA/.local/ultimo-full-aprovado.sha256" || {
      echo 'O código mudou após o --full; execute-o novamente.' >&2; exit 3
    }
    abrir_logs
    PASSOS_QA=(--executar --confirmar-persistencia)
    [[ "${3:-}" == '--visivel' ]] && PASSOS_QA+=(--visivel)
    passo 'Chromium real: evidências e autorizações' 'qa-evidencias-real' \
      bash qa/evidencias-verificacao/VALIDAR-INTEGRACAO-REAL.sh "${PASSOS_QA[@]}"
    passo 'Chromium real: interface documental, PDF e suspensão/retomada' 'qa-documentos-real' \
      bash qa/tec08-03/VALIDAR-INTEGRACAO-REAL.sh "${PASSOS_QA[@]}"
    passo 'Chromium real: detalhes/arquivar entregável' 'qa-modal-real' \
      "$PY" qa/tec08-modal-ux/validar_modal_real.py "${PASSOS_QA[@]}"
    passo 'Chromium real: card/evidência/auditoria' 'qa-card-real' \
      "$PY" qa/tec08-uiux-final/validar_card_evidencia_real.py "${PASSOS_QA[@]}"
    resumo ;;
  *)
    cat <<'HELP'
Uso: bash qa/tec08-uiux-final/VALIDAR.sh MODO
  --preflight             Somente hash/branch/HEAD/status
  --target                Jest focais (backend/frontend)
  --full                  Jest, lint, build backend/frontend independentes
  --qa-verificar          Playwright: pré-voo SEM criar registros
  --qa-executar --confirmar-persistencia [--visivel]
                          Executa QA real e grava dados SINTÉTICOS no DEV
Nenhum modo executa migrations, reset de banco, commit ou altera contas permanentes.
HELP
    ;;
esac
