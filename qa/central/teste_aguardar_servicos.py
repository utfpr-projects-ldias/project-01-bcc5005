"""Prontidão HTTP sem rede nem Docker: resposta real simulada e prazo expirado."""
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import URLError
import aguardar_servicos as prontidao


class TesteProntidao(unittest.TestCase):
    def test_repetir_apos_falha_e_aceitar_http(self):
        resposta = MagicMock()
        resposta.__enter__.return_value.status = 200
        with patch.object(prontidao, 'urlopen', side_effect=[URLError('indisponível'), resposta]) as abrir, patch.object(prontidao.time, 'sleep') as esperar:
            prontidao.aguardar('http://local.invalid', timeout=5)
        self.assertEqual(abrir.call_count, 2)
        esperar.assert_called_once_with(2)

    def test_timeout_nao_simula_sucesso(self):
        with patch.object(prontidao.time, 'monotonic', side_effect=[0, 0, 2]), patch.object(prontidao.time, 'sleep'), patch.object(prontidao, 'urlopen', side_effect=URLError('fora')):
            with self.assertRaisesRegex(RuntimeError, 'Serviço indisponível'):
                prontidao.aguardar('http://local.invalid', timeout=1)


if __name__ == '__main__':
    unittest.main()
