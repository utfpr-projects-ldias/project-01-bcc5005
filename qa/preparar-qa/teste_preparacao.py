import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile

PASTA = Path(__file__).resolve().parent
sys.path.insert(0, str(PASTA))

spec = importlib.util.spec_from_file_location('provisionar_funcionarios', PASTA / 'provisionar_funcionarios.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
spec2 = importlib.util.spec_from_file_location('executar_integracoes', PASTA / 'executar_integracoes.py')
runner = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(runner)


class PaginaFalsa:
    def __init__(self, existente=None):
        self.existente = existente
        self.calls = []
    def request(self, page, api, path, method='GET', body=None):
        self.calls.append((path, method, body))
        if method == 'POST':
            self.existente = {'email': body['email'], 'perfil': body['perfil'], 'ativo': True}
            return {'status': 201, 'body': {'id': 'fake'}}
        return {'status': 200, 'body': {'itens': [self.existente] if self.existente else [], 'totalPaginas': 1}}


class TesteBootstrap(unittest.TestCase):
    def test_consulta_existente_nao_muda_senha(self):
        fake = PaginaFalsa({'email': 'rinaldi3@gmail.com', 'perfil': 'GESTOR', 'ativo': True})
        with patch.object(mod, 'requisitar', fake.request):
            self.assertEqual(mod.garantir_conta(None, 'http://localhost:3001', 'Gestor de Testes', 'rinaldi3@gmail.com', 'GESTOR', 'Senha*Temporaria123'), 'existente')
        self.assertFalse(any(metodo != 'GET' for _, metodo, _ in fake.calls))

    def test_provisiona_pela_api_somente_se_ausente(self):
        fake = PaginaFalsa()
        with patch.object(mod, 'requisitar', fake.request):
            self.assertEqual(mod.garantir_conta(None, 'http://localhost:3001', 'Gestor de Testes', 'rinaldi3@gmail.com', 'GESTOR', 'Senha*Temporaria123'), 'criado')
        self.assertEqual(len([c for c in fake.calls if c[1] == 'POST']), 1)
        self.assertEqual(fake.calls[1][0], '/admin/usuarios')

    def test_inativo_ou_perfil_errado_reprovado_sem_escrita(self):
        for perfil, ativo in [('GESTOR', False), ('COLABORADOR', True)]:
            fake = PaginaFalsa({'email': 'rinaldi3@gmail.com', 'perfil': perfil, 'ativo': ativo})
            with patch.object(mod, 'requisitar', fake.request):
                with self.assertRaises(ValueError):
                    mod.garantir_conta(None, 'http://localhost:3001', 'Gestor de Testes', 'rinaldi3@gmail.com', 'GESTOR', 'Senha*Temporaria123')
            self.assertFalse(any(c[1] == 'POST' for c in fake.calls))

    def test_nunca_cria_administrador_nem_aceita_url_remota(self):
        with self.assertRaises(ValueError):
            mod.validar_conta('Pessoa de Teste', 'qa@example.com', 'ADMINISTRADOR')
        for url in ('https://example.com', 'http://localhost.evil.org', 'http://user:pass@localhost:3000', 'http://localhost:3000?secret=1'):
            with self.assertRaises(ValueError):
                mod.validar_destino(url)

    def test_alvos_padrao_sao_validos_e_distintos(self):
        usuarios = [mod.validar_conta(nome, email, perfil) for _, nome, email, perfil in mod.CONTAS_PADRAO]
        self.assertEqual(set([x[2] for x in usuarios]), {'GESTOR', 'COLABORADOR'})
        self.assertEqual(len(set(x[1] for x in usuarios)), 2)

    def test_runner_exige_confirmacao_e_outro_contrato(self):
        a = '59220449-8c96-4faa-8b03-7be436e321a7'
        with self.assertRaises(SystemExit):
            runner.opcoes(['--contrato-id', a, '--outro-contrato-id', a, '--confirmar-alteracoes'])
        with self.assertRaises(SystemExit):
            runner.opcoes(['--contrato-id', a, '--outro-contrato-id', '0dd5ffa1-ddbc-46ec-a7db-15e4e0e56a89'])

    def test_zip_whitelist_nao_copia_segredos(self):
        with tempfile.TemporaryDirectory() as t:
            d = Path(t)
            out, hu07, hu06, logs = [d / p for p in ('saida', 'hu07', 'hu06', 'logs')]
            for p in (out, hu07, hu06, logs):
                p.mkdir()
            (hu07 / 'administrador-retomado.json').write_text('{"status":"APROVADO"}')
            (hu07 / 'credenciais.json').write_text('SEGREDO-NAO-COPIAR')
            (hu07 / 'venv').mkdir()
            (hu06 / 'hu06-05-administrador.json').write_text('{"status":"APROVADO"}')
            (logs / '01-ok.log').write_text('Teste aprovado')
            arquivo = runner.zip_evidencias(out, hu07, hu06, {'statusAutomatizado':'APROVADO'}, logs)
            with ZipFile(arquivo) as z:
                nomes = z.namelist()
                conteudo = b''.join(z.read(nome) for nome in nomes)
            self.assertNotIn('hu07-06/credenciais.json', nomes)
            self.assertNotIn(b'SEGREDO-NAO-COPIAR', conteudo)
            self.assertEqual(len(nomes), 4)

    def test_relatorio_hu06_real_aprovado_sem_tipo_teste(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'hu06.json'
            p.write_text('{"status":"APROVADO","perfilSolicitado":"administrador"}')
            self.assertEqual(runner.status_json(p, hu07=False)['status'], 'APROVADO')
            with self.assertRaises(ValueError):
                runner.status_json(p)

    def test_parser_estado_nega_ambiguo(self):
        self.assertEqual(runner.estado_de_consulta('Antes: edição\nDepois: edição\n'), 'edição')
        with self.assertRaises(ValueError):
            runner.estado_de_consulta('Antes: edição\nAntes: sem vínculo\n')


if __name__ == '__main__':
    unittest.main()
