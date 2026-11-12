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
import type { ResolverEscopoContratoService } from './resolver-escopo-contrato.service.js';

const procurar = jest.fn<() => Promise<{
  id: string; supertokensUserId: string; email: string; perfil: PerfilUsuario;
} | null>>();
const identificar = jest.fn<() => Promise<string>>();
const permitido = jest.fn<() => Promise<boolean>>();
const resolver = jest.fn<() => Promise<string | null>>();
const RAIZ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ETAPA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const metadados = jest.fn<() => Politica | undefined>();
const guard = new AutorizacaoGuard(
  { getAllAndOverride: metadados } as unknown as Reflector,
  { identificar } as unknown as SessaoSuperTokensService,
  { buscarAtivoPorSupertokensId: procurar } as unknown as UsuariosService,
  { permitido } as unknown as PoliticaAcessoService,
  { resolver } as unknown as ResolverEscopoContratoService,
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
  resolver.mockResolvedValue(RAIZ);
});

describe('guard global', () => {
  it('mantém endpoints legados fora dos namespaces reservados', async () => {
    metadados.mockReturnValue(undefined);
    expect(await guard.canActivate(contexto('/auth/signin').context)).toBe(true);
    expect(identificar).not.toHaveBeenCalled();
  });

  it('falha fechado para qualquer namespace de domínio novo', async () => {
    metadados.mockReturnValue(undefined);
    await expect(guard.canActivate(contexto('/modulo-futuro').context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(['/contratos', '/CONTRATOS/abc', '/contratos/abc', '/admin/usuarios', '/admin/usuarios/x', '/usuarios/me', '/evidencias', '/atividades', '/relatorios', '/etapas/abc', '/documentos', '/auditoria', '/admin/usuarios/x/permissoes'])(
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


describe('TEC07-AJUSTES-02-02 — segurança de rotas operacionais', () => {
  it('consulta entidade persistida antes da política e passa apenas o contrato real', async () => {
    const escopo = { tipo: 'recurso', recurso: 'etapa', parametro: 'etapaId', parametroContratoPai: 'contratoId' } as const;
    metadados.mockReturnValue({ acao: 'etapas:visualizar', escopoOperacional: escopo });
    const { context, request } = contexto('/contratos/x/etapas/y', { contratoId: RAIZ, etapaId: ETAPA });
    Object.assign(request, { body: { contratoId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' } });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(resolver).toHaveBeenCalledWith(escopo, { contratoId: RAIZ, etapaId: ETAPA });
    expect(permitido).toHaveBeenCalledWith(expect.objectContaining({ id: 'usuario-1' }),
      { acao: 'etapas:visualizar', escopoOperacional: escopo }, RAIZ);
  });

  it('nega 404 para ID fora da carteira/inexistente sem revelar sua existência', async () => {
    const escopo = { tipo: 'recurso', recurso: 'etapa', parametro: 'etapaId' } as const;
    metadados.mockReturnValue({ acao: 'etapas:editar', escopoOperacional: escopo });
    resolver.mockResolvedValueOnce(null);
    await expect(guard.canActivate(contexto('/etapas/x', { etapaId: ETAPA }).context)).rejects.toBeInstanceOf(NotFoundException);
    expect(permitido).not.toHaveBeenCalled();
    permitido.mockResolvedValueOnce(false);
    await expect(guard.canActivate(contexto('/etapas/x', { etapaId: ETAPA }).context)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('nega ação de edição se decorator usar escopo só de contrato (bypass)', async () => {
    metadados.mockReturnValue({ acao: 'etapas:editar', escopoOperacional: { tipo: 'contrato', parametro: 'contratoId' } });
    await expect(guard.canActivate(contexto('/contratos/x', { contratoId: RAIZ }).context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('nega recurso incompatível e rota operacional sem decorator', async () => {
    metadados.mockReturnValue({ acao: 'etapas:editar', escopoOperacional: { tipo: 'recurso', recurso: 'documento', parametro: 'id' } });
    await expect(guard.canActivate(contexto('/documentos/x', { id: ETAPA }).context)).rejects.toBeInstanceOf(ForbiddenException);
    metadados.mockReturnValue(undefined);
    await expect(guard.canActivate(contexto('/contratos/x/etapas', { contratoId: RAIZ }).context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
