import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Contrato } from '../contratos/contrato.entity.js';
import { ComprovanteEvidencia } from './comprovante-evidencia.entity.js';
import { EntregaveisService } from './entregaveis.service.js';

const cid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const eid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function setup() {
  const contratos = { findOneBy: jest.fn(async () => ({ id: cid })) };
  const versoes = { find: jest.fn(async () => [
    { evidenciaEsperadaId: 'x', status: 'PENDENTE_VERIFICACAO' },
    { evidenciaEsperadaId: 'x', status: 'VERIFICADA' },
    { evidenciaEsperadaId: 'y', status: 'VERIFICADA' },
  ]) };
  const dataSource = { getRepository: jest.fn((entidade: unknown) => entidade === Contrato ? contratos : entidade === ComprovanteEvidencia ? versoes : null) };
  const entregaveis = { find: jest.fn(async () => [{ id: eid }]) };
  const evidencias = { find: jest.fn(async () => [
    { id: 'x', entregavelId: eid, obrigatoria: true }, { id: 'y', entregavelId: eid, obrigatoria: true },
  ]) };
  const service = new EntregaveisService(entregaveis as never, evidencias as never, dataSource as never, {} as never, {} as never);
  return { service, contratos, versoes, entregaveis, evidencias };
}

test('só a versão mais recente comprovada conta; envio novo pendente não herda verificação antiga', async () => {
  const { service } = setup();
  expect(await service.resumoDocumental(cid)).toEqual({ [eid]: { obrigatorias: 2, verificadas: 1, total: 2, verificadasTotal: 1 } });
});

test('contrato inexistente impede consultar contadores de comprovação', async () => {
  const { service, contratos } = setup();
  contratos.findOneBy.mockResolvedValueOnce(null as never);
  await expect(service.resumoDocumental(cid)).rejects.toBeInstanceOf(NotFoundException);
});

test('evidência opcional integra o total documental, mas não altera obrigatórias', async () => {
  const { service, evidencias } = setup();
  evidencias.find.mockResolvedValueOnce([
    { id: 'x', entregavelId: eid, obrigatoria: true },
    { id: 'y', entregavelId: eid, obrigatoria: false },
  ]);
  expect(await service.resumoDocumental(cid)).toEqual({
    [eid]: { obrigatorias: 1, verificadas: 0, total: 2, verificadasTotal: 1 },
  });
});


test('zero evidências obrigatórias nunca representa comprovação obrigatória completa', async () => {
  const { service, evidencias } = setup();
  evidencias.find.mockResolvedValueOnce([{ id: 'x', entregavelId: eid, obrigatoria: false }]);
  const resultado = await service.resumoDocumental(cid);
  expect(resultado[eid]).toEqual({ obrigatorias: 0, verificadas: 0, total: 1, verificadasTotal: 0 });
  expect(resultado[eid].obrigatorias > 0 && resultado[eid].verificadas === resultado[eid].obrigatorias).toBe(false);
});
