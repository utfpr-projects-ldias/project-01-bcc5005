import { jest, it, expect } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { ExclusaoPlanejamentoService } from './exclusao-planejamento.service.js';

it('B04: exclusão definitiva de etapa com histórico operacional falha sem DELETE nem limpeza física', async () => {
  const consultas: string[] = [];
  const manager = {
    getRepository: () => ({findOne:async()=>({ativo:true,perfil:'ADMINISTRADOR',supertokensUserId:'qa'})}),
    query: jest.fn(async (sql: string) => {
      consultas.push(sql);
      if (sql.includes('SELECT id, status, arquivado_em, conclusao_solicitada_em FROM contratos')) return [{ id: 'contrato' }];
      if (sql.includes('SELECT * FROM "etapas"')) return [{ codigo_publico: 123, sequencia: 2, arquivado_em: new Date() }];
      if (sql.includes('SELECT EXISTS')) return [{ possui: true }];
      throw new Error('Query inesperada no cenário de bloqueio');
    }),
  };
  const dataSource = { transaction: jest.fn(async (fn: (m: typeof manager) => Promise<unknown>) => fn(manager)) };
  const auditoria = { registrarNaTransacao: jest.fn(async () => undefined) };
  const armazenamento = { removerPersistido: jest.fn(async () => undefined) };
  const service = new ExclusaoPlanejamentoService(dataSource as never, auditoria as never, armazenamento as never);
  await expect(service.excluir('etapa', 'contrato', 'etapa', { id:'admin', perfil:'ADMINISTRADOR', supertokensUserId:'qa' } as never))
    .rejects.toBeInstanceOf(ConflictException);
  expect(consultas.some(q => q.includes('DELETE FROM'))).toBe(false);
  expect(auditoria.registrarNaTransacao).not.toHaveBeenCalled();
  expect(armazenamento.removerPersistido).not.toHaveBeenCalled();
});

it('B04: FK restritiva concorrente vira 409 sem expor SQL', async () => {
  const erro = { driverError: { code: '23503' } };
  const service = new ExclusaoPlanejamentoService({ transaction: jest.fn(async () => { throw erro; }) } as never,
    {} as never, {} as never);
  await expect(service.excluir('entregavel', 'c', 'e', {} as never)).rejects.toBeInstanceOf(ConflictException);
});
