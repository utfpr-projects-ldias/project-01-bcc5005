import { jest } from '@jest/globals';
import { BadRequestException, ConflictException, InternalServerErrorException, Logger } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { PerfilUsuario } from './perfil-usuario.enum.js';
import { Usuario } from './usuario.entity.js';
import { AdministracaoUsuariosService } from './administracao-usuarios.service.js';
import type { UsuariosService } from './usuarios.service.js';
import type { IdentidadesFuncionariosService } from './identidades-funcionarios.service.js';

const criarIdentidade = jest.fn<(email: string, senha: string) => Promise<string>>();
const excluirIdentidade = jest.fn<(id: string) => Promise<void>>();
const provisionar = jest.fn<(dados: { supertokensUserId: string; email: string; perfil: PerfilUsuario }) => Promise<Usuario>>();
const buscarEmail = jest.fn<() => Promise<Usuario | null>>();
const listar = jest.fn<() => Promise<Usuario[]>>();
const usuario: Usuario = Object.assign(new Usuario(), {
  nome: 'Pessoa de Teste',
  id: '876f37aa-7810-42f3-9a75-a08eaaf2311e',
  supertokensUserId: 'st-u1', email: 'func@example.com',
  perfil: PerfilUsuario.GESTOR, ativo: true, criadoEm: new Date(),
});
const transaction = jest.fn<(operacao: (manager: never) => Promise<unknown>) => Promise<unknown>>();
const auditar = jest.fn<() => Promise<void>>();
const svc = new AdministracaoUsuariosService(
  { findOneBy: buscarEmail, find: listar } as unknown as Repository<Usuario>,
  { criarProvisionado: provisionar } as unknown as UsuariosService,
  { criar: criarIdentidade, excluirCriacaoIncompleta: excluirIdentidade } as unknown as IdentidadesFuncionariosService,
  { transaction } as unknown as DataSource,
  { registrarNaTransacao: auditar } as unknown as AuditoriaService,
);
const pedido = { nome: 'Pessoa de Teste', email: 'func@example.com', perfil: PerfilUsuario.GESTOR, senhaInicial: 'MinhaSenha!123' };

beforeEach(() => {
  jest.resetAllMocks();
  buscarEmail.mockResolvedValue(null);
  criarIdentidade.mockResolvedValue('st-u1');
  provisionar.mockResolvedValue(usuario);
  excluirIdentidade.mockResolvedValue(undefined);
  auditar.mockResolvedValue(undefined);
});

describe('TEC07-04: provisionamento controlado', () => {
  it('provisiona GESTOR sem retornar senha ou SuperTokens ID', async () => {
    const resposta = await svc.criar(pedido);
    expect(resposta).toEqual(expect.objectContaining({ email: pedido.email, perfil: PerfilUsuario.GESTOR }));
    expect(JSON.stringify(resposta)).not.toContain('MinhaSenha');
    expect(JSON.stringify(resposta)).not.toContain('st-u1');
    expect(criarIdentidade).toHaveBeenCalledWith(pedido.email, pedido.senhaInicial);
    expect(provisionar).toHaveBeenCalledWith({ supertokensUserId: 'st-u1', email: pedido.email, nome: pedido.nome, perfil: PerfilUsuario.GESTOR });
  });

  it('provisiona COLABORADOR', async () => {
    provisionar.mockResolvedValue(Object.assign(new Usuario(), usuario, { perfil: PerfilUsuario.COLABORADOR }));
    await expect(svc.criar({ ...pedido, perfil: PerfilUsuario.COLABORADOR })).resolves.toMatchObject({ perfil: PerfilUsuario.COLABORADOR });
  });

  it('não permite novo ADMINISTRADOR por API, mesmo com sessão administrativa', async () => {
    await expect(svc.criar({ ...pedido, perfil: PerfilUsuario.ADMINISTRADOR })).rejects.toBeInstanceOf(BadRequestException);
    expect(criarIdentidade).not.toHaveBeenCalled();
  });

  it('nega e-mail já cadastrado sem tentar criar identidade', async () => {
    buscarEmail.mockResolvedValue(usuario);
    await expect(svc.criar(pedido)).rejects.toBeInstanceOf(ConflictException);
    expect(criarIdentidade).not.toHaveBeenCalled();
  });

  it('propaga duplicidade de SuperTokens e não salva no banco da aplicação', async () => {
    criarIdentidade.mockRejectedValue(new ConflictException('E-mail já cadastrado'));
    await expect(svc.criar(pedido)).rejects.toBeInstanceOf(ConflictException);
    expect(provisionar).not.toHaveBeenCalled();
  });

  it('faz compensação se o PostgreSQL falhar após criar identidade', async () => {
    // O erro é esperado neste teste: capturamos o log e validamos seu conteúdo.
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      provisionar.mockRejectedValue(new Error('falha db'));
      await expect(svc.criar(pedido)).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(excluirIdentidade).toHaveBeenCalledWith('st-u1');
      expect(log).toHaveBeenCalledWith('Falha ao persistir funcionário no banco da aplicação');
    } finally {
      log.mockRestore();
    }
  });

  it('não retorna sucesso se falhar a compensação', async () => {
    // Nenhum log real de produção é desligado: este spy existe só neste teste.
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      provisionar.mockRejectedValue(new Error('falha db'));
      excluirIdentidade.mockRejectedValue(new Error('falha core'));
      await expect(svc.criar(pedido)).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(log).toHaveBeenCalledWith('Falha na compensação da identidade recém-criada; exige reconciliação manual');
    } finally {
      log.mockRestore();
    }
  });

  it('lista usuários sem credenciais', async () => {
    listar.mockResolvedValue([usuario]);
    const resultado = await svc.listar();
    expect(resultado).toHaveLength(1);
    expect(JSON.stringify(resultado)).not.toContain('supertokensUserId');
    expect(JSON.stringify(resultado)).not.toContain('senhaInicial');
  });
});
