"""Contratos puros do QA real, sem simular aprovação nem substituir Playwright/Postgres."""
import unittest
from unittest.mock import patch, MagicMock, Mock
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path
import sys
from validar_fluxo_real import argumentos, conferir_db_por_api, validar_checklist_api, validar_acesso_obrigatoriedade, validar_relatorio_retomada, verificar_navegacao_leitor, validar_acl_planejamento_leitor

class ValidacaoReal(unittest.TestCase):
    contrato = '11111111-1111-4111-8111-111111111111'
    entregavel = '22222222-2222-4222-8222-222222222222'
    etapa = '33333333-3333-4333-8333-333333333333'
    responsavel = '44444444-4444-4444-8444-444444444444'

    def fixture(self):
        registro = {'id': self.entregavel, 'contratoId': self.contrato,
                    'etapaId': self.etapa, 'nome': 'QA', 'codigo': 'QA-1', 'tipo': 'UNICO',
                    'responsavelId': self.responsavel, 'evidenciasEsperadas': []}
        linha = {'id': self.entregavel, 'contrato_id': self.contrato, 'etapa_id': self.etapa,
                 'nome': 'QA', 'codigo': 'QA-1', 'tipo': 'UNICO',
                 'responsavel_id': self.responsavel, 'status_execucao': None,
                 'percentual_execucao': None, 'situacao_comprovacao': None,
                 'quantidade_realizada': None, 'auditoria_criacao': 1, 'auditoria_edicao': 1}
        return {'entregaveis': [linha], 'checklist': []}, [registro]

    def test_comparacao_sql_api_confere_responsavel_e_rastreabilidade(self):
        sql, api = self.fixture()
        conferir_db_por_api(sql, api, self.etapa)

    def test_sql_divergente_no_responsavel_reprova(self):
        sql, api = self.fixture()
        sql['entregaveis'][0]['responsavel_id'] = None
        with self.assertRaisesRegex(AssertionError, 'Responsável cadastral divergente'):
            conferir_db_por_api(sql, api, self.etapa)

    def test_nao_confunde_dados_de_planejamento_com_execucao(self):
        sql, api = self.fixture()
        sql['entregaveis'][0]['percentual_execucao'] = 100
        with self.assertRaisesRegex(AssertionError, 'execução/comprovação'):
            conferir_db_por_api(sql, api, self.etapa)

    def test_cenario_de_escrita_exige_opt_in(self):
        with patch.object(sys, 'argv', ['qa', '--contrato-id', self.contrato, '--perfil', 'administrador', '--escrita']):
            with redirect_stderr(StringIO()):
                with self.assertRaises(SystemExit) as erro:
                    argumentos()
        self.assertEqual(erro.exception.code, 2)


class TesteChecklistApi(unittest.TestCase):
    """Planejamento e comprovação são objetos distintos: lista pós-POST real."""

    def itens(self):
        return [
            {'id': '11111111-1111-4111-8111-111111111111',
             'tipoEvidencia': 'Relatório', 'obrigatoria': True},
            {'id': '22222222-2222-4222-8222-222222222222',
             'tipoEvidencia': 'Foto', 'obrigatoria': False},
        ]

    def test_dois_documentos_validos_com_obrigatoria_e_opcional(self):
        validar_checklist_api(self.itens(), pode_alterar_obrigatoriedade=True)

    def test_reprova_falta_duplicacao_tipo_incorreto_ou_obrigatoriedade(self):
        casos = [self.itens()[:1], self.itens()*2,
                 [self.itens()[0], self.itens()[0]],
                 [dict(self.itens()[0], obrigatoria=False), self.itens()[1]],
                 [self.itens()[0], dict(self.itens()[1], tipoEvidencia='Outro')]]
        for caso in casos:
            with self.subTest(caso=caso), self.assertRaises(AssertionError):
                validar_checklist_api(caso, pode_alterar_obrigatoriedade=True)


class TestePermissaoObrigatoriedade(unittest.TestCase):
    """Os dois papéis possuem capacidades diferentes mesmo com edição comum."""

    @staticmethod
    def checklist_gestor():
        return [
            {'id': '11111111-1111-4111-8111-111111111111', 'tipoEvidencia': 'Relatório', 'obrigatoria': True},
            {'id': '22222222-2222-4222-8222-222222222222', 'tipoEvidencia': 'Foto', 'obrigatoria': True},
        ]

    def test_gestor_com_edicao_nao_recebe_alterar_obrigatoriedade_implicitamente(self):
        self.assertFalse(validar_acesso_obrigatoriedade(
            {'permissoes': {'alterarObrigatoriedade': False}}, 'gestor-edicao'))
        validar_checklist_api(self.checklist_gestor(), pode_alterar_obrigatoriedade=False)

    def test_admin_pode_opcional_e_gestor_nao_pode(self):
        self.assertTrue(validar_acesso_obrigatoriedade(
            {'permissoes': {'alterarObrigatoriedade': True}}, 'administrador'))
        with self.assertRaises(AssertionError):
            validar_checklist_api(self.checklist_gestor(), pode_alterar_obrigatoriedade=True)
        with self.assertRaises(AssertionError):
            validar_checklist_api([
                self.checklist_gestor()[0],
                {**self.checklist_gestor()[1], 'obrigatoria': False},
            ], pode_alterar_obrigatoriedade=False)

    def test_sinalizacao_de_permissao_inesperada_reprova(self):
        for perfil, valor in [('administrador', False), ('gestor-edicao', True)]:
            with self.subTest(perfil=perfil), self.assertRaisesRegex(AssertionError, 'Permissão'):
                validar_acesso_obrigatoriedade({'permissoes': {'alterarObrigatoriedade': valor}}, perfil)
        with self.assertRaises(AssertionError):
            validar_acesso_obrigatoriedade({'permissoes': {}}, 'gestor-edicao')

    def test_roteiro_cobre_negacao_http_e_edicao_autorizada(self):
        fonte = (Path(__file__).resolve().parent / 'validar_fluxo_real.py').read_text()
        self.assertIn("'POST', {", fonte)
        self.assertIn("'PATCH', {'obrigatoria': False}", fonte)
        self.assertIn("get_by_role('button', name='Editar orientações')", fonte)
        self.assertIn("get_by_role('button', name='Salvar orientações')", fonte)
        self.assertIn("negada['status'] == 403", fonte)
        self.assertIn("tentativa['status'] == 403", fonte)


class TesteRetomadaSegura(unittest.TestCase):
    def test_retorna_etapa_criada_sem_criar_outra(self):
        import tempfile, json
        from pathlib import Path
        with tempfile.TemporaryDirectory() as pasta:
            p = Path(pasta) / 'falha.json'
            rel = {'status': 'REPROVADO', 'contratoId': ValidacaoReal.contrato,
                   'perfilSolicitado': 'administrador', 'entregaveisCriados': [],
                   'etapaCriada': ValidacaoReal.etapa}
            p.write_text(json.dumps(rel))
            self.assertEqual(validar_relatorio_retomada(p, ValidacaoReal.contrato, 'administrador')['etapaCriada'],
                             ValidacaoReal.etapa)

    def test_rejeita_retornar_quando_ja_existem_itens_ou_outro_contrato(self):
        import tempfile, json
        from pathlib import Path
        with tempfile.TemporaryDirectory() as pasta:
            p = Path(pasta) / 'falha.json'
            rel = {'status': 'REPROVADO', 'contratoId': ValidacaoReal.contrato,
                   'perfilSolicitado': 'administrador', 'entregaveisCriados': [{'id': ValidacaoReal.entregavel}],
                   'etapaCriada': ValidacaoReal.etapa}
            p.write_text(json.dumps(rel))
            with self.assertRaises(AssertionError):
                validar_relatorio_retomada(p, ValidacaoReal.contrato, 'administrador')
            rel['entregaveisCriados'] = []
            p.write_text(json.dumps(rel))
            with self.assertRaises(AssertionError):
                validar_relatorio_retomada(p, '44444444-4444-4444-8444-444444444444', 'administrador')

class TesteNovoFluxo(unittest.TestCase):
    """Garante que o QA não retorne ao formulário antigo com checklist embutido."""

    def test_qa_exige_cadastro_individual_de_evidencias_e_patches_proprios(self):
        from pathlib import Path
        codigo = (Path(__file__).resolve().parent / 'validar_fluxo_real.py').read_text()
        self.assertIn('cadastrar_checklist_no_detalhe(', codigo)
        self.assertIn("'/evidencias-esperadas'", codigo)
        self.assertIn('Cinco POSTs de entregáveis + dez POSTs de evidências', codigo)
        self.assertIn("page.get_by_role('dialog', name='Relatório'", codigo)
        self.assertNotIn('preencher_checklist(form', codigo)
        self.assertNotIn('verificar_checklist_maximo(form', codigo)
        self.assertIn('validar_checklist_api(evidencias, pode_alterar_obrigatoriedade=', codigo)


class TesteNavegacaoRealLeitor(unittest.TestCase):
    """Sem navegador no teste unitário; controla os nós acessíveis e a ordem das ações.

    A prova integrada continua obrigatória no Chromium; estes casos impedem
    regressão para busca de texto fora do modal ou ausência de ACL na janela aberta.
    """
    contrato = ValidacaoReal.contrato
    entregavel = ValidacaoReal.entregavel

    def preparar(self):
        page, painel = MagicMock(), MagicMock()
        abrir, modal_etapa, bloco, lista = [MagicMock() for _ in range(4)]
        modal_entregavel, link = MagicMock(), MagicMock()
        abrir.count.return_value = 1
        modal_etapa.get_attribute.return_value = 'true'
        modal_entregavel.get_attribute.return_value = 'true'
        modal_etapa.get_by_role.return_value = MagicMock()
        modal_entregavel.get_by_role.return_value = MagicMock()
        bloco.get_by_role.return_value = MagicMock()
        abrir_edicao_etapa = MagicMock()
        abrir_edicao_etapa.count.return_value = 0
        criar_entregavel = MagicMock()
        criar_entregavel.count.return_value = 0
        editar_entregavel = MagicMock()
        editar_entregavel.count.return_value = 0
        voltar_entregavel, voltar_etapa = MagicMock(), MagicMock()
        def no_modal_etapa(role, *, name=None, exact=None):
            if role == 'region' and name == 'Entregáveis da etapa': return bloco
            if role == 'button' and name == 'Editar etapa': return abrir_edicao_etapa
            if role == 'button' and name == 'Voltar às etapas': return voltar_etapa
            raise AssertionError(f'Acesso inesperado ao modal da etapa: {role}/{name}')
        def no_bloco(role, *, name=None, exact=None):
            if role == 'list' and name == 'Entregáveis planejados da etapa': return lista
            if role == 'button' and name == 'Novo entregável': return criar_entregavel
            raise AssertionError(f'Acesso inesperado no bloco: {role}/{name}')
        def no_modal_entregavel(role, *, name=None, exact=None):
            if role == 'button' and name == 'Editar entregável': return editar_entregavel
            if role == 'button' and name == 'Voltar à etapa': return voltar_entregavel
            raise AssertionError(f'Acesso inesperado no entregável: {role}/{name}')
        modal_etapa.get_by_role.side_effect = no_modal_etapa
        bloco.get_by_role.side_effect = no_bloco
        modal_entregavel.get_by_role.side_effect = no_modal_entregavel
        painel.get_by_role.return_value = abrir
        def obter_dialogo(role, *, name=None, exact=None):
            if role != 'dialog': raise AssertionError('Esperado um diálogo')
            if exact: return modal_entregavel
            return modal_etapa
        page.get_by_role.side_effect = obter_dialogo
        lista.locator.return_value = link
        link.count.return_value = 1
        link.get_attribute.return_value = 'QA Entregável Leitor'
        link.evaluate.return_value = True
        eventos=[]
        abrir.click.side_effect = lambda: eventos.append('abrir-etapa')
        link.click.side_effect = lambda: eventos.append('abrir-entregavel')
        voltar_entregavel.click.side_effect = lambda: eventos.append('voltar-entregavel')
        voltar_etapa.click.side_effect = lambda: eventos.append('voltar-etapa')
        etapa = {'nome':'QA Etapa Leitor'}
        entregavel = {'id': self.entregavel, 'nome': 'QA Entregável Leitor'}
        return (page, painel, etapa, entregavel, eventos,
                abrir, modal_etapa, lista, link, abrir_edicao_etapa, criar_entregavel,
                editar_entregavel)

    def test_gestor_e_colaborador_percorrem_modais_e_exigem_acl_em_cada_nivel(self):
        for perfil in ('gestor-leitura', 'colaborador'):
            with self.subTest(perfil=perfil):
                (page, painel, etapa, entregavel, eventos, abrir, modal, lista, link,
                 sem_editar_etapa, sem_criar, sem_editar) = self.preparar()
                saida = {'provas': []}
                verificar_navegacao_leitor(page, painel, etapa, entregavel, self.contrato, saida)
                self.assertEqual(eventos, ['abrir-etapa', 'abrir-entregavel', 'voltar-entregavel', 'voltar-etapa'])
                lista.wait_for.assert_called_once_with(state='visible', timeout=25000)
                self.assertIn('navegação contextual', saida['provas'][0])
                sem_editar_etapa.count.assert_called_once()
                sem_criar.count.assert_called_once()
                sem_editar.count.assert_called_once()
                link.evaluate.assert_called_once()
                self.assertEqual(page.get_by_text.call_count, 0)

    def test_modal_nao_aberto_ou_edicao_exposta_reprova(self):
        for falha in ('etapa-ausente', 'edicao-etapa', 'cadastro', 'edicao-entregavel'):
            with self.subTest(falha=falha):
                (page, painel, etapa, entregavel, _, abrir, _, _, _,
                 editar_etapa, criar, editar) = self.preparar()
                if falha == 'etapa-ausente': abrir.count.return_value = 0
                if falha == 'edicao-etapa': editar_etapa.count.return_value = 1
                if falha == 'cadastro': criar.count.return_value = 1
                if falha == 'edicao-entregavel': editar.count.return_value = 1
                with self.assertRaises(AssertionError):
                    verificar_navegacao_leitor(page, painel, etapa, entregavel, self.contrato, {'provas': []})

    def test_vinculo_legado_nao_pode_parecer_somente_leitura_se_delegou_edicao(self):
        chaves = ('criarEtapas', 'editarEtapas', 'reordenarEtapas',
                  'criarEntregaveis', 'editarEntregaveis', 'criarEvidencias', 'editarEvidencias')
        permitir_nada = {'permissoes': {chave: False for chave in chaves}}
        validar_acl_planejamento_leitor(permitir_nada, 'gestor-leitura')
        validar_acl_planejamento_leitor(permitir_nada, 'colaborador')
        for chave in chaves:
            with self.subTest(chave=chave):
                acesso = {'permissoes': {**permitir_nada['permissoes'], chave: True}}
                with self.assertRaisesRegex(AssertionError, chave):
                    validar_acl_planejamento_leitor(acesso, 'gestor-leitura')

    def test_link_de_entregavel_errado_reprova(self):
        page, painel, etapa, entregavel, _, _, _, _, link, _, _, _ = self.preparar()
        link.get_attribute.return_value = 'Entregável de outro contrato'
        with self.assertRaisesRegex(AssertionError, 'Nome acessível'):
            verificar_navegacao_leitor(page, painel, etapa, entregavel, self.contrato, {'provas': []})


if __name__ == '__main__':
    unittest.main()
