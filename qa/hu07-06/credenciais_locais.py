#!/usr/bin/env python3
"""Credenciais DEV da HU07-06; nunca gravar no repositório, logs ou JSON de evidência.

Armazenamento opcional é em texto claro, com permissão 0600 na máquina do
próprio desenvolvedor. Use apenas contas descartáveis e revogue-as após o QA.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import stat

CAMINHO_PADRAO = Path(__file__).resolve().parent / '.local' / 'credenciais.json'
PERFIS_VALIDOS = ('administrador', 'gestor-edicao', 'gestor-leitura', 'colaborador', 'sem-vinculo')


def carregar_credenciais(perfil: str, arquivo: Path | None = None) -> tuple[str, str]:
    caminho = arquivo if arquivo is not None else CAMINHO_PADRAO
    caminho = caminho.expanduser()
    if caminho.is_symlink() or not caminho.is_file():
        raise ValueError('Arquivo de credenciais DEV ausente ou é link simbólico; execute configurar_credenciais.py')
    modo = caminho.stat()
    if not stat.S_ISREG(modo.st_mode) or modo.st_uid != os.getuid() or (modo.st_mode & 0o077):
        raise ValueError('Credenciais DEV devem pertencer ao usuário atual e possuir permissão 0600 (chmod 600)')
    dado = json.loads(caminho.read_text(encoding='utf-8'))
    if perfil not in PERFIS_VALIDOS:
        raise ValueError('Perfil de teste desconhecido')
    alias = dado.get('perfis', {}).get(perfil)
    conta = dado.get('contas', {}).get(alias)
    if not isinstance(conta, dict):
        raise ValueError('Conta não configurada para o cenário; ajuste o mapa de perfis local')
    email, senha = conta.get('email'), conta.get('senha')
    if not isinstance(email, str) or not email.strip() or '@' not in email or not isinstance(senha, str) or not senha:
        raise ValueError('E-mail/senha inválidos no arquivo privado de QA')
    return email.strip(), senha


def entrar_no_next(page, email: str, senha: str) -> None:
    """Login via campos reais da interface Next/SuperTokens, sem simular sessão."""
    page.get_by_label('E-mail', exact=True).fill(email)
    page.get_by_label('Senha', exact=True).fill(senha)
    page.get_by_role('button', name='Entrar', exact=True).click()
    # O login real deve redirecionar ao dashboard antes do teste autenticado.
    page.wait_for_url('**/dashboard', timeout=30000)
