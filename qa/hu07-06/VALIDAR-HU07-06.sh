#!/usr/bin/env bash
set -euo pipefail
RAIZ="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$RAIZ"
echo '[HU07-06] Testes locais do consolidado e sintaxe Python; NÃO substituem navegador real.'
python3 - <<'PYTEST'
import ast
from pathlib import Path
for p in Path('qa/hu07-06').glob('*.py'):
    ast.parse(p.read_text(encoding='utf-8'), filename=str(p))
print('[HU07-06] Sintaxe Python verificada sem gerar __pycache__')
PYTEST
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=qa/hu07-06 python3 -B -m unittest discover -s qa/hu07-06 -p 'teste_*.py' -v
echo '[HU07-06] Validando suite da HU07-05 já existente + regressões, backend e frontend.'
docker compose exec -T backend npm test -- --runInBand
docker compose exec -T backend npm run lint
docker compose exec -T backend npm run build
docker compose exec -T frontend npm test -- --runInBand
docker compose exec -T frontend npm run lint
docker compose exec -T frontend npx tsc --noEmit
echo '[HU07-06] Verificações estáticas aprovadas. Falta QA real no navegador para os CINCO perfis.'
