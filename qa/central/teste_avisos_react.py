"""Regressão do gate de console React: detecta avisos e não conta mensagens inocentes."""
import importlib.util
from pathlib import Path
import unittest

arquivo = Path(__file__).with_name('verificar_react_act.py')
espec = importlib.util.spec_from_file_location('gate_act_react', arquivo)
modulo = importlib.util.module_from_spec(espec)
espec.loader.exec_module(modulo)


class TesteAvisosReact(unittest.TestCase):
    def test_aviso_real_e_detectado(self):
        self.assertEqual(modulo.avaliar('An update to X inside a test was not wrapped in act(...).'), 1)
        self.assertEqual(modulo.avaliar('not wrapped in act(...)\nnot wrapped in act(...)'), 2)

    def test_saida_aprovada(self):
        self.assertEqual(modulo.avaliar('PASS src/app/componente.test.tsx\nTest Suites: 98 passed'), 0)

    def test_explicacao_sem_aviso_nao_reprova(self):
        self.assertEqual(modulo.avaliar('act(() => { fireEvent.click(button); });'), 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
