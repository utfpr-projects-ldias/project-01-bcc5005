from __future__ import annotations
import importlib.util
from pathlib import Path
from contextlib import redirect_stderr
import io
import tempfile
import unittest
from unittest.mock import patch

ARQ = Path(__file__).with_name('executar_tudo.py')
spec = importlib.util.spec_from_file_location('executar_tudo', ARQ)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class RunnerHU06(unittest.TestCase):
    def test_estado_fiel_dos_vinculos(self):
        for estado in ('edição', 'somente leitura', 'sem vínculo'):
            self.assertEqual(mod.ler_estado('Funcionário: teste\nAntes: '+estado+'\nDepois: '+estado+'\n'), estado)

    def test_recusa_estado_desconhecido_ou_ambiguo(self):
        for saida in ('', 'Antes: administrador', 'Antes: edição\nAntes: leitura'):
            with self.assertRaises(ValueError):
                mod.ler_estado(saida)

    def test_confirmacao_necessaria_antes_de_mutacoes(self):
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as e:
            mod.opcoes(['--contrato-id', '59220449-8c96-4faa-8b03-7be436e321a7'])
        self.assertEqual(e.exception.code, 2)

    def test_outro_contrato_nao_pode_ser_o_mesmo(self):
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as e:
            mod.opcoes(['--contrato-id','59220449-8c96-4faa-8b03-7be436e321a7',
                        '--outro-contrato-id','59220449-8c96-4faa-8b03-7be436e321a7',
                        '--confirmar-alteracoes'])
        self.assertEqual(e.exception.code, 2)

    def test_bundler_nao_copia_credenciais(self):
        with tempfile.TemporaryDirectory() as d:
            pasta = Path(d)
            (pasta / 'resumo.json').write_text('{}')
            (pasta / 'passos.log').write_text('ok')
            (pasta / 'credenciais.txt').write_text('NUNCA_INCLUIR')
            zip_file = mod.empacotar(pasta)
            from zipfile import ZipFile
            with ZipFile(zip_file) as z:
                self.assertEqual(set(z.namelist()), {'resumo.json', 'passos.log'})
                self.assertNotIn(b'NUNCA_INCLUIR', b''.join(z.read(p) for p in z.namelist()))

    def test_restaura_ambos_os_vinculos(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as pasta:
            e = mod.Executor(SimpleNamespace(contrato_id='59220449-8c96-4faa-8b03-7be436e321a7'), Path(pasta))
            e.estados = {'gestor-edicao': 'somente leitura', 'colaborador': 'sem vínculo'}
            chamadas = []
            def vinculo(perfil, modo):
                chamadas.append((perfil, modo))
                if modo == 'consultar':
                    return 'Antes: edição\n' if perfil == 'gestor-edicao' else 'Antes: somente leitura\n'
                return 'OK'
            e.vinculo = vinculo
            e.restaurar()
            self.assertIn(('gestor-edicao', 'leitura'), chamadas)
            self.assertIn(('colaborador', 'revogar'), chamadas)
            self.assertTrue(all('restaurado' in x for x in e.restauracao))

    def test_encontra_cinco_relatorios_sem_inventar_evidencia(self):
        with tempfile.TemporaryDirectory() as pasta:
            root = Path(pasta)
            dir1 = root/'relatorios'/'20261101-030821'
            dir1.mkdir(parents=True)
            nomes = ('administrador-retomado','gestor-edicao-final','gestor-leitura-final','colaborador-final','sem-vinculo-final')
            for nome in nomes:
                (dir1/(nome+'.json')).write_text('{"status":"APROVADO"}')
            with patch.object(mod,'LOCAL_HU07',root):
                localizados = mod.encontrar_hu07()
            self.assertEqual(len(localizados), 5)
            self.assertTrue(all(p.parent==dir1 for p in localizados.values()))


if __name__ == '__main__':
    unittest.main()
