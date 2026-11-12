#!/usr/bin/env python3
"""HU07-06: gerenciar vínculo de teste via API auditada, com login real do Admin.

Nunca conecta diretamente para escrever no banco. Operações de escrita exigem
--confirmar, são limitadas a localhost e não usam cookies/senhas nos argumentos.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import re
import sys
from urllib.parse import quote, urlsplit

from credenciais_locais import carregar_credenciais, entrar_no_next
from validar_fluxo_real import requisitar

UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', re.I)


def selecionar_funcionario(resposta: dict, email: str) -> dict:
    if resposta.get('status') != 200 or not isinstance(resposta.get('body'), dict):
        raise ValueError(f'Consulta de Funcionários recusada: HTTP {resposta.get("status")}')
    itens = resposta['body'].get('itens')
    if not isinstance(itens, list):
        raise ValueError('A consulta de Funcionários não retornou uma lista')
    encontrados = [u for u in itens if isinstance(u, dict) and
                   str(u.get('email', '')).casefold() == email.casefold()]
    if len(encontrados) != 1:
        raise ValueError('Funcionário não encontrado pelo e-mail exato; confira cadastro/atividade')
    usuario = encontrados[0]
    if usuario.get('perfil') not in ('GESTOR', 'COLABORADOR') or not usuario.get('ativo'):
        raise ValueError('Vínculo de QA permitido apenas para Gestor/Colaborador ativo')
    if not UUID.fullmatch(str(usuario.get('id', ''))):
        raise ValueError('Usuário retornou identificador inválido')
    return usuario


def destino_valido(url: str) -> bool:
    u = urlsplit(url)
    return u.scheme == 'http' and u.hostname in ('localhost', '127.0.0.1') and not u.username and not u.password and not u.query and not u.fragment


def argumentos() -> argparse.Namespace:
    p = argparse.ArgumentParser(description='Permissões de QA por e-mail: API auditada e login real de Administrador')
    p.add_argument('--contrato-id', required=True)
    p.add_argument('--email', required=True, help='E-mail EXATO do Gestor/Colaborador')
    p.add_argument('--modo', choices=('consultar', 'edicao', 'leitura', 'revogar'), required=True)
    p.add_argument('--confirmar', action='store_true', help='Obrigatório para alterações reais de vínculo')
    p.add_argument('--frontend-url', default='http://localhost:3000')
    p.add_argument('--api-url', default='http://localhost:3001')
    p.add_argument('--credenciais-arquivo', type=Path)
    a = p.parse_args()
    if not UUID.fullmatch(a.contrato_id):
        p.error('--contrato-id deve ser UUID válido')
    if not isinstance(a.email, str) or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', a.email) or len(a.email) > 320:
        p.error('--email deve ser e-mail válido de conta DEV ativa')
    if a.modo != 'consultar' and not a.confirmar:
        p.error('Alteração de vínculo exige --confirmar; nada foi modificado')
    if not destino_valido(a.frontend_url) or not destino_valido(a.api_url):
        p.error('Ação de permissões DEV restrita a HTTP localhost/127.0.0.1')
    return a


def main() -> int:
    args = argumentos()
    try:
        from playwright.sync_api import sync_playwright
        admin, senha = carregar_credenciais('administrador', args.credenciais_arquivo)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                try:
                    context = browser.new_context(locale='pt-BR')
                    page = context.new_page()
                    page.goto(args.frontend_url.rstrip('/') + '/login', wait_until='domcontentloaded')
                    entrar_no_next(page, admin, senha)
                    me = requisitar(page, args.api_url, '/usuarios/me')
                    if me['status'] != 200 or not isinstance(me.get('body'), dict) or me['body'].get('perfil') != 'ADMINISTRADOR' or not me['body'].get('ativo'):
                        raise ValueError('Login não corresponde a Administrador ativo')
                    if str(me['body'].get('email', '')).casefold() != admin.casefold():
                        raise ValueError('E-mail autenticado não corresponde ao arquivo privado')
                    consulta = requisitar(page, args.api_url, '/admin/usuarios/consulta?ativo=true&pagina=1&limite=20&busca=' + quote(args.email, safe=''))
                    pessoa = selecionar_funcionario(consulta, args.email)
                    if args.modo == 'edicao' and pessoa['perfil'] != 'GESTOR':
                        raise ValueError('Somente Gestor pode ter podeEditar=true')
                    caminho = f'/admin/usuarios/{pessoa["id"]}/permissoes'
                    anterior = requisitar(page, args.api_url, caminho)
                    if anterior['status'] != 200 or not isinstance(anterior.get('body'), list):
                        raise ValueError('Falha ao consultar vínculo existente')
                    vinculo = next((v for v in anterior['body'] if v.get('contratoId') == args.contrato_id), None)
                    print(f'Funcionário: {pessoa["email"]} ({pessoa["perfil"]}); contrato: {args.contrato_id}')
                    print('Antes:', 'sem vínculo' if vinculo is None else ('edição' if vinculo.get('podeEditar') else 'somente leitura'))
                    if args.modo != 'consultar':
                        if args.modo == 'revogar':
                            if vinculo is not None:
                                alteracao = requisitar(page, args.api_url, caminho + '/' + args.contrato_id, 'DELETE')
                                if alteracao['status'] != 204:
                                    raise ValueError(f'Revogação não concluída: HTTP {alteracao["status"]}')
                        else:
                            alteracao = requisitar(page, args.api_url, caminho, 'PUT', {
                                'contratoId': args.contrato_id, 'podeEditar': args.modo == 'edicao',
                            })
                            if alteracao['status'] not in (200, 201):
                                raise ValueError(f'Concessão não concluída: HTTP {alteracao["status"]}')
                    posterior = requisitar(page, args.api_url, caminho)
                    if posterior['status'] != 200 or not isinstance(posterior.get('body'), list):
                        raise ValueError('Falha ao conferir o vínculo após a operação')
                    vinculo = next((v for v in posterior['body'] if v.get('contratoId') == args.contrato_id), None)
                    resultado = 'sem vínculo' if vinculo is None else ('edição' if vinculo.get('podeEditar') else 'somente leitura')
                    esperado = {'edicao': 'edição', 'leitura': 'somente leitura', 'revogar': 'sem vínculo'}
                    if args.modo in esperado and resultado != esperado[args.modo]:
                        raise ValueError(f'Vínculo divergente após escrita: {resultado}')
                    print('Depois:', resultado)
                    if args.modo != 'consultar':
                        print('Operação de vínculo concluída pela API real, sujeita à auditoria do backend.')
                    context.close()
                finally:
                    browser.close()
        finally:
            del senha
        return 0
    except Exception as erro:
        # Não incluir cookies, senhas, respostas completas nem parâmetros de autenticação.
        print('[QA vínculos] FALHA:', str(erro).splitlines()[0][:260], file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
