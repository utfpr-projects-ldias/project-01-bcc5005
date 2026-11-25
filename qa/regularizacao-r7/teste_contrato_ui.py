"""Checagens de contrato entre roteiros QA de navegador e a interface atual."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]

class ContratoQAAtual(unittest.TestCase):
    def test_carteira_expoe_cadastro_pesquisa_e_modal(self):
        ui = (ROOT / 'frontend/src/app/contratos/page.tsx').read_text()
        qa = (ROOT / 'qa/revisao-contratos/VALIDAR-CODIGO-REAL.py').read_text()
        linha = (ROOT / 'frontend/src/app/contratos/components/linha-contrato.tsx').read_text()
        for termo in ('ModalNovoContrato', 'campo-busca', 'Pesquisar contrato', 'aria-label="Contratos"'):
            self.assertIn(termo, ui)
        self.assertIn('Abrir detalhes do contrato', linha)
        self.assertIn("get_by_role('searchbox', name='Pesquisar contrato')", qa)
        self.assertIn("get_by_role('dialog', name='Detalhes do contrato')", qa)

    def test_etapas_em_modal_e_qa_usando_formularios_por_pagina(self):
        ui = (ROOT / 'frontend/src/app/contratos/components/painel-etapas.tsx').read_text()
        hu07 = (ROOT / 'qa/hu07-06/validar_fluxo_real.py').read_text()
        hu06 = (ROOT / 'qa/hu06-05/validar_fluxo_real.py').read_text()
        self.assertIn('Abrir detalhes da etapa', ui)
        self.assertIn('BotaoEditarModal rotulo="Editar etapa"', ui)
        self.assertIn("page.get_by_role('form', name='Criar etapa')", hu07)
        self.assertIn('page.get_by_role("form", name="Criar etapa")', hu06)
        self.assertNotIn('get_by_role("heading", name=nome_editado', hu06)
        self.assertIn("detalhe_etapa.get_by_role('region', name='Entregáveis da etapa')", hu07)

if __name__ == '__main__':
    unittest.main()
