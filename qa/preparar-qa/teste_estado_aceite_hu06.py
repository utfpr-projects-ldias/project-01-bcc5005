"""Exige status de HU06 coerente com o gate funcional automatizado."""
from __future__ import annotations
from contextlib import redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
from tempfile import TemporaryDirectory
from unittest import TestCase, main, mock

arquivo = Path(__file__).with_name('executar_integracoes.py')
espec = importlib.util.spec_from_file_location('qa_integrado_r37', arquivo)
modulo = importlib.util.module_from_spec(espec)
espec.loader.exec_module(modulo)


class TesteEstadoAceite(TestCase):
    def validar(self, erro: bool):
        with TemporaryDirectory() as tmp:
            saida = Path(tmp)
            qa = saida / 'hu07'; qa.mkdir()
            logs = saida / 'logs'; logs.mkdir()
            fake = SimpleNamespace(
                saida=saida, qa07=qa, logs=logs, hu06_dir=None,
                steps=[], estados={}, restauracao=[],
                executar=mock.Mock(side_effect=ValueError('Cenário negado') if erro else None),
            )
            args = SimpleNamespace(contrato_id='contrato-1', outro_contrato_id='contrato-2')
            with mock.patch.object(modulo, 'opcoes', return_value=args), \
                 mock.patch.object(modulo, 'Executor', return_value=fake), \
                 mock.patch.object(modulo, 'zip_evidencias', return_value=saida / 'evidencias.zip'), \
                 redirect_stdout(io.StringIO()):
                rc = modulo.main()
            resumo = json.loads((saida / 'resumo-geral.json').read_text())
            self.assertNotIn('PENDENTE_INSPECAO_MANUAL', json.dumps(resumo))
            return rc, resumo

    def test_sucesso_do_gate_aprova_aceite_funcional(self):
        rc, resumo = self.validar(False)
        self.assertEqual(rc, 0)
        self.assertEqual(resumo['statusAceiteGlobalHU06'], 'APROVADO_FUNCIONAL_AUTOMATIZADO')

    def test_falha_do_gate_reprova_aceite_funcional(self):
        rc, resumo = self.validar(True)
        self.assertEqual(rc, 1)
        self.assertEqual(resumo['statusAceiteGlobalHU06'], 'REPROVADO')


if __name__ == '__main__':
    main(verbosity=2)
