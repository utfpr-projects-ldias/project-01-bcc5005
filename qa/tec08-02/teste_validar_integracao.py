"""Autotestes offline do executor: não criam contratos, documentos nem vínculos."""
import contextlib
from io import StringIO
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

import validar_integracao_real as qa

UUID_A = '11111111-1111-4111-8111-111111111111'
UUID_B = '22222222-2222-4222-8222-222222222222'


class RegrasDoExecutor(unittest.TestCase):
    def test_uuid_exige_v4(self):
        self.assertTrue(qa.uuid_ok(UUID_A))
        self.assertFalse(qa.uuid_ok('00000000-0000-0000-0000-000000000000'))
        self.assertFalse(qa.uuid_ok('not-an-uuid'))

    def test_sem_optin_nao_permite_escrita(self):
        with patch.object(sys, 'argv', ['qa', '--executar']), contextlib.redirect_stderr(StringIO()):
            with self.assertRaises(SystemExit) as e:
                qa.argumento()
        self.assertEqual(e.exception.code, 2)

    def test_leitura_sem_optin_permitida(self):
        with patch.object(sys, 'argv', ['qa', '--verificar']):
            self.assertTrue(qa.argumento().verificar)

    def test_caminho_api_deriva_do_uuid_validado(self):
        self.assertEqual(qa.documento_base(UUID_A), '/contratos/' + UUID_A + '/documentos')
        with self.assertRaises(AssertionError):
            qa.documento_base('../invalid')

    def test_comparacao_sql_auditoria_valida(self):
        conteudo = qa.ARQ
        esperado = {UUID_A: {'contrato': UUID_B, 'autor': UUID_A, 'bytes': conteudo}}
        linha = {'id': UUID_A, 'contrato_id': UUID_B, 'autor_id': UUID_A,
                 'categoria': 'ANEXO', 'tipo_mime': 'text/plain', 'tamanho': len(conteudo),
                 'sha256': __import__('hashlib').sha256(conteudo).hexdigest(),
                 'eventos_total': 1, 'eventos_corretos': 1}
        qa.conferir_sql([linha], esperado)

    def test_sql_sem_auditoria_reprova(self):
        esperado = {UUID_A: {'contrato': UUID_B, 'autor': UUID_A, 'bytes': qa.ARQ}}
        linha = {'id': UUID_A, 'contrato_id': UUID_B, 'autor_id': UUID_A,
                 'categoria': 'ANEXO', 'tipo_mime': 'text/plain', 'tamanho': len(qa.ARQ),
                 'sha256': __import__('hashlib').sha256(qa.ARQ).hexdigest(),
                 'eventos_total': 1, 'eventos_corretos': 0}
        with self.assertRaisesRegex(AssertionError, 'Auditoria'):
            qa.conferir_sql([linha], esperado)

    def test_sql_hash_invalido_reprova(self):
        esperado = {UUID_A: {'contrato': UUID_B, 'autor': UUID_A, 'bytes': qa.ARQ}}
        linha = {'id': UUID_A, 'contrato_id': UUID_B, 'autor_id': UUID_A,
                 'categoria': 'ANEXO', 'tipo_mime': 'text/plain', 'tamanho': len(qa.ARQ),
                 'sha256': '0'*64, 'eventos_total': 1, 'eventos_corretos': 1}
        with self.assertRaisesRegex(AssertionError, 'sha256'):
            qa.conferir_sql([linha], esperado)

    def test_status_diferente_de_esperado_bloqueia(self):
        qa.aceitar(404, {403, 404}, 'Negação')
        with self.assertRaises(AssertionError):
            qa.aceitar(200, {403, 404}, 'Falha de autorização')

    def test_arquivo_sintetico_utf8(self):
        self.assertTrue(qa.ARQ.decode('utf8').startswith('QA-TEC08-02'))
        self.assertNotEqual(qa.ARQ, qa.ARQ_GESTOR)


class ResilienciaPreflight(unittest.TestCase):
    class Resposta:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *args): return False

    def test_reinicializacao_reseta_conexao_e_depois_recupera(self):
        with patch.object(qa, 'urlopen', side_effect=[ConnectionResetError(104, 'Reset'), self.Resposta()]) as abrir, \
             patch.object(qa.time, 'sleep') as dormir, contextlib.redirect_stdout(StringIO()):
            status = qa.aguardar_http('Nest', 'http://localhost:3001/', {200}, limite_segundos=5)
        self.assertEqual(status, 200)
        self.assertEqual(abrir.call_count, 2)
        dormir.assert_called_once()

    def test_reinicializacao_connection_refused_e_recupera(self):
        with patch.object(qa, 'urlopen', side_effect=[ConnectionRefusedError(111, 'Refused'), self.Resposta()]), \
             patch.object(qa.time, 'sleep'), contextlib.redirect_stdout(StringIO()):
            self.assertEqual(qa.aguardar_http('Nest', 'http://localhost:3001/', {200}, limite_segundos=5), 200)

    def test_401_e_sucesso_para_endpoint_protegido(self):
        erro = HTTPError('http://localhost:3001/', 401, 'Unauthorized', {}, None)
        with patch.object(qa, 'urlopen', side_effect=erro):
            self.assertEqual(qa.aguardar_http('Protegido', 'http://localhost:3001/', {401}), 401)

    def test_200_em_endpoint_que_exige_401_reprova(self):
        with patch.object(qa, 'urlopen', return_value=self.Resposta()):
            with self.assertRaisesRegex(AssertionError, 'HTTP 200'):
                qa.aguardar_http('Protegido', 'http://localhost:3001/', {401})

    def test_falha_permanente_tem_limite(self):
        with patch.object(qa, 'urlopen', side_effect=ConnectionResetError(104, 'Reset')), \
             patch.object(qa.time, 'monotonic', side_effect=[0, 3]), \
             contextlib.redirect_stdout(StringIO()):
            with self.assertRaisesRegex(AssertionError, 'indisponível após'):
                qa.aguardar_http('Nest', 'http://localhost:3001/', {200}, limite_segundos=2)

    def test_resposta_503_e_transitoria(self):
        unavailable = HTTPError('http://localhost:3001/', 503, 'Not Ready', {}, None)
        with patch.object(qa, 'urlopen', side_effect=[unavailable, self.Resposta()]), \
             patch.object(qa.time, 'sleep') as dormir, contextlib.redirect_stdout(StringIO()):
            self.assertEqual(qa.aguardar_http('Nest', 'http://localhost:3001/', {200}, limite_segundos=5), 200)
        dormir.assert_called_once()


if __name__ == '__main__':
    unittest.main()
