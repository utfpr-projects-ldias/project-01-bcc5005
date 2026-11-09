#!/usr/bin/env python3
"""Valida logins REAIS de Admin, Gestor, Colaborador no Next/SuperTokens.

Não cria contratos/etapas/entregáveis; login cria apenas sessões descartáveis.
Nunca imprime senha, cookie, token nem resposta bruta da API.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import sys
from urllib.parse import urlsplit

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / 'qa' / 'hu07-06'))
from credenciais_locais import carregar_credenciais  # noqa: E402
from validar_fluxo_real import requisitar  # noqa: E402

CONTAS = (
    ('administrador', 'ADMINISTRADOR'),
    ('gestor-edicao', 'GESTOR'),
    ('colaborador', 'COLABORADOR'),
)


def url_local(url: str) -> str:
    """Evita transmitir credenciais de QA para sites externos por engano."""
    item = urlsplit(url)
    if (item.scheme != 'http' or item.hostname not in ('localhost', '127.0.0.1')
            or item.username or item.password or item.query or item.fragment
            or (item.path not in ('', '/'))):
        raise ValueError('URLs de autenticação permitidas somente em HTTP localhost')
    return url.rstrip('/')


def validar_identidade(resposta: dict, email: str, perfil: str) -> None:
    if resposta.get('status') != 200 or not isinstance(resposta.get('body'), dict):
        raise ValueError(f'API /usuarios/me não confirmou a sessão (HTTP {resposta.get("status")})')
    usuario = resposta['body']
    if usuario.get('ativo') is not True:
        raise ValueError('Conta de domínio inativa')
    if str(usuario.get('email', '')).casefold() != email.casefold():
        raise ValueError('E-mail da sessão diverge da conta de QA')
    if usuario.get('perfil') != perfil:
        raise ValueError(f'Perfil divergente (esperado {perfil})')


def verificar(browser, web: str, api: str, alias: str, perfil: str) -> tuple[bool, str]:
    """Uma sessão independente por perfil; valida a identidade no backend."""
    ctx = browser.new_context(locale='pt-BR')
    try:
        pagina = ctx.new_page()
        email, senha = carregar_credenciais(alias)
        try:
            pagina.goto(web + '/login', wait_until='domcontentloaded', timeout=20000)
            pagina.get_by_label('E-mail', exact=True).fill(email)
            pagina.get_by_label('Senha', exact=True).fill(senha)
            pagina.get_by_role('button', name='Entrar', exact=True).click()
            pagina.wait_for_url('**/dashboard', wait_until='domcontentloaded', timeout=15000)
        except Exception as e:
            # O usuário recebe a categoria do erro, não a senha, nem a página completa.
            alertas = []
            try:
                if not pagina.is_closed():
                    alertas = pagina.get_by_role('alert').all_text_contents()
            except Exception:
                pass
            if any('inválid' in a.casefold() or 'não permitido' in a.casefold() for a in alertas):
                return False, f'{alias}: credencial inválida ou conta não autorizada no SuperTokens'
            return False, f'{alias}: dashboard não alcançado ({type(e).__name__})'
        try:
            validar_identidade(requisitar(pagina, api, '/usuarios/me'), email, perfil)
            return True, f'{alias}: login e perfil {perfil} confirmados'
        except (ValueError, AssertionError) as e:
            return False, f'{alias}: {e}'
    finally:
        ctx.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Gate QA: autenticação real dos 3 perfis, sem contratos sintéticos')
    parser.add_argument('--frontend-url', default='http://localhost:3000')
    parser.add_argument('--api-url', default='http://localhost:3001')
    args = parser.parse_args(argv)
    try:
        web, api = url_local(args.frontend_url), url_local(args.api_url)
        credenciais = [carregar_credenciais(alias) for alias, _ in CONTAS]
        if len({email.casefold() for email, _ in credenciais}) != len(CONTAS):
            raise ValueError('Os 3 perfis de QA precisam usar contas distintas')
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            try:
                resultados = [verificar(browser, web, api, alias, perfil) for alias, perfil in CONTAS]
            finally:
                browser.close()
        for ok, mensagem in resultados:
            print(('[OK] ' if ok else '[FALHA] ') + mensagem)
        if all(ok for ok, _ in resultados):
            print('QA LOGINS APROVADO: 3/3 contas autenticadas no backend real')
            return 0
        print('QA LOGINS REPROVADO: corrija/crie contas antes de executar Chromium mutável')
        return 1
    except Exception as e:
        print(f'QA LOGINS BLOQUEADO: {type(e).__name__}: {str(e).splitlines()[0][:220]}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
