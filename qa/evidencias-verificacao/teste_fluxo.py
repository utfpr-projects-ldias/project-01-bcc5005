import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
class Regras(unittest.TestCase):
    def test_migracao_aditiva(self):
        t=(ROOT/'backend/src/database/migrations/1794100000000-ComprovantesEvidencias.ts').read_text()
        self.assertIn('CREATE TABLE "comprovantes_evidencia"',t)
        self.assertIn('UNIQUE ("id", "entregavel_id")',t)
        self.assertIn('PENDENTE_VERIFICACAO',t)
    def test_auto_verificacao_apenas_por_usuario_autorizado(self):
        t=(ROOT/'backend/src/entregaveis/evidencias-recebidas.service.ts').read_text()
        self.assertIn('verificadorAutorizado',t)
        self.assertNotIn('ultima.autorId === ator.id',t)
        self.assertIn('pessimistic_write',t)
    def test_qa_com_credenciais_privadas(self):
        t=(ROOT/'qa/evidencias-verificacao/validar_fluxo_real.py').read_text()
        self.assertIn('base.nova_sessao',t)
        self.assertNotIn('senha=',t)
        self.assertIn('base.revogar',t)
    def test_qa_verifica_permissao_granular_e_migration15(self):
        codigo=(ROOT/'qa/evidencias-verificacao/validar_fluxo_real.py').read_text(encoding='utf-8')
        self.assertIn('PermissoesGranularesContratos1794300000000',codigo)
        self.assertIn("'permissoesDetalhadas':{'alterarObrigatoriedade':True}",codigo)
        self.assertIn("'permissoesDetalhadas':{}",codigo)
        self.assertIn("{403},'GESTOR não altera obrigatoriedade sem delegação'",codigo)

if __name__=='__main__':unittest.main()
