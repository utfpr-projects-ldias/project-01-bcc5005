import { AcaoAuditoria, TIPO_ENTIDADE_POR_ACAO } from '../auditoria/acao-auditoria.js';
import { ACAO_PERMISSAO, CHAVES_PERMISSOES, permissoesEfetivas } from './permissoes-granulares.js';
import { politicaOperacional } from './politicas-operacionais.js';

describe('Reabertura: autorização especial, auditada e separada de arquivamento', () => {
  const permissoes = ['reabrirContrato', 'reabrirEtapas', 'reabrirEntregaveis', 'reabrirEvidencias'] as const;

  it('expõe quatro permissões independentes, negadas por padrão a não-administradores', () => {
    for (const permissao of permissoes) {
      expect(CHAVES_PERMISSOES).toContain(permissao);
      for (const perfil of ['GESTOR', 'COLABORADOR']) {
        expect(permissoesEfetivas(perfil, true, null)[permissao]).toBe(false);
      }
      expect(permissoesEfetivas('ADMINISTRADOR', true, null)[permissao]).toBe(true);
    }
  });
  it('delegação explícita não concede reaberturas de outros tipos', () => {
    const resultado = permissoesEfetivas('COLABORADOR', false, { reabrirEvidencias: true });
    expect(resultado.reabrirEvidencias).toBe(true);
    expect(resultado.reabrirContrato).toBe(false);
    expect(resultado.reabrirEtapas).toBe(false);
    expect(resultado.reabrirEntregaveis).toBe(false);
  });
  it('reabrir não herda autorização de arquivar', () => {
    const resultado = permissoesEfetivas('GESTOR', true, { arquivarEvidencias: true, arquivarEntregaveis: true });
    expect(resultado.reabrirEvidencias).toBe(false);
    expect(resultado.reabrirEntregaveis).toBe(false);
    expect(ACAO_PERMISSAO['etapas:reabrir']).toBe('reabrirEtapas');
    expect(ACAO_PERMISSAO['entregaveis:reabrir']).toBe('reabrirEntregaveis');
    expect(ACAO_PERMISSAO['evidencias:reabrir']).toBe('reabrirEvidencias');
    expect(politicaOperacional('evidencias:reabrir')?.classe).toBe('operacional');
  });
  it('eventos de reabertura possuem mapeamento completo de entidades', () => {
    expect(TIPO_ENTIDADE_POR_ACAO[AcaoAuditoria.CONTRATO_REABERTO]).toBe('CONTRATO');
    expect(TIPO_ENTIDADE_POR_ACAO[AcaoAuditoria.ETAPA_REABERTA]).toBe('ETAPA');
    expect(TIPO_ENTIDADE_POR_ACAO[AcaoAuditoria.ENTREGAVEL_REABERTO]).toBe('ENTREGAVEL');
    expect(TIPO_ENTIDADE_POR_ACAO[AcaoAuditoria.ENTREGAVEL_COMPROVANTE_REABERTO]).toBe('ENTREGAVEL');
  });
});
