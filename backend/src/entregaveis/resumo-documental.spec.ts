import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { EntregaveisService } from './entregaveis.service.js';
const cid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const eid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const base = { entregavel_id:eid, obrigatorias:2, verificadas:1, total:2, verificadas_total:1, ocorrencias_exigidas:0, ocorrencias_atendidas:0, situacao:'EVIDENCIA_PARCIAL', ocorrencias_total:3, ocorrencias_finalizadas:1, atividades_total:2, atividades_verificadas:1, exigencias_documentais_total:2, exigencias_documentais_atendidas:1 };
function setup() {
  const contratos = { findOneBy: jest.fn(async () => ({ id: cid })) };
  const query = jest.fn(async (_sql: string, _args: string[]) => [base]);
  const ds = { getRepository: () => contratos, manager: { query } };
  const service = new EntregaveisService({} as never, {} as never, ds as never, {} as never, {} as never);
  return { service, contratos, query };
}
test('resumo usa a mesma visão transacional de comprovação e limita ao contrato solicitado', async () => {
  const {service, query} = setup();
  expect(await service.resumoDocumental(cid)).toEqual({[eid]:{obrigatorias:2,verificadas:1,total:2,verificadasTotal:1,ocorrenciasExigidas:0,ocorrenciasAtendidas:0,situacaoComprovacao:'EVIDENCIA_PARCIAL',ocorrenciasTotal:3,ocorrenciasFinalizadas:1,atividadesTotal:2,atividadesVerificadas:1,exigenciasDocumentaisTotal:2,exigenciasDocumentaisAtendidas:1}});
  expect(query).toHaveBeenCalledWith(expect.stringContaining('vw_comprovacao_entregavel_r40'),[cid]);
});
test('contrato inexistente impede consultar contadores de comprovação', async () => {
  const {service, contratos, query} = setup();
  contratos.findOneBy.mockResolvedValueOnce(null as never);
  await expect(service.resumoDocumental(cid)).rejects.toBeInstanceOf(NotFoundException);
  expect(query).not.toHaveBeenCalled();
});
test('evidência opcional integra o total documental sem alterar obrigatórias', async () => {
  const {service, query} = setup();
  query.mockResolvedValueOnce([{...base,obrigatorias:1,verificadas:0}]);
  expect((await service.resumoDocumental(cid))[eid]).toMatchObject({obrigatorias:1,verificadas:0,total:2,verificadasTotal:1});
});
test('sem exigência não inventa comprovante; exigência da ocorrência é independente', async () => {
  const {service, query} = setup();
  query.mockResolvedValueOnce([{...base,obrigatorias:0,verificadas:0,total:1,verificadas_total:0,ocorrencias_exigidas:1,situacao:'SEM_EVIDENCIA'}]);
  expect((await service.resumoDocumental(cid))[eid]).toMatchObject({obrigatorias:0,verificadas:0,ocorrenciasExigidas:1,ocorrenciasAtendidas:0,situacaoComprovacao:'SEM_EVIDENCIA'});
});
