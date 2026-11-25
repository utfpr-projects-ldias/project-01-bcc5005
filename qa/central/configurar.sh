#!/usr/bin/env bash
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"
command -v python3 >/dev/null || { echo 'Instale python3 e python3-venv' >&2; exit 2; }
command -v docker >/dev/null || { echo 'Instale Docker Engine e Docker Compose v2' >&2; exit 2; }
docker info >/dev/null 2>&1 || { echo 'Inicie o Docker (sudo systemctl start docker) e confira acesso ao daemon' >&2; exit 2; }
docker compose version >/dev/null || { echo 'Docker Compose v2 indisponível' >&2; exit 2; }
if [[ ! -f .env ]]; then
  NOVO=1
else
  NOVO=0
fi
python3 qa/central/preparar_env.py
printf '
[1/5] Build e containers DEV
'
docker compose config -q
docker compose up -d --build
printf '
[2/5] Migrations do banco DEV
'
# Banco novo ou inicialização interrompida: aplicar schema ainda não criado.
# Ambiente já usado: só consultar migrations, sem modificar tabelas.
SCHEMA_EXISTE="$(printf "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='usuarios';\n" | docker compose exec -T database sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq' | tr -d '\r\n')"
if (( NOVO )) || [[ "$SCHEMA_EXISTE" == 0 ]]; then
  docker compose exec -T backend npm run migration:run
elif [[ "$SCHEMA_EXISTE" == 1 ]]; then
  docker compose exec -T backend npm run migration:show
else
  echo 'Não foi possível verificar o schema do banco DEV' >&2
  exit 2
fi
printf '
[3/5] Preparar executável de bootstrap ADMIN
'
docker compose exec -T backend npm run build
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
