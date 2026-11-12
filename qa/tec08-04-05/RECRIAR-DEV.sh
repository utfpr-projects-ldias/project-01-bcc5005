#!/usr/bin/env bash
# TEC08-04/05: recuperação DEV reproduzível. APAGA TODOS OS DADOS COMPOSE, SEM BACKUP.
# --consultar é não destrutivo; --executar pede confirmação interativa duas vezes.
set -Eeuo pipefail
umask 077
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"
RESET='qa/tec08-uiux-final/RESET-TOTAL-DEV-SEM-BACKUP.sh'
PY='qa/hu07-06/.local/venv/bin/python'
Fase='Pré-verificação'
fim_erro() { echo "[QA] FALHOU na fase: $Fase. NÃO repita o reset; retome a partir dessa fase." >&2; }
trap fim_erro ERR
[[ "$(basename "$RAIZ")" == 'project-01-bcc5005' ]] || { echo 'BLOQUEIO: diretório inesperado' >&2; exit 2; }
[[ "$(git branch --show-current)" == 'tec-08-04-05' ]] || { echo 'BLOQUEIO: requer branch tec-08-04-05' >&2; exit 2; }
[[ -f .env && -f docker-compose.yml ]] || { echo 'BLOQUEIO: .env ou Compose ausente' >&2; exit 2; }
[[ -x "$PY" ]] || { echo 'BLOQUEIO: instale antes bash qa/hu07-06/INSTALAR-LOCAL.sh' >&2; exit 2; }
[[ -d qa/hu07-06/.local/browsers ]] || { echo 'BLOQUEIO: Chromium privado não instalado' >&2; exit 2; }
docker compose config -q
# Ler contas sem imprimi-las nem colocá-las nos argumentos do shell.
python3 - <<'PYQA'
import sys
sys.path.insert(0,'qa/hu07-06')
from credenciais_locais import carregar_credenciais
esperados = {'administrador':'rinaldi@gmail.com','gestor-edicao':'rinaldi3@gmail.com','colaborador':'rinaldi2@gmail.com'}
for papel, email in esperados.items():
    real, senha = carregar_credenciais(papel)
    assert real.casefold() == email, f'Email de {papel} difere da fixture DEV esperada'
    assert len(senha) >= 12, f'Senha de {papel} não atende ao bootstrap de 12 caracteres'
print('OK: três identidades DEV configuradas (senhas não exibidas)')
PYQA
bash qa/tec08-uiux-final/VALIDAR.sh --preflight
if [[ "${1:---consultar}" == '--consultar' ]]; then
  echo
  bash "$RESET"
  echo 'Para DESTRUIR os volumes, sem backup, e recriar 3 contas DEV:'
  echo 'bash qa/tec08-04-05/RECRIAR-DEV.sh --executar'
  exit 0
fi
[[ "$#" == 1 && "$1" == '--executar' && -t 0 ]] || {
  echo 'BLOQUEIO: use exclusivamente --executar em terminal interativo.' >&2; exit 2;
}
Fase='Reset de volumes SEM backup (confirmação no terminal)'
bash "$RESET" --executar
Fase='Migrations em PostgreSQL vazio'
docker compose run --rm --no-deps -T backend npm run migration:run
MIGRACOES="$(docker compose run --rm --no-deps -T backend npm run migration:show)"
printf '%s\n' "$MIGRACOES"
[[ "$(printf '%s\n' "$MIGRACOES" | grep -c '^\[X\]' || true)" == 23 ]] || {
  echo 'BLOQUEIO: esperado 23 migrations aplicadas' >&2; exit 1;
}
if printf '%s\n' "$MIGRACOES" | grep -q '^\[ \]'; then
  echo 'BLOQUEIO: migrations pendentes' >&2; exit 1
fi
Fase='Compilar CLI do bootstrap do Administrador'
docker compose run --rm --no-deps -T backend npm run build
Fase='Criar Administrador automaticamente pela CLI (stdin, sem parâmetros de senha)'
python3 - <<'PYQA' | docker compose run --rm --no-deps -T backend node dist/usuarios/cli/bootstrap-admin.js
import sys
sys.path.insert(0,'qa/hu07-06')
from credenciais_locais import carregar_credenciais
email, senha = carregar_credenciais('administrador')
sys.stdout.write('novo\n' + email + '\n' + senha + '\n')
PYQA
Fase='Iniciar Nest e Next'
docker compose up -d --build backend frontend
aguardar() {
  local url="$1" ok=0
  for _ in $(seq 1 50); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then ok=1; break; fi
    sleep 2
  done
  [[ "$ok" == 1 ]] || { echo "BLOQUEIO: serviço não respondeu: $url" >&2; return 1; }
}
Fase='Prontidão HTTP Next e Nest'
aguardar 'http://localhost:3001/'
aguardar 'http://localhost:3000/login'
Fase='Criar Gestor e Colaborador via login real Admin e API auditada'
export PLAYWRIGHT_BROWSERS_PATH="$RAIZ/qa/hu07-06/.local/browsers"
export PYTHONDONTWRITEBYTECODE=1
"$PY" qa/preparar-qa/provisionar_funcionarios.py --login-automatico --confirmar
Fase='Validar autenticação real dos 3 perfis'
"$PY" qa/tec08-04-05/verificar_logins.py
Fase='Concluída'
trap - ERR
echo 'DEV RECRIADO: 23 migrations, 3 contas QA válidas. Contratos sintéticos ainda NÃO foram criados.'
echo 'Agora execute --target, --full, --qa-verificar e --qa-executar com confirmação.'
