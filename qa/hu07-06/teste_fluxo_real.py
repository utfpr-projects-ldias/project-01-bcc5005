"""Contratos puros do QA real, sem simular aprovação nem substituir Playwright/Postgres."""
import unittest
from unittest.mock import patch
from contextlib import redirect_stderr
from io import StringIO
import sys
from validar_fluxo_real import argumentos, conferir_db_por_api

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
