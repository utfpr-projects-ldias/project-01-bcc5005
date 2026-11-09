#!/usr/bin/env python3
"""Testes offline para o gate de autenticação, sem contas ou navegadores reais."""
import importlib.util
from pathlib import Path
import unittest

caminho = Path(__file__).with_name('verificar_logins.py')
espec = importlib.util.spec_from_file_location('gate_logins_tec08', caminho)
mod = importlib.util.module_from_spec(espec)
espec.loader.exec_module(mod)


class GateLogins(unittest.TestCase):
    def test_permite_so_localhost(self):
        self.assertEqual(mod.url_local('http://localhost:3000'), 'http://localhost:3000')
        self.assertEqual(mod.url_local('http://127.0.0.1:3001/'), 'http://127.0.0.1:3001')
        for url in ('https://example.com', 'http://example.com', 'http://localhost:3000/login',
                    'http://user:pass@localhost:3000', 'http://localhost:3000/?token=123'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                mod.url_local(url)

    def test_valida_dominio_e_perfil_na_resposta_autenticada(self):
        resposta = {'status': 200, 'body': {'ativo': True, 'email': 'qa@example.test', 'perfil': 'GESTOR'}}
        mod.validar_identidade(resposta, 'QA@example.test', 'GESTOR')
        for alteracao in ({'status': 401}, {'status': 200, 'body': {'ativo': False, 'email': 'qa@example.test', 'perfil': 'GESTOR'}},
                          {'status': 200, 'body': {'ativo': True, 'email': 'outro@example.test', 'perfil': 'GESTOR'}},
                          {'status': 200, 'body': {'ativo': True, 'email': 'qa@example.test', 'perfil': 'COLABORADOR'}}):
            with self.subTest(resposta=alteracao), self.assertRaises(ValueError):
                mod.validar_identidade(alteracao, 'qa@example.test', 'GESTOR')

    def test_ha_tres_perfis_distintos_necessarios(self):
        self.assertEqual(mod.CONTAS, (
            ('administrador', 'ADMINISTRADOR'),
            ('gestor-edicao', 'GESTOR'),
            ('colaborador', 'COLABORADOR'),
        ))

if __name__ == '__main__':
    unittest.main()
