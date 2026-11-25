"""Testes sem dependências de terceiros; não simulam integração da aplicação."""
import unittest
from consolidar_evidencias import PERFIS, TIPOS, validar


class Consolidacao(unittest.TestCase):
    def relatorio(self, perfil):
        escrita = perfil in {'administrador', 'gestor-edicao'}
        provas = ['Sessão real SuperTokens', 'Logout SuperTokens real']
        if escrita:
            provas += [
                'Contrato SIMPLES confirmado na API',
                'Etapa: detalhe acessível, edição no modal e retorno sem salvar, mantendo a rota',
                'Autoatualização: entregável QA único, visível, acessível, UUID/URL confirmados na API',
                'Cinco POSTs de entregáveis + dez POSTs de evidências esperadas via UI, com persistência',
                'Cinco PATCHs de planejamento e cinco PATCHs de evidência autorizados; reload, ACL, IDs estáveis e peso validados',
                'Checklist: dois POSTs reais via modal, IDs e obrigatoriedade compatíveis com ACL; persistência conferida',
                'Responsável: seleção única por e-mail na API protegida, sem digitar UUID',
                'PostgreSQL direto: vínculos, tipos, checklist, status NULL, auditoria e parâmetros HU09/TEC09',
                'Network Chromium: POST×5 e PATCH×5 sem interceptação ou mock',
            ]
            if perfil == 'gestor-edicao':
                provas.extend([
                    'Gestor: controle opcional ausente e POST opcional bloqueado pela API (403), sem efeitos no banco',
                    'Gestor: PATCH de orientações permitido (200), PATCH de obrigatoriedade negado (403), sem mutação indevida',
                ])
        elif perfil == 'sem-vinculo':
            provas.append('Sem vínculo: leitura bloqueada')
        else:
            provas.append('Leitor: navegação contextual Etapas → modal da etapa → lista acessível → entregável, sem criação/edição')
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

    def test_rejeita_relatorio_sem_prova_do_detalhe_e_responsavel(self):
        lista = [self.relatorio(p) for p in PERFIS]
        for r in lista:
            if r['perfilSolicitado'] == 'administrador':
                r['provas'] = [p for p in r['provas'] if 'Etapa: detalhe' not in p]
        self.assertTrue(any('Etapa: detalhe' in erro for erro in validar(lista)))

    def test_rejeita_relatorio_sem_prova_do_checklist_persistido(self):
        lista = [self.relatorio(p) for p in PERFIS]
        for r in lista:
            if r['perfilSolicitado'] == 'administrador':
                r['provas'] = [p for p in r['provas'] if 'Checklist: dois POSTs reais via modal' not in p]
        self.assertTrue(any('Checklist: dois POSTs' in erro for erro in validar(lista)))

    def test_rejeita_gestor_sem_prova_de_bloqueio_de_obrigatoriedade(self):
        lista = [self.relatorio(p) for p in PERFIS]
        for r in lista:
            if r['perfilSolicitado'] == 'gestor-edicao':
                r['provas'] = [p for p in r['provas'] if 'PATCH de obrigatoriedade negado' not in p]
        self.assertTrue(any('ACL granular' in erro for erro in validar(lista)))

    def test_rejeita_sem_atualizacao_automatica_do_entregavel(self):
        lista = [self.relatorio(p) for p in PERFIS]
        for r in lista:
            if r['perfilSolicitado'] == 'administrador':
                r['provas'] = [p for p in r['provas'] if 'Autoatualização:' not in p]
        self.assertTrue(any('Autoatualização:' in erro for erro in validar(lista)))

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

    def test_rejeita_leitor_sem_navegacao_real_entre_modais(self):
        for perfil in ('gestor-leitura', 'colaborador'):
            lista = [self.relatorio(p) for p in PERFIS]
            leitor = next(r for r in lista if r['perfilSolicitado'] == perfil)
            leitor['provas'] = [p for p in leitor['provas'] if 'navegação contextual' not in p]
            self.assertTrue(any('navegação real' in erro for erro in validar(lista)))

    def test_cinco_papeis_aceitos_com_evidencias(self):
        self.assertEqual([], validar([self.relatorio(p) for p in PERFIS]))


if __name__ == '__main__':
    unittest.main()
