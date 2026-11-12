import { jest } from '@jest/globals';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { PoliticaAcessoService } from './politica-acesso.service.js';

const CONTRATO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const usuario = (perfil: PerfilUsuario) => ({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  supertokensUserId: 'qa', email: 'qa@example.invalid', perfil });
const buscar = jest.fn(async () => ({ podeEditar: true }));
const estado = jest.fn(async () => ({ id: CONTRATO, arquivadoEm: new Date('2026-11-03T10:00:00Z') }));
const acesso = new PoliticaAcessoService({ findOneBy: buscar } as never, { findOne: estado } as never);
const escopo = { tipo: 'contrato' as const, parametro: 'contratoId' };

describe('arquivamento bloqueia todas as gravações por raiz, sem suprimir histórico', () => {
  beforeEach(() => { buscar.mockClear(); estado.mockClear(); });
  it('nega escrita do ADMIN mesmo com sessão e contrato válido', async () => {
    expect(await acesso.permitido(usuario(PerfilUsuario.ADMINISTRADOR),
      { acao: 'documentos:anexar', escopoOperacional: escopo }, CONTRATO)).toBe(false);
    expect(await acesso.permitido(usuario(PerfilUsuario.ADMINISTRADOR),
      { acao: 'etapas:criar', escopoOperacional: escopo }, CONTRATO)).toBe(false);
    expect(await acesso.permitido(usuario(PerfilUsuario.ADMINISTRADOR),
      { acao: 'contratos:editar' }, CONTRATO)).toBe(false);
  });
  it('leitura histórica continua permitida ao ADMIN', async () => {
    expect(await acesso.permitido(usuario(PerfilUsuario.ADMINISTRADOR),
      { acao: 'documentos:listar', escopoOperacional: escopo }, CONTRATO)).toBe(true);
  });
  it('somente ADMIN pode arquivar e reativar; exige UUID', async () => {
    expect(await acesso.permitido(usuario(PerfilUsuario.ADMINISTRADOR),
      { acao: 'contratos:reativar' }, CONTRATO)).toBe(true);
    expect(await acesso.permitido(usuario(PerfilUsuario.GESTOR),
      { acao: 'contratos:arquivar' }, CONTRATO)).toBe(false);
    expect(await acesso.permitido(usuario(PerfilUsuario.ADMINISTRADOR),
      { acao: 'contratos:arquivar' }, 'uuid-forjado')).toBe(false);
  });
});
