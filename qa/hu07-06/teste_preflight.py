"""Pré-voo somente leitura: a suíte nunca autentica nem persiste em DEV."""
import unittest
from unittest.mock import patch
from io import BytesIO
from urllib.error import HTTPError, URLError

from preflight import checar_migrations, consultar


class Preflight(unittest.TestCase):
    def test_exige_hu07_01_aplicada(self):
        ok, _ = checar_migrations('[X] 9 CriarEntregaveisEvidenciasEsperadas1793700000000')
        self.assertTrue(ok)
        ok, _ = checar_migrations('[ ] 9 CriarEntregaveisEvidenciasEsperadas1793700000000')
        self.assertFalse(ok)

    def test_detecta_qualquer_migration_pendente(self):
        texto = ('[X] 9 CriarEntregaveisEvidenciasEsperadas1793700000000\n'
                 '[ ] 10 TesteAindaNaoAplicada1793800000000')
        ok, mensagem = checar_migrations(texto)
        self.assertFalse(ok)
        self.assertIn('pendente', mensagem)

    def test_api_sem_sessao_401_indica_servidor_pronto(self):
        with patch('preflight.urlopen', side_effect=HTTPError('http://localhost/me', 401, 'unauth', {}, BytesIO())):
            self.assertEqual(consultar('http://localhost/me', {401, 403}), (True, 'HTTP 401'))

    def test_falha_de_conexao_nao_recebe_ok(self):
        with patch('preflight.urlopen', side_effect=URLError('offline')):
            ok, _ = consultar('http://localhost/me', {401, 403})
        self.assertFalse(ok)


if __name__ == '__main__':
    unittest.main()
