#!/usr/bin/env python3
"""Provisiona contas DESCARTÁVEIS de QA via interface real + API auditada.

Não cria Administradores, não altera senhas/vínculos existentes e não grava
segredos em código versionado nem nos JSONs/ZIPs de evidências.
"""
from __future__ import annotations
import argparse
from getpass import getpass
import json
import os
from pathlib import Path
import re
import stat
import sys
from urllib.parse import quote

QA = Path(__file__).resolve().parents[1]
HU07 = QA / 'hu07-06'
sys.path.insert(0, str(HU07))
from credenciais_locais import CAMINHO_PADRAO, carregar_credenciais, entrar_no_next
from validar_fluxo_real import requisitar

CONTAS_PADRAO = (
    ('gestor', 'Gestor de Testes', 'rinaldi3@gmail.com', 'GESTOR'),
    ('colaborador', 'Colaborador de Testes', 'rinaldi2@gmail.com', 'COLABORADOR'),
)
EMAIL = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')


def validar_destino(url: str) -> str:
    from urllib.parse import urlsplit
    u = urlsplit(url)
    if u.scheme != 'http' or u.hostname not in ('localhost', '127.0.0.1') or u.username or u.password or u.query or u.fragment:
        raise ValueError('Bootstrap permitido apenas em HTTP localhost/127.0.0.1')
    return url.rstrip('/')


def validar_conta(nome: str, email: str, perfil: str) -> tuple[str, str, str]:
    nome, email, perfil = nome.strip(), email.strip().lower(), perfil.upper().strip()
    if len(nome.split()) < 2 or not (3 <= len(nome) <= 160):
        raise ValueError('Nome do funcionário deve conter nome e sobrenome')
    if not EMAIL.fullmatch(email) or len(email) > 320:
        raise ValueError('E-mail de funcionário inválido')
    if perfil not in ('GESTOR', 'COLABORADOR'):
        raise ValueError('Somente GESTOR e COLABORADOR são permitidos no bootstrap de QA')
    return nome, email, perfil


def preparar_configuracao() -> Path:
    """Reutiliza credenciais 0600; em máquina nova solicita tudo sem eco de senha."""
    p = CAMINHO_PADRAO
    if p.is_file() and not p.is_symlink():
        for perfil in ('administrador', 'gestor-edicao', 'colaborador'):
            carregar_credenciais(perfil)
        return p
    if p.exists() or p.is_symlink():
        raise ValueError('Credenciais locais existentes não são arquivo regular seguro')
    print('[QA] Configuração privada ausente. Será salva em qa/hu07-06/.local/ (ignorado pelo Git).')
    admin = input('E-mail do Administrador DEV [rinaldi@gmail.com]: ').strip().lower() or 'rinaldi@gmail.com'
    if not EMAIL.fullmatch(admin):
        raise ValueError('E-mail do Administrador inválido')
    senha_admin = getpass('Senha atual do Administrador DEV: ')
    senha_func = getpass('Senha inicial dos funcionários DEV (>=12, complexa): ')
    if not senha_admin or not (12 <= len(senha_func) <= 128) or not all((re.search(r'[a-z]', senha_func), re.search(r'[A-Z]', senha_func), re.search(r'\d', senha_func), re.search(r'[^a-zA-Z0-9]', senha_func))):
        raise ValueError('Senha inválida: use pelo menos 12 caracteres, maiúscula, minúscula, número e símbolo')
    contas = {'administrador': {'email': admin, 'senha': senha_admin}}
    for alias, _nome, email, _perfil in CONTAS_PADRAO:
        contas[alias] = {'email': email, 'senha': senha_func}
    dados = {'contas': contas, 'perfis': {
        'administrador': 'administrador', 'gestor-edicao': 'gestor',
        'gestor-leitura': 'gestor', 'colaborador': 'colaborador', 'sem-vinculo': 'colaborador'}}
    p.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(p.parent, 0o700)
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.chmod(p, 0o600)
    print('[QA] Credenciais locais configuradas com permissão 0600; não serão incluídas no Git.')
    return p


def resultados_exatos(resposta: dict, email: str) -> list[dict]:
    if resposta.get('status') != 200 or not isinstance(resposta.get('body'), dict):
        raise ValueError(f'Falha ao consultar funcionários: HTTP {resposta.get("status")}')
    corpo = resposta['body']
    itens = corpo.get('itens')
    if not isinstance(itens, list):
        raise ValueError('API de funcionários retornou formato inesperado')
    encontrados = [u for u in itens if isinstance(u, dict) and str(u.get('email', '')).casefold() == email.casefold()]
    # A busca é paginada. O resultado exato não pode estar em outra página sem ser percebido.
    if corpo.get('totalPaginas', 1) != 1:
        raise ValueError('Consulta ambígua/paginada; reduza o termo de busca antes de provisionar')
    return encontrados


def garantir_conta(page, api: str, nome: str, email: str, perfil: str, senha: str) -> str:
    nome, email, perfil = validar_conta(nome, email, perfil)
    resposta = requisitar(page, api, '/admin/usuarios/consulta?pagina=1&limite=20&busca=' + quote(email, safe=''))
    encontrados = resultados_exatos(resposta, email)
    if len(encontrados) > 1:
        raise ValueError('E-mail duplicado na base; abortando sem alteração')
    if encontrados:
        usuario = encontrados[0]
        if usuario.get('perfil') != perfil or usuario.get('ativo') is not True:
            raise ValueError(f'Conta existente {email} não é um {perfil} ativo; não modificarei cadastro')
        print(f'[QA] EXISTENTE: {email} ({perfil}), sem alterações')
        return 'existente'
    if not 12 <= len(senha) <= 128:
        raise ValueError('Senha inicial de QA deve conter entre 12 e 128 caracteres')
    resposta = requisitar(page, api, '/admin/usuarios', 'POST',
                          {'nome': nome, 'email': email, 'perfil': perfil, 'senhaInicial': senha})
    if resposta.get('status') != 201:
        raise ValueError(f'Falha ao criar {email}: HTTP {resposta.get("status")}; nenhuma senha será exibida')
    resposta = requisitar(page, api, '/admin/usuarios/consulta?pagina=1&limite=20&busca=' + quote(email, safe=''))
    achados = resultados_exatos(resposta, email)
    if len(achados) != 1 or achados[0].get('perfil') != perfil or achados[0].get('ativo') is not True:
        raise ValueError(f'Usuário {email} criado mas não confirmado na consulta real')
    print(f'[QA] CRIADO: {email} ({perfil}), via API administrativa auditada')
    return 'criado'


def opcoes(argv=None):
    p = argparse.ArgumentParser(description='Bootstrap DEV: cria apenas funcionários ausentes por login real do Administrador')
    p.add_argument('--login-automatico', action='store_true', help='Usa credenciais privadas; sem aguardar ENTER')
    p.add_argument('--adicional', action='append', default=[], metavar='NOME,EMAIL,PERFIL',
                   help='Outro funcionário QA, repetível: "Nome Sobrenome,email@dev.com,COLABORADOR"')
    p.add_argument('--frontend-url', default='http://localhost:3000')
    p.add_argument('--api-url', default='http://localhost:3001')
    p.add_argument('--confirmar', action='store_true', help='Autoriza criação das contas que estiverem ausentes')
    a = p.parse_args(argv)
    try:
        a.frontend_url = validar_destino(a.frontend_url)
        a.api_url = validar_destino(a.api_url)
        a.adicionais = []
        for item in a.adicional:
            partes = item.split(',')
            if len(partes) != 3:
                raise ValueError('--adicional exige NOME,EMAIL,PERFIL')
            a.adicionais.append(validar_conta(*partes))
        emails = [email for _, _, email, _ in CONTAS_PADRAO] + [e for _, e, _ in a.adicionais]
        if len({e.casefold() for e in emails}) != len(emails):
            raise ValueError('E-mail de funcionário repetido entre os alvos')
    except ValueError as exc:
        p.error(str(exc))
    if not a.confirmar:
        p.error('Criar funcionários exige --confirmar; nenhuma escrita foi realizada')
    return a


def executar(args):
    from playwright.sync_api import sync_playwright
    preparar_configuracao()
    admin_email, admin_password = carregar_credenciais('administrador')
    gestor_email, gestor_password = carregar_credenciais('gestor-edicao')
    colaborador_email, colaborador_password = carregar_credenciais('colaborador')
    # Exigir que o arquivo privado reflita as identidades esperadas, sem adivinhar.
    if (gestor_email.casefold(), colaborador_email.casefold()) != (CONTAS_PADRAO[0][2], CONTAS_PADRAO[1][2]):
        raise ValueError('Credenciais locais devem apontar para rinaldi3@gmail.com e rinaldi2@gmail.com; confira antes de criar')
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=args.login_automatico)
        try:
            ctx = browser.new_context(locale='pt-BR')
            try:
                page = ctx.new_page()
                page.goto(args.frontend_url + '/login', wait_until='domcontentloaded')
                if args.login_automatico:
                    entrar_no_next(page, admin_email, admin_password)
                else:
                    print('[QA] Entre como Administrador no Chromium e confirme o dashboard.', flush=True)
                    input('Após concluir o login, pressione ENTER aqui: ')
                    page.wait_for_url('**/dashboard', timeout=15000)
                me = requisitar(page, args.api_url, '/usuarios/me')
                u = me.get('body') if isinstance(me.get('body'), dict) else {}
                if me.get('status') != 200 or u.get('perfil') != 'ADMINISTRADOR' or u.get('ativo') is not True:
                    raise ValueError('Sessão não é de Administrador ativo: nenhuma conta foi criada')
                if str(u.get('email', '')).casefold() != admin_email.casefold():
                    raise ValueError('E-mail do Administrador logado difere do configurado localmente')
                print('[QA] Administrador autenticado e autorizado.')
                resultados = []
                for _alias, nome, email, perfil in CONTAS_PADRAO:
                    senha = gestor_password if perfil == 'GESTOR' else colaborador_password
                    resultados.append(garantir_conta(page, args.api_url, nome, email, perfil, senha))
                for nome, email, perfil in args.adicionais:
                    # extras usam a senha DEV do perfil correspondente; nenhum segredo em argumento.
                    senha = gestor_password if perfil == 'GESTOR' else colaborador_password
                    resultados.append(garantir_conta(page, args.api_url, nome, email, perfil, senha))
                print(f'[QA] Provisionamento OK: {resultados.count("criado")} criados, {resultados.count("existente")} existentes.')
            finally:
                ctx.close()
        finally:
            browser.close()
    return 0


def main(argv=None):
    try:
        args = opcoes(argv)
        return executar(args)
    except (ValueError, AssertionError) as e:
        print('[QA] ERRO:', str(e).splitlines()[0][:240], file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
