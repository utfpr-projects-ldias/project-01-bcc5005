import { jest } from '@jest/globals';
import { PoliticaAcessoService } from './politica-acesso.service.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';
import type { Repository } from 'typeorm';
import type { PermissaoContrato } from './permissao-contrato.entity.js';

const CONTRATO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OUTRO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const usuario = (perfil: PerfilUsuario): UsuarioAutenticado => ({
  id: 'usuario-1', supertokensUserId: 'auth-1', email: 'local@teste.invalid', perfil,
});
const busca = jest.fn<() => Promise<PermissaoContrato | null>>();
const repositorio = { findOneBy: busca } as unknown as Repository<PermissaoContrato>;
const politica = new PoliticaAcessoService(repositorio);

beforeEach(() => busca.mockReset());

describe('políticas por perfil e escopo', () => {
  it('administrador gerencia usuários, cria e lista contratos', async () => {
    for (const acao of ['usuarios:administrar', 'contratos:criar'] as const) {
      expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR), { acao })).toBe(true);
      expect(await politica.permitido(usuario(PerfilUsuario.GESTOR), { acao })).toBe(false);
      expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR), { acao })).toBe(false);
    }
  });

  it('consulta de carteira usa guard para usuário ativo e filtro no service', async () => {
    for (const perfil of [PerfilUsuario.ADMINISTRADOR, PerfilUsuario.GESTOR, PerfilUsuario.COLABORADOR]) {
      expect(await politica.permitido(usuario(perfil), { acao: 'contratos:listar' })).toBe(true);
    }
  });

  it('administrador pode visualizar/editar contratos com UUID válido', async () => {
    for (const acao of ['contratos:visualizar', 'contratos:editar'] as const) {
      expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR), { acao }, CONTRATO_ID)).toBe(true);
    }
    expect(busca).not.toHaveBeenCalled();
  });

  it('colaborador pode visualizar apenas contrato explicitamente vinculado', async () => {
    busca.mockResolvedValueOnce(null).mockResolvedValueOnce({ podeEditar: true } as PermissaoContrato);
    expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR), { acao: 'contratos:visualizar' }, OUTRO_ID)).toBe(false);
    expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR), { acao: 'contratos:visualizar' }, CONTRATO_ID)).toBe(true);
    expect(busca).toHaveBeenCalledWith({ usuarioId: 'usuario-1', contratoId: CONTRATO_ID });
  });

  it('colaborador nunca edita contrato, mesmo com vínculo marcado como editável', async () => {
    expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR), { acao: 'contratos:editar' }, CONTRATO_ID)).toBe(false);
    expect(busca).not.toHaveBeenCalled();
  });

  it('gestor edita somente contrato com vínculo explicitamente editável', async () => {
    busca.mockResolvedValueOnce({ podeEditar: false } as PermissaoContrato)
      .mockResolvedValueOnce({ podeEditar: true } as PermissaoContrato);
    expect(await politica.permitido(usuario(PerfilUsuario.GESTOR), { acao: 'contratos:editar' }, CONTRATO_ID)).toBe(false);
    expect(await politica.permitido(usuario(PerfilUsuario.GESTOR), { acao: 'contratos:editar' }, CONTRATO_ID)).toBe(true);
  });

  it('IDs inválidos e política desconhecida negam sem consultar banco', async () => {
    expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR), { acao: 'contratos:visualizar' }, 'id-forjado')).toBe(false);
    expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR), { acao: 'contratos:editar' })).toBe(false);
    expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR), { acao: 'desconhecida' as never })).toBe(false);
    expect(busca).not.toHaveBeenCalled();
  });
});
