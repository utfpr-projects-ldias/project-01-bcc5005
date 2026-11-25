from __future__ import annotations
import importlib.util
from pathlib import Path
from contextlib import redirect_stderr
import io
import re
import tempfile
import unittest
from unittest.mock import patch, MagicMock

ARQ = Path(__file__).with_name('executar_tudo.py')
spec = importlib.util.spec_from_file_location('executar_tudo', ARQ)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class RunnerHU06(unittest.TestCase):
    def test_navegacao_real_abre_aba_etapas_apos_acesso_e_reloads(self):
        # A rota /contratos/[id] abre na Visão geral. Playwright só pode
        # operar formulários, listas e botões da aba Etapas depois de selecioná-la.
        fonte = ARQ.with_name('validar_fluxo_real.py').read_text(encoding='utf-8')
        self.assertEqual(3, fonte.count('get_by_role("tab", name="Etapas", exact=True)'))
        self.assertIn('aba_etapas.click()', fonte)
        self.assertIn('garantir(aba_etapas.get_attribute("aria-selected") == "true"', fonte)
        self.assertEqual(2, fonte.count('page.reload(wait_until="domcontentloaded")'))

    def test_detalhe_do_leitor_so_e_validado_apos_abrir_modal(self):
        fluxo = ARQ.with_name('validar_fluxo_real.py')
        spec_fluxo = importlib.util.spec_from_file_location('validar_fluxo_hu06', fluxo)
        modulo = importlib.util.module_from_spec(spec_fluxo)
        spec_fluxo.loader.exec_module(modulo)
        eventos = []
        page, painel, botao, modal = (MagicMock() for _ in range(4))
        painel.get_by_role.return_value = botao
        page.get_by_role.return_value = modal
        botao.count.return_value = 1
        botao.click.side_effect = lambda: eventos.append('abrir')
        modal.get_attribute.return_value = 'true'
        editar = MagicMock()
        editar.count.return_value = 0
        voltar = MagicMock()
        voltar.click.side_effect = lambda: eventos.append('fechar')
        def componente(role, *, name=None, exact=None):
            if role == 'button' and name == 'Editar etapa': return editar
            if role == 'button' and name == 'Voltar às etapas': return voltar
            raise AssertionError('Controle inesperado no modal de leitura')
        modal.get_by_role.side_effect = componente
        modulo.verificar_detalhe_leitor(page, painel, {'nome': 'Etapa QA'})
        self.assertEqual(eventos, ['abrir', 'fechar'])
        editar.count.assert_called_once()
        modal.wait_for.assert_any_call(state='visible', timeout=20000)
        modal.wait_for.assert_any_call(state='detached', timeout=15000)
        editar.count.return_value = 1
        with self.assertRaisesRegex(AssertionError, 'Editar etapa'):
            modulo.verificar_detalhe_leitor(page, painel, {'nome': 'Etapa QA'})

    def test_edicao_confere_detalhe_atualizado_antes_de_retornar_a_lista(self):
        """Regressão: após PATCH o produto mantém aberto o modal de detalhe."""
        fluxo = ARQ.with_name('validar_fluxo_real.py')
        spec_fluxo = importlib.util.spec_from_file_location('validar_fluxo_hu06_edicao', fluxo)
        modulo = importlib.util.module_from_spec(spec_fluxo)
        spec_fluxo.loader.exec_module(modulo)
        eventos = []
        page, painel, detalhe, fechar, cartao = (MagicMock() for _ in range(5))
        page.get_by_role.return_value = detalhe
        painel.get_by_role.return_value = cartao
        detalhe.get_attribute.return_value = 'true'
        detalhe.wait_for.side_effect = lambda **kw: eventos.append('detalhe-' + kw['state'])
        detalhe.get_by_role.return_value = fechar
        fechar.click.side_effect = lambda: eventos.append('fechar')
        cartao.count.return_value = 1
        cartao.wait_for.side_effect = lambda **kw: eventos.append('lista-' + kw['state'])
        modulo.confirmar_retorno_edicao_no_detalhe(page, painel, 'Etapa Editada')
        self.assertEqual(eventos, ['detalhe-visible', 'fechar', 'detalhe-detached', 'lista-visible'])
        page.get_by_role.assert_called_once()
        self.assertEqual(page.get_by_role.call_args.args[0], 'dialog')
        self.assertTrue(page.get_by_role.call_args.kwargs['name'].search('3 · Etapa Editada'))
        self.assertFalse(page.get_by_role.call_args.kwargs['name'].search('3 · Etapa Antiga'))
        detalhe.get_by_role.assert_called_once_with('button', name='Voltar às etapas', exact=True)
        self.assertTrue(painel.get_by_role.call_args.kwargs['name'].search(
            'Abrir detalhes da etapa 3: Etapa Editada'))

    def test_edicao_rejeita_detalhe_ou_cartao_incorretos(self):
        fluxo = ARQ.with_name('validar_fluxo_real.py')
        spec_fluxo = importlib.util.spec_from_file_location('validar_fluxo_hu06_erro', fluxo)
        modulo = importlib.util.module_from_spec(spec_fluxo)
        spec_fluxo.loader.exec_module(modulo)
        page, painel = MagicMock(), MagicMock()
        detalhe = page.get_by_role.return_value
        detalhe.get_attribute.return_value = 'false'
        with self.assertRaisesRegex(AssertionError, 'modal acessível'):
            modulo.confirmar_retorno_edicao_no_detalhe(page, painel, 'Etapa Editada')
        detalhe.get_attribute.return_value = 'true'
        painel.get_by_role.return_value.count.return_value = 0
        with self.assertRaisesRegex(AssertionError, 'forma única'):
            modulo.confirmar_retorno_edicao_no_detalhe(page, painel, 'Etapa Editada')

    def test_fluxo_de_escrita_confirma_edicao_antes_da_reordenacao(self):
        fonte = ARQ.with_name('validar_fluxo_real.py').read_text(encoding='utf-8')
        executar = fonte.split('if args.escrita:', 1)[1]
        self.assertLess(executar.index('confirmar_retorno_edicao_no_detalhe(page, painel, nome_editado)'),
                        executar.index('Subir etapa {nomes[1]}'))
        self.assertIn('conferir_patch_etapa(a, nome=nome_editado, codigo=codigo_editado, status="EM_ANDAMENTO")', executar)
        self.assertIn('confirmar_campo_editado(form, "nome", nome_editado, LIMITE_NOME_ETAPA)', executar)
        self.assertIn('confirmar_campo_editado(form, "codigo", codigo_editado, LIMITE_CODIGO_ETAPA)', executar)
        self.assertIn('re.escape(nome_editado)', fonte)

    def test_qa_leitor_exige_patch_negado_e_modal_montado(self):
        fonte = ARQ.with_name('validar_fluxo_real.py').read_text(encoding='utf-8')
        self.assertIn('verificar_detalhe_leitor(page, painel, candidatas[0])', fonte)
        self.assertIn("caminho_lista + '/' + quote(candidatas[0]['id'])", fonte)
        self.assertIn("probe['status'] in (403, 404) and patch['status'] in (403, 404)", fonte)

    def test_estado_fiel_dos_vinculos(self):
        for estado in ('edição', 'somente leitura', 'sem vínculo'):
            self.assertEqual(mod.ler_estado('Funcionário: teste\nAntes: '+estado+'\nDepois: '+estado+'\n'), estado)

    def test_recusa_estado_desconhecido_ou_ambiguo(self):
        for saida in ('', 'Antes: administrador', 'Antes: edição\nAntes: leitura'):
            with self.assertRaises(ValueError):
                mod.ler_estado(saida)

    def test_confirmacao_necessaria_antes_de_mutacoes(self):
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as e:
            mod.opcoes(['--contrato-id', '59220449-8c96-4faa-8b03-7be436e321a7'])
        self.assertEqual(e.exception.code, 2)

    def test_outro_contrato_nao_pode_ser_o_mesmo(self):
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as e:
            mod.opcoes(['--contrato-id','59220449-8c96-4faa-8b03-7be436e321a7',
                        '--outro-contrato-id','59220449-8c96-4faa-8b03-7be436e321a7',
                        '--confirmar-alteracoes'])
        self.assertEqual(e.exception.code, 2)

    def test_bundler_nao_copia_credenciais(self):
        with tempfile.TemporaryDirectory() as d:
            pasta = Path(d)
            (pasta / 'resumo.json').write_text('{}')
            (pasta / 'passos.log').write_text('ok')
            (pasta / 'credenciais.txt').write_text('NUNCA_INCLUIR')
            zip_file = mod.empacotar(pasta)
            from zipfile import ZipFile
            with ZipFile(zip_file) as z:
                self.assertEqual(set(z.namelist()), {'resumo.json', 'passos.log'})
                self.assertNotIn(b'NUNCA_INCLUIR', b''.join(z.read(p) for p in z.namelist()))

    def test_restaura_ambos_os_vinculos(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as pasta:
            e = mod.Executor(SimpleNamespace(contrato_id='59220449-8c96-4faa-8b03-7be436e321a7'), Path(pasta))
            e.estados = {'gestor-edicao': 'somente leitura', 'colaborador': 'sem vínculo'}
            chamadas = []
            def vinculo(perfil, modo):
                chamadas.append((perfil, modo))
                if modo == 'consultar':
                    return 'Antes: edição\n' if perfil == 'gestor-edicao' else 'Antes: somente leitura\n'
                return 'OK'
            e.vinculo = vinculo
            e.restaurar()
            self.assertIn(('gestor-edicao', 'leitura'), chamadas)
            self.assertIn(('colaborador', 'revogar'), chamadas)
            self.assertTrue(all('restaurado' in x for x in e.restauracao))

    def test_encontra_cinco_relatorios_sem_inventar_evidencia(self):
        with tempfile.TemporaryDirectory() as pasta:
            root = Path(pasta)
            dir1 = root/'relatorios'/'20261101-030821'
            dir1.mkdir(parents=True)
            nomes = ('administrador-retomado','gestor-edicao-final','gestor-leitura-final','colaborador-final','sem-vinculo-final')
            for nome in nomes:
                (dir1/(nome+'.json')).write_text('{"status":"APROVADO"}')
            with patch.object(mod,'LOCAL_HU07',root):
                localizados = mod.encontrar_hu07()
            self.assertEqual(len(localizados), 5)
            self.assertTrue(all(p.parent==dir1 for p in localizados.values()))



class DadosEdicaoHU06(unittest.TestCase):
    """Evita reproduzir o timeout R21 com fixtures maiores que maxLength."""

    @classmethod
    def setUpClass(cls):
        caminho = ARQ.with_name('validar_fluxo_real.py')
        spec_fluxo = importlib.util.spec_from_file_location('validar_fluxo_hu06_limites', caminho)
        cls.fluxo = importlib.util.module_from_spec(spec_fluxo)
        spec_fluxo.loader.exec_module(cls.fluxo)

    def test_fixture_criacao_e_edicao_sao_validas_e_distintas(self):
        for marca in ('00000000', 'C8856CC2', 'FFFFFFFF', '0123ABCD'):
            nomes, codigos, nome_editado, codigo_editado = self.fluxo.gerar_dados_etapas_qa(marca)
            self.assertEqual(len(set(nomes + [nome_editado])), 3)
            self.assertEqual(len(set(codigos + [codigo_editado])), 3)
            self.assertTrue(all(0 < len(x) <= self.fluxo.LIMITE_NOME_ETAPA for x in nomes+[nome_editado]))
            self.assertTrue(all(0 < len(x) <= self.fluxo.LIMITE_CODIGO_ETAPA for x in codigos+[codigo_editado]))
            self.assertIn(marca, nome_editado)
            self.assertIn(marca, codigo_editado)

    def test_fixture_recusa_marcas_invalidas(self):
        for marca in ('', 'ab123456', 'ABCD', 'ABC123456', 'NOTAHEX!'):
            with self.assertRaisesRegex(AssertionError, 'Identificador'):
                self.fluxo.gerar_dados_etapas_qa(marca)

    def test_limites_qa_conferem_frontend_e_dtos_do_backend(self):
        raiz = ARQ.parents[2]
        ts = (raiz/'frontend/src/lib/validacao-etapa.ts').read_text(encoding='utf-8')
        declaracao = re.search(r'LIMITES_ETAPA\s*=\s*\{\s*codigo:\s*(\d+),\s*nome:\s*(\d+)', ts)
        self.assertIsNotNone(declaracao, 'Limites da UI mudaram sem revisão do QA')
        self.assertEqual((int(declaracao[1]), int(declaracao[2])),
                         (self.fluxo.LIMITE_CODIGO_ETAPA, self.fluxo.LIMITE_NOME_ETAPA))
        for arquivo in ('criar-etapa.dto.ts', 'atualizar-etapa.dto.ts'):
            dto = (raiz/'backend/src/etapas/dto'/arquivo).read_text(encoding='utf-8')
            for campo, limite in [('nome', self.fluxo.LIMITE_NOME_ETAPA),
                                  ('codigo', self.fluxo.LIMITE_CODIGO_ETAPA)]:
                self.assertRegex(dto, rf'@MaxLength\({limite}\)\s+{campo}\??[!:]')
        form = (raiz/'frontend/src/app/contratos/components/formulario-etapa.tsx').read_text(encoding='utf-8')
        for campo in ('nome', 'codigo'):
            self.assertIn(f'LIMITES_ETAPA.{campo}', form)
            self.assertIn(f'id="etapa-{campo}"', form)

    def test_dom_impede_truncamento_silencioso_antes_do_patch(self):
        form = MagicMock()
        campo = form.locator.return_value
        campo.get_attribute.return_value = '36'
        campo.input_value.return_value = 'Etapa teste revisada'
        self.fluxo.confirmar_campo_editado(form, 'nome', 'Etapa teste revisada', 36)
        campo.input_value.return_value = 'Etapa teste revisa'  # navegador truncou
        with self.assertRaisesRegex(AssertionError, 'truncou/alterou nome'):
            self.fluxo.confirmar_campo_editado(form, 'nome', 'Etapa teste revisada', 36)
        campo.input_value.return_value = 'Etapa teste revisada'
        campo.get_attribute.return_value = '35'
        with self.assertRaisesRegex(AssertionError, 'maxLength de nome mudou'):
            self.fluxo.confirmar_campo_editado(form, 'nome', 'Etapa teste revisada', 36)
        campo.get_attribute.return_value = None
        with self.assertRaisesRegex(AssertionError, 'sem maxLength válido'):
            self.fluxo.confirmar_campo_editado(form, 'nome', 'Etapa teste revisada', 36)

    def test_patch_conferido_separadamente_por_campo(self):
        esperado = {'nome': 'Etapa revisada', 'codigo': 'COD-1', 'status': 'EM_ANDAMENTO'}
        self.fluxo.conferir_patch_etapa(dict(esperado), **esperado)
        for campo in esperado:
            divergente = dict(esperado)
            divergente[campo] = 'OUTRO'
            with self.assertRaisesRegex(AssertionError, f'PATCH de {campo} não persistiu'):
                self.fluxo.conferir_patch_etapa(divergente, **esperado)

    def test_patch_envia_valores_confirmados_na_ui_antes_de_conferir_api(self):
        fonte = ARQ.with_name('validar_fluxo_real.py').read_text(encoding='utf-8')
        trecho = fonte.split('id_a, id_b = saida["idsEtapasCriadas"]', 1)[1]
        self.assertLess(trecho.index('confirmar_campo_editado(form, "nome"'),
                        trecho.index('with page.expect_response(lambda r: r.request.method == "PATCH"'))
        self.assertLess(trecho.index('resposta_patch.value.request.post_data_json'),
                        trecho.index('conferir_patch_etapa(a, nome=nome_editado'))


if __name__ == '__main__':
    unittest.main()
