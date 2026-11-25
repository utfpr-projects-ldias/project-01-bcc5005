#!/usr/bin/env python3
"""Regressões mínimas para o executor oficial e as mudanças R11."""
from pathlib import Path
import unittest
import re
from collections import Counter

RAIZ = Path(__file__).resolve().parents[2]

class TesteCentral(unittest.TestCase):
    def fonte(self, caminho):
        return (RAIZ / caminho).read_text(encoding='utf-8')

    def test_entradas_unicas_e_modos(self):
        for nome, modo in [('back','back'), ('front','front'), ('testes-all','all')]:
            texto=self.fonte(nome)
            self.assertIn(f'executar.sh" {modo}', texto)
        runner=self.fonte('qa/central/executar.sh')
        self.assertIn('back|front|all', runner)
        self.assertIn('if [[ "$MODO" != front ]]', runner)
        self.assertIn('if [[ "$MODO" != back ]]', runner)
        self.assertIn("'contratos-migration|TEST_DATABASE_URL", runner)
        self.assertIn("'tec07-ajustes-02-03-seguranca-regressao|TEC07_REGRESSION_TEST_DATABASE_URL", runner)
        self.assertIn('QA-REAL-HU06-HU07', runner)
        self.assertIn('02-FRONTEND-REACT-ACT-SEM-AVISOS', runner)
        self.assertIn('run QA-REAL-HU08-HU09-TEC09 bash qa/hu08-hu09-tec09/RODAR-DEV.sh', runner)
        self.assertIn('QA_CONTRATO_ID', runner)
        self.assertIn('--validar-banco --saida', runner)
        self.assertIn('QA-REAL-EVIDENCIAS', runner)

    def test_edicao_evidencia_exige_acao_e_permissao(self):
        conteudo=self.fonte('frontend/src/app/contratos/components/conteudo-entregavel.tsx')
        self.assertNotIn('setEditarEvidenciaAberta', conteudo)
        self.assertIn('podeEnviarComprovantes = false', conteudo)
        self.assertIn('podeEditar={planejamentoHabilitado && podeEditarEsperada && integridadeDetalhe', conteudo)
        self.assertIn("estadoEvidencias[selecionada.id]?.status !== 'VERIFICADA'", conteudo)
        painel=self.fonte('frontend/src/app/contratos/components/painel-comprovacao-evidencia.tsx')
        self.assertIn('podeEditar && contextoPermiteAlterar && !somenteLeitura', painel)
        self.assertIn("podeEditarMetadados && !arquivada && dados.status !== 'VERIFICADA'", painel)
        self.assertIn('podeEnviar && contextoPermiteAlterar', painel)
        pagina=self.fonte('frontend/src/app/contratos/[id]/entregaveis/[entregavelId]/page.tsx')
        self.assertIn('podeEnviarComprovantes={Boolean(permissoes?.enviarComprovantes)}', pagina)
        self.assertIn('podeAlterarObrigatoriedade={Boolean(permissoes?.alterarObrigatoriedade)}', pagina)
        self.assertIn('podeEditarEsperada={Boolean(permissoes?.editarEvidencias)}', pagina)

    def test_qa_real_usa_abas_e_modal_novos(self):
        hu=self.fonte('qa/hu07-06/validar_fluxo_real.py')
        # Os cenários de escrita e leitura usam navegação distinta:
        # o primeiro seleciona diretamente a aba; o segundo usa um locator
        # validado e percorre o modal da etapa/entregável. Contar uma linha
        # literal duas vezes rejeitaria esse fluxo correto (regressão R20).
        self.assertIn("localizar_pagina(page, 'Etapas').click()", hu)
        self.assertIn("aba = localizar_pagina(page, 'Etapas')", hu)
        self.assertIn("aba.click()", hu)
        self.assertIn('verificar_navegacao_leitor(page, painel, etapa, detalhe,', hu)
        self.assertIn("get_by_role('table', name='Entregáveis planejados da etapa'", hu)
        ev=self.fonte('qa/evidencias-verificacao/validar_fluxo_real.py')
        card=self.fonte('qa/tec08-uiux-final/validar_card_evidencia_real.py')
        for trecho in [ev,card]:
            self.assertNotIn("get_by_role('button', name='Editar evidência Relatório de QA').click()",trecho)
            self.assertIn('Edição geral redundante ainda presente',trecho)
        self.assertIn("get_by_role('button', name='Anexar comprovante').wait_for",card)
        self.assertIn("get_by_role('button', name='Substituir comprovante').wait_for",ev)
        tec=self.fonte('qa/tec08-03/validar_ui_real.py')
        self.assertIn('tr[data-entregavel-estado] a[href=', tec)
        self.assertIn("titulo_item.get_attribute('aria-label')", tec)
        self.assertIn('resposta_cadastro.status == 201', tec)
        self.assertIn('Entregável criado não ficou visível na aba ativa',tec)

    def test_todas_as_suites_e2e_tem_execucao_unica(self):
        runner = self.fonte('qa/central/executar.sh')
        esperadas = {p.name.removesuffix('.e2e-spec.ts') for p in (RAIZ / 'backend/test').glob('*.e2e-spec.ts')}
        http = re.findall(r'test/([a-z0-9-]+)\.e2e-spec\.ts', runner)
        banco = re.findall(r"^\s*'([a-z0-9-]+)\|[A-Z0-9_]+\|[^']+'", runner, re.M)
        self.assertTrue(esperadas)
        self.assertEqual(Counter(http + banco), Counter({s: 1 for s in esperadas}))

    def test_descoberta_python_abrange_os_dois_prefixos(self):
        runner = self.fonte('qa/central/executar.sh')
        self.assertIn("-name 'teste_*.py'", runner)
        self.assertIn("-name 'test_*.py'", runner)
        self.assertIn("-not -path '*/.local/*'", runner)
        self.assertIn('if (( PULOU > 0 )); then exit 3;', runner)

    def test_configuracao_idempotente_sem_backup(self):
        script=self.fonte('qa/central/configurar.sh')
        self.assertEqual(script.count('npm run migration:run'),1)
        self.assertIn('--force-recreate --renew-anon-volumes --no-deps backend frontend',script)
        self.assertIn('INSTALAR-LOCAL.sh',script)
        self.assertNotIn('down -v',script)
        self.assertNotIn('reset --hard',script)
        self.assertNotIn('pg_dump',script.lower())

if __name__ == '__main__':
    unittest.main(verbosity=2)
