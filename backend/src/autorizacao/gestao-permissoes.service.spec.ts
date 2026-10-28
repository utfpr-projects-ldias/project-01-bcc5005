import { jest } from '@jest/globals';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { PermissaoContrato } from './permissao-contrato.entity.js';
import { GestaoPermissoesService } from './gestao-permissoes.service.js';

const adminId = 'b3c760ee-8ed7-4098-8a16-9d5759ca5986';
const pessoaId = 'c3c760ee-8ed7-4098-8a16-9d5759ca5986';
const contratoId = 'd3c760ee-8ed7-4098-8a16-9d5759ca5986';
const ator = { id: adminId, supertokensUserId: 'st-admin', perfil: PerfilUsuario.ADMINISTRADOR, email: 'admin@example.com' };
const admin = Object.assign(new Usuario(), { id: adminId, supertokensUserId: 'st-admin', perfil: PerfilUsuario.ADMINISTRADOR, ativo: true });
const gestor = Object.assign(new Usuario(), { id: pessoaId, supertokensUserId: 'st-pessoa', perfil: PerfilUsuario.GESTOR, ativo: true });
const findOneUsuario = jest.fn<(...args: unknown[]) => Promise<Usuario | null>>();
const findOneByUsuario = jest.fn<(...args: unknown[]) => Promise<Usuario | null>>();
const findOneByContrato = jest.fn<(...args: unknown[]) => Promise<Contrato | null>>();
const findOneVinculo = jest.fn<(...args: unknown[]) => Promise<PermissaoContrato | null>>();
const salvar = jest.fn<(...args: unknown[]) => Promise<PermissaoContrato>>();
const remover = jest.fn<(...args: unknown[]) => Promise<PermissaoContrato>>();
const auditoria = jest.fn<(...args: unknown[]) => Promise<void>>();
const manager = { getRepository: (entity: unknown) => {
  if (entity === Usuario) return { findOne: findOneUsuario, findOneBy: findOneByUsuario };
  if (entity === Contrato) return { findOneBy: findOneByContrato };
  return { findOne: findOneVinculo, find: jest.fn(), create: (v: PermissaoContrato) => v, save: salvar, remove: remover };
} } as unknown as EntityManager;
const transaction = jest.fn<(cb: (manager: EntityManager) => Promise<unknown>) => Promise<unknown>>();
const db = { transaction, getRepository: (entity: unknown) => manager.getRepository(entity as never) } as unknown as DataSource;
const service = new GestaoPermissoesService(db, { registrarNaTransacao: auditoria } as unknown as AuditoriaService);

beforeEach(() => {
  jest.resetAllMocks();
  transaction.mockImplementation(async (cb) => cb(manager));
  findOneByUsuario.mockImplementation(async (where) => (where as {id: string}).id === adminId ? admin : gestor);
  findOneUsuario.mockResolvedValue(gestor);
  findOneByContrato.mockResolvedValue(Object.assign(new Contrato(), { id: contratoId }));
  findOneVinculo.mockResolvedValue(null);
  salvar.mockImplementation(async (v) => v as PermissaoContrato);
  auditoria.mockResolvedValue(undefined);
});

describe('TEC07-AJUSTES-01: permissões por contrato', () => {
  it('impede Gestor de conceder acesso a si mesmo', async () => {
    await expect(service.conceder(pessoaId, { contratoId, podeEditar: false }, {
      ...ator, perfil: PerfilUsuario.GESTOR,
    })).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('nega podeEditar para Colaborador', async () => {
    findOneUsuario.mockResolvedValue(Object.assign(new Usuario(), gestor, { perfil: PerfilUsuario.COLABORADOR }));
    await expect(service.conceder(pessoaId, { contratoId, podeEditar: true }, ator))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(salvar).not.toHaveBeenCalled();
  });
  it('nega vínculo para contrato inexistente', async () => {
    findOneByContrato.mockResolvedValue(null);
    await expect(service.conceder(pessoaId, { contratoId, podeEditar: false }, ator))
      .rejects.toBeInstanceOf(NotFoundException);
  });
  it('concede vínculo com auditoria na mesma transação', async () => {
    const resultado = await service.conceder(pessoaId, { contratoId, podeEditar: true }, ator);
    expect(resultado).toMatchObject({ contratoId, podeEditar: true });
    expect(auditoria).toHaveBeenCalledWith(manager, ator, expect.objectContaining({
      acao: AcaoAuditoria.USUARIO_PERMISSAO_CONCEDIDA, entidadeId: pessoaId,
    }));
  });
  it('revoga vínculo existente com auditoria', async () => {
    const vinculo = Object.assign(new PermissaoContrato(), { usuarioId: pessoaId, contratoId, podeEditar: true });
    findOneVinculo.mockResolvedValue(vinculo); remover.mockResolvedValue(vinculo);
    await service.revogar(pessoaId, contratoId, ator);
    expect(remover).toHaveBeenCalled();
    expect(auditoria).toHaveBeenCalledWith(manager, ator, expect.objectContaining({
      acao: AcaoAuditoria.USUARIO_PERMISSAO_REVOGADA,
    }));
  });
});
