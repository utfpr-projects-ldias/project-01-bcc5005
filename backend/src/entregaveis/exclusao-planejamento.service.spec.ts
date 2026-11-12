import { ConflictException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { ExclusaoPlanejamentoService } from './exclusao-planejamento.service.js';

const ator = { id: 'ator-teste', perfil: 'ADMINISTRADOR' } as never;

describe('exclusão definitiva de itens arquivados com dependentes', () => {
  it('recusa excluir evidência ativa e não remove arquivo ou registro', async () => {
    const m = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM contratos')) return [{ id: 'contrato' }];
      if (sql.includes('FROM entregaveis')) return [{ id: 'entregavel' }];
      if (sql.includes('FROM evidencias_esperadas')) return [{ id: 'evidencia', codigo_publico: 42, arquivado_em: null }];
      throw new Error('SQL não esperado');
    }) };
    const db = { transaction: jest.fn(async (fn: (manager: { query: typeof m.query }) => Promise<unknown>) => fn(m)) };
    const auditoria = { registrarNaTransacao: jest.fn() };
    const arquivos = { removerPersistido: jest.fn() };
    const service = new ExclusaoPlanejamentoService(db as never, auditoria as never, arquivos as never);
    await expect(service.excluir('evidencia', 'contrato', 'evidencia', ator, 'entregavel')).rejects.toBeInstanceOf(ConflictException);
    expect(m.query).not.toHaveBeenCalledWith(expect.stringContaining('DELETE FROM'), expect.anything());
    expect(arquivos.removerPersistido).not.toHaveBeenCalled();
    expect(auditoria.registrarNaTransacao).not.toHaveBeenCalled();
  });

  it('remove comprovantes antes da evidência arquivada e limpa blobs após o commit', async () => {
    const ordem: string[] = [];
    const m = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM contratos')) return [{ id: 'contrato' }];
      if (sql.includes('FROM entregaveis')) return [{ id: 'entregavel' }];
      if (sql.includes('FROM evidencias_esperadas') && sql.includes('SELECT')) return [{ id: 'evidencia', codigo_publico: 42, arquivado_em: new Date() }];
      if (sql.includes('DELETE FROM comprovantes_evidencia')) { ordem.push('comprovantes'); return [{ storage_key: 'a'.repeat(32) }]; }
      if (sql.includes('DELETE FROM evidencias_esperadas')) { ordem.push('evidencia'); return []; }
      throw new Error('SQL não esperado: '+sql);
    }) };
    const db = { transaction: jest.fn(async (fn: (manager: { query: typeof m.query }) => Promise<unknown>) => fn(m)) };
    const auditoria = { registrarNaTransacao: jest.fn(async () => { ordem.push('auditoria'); }) };
    const arquivos = { removerPersistido: jest.fn(async () => { ordem.push('arquivo_fisico'); }) };
    const service = new ExclusaoPlanejamentoService(db as never, auditoria as never, arquivos as never);
    await expect(service.excluir('evidencia', 'contrato', 'evidencia', ator, 'entregavel'))
      .resolves.toMatchObject({ excluido: true, comprovantesRemovidos: 1 });
    expect(ordem).toEqual(['auditoria', 'comprovantes', 'evidencia', 'arquivo_fisico']);
    expect(auditoria.registrarNaTransacao).toHaveBeenCalledTimes(1);
  });
});

describe('regressões: auditoria antes da exclusão e sequência compactada', () => {
  it('etapa arquivada: audita enquanto a entidade existe e renumera posições seguintes', async () => {
    let etapaExiste = true;
    const sql: string[] = [];
    const m = { query: jest.fn(async (comando: string) => {
      sql.push(comando);
      if (comando.includes('SELECT id FROM contratos')) return [{ id: 'contrato' }];
      if (comando.includes('SELECT * FROM "etapas"')) return [{ id: 'etapa', arquivado_em: new Date(), codigo_publico: 14, sequencia: 3 }];
      if (comando.startsWith('DELETE FROM comprovantes_evidencia')) return [];
      if (comando.startsWith('DELETE FROM evidencias_esperadas')) return [];
      if (comando.startsWith('DELETE FROM entregaveis')) return [];
      if (comando.startsWith('DELETE FROM etapas')) { etapaExiste = false; return []; }
      if (comando.startsWith('UPDATE etapas')) return [];
      if (comando.startsWith('SET CONSTRAINTS')) return [];
      throw new Error(`SQL inesperado: ${comando}`);
    }) };
    const db = { transaction: jest.fn(async (cb: (manager: typeof m) => Promise<unknown>) => cb(m)) };
    const auditoria = { registrarNaTransacao: jest.fn(async () => {
      expect(etapaExiste).toBe(true);
    }) };
    const arquivos = { removerPersistido: jest.fn() };
    const service = new ExclusaoPlanejamentoService(db as never, auditoria as never, arquivos as never);
    await expect(service.excluir('etapa', 'contrato', 'etapa', ator)).resolves.toMatchObject({ excluido: true });
    expect(auditoria.registrarNaTransacao).toHaveBeenCalledTimes(1);
    expect(sql.some(s => s.startsWith('SET CONSTRAINTS "uq_etapas_contrato_sequencia" DEFERRED'))).toBe(true);
    expect(m.query).toHaveBeenCalledWith(
      'UPDATE etapas SET sequencia = sequencia - 1 WHERE contrato_id=$1 AND sequencia>$2',
      ['contrato', 3],
    );
  });

  it('entregável arquivado: audita antes de remover o recurso do qual depende o resolvedor', async () => {
    let entregavelExiste = true;
    const m = { query: jest.fn(async (comando: string) => {
      if (comando.includes('SELECT id FROM contratos')) return [{ id: 'contrato' }];
      if (comando.includes('SELECT * FROM "entregaveis"')) return [{ id: 'entregavel', arquivado_em: new Date(), codigo_publico: 6 }];
      if (comando.startsWith('DELETE FROM comprovantes_evidencia')) return [];
      if (comando.startsWith('DELETE FROM evidencias_esperadas')) return [];
      if (comando.startsWith('DELETE FROM entregaveis')) { entregavelExiste = false; return []; }
      throw new Error(`SQL inesperado: ${comando}`);
    }) };
    const db = { transaction: jest.fn(async (cb: (manager: typeof m) => Promise<unknown>) => cb(m)) };
    const auditoria = { registrarNaTransacao: jest.fn(async () => { expect(entregavelExiste).toBe(true); }) };
    const service = new ExclusaoPlanejamentoService(db as never, auditoria as never,
      { removerPersistido: jest.fn() } as never);
    await expect(service.excluir('entregavel', 'contrato', 'entregavel', ator)).resolves.toMatchObject({ excluido: true });
    expect(auditoria.registrarNaTransacao).toHaveBeenCalledTimes(1);
  });

  it('falha em remoção física após COMMIT retorna resultado verdadeiro e pendência, não falso HTTP 409', async () => {
    const m = { query: jest.fn(async (comando: string) => {
      if (comando.includes('SELECT id FROM contratos')) return [{ id: 'contrato' }];
      if (comando.includes('SELECT id FROM entregaveis')) return [{ id: 'entregavel' }];
      if (comando.includes('SELECT id, codigo_publico, arquivado_em FROM evidencias_esperadas'))
        return [{ id: 'esperada', codigo_publico: 2, arquivado_em: new Date() }];
      if (comando.startsWith('DELETE FROM comprovantes_evidencia')) return [{ storage_key: 'b'.repeat(32) }];
      if (comando.startsWith('DELETE FROM evidencias_esperadas')) return [];
      throw new Error(`SQL inesperado: ${comando}`);
    }) };
    const db = { transaction: jest.fn(async (cb: (manager: typeof m) => Promise<unknown>) => cb(m)) };
    const auditoria = { registrarNaTransacao: jest.fn() };
    const storage = { removerPersistido: jest.fn(async () => { throw new Error('EACCES'); }) };
    const service = new ExclusaoPlanejamentoService(db as never, auditoria as never, storage as never);
    await expect(service.excluir('evidencia', 'contrato', 'esperada', ator, 'entregavel'))
      .resolves.toMatchObject({ excluido: true, limpezaPendente: 1 });
    expect(storage.removerPersistido).toHaveBeenCalledTimes(1);
  });
});
