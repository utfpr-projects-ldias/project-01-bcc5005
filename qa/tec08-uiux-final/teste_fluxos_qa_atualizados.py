"""Regressões dos contratos de interação de UI dos três QAs Chromium.

Executáveis sem navegador, banco ou credenciais:
  python3 -m unittest discover -s qa/tec08-uiux-final -p 'teste_fluxos_qa_atualizados.py'
"""
from pathlib import Path
import unittest

from fluxos_qa_atualizados import anexar_primeiro_comprovante


class FalsoFormulario:
    def __init__(self, acoes):
        self.acoes = acoes
        self.visivel = False

    def count(self):
        return int(self.visivel)

    def wait_for(self, *, state='visible', timeout):
        self.acoes.append(('form.wait_for', state))
        if state == 'visible':
            assert self.visivel
        if state == 'hidden':
            assert not self.visivel

    def get_by_text(self, nome, exact):
        assert exact and nome == 'qa-uiux.txt'
        self.acoes.append(('nome', nome))
        return self

    def get_by_role(self, tipo, name, exact):
        assert (tipo, name, exact) == ('button', 'Anexar', True)
        return self

    def click(self):
        self.acoes.append(('anexar', None))
        self.visivel = False


class FalsoSeletor:
    def __init__(self, form, acoes, existe=True):
        self.form, self.acoes, self.existe = form, acoes, existe

    def count(self):
        return int(self.existe)

    def set_input_files(self, arquivo):
        self.acoes.append(('selecionar', arquivo['name']))
        assert arquivo['mimeType'] == 'text/plain'
        assert arquivo['buffer'] == b'QA sintetico - estado pendente'
        self.form.visivel = True


class FalsoModal:
    def __init__(self, *, existe=True, form_visivel=False):
        self.acoes=[]
        self.form=FalsoFormulario(self.acoes)
        self.form.visivel=form_visivel
        self.seletor=FalsoSeletor(self.form, self.acoes, existe=existe)

    def locator(self, css):
        assert css == 'input[type="file"][aria-label="Selecionar arquivo"]'
        return self.seletor

    def get_by_role(self, tipo, name):
        assert (tipo, name)==('form', 'Anexar comprovante')
        return self.form


class FluxosQa(unittest.TestCase):
    def test_upload_seleciona_antes_de_mostrar_confirmacao(self):
        modal=FalsoModal()
        anexar_primeiro_comprovante(modal, nome='qa-uiux.txt', conteudo=b'QA sintetico - estado pendente')
        self.assertEqual([x[0] for x in modal.acoes],
                         ['selecionar','form.wait_for','nome','form.wait_for','anexar','form.wait_for'])

    def test_input_inexistente_falha_sem_mutacao(self):
        modal=FalsoModal(existe=False)
        with self.assertRaisesRegex(AssertionError,'Input de arquivo'):
            anexar_primeiro_comprovante(modal, nome='qa-uiux.txt', conteudo=b'QA sintetico - estado pendente')
        self.assertEqual(modal.acoes, [])

    def test_form_previamente_visivel_nao_e_fluxo_atual(self):
        modal=FalsoModal(form_visivel=True)
        with self.assertRaisesRegex(AssertionError,'antes da seleção'):
            anexar_primeiro_comprovante(modal, nome='qa-uiux.txt', conteudo=b'QA sintetico - estado pendente')
        self.assertEqual(modal.acoes, [])

    def test_tres_roteiros_nao_usam_estruturas_obsoletas(self):
        raiz=Path(__file__).resolve().parents[2]
        scripts=[raiz/'qa/evidencias-verificacao/validar_fluxo_real.py',
                 raiz/'qa/tec08-modal-ux/validar_modal_real.py',
                 raiz/'qa/tec08-uiux-final/validar_card_evidencia_real.py']
        for caminho in scripts:
            texto=caminho.read_text(encoding='utf-8')
            compile(texto, str(caminho), 'exec')
            self.assertNotIn("get_by_role('form', name='Anexar comprovante')\n            upload.locator",texto)
        eu=scripts[0].read_text(encoding='utf-8')
        self.assertIn("name='Cancelar edição do arquivo'",eu)
        ux=scripts[1].read_text(encoding='utf-8')
        self.assertIn('botao_etapa.wait_for',ux)
        card=scripts[2].read_text(encoding='utf-8')
        self.assertIn('anexar_primeiro_comprovante(',card)


if __name__ == '__main__':
    unittest.main()
