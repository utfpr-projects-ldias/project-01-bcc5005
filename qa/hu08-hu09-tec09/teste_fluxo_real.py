#!/usr/bin/env python3
"""Testes determinísticos do novo validador; não acessam Docker nem serviços."""
from __future__ import annotations

from pathlib import Path
from unittest import TestCase, main, mock
import importlib.util
import sys
from uuid import uuid4
from datetime import date

MODULO = Path(__file__).with_name('validar_fluxo_real.py')
spec = importlib.util.spec_from_file_location('qa_integrado_execucao', MODULO)
assert spec and spec.loader
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)


class TesteIntegracao(TestCase):
    def _args(self, *extras):
        with mock.patch.object(sys, 'argv', ['qa', '--contrato-id', str(uuid4()), '--outro-contrato-id', str(uuid4()), *extras]):
            return qa.parametros()

    def test_fixture_cria_etapa_e_tipos_proprios_no_contrato_qa(self):
        contrato_id = str(uuid4())
        etapa_id, recorrente_id, quantitativo_id = [str(uuid4()) for _ in range(3)]
        chamadas = []

        def responder(_page, _api, rota, metodo='GET', dados=None, aceitos=(200,)):
            chamadas.append((rota, metodo, dados, aceitos))
            if metodo == 'GET':
                return {'id': contrato_id, 'status': 'PLANEJAMENTO',
                        'observacoes': 'QA código público: TESTE-A',
                        'inicioVigencia': '2026-11-01', 'terminoVigencia': '2027-10-31'}
            if rota.endswith('/etapas'):
                return {'id': etapa_id}
            if dados['tipo'] == 'RECORRENTE':
                return {'id': recorrente_id, 'etapaId': etapa_id, 'tipo': 'RECORRENTE'}
            return {'id': quantitativo_id, 'etapaId': etapa_id, 'tipo': 'QUANTITATIVO'}

        with mock.patch.object(qa, 'exigir_api', side_effect=responder):
            etapa, recorrente, quantitativo = qa.preparar_planejamento_sintetico(
                object(), 'http://localhost:3001', contrato_id, date(2026, 11, 23))
        self.assertEqual((etapa['id'], recorrente['id'], quantitativo['id']),
                         (etapa_id, recorrente_id, quantitativo_id))
        self.assertEqual([c[1] for c in chamadas], ['GET', 'POST', 'POST', 'POST'])
        self.assertEqual(chamadas[2][2]['configuracaoPeriodicidade'], {'versao': 1})
        self.assertEqual(chamadas[2][2]['periodicidade'], 'DIARIA')
        self.assertEqual(chamadas[2][2]['terminoPrevisto'], '2026-11-30')
        self.assertEqual(chamadas[3][2]['quantidadePrevista'], '20.000')
        self.assertEqual(chamadas[1][2]['terminoPrevisto'], '2026-11-30')
        self.assertEqual(chamadas[2][2]['inicioPrevisto'], '2026-11-23')
        self.assertEqual((date.fromisoformat(chamadas[2][2]['terminoPrevisto']) -
                          date.fromisoformat(chamadas[2][2]['inicioPrevisto'])).days, 7)

    def test_nao_cria_fixture_em_contrato_sem_marcador_qa(self):
        with mock.patch.object(qa, 'exigir_api', return_value={
            'observacoes': 'Contrato de produção', 'status': 'PLANEJAMENTO',
            'inicioVigencia': '2026-11-01', 'terminoVigencia': '2027-10-31',
        }) as requisicao:
            with self.assertRaisesRegex(AssertionError, 'contratos sintéticos'):
                qa.preparar_planejamento_sintetico(object(), 'http://localhost:3001', str(uuid4()), date(2026, 11, 23))
        requisicao.assert_called_once()

    def test_exige_consentimento_para_criar_dados_sinteticos(self):
        with self.assertRaises(SystemExit):
            self._args()

    def test_contrato_divergente_e_host_remoto_sao_rejeitados(self):
        id_c = str(uuid4())
        with mock.patch.object(sys, 'argv', ['qa', '--contrato-id', id_c, '--outro-contrato-id', id_c, '--confirmar-persistencia']):
            with self.assertRaises(SystemExit):
                qa.parametros()
        with mock.patch.object(sys, 'argv', ['qa', '--contrato-id', id_c, '--outro-contrato-id', str(uuid4()),
                                             '--confirmar-persistencia', '--api-url', 'http://outro-host:3001']):
            with self.assertRaises(SystemExit):
                qa.parametros()

    def test_explica_contrato_http_incorreto(self):
        class Page:
            def evaluate(self, _javascript, _args):
                return {'status': 403, 'body': {'message': 'Sem permissão'}}
        with self.assertRaisesRegex(AssertionError, 'HTTP 403'):
            qa.exigir_api(Page(), 'http://localhost:3001', '/contratos/teste/atividades', 'POST', {}, (201,))

    def test_explica_rejeicao_semanal_sem_informacoes_sensiveis(self):
        class Page:
            def evaluate(self, _javascript, _args):
                return {'status': 400, 'body': {'message':
                    'A periodicidade semanal exige períodos completos.'}}
        with self.assertRaisesRegex(AssertionError, 'HTTP 400.*períodos completos'):
            qa.exigir_api(Page(), 'http://localhost:3001',
                '/contratos/qa/entregaveis/recorrente/ocorrencias/replanejar',
                'POST', {'periodicidade': 'SEMANAL'}, (200, 201))

    def test_confere_sucesso_http_com_corpo_real(self):
        class Page:
            def evaluate(self, _javascript, args):
                self.params = args
                return {'status': 201, 'body': {'novasGeradas': 0}}
        page = Page()
        body = qa.exigir_api(page, 'http://localhost:3001', '/ocorrencias/gerar', 'POST', {'minimoAtividadesVerificadas': 1}, (201,))
        self.assertEqual(body['novasGeradas'], 0)
        self.assertEqual(page.params['metodo'], 'POST')
        self.assertEqual(page.params['dados']['minimoAtividadesVerificadas'], 1)


class TesteEstadosConcorrentes(TestCase):
    def test_reabre_pais_e_ocorrencias_na_ordem_correta(self):
        etapa_id, entregavel_id, ocorrencia_id = [str(uuid4()) for _ in range(3)]
        chamadas = []

        def api(_page, _url, rota, metodo='GET', dados=None, aceitos=(200,)):
            chamadas.append((rota, metodo, dados))
            if metodo == 'GET':
                if rota.endswith('/etapas/' + etapa_id):
                    return {'status': 'CONCLUIDA'}
                if rota.endswith('/entregaveis/' + entregavel_id):
                    return {'statusExecucao': 'CONCLUIDO'}
                if rota.endswith('/ocorrencias/' + ocorrencia_id):
                    return {'status': 'PENDENTE_CONCLUSAO'}
            if metodo == 'POST' and rota.endswith('/reabrir'):
                return {'status': 'EM_REVISAO'}
            return {'id': 'ok'}

        with mock.patch.object(qa, 'exigir_api', side_effect=api):
            resultado = qa.reabrir_contexto_de_atividade(object(), 'http://localhost:3001',
                '/contratos/qa', etapa_id, [entregavel_id], [ocorrencia_id])
        self.assertEqual(resultado, ['etapa', 'entregavel:' + entregavel_id, 'ocorrencia:' + ocorrencia_id])
        self.assertEqual([v[1] for v in chamadas], ['GET', 'PATCH', 'GET', 'PATCH', 'GET', 'POST'])
        self.assertIn('justificativa', chamadas[-1][2])

    def test_nao_reabre_pais_ja_abertos(self):
        etapa_id, entregavel_id, ocorrencia_id = [str(uuid4()) for _ in range(3)]
        chamadas = []

        def api(_page, _url, rota, metodo='GET', dados=None, aceitos=(200,)):
            chamadas.append((rota, metodo))
            if '/etapas/' in rota:
                return {'status': 'PLANEJADA'}
            if '/entregaveis/' in rota:
                return {'statusExecucao': 'EM_ANDAMENTO'}
            return {'status': 'EM_ANDAMENTO'}

        with mock.patch.object(qa, 'exigir_api', side_effect=api):
            resultado = qa.reabrir_contexto_de_atividade(object(), 'http://localhost:3001',
                '/contratos/qa', etapa_id, [entregavel_id], [ocorrencia_id])
        self.assertEqual(resultado, [])
        self.assertEqual([v[1] for v in chamadas], ['GET', 'GET', 'GET'])

    def test_rollback_sql_somente_usa_tabela_temporaria(self):
        class Processo:
            returncode = 0
            stdout = '{"falhaControlada": true, "rollback": true, "conexaoSaudavel": true}'
            stderr = ''

        with mock.patch.object(qa.subprocess, 'run', return_value=Processo()) as executar:
            resultado = qa.conferir_rollback_postgres_isolado()
        self.assertTrue(resultado['rollback'])
        cmd = executar.call_args.args[0]
        self.assertIn('CREATE TEMP TABLE qa_r32_rollback', cmd[-1])
        self.assertIn('ROLLBACK', cmd[-1])
        self.assertNotIn('DROP TABLE atividades', cmd[-1])

    def test_execucao_paralela_usa_uma_chave_idempotente(self):
        chave = str(uuid4())

        class Pagina:
            def evaluate(self, script, args):
                self.script, self.args = script, args
                return [{'status': 201, 'dados': {'id': chave}},
                        {'status': 201, 'dados': {'id': chave, 'repetido': True}}]

        p = Pagina()
        resposta = qa.lancamentos_concorrentes_mesma_operacao(
            p, 'http://localhost:3001', '/contratos/teste/ocorrencias/a/lancamentos', chave)
        self.assertEqual(len(resposta), 2)
        self.assertIn('Promise.all', p.script)
        self.assertEqual(p.args['id'], chave)
        self.assertTrue(p.args['url'].endswith('/lancamentos'))


    def test_reabertura_post_created_201_e_estado_em_revisao(self):
        """O controller POST sem @HttpCode(200) devolve 201 por padrão.

        Não basta ajustar o mock do exigir_api: exercitar o contrato HTTP real
        do helper que interpreta a resposta recebida pelo navegador.
        """
        etapa_id, entregavel_id, ocorrencia_id = [str(uuid4()) for _ in range(3)]
        requisicoes = []

        def resposta(_page, _api, rota, metodo='GET', dados=None):
            requisicoes.append((rota, metodo))
            if metodo == 'POST' and rota.endswith('/reabrir'):
                return {'status': 201, 'body': {'status': 'EM_REVISAO'}}
            if rota.endswith('/etapas/' + etapa_id):
                return {'status': 200, 'body': {'status': 'PLANEJADA'}}
            if rota.endswith('/entregaveis/' + entregavel_id):
                return {'status': 200, 'body': {'statusExecucao': 'EM_ANDAMENTO'}}
            return {'status': 200, 'body': {'status': 'PENDENTE_CONCLUSAO'}}

        with mock.patch.object(qa, 'requisitar', side_effect=resposta):
            acoes = qa.reabrir_contexto_de_atividade(object(), 'http://localhost:3001',
                '/contratos/qa', etapa_id, [entregavel_id], [ocorrencia_id])
        self.assertEqual(acoes, ['ocorrencia:' + ocorrencia_id])
        self.assertEqual(requisicoes[-1], ('/contratos/qa/ocorrencias/' + ocorrencia_id + '/reabrir', 'POST'))

    def test_reabertura_post_created_201_com_corpo_errado_nao_e_aprovada(self):
        etapa_id, entregavel_id, ocorrencia_id = [str(uuid4()) for _ in range(3)]

        def resposta(_page, _api, rota, metodo='GET', dados=None):
            if metodo == 'POST':
                return {'status': 201, 'body': {'status': 'CONCLUIDO'}}
            if rota.endswith('/etapas/' + etapa_id):
                return {'status': 200, 'body': {'status': 'PLANEJADA'}}
            if rota.endswith('/entregaveis/' + entregavel_id):
                return {'status': 200, 'body': {'statusExecucao': 'EM_ANDAMENTO'}}
            return {'status': 200, 'body': {'status': 'PENDENTE_CONCLUSAO'}}

        with mock.patch.object(qa, 'requisitar', side_effect=resposta):
            with self.assertRaisesRegex(AssertionError, 'EM_REVISAO'):
                qa.reabrir_contexto_de_atividade(object(), 'http://localhost:3001',
                    '/contratos/qa', etapa_id, [entregavel_id], [ocorrencia_id])



class TesteConclusaoRecorrenteAposReabertura(TestCase):
    """Garante que o QA respeita a revisão explícita e valida a persistência."""

    def test_em_revisao_exige_solicitacao_antes_de_aprovar(self):
        rota = '/contratos/qa/ocorrencias/ocorrencia-1'
        chamadas = []
        estado = {'status': 'EM_REVISAO', 'metaAtingida': True, 'requisitosAtendidos': True}

        def api(_page, _url, path, metodo='GET', dados=None, aceitos=(200,)):
            chamadas.append((path, metodo))
            if metodo == 'POST' and path.endswith('/solicitar-conclusao'):
                self.assertEqual(estado['status'], 'EM_REVISAO')
                estado['status'] = 'PENDENTE_CONCLUSAO'
            elif metodo == 'POST' and path.endswith('/concluir'):
                self.assertEqual(estado['status'], 'PENDENTE_CONCLUSAO')
                estado['status'] = 'CONCLUIDO'
            return dict(estado)

        with mock.patch.object(qa, 'exigir_api', side_effect=api):
            final = qa.concluir_periodo_recorrente_apos_revisao(
                object(), 'http://localhost:3001', '/contratos/qa', 'ocorrencia-1')
        self.assertEqual(final['status'], 'CONCLUIDO')
        self.assertEqual(chamadas, [
            (rota, 'GET'), (rota + '/solicitar-conclusao', 'POST'),
            (rota, 'GET'), (rota + '/concluir', 'POST'), (rota, 'GET'),
        ])

    def test_pendente_aprova_sem_repetir_solicitacao(self):
        chamadas = []
        estado = {'status': 'PENDENTE_CONCLUSAO', 'metaAtingida': True, 'requisitosAtendidos': True}

        def api(_page, _url, path, metodo='GET', dados=None, aceitos=(200,)):
            chamadas.append((path, metodo))
            if metodo == 'POST':
                estado['status'] = 'CONCLUIDO'
            return dict(estado)

        with mock.patch.object(qa, 'exigir_api', side_effect=api):
            final = qa.concluir_periodo_recorrente_apos_revisao(
                object(), 'http://localhost:3001', '/contratos/qa', 'ocorrencia-1')
        self.assertEqual(final['status'], 'CONCLUIDO')
        self.assertEqual([v[0] for v in chamadas if v[1] == 'POST'],
                         ['/contratos/qa/ocorrencias/ocorrencia-1/concluir'])

    def test_exigencias_pendentes_nao_fazem_escrita(self):
        with mock.patch.object(qa, 'exigir_api', return_value={
            'status': 'EM_REVISAO', 'metaAtingida': True, 'requisitosAtendidos': False,
        }) as api:
            with self.assertRaisesRegex(AssertionError, 'exigências'):
                qa.concluir_periodo_recorrente_apos_revisao(
                    object(), 'http://localhost:3001', '/contratos/qa', 'ocorrencia-1')
        api.assert_called_once()

    def test_estado_nao_suportado_nao_gera_aprovacao(self):
        with mock.patch.object(qa, 'exigir_api', return_value={
            'status': 'ENCERRADA', 'metaAtingida': True, 'requisitosAtendidos': True,
        }) as api:
            with self.assertRaisesRegex(AssertionError, 'inesperado'):
                qa.concluir_periodo_recorrente_apos_revisao(
                    object(), 'http://localhost:3001', '/contratos/qa', 'ocorrencia-1')
        api.assert_called_once()

    def test_solicitacao_sem_persistencia_nao_aprova(self):
        calls = []
        def api(_page, _url, path, metodo='GET', dados=None, aceitos=(200,)):
            calls.append((path, metodo))
            if metodo == 'POST':
                return {'status': 'PENDENTE_CONCLUSAO'}
            return {'status': 'EM_REVISAO', 'metaAtingida': True, 'requisitosAtendidos': True}
        with mock.patch.object(qa, 'exigir_api', side_effect=api):
            with self.assertRaisesRegex(AssertionError, 'não persistiu'):
                qa.concluir_periodo_recorrente_apos_revisao(
                    object(), 'http://localhost:3001', '/contratos/qa', 'ocorrencia-1')
        self.assertFalse(any(path.endswith('/concluir') for path, _ in calls))


if __name__ == '__main__':
    main(verbosity=2)
