import { BadRequestException, ConflictException } from '@nestjs/common';
import { jest } from '@jest/globals';
import type { DataSource } from 'typeorm';

import {
  criarAdministradorInicial,
  type ProvedorIdentidadeBootstrap,
} from './bootstrap-admin.service.js';
import { Usuario } from './usuario.entity.js';

// Exercita o contrato do bootstrap sem criar identidades reais.
describe('bootstrap inicial controlado / TEC07-01', () => {
  const contar = jest.fn<(filtro: unknown) => Promise<number>>();
  const buscar = jest.fn<(filtro: unknown) => Promise<Usuario | null>>();
  const executar = jest.fn<() => Promise<unknown>>();
  const queryBuilder = {
    insert: jest.fn(), into: jest.fn(), values: jest.fn(), orIgnore: jest.fn(),
    execute: executar,
  };
  queryBuilder.insert.mockReturnValue(queryBuilder);
  queryBuilder.into.mockReturnValue(queryBuilder);
  queryBuilder.values.mockReturnValue(queryBuilder);
  queryBuilder.orIgnore.mockReturnValue(queryBuilder);
  const query = jest.fn<(sql: string, params: number[]) => Promise<unknown>>();
  const manager = {
    query,
    getRepository: () => ({ countBy: contar, findOneBy: buscar, createQueryBuilder: () => queryBuilder }),
  };
  const transacao = jest.fn<(cb: (transactionManager: typeof manager) => Promise<Usuario>) => Promise<Usuario>>();
  const banco = { transaction: transacao } as unknown as DataSource;
  const criar = jest.fn<(email: string, password: string) => Promise<string>>();
  const autenticar = jest.fn<(email: string, password: string) => Promise<string>>();
  const identidades: ProvedorIdentidadeBootstrap = { criar, autenticar };

  beforeEach(() => {
    contar.mockReset(); buscar.mockReset(); executar.mockReset();
    query.mockReset(); criar.mockReset(); autenticar.mockReset(); transacao.mockReset();
    transacao.mockImplementation(async (cb) => cb(manager));
    query.mockResolvedValue([]);
  });

  it('nega segundo bootstrap, antes de invocar SuperTokens', async () => {
    contar.mockResolvedValue(1);
    await expect(criarAdministradorInicial(banco, {
      modo: 'novo', email: 'admin@example.com', senha: 'senhaSegura1234',
    }, identidades)).rejects.toBeInstanceOf(ConflictException);
    expect(criar).not.toHaveBeenCalled();
  });

  it('cria primeiro admin via serviço controlado e lock transacional', async () => {
    contar.mockResolvedValue(0);
    criar.mockResolvedValue('st-admin');
    buscar.mockResolvedValueOnce(null).mockResolvedValueOnce(Object.assign(new Usuario(), {
      id: 'admin-uuid', supertokensUserId: 'st-admin', email: 'admin@example.com',
      perfil: 'ADMINISTRADOR', ativo: true,
    }));
    executar.mockResolvedValue({});
    const usuario = await criarAdministradorInicial(banco, {
      modo: 'novo', email: 'admin@example.com', senha: 'senhaSegura1234',
    }, identidades);
    expect(usuario.id).toBe('admin-uuid');
    expect(query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1)', [720701]);
    expect(criar).toHaveBeenCalledWith('admin@example.com', 'senhaSegura1234');
    expect(autenticar).not.toHaveBeenCalled();
  });

  it('identidade legada requer verificação da senha, não basta e-mail', async () => {
    contar.mockResolvedValue(0);
    autenticar.mockResolvedValue('st-admin');
    buscar.mockResolvedValueOnce(null).mockResolvedValueOnce(Object.assign(new Usuario(), {
      id: 'admin-uuid', supertokensUserId: 'st-admin', email: 'admin@example.com',
      perfil: 'ADMINISTRADOR', ativo: true,
    }));
    executar.mockResolvedValue({});
    await criarAdministradorInicial(banco, {
      modo: 'existente', email: 'admin@example.com', senha: 'senhaSegura1234',
    }, identidades);
    expect(autenticar).toHaveBeenCalledWith('admin@example.com', 'senhaSegura1234');
    expect(criar).not.toHaveBeenCalled();
  });

  it('rejeita senha fraca antes de consultar o banco', async () => {
    await expect(criarAdministradorInicial(banco, {
      modo: 'novo', email: 'admin@example.com', senha: 'fraca',
    }, identidades)).rejects.toBeInstanceOf(BadRequestException);
    expect(transacao).not.toHaveBeenCalled();
  });
});
