"""Contratos puros do QA real, sem simular aprovação nem substituir Playwright/Postgres."""
import unittest
from unittest.mock import patch
from contextlib import redirect_stderr
from io import StringIO
import sys
from validar_fluxo_real import argumentos, conferir_db_por_api, validar_transicoes_refresh, validar_relatorio_retomada

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

if __name__ == '__main__':
    unittest.main()


class TesteRefreshReal(unittest.TestCase):
    def test_transicao_de_650ms_e_provada_pelo_dom(self):
        eventos = [
            {'t': 100, 'ocupado': False, 'desabilitado': False},
            {'t': 104, 'ocupado': True, 'desabilitado': True},
            {'t': 762, 'ocupado': False, 'desabilitado': False},
        ]
        self.assertEqual(round(validar_transicoes_refresh(eventos)), 658)

    def test_nao_aceita_loading_inexistente_nem_rapido(self):
        with self.assertRaises(AssertionError):
            validar_transicoes_refresh([{'t': 0, 'ocupado': False, 'desabilitado': False}])
        with self.assertRaises(AssertionError):
            validar_transicoes_refresh([{'t': 0, 'ocupado': True, 'desabilitado': True},
                                            {'t': 100, 'ocupado': False, 'desabilitado': False}])


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

class TesteChecklistDezItens(unittest.TestCase):
    """Regressão do strict mode: rótulos 1 e 10 não devem ser confundidos."""

    def test_remover_indice_um_com_dez_botoes_requer_nome_exato(self):
        import re
        from validar_fluxo_real import verificar_checklist_maximo

        class BotaoAdicionar:
            def __init__(self, formulario):
                self.formulario = formulario
            def click(self):
                if self.formulario.quantidade >= 10:
                    raise AssertionError('Adição ultrapassou o limite de dez')
                self.formulario.quantidade += 1
            def is_disabled(self):
                return self.formulario.quantidade == 10
            def is_enabled(self):
                return self.formulario.quantidade < 10

        class BotaoRemover:
            def __init__(self, formulario):
                self.formulario = formulario
            def click(self):
                if self.formulario.quantidade < 1:
                    raise AssertionError('Tentou remover item inexistente')
                self.formulario.quantidade -= 1

        class ColecaoRemover:
            def __init__(self, formulario):
                self.formulario = formulario
            def count(self):
                return self.formulario.quantidade

        class FormularioSimulado:
            def __init__(self):
                self.quantidade = 0
                self.buscas_exatas = 0
            def get_by_role(self, role, *, name, exact=False):
                if role != 'button':
                    raise AssertionError('Ação inesperada')
                if isinstance(name, re.Pattern):
                    if name.search('Adicionar evidência esperada'):
                        return BotaoAdicionar(self)
                    if name.search('Remover evidência esperada'):
                        return ColecaoRemover(self)
                if name == 'Remover evidência esperada 1':
                    # Quando há 10 itens, a busca parcial também acha o índice 10.
                    if not exact and self.quantidade == 10:
                        raise AssertionError('Playwright strict mode: índices 1 e 10 ambíguos')
                    self.buscas_exatas += int(exact)
                    return BotaoRemover(self)
                raise AssertionError(f'Nome não reconhecido: {name!r}')

        formulario = FormularioSimulado()
        resultado = {'provas': []}
        verificar_checklist_maximo(formulario, resultado)
        self.assertEqual(formulario.quantidade, 0)
        self.assertEqual(formulario.buscas_exatas, 10)
        self.assertEqual(len(resultado['provas']), 1)
        self.assertIn('limite de 10', resultado['provas'][0])
