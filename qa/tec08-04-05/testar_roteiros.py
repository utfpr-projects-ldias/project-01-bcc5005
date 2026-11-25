#!/usr/bin/env python3
"""Entrada offline independente; cada arquivo unittest é executado uma única vez."""
from pathlib import Path
import os
import subprocess
import sys

RAIZ = Path(__file__).resolve().parents[2]


def main() -> int:
    fontes = sorted(p for p in (RAIZ / 'qa').rglob('*.py')
                    if p.name.startswith(('teste_', 'test_'))
                    and not {'.local', '__pycache__'}.intersection(p.parts))
    if not fontes:
        print('Nenhuma suíte QA localizada', file=sys.stderr)
        return 2
    falhas = []
    for fonte in fontes:
        nome = str(fonte.relative_to(RAIZ))
        print(f'\n===== QA offline: {nome} =====', flush=True)
        p = subprocess.run([sys.executable, str(fonte)], cwd=RAIZ,
                           env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}, check=False)
        if p.returncode:
            falhas.append(nome)
    print(f'QA OFFLINE: {len(fontes)-len(falhas)}/{len(fontes)} arquivos aprovados')
    for nome in falhas:
        print('FAIL:', nome)
    return int(bool(falhas))


if __name__ == '__main__':
    sys.exit(main())
