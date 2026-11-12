import unittest
from pathlib import Path
R = Path(__file__).resolve().parents[2]

class RegrasArquivoEUX(unittest.TestCase):
    def ler(self, caminho): return (R / caminho).read_text(encoding='utf-8')

    def test_migracao_14_somente_aditiva_e_sem_cascade(self):
        ddl = self.ler('backend/src/database/migrations/1794200000000-ArquivamentoPlanejamento.ts')
        self.assertIn('ADD COLUMN "arquivado_em"', ddl)
        self.assertIn('ADD COLUMN "arquivado_por"', ddl)
        self.assertIn('ON DELETE RESTRICT', ddl)
        self.assertNotIn('CASCADE', ddl)

    def test_nao_remove_evidencias_fisicamente(self):
        s = self.ler('backend/src/entregaveis/entregaveis.service.ts')
        self.assertNotIn('await repo.delete({ id: item.id', s)
        self.assertIn('Utilize o arquivamento individual', s)

    def test_autorizacao_real_em_cada_endpoint(self):
        for caminho in ('backend/src/entregaveis/entregaveis.controller.ts',
                        'backend/src/entregaveis/evidencias-recebidas.controller.ts'):
            t = self.ler(caminho)
            self.assertIn('@ExigirPoliticaOperacional', t)
            self.assertIn("@Patch(':entregavelId/arquivar')" if 'entregaveis.controller' in caminho
                          else "@Patch(':esperadaId/arquivar')", t)

    def test_ui_individual_e_arquivo_em_portugues(self):
        t = self.ler('frontend/src/app/contratos/components/painel-comprovacao-evidencia.tsx')
        for texto in ('Selecionar arquivo', 'Nenhum arquivo selecionado', 'Substituir comprovante',
                      'Arquivar evidência', 'Confirmar arquivamento'):
            self.assertIn(texto, t)
        self.assertNotIn('Browse...', t)

    def test_aninhamento_e_archivados_reais(self):
        t = self.ler('frontend/src/app/contratos/components/modal-detalhe-entregavel.tsx')
        self.assertIn('voltarEdicaoEvidencia.current', t)
        self.assertIn('voltarEvidencia.current', t)
        self.assertIn('window.history.back()', t)
        self.assertIn('textoFechar=', t)
        a = self.ler('frontend/src/app/contratos/components/entregaveis-da-etapa.tsx')
        self.assertIn('listarEntregaveisArquivados', a)
        self.assertIn('alterarArquivoEntregavel', a)

    def test_qa_real_exercita_retorno_e_arquivamento(self):
        qa = self.ler('qa/evidencias-verificacao/validar_fluxo_real.py')
        self.assertIn("'Migration 14 de arquivamento", qa)
        # O fluxo foi atualizado: cancelamento/volta pela ação da UI e Escape,
        # em vez de acionar history.back() diretamente no navegador.
        self.assertIn("editor.get_by_role('button',name='Cancelar edição do arquivo').click()", qa)
        self.assertIn("gestor.keyboard.press('Escape')", qa)
        self.assertIn("modal_etapa.get_by_role('button',name='Voltar às etapas').click()", qa)
        self.assertIn("base.api(admin,caminho_e2+'/arquivar','PATCH')", qa)
        self.assertIn("'Evidência verificada deve bloquear arquivamento sem reabertura'", qa)
        self.assertIn("'Entregável concluído deve bloquear arquivamento sem reabertura'", qa)
        self.assertIn("base.api(admin,caminho_arquivo+'/arquivar','PATCH')", qa)
        self.assertIn("f'/contratos/{contrato_b}/entregaveis'", qa)
        self.assertIn("raiz_entrega+'/reativar'", qa)
        self.assertNotIn("base.aceitar(base.api(admin,caminho_e2+'/arquivar','PATCH')['status'],{200}", qa)

if __name__ == '__main__': unittest.main()
