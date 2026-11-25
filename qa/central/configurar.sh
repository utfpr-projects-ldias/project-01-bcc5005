#!/usr/bin/env bash
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"
command -v python3 >/dev/null || { echo 'Instale python3 e python3-venv' >&2; exit 2; }
command -v docker >/dev/null || { echo 'Instale Docker Engine e Docker Compose v2' >&2; exit 2; }
docker info >/dev/null 2>&1 || { echo 'Inicie o Docker (sudo systemctl start docker) e confira acesso ao daemon' >&2; exit 2; }
docker compose version >/dev/null || { echo 'Docker Compose v2 indisponível' >&2; exit 2; }
python3 qa/central/preparar_env.py
printf '
[1/5] Build e containers DEV
'
docker compose config -q
docker compose up -d --wait database supertokens
# Recriar apenas aplicações e volumes anônimos de dependências/cache.
docker compose up -d --build --force-recreate --renew-anon-volumes --no-deps backend frontend
printf '
[2/5] Migrations do banco DEV
'
# O executor serializa migrations e verifica o histórico antes/depois.
docker compose exec -T backend npm run migration:run
printf '
[3/5] Aguardar prontidão do backend e frontend
'
python3 qa/central/aguardar_servicos.py
printf '
[4/5] Python/Playwright/Chromium e credenciais locais QA
'
bash qa/hu07-06/INSTALAR-LOCAL.sh
printf '
[5/5] Administrador DEV (somente se inexistente)
'
python3 qa/central/bootstrap_admin.py
printf '
AMBIENTE CONFIGURADO. Use ./back, ./front ou ./testes-all
'
