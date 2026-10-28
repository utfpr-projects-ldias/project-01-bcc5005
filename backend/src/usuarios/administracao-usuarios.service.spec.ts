import { jest } from '@jest/globals';
import {
  BadRequestException, ConflictException, ForbiddenException,
  InternalServerErrorException, Logger,
} from '@nestjs/common';
import type { DataSource, Repository, EntityManager } from 'typeorm';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { PerfilUsuario } from './perfil-usuario.enum.js';
import { Usuario } from './usuario.entity.js';
import { AdministracaoUsuariosService } from './administracao-usuarios.service.js';
import type { IdentidadesFuncionariosService } from './identidades-funcionarios.service.js';

const ator = { id: 'uuid-admin', supertokensUserId: 'st-admin', perfil: PerfilUsuario.ADMINISTRADOR, email: 'admin@example.com' };
const pedido = { nome: 'Pessoa de Teste', email: 'func@example.com', senhaInicial: 'SenhaForte!1234', perfil: PerfilUsuario.GESTOR };
const admin = Object.assign(new Usuario(), { id: ator.id, supertokensUserId: ator.supertokensUserId, email: ator.email, ativo: true, perfil: PerfilUsuario.ADMINISTRADOR });
const usuario = Object.assign(new Usuario(), {
  id: 'uuid-func', supertokensUserId: 'st-func', nome: pedido.nome, email: pedido.email,
  perfil: PerfilUsuario.GESTOR, ativo: true, criadoEm: new Date(),
});

const buscarEmail = jest.fn<(...args: unknown[]) => Promise<Usuario | null>>();
const listar = jest.fn<(...args: unknown[]) => Promise<Usuario[]>>();
const criarIdentidade = jest.fn<(email: string, senha: string) => Promise<string>>();
const excluirIdentidade = jest.fn<(id: string) => Promise<void>>();
const alterarEmail = jest.fn<(id: string, email: string) => Promise<void>>();
const definirSenha = jest.fn<(id: string, senha: string) => Promise<void>>();
const salvar = jest.fn<(...args: unknown[]) => Promise<Usuario>>();
const findOne = jest.fn<(...args: unknown[]) => Promise<Usuario | null>>();
const criar = jest.fn<(...args: unknown[]) => Usuario>();
const auditar = jest.fn<(...args: unknown[]) => Promise<void>>();
const auditarExecucao = jest.fn<(...args: unknown[]) => Promise<void>>();
const repoTx = { findOne, findOneBy: buscarEmail, create: criar, save: salvar };
const manager = { getRepository: () => repoTx } as unknown as EntityManager;
const transacao = jest.fn<(fn: (m: EntityManager) => Promise<unknown>) => Promise<unknown>>();
const svc = new AdministracaoUsuariosService(
  { findOneBy: buscarEmail, find: listar } as unknown as Repository<Usuario>,
  { criar: criarIdentidade, excluirCriacaoIncompleta: excluirIdentidade, alterarEmail, definirNovaSenha: definirSenha } as unknown as IdentidadesFuncionariosService,
  { transaction: transacao } as unknown as DataSource,
  { registrarNaTransacao: auditar, executarComAuditoria: auditarExecucao } as unknown as AuditoriaService,
);

beforeEach(() => {
  jest.resetAllMocks();
  buscarEmail.mockResolvedValue(null);
  listar.mockResolvedValue([usuario]);
  criarIdentidade.mockResolvedValue('st-func');
  excluirIdentidade.mockResolvedValue(undefined);
  alterarEmail.mockResolvedValue(undefined);
  definirSenha.mockResolvedValue(undefined);
  findOne.mockResolvedValue(admin);
  criar.mockReturnValue(usuario);
  salvar.mockResolvedValue(usuario);
  auditar.mockResolvedValue(undefined);
  auditarExecucao.mockResolvedValue(undefined);
  transacao.mockImplementation(async (fn) => fn(manager));
});

describe('TEC07-AJUSTES-01: criação de conta com auditoria', () => {
  it('persiste novo usuário e USUARIO_CRIADO no mesmo EntityManager', async () => {
    const resp = await svc.criar(pedido, ator);
    expect(resp).toMatchObject({ nome: pedido.nome, email: pedido.email });
    expect(criarIdentidade).toHaveBeenCalledWith(pedido.email, pedido.senhaInicial);
    expect(transacao).toHaveBeenCalledTimes(1);
    expect(auditar).toHaveBeenCalledWith(manager, ator, expect.objectContaining({
      acao: AcaoAuditoria.USUARIO_CRIADO, entidadeTipo: 'USUARIO', entidadeId: usuario.id,
    }));
    expect(JSON.stringify(auditar.mock.calls)).not.toContain(pedido.senhaInicial);
    expect(JSON.stringify(resp)).not.toContain('st-func');
  });

  it('nega perfil ADMINISTRADOR antes de usar SuperTokens', async () => {
    await expect(svc.criar({ ...pedido, perfil: PerfilUsuario.ADMINISTRADOR }, ator))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(criarIdentidade).not.toHaveBeenCalled();
  });

  it('nega outro perfil de autor antes de usar SuperTokens', async () => {
    await expect(svc.criar(pedido, { ...ator, perfil: PerfilUsuario.GESTOR }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('nega duplicidade antes da criação SuperTokens', async () => {
    buscarEmail.mockResolvedValue(usuario);
    await expect(svc.criar(pedido, ator)).rejects.toBeInstanceOf(ConflictException);
    expect(criarIdentidade).not.toHaveBeenCalled();
  });

  it('compensa identidade recém-criada quando falha auditoria de criação', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      auditar.mockRejectedValue(new Error('falha auditoria'));
      await expect(svc.criar(pedido, ator)).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(excluirIdentidade).toHaveBeenCalledWith('st-func');
      expect(log).toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });

  it('sinaliza reconciliação quando não consegue compensar', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      auditar.mockRejectedValue(new Error('falha auditoria'));
      excluirIdentidade.mockRejectedValue(new Error('falha core'));
      await expect(svc.criar(pedido, ator)).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(log).toHaveBeenCalledWith('Falha na compensação da identidade recém-criada; exige reconciliação manual');
    } finally { log.mockRestore(); }
  });

  it('não expõe ID SuperTokens nem senha na listagem legada', async () => {
    const dados = await svc.listar();
    expect(dados).toHaveLength(1);
    expect(JSON.stringify(dados)).not.toContain('st-func');
    expect(JSON.stringify(dados)).not.toContain('SenhaForte');
  });
});

describe('Credenciais administrativas', () => {
  it('nega mudança de credencial do próprio Administrador', async () => {
    await expect(svc.alterarEmail(ator.id, 'novo@example.com', ator))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.redefinirSenha(ator.id, 'NovaSenha!1234', ator))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
  it('registra tentativa e confirmação sem segredo na redefinição', async () => {
    buscarEmail.mockImplementation(async (args) => (args as {id: string})?.id === ator.id ? admin : usuario);
    await svc.redefinirSenha(usuario.id, 'NovaSenha!1234', ator);
    expect(definirSenha).toHaveBeenCalledWith('st-func', 'NovaSenha!1234');
    expect(auditarExecucao).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(auditarExecucao.mock.calls)).not.toContain('NovaSenha!1234');
  });
});
