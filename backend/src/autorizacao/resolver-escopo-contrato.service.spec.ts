import { jest } from '@jest/globals';
import type { Repository } from 'typeorm';
import type { Contrato } from '../contratos/contrato.entity.js';
import type { Etapa } from '../etapas/etapa.entity.js';
import { ResolverEscopoContratoService } from './resolver-escopo-contrato.service.js';

const CONTRATO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OUTRO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ETAPA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const contratoEncontrado = jest.fn<() => Promise<Contrato | null>>();
const etapaEncontrada = jest.fn<() => Promise<Etapa | null>>();

function criar() {
  return new ResolverEscopoContratoService(
    { findOneBy: contratoEncontrado } as unknown as Repository<Contrato>,
    { findOneBy: etapaEncontrada } as unknown as Repository<Etapa>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  contratoEncontrado.mockResolvedValue({ id: CONTRATO } as Contrato);
  etapaEncontrada.mockResolvedValue({ id: ETAPA, contratoId: CONTRATO } as Etapa);
});

describe('ResolverEscopoContratoService — raiz persistida (RF-40 / RNF-02)', () => {
  it('para listar/criar usa contrato existente do parâmetro de rota (nunca body)', async () => {
    const resolver = criar();
    expect(await resolver.resolver({ tipo: 'contrato', parametro: 'contratoId' }, { contratoId: CONTRATO })).toBe(CONTRATO);
    expect(contratoEncontrado).toHaveBeenCalledWith({ id: CONTRATO });
    contratoEncontrado.mockResolvedValueOnce(null);
    expect(await resolver.resolver({ tipo: 'contrato', parametro: 'contratoId' }, { contratoId: OUTRO })).toBeNull();
  });

  it('detalhe usa FK real da etapa, mesmo com ID forjado em outras propriedades', async () => {
    const resolver = criar();
    const escopo = { tipo: 'recurso', recurso: 'etapa', parametro: 'etapaId' } as const;
    expect(await resolver.resolver(escopo, { etapaId: ETAPA, contratoId: OUTRO })).toBe(CONTRATO);
    expect(etapaEncontrada).toHaveBeenCalledWith({ id: ETAPA });
    expect(contratoEncontrado).not.toHaveBeenCalled();
  });

  it('rota aninhada rejeita etapa de outro contrato e UUID inválido sem vazar existência', async () => {
    const resolver = criar();
    const escopo = { tipo: 'recurso', recurso: 'etapa', parametro: 'etapaId', parametroContratoPai: 'contratoId' } as const;
    expect(await resolver.resolver(escopo, { etapaId: ETAPA, contratoId: OUTRO })).toBeNull();
    expect(await resolver.resolver(escopo, { etapaId: ETAPA, contratoId: CONTRATO })).toBe(CONTRATO);
    expect(await resolver.resolver(escopo, { etapaId: 'id-forjado', contratoId: CONTRATO })).toBeNull();
    expect(await resolver.resolver(escopo, { etapaId: ETAPA, contratoId: 'id-forjado' })).toBeNull();
    expect(etapaEncontrada).toHaveBeenCalledTimes(3);
  });

  it('etapa inexistente e recurso sem adaptador retornam null (fail-closed)', async () => {
    const resolver = criar();
    etapaEncontrada.mockResolvedValueOnce(null);
    expect(await resolver.resolver({ tipo: 'recurso', recurso: 'etapa', parametro: 'id' }, { id: ETAPA })).toBeNull();
    expect(await resolver.resolver({ tipo: 'recurso', recurso: 'documento', parametro: 'id' }, { id: ETAPA })).toBeNull();
  });

  it('permite adaptador explícito para recurso futuro e não aceita segundo registro', async () => {
    const resolver = criar();
    const adaptador = jest.fn<() => Promise<string | null>>().mockResolvedValue(CONTRATO);
    resolver.registrarAdaptador('documento', adaptador);
    await expect(resolver.resolver({ tipo: 'recurso', recurso: 'documento', parametro: 'documentoId', parametroContratoPai: 'contratoId' },
      { documentoId: ETAPA, contratoId: CONTRATO })).resolves.toBe(CONTRATO);
    expect(adaptador).toHaveBeenCalledWith(ETAPA);
    expect(() => resolver.registrarAdaptador('documento', adaptador)).toThrow('Adaptador já registrado');
    expect(() => resolver.registrarAdaptador('etapa', adaptador)).toThrow('Adaptador já registrado');
  });
});
