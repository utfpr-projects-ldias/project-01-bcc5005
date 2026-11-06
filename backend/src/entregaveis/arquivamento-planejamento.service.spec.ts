import { jest } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Entregavel } from './entregavel.entity.js';
import { EvidenciaEsperada } from './evidencia-esperada.entity.js';
import { ArquivamentoPlanejamentoService } from './arquivamento-planejamento.service.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const entregavelId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const evidenciaId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ator: UsuarioAutenticado = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  perfil: PerfilUsuario.ADMINISTRADOR, supertokensUserId: 'st-admin', email: 'a@example.test' };

function base() {
  const contrato = { id: contratoId, arquivadoEm: null as Date | null };
  const entregue = { id: entregavelId, contratoId, arquivadoEm: null as Date | null, arquivadoPor: null as string | null };
  const esperada = { id: evidenciaId, entregavelId, arquivadoEm: null as Date | null, arquivadoPor: null as string | null };
  const query = { setLock: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getOne: jest.fn(async () => contrato) };
  const repoContrato = { createQueryBuilder: jest.fn(() => query) };
  const repoEntregavel = { findOneBy: jest.fn(async () => entregue as Entregavel), save: jest.fn(async (e: unknown) => e) };
  const repoEvidencia = { findOneBy: jest.fn(async () => esperada as EvidenciaEsperada), count: jest.fn(async () => 1), save: jest.fn(async (e: unknown) => e) };
  const m = { getRepository: jest.fn((entity: unknown) => entity === Contrato ? repoContrato : entity === Entregavel ? repoEntregavel : repoEvidencia) };
  const db = { transaction: jest.fn(async (fn: (manager: typeof m) => Promise<unknown>) => fn(m)) };
  const auditoria = { registrarNaTransacao: jest.fn(async () => undefined) };
  const service = new ArquivamentoPlanejamentoService(db as never, auditoria as never);
  return { service, db, auditoria, contrato, entregue, esperada, repoEntregavel, repoEvidencia, query };
}

test('arquiva e reativa entregável com evento na mesma transação, sem exclusão', async () => {
  const a = base();
  await a.service.alterarEntregavel(contratoId, entregavelId, true, ator);
  expect(a.entregue.arquivadoEm).toBeInstanceOf(Date);
  expect(a.repoEntregavel.save).toHaveBeenCalledTimes(1);
  expect(a.auditoria.registrarNaTransacao).toHaveBeenCalledWith(expect.anything(), ator,
    expect.objectContaining({ acao: AcaoAuditoria.ENTREGAVEL_ARQUIVADO, entidadeId: entregavelId }));
  await expect(a.service.alterarEntregavel(contratoId, entregavelId, true, ator)).rejects.toBeInstanceOf(ConflictException);
  await a.service.alterarEntregavel(contratoId, entregavelId, false, ator);
  expect(a.entregue.arquivadoEm).toBeNull();
  expect(a.auditoria.registrarNaTransacao).toHaveBeenCalledWith(expect.anything(), ator,
    expect.objectContaining({ acao: AcaoAuditoria.ENTREGAVEL_REATIVADO }));
});

test('arquiva somente a evidência selecionada; não apaga nem altera o entregável', async () => {
  const a = base();
  await a.service.alterarEvidencia(contratoId, entregavelId, evidenciaId, true, ator);
  expect(a.esperada.arquivadoEm).toBeInstanceOf(Date);
  expect(a.entregue.arquivadoEm).toBeNull();
  expect(a.repoEvidencia.save).toHaveBeenCalledTimes(1);
  await a.service.alterarEvidencia(contratoId, entregavelId, evidenciaId, false, ator);
  expect(a.esperada.arquivadoEm).toBeNull();
});

test('contrato arquivado ou item pai arquivado bloqueia nova escrita', async () => {
  const a = base();
  a.contrato.arquivadoEm = new Date();
  await expect(a.service.alterarEvidencia(contratoId, entregavelId, evidenciaId, true, ator)).rejects.toBeInstanceOf(ConflictException);
  a.contrato.arquivadoEm = null;
  a.entregue.arquivadoEm = new Date();
  await expect(a.service.alterarEvidencia(contratoId, entregavelId, evidenciaId, true, ator)).rejects.toBeInstanceOf(ConflictException);
  expect(a.auditoria.registrarNaTransacao).not.toHaveBeenCalled();
});

test('IDs fora da relação contrato-entregável não são aceitos', async () => {
  const a = base();
  a.repoEntregavel.findOneBy.mockResolvedValueOnce(null as never);
  await expect(a.service.alterarEvidencia(contratoId, entregavelId, evidenciaId, true, ator)).rejects.toBeInstanceOf(NotFoundException);
});


test('reativação recusa ultrapassar dez evidências ativas preservando item arquivado', async () => {
  const a = base();
  a.esperada.arquivadoEm = new Date();
  a.repoEvidencia.count.mockResolvedValueOnce(10);
  await expect(a.service.alterarEvidencia(contratoId, entregavelId, evidenciaId, false, ator))
    .rejects.toBeInstanceOf(ConflictException);
  expect(a.esperada.arquivadoEm).toBeInstanceOf(Date);
  expect(a.repoEvidencia.save).not.toHaveBeenCalled();
  expect(a.auditoria.registrarNaTransacao).not.toHaveBeenCalled();
});
