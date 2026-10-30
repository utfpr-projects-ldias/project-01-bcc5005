import 'reflect-metadata';
import { jest } from '@jest/globals';
import type { Repository } from 'typeorm';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import type { Contrato } from '../contratos/contrato.entity.js';
import type { Etapa } from '../etapas/etapa.entity.js';
import type { PermissaoContrato } from './permissao-contrato.entity.js';
import { CHAVE_POLITICA, ExigirPoliticaOperacional } from './politica.decorator.js';
import { PoliticaAcessoService } from './politica-acesso.service.js';
import { POLITICAS_OPERACIONAIS } from './politicas-operacionais.js';
import { ResolverEscopoContratoService } from './resolver-escopo-contrato.service.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

const CONTRATO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OUTRO_CONTRATO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ETAPA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DOCUMENTO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const usuario = (perfil: PerfilUsuario): UsuarioAutenticado => ({
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  supertokensUserId: 'supertokens-fixture', email: 'usuario@example.invalid', perfil,
});

/**
 * Fixtures APENAS do contrato HTTP. Não existem controllers HU06-02/TEC08-02 reais.
 * Testar metadata é testar que ambos os times podem consumir o MESMO decorator.
 */
class ExemploHu06Etapas {
  @ExigirPoliticaOperacional('etapas:listar', {
    tipo: 'contrato', parametro: 'contratoId',
  })
  listar() { return undefined; }

  @ExigirPoliticaOperacional('etapas:editar', {
    tipo: 'recurso', recurso: 'etapa', parametro: 'etapaId',
    parametroContratoPai: 'contratoId',
  })
  editar() { return undefined; }
}

class ExemploTec08Documentos {
  @ExigirPoliticaOperacional('documentos:listar', {
    tipo: 'contrato', parametro: 'contratoId',
  })
  listar() { return undefined; }

  @ExigirPoliticaOperacional('documentos:baixar', {
    tipo: 'recurso', recurso: 'documento', parametro: 'documentoId',
    parametroContratoPai: 'contratoId',
  })
  baixar() { return undefined; }

  @ExigirPoliticaOperacional('documentos:anexar', {
    tipo: 'contrato', parametro: 'contratoId',
  })
  anexar() { return undefined; }
}

function politicaMetodo(prototipo: object, nomeMetodo: string) {
  const descritor = Object.getOwnPropertyDescriptor(prototipo, nomeMetodo);

  if (!descritor || typeof descritor.value !== 'function') {
    throw new Error(`Metodo ${nomeMetodo} nao encontrado no prototipo`);
  }

  return Reflect.getMetadata(CHAVE_POLITICA, descritor.value);
}

describe('TEC07-AJUSTES-02-04 — fixtures de consumo HU06 e TEC08', () => {
  it('declara actions conhecidas e escopos tipados, sem curingas', () => {
    for (const acao of ['etapas:listar', 'etapas:editar', 'documentos:listar',
      'documentos:baixar', 'documentos:anexar']) {
      expect(Object.hasOwn(POLITICAS_OPERACIONAIS, acao)).toBe(true);
    }
    expect(politicaMetodo(ExemploHu06Etapas.prototype, 'listar')).toEqual({
      acao: 'etapas:listar', escopoOperacional: { tipo: 'contrato', parametro: 'contratoId' },
    });
    expect(politicaMetodo(ExemploHu06Etapas.prototype, 'editar')).toEqual({
      acao: 'etapas:editar', escopoOperacional: {
        tipo: 'recurso', recurso: 'etapa', parametro: 'etapaId', parametroContratoPai: 'contratoId',
      },
    });
    expect(politicaMetodo(ExemploTec08Documentos.prototype, 'listar')).toMatchObject({ acao: 'documentos:listar' });
    expect(politicaMetodo(ExemploTec08Documentos.prototype, 'baixar')).toMatchObject({ acao: 'documentos:baixar' });
    expect(politicaMetodo(ExemploTec08Documentos.prototype, 'anexar')).toMatchObject({ acao: 'documentos:anexar' });
  });

  it('resolve HU06 pelo banco e TEC08 somente após registro explícito do adaptador', async () => {
    const buscarContrato = jest.fn(async () => ({ id: CONTRATO } as Contrato));
    const buscarEtapa = jest.fn(async () => ({ id: ETAPA, contratoId: CONTRATO } as Etapa));
    const resolver = new ResolverEscopoContratoService(
      { findOneBy: buscarContrato } as unknown as Repository<Contrato>,
      { findOneBy: buscarEtapa } as unknown as Repository<Etapa>,
    );
    const escopoHu06 = politicaMetodo(ExemploHu06Etapas.prototype, 'editar').escopoOperacional;
    expect(await resolver.resolver(escopoHu06, { etapaId: ETAPA, contratoId: CONTRATO })).toBe(CONTRATO);
    expect(await resolver.resolver(escopoHu06, { etapaId: ETAPA, contratoId: OUTRO_CONTRATO })).toBeNull();
    expect(buscarEtapa).toHaveBeenCalledWith({ id: ETAPA });

    const escopoTec08 = politicaMetodo(ExemploTec08Documentos.prototype, 'baixar').escopoOperacional;
    expect(await resolver.resolver(escopoTec08, { documentoId: DOCUMENTO, contratoId: CONTRATO })).toBeNull();
    const buscarDocumentoDaFixture = jest.fn(async (id: string) => id === DOCUMENTO ? CONTRATO : null);
    resolver.registrarAdaptador('documento', buscarDocumentoDaFixture);
    expect(await resolver.resolver(escopoTec08, { documentoId: DOCUMENTO, contratoId: CONTRATO })).toBe(CONTRATO);
    expect(await resolver.resolver(escopoTec08, { documentoId: DOCUMENTO, contratoId: OUTRO_CONTRATO })).toBeNull();
    expect(await resolver.resolver(escopoTec08, { documentoId: OUTRO_CONTRATO, contratoId: CONTRATO })).toBeNull();
    expect(buscarDocumentoDaFixture).toHaveBeenCalledWith(DOCUMENTO);
  });

  it('documento visível exige vínculo; anexar exige Gestor com edição ou ADMIN', async () => {
    const buscarVinculo = jest.fn(async () => ({ podeEditar: false } as PermissaoContrato));
    const acesso = new PoliticaAcessoService(
      { findOneBy: buscarVinculo } as unknown as Repository<PermissaoContrato>,
    );
    const baixar = politicaMetodo(ExemploTec08Documentos.prototype, 'baixar');
    const anexar = politicaMetodo(ExemploTec08Documentos.prototype, 'anexar');
    expect(await acesso.permitido(usuario(PerfilUsuario.COLABORADOR), baixar, CONTRATO)).toBe(true);
    expect(await acesso.permitido(usuario(PerfilUsuario.COLABORADOR), anexar, CONTRATO)).toBe(false);
    expect(await acesso.permitido(usuario(PerfilUsuario.GESTOR), anexar, CONTRATO)).toBe(false);
    buscarVinculo.mockResolvedValueOnce({ podeEditar: true } as PermissaoContrato);
    expect(await acesso.permitido(usuario(PerfilUsuario.GESTOR), anexar, CONTRATO)).toBe(true);
    expect(await acesso.permitido(usuario(PerfilUsuario.ADMINISTRADOR), anexar, CONTRATO)).toBe(true);
  });
});
