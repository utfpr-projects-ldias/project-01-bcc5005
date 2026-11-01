#!/usr/bin/env bash
set -euo pipefail
RAIZ="${1:-$PWD}"
cd "$RAIZ"
echo '[HU07-06] Python: testes de autorização, consolidação, credenciais e roteiro real (sem navegador)'
(cd qa/hu07-06 && PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -p 'teste_*.py' -v)
echo '[HU07] Backend: Jest, Oxlint e build (filtro de funcionários ativos)'
docker compose exec -T backend npm test -- --runInBand
docker compose exec -T backend npm run lint
docker compose exec -T backend npm run build
echo '[HU07] Frontend: testes Jest, ESLint, TypeScript'
docker compose exec -T frontend npm test -- --runInBand
docker compose exec -T frontend npm run lint
docker compose exec -T frontend npx tsc --noEmit
echo '[HU07-06] Código validado localmente; QA real ainda precisa de execução no navegador.'
