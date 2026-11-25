#!/usr/bin/env python3
"""Garante que a fixture TEC08 não seja cortada silenciosamente pelo formulário."""
import importlib.util
from pathlib import Path
import unittest

ARQUIVO = Path(__file__).resolve().parents[1] / 'tec08-03' / 'validar_ui_real.py'
spec = importlib.util.spec_from_file_location('tec08_03_r14', ARQUIVO)
assert spec and spec.loader
modulo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(modulo)

class TesteFixturesR14(unittest.TestCase):
    def test_nome_cabe_em_42_caracteres(self):
        for identificador in ('20261121T164207Z-88e3ac', '20261119T163000Z-abcdef'):
            nome = modulo.nome_qa_entregavel(identificador)
            self.assertLessEqual(len(nome), 42)
            self.assertIn(identificador[-6:], nome)

    def test_nome_e_unico_por_execucao(self):
        self.assertNotEqual(modulo.nome_qa_entregavel('123456'), modulo.nome_qa_entregavel('abcdef'))

if __name__ == '__main__':
    unittest.main(verbosity=2)
