import { jest } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import type { UsuariosService } from '../usuarios/usuarios.service.js';
import { AutorizacaoGuard } from './autorizacao.guard.js';
import type { Politica } from './politica.decorator.js';
import type { PoliticaAcessoService } from './politica-acesso.service.js';
import type { SessaoSuperTokensService } from './sessao-supertokens.service.js';
import type { RequisicaoAutorizada } from './usuario-autenticado.js';

const procurar = jest.fn<() => Promise<{
  id: string; supertokensUserId: string; email: string; perfil: PerfilUsuario;
} | null>>();
const identificar = jest.fn<() => Promise<string>>();
const permitido = jest.fn<() => Promise<boolean>>();
const metadados = jest.fn<() => Politica | undefined>();
const guard = new AutorizacaoGuard(
  { getAllAndOverride: metadados } as unknown as Reflector,
  { identificar } as unknown as SessaoSuperTokensService,
  { buscarAtivoPorSupertokensId: procurar } as unknown as UsuariosService,
  { permitido } as unknown as PoliticaAcessoService,
);
function contexto(path: string, params: Record<string, string> = {}, method = 'GET') {
  const request = { path, params, method } as unknown as RequisicaoAutorizada;
  const context = {
    getType: () => 'http',
    getHandler: () => function rota() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
  return { request, context };
}
beforeEach(() => {
  jest.clearAllMocks();
  metadados.mockReturnValue({ acao: 'perfil:proprio' });
  identificar.mockResolvedValue('auth-1');
  procurar.mockResolvedValue({ id: 'usuario-1', supertokensUserId: 'auth-1', email: 'adm@teste.invalid', perfil: PerfilUsuario.ADMINISTRADOR });
  permitido.mockResolvedValue(true);
});

describe('guard global', () => {
  it('mantém endpoints legados fora dos namespaces reservados', async () => {
    metadados.mockReturnValue(undefined);
    expect(await guard.canActivate(contexto('/auth/signin').context)).toBe(true);
    expect(identificar).not.toHaveBeenCalled();
  });

  it.each(['/contratos', '/CONTRATOS/abc', '/contratos/abc', '/admin/usuarios', '/admin/usuarios/x', '/usuarios/me'])(
    'nega rota interna sem política: %s', async (path) => {
      metadados.mockReturnValue(undefined);
      await expect(guard.canActivate(contexto(path).context)).rejects.toBeInstanceOf(ForbiddenException);
      expect(identificar).toHaveBeenCalledTimes(1);
    },
  );

  it('não aceita sessão ausente e não consulta o perfil', async () => {
    identificar.mockRejectedValue(new UnauthorizedException());
    await expect(guard.canActivate(contexto('/usuarios/me').context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(procurar).not.toHaveBeenCalled();
  });

  it.each([null, { id:'u', supertokensUserId:'auth-1', email:'x', perfil: PerfilUsuario.COLABORADOR, ativo:false }])(
    'nega usuário ausente ou inativo: %p', async (usuario) => {
      // O serviço buscarAtivoPorSupertokensId deve devolver null para usuário inativo.
      procurar.mockResolvedValue(usuario?.ativo === false ? null : usuario);
      await expect(guard.canActivate(contexto('/usuarios/me').context)).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('ignora papéis falsificados em body/header e usa dados persistidos', async () => {
    procurar.mockResolvedValue({ id: 'usuario-1', supertokensUserId: 'auth-1', email: 'col@teste.invalid', perfil: PerfilUsuario.COLABORADOR });
    const { context, request } = contexto('/usuarios/me');
    Object.assign(request, { body: { role:'ADMINISTRADOR' }, headers: { 'x-role':'ADMINISTRADOR' } });
    await guard.canActivate(context);
    expect(request.usuarioDominio?.perfil).toBe(PerfilUsuario.COLABORADOR);
    expect(permitido).toHaveBeenCalledWith(expect.objectContaining({ id:'usuario-1' }), { acao:'perfil:proprio' }, undefined);
  });

  it('não revela ID de contrato fora do escopo', async () => {
    metadados.mockReturnValue({ acao: 'contratos:visualizar', parametroContrato: 'id' });
    permitido.mockResolvedValue(false);
    const { context } = contexto('/contratos/123', { id:'123' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
    expect(permitido).toHaveBeenCalledWith(expect.anything(), { acao:'contratos:visualizar', parametroContrato:'id' }, '123');
  });

  it('nega ação administrativa sem escopo', async () => {
    metadados.mockReturnValue({ acao:'usuarios:administrar' });
    permitido.mockResolvedValue(false);
    await expect(guard.canActivate(contexto('/admin/usuarios').context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
