"""Sem API real; regressões do mecanismo de escolha pelo e-mail exato."""
import sys
import unittest
from contextlib import redirect_stderr
from io import StringIO
from unittest.mock import patch
from ajustar_vinculo_qa import argumentos, selecionar_funcionario, destino_valido

ID = '11111111-1111-4111-8111-111111111111'


class Vinculos(unittest.TestCase):
    def test_seleciona_somente_email_exato_sem_capturar_similares(self):
        dados = {'status': 200, 'body': {'itens': [
            {'id': ID, 'email': 'qa-gestor@empresa.test', 'ativo': True, 'perfil': 'GESTOR'},
            {'id': '22222222-2222-4222-8222-222222222222', 'email': 'gestor@empresa.test', 'ativo': True, 'perfil': 'GESTOR'},
        ]}}
        self.assertEqual(selecionar_funcionario(dados, 'gestor@empresa.test')['email'], 'gestor@empresa.test')

    def test_rejeita_admin_inativo_ou_inexistente(self):
        for user in ({'id': ID, 'email': 'u@empresa.test', 'ativo': True, 'perfil': 'ADMINISTRADOR'},
                     {'id': ID, 'email': 'u@empresa.test', 'ativo': False, 'perfil': 'COLABORADOR'}):
            with self.assertRaises(ValueError):
                selecionar_funcionario({'status': 200, 'body': {'itens': [user]}}, 'u@empresa.test')
        with self.assertRaises(ValueError):
            selecionar_funcionario({'status': 200, 'body': {'itens': []}}, 'u@empresa.test')

    def test_sem_confirmacao_nao_muda_vinculos(self):
        argumentos_qa = ['qa', '--contrato-id', ID, '--email', 'u@empresa.test', '--modo', 'revogar']
        with patch.object(sys, 'argv', argumentos_qa), redirect_stderr(StringIO()):
            with self.assertRaises(SystemExit) as erro:
                argumentos()
        self.assertEqual(erro.exception.code, 2)

    def test_apenas_localhost_sem_creds_na_url(self):
        self.assertTrue(destino_valido('http://localhost:3000'))
        for url in ('https://empresa.test', 'http://publico.test:3000', 'http://localhost:3000/?senha=x', 'http://u:senha@localhost:3000'):
            self.assertFalse(destino_valido(url))


if __name__ == '__main__':
    unittest.main()
