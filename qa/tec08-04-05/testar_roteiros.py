#!/usr/bin/env python3
"""Executa baterias unitárias QA legadas e atuais isoladamente (sem importar módulos homônimos)."""
from pathlib import Path
import os
import subprocess
import sys

RAIZ = Path(__file__).resolve().parents[2]
GRUPOS = (
    'hu06-05', 'hu07-06', 'preparar-qa', 'tec08-02', 'tec08-03',
    'tec08-14b', 'evidencias-verificacao', 'tec08-uiux-final', 'tec08-04-05',
)


def main() -> int:
    falhas = []
    for grupo in GRUPOS:
        print(f'\n===== QA offline: {grupo} =====', flush=True)
        ambiente = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}
        p = subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s',
                            str(RAIZ / 'qa' / grupo), '-p', 'teste_*.py', '-v'],
                           cwd=RAIZ, env=ambiente, check=False)
        if p.returncode:
            falhas.append(grupo)
    if falhas:
        print('QA OFFLINE REPROVADO em: ' + ', '.join(falhas))
        return 1
    print(f'QA OFFLINE APROVADO: {len(GRUPOS)}/{len(GRUPOS)} grupos')
    return 0

if __name__ == '__main__':
    sys.exit(main())
