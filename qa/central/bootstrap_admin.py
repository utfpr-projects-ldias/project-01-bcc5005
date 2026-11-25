#!/usr/bin/env python3
"""Garante Administrador DEV inicial via CLI do projeto sem perguntas/eco de senha.

Usa somente a fixture local de QA já distribuída pelo projeto. Não altera
contas existentes nem imprime senhas ou tokens.
"""
from pathlib import Path
import json
import re
import subprocess
import sys

raiz=Path(__file__).resolve().parents[2]
credenciais=raiz/'qa/hu07-06/.local/credenciais.json'
if not credenciais.exists() or credenciais.is_symlink():
    raise SystemExit('Configuração local de QA ausente; execute ./configurar-testes')
dados=json.loads(credenciais.read_text(encoding='utf-8'))
conta=dados.get('contas',{}).get('administrador',{})
email=conta.get('email','')
senha=conta.get('senha','')
if not isinstance(email,str) or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email):
    raise SystemExit('E-mail ADMIN inválido na fixture local')
if not isinstance(senha,str) or len(senha)<12:
    raise SystemExit('Senha ADMIN insuficiente na fixture local')
cmd=['docker','compose','exec','-T','database','sh','-lc',
     'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq']
q=subprocess.run(cmd,input="SELECT count(*) FROM usuarios WHERE perfil='ADMINISTRADOR';\n",text=True,cwd=raiz,capture_output=True)
if q.returncode:
    raise SystemExit('Não foi possível consultar a existência do Administrador DEV após as migrations')
if q.stdout.strip()!='0':
    if q.stdout.strip().isdigit() and int(q.stdout.strip())>0:
        print('ADMIN DEV EXISTENTE: nenhuma credencial ou conta alterada')
        sys.exit(0)
    raise SystemExit('Resultado inesperado ao consultar Administrador DEV')
cmd=['docker','compose','exec','-T','backend','node','dist/usuarios/cli/bootstrap-admin.js']
result=subprocess.run(cmd,input='novo\n'+email+'\n'+senha+'\n',text=True,cwd=raiz,capture_output=True)
if result.returncode:
    # No print do stdout/stderr para não refletir possíveis tokens/segredos
    raise SystemExit('Falha no bootstrap ADMIN; verificar sessão SuperTokens e logs de forma privada')
print('ADMIN DEV CRIADO: autenticação via CLI offline do projeto; login QA automático pronto')
