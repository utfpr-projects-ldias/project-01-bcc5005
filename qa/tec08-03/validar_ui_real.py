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
import re
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


def nome_qa_entregavel(execucao: str) -> str:
    """Nome sintético deve caber no limite real (42); sem corte silencioso do input."""
    sufixo = execucao[-6:]
    nome = f'QA TEC08-03 Entregável {sufixo}'
    exigir(len(nome) <= 42, 'Fixture de entregável excede o limite do formulário')
    return nome


def numero_contrato_real(page, contrato_id: str) -> str:
    """Número efetivamente persistido: não derivar da etiqueta textual do QA.

    O contrato B é criado pela API com número exclusivamente numérico, e
    seu rótulo da execução fica nas observações.
    """
    exigir(base.uuid_ok(contrato_id), 'ID de contrato de QA inválido')
    consulta = base.api(page, f'/contratos/{contrato_id}')
    exigir(consulta.get('status') == 200 and isinstance(consulta.get('body'), dict),
           f'Não foi possível consultar contrato de QA criado: HTTP {consulta.get("status")}')
    dado = consulta['body']
    exigir(dado.get('id') == contrato_id, 'Consulta retornou contrato diferente do criado')
    numero = dado.get('numeroContrato')
    exigir(isinstance(numero, str) and re.fullmatch(r'\d{1,25}', numero),
           'Número do contrato persistido não respeita o formato da API')
    return numero


def criacao_pela_ui(page, execucao):
    # Fluxo atual: cadastro em modal na carteira. Validar a resposta real
    # da API, a presença do cartão e o ID do iframe de detalhe antes de
    # visitar a rota interna usada também pelo painel contextual.
    page.goto(WEB + '/contratos', wait_until='domcontentloaded')
    page.get_by_role('button', name='Cadastrar contrato').click()
    form = page.get_by_role('form', name='Cadastrar contrato')
    # O campo do formulário remove caracteres não numéricos e o backend exige até 25 dígitos.
    numero = f'{secrets.randbelow(10**25):025d}'
    form.get_by_label('Número do contrato').fill(numero)
    form.get_by_label('Órgão contratante').fill('LABORATORIO QA TEC08-03')
    form.get_by_label('Objeto').fill('CONTRATO SINTETICO DEV AUTOMATIZADO')
    form.get_by_label('Início da vigência').fill('2026-01-01')
    form.get_by_label('Término da vigência').fill('2027-12-31')
    form.get_by_role('button', name='Cadastrar contrato').click()
    dialogo = page.get_by_role('dialog', name='Confirmar cadastro do contrato?')
    with page.expect_response(lambda r: r.request.method == 'POST' and
                              r.url.split('?')[0].endswith('/contratos'),
                              timeout=30000) as confirmacao:
        dialogo.get_by_role('button', name='Cadastrar contrato').click()
    resposta_criacao = confirmacao.value
    exigir(resposta_criacao.status == 201,
           f'Cadastro pela UI: HTTP {resposta_criacao.status}, retorno={resposta_criacao.text()[:300]}')
    contrato = resposta_criacao.json()['id']
    exigir(base.uuid_ok(contrato), 'Cadastro via UI não retornou UUID de contrato')
    page.get_by_role('tab', name='Todos os contratos').click()
    page.locator('#campo-busca').select_option('todos')
    page.get_by_role('searchbox', name='Pesquisar contrato').fill(numero)
    cartao = page.get_by_role('button', name=f'Abrir detalhes do contrato {numero}', exact=True)
    cartao.wait_for(state='visible', timeout=25000)
    cartao.click()
    modal = page.get_by_role('dialog', name='Detalhes do contrato')
    modal.wait_for(state='visible', timeout=15000)
    exigir(modal.locator('iframe[title="Conteúdo do contrato"]').get_attribute('src') ==
           f'/contratos/{contrato}?painel=1', 'O cartão abriu um contrato diferente do cadastrado')
    # A rota interna é a mesma carregada pelo iframe; facilita a validação
    # da UI do documento com locators de página, sem alterar o contrato.
    page.goto(WEB + f'/contratos/{contrato}', wait_until='domcontentloaded')
    page.wait_for_function(
        r"""() => /^\/contratos\/[0-9a-fA-F-]{36}\/?$/.test(window.location.pathname)""",
        timeout=30000,
    )
    page.get_by_role('tab', name='Documentos').click()
    page.get_by_role('tabpanel', name='Documentos').wait_for(state='visible', timeout=20000)
    page.locator('#documentos-contratuais').get_by_role('button', name='Anexar documento').click()
    page.get_by_role('dialog', name='Anexar documento contratual').wait_for(state='visible', timeout=20000)
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
    # O feedback é emitido pelo ToastNotificacoes no layout GLOBAL.
    # Restringir a busca ao painel produzia falso negativo apesar do HTTP 201.
    # Além da confirmação visual, exigir o arquivo na lista persistida.
    try:
        page.get_by_label('Notificações').get_by_text('Documento anexado.', exact=True).wait_for(
            state='visible', timeout=12000)
    except Exception as erro:
        if type(erro).__name__ != 'TimeoutError':
            raise
        raise AssertionError(
            f'Upload {nome}: API HTTP 201, mas toast global não apareceu; '
            f'alerta do painel: {_alertas_visiveis(painel)}; '
            f'formulário visível: {page.get_by_role("form", name="Anexar documento contratual").count() == 1}') from erro
    painel.get_by_text(nome, exact=True).wait_for(state='visible', timeout=20000)
    return painel


def baixar_e_conferir(page, nome, dados, pasta):
    painel = page.locator('#documentos-contratuais')
    # Os cartões de documento agora abrem um detalhe; o download fica no modal.
    painel.get_by_role('button', name=f'Ver detalhes de {nome}', exact=True).click()
    detalhe = page.get_by_role('dialog', name=nome, exact=True)
    detalhe.wait_for(state='visible', timeout=15000)
    with page.expect_download(timeout=30000) as esperado:
        detalhe.get_by_role('button', name='Baixar arquivo', exact=True).click()
    download = esperado.value
    exigir(download.suggested_filename == nome, 'Nome do download diferente do solicitado')
    arquivo = pasta / ('download-' + secrets.token_hex(5))
    try:
        download.save_as(str(arquivo))
        exigir(hashlib.sha256(arquivo.read_bytes()).digest() == hashlib.sha256(dados).digest(),
               'SHA-256 do download via UI divergente')
    finally:
        arquivo.unlink(missing_ok=True)
        # Liberar a interface para anexos e filtros subsequentes do mesmo QA.
        detalhe.locator('[data-tec08-fechar-modal]').first.click(timeout=15000)
        detalhe.wait_for(state='hidden', timeout=15000)


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
                   'O formulário de PDF principal não abriu após seleção explícita de Documentos')
            rel['provas'].append('HU05: cadastro via formulário real -> Visão geral -> Documentos escolhidos pelo usuário -> upload')
            # O contrato B também é real, mas criado por API reutilizada da TEC08-02.
            b = base.criar_contrato(admin, execucao + '-B')
            rel['contratosQA']['B'] = b
            rel['provas'].append('Contrato B real para isolamento de ACL; sem IDs informados manualmente')
            # Contrato NOVO: prova suspensão e retomada reais com histórico confiável.
            # Esse cenário detecta o bug de suspensão histórica sem precisar inventar
            # situação anterior nem alterar contratos não criados pelo QA.
            susp = base.api(admin, f'/contratos/{b}/suspender', 'PATCH')
            exigir(susp['status'] == 200 and susp['body'].get('status') == 'SUSPENSO',
                   'Suspender contrato de teste novo falhou ou retornou situação errada')
            # A interface deve oferecer Retomar exclusivamente no detalhe.
            pagina_retomada = admin.context.new_page()
            try:
                pagina_retomada.goto(f'{WEB}/contratos/{b}', wait_until='domcontentloaded')
                pagina_retomada.get_by_role('button', name='Retomar contrato suspenso').wait_for(timeout=20000)
                exigir(pagina_retomada.get_by_role('button', name='Editar contrato').count() == 0,
                       'Contrato suspenso ainda exibe edição comum no detalhe')
                # O botão abre confirmação auditável: aguardar resposta somente
                # depois do preenchimento da justificativa obrigatória.
                pagina_retomada.get_by_role('button', name='Retomar contrato suspenso').click()
                confirmacao = pagina_retomada.get_by_role('dialog', name='Reabrir contrato suspenso?')
                confirmacao.wait_for(state='visible', timeout=12000)
                confirmacao.get_by_label('Justificativa obrigatória (15 a 200 caracteres)').fill(
                    'Retomada controlada do contrato sintético após suspensão de QA.')
                with pagina_retomada.expect_response(
                    lambda r: r.request.method == 'PATCH' and r.url.split('?')[0].endswith(f'/contratos/{b}/retomar'),
                    timeout=20000,
                ) as aguardando_retomada:
                    confirmacao.get_by_role('button', name='Confirmar retomada').click()
                exigir(aguardando_retomada.value.status == 200,
                       'Botão Retomar não concluiu a operação HTTP 200 no contrato de QA')
            finally:
                pagina_retomada.close()
            retorno = base.api(admin, f'/contratos/{b}')
            exigir(retorno['status'] == 200 and retorno['body'].get('status') == 'PLANEJAMENTO',
                   'Retomada não restaurou a situação PLANEJAMENTO registrada no evento de auditoria')
            rel['provas'].append('API + UI: suspensão auditada e retomada do contrato B ao status anterior exato')
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
            painel.locator('#filtro-categoria-documento').select_option('CONTRATO_PRINCIPAL')
            painel.get_by_text('qa-principal.pdf', exact=True).wait_for(timeout=20000)
            exigir(painel.get_by_text('qa-anexo.txt', exact=True).count() == 0, 'Filtro exibiu categoria incorreta')
            admin.reload(wait_until='domcontentloaded')
            # O detalhe inicia em Visao geral depois de cada carregamento novo.
            # A categoria persiste em sessionStorage, nao a aba selecionada.
            # O filtro existe no DOM da aba oculta, mas nao e interativo/visivel
            # ate o usuario retornar explicitamente a Documentos.
            admin.get_by_role('tab', name='Documentos', exact=True).click()
            admin.get_by_role('tabpanel', name='Documentos').wait_for(state='visible', timeout=20000)
            painel = admin.locator('#documentos-contratuais')
            painel.locator('#filtro-categoria-documento').wait_for(state='visible', timeout=25000)
            painel.get_by_text('qa-principal.pdf', exact=True).wait_for(timeout=25000)
            exigir(painel.locator('#filtro-categoria-documento').input_value() == 'CONTRATO_PRINCIPAL',
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
            painel.locator('#filtro-categoria-documento').select_option('ANEXO')
            painel.get_by_text('qa-anexo.txt', exact=True).wait_for(timeout=20000)
            exigir(abs(admin.evaluate('window.scrollY') - rolagem_filtro) <= 2,
                   'Filtro ANEXO deslocou a posição da página')
            painel.locator('#filtro-categoria-documento').select_option('CONTRATO_PRINCIPAL')
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
            # O roteiro estava na aba Documentos; a aba Etapas so e
            # visivel depois da escolha explicita do usuario.
            admin.get_by_role('tab', name='Etapas', exact=True).click()
            admin.get_by_role('tabpanel', name='Etapas').wait_for(state='visible', timeout=20000)
            etapas_area = admin.locator('section[aria-labelledby="titulo-etapas"]')
            etapas_area.get_by_role('button', name='Nova etapa').click()
            form_etapa = admin.get_by_role('form', name='Criar etapa')
            nome_etapa = 'QA TEC08-03 Etapa Modal ' + execucao[-6:]
            form_etapa.locator('#etapa-nome').fill(nome_etapa)
            with admin.expect_response(lambda r: r.request.method == 'POST' and
                                       r.url.split('?')[0].endswith(f'/contratos/{a}/etapas') and r.status == 201,
                                       timeout=25000):
                form_etapa.get_by_role('button', name='Salvar etapa').click()
            # No layout atual o titulo da etapa e um BOTAO, nao um heading.
            # Os entregaveis pertencem ao modal da etapa; nao ficam no <li>.
            abertura_etapa = etapas_area.get_by_role(
                'button', name=re.compile(r'^Abrir detalhes da etapa \d+: ' + re.escape(nome_etapa) + r'$'))
            # Esperar o botão real, após o POST 201 e a atualização assíncrona da lista.
            # O filtro anterior era incorreto: o localizador interno começava
            # na seção exterior, e não dentro de cada <li> sob avaliação.
            try:
                abertura_etapa.wait_for(state='visible', timeout=25000)
            except Exception as erro:
                # Nunca fingir sucesso nem recarregar a página para esconder uma
                # eventual falha real de atualização da UI após cadastro.
                estado = etapas_area.evaluate('''raiz => ({
                  listas: raiz.querySelectorAll('ol[aria-label="Etapas em ordem de execução"]').length,
                  cartoes: raiz.querySelectorAll('ol[aria-label="Etapas em ordem de execução"] > li').length,
                  botoesDeEtapa: raiz.querySelectorAll('button[aria-label^="Abrir detalhes da etapa"]').length,
                  avisos: raiz.querySelectorAll('[role="alert"]').length
                })''')
                raise AssertionError(
                    f'POST da etapa retornou HTTP 201, mas o botão não apareceu na UI: {estado}'
                ) from erro
            cartao_etapa = abertura_etapa.locator('xpath=ancestor::li[1]')
            cartao_etapa.wait_for(state='visible', timeout=8000)
            exigir(cartao_etapa.locator('xpath=parent::ol').get_attribute('aria-label') ==
                   'Etapas em ordem de execução',
                   'Etapa criada não está na lista principal ordenada do contrato')
            abertura_etapa.click()
            modal_etapa = admin.get_by_role(
                'dialog', name=re.compile(r'^\d+\s*·\s*' + re.escape(nome_etapa) + r'$'))
            modal_etapa.wait_for(state='visible', timeout=15000)
            bloco_entregaveis = modal_etapa.get_by_role('region', name='Entregáveis da etapa')
            bloco_entregaveis.get_by_role('button', name='Novo entregável').click()
            form_entregavel = admin.get_by_role('form', name='Cadastrar entregável')
            nome_entregavel = nome_qa_entregavel(execucao)
            campo_nome = form_entregavel.locator('input[id$="-nome"]')
            campo_nome.fill(nome_entregavel)
            exigir(campo_nome.input_value() == nome_entregavel,
                   'Formulário truncou o nome do entregável antes do POST')
            form_entregavel.locator('input[id$="-inicioPrevisto"]').fill('2026-11-10')
            form_entregavel.locator('input[id$="-peso"]').fill('1.0000')
            with admin.expect_response(lambda r: r.request.method == 'POST' and
                                       r.url.split('?')[0].endswith(f'/contratos/{a}/entregaveis'),
                                       timeout=25000) as requisicao_cadastro:
                form_entregavel.get_by_role('button', name='Cadastrar entregável').click()
            resposta_cadastro = requisicao_cadastro.value
            exigir(resposta_cadastro.status == 201,
                   f'Cadastro de entregável retornou HTTP {resposta_cadastro.status}: {resposta_cadastro.text()[:180]}')
            resposta_item = resposta_cadastro.json()
            exigir(isinstance(resposta_item, dict) and base.uuid_ok(resposta_item.get('id')),
                   'Cadastro de entregável não retornou UUID válido')
            exigir(resposta_item.get('nome') == nome_entregavel,
                   f'API persistiu nome diferente do digitado: {resposta_item.get("nome")!r} != {nome_entregavel!r}')
            id_item = resposta_item['id']
            consulta_item = admin.request.get(f'{base.BASE_API}/contratos/{a}/entregaveis/{id_item}')
            exigir(consulta_item.status == 200 and consulta_item.json().get('nome') == nome_entregavel,
                   f'GET do entregável não confirmou o nome persistido: HTTP {consulta_item.status}')
            href_item = f'/contratos/{a}/entregaveis/{id_item}'
            # Identificar o link pela URL retornada no POST, não por algoritmo
            # de nome acessível do Playwright num modal aninhado. Ainda exigir
            # nome acessível, âncora sem aria-hidden e navegação por teclado.
            titulo_item = bloco_entregaveis.locator(
                f'li[data-tec08-item-clicavel] a[href="{href_item}"]')
            try:
                titulo_item.wait_for(state='visible', timeout=25000)
            except Exception as erro:
                diagnostico = bloco_entregaveis.evaluate(
                    "el => ({abas: [...el.querySelectorAll('[role=tab]')].map(t => ({nome:t.textContent,ativa:t.getAttribute('aria-selected')})), links:[...el.querySelectorAll('a')].map(a => ({texto:a.innerText, nome:a.getAttribute('aria-label'), url:a.getAttribute('href'), papel:a.getAttribute('role'), popup:a.getAttribute('aria-haspopup'), visivel:!!a.getClientRects().length}))})")
                # Preservar o DOM diagnosticado integralmente no ZIP do QA, sem cookies/tokens.
                arquivo_dom = pasta / 'diagnostico-entregavel-dom.json'
                arquivo_dom.write_text(json.dumps({
                    'entregavelId': id_item, 'hrefEsperado': href_item,
                    'nomeEsperado': nome_entregavel, 'dom': diagnostico,
                }, ensure_ascii=False, indent=2), encoding='utf-8')
                arquivo_dom.chmod(0o600)
                rel['diagnosticoEntregavelDOM'] = arquivo_dom.name
                raise AssertionError(f'Entregável criado não ficou visível na aba ativa: {diagnostico}') from erro
            exigir(titulo_item.count() == 1 and titulo_item.get_attribute('aria-label') == nome_entregavel,
                   'Cartão do entregável não corresponde ao nome persistido')
            exigir(titulo_item.evaluate("a => a.tagName === 'A' && !a.closest('[aria-hidden=true]') && a.tabIndex >= 0"),
                   'O cartão existe visualmente, mas não está acessível como link')
            # Playwright pode rolar automaticamente ANTES do clique. Medir antes
            # do auto-scroll gera falso positivo ao comparar com o fechamento.
            titulo_item.scroll_into_view_if_needed()
            posicao_entregavel = admin.evaluate('window.scrollY')
            titulo_item.click()
            modal_item = admin.get_by_role('dialog', name=nome_entregavel)
            modal_item.wait_for(state='visible', timeout=25000)
            exigir(admin.url.split('?')[0] == f'{WEB}/contratos/{a}', 'Clique no entregável navegou em vez de abrir modal')
            # O checklist agora é cadastrado no detalhe, separado do formulário
            # de planejamento. Garantir a persistência real antes de conferir status.
            modal_item.get_by_role('tab', name='Evidências', exact=True).click()
            modal_item.get_by_role('button', name='Nova evidência').click()
            cadastro_evidencia = admin.get_by_role('dialog', name='Nova evidência esperada')
            cadastro_evidencia.get_by_label('Tipo de evidência').select_option('Relatório')
            cadastro_evidencia.get_by_label('Orientações (opcional)').fill('Relatório planejado, não entregue')
            with admin.expect_response(lambda r: r.request.method == 'POST' and
                                       r.url.split('?')[0].endswith('/evidencias-esperadas') and r.status == 201,
                                       timeout=25000):
                cadastro_evidencia.get_by_role('button', name='Cadastrar evidência').click()
            # A evidência sem comprovante aparece como Aguardando envio.
            # Nao aceitar "Status indisponivel" ou conteudo inventado como prova.
            status_evidencia = modal_item.get_by_label('Status da evidência Relatório')
            status_evidencia.get_by_text('Aguardando envio', exact=True).wait_for(state='visible', timeout=20000)
            # O contador textual resume 0/1; 'verificadas' integra o nome acessível
            # da barra de progresso (role=img), sem confundir prova com avanço físico.
            modal_item.get_by_text('0/1 evidências obrigatórias', exact=True).wait_for(state='visible', timeout=10000)
            modal_item.get_by_role('img', name='0 de 1 evidências obrigatórias verificadas', exact=True).wait_for(
                state='visible', timeout=10000)
            area_modal = modal_item.locator('[data-tec08-corpo-modal]').first
            botao_evidencia = modal_item.get_by_role('button', name='Ver detalhes da evidência esperada Relatório')
            # Scroll so deve ser >0 se a propria area permitir rolar.
            # Uma fixture curta nao pode produzir um falso negativo.
            area_modal.evaluate('(el) => { el.scrollTop = Math.min(80, Math.max(0, el.scrollHeight - el.clientHeight)); }')
            botao_evidencia.scroll_into_view_if_needed()
            posicao_interna = area_modal.evaluate('(el) => el.scrollTop')
            if area_modal.evaluate('(el) => el.scrollHeight > el.clientHeight + 1'):
                exigir(posicao_interna > 0, 'Nao foi possivel posicionar a rolagem interna do modal')
            botao_evidencia.click()
            # O detalhe da evidencia e um NOVO modal portal, nao um filho DOM
            # do dialogo do entregavel.
            modal_evidencia = admin.get_by_role('dialog', name='Relatório', exact=True)
            modal_evidencia.wait_for(state='visible', timeout=15000)
            evid = modal_evidencia.get_by_role('region', name='Detalhe da evidência esperada')
            evid.get_by_text('Relatório planejado, não entregue').wait_for(state='visible', timeout=10000)
            modal_evidencia.get_by_role('button', name='Fechar evidência').click()
            modal_evidencia.wait_for(state='hidden', timeout=10000)
            modal_item.get_by_role('tab', name='Evidências', exact=True).wait_for(state='visible', timeout=10000)
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
            exigir(href_direto is not None and href_direto.startswith(f'/contratos/{a}/entregaveis/') and
                   base.uuid_ok(href_direto.rsplit('/', 1)[-1]),
                   'O titulo deixou de oferecer URL direta acessivel ao entregavel criado')
            # Encerrar o modal de etapa antes de navegar pela rota direta.
            modal_etapa.get_by_role('button', name='Voltar às etapas').click()
            modal_etapa.wait_for(state='hidden', timeout=10000)
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
                pg.get_by_role('tab', name='Documentos', exact=True).click()
                pg.get_by_role('tabpanel', name='Documentos').wait_for(state='visible', timeout=20000)
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
                pc.get_by_role('tab', name='Documentos', exact=True).click()
                pc.get_by_role('tabpanel', name='Documentos').wait_for(state='visible', timeout=20000)
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
            # Cartão na carteira de contratos. A página atual conserva a aba
            # escolhida anteriormente; o campo de pesquisa somente aparece em "Todos".
            # Selecionar explicitamente a aba e todos os campos antes de filtrar.
            admin.goto(WEB + '/contratos', wait_until='domcontentloaded')
            aba_todos = admin.get_by_role('tab', name='Todos os contratos')
            aba_todos.wait_for(state='visible', timeout=20000)
            aba_todos.click()
            admin.locator('#campo-busca').select_option('todos')
            numero_qa = numero_contrato_real(admin, a)
            busca = admin.get_by_role('searchbox', name='Pesquisar contrato')
            busca.wait_for(state='visible', timeout=20000)
            busca.fill(numero_qa)
            # O cartão é um botão contextual que abre um iframe de detalhe,
            # não um link de navegação. Validar o contrato raiz do iframe.
            cartao = admin.get_by_role('button', name=f'Abrir detalhes do contrato {numero_qa}', exact=True)
            cartao.wait_for(state='visible', timeout=25000)
            resumo = cartao.get_by_test_id('resumo-planejamento-contrato')
            # Verificar o resumo NA CARTEIRA antes de abrir o modal contextual.
            # Quando o diálogo está aberto, o fundo pode ficar inerte ao leitor
            # de acessibilidade; não confundir isso com indicadores ausentes.
            resumo.scroll_into_view_if_needed()
            # Indicadores atuais usam role=img/aria-label. Não existe mais
            # <progress>, nem o rótulo legado de entregas não medidas.
            # Houve 1 etapa, 1 entregável e 1 evidência obrigatória neste cenário,
            # mas nenhum comprovante foi enviado: os quatro numeradores são zero.
            esperados = (
                '0 de 1 etapas finalizadas',
                '0 de 1 entregáveis finalizados',
                '0 de 1 evidências verificadas',
                '0 de 1 exigências obrigatórias atendidas',
            )
            for rotulo in esperados:
                try:
                    resumo.get_by_role('img', name=rotulo, exact=True).wait_for(
                        state='visible', timeout=25000)
                except Exception as erro:
                    diagnostico = resumo.evaluate(
                        "el => ({texto: el.innerText.slice(0,500), "
                        "indicadores: Array.from(el.querySelectorAll('[role=img]'))"
                        ".map(no => no.getAttribute('aria-label')), "
                        "carregando: el.querySelector('[role=status]')?.textContent ?? null})"
                    )
                    raise AssertionError(
                        f'Carteira não exibe indicador real {rotulo!r}: {diagnostico}'
                    ) from erro
            rel['provas'].append('Lista de contratos mostra etapas/entregáveis/evidências esperadas reais sem progresso fictício')
            cartao.click()
            modal = admin.get_by_role('dialog', name='Detalhes do contrato')
            modal.wait_for(state='visible', timeout=15000)
            exigir(modal.locator('iframe[title="Conteúdo do contrato"]').get_attribute('src') ==
                   f'/contratos/{a}?painel=1', 'Pesquisa abriu outro contrato ou iframe incorreto')
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
