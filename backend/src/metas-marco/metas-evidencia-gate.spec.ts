import { jest } from '@jest/globals';
import { avaliarMetasMarco } from './metas-marco-gate.js';
import { MetaMarco, VinculoMetaMarco } from './meta-marco.entity.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const entregavelId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const comprovanteId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const meta = Object.assign(new MetaMarco(), { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', contratoId,
  entregavelId, tipo: 'DESCRITIVA' as const, pesoCentesimos:10000, estado:'CONCLUIDA',provasExigidas:1,quantidadePrevista:null,unidadeMedida:null, arquivadoEm: null });
const vinculo = Object.assign(new VinculoMetaMarco(), { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  contratoId, metaId: meta.id, evidenciaEsperadaId:comprovanteId, ocorrenciaId: null, atividadeId: null, status: 'APROVADO' as const });
function manager(ativo: boolean) {
  return {
    find: jest.fn(async (entidade: unknown) => entidade === MetaMarco ? [meta] : entidade === VinculoMetaMarco ? [vinculo] : []),
    query: jest.fn(async () => ativo ? [{esperada:comprovanteId,entregavel_id:entregavelId,obrigatoria:true,status:'VERIFICADA',sha256:'a'.repeat(64),verificado_em:'2026-01-01'}] : []),
  };
}
describe('gate do Marco acompanha revogação documental', () => {
  it('conta vínculo aprovado quando o comprovante ainda é válido', async () => {
    expect(await avaliarMetasMarco(manager(true) as never, contratoId, entregavelId)).toMatchObject({
      total: 1, concluidas: 1, apto: true,
    });
  });
  it('revoga a preparação sem alterar o histórico de aprovação quando a prova deixa de valer', async () => {
    const m = manager(false);
    expect(await avaliarMetasMarco(m as never, contratoId, entregavelId)).toMatchObject({
      total: 1, concluidas: 0, apto: false,
    });
    expect(m.query).toHaveBeenCalledTimes(1);
  });
});
