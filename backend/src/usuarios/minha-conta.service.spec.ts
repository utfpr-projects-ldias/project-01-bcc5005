import { jest } from '@jest/globals';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import EmailPassword from 'supertokens-node/recipe/emailpassword';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { PerfilUsuario } from './perfil-usuario.enum.js';
import { Usuario } from './usuario.entity.js';
import type { IdentidadesFuncionariosService } from './identidades-funcionarios.service.js';
import { MinhaContaService } from './minha-conta.service.js';

const ator = { id: 'uuid-admin', supertokensUserId: 'st-admin', perfil: PerfilUsuario.ADMINISTRADOR, email: 'admin@qa.org' };
const criarAdmin = () => Object.assign(new Usuario(), { ...ator, ativo: true, email: ator.email, nome: 'Admin QA' });
const encontrar = jest.fn<() => Promise<Usuario | null>>();
const encontrarTx = jest.fn<() => Promise<Usuario | null>>();
const encontrarEmail = jest.fn<() => Promise<Usuario | null>>();
const salvar = jest.fn<(usuario: Usuario) => Promise<Usuario>>();
const alterarEmail = jest.fn<(id: string, email: string) => Promise<void>>();
const definirSenha = jest.fn<(id: string, senha: string) => Promise<void>>();
const auditoriaTx = jest.fn<(...args: unknown[]) => Promise<void>>();
const auditoriaAcao = jest.fn<(_ator: unknown, executar: () => Promise<{ resultado: unknown }>) => Promise<unknown>>();
const transacao = jest.fn<(callback: (manager: EntityManager) => Promise<unknown>) => Promise<unknown>>();
const repo = { findOneBy: encontrar } as unknown as Repository<Usuario>;
const repoTx = { findOne: encontrarTx, findOneBy: encontrarEmail, save: salvar };
const manager = { getRepository: () => repoTx } as unknown as EntityManager;
const svc = new MinhaContaService(repo,
  { alterarEmail, definirNovaSenha: definirSenha } as unknown as IdentidadesFuncionariosService,
  { transaction: transacao } as unknown as DataSource,
  { registrarNaTransacao: auditoriaTx, executarComAuditoria: auditoriaAcao } as unknown as AuditoriaService);

beforeEach(() => {
  jest.restoreAllMocks(); jest.resetAllMocks();
  encontrar.mockResolvedValue(criarAdmin()); encontrarTx.mockResolvedValue(criarAdmin());
  encontrarEmail.mockResolvedValue(null); salvar.mockImplementation(async (u: Usuario) => u);
  alterarEmail.mockResolvedValue(undefined); definirSenha.mockResolvedValue(undefined);
  auditoriaTx.mockResolvedValue(undefined);
  transacao.mockImplementation(async (f: (m: EntityManager) => Promise<unknown>) => f(manager));
  auditoriaAcao.mockImplementation(async (_u: unknown, f: () => Promise<{resultado: unknown}>) => (await f()).resultado);
  jest.spyOn(EmailPassword, 'signIn').mockResolvedValue({ status: 'OK', user: { id: 'st-admin' } } as never);
});

it('admin altera seu próprio e-mail após verificar senha e audita sem segredos', async () => {
  const r = await svc.alterarEmail('NOVO@QA.ORG', 'SenhaAnterior!456', ator);
  expect(r.email).toBe('novo@qa.org');
  expect(jest.spyOn(EmailPassword, 'signIn')).toHaveBeenCalledWith('public', 'admin@qa.org', 'SenhaAnterior!456');
  expect(alterarEmail).toHaveBeenCalledWith('st-admin', 'novo@qa.org');
  expect(auditoriaTx).toHaveBeenCalledWith(manager, ator, expect.objectContaining({
    acao: AcaoAuditoria.USUARIO_EMAIL_ALTERADO, entidadeId: ator.id,
  }));
  expect(JSON.stringify(auditoriaTx.mock.calls)).not.toContain('SenhaAnterior!456');
  expect(r).not.toHaveProperty('supertokensUserId');
});

it('admin não pode alterar conta alheia nem forjar perfil no corpo (origem é sessão)', async () => {
  await expect(svc.alterarEmail('novo@qa.org', 'senha', { ...ator, perfil: PerfilUsuario.GESTOR })).rejects.toBeInstanceOf(ForbiddenException);
  expect(EmailPassword.signIn).not.toHaveBeenCalled();
  expect(alterarEmail).not.toHaveBeenCalled();
});

it('senha atual inválida bloqueia alteração antes de usar SuperTokens de escrita', async () => {
  jest.spyOn(EmailPassword, 'signIn').mockResolvedValue({ status: 'WRONG_CREDENTIALS_ERROR' } as never);
  await expect(svc.alterarEmail('outro@qa.org', 'errada', ator)).rejects.toBeInstanceOf(UnauthorizedException);
  expect(transacao).not.toHaveBeenCalled(); expect(alterarEmail).not.toHaveBeenCalled();
});

it('identity verificada precisa ser exatamente a do admin da sessão', async () => {
  jest.spyOn(EmailPassword, 'signIn').mockResolvedValue({ status: 'OK', user: { id: 'outro-user' } } as never);
  await expect(svc.alterarSenha('senha', 'OutraSenha!12345', ator)).rejects.toBeInstanceOf(UnauthorizedException);
  expect(definirSenha).not.toHaveBeenCalled();
});

it('compensa e-mail no SuperTokens se falhar auditoria ou commit no Postgres', async () => {
  auditoriaTx.mockRejectedValueOnce(new Error('auditoria falhou'));
  await expect(svc.alterarEmail('nova@qa.org', 'antiga', ator)).rejects.toThrow('auditoria falhou');
  expect(alterarEmail).toHaveBeenNthCalledWith(1, 'st-admin', 'nova@qa.org');
  expect(alterarEmail).toHaveBeenNthCalledWith(2, 'st-admin', 'admin@qa.org');
});

it('senha é própria, diferente da antiga, auditada sem revelar segredo', async () => {
  await expect(svc.alterarSenha('Igual!123456', 'Igual!123456', ator)).rejects.toBeInstanceOf(ConflictException);
  await svc.alterarSenha('Antiga!123456', 'NovaForte!123456', ator);
  expect(definirSenha).toHaveBeenCalledTimes(1);
  expect(definirSenha).toHaveBeenCalledWith('st-admin', 'NovaForte!123456');
  expect(auditoriaAcao).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(auditoriaAcao.mock.calls)).not.toContain('NovaForte!123456');
});
