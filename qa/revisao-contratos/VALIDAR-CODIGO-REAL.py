#!/usr/bin/env python3
"""QA opcional: cria dois contratos descartáveis na API local e prova o código público.
Não remove dados. IDs produzidos podem alimentar o QA completo HU06/HU07.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import secrets
import sys

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / 'qa/hu07-06'))
from credenciais_locais import carregar_credenciais, entrar_no_next
from validar_fluxo_real import requisitar

PADRAO = re.compile(r'^[0-9]{5}$')
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', re.I)


def conferir(resposta, codigo, acao):
    if resposta.get('status') != codigo:
        raise AssertionError(f'{acao}: esperado HTTP {codigo}, recebido {resposta.get("status")}')
    return resposta.get('body')


def codigo_valido(contrato):
    assert isinstance(contrato, dict) and UUID.fullmatch(str(contrato.get('id'))), 'UUID interno inválido'
    assert PADRAO.fullmatch(str(contrato.get('codigoPublico'))), 'Código público inválido'
    return contrato['codigoPublico']


def executar(page, args):
    amostra = secrets.token_hex(5).upper()
    provas = []
    me = conferir(requisitar(page, args.api_url, '/usuarios/me'), 200, 'identidade')
    assert me.get('perfil') == 'ADMINISTRADOR' and me.get('ativo') is True, 'Exige Administrador ativo'
    provas.append('SuperTokens: Administrador de domínio autenticado')
    contratos = []
    for letra in ('A', 'B'):
        dados = {
          'numeroContrato': 'TESTE-CODIGO-' + amostra + '-' + letra,
          'orgaoContratante': 'Órgão de teste ' + ('descrição longa ' * 13),
          'objeto': 'Objeto de QA com texto prolongado ' * 8,
          'inicioVigencia': '2026-11-01', 'terminoVigencia': '2027-10-31',
          'status': 'PLANEJAMENTO', 'modoCalculo': 'SIMPLES',
        }
        c = conferir(requisitar(page, args.api_url, '/contratos', 'POST', dados), 201, 'criar contrato '+letra)
        codigo_valido(c)
        assert 'codigoPublico' not in dados, 'Código não deve ser enviado pelo navegador'
        contratos.append(c)
    assert contratos[0]['id'] != contratos[1]['id'] and contratos[0]['codigoPublico'] != contratos[1]['codigoPublico'], 'Colisão não resolvida'
    provas.append('Dois cadastros reais: código automático de 5 dígitos, distinto, sem input do cliente')

    for contrato in contratos:
        detalhe = conferir(requisitar(page, args.api_url, '/contratos/' + contrato['id']), 200, 'detalhar contrato')
        assert detalhe['codigoPublico'] == contrato['codigoPublico'] and detalhe['id'] == contrato['id']
    provas.append('GET por UUID preserva a identificação pública e o identificador interno')
    a = contratos[0]
    atualizado = conferir(requisitar(page, args.api_url, '/contratos/' + a['id'], 'PATCH', {'objeto': 'Objeto de QA atualizado'}), 200, 'editar')
    assert atualizado['codigoPublico'] == a['codigoPublico']
    provas.append('PATCH não modifica o código público')

    carteira = conferir(requisitar(page, args.api_url, '/contratos'), 200, 'listar contratos')
    assert isinstance(carteira, list) and all(any(x.get('id') == c['id'] and x.get('codigoPublico') == c['codigoPublico'] for x in carteira) for c in contratos)
    provas.append('GET da carteira autorizado contém código público')

    page.goto(args.frontend_url + '/contratos', wait_until='domcontentloaded')
    campo = page.get_by_label('Buscar por código, número, órgão ou objeto')
    campo.wait_for(timeout=20000)
    for texto in ('#' + a['codigoPublico'], a['codigoPublico'], a['numeroContrato']):
        campo.fill(texto)
        page.get_by_text('Código #' + a['codigoPublico']).wait_for(timeout=5000)
        assert page.get_by_role('link', name='Detalhes').count() == 1, 'Filtro não localizou só o contrato esperado'
    provas.append('Busca UI por #xxxxx, xxxxx e número do contrato preservada')
    campo.fill('#' + '99999' if a['codigoPublico'] != '99999' and contratos[1]['codigoPublico'] != '99999' else '#00000')
    campo.fill('#' + a['codigoPublico'])
    page.get_by_role('link', name='Detalhes').click()
    page.get_by_text('Código #' + a['codigoPublico']).first.wait_for(timeout=10000)
    provas.append('Detalhe UI exibe o código sem substituir rota UUID')
    page.set_viewport_size({'width': 390, 'height': 844})
    page.reload(wait_until='domcontentloaded')
    page.get_by_text('Código #' + a['codigoPublico']).first.wait_for(timeout=10000)
    medidas = page.evaluate("() => ({largura: innerWidth, documento: document.documentElement.scrollWidth})")
    assert medidas['documento'] <= medidas['largura'] + 2, f'Overflow horizontal mobile: {medidas}'
    provas.append('Detalhe com valores longos visível no viewport de 390px, sem overflow horizontal')

    # Contrato B precisa de uma etapa própria para teste cruzado da HU06.
    b = contratos[1]
    etapa = conferir(requisitar(page, args.api_url, '/contratos/' + b['id'] + '/etapas', 'POST', {'nome': 'Etapa do contrato secundário', 'codigo': 'QA-COD-B'}), 201, 'etapa secundária')
    assert UUID.fullmatch(str(etapa.get('id'))), 'Etapa secundária sem UUID válido'
    acesso_cruzado = requisitar(page, args.api_url, '/contratos/' + a['id'] + '/etapas/' + etapa['id'])
    conferir(acesso_cruzado, 404, 'ID cruzado de etapa')
    provas.append('ID aninhado de etapa de outro contrato negado: HTTP 404')
    return {
      'status': 'APROVADO', 'inicioUtc': datetime.now(timezone.utc).isoformat(),
      'contratoPrincipalId': a['id'], 'outroContratoId': b['id'],
      'codigoPrincipal': a['codigoPublico'], 'codigoSecundario': b['codigoPublico'],
      'etapaOutroContratoId': etapa['id'], 'provas': provas,
      'aviso': 'Contratos e uma etapa foram persistidos em DEV. Use os UUIDs para HU06/HU07. Não executar contra produção.',
    }


def main():
    parser = argparse.ArgumentParser(description='QA real código público: cria dois contratos em DEV local')
    parser.add_argument('--confirmar-persistencia', action='store_true', help='Autoriza dois POST de contrato, um POST de etapa e um PATCH')
    parser.add_argument('--frontend-url', default='http://localhost:3000')
    parser.add_argument('--api-url', default='http://localhost:3001')
    parser.add_argument('--saida', type=Path, default=RAIZ / 'qa/revisao-contratos/.local/codigo-real.json')
    args = parser.parse_args()
    for url in (args.frontend_url, args.api_url):
        from urllib.parse import urlsplit
        u = urlsplit(url)
        if u.scheme != 'http' or u.hostname not in ('localhost', '127.0.0.1') or u.username or u.password or u.query or u.fragment:
            parser.error('QA real só pode conectar a HTTP localhost')
    if not args.confirmar_persistencia: parser.error('Exige --confirmar-persistencia')
    from playwright.sync_api import sync_playwright
    email, senha = carregar_credenciais('administrador')
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page(locale='pt-BR', viewport={'width': 1280, 'height': 900})
            page.goto(args.frontend_url + '/login', wait_until='domcontentloaded')
            entrar_no_next(page, email, senha)
            resultado = executar(page, args)
        finally:
            browser.close()
    args.saida.parent.mkdir(parents=True, exist_ok=True)
    args.saida.write_text(json.dumps(resultado, ensure_ascii=False, indent=2) + '\n')
    print('CODIGO PUBLICO QA: APROVADO')
    print('Contrato principal:', resultado['contratoPrincipalId'], 'Código #' + resultado['codigoPrincipal'])
    print('Contrato secundário:', resultado['outroContratoId'], 'Código #' + resultado['codigoSecundario'])
    print('Relatório local:', args.saida)

if __name__ == '__main__':
    main()
