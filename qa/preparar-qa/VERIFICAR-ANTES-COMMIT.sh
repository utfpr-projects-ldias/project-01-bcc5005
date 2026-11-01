#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
echo '[GIT] Verificando caminhos preparados e arquivos privados já rastreados'
python3 - <<'PY'
import subprocess
from pathlib import PurePosixPath

def lista(args):
    return [p for p in subprocess.check_output(args).decode('utf-8').split('\0') if p]

def privado(nome):
    p=PurePosixPath(nome)
    partes=p.parts
    if ('.local' in partes or '__pycache__' in partes or '.venv' in partes or 'venv' in partes or
        'node_modules' in partes or 'browsers' in partes or '.next' in partes or 'dist' in partes or
        p.name.startswith('.env') and p.name != '.env.example' or
        p.name in ('credenciais.json', 'registro-visual.json') or
        nome.startswith('qa/') and (p.suffix in ('.zip', '.log', '.pyc', '.pyo') or 'execucoes' in partes or 'relatorios' in partes)):
        return True
    return False

rastreados = lista(['git', 'ls-files', '-z'])
preparados = lista(['git', 'diff', '--cached', '--name-only', '-z'])
irregulares = sorted(set(x for x in rastreados + preparados if privado(x)))
if irregulares:
    for f in irregulares: print('NÃO VERSIONAR:', f)
    raise SystemExit('BLOQUEADO: arquivos privados/perigosos no índice Git')
print('OK: arquivos privados excluídos dos rastreados e staged.')
print('Arquivos preparados:', len(preparados))
PY

git diff --cached --check

git check-ignore -q qa/hu07-06/.local/credenciais.json
git check-ignore -q qa/hu06-05/.local/execucoes/qualquer/resultado.json
git check-ignore -q qa/.local/execucoes/qualquer/credenciais.json

echo '[GIT] OK. Revise git diff --cached --stat e git diff --cached antes de commitar.'
