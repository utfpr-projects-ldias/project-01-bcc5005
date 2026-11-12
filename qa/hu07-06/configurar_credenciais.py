#!/usr/bin/env python3
"""Configuração local única: lê senha sem eco, salva fora do Git com chmod 0600."""
from __future__ import annotations

import argparse
from getpass import getpass
import json
import os
from pathlib import Path

from credenciais_locais import CAMINHO_PADRAO


def main():
    parser = argparse.ArgumentParser(description='Configurar login automático das contas DEV do QA HU07-06')
    parser.add_argument('--admin-email')
    parser.add_argument('--gestor-email')
    parser.add_argument('--colaborador-email')
    parser.add_argument('--sobrescrever', action='store_true')
    args = parser.parse_args()
    caminho = CAMINHO_PADRAO
    if caminho.exists() and not args.sobrescrever:
        parser.error('O arquivo privado já existe. Use --sobrescrever apenas se desejar substituir.')
    if caminho.is_symlink():
        parser.error('O destino é um link simbólico; não será utilizado.')

    contas = {}
    for alias, email_argumento in [('administrador', args.admin_email),
                                    ('gestor', args.gestor_email),
                                    ('colaborador', args.colaborador_email)]:
        email = (email_argumento or input(f'E-mail da conta DEV {alias}: ')).strip().lower()
        if '@' not in email or '\n' in email:
            parser.error(f'E-mail inválido para {alias}')
        contas[alias] = {'email': email}

    print('Informe uma vez a senha compartilhada das TRÊS contas descartáveis. Não será exibida.')
    senha = getpass('Senha DEV compartilhada: ')
    if not senha:
        parser.error('Senha vazia não é permitida')
    for conta in contas.values():
        conta['senha'] = senha
    mapeamento = {
        'administrador': 'administrador', 'gestor-edicao': 'gestor',
        'gestor-leitura': 'gestor', 'colaborador': 'colaborador',
        'sem-vinculo': 'colaborador',
    }
    conteudo = json.dumps({'contas': contas, 'perfis': mapeamento}, indent=2, ensure_ascii=False) + '\n'
    pasta = caminho.parent
    pasta.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(pasta, 0o700)
    # O_EXCL evita sobrescrever/symlink acidentalmente; --sobrescrever remove arquivo regular prévio.
    if caminho.exists() and args.sobrescrever:
        if not caminho.is_file() or caminho.is_symlink():
            parser.error('Somente arquivo regular pode ser substituído')
        caminho.unlink()
    fd = os.open(caminho, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(conteudo)
    finally:
        os.chmod(caminho, 0o600)
    print('Credenciais DEV em qa/hu07-06/.local/credenciais.json (ignorado pelo Git, 0600).')
    print('Gestor em edição/leitura e Colaborador em com/sem vínculo exigem ajustes prévios de acesso.')
    print('Não coloque este arquivo no repositório nem o anexe aos relatórios.')


if __name__ == '__main__':
    main()
