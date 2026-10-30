import { jest } from '@jest/globals';
import type { Repository } from 'typeorm';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';
import type { PermissaoContrato } from './permissao-contrato.entity.js';
import { PoliticaAcessoService } from './politica-acesso.service.js';
import { POLITICAS_OPERACIONAIS, type AcaoOperacional } from './politicas-operacionais.js';
import type { EscopoOperacional } from './politica.decorator.js';

const CONTRATO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const usuario = (perfil: PerfilUsuario): UsuarioAutenticado => ({
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  supertokensUserId: 'qa-seguranca', email: 'teste@invalid', perfil,
});
const buscarVinculo = jest.fn<() => Promise<PermissaoContrato | null>>();
const politica = new PoliticaAcessoService({ findOneBy: buscarVinculo } as unknown as Repository<PermissaoContrato>);
const casos = Object.entries(POLITICAS_OPERACIONAIS) as Array<[
  AcaoOperacional, typeof POLITICAS_OPERACIONAIS[AcaoOperacional],
]>;

function escopoPara(operacao: typeof POLITICAS_OPERACIONAIS[AcaoOperacional]): EscopoOperacional {
  return operacao.escopo === 'contrato'
    ? { tipo: 'contrato', parametro: 'contratoId' }
    : { tipo: 'recurso', parametro: 'recursoId', recurso: operacao.recurso };
}

beforeEach(() => buscarVinculo.mockReset());

describe('TEC07-AJUSTES-02-03 — matriz completa de regressão RF-39/RF-40', () => {
  it('cada operação conhecida exige escopo correto; ADMIN global, mas não bypass de UUID', async () => {
    for (const [acao, operacao] of casos) {
      const escopoOperacional = escopoPara(operacao);
      expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR),
        { acao, escopoOperacional }, CONTRATO)).toBe(true);
      expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR),
        { acao, escopoOperacional }, 'outro-id')).toBe(false);
      expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR), { acao }, CONTRATO)).toBe(false);
      const incorreto: EscopoOperacional = operacao.escopo === 'contrato'
        ? { tipo: 'recurso', recurso: operacao.recurso, parametro: 'recursoId' }
        : { tipo: 'contrato', parametro: 'contratoId' };
      expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR),
        { acao, escopoOperacional: incorreto }, CONTRATO)).toBe(false);
    }
    expect(buscarVinculo).not.toHaveBeenCalled();
  });

  it('nenhum Gestor/Colaborador recebe acesso sem vínculo, mesmo com ID correto', async () => {
    buscarVinculo.mockResolvedValue(null);
    for (const [acao, operacao] of casos) {
      for (const perfil of [PerfilUsuario.GESTOR, PerfilUsuario.COLABORADOR]) {
        expect(await politica.permitido(usuario(perfil),
          { acao, escopoOperacional: escopoPara(operacao) }, CONTRATO)).toBe(false);
      }
    }
  });

  it('vínculo de leitura não permite planejamento; Colaborador nunca planeja por flag genérica', async () => {
    buscarVinculo.mockResolvedValue({ podeEditar: false } as PermissaoContrato);
    for (const [acao, operacao] of casos) {
      const politicaAlvo = { acao, escopoOperacional: escopoPara(operacao) };
      expect(await politica.permitido(usuario(PerfilUsuario.GESTOR), politicaAlvo, CONTRATO))
        .toBe(operacao.classe !== 'planejamento');
      expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR), politicaAlvo, CONTRATO))
        .toBe(operacao.classe !== 'planejamento');
    }
    buscarVinculo.mockResolvedValue({ podeEditar: true } as PermissaoContrato);
    for (const [acao, operacao] of casos) {
      const politicaAlvo = { acao, escopoOperacional: escopoPara(operacao) };
      expect(await politica.permitido(usuario(PerfilUsuario.GESTOR), politicaAlvo, CONTRATO)).toBe(true);
      expect(await politica.permitido(usuario(PerfilUsuario.COLABORADOR), politicaAlvo, CONTRATO))
        .toBe(operacao.classe !== 'planejamento');
    }
  });

  it('ações desconhecidas nunca são concedidas, inclusive para ADMIN', async () => {
    for (const acao of ['etapas:*', 'etapas:excluir', '__proto__', 'documentos:excluir']) {
      expect(await politica.permitido(usuario(PerfilUsuario.ADMINISTRADOR),
        { acao: acao as AcaoOperacional, escopoOperacional: { tipo: 'contrato', parametro: 'contratoId' } }, CONTRATO))
        .toBe(false);
    }
  });
});
