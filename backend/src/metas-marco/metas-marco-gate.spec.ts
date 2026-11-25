import { jest } from '@jest/globals';
import { avaliarMetasMarco } from './metas-marco-gate.js';
import { MetaMarco, VinculoMetaMarco } from './meta-marco.entity.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const entregavelId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ocorrenciaId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const meta = Object.assign(new MetaMarco(), {id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd', contratoId,
  entregavelId, tipo: 'OCORRENCIA' as const, quantidadeExigida: 1, arquivadoEm:null});
const vinculo = Object.assign(new VinculoMetaMarco(), {id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  contratoId, metaId:meta.id, ocorrenciaId, atividadeId:null, comprovanteId:null, status:'APROVADO' as const});

function manager(ocorrenciaStatus: string | null, comMetas = true) {
  const find = jest.fn(async (entidade: unknown) => entidade === MetaMarco ? (comMetas ? [meta] : []) : entidade === VinculoMetaMarco ? [vinculo] : []);
  const findOne = jest.fn(async (entidade: unknown, options: unknown) => {
    if (entidade !== Ocorrencia || !ocorrenciaStatus) return null;
    const where = (options as {where: {contratoId: string; id:string}}).where;
    if (where.contratoId !== contratoId || where.id !== ocorrenciaId) return null;
    return Object.assign(new Ocorrencia(), {id:ocorrenciaId,contratoId,status:ocorrenciaStatus,substituidaEm:null});
  });
  return {find,findOne};
}

describe('Meta do Marco — vínculos verificados não alteram registros reais', () => {
  it('não libera conclusão física por falta de metas cadastradas', async () => {
    expect((await avaliarMetasMarco(manager('CONCLUIDO',false) as never,contratoId,entregavelId)).apto).toBe(false);
  });
  it('vínculo aprovado e ocorrência concluída permitem solicitação', async () => {
    const resultado=await avaliarMetasMarco(manager('CONCLUIDO') as never,contratoId,entregavelId);
    expect(resultado).toEqual({total:1,concluidas:1,apto:true});
  });
  it('reabertura da ocorrência revoga sua contribuição mesmo que vínculo continue aprovado', async () => {
    const resultado=await avaliarMetasMarco(manager('EM_REVISAO') as never,contratoId,entregavelId);
    expect(resultado).toEqual({total:1,concluidas:0,apto:false});
  });
  it('ocorrência ausente não deve liberar meta', async () => {
    expect((await avaliarMetasMarco(manager(null) as never,contratoId,entregavelId)).apto).toBe(false);
  });
});
