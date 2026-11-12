"""Testes de não sobrescrita, não remoção e 0600 para arquivos locais."""
import os
from pathlib import Path
import tempfile
import unittest
from migrar_qa_local import copiar_seguro

class MigracaoLocal(unittest.TestCase):
    def test_copia_idempotente_preserva_origem(self):
        with tempfile.TemporaryDirectory() as d:
            a, b = Path(d)/'origem.json', Path(d)/'destino.json'
            a.write_text('{"contas": {}}'); os.chmod(a, 0o600)
            self.assertEqual(copiar_seguro(a,b,True), 'copiado')
            self.assertEqual(copiar_seguro(a,b,True), 'já idêntico')
            self.assertTrue(a.exists())
            self.assertEqual(b.stat().st_mode & 0o777, 0o600)
    def test_conflito_nunca_sobrescreve(self):
        with tempfile.TemporaryDirectory() as d:
            a, b = Path(d)/'origem.json', Path(d)/'destino.json'
            a.write_text('primeiro'); b.write_text('segundo')
            with self.assertRaises(ValueError): copiar_seguro(a,b)
            self.assertEqual(b.read_text(), 'segundo')
    def test_recusa_segredo_com_modo_inseguro(self):
        with tempfile.TemporaryDirectory() as d:
            a, b = Path(d)/'origem.json', Path(d)/'destino.json'
            a.write_text('senha'); os.chmod(a, 0o644)
            with self.assertRaises(ValueError): copiar_seguro(a,b,True)
            self.assertFalse(b.exists())

if __name__ == '__main__': unittest.main()
