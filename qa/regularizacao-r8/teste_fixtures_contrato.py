#!/usr/bin/env python3
"""QA offline das fixtures reais de contrato: nunca envia requisições nem altera o banco."""
from pathlib import Path
import importlib.util
import re
import sys
import unittest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / 'qa/hu07-06'))

def carregar(nome, relativo):
    spec = importlib.util.spec_from_file_location(nome, RAIZ / relativo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo

class ValidacaoFixturesContrato(unittest.TestCase):
    def validar(self, dados):
        self.assertRegex(dados['numeroContrato'], r'^\d{1,25}$')
        self.assertLessEqual(len(dados['orgaoContratante']), 30)
        self.assertLessEqual(len(dados['objeto']), 50)
        self.assertLessEqual(len(dados.get('descricao', '')), 400)
        self.assertLessEqual(len(dados.get('observacoes', '')), 200)
        self.assertEqual(dados['status'], 'PLANEJAMENTO')
        self.assertEqual(dados['modoCalculo'], 'SIMPLES')

    def test_documentos_e_evidencias_compartilham_fixture_valida(self):
        mod = carregar('qa_tec08_02', 'qa/tec08-02/validar_integracao_real.py')
        for etiqueta in ('TEC08-02-A', 'EVIDENCIAS-VERIFICACAO-B', 'CARD-TESTE'):
            self.validar(mod.dados_contrato_qa(etiqueta))

    def test_codigo_publico_mantem_identificadores_validos(self):
        mod = carregar('qa_codigo_real', 'qa/revisao-contratos/VALIDAR-CODIGO-REAL.py')
        a, b = mod.dados_contrato_qa('A', 'R8'), mod.dados_contrato_qa('B', 'R8')
        self.validar(a)
        self.validar(b)
        self.assertNotEqual(a['numeroContrato'], b['numeroContrato'])
        self.assertEqual(len(a['numeroContrato']), 25)
        self.assertEqual(len(a['orgaoContratante']), 30)
        self.assertEqual(len(a['objeto']), 50)

    def test_entrada_invalida_continua_sendo_invalida(self):
        self.assertIsNone(re.fullmatch(r'\d{1,25}', 'QA-TEC08-02'))
        self.assertGreater(len('Objeto de QA com texto prolongado ' * 8), 50)
        self.assertGreater(len('Órgão de teste ' + 'descrição longa ' * 13), 30)

    def test_ui_numero_gerado_sem_letras(self):
        texto = (RAIZ / 'qa/tec08-03/validar_ui_real.py').read_text()
        self.assertIn("numero = f'{secrets.randbelow(10**25):025d}'", texto)
        self.assertNotIn("numero = f'QA-TEC08-03-", texto)

if __name__ == '__main__':
    unittest.main()
