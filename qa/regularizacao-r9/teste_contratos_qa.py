#!/usr/bin/env python3
"""Verificações estáticas de regressão R9 (não substituem os QA reais)."""
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]

def fonte(caminho):
    return (ROOT/caminho).read_text(encoding='utf-8')

class R9ContratosQA(unittest.TestCase):
    def test_inicio_obrigatorio_em_todas_fixtures_api(self):
        for caminho in (
            'qa/tec08-modal-ux/validar_modal_real.py',
            'qa/tec08-uiux-final/validar_card_evidencia_real.py',
            'qa/evidencias-verificacao/validar_fluxo_real.py',
        ):
            conteudo=fonte(caminho)
            self.assertIn("'inicioPrevisto': '2026-11-10'",conteudo,caminho)
            self.assertIn("'peso': '1.0000'",conteudo,caminho)
        self.assertEqual(fonte('qa/evidencias-verificacao/validar_fluxo_real.py').count("'inicioPrevisto': '2026-11-10'"),2)
        self.assertEqual(fonte('qa/evidencias-verificacao/validar_fluxo_real.py').count("'peso': '1.0000'"),2)

    def test_fluxo_five_tipos_tem_prazo_e_codigo_curto(self):
        s=fonte('qa/hu07-06/validar_fluxo_real.py')
        self.assertIn('codigo = f\'Q706-{marca}-{n}\'',s)
        self.assertEqual(len('Q706-'+'A'*8+'-'+'5'),15)
        self.assertIn('inicioPrevisto',s)
        self.assertIn('terminoPrevisto',s)

    def test_modais_saida_e_retomada(self):
        for caminho in ('qa/hu06-05/validar_fluxo_real.py',
                        'qa/hu07-06/validar_fluxo_real.py',
                        'qa/tec08-02/validar_integracao_real.py'):
            self.assertIn('Sair da conta?',fonte(caminho),caminho)
        self.assertIn('Reabrir contrato suspenso?',fonte('qa/tec08-03/validar_ui_real.py'))

    def test_contrato_mobile_exige_ausencia_de_overflow(self):
        ui=fonte('frontend/src/app/contratos/[id]/page.tsx')
        qa=fonte('qa/revisao-contratos/VALIDAR-CODIGO-REAL.py')
        self.assertIn('contrato-detalhe-titulo min-w-0 break-all [overflow-wrap:anywhere]',ui)
        self.assertIn("documentElement.scrollWidth",qa)
        self.assertIn("assert medidas['documento'] <= medidas['largura'] + 2",qa)

if __name__=='__main__': unittest.main(verbosity=2)
