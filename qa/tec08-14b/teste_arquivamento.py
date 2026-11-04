import unittest, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from validar_arquivamento_real import confirmar_migration, eventos

class RegrasQA(unittest.TestCase):
    def test_protege_sql_externo_de_uuid_invalido(self):
        with self.assertRaises(AssertionError): eventos("abc'; DROP TABLE usuarios")
    def test_nao_usa_credenciais_em_argumentos(self):
        from validar_arquivamento_real import main
        import inspect
        fonte=inspect.getsource(main)
        self.assertIn('--confirmar-persistencia',fonte)
        self.assertNotIn('--senha',fonte)
    def test_validacao_de_migration_explicita(self):
        import inspect
        self.assertIn('12 ArquivamentoLogicoContratos',inspect.getsource(confirmar_migration))

if __name__ == '__main__':unittest.main()
