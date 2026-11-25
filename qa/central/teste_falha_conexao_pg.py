from __future__ import annotations
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from types import SimpleNamespace

ARQ = Path(__file__).with_name('validar_falha_conexao_pg.py')
spec=importlib.util.spec_from_file_location('qa_falha_pg',ARQ)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class BancoIsolado(unittest.TestCase):
    def test_recusa_bancos_reais_e_nomes_estranhos(self):
        for nome in ('postgres','integrador','pi_1001','pi_0101010101_falha_conexao; DROP DATABASE postgres',
                     'pi_0101010101_hu07_test','pi_0101010101_falha_conexao/'): 
            with self.assertRaises(ValueError):mod.executar(nome)

    @patch.object(mod.subprocess,'run')
    def test_prova_rollback_e_reconexao(self,run):
        run.return_value=SimpleNamespace(returncode=0,stdout='{"bancoIsolado": true, "conexaoTerminada": true, "rollback": true, "reconexao": true}',stderr='')
        esperado=mod.executar('pi_1123213859_falha_conexao')
        self.assertTrue(all(esperado.values()))
        self.assertIn('QA_DB_NAME=pi_1123213859_falha_conexao',run.call_args.args[0])
        self.assertIn('qa_r36_transacao_abortada',run.call_args.args[0][-1])

    @patch.object(mod.subprocess,'run')
    def test_reprova_sem_rollback(self,run):
        run.return_value=SimpleNamespace(returncode=0,stdout='{"bancoIsolado": true, "conexaoTerminada": true, "rollback": false, "reconexao": true}',stderr='')
        with self.assertRaisesRegex(AssertionError,'sem prova'):mod.executar('pi_1123213859_falha_conexao')

if __name__=='__main__':unittest.main()
