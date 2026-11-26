import { jest } from '@jest/globals';
import { avaliarMetasMarco } from './metas-marco-gate.js';
import { MetaMarco, VinculoMetaMarco } from './meta-marco.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const entregavelId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ocorrenciaId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const meta = Object.assign(new MetaMarco(), {id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd', contratoId,
  entregavelId, tipo: 'DESCRITIVA' as const, pesoCentesimos:10000, estado:'CONCLUIDA',provasExigidas:0,quantidadePrevista:null,unidadeMedida:null, arquivadoEm:null});
const vinculo = Object.assign(new VinculoMetaMarco(), {id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  contratoId, metaId:meta.id, ocorrenciaId, atividadeId:null, evidenciaEsperadaId:null, status:'APROVADO' as const});

function manager(ocorrenciaStatus: string | null, comMetas = true, extras: Partial<Ocorrencia> = {}) {
  const find = jest.fn(async (entidade: unknown) => entidade === MetaMarco ? (comMetas ? [meta] : []) : entidade === VinculoMetaMarco ? [vinculo] : []);
  const findOneBy = jest.fn(async (entidade: unknown, where: {contratoId:string;id:string}) => {
    if(entidade===Entregavel)return {id:entregavelId,contratoId};
    if (entidade !== Ocorrencia || !ocorrenciaStatus) return null;
    if (where.contratoId !== contratoId || where.id !== ocorrenciaId) return null;
    return Object.assign(new Ocorrencia(), {id:ocorrenciaId,contratoId,entregavelId,status:ocorrenciaStatus,substituidaEm:null,modoRegistro:'DESCRITIVO',minimoAtividadesVerificadas:0,...extras});
  });
  return {find,findOneBy,query:jest.fn(async()=>[{total:'0',registrada:'0',verificada:'0',verificadas:'0',pendentes:'0',fotos:'0',relatorios:'0'}])};
}

describe('Meta do Marco — vínculos verificados não alteram registros reais', () => {
  it('não libera conclusão física por falta de metas cadastradas', async () => {
    expect((await avaliarMetasMarco(manager('CONCLUIDO',false) as never,contratoId,entregavelId)).apto).toBe(false);
  });
  it('vínculo aprovado e ocorrência concluída permitem solicitação', async () => {
    const resultado=await avaliarMetasMarco(manager('CONCLUIDO') as never,contratoId,entregavelId);
    expect(resultado).toMatchObject({total:1,concluidas:1,apto:true});
  });
  it('reabertura da ocorrência revoga sua contribuição mesmo que vínculo continue aprovado', async () => {
    const resultado=await avaliarMetasMarco(manager('EM_REVISAO') as never,contratoId,entregavelId);
    expect(resultado).toMatchObject({total:1,concluidas:0,apto:false});
  });
  it('ocorrência ausente não deve liberar meta', async () => {
    expect((await avaliarMetasMarco(manager(null) as never,contratoId,entregavelId)).apto).toBe(false);
  });
});

it('B10: conclusão parcial documental pode sustentar meta fisicamente válida', async () => {
  expect(await avaliarMetasMarco(manager('CONCLUIDO_PARCIALMENTE') as never,contratoId,entregavelId)).toMatchObject({fisicoApto:true,apto:false});
});
it('B10: status concluído não basta se a medição de origem foi invalidada', async () => {
  const m=manager('CONCLUIDO',true,{modoRegistro:'QUANTITATIVO',metaQuantidade:'10.000',quantidadeAprovada:'10.000'});
  expect((await avaliarMetasMarco(m as never,contratoId,entregavelId)).apto).toBe(false);
});

it('não reconhece ocorrência legada vinculada a outro entregável', async () => {
  const resultado=await avaliarMetasMarco(manager('CONCLUIDO',true,{entregavelId:'outro-entregavel'}) as never,contratoId,entregavelId);
  expect(resultado.fisicoApto).toBe(false);
  expect(resultado.metas[0].vinculos[0]).toMatchObject({estadoRegistro:'FORA_DO_MARCO',elegivel:false,desvinculavel:true});
});
