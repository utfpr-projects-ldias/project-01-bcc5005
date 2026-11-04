#!/usr/bin/env python3
"""TEC08-03 — Chromium real, cadastro pela UI, arquivos reais e política de perfis.
Reutiliza QA TEC08-02: readiness, login Next/ST, concessão/revogação, SQL e UUID.
Não recebe IDs, cookies, senha ou tokens como argumentos. Exclusivo para DEV.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import sys
import time

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / 'qa' / 'tec08-02'))
import validar_integracao_real as base  # noqa: E402

WEB = 'http://localhost:3000'
def gerar_pdf_sintetico() -> bytes:
    """PDF pequeno com xref real; usa somente stdlib, sem arquivo externo/segredos."""
    stream = b'BT /F1 12 Tf 55 770 Td (QA TEC08-03 - DOCUMENTO SINTETICO) Tj ET\n'
    objetos = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        b'<< /Length ' + str(len(stream)).encode('ascii') + b' >>\nstream\n' + stream + b'endstream',
    ]
    pdf = bytearray(b'%PDF-1.4\n')
    offsets = [0]
    for i, objeto in enumerate(objetos, 1):
        offsets.append(len(pdf))
        pdf.extend(f'{i} 0 obj\n'.encode('ascii') + objeto + b'\nendobj\n')
    inicio_xref = len(pdf)
    pdf.extend(f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode('ascii'))
    for pos in offsets[1:]:
        pdf.extend(f'{pos:010d} 00000 n \n'.encode('ascii'))
    pdf.extend((f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\n'
                f'startxref\n{inicio_xref}\n%%EOF\n').encode('ascii'))
    return bytes(pdf)


PDF = gerar_pdf_sintetico()
TXT = b'Documento QA TEC08-03 via interface, sem dados reais.\n'


def exigir(condicao, texto):
    if not condicao:
        raise AssertionError(texto)


def argumentos():
    p = argparse.ArgumentParser(description='QA integrado TEC08-03: interface real, sem placeholders')
    p.add_argument('--verificar', action='store_true')
    p.add_argument('--executar', action='store_true')
    p.add_argument('--confirmar-persistencia', action='store_true')
    exibicao = p.add_mutually_exclusive_group()
    exibicao.add_argument('--visivel', action='store_true', help='Abrir Chromium visível como na HU07-06')
    exibicao.add_argument('--sem-janela', action='store_true', help='Usar Chromium headless (CI)')
    a = p.parse_args()
    if a.verificar == a.executar:
        p.error('Escolha --verificar ou --executar')
    if a.executar and not a.confirmar_persistencia:
        p.error('Execução cria contratos/documentos sintéticos persistentes: use --confirmar-persistencia')
    return a


def criacao_pela_ui(page, execucao):
    page.goto(WEB + '/contratos/novo', wait_until='domcontentloaded')
    form = page.get_by_role('form', name='Cadastrar contrato')
    form.get_by_label('Número do contrato').fill(f'QA-TEC08-03-{execucao}-A')
    form.get_by_label('Órgão contratante').fill('LABORATORIO QA TEC08-03')
    form.get_by_label('Objeto').fill('CONTRATO SINTETICO DEV AUTOMATIZADO')
    form.get_by_label('Início da vigência').fill('2026-01-01')
    form.get_by_label('Término da vigência').fill('2027-12-31')
    form.get_by_role('button', name='Cadastrar contrato').click()
    dialogo = page.get_by_role('dialog', name='Confirmar cadastro?')
    dialogo.get_by_role('button', name='Confirmar cadastro').click()
    page.wait_for_url('**/contratos/*?anexarDocumento=principal', timeout=30000)
    contrato = page.url.split('/contratos/')[1].split('?')[0]
    exigir(base.uuid_ok(contrato), 'Cadastro via UI não retornou UUID de contrato')
    page.get_by_role('heading', name='Documentos do contrato').wait_for(timeout=20000)
    return contrato


def _resposta_documentos(resposta, contrato):
    """Identifica estritamente POST multipart do contrato, não GETs de cache."""
    from urllib.parse import urlsplit
    return (resposta.request.method == 'POST' and
            urlsplit(resposta.url).path == f'/contratos/{contrato}/documentos')


def arquivo_na_ui(page, contrato, categoria, nome, dados, *, mime, descricao='Arquivo sintético de QA'):
    """Observa o POST real; obriga MIME nomeado e valida as fixtures antes de clicar."""
    extensao = nome.rsplit('.', 1)[-1].lower() if '.' in nome else ''
    mime_esperado = {'pdf': 'application/pdf', 'txt': 'text/plain'}.get(extensao)
    exigir(mime_esperado is not None and mime == mime_esperado,
           f'Erro no próprio QA: tipo do arquivo sintético incompatível com {nome}')
    painel = page.locator('#documentos-contratuais')
    dialogo = page.get_by_role('dialog', name='Anexar documento contratual')
    if not dialogo.count():
        painel.get_by_role('button', name='Anexar documento').click()
    dialogo.wait_for(state='visible', timeout=10000)
    form = dialogo.get_by_role('form', name='Anexar documento contratual')
    rolagem_antes = page.evaluate('window.scrollY')
    form.get_by_label('Categoria *').select_option(categoria)
    # O input real fica visualmente oculto; o usuário escolhe pelo botão traduzido.
    exigir(form.get_by_role('button', name='Escolher arquivo').count() == 1,
           'Botão de seleção de arquivo em português não está disponível')
    form.get_by_label('Arquivo *').set_input_files({'name': nome, 'mimeType': mime, 'buffer': dados})
    form.get_by_label('Descrição (opcional)').fill(descricao)
    rolagem_depois = page.evaluate('window.scrollY')
    exigir(abs(rolagem_antes - rolagem_depois) <= 2,
           'Selecionar categoria/arquivo alterou a rolagem da página inteira')
    with page.expect_response(lambda r: _resposta_documentos(r, contrato), timeout=30000) as aguardando:
        form.get_by_role('button', name='Enviar documento').click()
    resposta = aguardando.value
    id_documento = None
    if resposta.status == 201:
        try:
            corpo = resposta.json()
            if isinstance(corpo, dict) and base.uuid_ok(corpo.get('id')):
                id_documento = corpo['id']
        except Exception:
            pass
    return {'status': resposta.status, 'documentoId': id_documento, 'nome': nome, 'categoria': categoria}


def _alertas_visiveis(painel):
    try:
        mensagens = painel.locator('[role="alert"]').all_text_contents(timeout=4000)
        # Somente mensagens da UI de QA; nunca cabeçalhos, cookies nem corpo HTTP.
        return ' | '.join(' '.join(m.split())[:180] for m in mensagens[:3]) or 'nenhum'
    except Exception:
        return 'indisponíveis'


def confirmar_documento(page, nome, resultado):
    painel = page.locator('#documentos-contratuais')
    if resultado['status'] != 201:
        raise AssertionError(
            f'Upload {nome}: API retornou HTTP {resultado["status"]} (esperado 201); '
            f'alerta exibido: {_alertas_visiveis(painel)}')
    if not base.uuid_ok(resultado.get('documentoId')):
        raise AssertionError(f'Upload {nome}: HTTP 201 sem UUID válido na resposta')
    try:
        painel.get_by_text('Documento anexado.', exact=False).wait_for(timeout=12000)
    except Exception as erro:
        if type(erro).__name__ != 'TimeoutError':
            raise
        raise AssertionError(
            f'Upload {nome}: API HTTP 201, mas confirmação visual não apareceu; '
            f'alerta: {_alertas_visiveis(painel)}; '
            f'formulário visível: {page.get_by_role("form", name="Anexar documento contratual").count() == 1}') from erro
    painel.get_by_text(nome, exact=True).wait_for(timeout=20000)
    return painel


def baixar_e_conferir(page, nome, dados, pasta):
    painel = page.locator('#documentos-contratuais')
    with page.expect_download(timeout=30000) as esperado:
        painel.get_by_role('button', name=f'Baixar {nome}').click()
    download = esperado.value
    exigir(download.suggested_filename == nome, 'Nome do download diferente do solicitado')
    arquivo = pasta / ('download-' + secrets.token_hex(5))
    try:
        download.save_as(str(arquivo))
        exigir(hashlib.sha256(arquivo.read_bytes()).digest() == hashlib.sha256(dados).digest(),
               'SHA-256 do download via UI divergente')
    finally:
        arquivo.unlink(missing_ok=True)


def registrar_relatorio(pasta, rel, erro):
    rel['fimUtc'] = datetime.now(timezone.utc).isoformat()
    rel['totalProvas'] = len(rel['provas'])
    if erro:
        rel['erro'] = f'{type(erro).__name__}: {str(erro)[:260]}'
    else:
        rel['status'] = 'APROVADO'
    destino = pasta / 'resultado.json'
    with destino.open('x', encoding='utf-8') as f:
        json.dump(rel, f, ensure_ascii=False, indent=2)
        f.write('\n')
    destino.chmod(0o600)
    print(f'[TEC08-03] {rel["status"]}: {rel["totalProvas"]} provas; relatório privado: {destino}')
    if erro:
        print(f'[TEC08-03] ERRO: {type(erro).__name__}: {str(erro)[:180]}', file=sys.stderr)
        return 1
    return 0


def executar(contas, visivel=False):
    from playwright.sync_api import sync_playwright
    execucao = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + secrets.token_hex(3)
    pasta = RAIZ / 'qa' / 'tec08-03' / '.local' / 'execucoes' / execucao
    pasta.mkdir(parents=True, mode=0o700)
    os.chmod(pasta, 0o700)
    rel = {
        'suite': 'TEC08-03', 'execucao': execucao,
        'tipo': 'CHROMIUM_NEXT_SUPERTOKENS_NEST_POSTGRES_REAL',
        'status': 'REPROVADO', 'inicioUtc': datetime.now(timezone.utc).isoformat(),
        'contratosQA': {}, 'documentosQA': [], 'provas': [], 'restauracaoVinculos': [],
        'segredosNoRelatorio': False, 'navegadorVisivel': visivel, 'respostasUpload': [],
    }
    pendentes = []
    falha = None
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not visivel, slow_mo=90 if visivel else 0)
        ctx_admin = None
        try:
            ctx_admin, admin, usr_admin = base.nova_sessao(browser, 'administrador', contas)
            rel['provas'].append('ADMIN: login real Next + SuperTokens')
            a = criacao_pela_ui(admin, execucao)
            rel['contratosQA']['A'] = a
            painel = admin.locator('#documentos-contratuais')
            # Contrato está salvo e ainda sem PDF: sinal estável de estado, não texto de UX.
            aviso_principal = painel.get_by_test_id('documento-principal-ausente')
            aviso_principal.wait_for(state='visible', timeout=20000)
            exigir('documento principal' in aviso_principal.inner_text().lower(),
                   'Aviso de PDF principal ausente não descreve corretamente o estado')
            exigir(admin.get_by_role('dialog', name='Anexar documento contratual').count() == 1,
                   'Redirecionamento não abriu modal de PDF principal')
            rel['provas'].append('HU05: cadastro via formulário real -> detalhe persistido -> PDF opcional e formulário aberto')
            # O contrato B também é real, mas criado por API reutilizada da TEC08-02.
            b = base.criar_contrato(admin, execucao + '-B')
            rel['contratosQA']['B'] = b
            rel['provas'].append('Contrato B real para isolamento de ACL; sem IDs informados manualmente')
            # Upload deliberadamente inválido: backend deve recusar bytes de PDF falso, manter seleção.
            falso = arquivo_na_ui(admin, a, 'CONTRATO_PRINCIPAL', 'qa-falso.pdf', b'PDF FALSO', mime='application/pdf')
            rel['respostasUpload'].append(falso)
            exigir(falso['status'] == 400, f'PDF disfarçado: HTTP {falso["status"]}; esperado 400')
            dialogo = admin.get_by_role('dialog', name='Anexar documento contratual')
            dialogo.get_by_role('alert').get_by_text('inválidos', exact=False).wait_for(timeout=25000)
            exigir(dialogo.get_by_text('Selecionado: qa-falso.pdf', exact=False).count() == 1,
                   'Erro de upload apagou seleção de arquivo')
            rel['provas'].append('PDF falso rejeitado pela API e seleção preservada para retry, sem novo contrato')
            # Retomar no MESMO contrato, com PDF válido.
            principal = arquivo_na_ui(admin, a, 'CONTRATO_PRINCIPAL', 'qa-principal.pdf', PDF, mime='application/pdf', descricao='Contrato principal do QA')
            rel['respostasUpload'].append(principal)
            if principal['documentoId']:
                rel['documentosQA'].append(principal['documentoId'])
            confirmar_documento(admin, 'qa-principal.pdf', principal)
            baixar_e_conferir(admin, 'qa-principal.pdf', PDF, pasta)
            rel['provas'].append('Upload e download do PDF principal pela UI: SHA-256 e nome íntegros')
            anexo = arquivo_na_ui(admin, a, 'ANEXO', 'qa-anexo.txt', TXT, mime='text/plain', descricao='Anexo do QA')
            rel['respostasUpload'].append(anexo)
            if anexo['documentoId']:
                rel['documentosQA'].append(anexo['documentoId'])
            confirmar_documento(admin, 'qa-anexo.txt', anexo)
            baixar_e_conferir(admin, 'qa-anexo.txt', TXT, pasta)
            rel['provas'].append('Upload e download do anexo TXT pela UI: SHA-256 íntegro')
            # Filtro é persistente por contrato no sessionStorage e recupera após reload.
            painel.get_by_label('Filtrar por categoria').select_option('CONTRATO_PRINCIPAL')
            painel.get_by_text('qa-principal.pdf', exact=True).wait_for(timeout=20000)
            exigir(painel.get_by_text('qa-anexo.txt', exact=True).count() == 0, 'Filtro exibiu categoria incorreta')
            admin.reload(wait_until='domcontentloaded')
            painel = admin.locator('#documentos-contratuais')
            painel.get_by_label('Filtrar por categoria').wait_for(timeout=25000)
            painel.get_by_text('qa-principal.pdf', exact=True).wait_for(timeout=25000)
            exigir(painel.get_by_label('Filtrar por categoria').input_value() == 'CONTRATO_PRINCIPAL',
                   'Filtro não foi restaurado após recarga')
            rel['provas'].append('Filtro por categoria restaura após reload e não mistura documento principal/anexo')
            # A navegação por categoria não pode colapsar a seção e deslocar a página.
            admin.evaluate('window.scrollTo(0, Math.min(400, document.documentElement.scrollHeight - window.innerHeight))')
            rolagem_filtro = admin.evaluate('window.scrollY')
            # Medir quadros REAIS durante a troca; uma verificação apenas no fim
            # não detectava um overlay global exibido por poucos milissegundos.
            admin.evaluate('''() => {
              window.__qaVisibilidadeDocumento = { ocultacoes: 0, ativo: true };
              const medir = () => {
                const p = document.querySelector('#documentos-contratuais');
                if (p && getComputedStyle(p).visibility !== 'visible') {
                  window.__qaVisibilidadeDocumento.ocultacoes++;
                }
                if (window.__qaVisibilidadeDocumento.ativo) requestAnimationFrame(medir);
              };
              requestAnimationFrame(medir);
            }''')
            painel.get_by_label('Filtrar por categoria').select_option('ANEXO')
            painel.get_by_text('qa-anexo.txt', exact=True).wait_for(timeout=20000)
            exigir(abs(admin.evaluate('window.scrollY') - rolagem_filtro) <= 2,
                   'Filtro ANEXO deslocou a posição da página')
            painel.get_by_label('Filtrar por categoria').select_option('CONTRATO_PRINCIPAL')
            painel.get_by_text('qa-principal.pdf', exact=True).wait_for(timeout=20000)
            exigir(abs(admin.evaluate('window.scrollY') - rolagem_filtro) <= 2,
                   'Filtro PRINCIPAL deslocou a posição da página')
            # O menu nativo pode provocar blur/focus sem troca real de aba no Firefox.
            # Isso nunca deve acionar a sobreposição global de revalidação.
            admin.evaluate("window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus'))")
            admin.wait_for_timeout(350)
            exigir(admin.get_by_text('Verificando sessão e permissões...').count() == 0,
                   'Seletor nativo provocou revalidação global indevida')
            exigir(admin.locator('#documentos-contratuais').evaluate(
                   "el => getComputedStyle(el).visibility") == 'visible',
                   'Seletor de categorias ocultou o conteúdo da página')
            amostras_ocultas = admin.evaluate('''() => {
              const amostra = window.__qaVisibilidadeDocumento;
              amostra.ativo = false;
              return amostra.ocultacoes;
            }''')
            exigir(amostras_ocultas == 0,
                   f'O painel inteiro ficou invisível durante o filtro por {amostras_ocultas} quadros')
            rel['provas'].append('Filtro de documentos mantém painel visível em todos os quadros monitorados')
            rel['provas'].append('Troca de filtros mantém a posição do scroll sem misturar categorias')
            # O retorno da aba afeta a proteção de sessão compartilhada a todas as rotas internas.
            # Revalidar após ausência prolongada sem colapsar a altura do conteúdo protegido.
            aba_auxiliar = ctx_admin.new_page()
            try:
                aba_auxiliar.goto(WEB + '/dashboard', wait_until='domcontentloaded')
                time.sleep(4.2)
                admin.bring_to_front()
                painel.get_by_text('qa-principal.pdf', exact=True).wait_for(state='visible', timeout=15000)
                admin.wait_for_timeout(400)
                exigir(abs(admin.evaluate('window.scrollY') - rolagem_filtro) <= 2,
                       'Voltar de outra aba deslocou a posição do contrato')
            finally:
                aba_auxiliar.close()
            rel['provas'].append('Retorno de outra aba após revalidação conserva posição e dados autorizados')
            # O modal deve ser independente da página: sem piscadas de layout ou rolagem forçada.
            painel.get_by_role('button', name='Anexar documento').click()
            dialogo = admin.get_by_role('dialog', name='Anexar documento contratual')
            dialogo.wait_for(state='visible', timeout=12000)
            admin.wait_for_function("Boolean(window.history.state?.__modalDocumento)", timeout=8000)
            rolagem = admin.evaluate('window.scrollY')
            dialogo.get_by_label('Categoria *').select_option('ANEXO')
            dialogo.get_by_label('Arquivo *').set_input_files({
                'name': 'qa-sem-envio.txt', 'mimeType': 'text/plain', 'buffer': TXT,
            })
            exigir(abs(admin.evaluate('window.scrollY') - rolagem) <= 2,
                   'A seleção no modal mudou a rolagem da página')
            # Botão Voltar/mouse deve fechar apenas o modal sem sair do contrato.
            url_antes = admin.url
            admin.evaluate('window.history.back()')
            dialogo.wait_for(state='hidden', timeout=12000)
            exigir(admin.url == url_antes, 'Voltar fechou a página em vez de apenas o modal')
            painel.get_by_role('button', name='Anexar documento').click()
            dialogo = admin.get_by_role('dialog', name='Anexar documento contratual')
            dialogo.wait_for(state='visible', timeout=10000)
            admin.keyboard.press('Escape')
            dialogo.wait_for(state='hidden', timeout=10000)
            painel.get_by_role('button', name='Anexar documento').click()
            dialogo = admin.get_by_role('dialog', name='Anexar documento contratual')
            dialogo.wait_for(state='visible', timeout=10000)
            dialogo.locator('xpath=..').click(position={'x': 2, 'y': 2})
            dialogo.wait_for(state='hidden', timeout=10000)
            exigir(painel.get_by_text('qa-principal.pdf', exact=True).count() == 1,
                   'Fechar o modal perdeu a listagem do contrato')
            rel['provas'].append('Modal documental: seleção sem rolagem, Voltar, Escape e clique fora sem sair do contrato')
            # Regressão visual HU07: título do entregável abre modal dentro do contrato,
            # preservando o link direto e sem alegar arquivos de comprovação inexistentes.
            etapas_area = admin.locator('section[aria-labelledby="titulo-etapas"]')
            etapas_area.get_by_role('button', name='Nova etapa').click()
            form_etapa = etapas_area.get_by_role('form', name='Criar etapa')
            nome_etapa = 'QA TEC08-03 Etapa Modal ' + execucao[-6:]
            form_etapa.locator('#etapa-nome').fill(nome_etapa)
            with admin.expect_response(lambda r: r.request.method == 'POST' and
                                       r.url.split('?')[0].endswith(f'/contratos/{a}/etapas') and r.status == 201,
                                       timeout=25000):
                form_etapa.get_by_role('button', name='Salvar etapa').click()
            cartao_etapa = etapas_area.locator('ol[aria-label="Etapas em ordem de execução"] > li').filter(
                has=admin.get_by_role('heading', name=nome_etapa, exact=True))
            cartao_etapa.wait_for(state='visible', timeout=25000)
            bloco_entregaveis = cartao_etapa.locator('section[aria-label="Entregáveis da etapa"]')
            bloco_entregaveis.get_by_role('button', name='Novo entregável').click()
            form_entregavel = bloco_entregaveis.get_by_role('form', name='Cadastrar entregável')
            nome_entregavel = 'QA TEC08-03 Detalhe em Modal ' + execucao[-6:]
            form_entregavel.locator('input[id$="-nome"]').fill(nome_entregavel)
            form_entregavel.get_by_role('button', name='+ Adicionar evidência esperada').click()
            form_entregavel.get_by_label('Tipo de evidência *').fill('Relatório de QA')
            form_entregavel.get_by_label('Descrição (opcional)').last.fill('Relatório planejado, não entregue')
            with admin.expect_response(lambda r: r.request.method == 'POST' and
                                       r.url.split('?')[0].endswith(f'/contratos/{a}/entregaveis') and r.status == 201,
                                       timeout=25000):
                form_entregavel.get_by_role('button', name='Cadastrar entregável').click()
            titulo_item = bloco_entregaveis.get_by_role('link', name=nome_entregavel, exact=True)
            titulo_item.wait_for(state='visible', timeout=25000)
            # Playwright pode rolar automaticamente ANTES do clique. Medir antes
            # do auto-scroll gera falso positivo ao comparar com o fechamento.
            titulo_item.scroll_into_view_if_needed()
            posicao_entregavel = admin.evaluate('window.scrollY')
            titulo_item.click()
            modal_item = admin.get_by_role('dialog', name=nome_entregavel)
            modal_item.wait_for(state='visible', timeout=25000)
            exigir(admin.url.split('?')[0] == f'{WEB}/contratos/{a}', 'Clique no entregável navegou em vez de abrir modal')
            exigir(modal_item.get_by_text('Comprovação ainda não acompanhada').count() == 1,
                   'UI inventou comprovação sem arquivos reais')
            area_modal = modal_item.locator('.overflow-y-auto').first
            botao_evidencia = modal_item.get_by_role('button', name='Ver detalhes da evidência esperada Relatório de QA')
            botao_evidencia.scroll_into_view_if_needed()
            posicao_interna = area_modal.evaluate('(el) => el.scrollTop')
            exigir(posicao_interna > 0, 'Fixture não permite verificar a rolagem interna do modal')
            botao_evidencia.click()
            evid = modal_item.get_by_role('region', name='Detalhe da evidência esperada')
            evid.get_by_text('Relatório planejado, não entregue').wait_for(timeout=10000)
            evid.get_by_role('button', name='← Voltar ao entregável').click()
            modal_item.get_by_role('heading', name='Evidências esperadas').wait_for(timeout=10000)
            exigir(abs(area_modal.evaluate('(el) => el.scrollTop') - posicao_interna) <= 2,
                   'Voltar da evidência perdeu a posição interna do modal')
            exigir(botao_evidencia.evaluate('(el) => document.activeElement === el'),
                   'Voltar da evidência não restaurou o foco ao botão atual')
            rel['provas'].append('Voltar da evidência preserva rolagem interna e foco no novo botão')
            admin.keyboard.press('Escape')
            modal_item.wait_for(state='hidden', timeout=10000)
            # history.back/popstate/RAF não são síncronos: aguardar o término da
            # restauração, sem aceitar deslocamento persistente.
            try:
                admin.wait_for_function('(y) => Math.abs(window.scrollY - y) <= 3',
                                        arg=posicao_entregavel, timeout=8000)
            except Exception as ex:
                atual = admin.evaluate('window.scrollY')
                raise AssertionError(
                    f'Fechar detalhe do entregável alterou a posição do contrato: '
                    f'antes={posicao_entregavel}, depois={atual}'
                ) from ex
            exigir(bloco_entregaveis.get_by_test_id('resumo-execucao-etapa').count() == 1,
                   'Etapa não exibe resumo de planejamento')
            rel['provas'].append('HU07: etapa/entregável criados por UI, detalhe e evidência esperada em modal, scroll preservado, sem comprovação fictícia')
            # A URL direta continua válida, mas o link redundante foi retirado da lista.
            # Abrir pela rota explícita não equivale a confirmar/restaurar scroll:
            # essa responsabilidade é do fluxo normal via modal e histórico.
            href_direto = titulo_item.get_attribute('href')
            exigir(href_direto == f'/contratos/{a}/entregaveis/{titulo_item.get_attribute("href").rsplit("/", 1)[-1]}',
                   'O título deixou de oferecer URL direta acessível')
            admin.goto(WEB + href_direto, wait_until='domcontentloaded')
            admin.get_by_role('heading', name=nome_entregavel).wait_for(timeout=20000)
            admin.goto(f'{WEB}/contratos/{a}', wait_until='domcontentloaded')
            rel['provas'].append('HU07: URL direta preservada, sem link redundante no modal')

            # Conferir dados da API e SQL usando reutilização do QA TEC08-02.
            itens = base.api(admin, base.documento_base(a))
            base.aceitar(itens['status'], {200}, 'Lista ADMIN A')
            ids = {d['nomeOriginal']: d['id'] for d in itens['body']['itens']}
            exigir(set(ids) == {'qa-principal.pdf', 'qa-anexo.txt'}, 'Documentos exibidos não correspondem à API')
            for id_documento in ids.values():
                if id_documento not in rel['documentosQA']:
                    rel['documentosQA'].append(id_documento)
            sql = {row['id']: row for row in base.sql_verificar(list(ids.values()))}
            for nome, dados, mime, categoria in (
                ('qa-principal.pdf', PDF, 'application/pdf', 'CONTRATO_PRINCIPAL'),
                ('qa-anexo.txt', TXT, 'text/plain', 'ANEXO'),
            ):
                row = sql[ids[nome]]
                exigir(row['contrato_id'] == a and row['autor_id'] == usr_admin['id'] and
                       row['sha256'] == hashlib.sha256(dados).hexdigest() and
                       row['categoria'] == categoria and row['tipo_mime'] == mime and
                       row['tamanho'] == len(dados) and
                       row['eventos_total'] == 1 and row['eventos_corretos'] == 1,
                       'Metadados ou auditoria SQL divergentes: ' + nome)
            rel['provas'].append('PostgreSQL: metadados, hash, FK, autor, categoria e auditoria sem storageKey')
            # ADMIN lê A e B isolados; vínculos novos iniciam ausentes para demais contas.
            exigir(base.api(admin, base.documento_base(b))['body']['total'] == 0,
                   'Contrato B recebeu documento de A')
            pessoas = {}
            for perfil in ('gestor-edicao', 'colaborador'):
                contexto, pagina, pessoa = base.nova_sessao(browser, perfil, contas)
                pessoas[perfil] = pessoa['id']
                try:
                    base.aceitar(base.api(pagina, base.documento_base(a))['status'], {403, 404},
                                perfil + ' recebeu acesso sem vínculo')
                finally:
                    contexto.close()
            rel['provas'].append('GESTOR/COLABORADOR sem vínculo negados na API com sessão válida')
            for perfil, editar in (('gestor-edicao', True), ('colaborador', False)):
                usuario = pessoas[perfil]
                pendentes.append((usuario, a))
                base.grant(admin, usuario, a, editar)
            rel['provas'].append('ADMIN concedeu vínculo temporário de edição ao GESTOR e leitura ao COLABORADOR')
            ctx_g, pg, _ = base.nova_sessao(browser, 'gestor-edicao', contas)
            try:
                pg.goto(f'{WEB}/contratos/{a}', wait_until='domcontentloaded')
                pg.locator('#documentos-contratuais').get_by_text('qa-anexo.txt', exact=True).wait_for(timeout=25000)
                exigir(pg.locator('#documentos-contratuais').get_by_role('button', name='Anexar documento').count() == 1,
                       'GESTOR editor não visualiza upload')
                pg.goto(f'{WEB}/contratos/{b}', wait_until='domcontentloaded')
                exigir(pg.locator('#documentos-contratuais').count() == 0,
                       'GESTOR sem vínculo visualizou documentos de B')
            finally:
                ctx_g.close()
            rel['provas'].append('GESTOR: interface de upload em contrato autorizado; contrato B não revela dados')
            ctx_c, pc, _ = base.nova_sessao(browser, 'colaborador', contas)
            try:
                pc.goto(f'{WEB}/contratos/{a}', wait_until='domcontentloaded')
                painel_c = pc.locator('#documentos-contratuais')
                painel_c.get_by_text('qa-anexo.txt', exact=True).wait_for(timeout=25000)
                exigir(painel_c.get_by_role('button', name='Anexar documento').count() == 0,
                       'COLABORADOR leitor recebeu upload na interface')
                baixar_e_conferir(pc, 'qa-anexo.txt', TXT, pasta)
                base.aceitar(base.upload_negado(pc, a), {403, 404}, 'POST COLABORADOR deve ser negado pelo backend')
                pc.goto(f'{WEB}/contratos/{b}', wait_until='domcontentloaded')
                exigir(pc.locator('#documentos-contratuais').count() == 0,
                       'COLABORADOR sem vínculo B visualizou área contratual')
            finally:
                ctx_c.close()
            rel['provas'].append('COLABORADOR: leitura/download autorizado A, UI sem upload; backend nega POST; B isolado')
            base.aceitar(base.api(admin, base.documento_base(b) + '/' + ids['qa-principal.pdf'] + '/download')['status'],
                         {404}, 'IDOR real: não aceitar documento A sob contrato B')
            rel['provas'].append('IDOR: contrato B existente não permite download de documento A')
            # Cartão da carteira: as contagens vêm do planejamento real.
            # Não confundir checklist com comprovantes recebidos.
            admin.goto(WEB + '/contratos', wait_until='domcontentloaded')
            numero_qa = f'QA-TEC08-03-{execucao}-A'
            busca = admin.get_by_label('Buscar por código, número, órgão ou objeto')
            busca.wait_for(state='visible', timeout=20000)
            busca.fill(numero_qa)
            cartao = admin.locator('ul.space-y-4 > li').filter(has=admin.get_by_text(numero_qa, exact=True))
            cartao.wait_for(state='visible', timeout=15000)
            resumo = cartao.get_by_test_id('resumo-planejamento-contrato')
            resumo.scroll_into_view_if_needed()
            admin.wait_for_function('''() => {
              const v = document.querySelector('[data-testid="resumo-planejamento-contrato"]');
              return !!v && v.textContent.includes('Etapas') &&
                v.textContent.includes('Evidências') &&
                v.textContent.includes('1 entregáveis planejados');
            }''', timeout=25000)
            exigir(resumo.locator('[aria-label="Evidências entregues: não mensuradas"]').count() == 1,
                   'Cartão confundiu checklist planejado com prova de entrega')
            exigir(resumo.locator('progress[aria-label="Etapas concluídas"]').count() == 1,
                   'Indicador de etapas não utiliza status real')
            rel['provas'].append('Carteira mostra etapas/entregáveis/evidências esperadas reais sem progresso fictício')
        except Exception as exc:
            falha = exc
            try:
                admin.screenshot(path=str(pasta / 'falha-ui.png'), full_page=True, timeout=6000)
                os.chmod(pasta / 'falha-ui.png', 0o600)
                rel['capturaPrivada'] = 'falha-ui.png'
            except Exception:
                rel['capturaPrivada'] = 'indisponível'
        finally:
            if ctx_admin is not None:
                for usuario, contrato in reversed(pendentes):
                    try:
                        atual = base.api(admin, f'/admin/usuarios/{usuario}/permissoes')
                        base.aceitar(atual['status'], {200}, 'Conferência de vínculo QA antes da revogação')
                        if any(v.get('contratoId') == contrato for v in atual['body']):
                            base.revogar(admin, usuario, contrato)
                        rel['restauracaoVinculos'].append('OK: vínculo temporário removido')
                    except Exception:
                        rel['restauracaoVinculos'].append('FALHA: conferir remoção do vínculo de QA')
                        if falha is None:
                            falha = AssertionError('Não foi possível revogar todos os vínculos temporários')
                if falha is None and pendentes:
                    try:
                        for perfil in ('gestor-edicao', 'colaborador'):
                            ctx_rev, pagina_rev, _ = base.nova_sessao(browser, perfil, contas)
                            try:
                                base.aceitar(base.api(pagina_rev, base.documento_base(a))['status'],
                                            {403, 404}, 'Acesso após revogação deve ser negado')
                            finally:
                                ctx_rev.close()
                        rel['provas'].append('Pós-revogação: sessões reais GESTOR/COLABORADOR negadas no contrato A')
                    except Exception:
                        falha = AssertionError('Falha na validação de ACL após revogar vínculos do QA')
                ctx_admin.close()
            browser.close()
    return registrar_relatorio(pasta, rel, falha)


def main():
    args = argumentos()
    try:
        contas = base.preflight()
        print('[TEC08-03] Pré-voo OK: Next, Nest, migration, Chromium, QA TEC08-02, três contas reais')
        if args.verificar:
            print('[TEC08-03] Somente leitura; não altera contrato, usuário, vínculo ou storage')
            return 0
        visivel = args.visivel or (not args.sem_janela and bool(os.environ.get('DISPLAY')))
        if args.visivel and not os.environ.get('DISPLAY'):
            raise AssertionError('--visivel exige DISPLAY/X11; use --sem-janela para ambientes headless')
        print('[TEC08-03] Chromium: ' + ('visível' if visivel else 'headless'))
        return executar(contas, visivel=visivel)
    except Exception as exc:
        print(f'[TEC08-03] REPROVADO: {type(exc).__name__}: {str(exc)[:200]}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
