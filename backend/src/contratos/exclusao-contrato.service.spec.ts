import { jest } from '@jest/globals';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { ExclusaoContratoService } from './exclusao-contrato.service.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ArmazenamentoArquivos } from '../armazenamento/contrato-armazenamento.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';

const ID = '11111111-1111-4111-8111-111111111111';
const admin = { id: 'a', perfil: 'ADMINISTRADOR', supertokensUserId: 's' } as UsuarioAutenticado;
const colaborador = { ...admin, perfil: 'COLABORADOR' } as UsuarioAutenticado;
function preparar(arquivo: boolean = true) {
  const ordem: string[] = [];
  const remover = jest.fn<(chave: string) => Promise<void>>().mockImplementation(async () => { if (!arquivo) throw new Error('falha de disco'); });
  const query = jest.fn<(sql: string, params: unknown[]) => Promise<unknown[]>>().mockImplementation(async (sql) => {
    ordem.push(sql.match(/^\s*(?:SELECT|DELETE)\s+(?:FROM\s+)?[a-z_]+/i)?.[0]?.trim() ?? sql.slice(0, 35));
    if (sql.includes('SELECT id, codigo_publico')) return [{ id: ID, codigo_publico: '00001', numero_contrato: 'QA', arquivado_em: new Date() }];
    if (sql.includes('DELETE FROM comprovantes_evidencia')) return [{ storage_key: 'a'.repeat(32) }];
    if (sql.includes('DELETE FROM documentos_contratuais')) return [{ storage_key: 'b'.repeat(32) }];
    return [];
  });
  const registrar = jest.fn<(...args: unknown[]) => Promise<void>>().mockImplementation(async () => { ordem.push('auditoria'); });
  const transacao = jest.fn<(fn: (m: EntityManager) => Promise<unknown>) => Promise<unknown>>().mockImplementation(fn => fn({ query } as unknown as EntityManager));
  const service = new ExclusaoContratoService(
    { transaction: transacao } as unknown as DataSource,
    { registrarNaTransacao: registrar } as unknown as AuditoriaService,
    { removerPersistido: remover } as unknown as ArmazenamentoArquivos,
  );
  return { service, query, ordem, remover, registrar };
}

describe('Exclusão definitiva de contrato arquivado', () => {
  test('administrador: auditoria antes do DELETE, dependentes antes do contrato e blobs após COMMIT', async () => {
    const x = preparar();
    expect(await x.service.excluir(ID, admin)).toEqual({ excluido: true, arquivosPendentes: 0 });
    expect(x.ordem.indexOf('auditoria')).toBeLessThan(x.ordem.findIndex(item => item.startsWith('DELETE')));
    expect(x.ordem.at(-1)).toContain('DELETE FROM contratos');
    expect(x.remover).toHaveBeenCalledTimes(2);
    expect(x.registrar).toHaveBeenCalledWith(expect.anything(), admin, expect.objectContaining({
      acao: AcaoAuditoria.CONTRATO_EXCLUIDO, entidadeId: ID,
    }));
  });
  test('colaborador não pode excluir nem iniciar transação', async () => {
    const x = preparar();
    await expect(x.service.excluir(ID, colaborador)).rejects.toBeInstanceOf(ForbiddenException);
    expect(x.query).not.toHaveBeenCalled();
  });
  test('exige contrato existente e previamente arquivado', async () => {
    const x = preparar();
    x.query.mockResolvedValueOnce([]);
    await expect(x.service.excluir(ID, admin)).rejects.toBeInstanceOf(NotFoundException);
    x.query.mockResolvedValueOnce([{ id: ID, codigo_publico: '00001', numero_contrato: 'QA', arquivado_em: null }]);
    await expect(x.service.excluir(ID, admin)).rejects.toBeInstanceOf(ConflictException);
    expect(x.registrar).not.toHaveBeenCalled();
  });
  test('blobs com falha após commit não desfazem exclusão SQL', async () => {
    const x = preparar(false);
    expect(await x.service.excluir(ID, admin)).toEqual({ excluido: true, arquivosPendentes: 2 });
  });
});
