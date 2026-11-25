import { jest } from '@jest/globals';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { ExclusaoContratoService } from './exclusao-contrato.service.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';

const ID = '11111111-1111-4111-8111-111111111111';
const admin = { id: 'a', perfil: 'ADMINISTRADOR', supertokensUserId: 's' } as UsuarioAutenticado;
const colaborador = { ...admin, perfil: 'COLABORADOR' } as UsuarioAutenticado;
function preparar(dependentes = false) {
  const ordem: string[] = [];
  const query = jest.fn<(sql: string, params: unknown[]) => Promise<unknown[]>>().mockImplementation(async (sql) => {
    ordem.push(sql.match(/^\s*(?:SELECT|DELETE)\s+(?:FROM\s+)?[a-z_]+/i)?.[0]?.trim() ?? sql.slice(0, 35));
    if (sql.includes('SELECT id, codigo_publico')) return [{ id: ID, codigo_publico: '00001', numero_contrato: 'QA', arquivado_em: new Date() }];
    if (sql.includes('possui_dependencias')) return [{ possui_dependencias: dependentes }];
    return [];
  });
  const registrar = jest.fn<(...args: unknown[]) => Promise<void>>().mockImplementation(async () => { ordem.push('auditoria'); });
  const transacao = jest.fn<(fn: (m: EntityManager) => Promise<unknown>) => Promise<unknown>>().mockImplementation(fn => fn({ query } as unknown as EntityManager));
  const service = new ExclusaoContratoService(
    { transaction: transacao } as unknown as DataSource,
    { registrarNaTransacao: registrar } as unknown as AuditoriaService,
  );
  return { service, query, ordem, registrar };
}

describe('Exclusão definitiva de contrato arquivado', () => {
  test('administrador: auditoria antes do DELETE, planejamento vazio antes do contrato', async () => {
    const x = preparar();
    expect(await x.service.excluir(ID, admin)).toEqual({ excluido: true, arquivosPendentes: 0 });
    expect(x.ordem.indexOf('auditoria')).toBeLessThan(x.ordem.findIndex(item => item.startsWith('DELETE')));
    expect(x.ordem.at(-1)).toContain('DELETE FROM contratos');
    expect(x.ordem.some(s => /DELETE FROM (comprovantes_evidencia|documentos_contratuais)/.test(s))).toBe(false);
    expect(x.registrar).toHaveBeenCalledWith(expect.anything(), admin, expect.objectContaining({
      acao: AcaoAuditoria.CONTRATO_EXCLUIDO, entidadeId: ID,
    }));
  });
  test('com histórico operacional retorna 409 sem auditar, apagar dados ou remover arquivos', async () => {
    const x = preparar(true);
    await expect(x.service.excluir(ID, admin)).rejects.toBeInstanceOf(ConflictException);
    expect(x.registrar).not.toHaveBeenCalled();
    expect(x.ordem.some(s => s.startsWith('DELETE'))).toBe(false);
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
  test('a consulta de proteção inclui arquivos, execuções manuais e declarações preliminares', async () => {
    const x = preparar(true);
    await expect(x.service.excluir(ID, admin)).rejects.toBeInstanceOf(ConflictException);
    const sql = x.query.mock.calls.find(([q]) => q.includes('possui_dependencias'))?.[0] ?? '';
    for (const fonte of ['documentos_contratuais','comprovantes_evidencia','execucoes_entregavel','execucoes_quantitativas_diretas','rascunho_envio'])
      expect(sql).toContain(fonte);
  });
});
