import io
import ast
import inspect
import json
import tempfile
from pathlib import Path
from contextlib import redirect_stdout
import unittest
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import validar_ui_real as ui

class TesteQATec0803(unittest.TestCase):
    def test_assinaturas_validas(self):
        self.assertTrue(ui.base.uuid_ok('11111111-1111-4111-8111-111111111111'))
        self.assertFalse(ui.base.uuid_ok('nao-uuid'))

    def test_lista_contratos_acessibilidade_e_indicadores_reais(self):
        """Evita regressão do QA após o fluxo inteiro já ter criado seus dados."""
        qa = Path(ui.__file__).read_text(encoding='utf-8')
        carteira = (ui.RAIZ / 'frontend/src/app/contratos/page.tsx').read_text(encoding='utf-8')
        resumo = (ui.RAIZ / 'frontend/src/app/contratos/components/resumo-planejamento-contrato.tsx').read_text(encoding='utf-8')
        self.assertIn('aria-label="Pesquisar contrato"', carteira)
        self.assertIn('id="campo-busca"', carteira)
        self.assertIn("aria-label={opcao === 'todos' ? 'Todos os contratos'", carteira)
        self.assertIn('aria-label={`Abrir contrato ${c.numeroContrato}`}', carteira)
        self.assertIn('data-testid="resumo-planejamento-contrato"', resumo)
        self.assertIn('role="img" aria-label={rotulo}', resumo)
        self.assertIn('etapas concluídas e comprovadas', resumo)
        self.assertIn('entregáveis documentalmente comprovados', resumo)
        self.assertIn('evidências obrigatórias verificadas', resumo)
        self.assertIn("get_by_role('tab', name='Todos os contratos')", qa)
        self.assertIn("locator('#campo-busca').select_option('todos')", qa)
        self.assertIn("get_by_role('searchbox', name='Pesquisar contrato')", qa)
        self.assertIn("get_by_role('link', name=f'Abrir contrato {numero_qa}'", qa)
        self.assertIn("get_by_test_id('resumo-planejamento-contrato')", qa)
        self.assertIn("get_by_role('img', name=rotulo, exact=True)", qa)
        for rotulo in ('0 de 1 etapas concluídas e comprovadas',
                       '0 de 1 entregáveis documentalmente comprovados',
                       '0 de 1 evidências obrigatórias verificadas'):
            self.assertIn(rotulo, qa)
        for obsoleto in ('Buscar por código, número, órgão ou objeto',
                         'ul.space-y-4 > li', 'progress[aria-label',
                         'Evidências entregues: não mensuradas', '1 entregáveis planejados'):
            self.assertNotIn(obsoleto, qa)

    def test_cadastro_so_aceita_redirect_com_uuid(self):
        # Antes a glob **/contratos/* aceitava /contratos/novo imediatamente.
        codigo = Path(ui.__file__).read_text(encoding='utf-8')
        self.assertNotIn("page.wait_for_url('**/contratos/*'", codigo)
        self.assertIn('page.wait_for_function(', codigo)
        self.assertIn('window.location.pathname', codigo)

    def test_confirmacao_upload_esta_no_toast_global_e_documento_na_lista(self):
        # A API HTTP 201 isolada não basta: conferir feedback real e listagem.
        fonte = Path(ui.__file__).read_text(encoding='utf-8')
        componente = (ui.RAIZ / 'frontend/src/app/contratos/components/painel-documentos.tsx').read_text(encoding='utf-8')
        layout = (ui.RAIZ / 'frontend/src/app/layout.tsx').read_text(encoding='utf-8')
        self.assertIn("page.get_by_label('Notificações').get_by_text('Documento anexado.'", fonte)
        self.assertNotIn("painel.get_by_text('Documento anexado.'", fonte)
        self.assertIn("painel.get_by_text(nome, exact=True).wait_for(state='visible'", fonte)
        self.assertIn("toastSucesso('Documento anexado.')", componente)
        self.assertIn('<ToastNotificacoes />', layout)

    def test_pdf_qa_valido_para_storage(self):
        self.assertTrue(ui.PDF.startswith(b'%PDF-'))
        self.assertIn(b'%%EOF', ui.PDF)
        self.assertGreater(len(ui.PDF), 12)

    def test_txt_qa_utf8(self):
        self.assertEqual(ui.TXT, ui.TXT.decode('utf-8').encode('utf-8'))

    def test_execucao_sem_confirmacao_falha(self):
        original = sys.argv
        try:
            sys.argv = ['qa', '--executar']
            with self.assertRaises(SystemExit):
                ui.argumentos()
        finally:
            sys.argv = original

    def test_verificar_nao_exige_consentimento(self):
        original = sys.argv
        try:
            sys.argv = ['qa', '--verificar']
            self.assertTrue(ui.argumentos().verificar)
        finally:
            sys.argv = original

    def test_relatorio_falha_nao_inclui_segredos(self):
        with tempfile.TemporaryDirectory() as pasta:
            dados = {'status': 'REPROVADO', 'provas': [], 'segredosNoRelatorio': False}
            with redirect_stdout(io.StringIO()):
                codigo = ui.registrar_relatorio(Path(pasta), dados, AssertionError('invalido'))
            self.assertEqual(codigo, 1)
            resultado = json.loads((Path(pasta)/'resultado.json').read_text())
            self.assertEqual(resultado['totalProvas'], 0)
            self.assertFalse(resultado['segredosNoRelatorio'])


    def test_roteiro_contem_suspensao_e_retomada_de_contrato_novo(self):
        fonte = Path(ui.__file__).read_text(encoding='utf-8')
        self.assertIn("f'/contratos/{b}/suspender', 'PATCH'", fonte)
        self.assertIn("name='Retomar contrato suspenso'", fonte)
        self.assertIn("'status') == 'PLANEJAMENTO'", fonte)
        self.assertIn('status anterior exato', fonte)

    def test_pdf_possui_xref_e_trailer_coerentes(self):
        pdf = ui.PDF
        pos = int(pdf.rsplit(b'startxref\n', 1)[1].splitlines()[0])
        self.assertEqual(pdf[pos:pos+5], b'xref\n')
        self.assertIn(b'/Root 1 0 R', pdf)
        self.assertTrue(pdf.endswith(b'%%EOF\n'))

    def test_identifica_somente_post_do_contrato_correspondente(self):
        class Req:
            method = 'POST'
        class Res:
            request = Req()
            url = 'http://localhost:3001/contratos/11111111-1111-4111-8111-111111111111/documentos'
        self.assertTrue(ui._resposta_documentos(Res(), '11111111-1111-4111-8111-111111111111'))
        self.assertFalse(ui._resposta_documentos(Res(), '22222222-2222-4222-8222-222222222222'))
        Res.request.method = 'GET'
        self.assertFalse(ui._resposta_documentos(Res(), '11111111-1111-4111-8111-111111111111'))

    def test_mime_obrigatorio_nomeado_e_fixtures_corretas(self):
        # Impede regressão da falha real: descrição passada por engano como MIME.
        assinatura = inspect.signature(ui.arquivo_na_ui)
        self.assertEqual(assinatura.parameters['mime'].kind, inspect.Parameter.KEYWORD_ONLY)
        arvore = ast.parse(Path(ui.__file__).read_text(encoding='utf-8'))
        envios = [no for no in ast.walk(arvore) if isinstance(no, ast.Call)
                  and isinstance(no.func, ast.Name) and no.func.id == 'arquivo_na_ui']
        self.assertEqual(len(envios), 3)
        for chamada in envios:
            self.assertEqual(len(chamada.args), 5, 'Não usar MIME ou descrição como posicionais')
            self.assertIsInstance(chamada.args[3], ast.Constant)
            nome = chamada.args[3].value
            kwargs = {arg.arg: arg.value for arg in chamada.keywords}
            self.assertIn('mime', kwargs)
            self.assertIsInstance(kwargs['mime'], ast.Constant)
            esperado = 'application/pdf' if nome.endswith('.pdf') else 'text/plain' if nome.endswith('.txt') else None
            self.assertIsNotNone(esperado)
            self.assertEqual(kwargs['mime'].value, esperado)
        # Validação falha imediatamente se o QA chamar tipo incorreto, sem esperar resposta HTTP.
        with self.assertRaisesRegex(AssertionError, 'Erro no próprio QA'):
            ui.arquivo_na_ui(None, 'teste', 'CONTRATO_PRINCIPAL',
                             'qa-principal.pdf', ui.PDF, mime='Contrato principal do QA')

    def test_cadastro_abre_visao_geral_e_qa_seleciona_documentos_explicitamente(self):
        fonte = Path(ui.__file__).read_text(encoding='utf-8')
        pagina = (ui.RAIZ / 'frontend/src/app/contratos/novo/page.tsx').read_text(encoding='utf-8')
        self.assertNotIn('anexarDocumento=principal', pagina)
        self.assertIn('router.push(`/contratos/${encodeURIComponent(criado.id)}`)', pagina)
        self.assertIn("page.get_by_role('tab', name='Documentos').click()", fonte)
        self.assertIn("get_by_role('button', name='Anexar documento').click()", fonte)
        self.assertIn("page.get_by_role('dialog', name='Anexar documento contratual')", fonte)

    def test_modal_documental_reutiliza_componente_e_nao_forca_scroll(self):
        componente = (ui.RAIZ / 'frontend/src/app/contratos/components/painel-documentos.tsx').read_text(encoding='utf-8')
        self.assertIn('createPortal(<ModalEtapa', componente)
        self.assertIn('rotuloFechar="Fechar anexo de documento"', componente)
        self.assertNotIn('scrollIntoView(', componente)
        self.assertIn('__modalDocumento', componente)
        fonte = Path(ui.__file__).read_text(encoding='utf-8')
        self.assertIn("page.get_by_role('dialog', name='Anexar documento contratual')", fonte)
        self.assertIn("admin.evaluate('window.history.back()')", fonte)
        self.assertIn("admin.keyboard.press('Escape')", fonte)
        self.assertIn('Selecionar categoria/arquivo alterou a rolagem', fonte)

    def test_aviso_principal_usa_identificador_estavel(self):
        """A redação para usuário pode mudar sem quebrar os testes de UI."""
        componente = ui.RAIZ / 'frontend/src/app/contratos/components/painel-documentos.tsx'
        teste_react = ui.RAIZ / 'frontend/src/app/contratos/components/painel-documentos.test.tsx'
        assert componente.is_file() and teste_react.is_file()
        self.assertIn('data-testid="documento-principal-ausente"', componente.read_text(encoding='utf-8'))
        self.assertIn("findByTestId('documento-principal-ausente')", teste_react.read_text(encoding='utf-8'))
        conteudo = Path(ui.__file__).read_text(encoding='utf-8')
        self.assertIn("get_by_test_id('documento-principal-ausente')", conteudo)
        self.assertNotIn("get_by_text('Ainda não há documento principal'", conteudo)

    def test_filtro_documental_usa_id_estavel_igual_ao_frontend(self):
        # Evita falso negativo em Chromium se somente o texto do rótulo for editado.
        roteiro = Path(ui.__file__).read_text(encoding='utf-8')
        componente = (ui.RAIZ / 'frontend/src/app/contratos/components/painel-documentos.tsx').read_text(encoding='utf-8')
        self.assertIn('id="filtro-categoria-documento"', componente)
        self.assertIn('htmlFor="filtro-categoria-documento"', componente)
        self.assertEqual(roteiro.count("painel.locator('#filtro-categoria-documento')"), 5)
        self.assertNotIn("painel.get_by_label('Filtrar por categoria')", roteiro)

    def test_qa_volta_aba_documentos_depois_de_recarregar(self):
        codigo = Path(ui.__file__).read_text(encoding='utf-8')
        bloco = codigo.split("admin.reload(wait_until='domcontentloaded')", 1)[1].split(
            "rel['provas'].append('Filtro por categoria restaura", 1)[0]
        selecao = "admin.get_by_role('tab', name='Documentos', exact=True).click()"
        visivel = "admin.get_by_role('tabpanel', name='Documentos').wait_for(state='visible'"
        filtro = "painel.locator('#filtro-categoria-documento').wait_for(state='visible'"
        self.assertIn(selecao, bloco)
        self.assertIn(visivel, bloco)
        self.assertIn(filtro, bloco)
        self.assertLess(bloco.index(selecao), bloco.index(filtro))
        self.assertLess(bloco.index(visivel), bloco.index(filtro))
        # A preferencia por categoria persiste, mas nao muda a aba da UI.
        pagina = (ui.RAIZ / 'frontend/src/app/contratos/[id]/page.tsx').read_text(encoding='utf-8')
        self.assertIn("useState<'visao' | 'execucao' | 'etapas' | 'atividades' | 'documentos'>('visao')", pagina)
        self.assertIn('id="painel-execucao"', pagina)
        self.assertIn('id="painel-documentos"', pagina)

    def test_qa_ativa_abas_de_etapas_e_documentos_por_perfil(self):
        codigo = Path(ui.__file__).read_text(encoding='utf-8')
        self.assertIn("admin.get_by_role('tab', name='Etapas', exact=True).click()", codigo)
        self.assertIn("admin.get_by_role('tabpanel', name='Etapas').wait_for(state='visible'", codigo)
        for perfil in ('pg', 'pc'):
            self.assertIn(f"{perfil}.get_by_role('tab', name='Documentos', exact=True).click()", codigo)
            self.assertIn(f"{perfil}.get_by_role('tabpanel', name='Documentos').wait_for(state='visible'", codigo)

    def test_filtro_e_seletor_acessivel_sao_checados_no_qa(self):
        origem = Path(ui.__file__).read_text(encoding='utf-8')
        self.assertIn("name='Escolher arquivo'", origem)
        self.assertIn("Filtro ANEXO deslocou a posição da página", origem)
        self.assertIn("Filtro PRINCIPAL deslocou a posição da página", origem)
        self.assertIn("Voltar de outra aba deslocou a posição do contrato", origem)

    def test_argumentos_headless_e_visivel(self):
        original = sys.argv
        try:
            sys.argv = ['qa', '--executar', '--confirmar-persistencia', '--visivel']
            a = ui.argumentos()
            self.assertTrue(a.visivel)
            sys.argv = ['qa', '--executar', '--confirmar-persistencia', '--sem-janela']
            b = ui.argumentos()
            self.assertTrue(b.sem_janela)
        finally:
            sys.argv = original

    def test_hu07_modal_e_evidencia_sem_simulacao_de_entrega(self):
        fonte = Path(ui.__file__).read_text(encoding='utf-8')
        self.assertIn('modal_item.wait_for', fonte)
        self.assertIn("get_by_role('region', name='Detalhe da evidência esperada')", fonte)
        self.assertIn("get_by_text('Aguardando envio', exact=True)", fonte)
        self.assertIn("get_by_text('0/1 evidências obrigatórias verificadas', exact=True)", fonte)
        self.assertIn('HU07: etapa/entregável criados por UI', fonte)
        componente = ui.RAIZ / 'frontend/src/app/contratos/components/entregaveis-da-etapa.tsx'
        self.assertIn('__modalEntregavel', componente.read_text(encoding='utf-8'))

    def test_etapa_e_entregavel_seguem_modal_real_nao_card_antigo(self):
        fonte = Path(ui.__file__).read_text(encoding='utf-8')
        etapa = (ui.RAIZ / 'frontend/src/app/contratos/components/painel-etapas.tsx').read_text(encoding='utf-8')
        entregaveis = (ui.RAIZ / 'frontend/src/app/contratos/components/entregaveis-da-etapa.tsx').read_text(encoding='utf-8')
        self.assertIn('aria-label={`Abrir detalhes da etapa ${indice + 1}: ${etapa.nome}`}', etapa)
        self.assertIn('aria-label="Etapas em ordem de execução"', fonte)
        self.assertNotIn("has=abertura_etapa", fonte)
        self.assertIn("abertura_etapa.wait_for(state='visible'", fonte)
        self.assertIn("cartao_etapa = abertura_etapa.locator('xpath=ancestor::li[1]')", fonte)
        self.assertIn("'Etapas em ordem de execução'", fonte)
        self.assertIn('abertura_etapa.click()', fonte)
        self.assertIn("modal_etapa.get_by_role('region', name='Entregáveis da etapa')", fonte)
        self.assertNotIn("has=admin.get_by_role('heading', name=nome_etapa", fonte)
        self.assertNotIn("cartao_etapa.locator('section[aria-label=", fonte)
        self.assertRegex(etapa, r'<EntregaveisDaEtapa\b[^>]*\bcontratoId=')
        self.assertIn('aria-label="Entregáveis da etapa"', entregaveis)

    def test_cadastro_de_evidencia_usa_select_nativo_e_rotulos_reais(self):
        fonte = Path(ui.__file__).read_text(encoding='utf-8')
        formulario = (ui.RAIZ / 'frontend/src/app/contratos/components/formulario-entregavel.tsx').read_text(encoding='utf-8')
        self.assertIn('<select id={formId(`ev-${item.chave}-tipo`)}', formulario)
        self.assertIn('<option value="Relatório">Relatório</option>', formulario)
        self.assertIn("get_by_label('Tipo de evidência *').select_option('Relatório')", fonte)
        self.assertNotIn("get_by_label('Tipo de evidência *').fill(", fonte)
        self.assertIn("get_by_label('Status da evidência Relatório')", fonte)
        self.assertIn("name='Relatório', exact=True", fonte)
        self.assertNotIn('Relatório de QA', fonte)

    def test_localizador_da_etapa_nao_usa_has_absoluto(self):
        fonte = Path(ui.__file__).read_text(encoding='utf-8')
        painel = (ui.RAIZ / 'frontend/src/app/contratos/components/painel-etapas.tsx').read_text(encoding='utf-8')
        self.assertIn('aria-label={`Abrir detalhes da etapa ${indice + 1}: ${etapa.nome}`}', painel)
        self.assertIn("cartao_etapa = abertura_etapa.locator('xpath=ancestor::li[1]')", fonte)
        self.assertIn("xpath=parent::ol", fonte)
        self.assertIn('POST da etapa retornou HTTP 201, mas o botão não apareceu na UI', fonte)
        self.assertNotIn('has=abertura_etapa)', fonte)
        self.assertNotIn('admin.reload(', fonte.split("form_etapa.get_by_role('button', name='Salvar etapa')",1)[1].split('abertura_etapa.click()',1)[0])

    def test_evidencia_portal_status_real_e_volta_pelo_cabecalho(self):
        fonte = Path(ui.__file__).read_text(encoding='utf-8')
        conteudo = (ui.RAIZ / 'frontend/src/app/contratos/components/conteudo-entregavel.tsx').read_text(encoding='utf-8')
        self.assertIn("modal_evidencia = admin.get_by_role('dialog', name='Relatório', exact=True)", fonte)
        self.assertIn("modal_evidencia.get_by_role('region', name='Detalhe da evidência esperada')", fonte)
        self.assertIn("modal_evidencia.get_by_role('button', name='Fechar evidência').click()", fonte)
        self.assertIn("modal_item.get_by_role('tab', name='Evidências', exact=True)", fonte)
        self.assertNotIn("name='← Voltar ao entregável'", fonte)
        self.assertNotIn("name='Evidências esperadas').wait_for", fonte)
        self.assertIn('rotuloFechar="Fechar evidência"', conteudo)
        self.assertIn("SEM_ENVIO: 'Aguardando envio'", (ui.RAIZ / 'frontend/src/lib/comprovantes.ts').read_text())
        self.assertIn("modal_etapa.get_by_role('button', name='Voltar às etapas').click()", fonte)

    def test_seletor_nativo_nao_deve_revalidar_sessao_global(self):
        origem = ui.RAIZ / 'frontend/src/app/components/protecao-sessao-interna.tsx'
        s = origem.read_text(encoding='utf-8')
        self.assertNotIn('window.addEventListener("focus"', s)
        self.assertIn('document.addEventListener("visibilitychange"', s)
        self.assertIn('Seletor nativo provocou revalidação global indevida', Path(ui.__file__).read_text(encoding='utf-8'))

    def test_retornar_da_evidencia_preserva_scroll_interno_no_codigo_e_qa(self):
        componente = (ui.RAIZ / 'frontend/src/app/contratos/components/conteudo-entregavel.tsx').read_text(encoding='utf-8')
        self.assertIn('useLayoutEffect(', componente)
        self.assertIn('anterior.area.scrollTop = anterior.topo', componente)
        self.assertIn('data-evidencia-esperada-id={e.id}', componente)
        self.assertIn('botao.dataset.evidenciaEsperadaId === anterior.evidenciaId', componente)
        self.assertIn('botaoAtual.focus({ preventScroll: true })', componente)
        self.assertNotIn('scrollIntoView(', componente)
        executor = Path(ui.__file__).read_text(encoding='utf-8')
        self.assertIn('posicao_interna = area_modal.evaluate', executor)
        self.assertIn('Voltar da evidência perdeu a posição interna do modal', executor)
        self.assertIn('Voltar da evidência não restaurou o foco ao botão atual', executor)


    def test_historico_do_modal_somente_restaura_apos_popstate(self):
        """Rejeita regresso da corrida history.back() x scrollRestoration."""
        fonte = (ui.RAIZ / 'frontend/src/app/contratos/components/entregaveis-da-etapa.tsx').read_text(encoding='utf-8')
        pos = fonte.index('function fecharDetalhe(pularEdicao = false)')
        bloco = fonte[pos:fonte.index('useEffect(() => {', pos)]
        self.assertIn('else window.history.back();', bloco)
        self.assertIn('} else {', bloco)
        self.assertIn('restaurar();', bloco)
        self.assertNotIn('historico.current = null;\n    setDetalheId(null);', bloco)
        self.assertIn('window.requestAnimationFrame(() => window.requestAnimationFrame(executar))', fonte)

    def test_qa_mede_scroll_depois_de_posicionar_titulo(self):
        """Evita comparar rolagem antes do auto-scroll do Playwright."""
        fonte = Path(ui.__file__).read_text(encoding='utf-8')
        self.assertRegex(fonte, r'titulo_item\.scroll_into_view_if_needed\(\)\s+posicao_entregavel = admin\.evaluate')
        self.assertIn("admin.wait_for_function('(y) => Math.abs(window.scrollY - y) <= 3'", fonte)

if __name__ == '__main__':
    unittest.main()


class TestePersistenciaRetornoV13(unittest.TestCase):
    def test_scroll_nao_e_consumido_antes_de_restaurar(self):
        raiz = Path(__file__).resolve().parents[2]
        mod = (raiz / 'frontend/src/app/contratos/components/painel-etapas.tsx').read_text()
        helper = (raiz / 'frontend/src/lib/retorno-contrato.ts').read_text()
        qa = (raiz / 'qa/tec08-03/validar_ui_real.py').read_text()
        self.assertIn('lerRetornoContrato(contratoId)', mod)
        self.assertIn('estaveis >= 30', mod)
        self.assertIn('limparRetornoContrato(contratoId)', mod)
        self.assertIn('export function lerRetornoContrato(', helper)
        self.assertIn('href_direto', qa)
        self.assertIn('HU07: URL direta preservada', qa)


class TesteVisibilidadeFiltroV13(unittest.TestCase):
    def test_verifica_quadros_ao_filtrar_documentos(self):
        origem = Path(__file__).with_name('validar_ui_real.py').read_text()
        self.assertIn('window.__qaVisibilidadeDocumento', origem)
        self.assertIn('requestAnimationFrame(medir)', origem)
        self.assertIn('amostras_ocultas == 0', origem)
