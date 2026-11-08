#!/usr/bin/env python3
"""Conferência estritamente de leitura: nenhum arquivo do projeto é alterado."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path
RAIZ=Path(__file__).resolve().parents[2]
ARQ=Path(__file__).with_name('snapshot-fingerprints.json')

def git(*args):
    try:
        p=subprocess.run(['git','-C',str(RAIZ),*args], capture_output=True, text=True, check=False, timeout=15)
        return p.stdout.strip() if p.returncode==0 else '(indisponível)'
    except (OSError,subprocess.TimeoutExpired): return '(indisponível)'

def main():
    info=json.loads(ARQ.read_text('utf-8'))
    branch=git('branch','--show-current')
    head=git('rev-parse','HEAD')
    print('Branch local:',branch)
    print('Commit local:',head[:12] if head!='(indisponível)' else head)
    print('Base de referência:',info['head'][:12])
    print('Observação: o Git exportado não confirma a situação remota atual.')
    bad=[]
    for rel,esperado in info['sha256_por_arquivo'].items():
        p=RAIZ/rel
        if not p.is_file(): bad.append((rel,'AUSENTE')); continue
        if hashlib.sha256(p.read_bytes()).hexdigest()!=esperado:bad.append((rel,'DIFERENTE'))
    print('Arquivos de código/QA conferidos:',len(info['sha256_por_arquivo']))
    if bad:
        print('ALERTA: snapshot diverge da exportação recebida:')
        for rel,s in bad:print(f'  {s}: {rel}')
        print('Não aplique correções preparadas para a versão antiga sem reavaliar o diff.')
    else:
        print('OK: os arquivos críticos conferem com a exportação auditada.')
    if branch!=info['branch'] or head!=info['head']:
        print('ALERTA: branch ou HEAD diferente do ZIP recebido; verificar antes de qualquer patch.')
        return 3
    return 4 if bad else 0

if __name__=='__main__':sys.exit(main())
