import { BadRequestException, ConflictException } from '@nestjs/common';
import { jest } from '@jest/globals';
import type { Repository } from 'typeorm';

import { PerfilUsuario } from './perfil-usuario.enum.js';
import { Usuario } from './usuario.entity.js';
import { UsuariosService } from './usuarios.service.js';

type Buscar = (filtro: unknown) => Promise<Usuario | null>;
type Executar = () => Promise<unknown>;

function fakeUsuario(sobrescrita: Partial<Usuario> = {}): Usuario {
  return Object.assign(new Usuario(), {
    id: '5b955969-1d3e-4ee6-a377-cfbe818ff9e3',
    supertokensUserId: 'st-123',
    email: 'user@example.com',
    perfil: PerfilUsuario.COLABORADOR,
    ativo: true,
    ...sobrescrita,
  });
}

describe('UsuariosService / TEC07-01', () => {
  const buscar = jest.fn<Buscar>();
  const executar = jest.fn<Executar>();
  const queryBuilder = {
    insert: jest.fn(), into: jest.fn(), values: jest.fn(), orIgnore: jest.fn(),
    execute: executar,
  };
  queryBuilder.insert.mockReturnValue(queryBuilder);
  queryBuilder.into.mockReturnValue(queryBuilder);
  queryBuilder.values.mockReturnValue(queryBuilder);
  queryBuilder.orIgnore.mockReturnValue(queryBuilder);
  const repositorio = {
    findOneBy: buscar,
    createQueryBuilder: () => queryBuilder,
  } as unknown as Repository<Usuario>;
  const servico = new UsuariosService(repositorio);

  beforeEach(() => {
    buscar.mockReset();
    executar.mockReset();
    queryBuilder.values.mockClear();
  });

  it('não cria usuário quando apenas consulta uma sessão não provisionada', async () => {
    buscar.mockResolvedValue(null);
    await expect(servico.buscarAtivoPorSupertokensId('legado')).resolves.toBeNull();
    expect(executar).not.toHaveBeenCalled();
  });

  it('consulta apenas contas ativas', async () => {
    buscar.mockResolvedValue(fakeUsuario());
    await servico.buscarAtivoPorSupertokensId('st-123');
    expect(buscar).toHaveBeenCalledWith({ supertokensUserId: 'st-123', ativo: true });
  });

  it('cria identidade provisionada apenas com perfil explícito', async () => {
    buscar.mockResolvedValueOnce(null).mockResolvedValueOnce(fakeUsuario());
    executar.mockResolvedValue({});
    const salvo = await servico.criarProvisionado({
      supertokensUserId: 'st-123', email: 'USER@example.com', perfil: PerfilUsuario.COLABORADOR,
    });
    expect(salvo.perfil).toBe(PerfilUsuario.COLABORADOR);
    expect(queryBuilder.values).toHaveBeenCalledWith({
      supertokensUserId: 'st-123', email: 'user@example.com',
      perfil: PerfilUsuario.COLABORADOR, ativo: true,
    });
  });

  it('idempotência: repetição idêntica não insere nem altera perfil', async () => {
    buscar.mockResolvedValue(fakeUsuario());
    await expect(servico.criarProvisionado({
      supertokensUserId: 'st-123', email: 'user@example.com', perfil: PerfilUsuario.COLABORADOR,
    })).resolves.toMatchObject({ perfil: PerfilUsuario.COLABORADOR });
    expect(executar).not.toHaveBeenCalled();
  });

  it('não promove usuário existente por repetição com perfil diferente', async () => {
    buscar.mockResolvedValue(fakeUsuario());
    await expect(servico.criarProvisionado({
      supertokensUserId: 'st-123', email: 'user@example.com', perfil: PerfilUsuario.ADMINISTRADOR,
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejeita perfil inválido e conta inativa', async () => {
    await expect(servico.criarProvisionado({
      supertokensUserId: 'st-123', email: 'a@b.com', perfil: 'ADMIN' as PerfilUsuario,
    })).rejects.toBeInstanceOf(BadRequestException);
    buscar.mockResolvedValue(fakeUsuario({ ativo: false }));
    await expect(servico.criarProvisionado({
      supertokensUserId: 'st-123', email: 'user@example.com', perfil: PerfilUsuario.COLABORADOR,
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('concorrência: ON CONFLICT sem UPDATE apenas aceita dados idênticos', async () => {
    buscar.mockResolvedValueOnce(null).mockResolvedValueOnce(fakeUsuario());
    executar.mockResolvedValue({ identifiers: [] });
    await expect(servico.criarProvisionado({
      supertokensUserId: 'st-123', email: 'user@example.com', perfil: PerfilUsuario.COLABORADOR,
    })).resolves.toMatchObject({ id: expect.any(String) });
  });
});
