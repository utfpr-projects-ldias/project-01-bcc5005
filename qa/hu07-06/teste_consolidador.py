"""Testes sem dependências de terceiros; não simulam integração da aplicação."""
import unittest
from consolidar_evidencias import PERFIS, TIPOS, validar


class Consolidacao(unittest.TestCase):
    def relatorio(self, perfil):
        escrita = perfil in {'administrador', 'gestor-edicao'}
        provas = ['Sessão real SuperTokens', 'Logout SuperTokens real']
        if escrita:
            provas += ['Cinco POST', 'Cinco PATCH', 'Conferência PostgreSQL', 'Network Chromium',
                       'Etapa: modal acessível, Voltar do mouse/navegador', 'Atualizar entregáveis: transição real aria-busy/disabled',
                       'Checklist: limite de 10', 'Responsável: seleção única por e-mail']
        elif perfil == 'sem-vinculo':
            provas.append('Sem vínculo: leitura bloqueada')
        else:
            provas.append('POST/PATCH negados HTTP 404/404')
        return {
            'perfilSolicitado': perfil, 'contratoId': '11111111-1111-4111-8111-111111111111',
            'hu': 'HU07-06', 'tipoTeste': 'NAVEGADOR_REAL_SEM_MOCK', 'status': 'APROVADO',
            'provas': provas, 'escrita': escrita,
            'negacoesEscrita': {'POST': 404, 'PATCH': 404} if perfil in {'gestor-leitura', 'colaborador'} else None,
            'sqlValidado': perfil != 'sem-vinculo',
            'etapaCriada': '22222222-2222-4222-8222-222222222222' if escrita else None,
            'entregaveisCriados': [{'tipo': t} for t in TIPOS] if escrita else [],
        }

    def test_rejeita_papel_ausente(self):
        self.assertTrue(validar([self.relatorio(p) for p in PERFIS - {'colaborador'}]))

    def test_rejeita_mock(self):
        lista = [self.relatorio(p) for p in PERFIS]
        lista[0]['tipoTeste'] = 'MOCK'
        self.assertTrue(validar(lista))

    def test_rejeita_sem_sql_estruturado_em_leitor(self):
        lista = [self.relatorio(p) for p in PERFIS]
        for r in lista:
            if r['perfilSolicitado'] == 'colaborador':
                r['sqlValidado'] = False
        self.assertTrue(any('sqlValidado' in erro for erro in validar(lista)))

    def test_rejeita_sem_sql(self):
        lista = [self.relatorio(p) for p in PERFIS]
        for r in lista:
            if r['perfilSolicitado'] == 'administrador':
                r['provas'] = [x for x in r['provas'] if 'PostgreSQL' not in x]
        self.assertTrue(validar(lista))

    def test_rejeita_relatorio_antigo_sem_prova_do_modal_e_responsavel(self):
        lista = [self.relatorio(p) for p in PERFIS]
        for r in lista:
            if r['perfilSolicitado'] == 'administrador':
                r['provas'] = [p for p in r['provas'] if 'Etapa: modal' not in p]
        self.assertTrue(any('modal' in erro for erro in validar(lista)))

    def test_rejeita_relatorio_sem_prova_do_voltar_fisico(self):
        lista = [self.relatorio(p) for p in PERFIS]
        for r in lista:
            if r['perfilSolicitado'] == 'administrador':
                r['provas'] = [p.replace('Voltar do mouse/navegador', 'Voltar sem salvar') for p in r['provas']]
        self.assertTrue(any('Voltar do mouse/navegador' in erro for erro in validar(lista)))

    def test_nega_403_e_404_sao_validos_mas_nao_200(self):
        for codigo in (403, 404):
            lista = [self.relatorio(p) for p in PERFIS]
            leitor = next(x for x in lista if x['perfilSolicitado'] == 'gestor-leitura')
            leitor['negacoesEscrita'] = {'POST': codigo, 'PATCH': codigo}
            self.assertEqual([], validar(lista))
        lista = [self.relatorio(p) for p in PERFIS]
        leitor = next(x for x in lista if x['perfilSolicitado'] == 'gestor-leitura')
        leitor['negacoesEscrita']['POST'] = 200
        self.assertTrue(any('POST/PATCH' in erro for erro in validar(lista)))

    def test_evidencia_admin_real_de_loading_passa_no_consolidador(self):
        lista = [self.relatorio(p) for p in PERFIS]
        self.assertEqual([], validar(lista))

    def test_cinco_papeis_aceitos_com_evidencias(self):
        self.assertEqual([], validar([self.relatorio(p) for p in PERFIS]))


if __name__ == '__main__':
    unittest.main()
