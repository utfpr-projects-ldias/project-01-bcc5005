import { Test, type TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { jest } from '@jest/globals';

const signInMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('supertokens-node/recipe/emailpassword', () => ({
  default: { signIn: signInMock },
}));
const { AuthService } = await import('./auth.service.js');
const { UsuariosService } = await import('../usuarios/usuarios.service.js');
const buscarAtivo = jest.fn<(id: string) => Promise<unknown>>();

describe('AuthService - somente login', () => {
  let service: InstanceType<typeof AuthService>;
  beforeEach(async () => {
    jest.resetAllMocks();
    buscarAtivo.mockResolvedValue({id:'local-1'});
    const module: TestingModule = await Test.createTestingModule({ providers: [AuthService, {provide: UsuariosService, useValue:{buscarAtivoPorSupertokensId:buscarAtivo}}] }).compile();
    service = module.get<InstanceType<typeof AuthService>>(AuthService);
  });

  it('não expõe método de cadastro público', () => {
    expect('signup' in service).toBe(false);
  });

  it('autentica credenciais válidas sem assumir perfil de domínio', async () => {
    signInMock.mockResolvedValue({
      status: 'OK', recipeUserId: 'recipe-1',
      user: { id: 'u1', emails: ['a@b.com'] },
    });
    await expect(service.signin({ email: 'a@b.com', password: 'senha1234' })).resolves.toEqual({
      recipeUserId: 'recipe-1', id: 'u1', email: 'a@b.com', role: 'user',
    });
    expect(signInMock).toHaveBeenCalledWith('public', 'a@b.com', 'senha1234');
  });

  it('recusa identidade válida sem conta local ativa', async () => {
    signInMock.mockResolvedValue({status:'OK', user:{id:'u1', emails:['a@b.com']}});
    buscarAtivo.mockResolvedValue(null);
    await expect(service.signin({email:'a@b.com',password:'senha1234'})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(buscarAtivo).toHaveBeenCalledWith('u1');
  });

  it('rejeita credenciais inválidas', async () => {
    signInMock.mockResolvedValue({ status: 'WRONG_CREDENTIALS_ERROR' });
    await expect(service.signin({ email: 'a@b.com', password: 'incorreta' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});
