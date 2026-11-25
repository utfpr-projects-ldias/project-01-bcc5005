import { POLITICAS_OPERACIONAIS, politicaOperacional, uuidValido } from './politicas-operacionais.js';
import { ACAO_PERMISSAO } from './permissoes-granulares.js';

describe('catálogo fechado de ações operacionais', () => {
  it('convenção recurso:verbo e escopos explícitos para todas as ações', () => {
    for (const [acao, politica] of Object.entries(POLITICAS_OPERACIONAIS)) {
      expect(acao).toMatch(/^[a-z]+(?:-[a-z]+)*:[a-z]+(?:-[a-z]+)*$/);
      expect(['contrato', 'recurso']).toContain(politica.escopo);
      expect(['leitura', 'operacional', 'planejamento']).toContain(politica.classe);
      expect(politicaOperacional(acao)).toEqual(politica);
    }
    expect(politicaOperacional('etapas:*')).toBeNull();
    expect(politicaOperacional('documentos:apagar')).toBeNull();
    expect(politicaOperacional('__proto__')).toBeNull();
  });
  it('distingue listar/reordenar de editar ID; editar sem recurso não é permitido', () => {
    expect(POLITICAS_OPERACIONAIS['etapas:listar'].escopo).toBe('contrato');
    expect(POLITICAS_OPERACIONAIS['etapas:editar'].escopo).toBe('recurso');
    expect(POLITICAS_OPERACIONAIS['etapas:reordenar'].escopo).toBe('contrato');
    expect(POLITICAS_OPERACIONAIS['documentos:baixar'].escopo).toBe('recurso');
  });
  it('UUIDs sem formato válido são rejeitados antes de ir ao banco', () => {
    expect(uuidValido('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(true);
    expect(uuidValido('aaaa')).toBe(false);
    expect(uuidValido(undefined)).toBe(false);
    expect(uuidValido({})).toBe(false);
  });
});

test('replanejamento exige escopo do entregável associado, sem bypass administrativo', () => {
  expect(POLITICAS_OPERACIONAIS['ocorrencias:replanejar'].recurso).toBe('entregavel');
  expect(POLITICAS_OPERACIONAIS['ocorrencias:replanejar'].escopo).toBe('recurso');
});


test('B02: novas mutações sem delegação granular não podem ser introduzidas silenciosamente', () => {
  const semMapeamento = Object.entries(POLITICAS_OPERACIONAIS)
    .filter(([acao, politica]) => politica.classe !== 'leitura' && !ACAO_PERMISSAO[acao])
    .map(([acao]) => acao);
  // Ação legada sem controller operacional: permanece negada para TODOS os perfis.
  expect(semMapeamento).toEqual(['evidencias:arquivar']);
});
