#!/usr/bin/env python3
"""Regressões offline do QA de persistência: nunca acessa Docker real."""
import importlib.util
import contextlib
import io
from pathlib import Path
from unittest import TestCase, main, mock

caminho = Path(__file__).with_name('validar_persistencia_reinicio.py')
espec = importlib.util.spec_from_file_location('persistencia_tec08', caminho)
mod = importlib.util.module_from_spec(espec)
espec.loader.exec_module(mod)


def documento():
    return {'id': '12345678-1234-1234-1234-123456789abc',
            'sha256': 'a' * 64, 'tamanho': 18, 'categoria': 'ANEXO'}


class PersistenciaTEC08Testes(TestCase):
    def test_executar_exige_confirmacao_explicita(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as cm:
            mod.configurar_args(['--executar'])
        self.assertEqual(cm.exception.code, 2)
        args = mod.configurar_args(['--executar', '--confirmar-reinicio'])
        self.assertTrue(args.executar)

    def test_verificar_nao_exige_confirmacao(self):
        args = mod.configurar_args(['--verificar'])
        self.assertTrue(args.verificar)

    def test_rejeita_uuid_que_nao_pode_ser_parametrizado(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            mod.configurar_args(['--verificar', '--documento', "1'; DROP TABLE documentos_contratuais;--"])

    def test_query_e_read_only_sem_mutacao(self):
        self.assertIn('BEGIN READ ONLY', mod.SNAPSHOT_JS)
        self.assertIn('WHERE id=$1::uuid', mod.SNAPSHOT_JS)
        self.assertIn('O_NOFOLLOW', mod.SNAPSHOT_JS)
        self.assertNotIn('DELETE FROM', mod.SNAPSHOT_JS)
        self.assertNotIn('DROP TABLE', mod.SNAPSHOT_JS)
        self.assertNotIn('storageKey:', mod.SNAPSHOT_JS)

    def test_obter_snapshot_valida_id_sha_e_tamanho(self):
        with mock.patch.object(mod, 'executar', return_value=__import__('json').dumps(documento())) as executor:
            self.assertEqual(mod.obter_snapshot()['tamanho'], 18)
            self.assertEqual(executor.call_args.args[0][-1], 'AUTO')
        with mock.patch.object(mod, 'executar', return_value=__import__('json').dumps({**documento(), 'sha256': 'invalido'})):
            with self.assertRaises(RuntimeError):
                mod.obter_snapshot()

    def test_compara_metadados_e_detecta_diferenca(self):
        antes = documento()
        mod.comparar_snapshots(antes, dict(antes))
        with self.assertRaisesRegex(RuntimeError, 'tamanho'):
            mod.comparar_snapshots(antes, {**antes, 'tamanho': 19})

    def test_modo_verificar_nunca_reinicia(self):
        with mock.patch.object(mod, 'confirmar_contexto'), mock.patch.object(mod, 'obter_snapshot', return_value=documento()), \
             mock.patch.object(mod, 'executar') as executor:
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(mod.main(['--verificar']), 0)
            executor.assert_not_called()

    def test_modo_executar_reinicia_somente_dois_servicos(self):
        with mock.patch.object(mod, 'confirmar_contexto'), mock.patch.object(mod, 'obter_snapshot', return_value=documento()), \
             mock.patch.object(mod, 'executar') as executor, mock.patch.object(mod, 'aguardar_servicos'):
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(mod.main(['--executar', '--confirmar-reinicio']), 0)
            executor.assert_called_once_with(['docker', 'compose', 'restart', 'backend', 'frontend'], timeout=120)

    def test_reiniciar_falhando_reprova_sem_mascarar(self):
        with mock.patch.object(mod, 'confirmar_contexto'), mock.patch.object(mod, 'obter_snapshot', return_value=documento()), \
             mock.patch.object(mod, 'executar', side_effect=RuntimeError('Docker indisponível')):
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(mod.main(['--executar', '--confirmar-reinicio']), 1)


if __name__ == '__main__':
    main()
