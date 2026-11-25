#!/usr/bin/env python3
"""Cria .env apenas se ausente; nunca imprime os segredos gerados."""
from pathlib import Path
import os
import secrets
import sys

raiz=Path(__file__).resolve().parents[2]
saida=raiz/'.env'
if saida.is_symlink():
    raise SystemExit('.env é link simbólico; configuração recusada')
if saida.exists():
    print('CONFIGURAÇÃO EXISTENTE: .env preservado')
    sys.exit(0)
modelo=raiz/'.env.example'
if not modelo.is_file():
    raise SystemExit('.env.example ausente')
conteudo=modelo.read_text(encoding='utf-8')
if conteudo.count('POSTGRES_PASSWORD=CHANGE_ME')!=1 or conteudo.count('SUPERTOKENS_API_KEY=CHANGE_ME')!=1:
    raise SystemExit('Modelo .env.example inesperado; recusado')
conteudo=conteudo.replace('POSTGRES_PASSWORD=CHANGE_ME','POSTGRES_PASSWORD='+secrets.token_hex(24))
conteudo=conteudo.replace('SUPERTOKENS_API_KEY=CHANGE_ME','SUPERTOKENS_API_KEY='+secrets.token_hex(32))
fd=os.open(saida, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
with os.fdopen(fd,'w',encoding='utf-8') as arq:
    arq.write(conteudo)
os.chmod(saida,0o600)
print('CONFIGURAÇÃO NOVA: .env gerado com segredos locais sem interação')
