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
        self.assertIn('Comprovação ainda não acompanhada', fonte)
        self.assertIn('HU07: etapa/entregável criados por UI', fonte)
        componente = ui.RAIZ / 'frontend/src/app/contratos/components/entregaveis-da-etapa.tsx'
        self.assertIn('__modalEntregavel', componente.read_text(encoding='utf-8'))

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
