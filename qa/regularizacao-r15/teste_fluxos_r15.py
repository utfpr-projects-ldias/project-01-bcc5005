#!/usr/bin/env python3
"""Regressoes R15: contador real e erro HTTP sem timeout enganoso."""
import importlib.util
import sys
from pathlib import Path
import unittest
from unittest.mock import Mock
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'hu07-06'))
SPEC = importlib.util.spec_from_file_location('qa_hu07_r15', ROOT / 'hu07-06/validar_fluxo_real.py')
assert SPEC and SPEC.loader
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)

class TesteFluxosR15(unittest.TestCase):
    def test_http_400_nao_e_tratado_como_timeout_ou_sucesso(self):
        request = Mock(post_data_json={'nome':'Nome QA', 'peso':'12.50', 'cookie':'SEGREDO'})
        resp = Mock(status=400, request=request)
        resp.json.return_value = {'message':'Peso operacional individual deve estar entre 0 e 100'}
        with self.assertRaisesRegex(AssertionError, 'HTTP 400') as ctx:
            MOD.conferir_resposta_planejamento(resp, 'entregavel-de-teste')
        self.assertIn('Peso operacional',str(ctx.exception))
        self.assertNotIn('SEGREDO',str(ctx.exception))
        self.assertNotIn('cookie',str(ctx.exception))

    def test_http_200_reconhecido(self):
        MOD.conferir_resposta_planejamento(Mock(status=200), 'id-qa')

    def test_contador_visivel_e_rotulo_acessivel_distintos(self):
        fonte = (ROOT / 'tec08-03/validar_ui_real.py').read_text(encoding='utf-8')
        self.assertIn("get_by_text('0/1 evidências obrigatórias', exact=True)",fonte)
        self.assertIn("get_by_role('img', name='0 de 1 evidências obrigatórias verificadas'",fonte)
        self.assertNotIn("get_by_text('0/1 evidências obrigatórias verificadas'",fonte)

    def test_formulario_peso_respeita_maxlength_e_status_da_api(self):
        fonte = (ROOT / 'hu07-06/validar_fluxo_real.py').read_text(encoding='utf-8')
        self.assertIn("entrada_peso.fill('12,50')",fonte)
        self.assertIn('conferir_resposta_planejamento(evento_planejamento.value, id)',fonte)
        self.assertNotIn("fill('12.5000')", fonte)

if __name__ == '__main__':
    unittest.main(verbosity=2)
