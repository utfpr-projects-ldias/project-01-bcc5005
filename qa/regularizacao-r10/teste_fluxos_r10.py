#!/usr/bin/env python3
"""Regressões estáticas R10; o executor global também roda o QA real Chromium."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


def fonte(caminho: str) -> str:
    return (ROOT / caminho).read_text(encoding='utf-8')


class TesteR10(unittest.TestCase):
    def test_acoes_contrato_mobile_nao_impedem_quebra(self):
        pagina = fonte('frontend/src/app/contratos/[id]/page.tsx')
        self.assertIn('w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0" aria-label="Ações do contrato"', pagina)
        self.assertNotIn('className="flex shrink-0 flex-wrap items-center gap-2" aria-label="Ações do contrato"', pagina)

    def test_cartao_abre_consulta_sem_ativar_edicao_por_permissao(self):
        pagina = fonte('frontend/src/app/contratos/components/conteudo-entregavel.tsx')
        self.assertNotIn('setEditarEvidenciaAberta', pagina)
        self.assertIn('podeEditar={planejamentoHabilitado && podeEditarEsperada && integridadeDetalhe', pagina)
        comprovante = fonte('frontend/src/app/contratos/components/painel-comprovacao-evidencia.tsx')
        self.assertIn('podeEnviar && contextoPermiteAlterar', comprovante)
        self.assertIn('podeEditar && contextoPermiteAlterar && !somenteLeitura', comprovante)

    def test_documentos_baixados_pelo_detalhe_sem_ignorar_checksum(self):
        roteiro = fonte('qa/tec08-03/validar_ui_real.py')
        painel = fonte('frontend/src/app/contratos/components/painel-documentos.tsx')
        self.assertIn("name=f'Ver detalhes de {nome}', exact=True", roteiro)
        self.assertIn("name='Baixar arquivo', exact=True", roteiro)
        self.assertIn("with page.expect_download(timeout=30000)", roteiro)
        self.assertIn('hashlib.sha256(arquivo.read_bytes()).digest()', roteiro)
        self.assertIn("detalhe.wait_for(state='hidden', timeout=15000)", roteiro)
        self.assertIn('aria-label={`Ver detalhes de ${documento.nomeOriginal}`}', painel)
        self.assertIn('>Baixar arquivo</button>', painel)

    def test_checklists_usam_rotulos_atuais_e_ainda_verificam_provas(self):
        evidencia = fonte('qa/evidencias-verificacao/validar_fluxo_real.py')
        cartao = fonte('qa/tec08-uiux-final/validar_card_evidencia_real.py')
        componente = fonte('frontend/src/app/contratos/components/conteudo-entregavel.tsx')
        self.assertIn("name='Ativas',exact=True", evidencia)
        self.assertIn("name='Ativas', exact=True", cartao)
        self.assertIn("name='Evidências finalizadas'", cartao)
        self.assertIn('A aba Ativas não está selecionada', cartao)
        self.assertIn("rel['etapaAtual'] = 'Abrir cartão de evidência em modo de consulta'", cartao)
        self.assertIn('aria-label="Evidências finalizadas"', componente)
        self.assertIn('>Ativas</span>', componente)


if __name__ == '__main__':
    unittest.main(verbosity=2)
