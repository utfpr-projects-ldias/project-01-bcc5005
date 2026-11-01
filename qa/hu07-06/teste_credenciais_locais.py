"""Regressões sem dados reais para a fonte local privada e login pelo formulário Next."""
import json
import os
from pathlib import Path
import tempfile
import unittest

from credenciais_locais import CAMINHO_PADRAO, carregar_credenciais, entrar_no_next


class CredenciaisPrivadas(unittest.TestCase):
    def test_caminho_padrao_fica_na_pasta_gitignored_do_projeto(self):
        self.assertEqual(CAMINHO_PADRAO.parent.name, '.local')
        self.assertEqual(CAMINHO_PADRAO.name, 'credenciais.json')
        ignore = CAMINHO_PADRAO.parent.parent / '.gitignore'
        self.assertIn('/.local/', ignore.read_text())

    def montar_arquivo(self, raiz: Path):
        arquivo = raiz / 'qa.json'
        conteudo = {
            'contas': {'gestor': {'email': 'qa.gestor@localhost', 'senha': 'EXEMPLO_SEM_SEGREDO'}},
            'perfis': {'gestor-leitura': 'gestor', 'gestor-edicao': 'gestor'},
        }
        arquivo.write_text(json.dumps(conteudo))
        os.chmod(arquivo, 0o600)
        return arquivo

    def test_perfis_podem_reutilizar_conta_sem_repetir_senha(self):
        with tempfile.TemporaryDirectory() as pasta:
            arq = self.montar_arquivo(Path(pasta))
            self.assertEqual(carregar_credenciais('gestor-edicao', arq),
                             carregar_credenciais('gestor-leitura', arq))

    def test_rejeita_permissoes_inseguras(self):
        with tempfile.TemporaryDirectory() as pasta:
            arq = self.montar_arquivo(Path(pasta))
            os.chmod(arq, 0o644)
            with self.assertRaisesRegex(ValueError, '0600'):
                carregar_credenciais('gestor-edicao', arq)

    def test_rejeita_perfil_sem_conta(self):
        with tempfile.TemporaryDirectory() as pasta:
            arq = self.montar_arquivo(Path(pasta))
            with self.assertRaisesRegex(ValueError, 'Conta não configurada'):
                carregar_credenciais('sem-vinculo', arq)


    def test_login_automatico_rejeita_dominio_fora_do_ambiente_local(self):
        import sys
        from unittest.mock import patch
        from contextlib import redirect_stderr
        from io import StringIO
        from validar_fluxo_real import argumentos
        args = ['qa', '--contrato-id', '11111111-1111-4111-8111-111111111111',
                '--perfil', 'administrador', '--escrita', '--confirmar-persistencia',
                '--login-automatico', '--frontend-url', 'https://dominio-externo.example']
        with patch.object(sys, 'argv', args), redirect_stderr(StringIO()):
            with self.assertRaises(SystemExit) as erro:
                argumentos()
        self.assertEqual(erro.exception.code, 2)

    def test_login_preenche_formulario_e_aguarda_dashboard(self):
        chamadas = []
        class Controle:
            def __init__(self, nome): self.nome = nome
            def fill(self, dado): chamadas.append(('preenchimento', self.nome, dado))
            def click(self): chamadas.append(('clique', self.nome))
        class Pagina:
            def get_by_label(self, nome, exact):
                self_exact = exact
                assert self_exact is True
                return Controle(nome)
            def get_by_role(self, papel, name, exact):
                assert papel == 'button' and exact is True
                return Controle(name)
            def wait_for_url(self, endereco, timeout):
                chamadas.append(('redirecionamento', endereco, timeout))
        entrar_no_next(Pagina(), 'qa@localhost', 'SENHA_TESTE_NAO_REAL')
        self.assertEqual(chamadas, [
            ('preenchimento', 'E-mail', 'qa@localhost'),
            ('preenchimento', 'Senha', 'SENHA_TESTE_NAO_REAL'),
            ('clique', 'Entrar'),
            ('redirecionamento', '**/dashboard', 30000),
        ])


if __name__ == '__main__':
    unittest.main()
