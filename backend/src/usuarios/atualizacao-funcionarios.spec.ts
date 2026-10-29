import { jest } from '@jest/globals';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { IdentidadesFuncionariosService } from './identidades-funcionarios.service.js';
import { AdministracaoUsuariosService } from './administracao-usuarios.service.js';
import { PerfilUsuario } from './perfil-usuario.enum.js';
import { Usuario } from './usuario.entity.js';

const adminId = 'adc91508-edbf-485a-8364-9b2e35a8c01c';
const funcionarioId = '25d9ec2d-e4ae-442b-93bb-ed1963fa6780';
const ator = { id: adminId, supertokensUserId: 'st-admin', email: 'admin@example.com', perfil: PerfilUsuario.ADMINISTRADOR };
const buscar = jest.fn<(id: string) => Promise<Usuario | null>>();
const salvar = jest.fn<(usuario: Usuario) => Promise<Usuario>>();
const auditar = jest.fn<() => Promise<void>>();
const manager = { getRepository: () => ({
  findOne: ({ where }: { where: { id: string } }) => buscar(where.id), save: salvar,
}) } as unknown as EntityManager;
const transacao = jest.fn<(callback: (manager: EntityManager) => Promise<unknown>) => Promise<unknown>>();
const svc = new AdministracaoUsuariosService(
  {} as Repository<Usuario>,
  {} as IdentidadesFuncionariosService,
  { transaction: transacao } as unknown as DataSource,
  { registrarNaTransacao: auditar } as unknown as AuditoriaService,
);
const admin = () => Object.assign(new Usuario(), { id: adminId, supertokensUserId: 'st-admin', email: ator.email,
  nome: null, perfil: PerfilUsuario.ADMINISTRADOR, ativo: true, criadoEm: new Date() });
const funcionario = () => Object.assign(new Usuario(), { id: funcionarioId, supertokensUserId: 'st-func',
  email: 'func@example.com', nome: 'Pessoa de Teste', perfil: PerfilUsuario.GESTOR, ativo: true, criadoEm: new Date() });

beforeEach(() => {
  jest.resetAllMocks();
  buscar.mockImplementation(async (id) => id === adminId ? admin() : id === funcionarioId ? funcionario() : null);
  salvar.mockImplementation(async (usuario) => usuario);
  auditar.mockResolvedValue(undefined);
  transacao.mockImplementation(async (callback) => callback(manager));
});

describe('TEC07-06: atualizações de domínio auditáveis', () => {
  it('atualiza perfil e situação com evento na transação', async () => {
    const resultado = await svc.atualizar(funcionarioId, { nome: 'Pessoa Atualizada', perfil: PerfilUsuario.COLABORADOR, ativo: false }, ator);
    expect(resultado).toMatchObject({ nome: 'Pessoa Atualizada', perfil: PerfilUsuario.COLABORADOR, ativo: false });
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(auditar).toHaveBeenCalledTimes(1);
    expect(auditar.mock.calls[0]).toBeDefined();
  });
  it('falha na auditoria reverte a transação (erro propagado)', async () => {
    auditar.mockRejectedValue(new Error('falha auditoria'));
    await expect(svc.atualizar(funcionarioId, { ativo: false }, ator)).rejects.toThrow('falha auditoria');
    expect(salvar).toHaveBeenCalledTimes(1);
  });
  it('proíbe autopromoção e alteração de Administrador (inclusive autorrebaixamento)', async () => {
    // Simula uma requisição inválida que contorna o tipo estático do DTO.
    // O serviço deve rejeitá-la também em tempo de execução.
    const dtoMalicioso = { perfil: PerfilUsuario.ADMINISTRADOR } as unknown as Parameters<typeof svc.atualizar>[1];
    await expect(svc.atualizar(funcionarioId, dtoMalicioso, ator))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.atualizar(adminId, { ativo: false }, ator)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.atualizar(adminId, { perfil: PerfilUsuario.GESTOR }, ator)).rejects.toBeInstanceOf(ForbiddenException);
    expect(salvar).not.toHaveBeenCalled();
  });
  it('permite ao Administrador legado complementar apenas seu nome', async () => {
    const resultado = await svc.atualizar(adminId, { nome: 'Admin de Teste' }, ator);
    expect(resultado.nome).toBe('Admin de Teste');
    expect(auditar).toHaveBeenCalledTimes(1);
  });
  it('não atualiza alvo inexistente', async () => {
    await expect(svc.atualizar('b2b28766-c374-43b0-b2b6-3e84608d3ca1', { nome: 'Pessoa de Teste' }, ator))
      .rejects.toBeInstanceOf(NotFoundException);
  });
  it('nega alterações se autor foi inativado ou não é Admin', async () => {
    await expect(svc.atualizar(funcionarioId, { ativo: false }, { ...ator, perfil: PerfilUsuario.GESTOR }))
      .rejects.toBeInstanceOf(ForbiddenException);
    buscar.mockImplementation(async (id) => id === adminId ? Object.assign(admin(), { ativo: false }) : funcionario());
    await expect(svc.atualizar(funcionarioId, { ativo: false }, ator)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('não cria auditoria para no-op', async () => {
    const retorno = await svc.atualizar(funcionarioId, { nome: 'Pessoa de Teste' }, ator);
    expect(retorno.nome).toBe('Pessoa de Teste');
    expect(salvar).not.toHaveBeenCalled();
    expect(auditar).not.toHaveBeenCalled();
  });
});
