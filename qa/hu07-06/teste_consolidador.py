"""Testes sem dependências de terceiros; não simulam integração da aplicação."""
import unittest
from consolidar_evidencias import PERFIS, TIPOS, validar


class Consolidacao(unittest.TestCase):
    def relatorio(self, perfil):
        escrita = perfil in {'administrador', 'gestor-edicao'}
        provas = ['Sessão real SuperTokens', 'Logout SuperTokens real']
        if escrita:
            provas += ['Cinco POST', 'Cinco PATCH', 'Conferência PostgreSQL', 'Network Chromium']
        elif perfil == 'sem-vinculo':
            provas.append('Sem vínculo: leitura bloqueada')
        else:
            provas.append('POST/PATCH HTTP 403')
        return {
            'perfilSolicitado': perfil, 'contratoId': '11111111-1111-4111-8111-111111111111',
            'hu': 'HU07-06', 'tipoTeste': 'NAVEGADOR_REAL_SEM_MOCK', 'status': 'APROVADO',
            'provas': provas, 'escrita': escrita,
            'etapaCriada': '22222222-2222-4222-8222-222222222222' if escrita else None,
            'entregaveisCriados': [{'tipo': t} for t in TIPOS] if escrita else [],
        }

    def test_rejeita_papel_ausente(self):
        self.assertTrue(validar([self.relatorio(p) for p in PERFIS - {'colaborador'}]))

    def test_rejeita_mock(self):
        lista = [self.relatorio(p) for p in PERFIS]
        lista[0]['tipoTeste'] = 'MOCK'
        self.assertTrue(validar(lista))

    def test_rejeita_sem_sql(self):
        lista = [self.relatorio(p) for p in PERFIS]
        for r in lista:
            if r['perfilSolicitado'] == 'administrador':
                r['provas'] = [x for x in r['provas'] if 'PostgreSQL' not in x]
        self.assertTrue(validar(lista))

    def test_cinco_papeis_aceitos_com_evidencias(self):
        self.assertEqual([], validar([self.relatorio(p) for p in PERFIS]))


if __name__ == '__main__':
    unittest.main()
