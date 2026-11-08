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
let responsavelAtivo = false;
const politica = new PoliticaAcessoService(repositorio, {
  findOne: async (consulta: { where: { responsavelInternoId?: string } }) =>
    consulta.where.responsavelInternoId
      ? (responsavelAtivo ? { id: CONTRATO_ID, responsavelInternoId: 'usuario-1' } : null)
      : { id: CONTRATO_ID, arquivadoEm: null },
} as never);

beforeEach(() => { busca.mockReset(); responsavelAtivo = false; });

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

  it('colaborador não herda edição do vínculo legado, mesmo com podeEditar=true', async () => {
    busca.mockResolvedValue({ podeEditar: true, permissoesDetalhadas: null } as PermissaoContrato);
    expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR), { acao: 'contratos:editar' }, CONTRATO_ID)).toBe(false);
    expect(busca).toHaveBeenCalledWith({ usuarioId: 'usuario-1', contratoId: CONTRATO_ID });
  });

  it('colaborador só edita se receber permissão granular explícita para este contrato', async () => {
    busca.mockResolvedValueOnce({ podeEditar: false, permissoesDetalhadas: { editarContrato: true } } as PermissaoContrato)
      .mockResolvedValueOnce({ podeEditar: true, permissoesDetalhadas: { editarContrato: false } } as PermissaoContrato);
    expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR), { acao: 'contratos:editar' }, CONTRATO_ID)).toBe(true);
    expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR), { acao: 'contratos:editar' }, CONTRATO_ID)).toBe(false);
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


describe('TEC07-AJUSTES-02-02 — matriz PRD RF-39/40', () => {
  const noContrato = { tipo: 'contrato', parametro: 'contratoId' } as const;
  const etapaReal = { tipo: 'recurso', recurso: 'etapa', parametro: 'etapaId' } as const;

  it('ADMIN tem acesso global a operações tipadas, mas exige contrato raiz válido', async () => {
    for (const acao of ['etapas:criar', 'atividades:registrar', 'documentos:anexar'] as const) {
      expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR), { acao, escopoOperacional: noContrato }, CONTRATO_ID)).toBe(true);
    }
    expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR), { acao: 'etapas:editar', escopoOperacional: etapaReal })).toBe(false);
    expect(busca).not.toHaveBeenCalled();
  });

  it('GESTOR somente edita planejamento quando vinculado e podeEditar=true', async () => {
    busca.mockResolvedValueOnce(null).mockResolvedValueOnce({ podeEditar: false } as PermissaoContrato)
      .mockResolvedValueOnce({ podeEditar: true } as PermissaoContrato);
    for (const esperado of [false, false, true]) {
      expect(await politica.permitido(usuario(PerfilUsuario.GESTOR),
        { acao: 'etapas:editar', escopoOperacional: etapaReal }, CONTRATO_ID)).toBe(esperado);
    }
  });

  it('COLABORADOR consulta e registra atividade/evidência quando vinculado; não edita etapas', async () => {
    busca.mockResolvedValue({ podeEditar: true } as PermissaoContrato);
    for (const acao of ['etapas:listar', 'atividades:registrar', 'evidencias:anexar'] as const) {
      expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR), { acao, escopoOperacional: noContrato }, CONTRATO_ID)).toBe(true);
    }
    expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR), { acao: 'etapas:editar', escopoOperacional: etapaReal }, CONTRATO_ID)).toBe(false);
    expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR), { acao: 'execucao:atualizar', escopoOperacional: { tipo:'recurso',recurso:'entregavel',parametro:'id' } }, CONTRATO_ID)).toBe(false);
  });

  it('não usa podeEditar para acesso sem vínculo, nem aceita decorator legado/escopo incompatível', async () => {
    busca.mockResolvedValue(null);
    expect(await politica.permitido(usuario(PerfilUsuario.GESTOR), { acao: 'etapas:listar', escopoOperacional: noContrato }, OUTRO_ID)).toBe(false);
    expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR), { acao: 'etapas:editar' }, CONTRATO_ID)).toBe(false);
    expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR), { acao: 'etapas:editar', escopoOperacional: noContrato }, CONTRATO_ID)).toBe(false);
    expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR), { acao: 'etapas:editar', escopoOperacional: { tipo: 'recurso', recurso: 'documento', parametro: 'id' } }, CONTRATO_ID)).toBe(false);
    expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR), { acao: 'etapas:editar', escopoOperacional: etapaReal }, 'forjado')).toBe(false);
  });
});

describe('trava global de reordenação — permissões distintas', () => {
  const escopo = { tipo: 'contrato', parametro: 'id' } as const;
  it('ADMIN pode alterar cadeado; GESTOR com somente reordenarEtapas não pode', async () => {
    expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR), {
      acao: 'etapas:bloquear-ordem', escopoOperacional: escopo,
    }, CONTRATO_ID)).toBe(true);
    busca.mockResolvedValue({ podeEditar: true, permissoesDetalhadas: {
      reordenarEtapas: true, bloquearOrdemEtapas: false,
    } } as PermissaoContrato);
    expect(await politica.permitido(usuario(PerfilUsuario.GESTOR), {
      acao: 'etapas:reordenar', escopoOperacional: escopo,
    }, CONTRATO_ID)).toBe(true);
    expect(await politica.permitido(usuario(PerfilUsuario.GESTOR), {
      acao: 'etapas:bloquear-ordem', escopoOperacional: escopo,
    }, CONTRATO_ID)).toBe(false);
  });
  it('delegação explícita libera bloqueio sem exigir edição geral', async () => {
    busca.mockResolvedValue({ podeEditar: false, permissoesDetalhadas: { bloquearOrdemEtapas: true } } as PermissaoContrato);
    expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR), {
      acao: 'etapas:bloquear-ordem', escopoOperacional: escopo,
    }, CONTRATO_ID)).toBe(true);
    expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR), {
      acao: 'etapas:reordenar', escopoOperacional: escopo,
    }, CONTRATO_ID)).toBe(false);
  });
});

describe('delegação explícita por contrato', () => {
  const escopoEntregavel = { tipo: 'recurso', recurso: 'entregavel', parametro: 'entregavelId' } as const;
  it('COLABORADOR com delegação pode editar uma evidência mas não arquivá-la', async () => {
    busca.mockResolvedValue({ podeEditar: false, permissoesDetalhadas: {
      editarEvidencias: true, arquivarEvidencias: false,
    } } as PermissaoContrato);
    expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR), {
      acao: 'evidencias:editaresperada', escopoOperacional: escopoEntregavel,
    }, CONTRATO_ID)).toBe(true);
    expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR), {
      acao: 'evidencias:arquivaresperada', escopoOperacional: escopoEntregavel,
    }, CONTRATO_ID)).toBe(false);
  });
  it('revogação específica impede Gestor com edição geral de arquivar', async () => {
    busca.mockResolvedValue({ podeEditar: true, permissoesDetalhadas: {
      arquivarEvidencias: false,
    } } as PermissaoContrato);
    expect(await politica.permitido(usuario(PerfilUsuario.GESTOR), {
      acao: 'evidencias:arquivaresperada', escopoOperacional: escopoEntregavel,
    }, CONTRATO_ID)).toBe(false);
  });
});


describe('Atribuição de responsável concede leitura, não mutações', () => {
  const escopo = { tipo: 'contrato', parametro: 'contratoId' } as const;
  it('responsável sem vínculo vê o contrato e as etapas enquanto atribuído', async () => {
    responsavelAtivo = true;
    busca.mockResolvedValue(null);
    expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR),
      { acao: 'contratos:visualizar' }, CONTRATO_ID)).toBe(true);
    expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR),
      { acao: 'etapas:listar', escopoOperacional: escopo }, CONTRATO_ID)).toBe(true);
    expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR),
      { acao: 'documentos:anexar', escopoOperacional: escopo }, CONTRATO_ID)).toBe(false);
    expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR),
      { acao: 'evidencias:anexar', escopoOperacional: escopo }, CONTRATO_ID)).toBe(false);
    responsavelAtivo = false;
    expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR),
      { acao: 'contratos:visualizar' }, CONTRATO_ID)).toBe(false);
  });
});


test('exclusão definitiva de contratos é exclusiva do ADMIN e exige UUID válido', async () => {
  expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR), { acao: 'contratos:excluir' }, CONTRATO_ID)).toBe(true);
  expect(await politica.permitido(usuario(PerfilUsuario.GESTOR), { acao: 'contratos:excluir' }, CONTRATO_ID)).toBe(false);
  expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR), { acao: 'contratos:excluir' }, CONTRATO_ID)).toBe(false);
  expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR), { acao: 'contratos:excluir' }, 'id-errado')).toBe(false);
});
