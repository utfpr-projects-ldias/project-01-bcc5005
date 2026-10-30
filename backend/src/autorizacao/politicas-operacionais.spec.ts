import { POLITICAS_OPERACIONAIS, politicaOperacional, uuidValido } from './politicas-operacionais.js';

describe('catálogo fechado de ações operacionais', () => {
  it('convenção recurso:verbo e escopos explícitos para todas as ações', () => {
    for (const [acao, politica] of Object.entries(POLITICAS_OPERACIONAIS)) {
      expect(acao).toMatch(/^[a-z]+:[a-z]+$/);
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
